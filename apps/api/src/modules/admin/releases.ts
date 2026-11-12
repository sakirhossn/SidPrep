import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import {
  CreateAppReleaseSchema,
  UpdateAppReleaseSchema,
  RegisterPushTokenSchema,
  compareSemver,
  type AppReleaseRecord,
  type ReleaseDeliverySummary,
  type ReleasePlatform,
  type ReleaseChannel,
  type ReleaseStatus,
} from '@sidprep/contracts';
import { db } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { verifyJwt } from '../../lib/security.js';
import { executeReleaseNotificationJob, processPushRetriesAndReceipts } from '../../services/pushNotifications.js';

export { compareSemver };

const memoryReleases = new Map<string, AppReleaseRecord>();

function mapReleaseRow(row: any, summary?: ReleaseDeliverySummary): AppReleaseRecord {
  const status: ReleaseStatus =
    row.status || (row.isPublished || row.is_published ? 'PUBLISHED' : 'DRAFT');
  return {
    id: row.id,
    version: row.version,
    buildNumber: Number(row.buildNumber ?? row.build_number),
    minSupportedVersion: row.minSupportedVersion ?? row.min_supported_version ?? '2.0.0',
    platform: (row.platform || 'ANDROID') as ReleasePlatform,
    releaseChannel: (row.releaseChannel ?? row.release_channel ?? 'PRODUCTION') as ReleaseChannel,
    releaseNotes: row.releaseNotes ?? row.release_notes ?? '',
    downloadUrl: row.downloadUrl ?? row.download_url,
    status,
    isPublished: status === 'PUBLISHED',
    isMandatory: Boolean(row.isMandatory ?? row.is_mandatory),
    rolloutPercentage: Number(row.rolloutPercentage ?? row.rollout_percentage ?? 100),
    otaCompatible: Boolean(row.otaCompatible ?? row.ota_compatible),
    requiresNativeBinary:
      row.requiresNativeBinary !== undefined
        ? Boolean(row.requiresNativeBinary)
        : row.requires_native_binary !== undefined
        ? Boolean(row.requires_native_binary)
        : true,
    createdBy: row.createdBy ?? row.created_by ?? undefined,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : undefined,
    withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt).toISOString() : undefined,
    withdrawnReason: row.withdrawnReason ?? row.withdrawn_reason ?? undefined,
    notificationEnqueuedAt: row.notificationEnqueuedAt
      ? new Date(row.notificationEnqueuedAt).toISOString()
      : undefined,
    notificationJobId: row.notificationJobId ?? row.notification_job_id ?? undefined,
    deliverySummary: summary,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
  };
}

async function getDeliverySummary(releaseId: string): Promise<ReleaseDeliverySummary> {
  const res = await query<any>(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending,
       COUNT(*) FILTER (WHERE status = 'ACCEPTED_BY_PROVIDER')::int as accepted,
       COUNT(*) FILTER (WHERE status = 'DELIVERED')::int as delivered,
       COUNT(*) FILTER (WHERE status = 'FAILED_RETRYABLE')::int as retryable,
       COUNT(*) FILTER (WHERE status = 'FAILED_PERMANENT')::int as failed_perm,
       COUNT(*) FILTER (WHERE status = 'SKIPPED_WITHDRAWN')::int as skipped_withdrawn,
       COUNT(*) FILTER (WHERE tapped_at IS NOT NULL)::int as tapped
     FROM release_notification_deliveries
     WHERE release_id = $1`,
    [releaseId]
  );
  const r = res.rows[0] || {};
  return {
    totalTargeted: Number(r.total) || 0,
    pendingCount: Number(r.pending) || 0,
    acceptedCount: Number(r.accepted) || 0,
    deliveredCount: Number(r.delivered) || 0,
    failedRetryableCount: Number(r.retryable) || 0,
    failedPermanentCount: Number(r.failed_perm) || 0,
    skippedWithdrawnCount: Number(r.skipped_withdrawn) || 0,
    tappedCount: Number(r.tapped) || 0,
  };
}

/**
 * Atomically marks a release as notified and enqueues a durable notification job once per release.
 * Editing an existing release will NOT re-trigger notification_enqueued_at.
 */
async function enqueueReleaseNotificationOnce(releaseId: string): Promise<string | null> {
  const jobId = `job_rel_notif_${releaseId}`;
  const markRes = await query<{ id: string }>(
    `UPDATE app_releases
     SET notification_enqueued_at = NOW(),
         notification_job_id = $2,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'PUBLISHED'
       AND notification_enqueued_at IS NULL
     RETURNING id`,
    [releaseId, jobId]
  );

  if ((markRes.rowCount || 0) === 0) {
    return null;
  }

  await db.jobs.enqueue({
    id: jobId,
    jobType: 'RELEASE_NOTIFICATION',
    payload: { releaseId },
    status: 'QUEUED',
    scheduledFor: new Date().toISOString(),
    retryCount: 0,
  });

  // Kick off background dispatch asynchronously in non-test environments using atomic claim
  if (process.env.NODE_ENV !== 'test') {
    setImmediate(() => {
      void query(
        `UPDATE jobs SET status = 'RUNNING', started_at = NOW() WHERE id = $1 AND status = 'QUEUED' RETURNING id`,
        [jobId]
      )
        .then((claim) => {
          if ((claim.rowCount || 0) > 0) {
            return executeReleaseNotificationJob(releaseId, jobId).then(() =>
              db.jobs.completeJob(jobId)
            );
          }
          return undefined;
        })
        .catch((err) => {
          console.warn('[Releases] Immediate release notification dispatch deferred to worker:', err?.message);
        });
    });
  }

  return jobId;
}

async function syncAppVersionFromLatestRelease(): Promise<void> {
  try {
    const res = await query<any>(
      `SELECT version, min_supported_version as "minSupportedVersion", download_url as "downloadUrl", release_notes as "releaseNotes"
       FROM app_releases
       WHERE platform = 'ANDROID' AND release_channel = 'PRODUCTION' AND status = 'PUBLISHED' AND is_published = true
       ORDER BY build_number DESC, created_at DESC
       LIMIT 1`
    );
    if (res.rows.length > 0) {
      const latest = res.rows[0];
      await db.setAppVersion({
        currentVersion: latest.version,
        minVersion: latest.minSupportedVersion,
        apkUrl: latest.downloadUrl,
        releaseNotes: latest.releaseNotes || db.appVersion.releaseNotes,
      });
    }
  } catch (err: any) {
    console.warn('[Releases] Could not sync app_version setting:', err.message);
  }
}

export const releaseRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/releases
   * List all mobile & client releases with delivery telemetry summaries
   */
  fastify.get(
    '/admin/releases',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const { platform, channel, status } = request.query as {
        platform?: string;
        channel?: string;
        status?: string;
      };

      try {
        const where: string[] = [];
        const params: any[] = [];
        if (platform) {
          params.push(platform.toUpperCase());
          where.push(`platform = $${params.length}`);
        }
        if (channel) {
          params.push(channel.toUpperCase());
          where.push(`release_channel = $${params.length}`);
        }
        if (status) {
          params.push(status.toUpperCase());
          where.push(`status = $${params.length}`);
        }

        const sql = `
          SELECT id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                 platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                 download_url as "downloadUrl", status, is_published as "isPublished",
                 is_mandatory as "isMandatory", rollout_percentage as "rolloutPercentage",
                 ota_compatible as "otaCompatible", requires_native_binary as "requiresNativeBinary",
                 created_by as "createdBy", published_at as "publishedAt",
                 withdrawn_at as "withdrawnAt", withdrawn_reason as "withdrawnReason",
                 notification_enqueued_at as "notificationEnqueuedAt", notification_job_id as "notificationJobId",
                 created_at as "createdAt", updated_at as "updatedAt"
          FROM app_releases
          ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY build_number DESC, created_at DESC
        `;

        const res = await query<any>(sql, params);
        const releases = await Promise.all(
          res.rows.map(async (row) => {
            const summary = await getDeliverySummary(row.id);
            return mapReleaseRow(row, summary);
          })
        );
        return reply.send({ success: true, releases });
      } catch (err: any) {
        console.warn('[Releases] DB query fallback to memory:', err.message);
      }

      let rels = Array.from(memoryReleases.values());
      if (platform) rels = rels.filter((r) => r.platform === platform.toUpperCase());
      if (channel) rels = rels.filter((r) => r.releaseChannel === channel.toUpperCase());
      if (status) rels = rels.filter((r) => r.status === status.toUpperCase());
      rels.sort((a, b) => b.buildNumber - a.buildNumber);

      return reply.send({ success: true, releases: rels });
    }
  );

  /**
   * POST /admin/releases
   * Create a new app release (SUPER_ADMIN only).
   * If published immediately, saves release first and then enqueues durable notification job.
   */
  fastify.post(
    '/admin/releases',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const parsed = CreateAppReleaseSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_RELEASE_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid release payload.',
          },
        });
      }

      const data = parsed.data;
      const releaseId = `rel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const now = new Date().toISOString();
      const status: ReleaseStatus =
        data.status || (data.isPublished ? 'PUBLISHED' : 'DRAFT');
      const isPublished = status === 'PUBLISHED';
      const publishedAt = isPublished ? now : undefined;
      const withdrawnAt = status === 'WITHDRAWN' ? now : undefined;

      // Step 1: Persist release first
      const insertRes = await query<any>(
        `INSERT INTO app_releases
         (id, version, build_number, min_supported_version, platform, release_channel, release_notes,
          download_url, is_published, status, is_mandatory, rollout_percentage, ota_compatible,
          requires_native_binary, created_by, published_at, withdrawn_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
         RETURNING id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                   platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                   download_url as "downloadUrl", status, is_published as "isPublished",
                   is_mandatory as "isMandatory", rollout_percentage as "rolloutPercentage",
                   ota_compatible as "otaCompatible", requires_native_binary as "requiresNativeBinary",
                   created_by as "createdBy", published_at as "publishedAt",
                   withdrawn_at as "withdrawnAt", notification_enqueued_at as "notificationEnqueuedAt",
                   notification_job_id as "notificationJobId", created_at as "createdAt", updated_at as "updatedAt"`,
        [
          releaseId,
          data.version,
          data.buildNumber,
          data.minSupportedVersion,
          data.platform,
          data.releaseChannel,
          data.releaseNotes || '',
          data.downloadUrl,
          isPublished,
          status,
          data.isMandatory,
          data.rolloutPercentage,
          data.otaCompatible,
          data.requiresNativeBinary,
          admin.id,
          publishedAt || null,
          withdrawnAt || null,
        ]
      );

      let jobId: string | null = null;
      // Step 2: Enqueue durable notification job ONLY after release persisted and status is PUBLISHED
      if (isPublished) {
        jobId = await enqueueReleaseNotificationOnce(releaseId);
        if (data.platform === 'ANDROID' && data.releaseChannel === 'PRODUCTION') {
          await syncAppVersionFromLatestRelease();
        }
      }

      const row = insertRes.rows[0];
      if (jobId) {
        row.notificationJobId = jobId;
        row.notificationEnqueuedAt = new Date().toISOString();
      }
      const record = mapReleaseRow(row);
      memoryReleases.set(releaseId, record);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'RELEASE_MANAGEMENT',
        action: 'CREATE_APP_RELEASE',
        targetId: releaseId,
        changesDiff: {
          version: data.version,
          buildNumber: data.buildNumber,
          platform: data.platform,
          releaseChannel: data.releaseChannel,
          status,
          isMandatory: data.isMandatory,
          notificationJobId: jobId,
        },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        release: record,
        notificationJobId: jobId,
      });
    }
  );

  /**
   * PUT /admin/releases/:id
   * Edit an existing release's metadata without re-notifying all installations.
   */
  fastify.put(
    '/admin/releases/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const parsed = UpdateAppReleaseSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_RELEASE_PAYLOAD',
            message: parsed.error.issues[0]?.message || 'Invalid release update payload.',
          },
        });
      }

      const existingRes = await query<any>(`SELECT * FROM app_releases WHERE id = $1`, [id]);
      if (existingRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'RELEASE_NOT_FOUND', message: 'Release not found' },
        });
      }

      const cur = existingRes.rows[0];
      const u = parsed.data;
      const updateRes = await query<any>(
        `UPDATE app_releases
         SET version = $2,
             build_number = $3,
             min_supported_version = $4,
             platform = $5,
             release_channel = $6,
             release_notes = $7,
             download_url = $8,
             is_mandatory = $9,
             rollout_percentage = $10,
             ota_compatible = $11,
             requires_native_binary = $12,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                   platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                   download_url as "downloadUrl", status, is_published as "isPublished",
                   is_mandatory as "isMandatory", rollout_percentage as "rolloutPercentage",
                   ota_compatible as "otaCompatible", requires_native_binary as "requiresNativeBinary",
                   created_by as "createdBy", published_at as "publishedAt",
                   withdrawn_at as "withdrawnAt", withdrawn_reason as "withdrawnReason",
                   notification_enqueued_at as "notificationEnqueuedAt", notification_job_id as "notificationJobId",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          id,
          u.version ?? cur.version,
          u.buildNumber ?? cur.build_number,
          u.minSupportedVersion ?? cur.min_supported_version,
          u.platform ?? cur.platform,
          u.releaseChannel ?? cur.release_channel,
          u.releaseNotes ?? cur.release_notes ?? '',
          u.downloadUrl ?? cur.download_url,
          u.isMandatory ?? cur.is_mandatory ?? false,
          u.rolloutPercentage ?? cur.rollout_percentage ?? 100,
          u.otaCompatible ?? cur.ota_compatible ?? false,
          u.requiresNativeBinary ?? cur.requires_native_binary ?? true,
        ]
      );

      const updated = mapReleaseRow(updateRes.rows[0]);
      memoryReleases.set(id, updated);

      if (updated.status === 'PUBLISHED' && updated.platform === 'ANDROID' && updated.releaseChannel === 'PRODUCTION') {
        await syncAppVersionFromLatestRelease();
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'RELEASE_MANAGEMENT',
        action: 'EDIT_APP_RELEASE',
        targetId: id,
        changesDiff: u,
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        release: updated,
        reNotified: false,
      });
    }
  );

  /**
   * PATCH /admin/releases/:id/publish
   * Transition release between DRAFT, PUBLISHED, and WITHDRAWN.
   * Publishing saves first, then enqueues durable notification job once.
   */
  fastify.patch(
    '/admin/releases/:id/publish',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as {
        status?: ReleaseStatus;
        isPublished?: boolean;
        rolloutPercentage?: number;
        withdrawnReason?: string;
      };

      const existingRes = await query<any>(`SELECT * FROM app_releases WHERE id = $1`, [id]);
      if (existingRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'RELEASE_NOT_FOUND', message: 'Release not found' },
        });
      }
      const cur = existingRes.rows[0];

      let nextStatus: ReleaseStatus;
      if (body.status && ['DRAFT', 'PUBLISHED', 'WITHDRAWN'].includes(body.status)) {
        nextStatus = body.status;
      } else if (body.isPublished !== undefined) {
        nextStatus = body.isPublished ? 'PUBLISHED' : 'WITHDRAWN';
      } else {
        nextStatus = 'PUBLISHED';
      }

      const isPublished = nextStatus === 'PUBLISHED';
      const rolloutPercentage =
        typeof body.rolloutPercentage === 'number'
          ? Math.max(0, Math.min(100, body.rolloutPercentage))
          : Number(cur.rollout_percentage ?? 100);

      // Step 1: Update release state first
      const res = await query<any>(
        `UPDATE app_releases
         SET status = $2::varchar,
             is_published = $3::boolean,
             rollout_percentage = $4::int,
             published_at = CASE WHEN $2::varchar = 'PUBLISHED' THEN COALESCE(published_at, NOW()) ELSE published_at END,
             withdrawn_at = CASE WHEN $2::varchar = 'WITHDRAWN' THEN NOW() ELSE NULL END,
             withdrawn_reason = CASE WHEN $2::varchar = 'WITHDRAWN' THEN $5::text ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                   platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                   download_url as "downloadUrl", status, is_published as "isPublished",
                   is_mandatory as "isMandatory", rollout_percentage as "rolloutPercentage",
                   ota_compatible as "otaCompatible", requires_native_binary as "requiresNativeBinary",
                   created_by as "createdBy", published_at as "publishedAt",
                   withdrawn_at as "withdrawnAt", withdrawn_reason as "withdrawnReason",
                   notification_enqueued_at as "notificationEnqueuedAt", notification_job_id as "notificationJobId",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [id, nextStatus, isPublished, rolloutPercentage, body.withdrawnReason || null]
      );

      let notificationJobId: string | null = null;
      if (nextStatus === 'PUBLISHED') {
        notificationJobId = await enqueueReleaseNotificationOnce(id);
      } else if (nextStatus === 'WITHDRAWN' || nextStatus === 'DRAFT') {
        const existingJobId = cur.notification_job_id || `job_rel_notif_${id}`;
        await db.jobs.cancelQueuedJob(existingJobId, `RELEASE_${nextStatus}`);
        await query(
          `UPDATE release_notification_deliveries
           SET status = 'SKIPPED_WITHDRAWN', updated_at = NOW()
           WHERE release_id = $1 AND status IN ('PENDING', 'FAILED_RETRYABLE')`,
          [id]
        );
      }

      if (cur.platform === 'ANDROID' && cur.release_channel === 'PRODUCTION') {
        await syncAppVersionFromLatestRelease();
      }

      const row = res.rows[0];
      if (notificationJobId) {
        row.notificationJobId = notificationJobId;
        row.notificationEnqueuedAt = new Date().toISOString();
      }
      const updated = mapReleaseRow(row);
      memoryReleases.set(id, updated);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'RELEASE_MANAGEMENT',
        action:
          nextStatus === 'PUBLISHED'
            ? 'PUBLISH_APP_RELEASE'
            : nextStatus === 'WITHDRAWN'
            ? 'WITHDRAW_APP_RELEASE'
            : 'SET_RELEASE_DRAFT',
        targetId: id,
        changesDiff: { status: nextStatus, rolloutPercentage, notificationJobId },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        release: updated,
        notificationJobId,
      });
    }
  );

  /**
   * GET /admin/releases/:id/deliveries
   * Delivery monitoring breakdown & recent device delivery telemetry
   */
  fastify.get(
    '/admin/releases/:id/deliveries',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const relRes = await query<any>(
        `SELECT id, version, build_number as "buildNumber", platform, release_channel as "releaseChannel", status
         FROM app_releases WHERE id = $1`,
        [id]
      );
      if (relRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'RELEASE_NOT_FOUND', message: 'Release not found' },
        });
      }

      const summary = await getDeliverySummary(id);
      const deliveriesRes = await query<any>(
        `SELECT d.id, d.installation_id as "installationId", i.device_id as "deviceId",
                i.student_id as "studentId", i.app_version as "installedVersion",
                i.build_number as "installedBuild", i.token_valid as "tokenValid",
                i.invalid_reason as "invalidReason",
                d.status, d.attempt_count as "attemptCount", d.max_attempts as "maxAttempts",
                d.provider_ticket_id as "providerTicketId", d.provider_receipt_status as "providerReceiptStatus",
                d.error_code as "errorCode", d.error_message as "errorMessage",
                d.accepted_at as "acceptedAt", d.delivered_at as "deliveredAt", d.tapped_at as "tappedAt",
                d.next_retry_at as "nextRetryAt", d.updated_at as "updatedAt"
         FROM release_notification_deliveries d
         JOIN device_installations i ON i.id = d.installation_id
         WHERE d.release_id = $1
         ORDER BY d.updated_at DESC
         LIMIT 100`,
        [id]
      );

      return reply.send({
        success: true,
        release: relRes.rows[0],
        summary,
        deliveries: deliveriesRes.rows,
      });
    }
  );

  /**
   * POST /admin/releases/:id/process-notifications
   * Admin manual trigger to flush pending retries / check receipts immediately
   */
  fastify.post(
    '/admin/releases/:id/process-notifications',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const dispatch = await executeReleaseNotificationJob(id);
      const receipts = await processPushRetriesAndReceipts();
      return reply.send({
        success: true,
        dispatch,
        receipts,
      });
    }
  );

  /**
   * POST /devices/push-token
   * Registers or refreshes an installation's notification token & version metadata.
   * Associates with student/device session if an authenticated student JWT is provided.
   */
  fastify.post('/devices/push-token', async (request, reply) => {
    const parsed = RegisterPushTokenSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_DEVICE_PAYLOAD',
          message: parsed.error.issues[0]?.message || 'Invalid device registration payload.',
        },
      });
    }

    const d = parsed.data;
    let studentId: string | null = null;
    let sessionId: string | null = d.sessionId || null;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const claims = verifyJwt<{ sub?: string; type?: string; role?: string; sid?: string }>(
          authHeader.slice(7).trim(),
          { audience: 'sidprep:student_api' }
        );
        if (claims?.sub && (!claims.type || claims.type === 'student' || claims.role === 'STUDENT')) {
          studentId = claims.sub;
          if (!sessionId && claims.sid) {
            sessionId = String(claims.sid);
          }
        }
      } catch {
        // Optional auth: allow unauthenticated/expired-token installation registration without blocking
      }
    }

    const normalizedToken = d.pushToken?.trim() || null;

    // If this physical push token already existed under another device_id, detach it from old record
    if (normalizedToken) {
      await query(
        `UPDATE device_installations
         SET push_token = NULL, updated_at = NOW()
         WHERE push_token = $1 AND device_id != $2`,
        [normalizedToken, d.deviceId]
      );
    }

    const installId = `inst_${crypto.createHash('sha256').update(`${d.platform}:${d.deviceId}`).digest('hex').slice(0, 24)}`;

    const res = await query<any>(
      `INSERT INTO device_installations (
         id, device_id, student_id, session_id, platform, release_channel, app_version,
         build_number, push_token, token_provider, permission_status, token_valid,
         last_seen_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW(), NOW())
       ON CONFLICT (device_id, platform) DO UPDATE SET
         student_id = COALESCE($3, device_installations.student_id),
         session_id = COALESCE($4, device_installations.session_id),
         release_channel = $6,
         app_version = $7,
         build_number = $8,
         push_token = CASE WHEN $9 IS NOT NULL THEN $9 ELSE device_installations.push_token END,
         token_provider = $10,
         permission_status = $11,
         token_valid = CASE WHEN $9 IS NOT NULL AND $9 IS DISTINCT FROM device_installations.push_token THEN true ELSE device_installations.token_valid END,
         invalidated_at = CASE WHEN $9 IS NOT NULL AND $9 IS DISTINCT FROM device_installations.push_token THEN NULL ELSE device_installations.invalidated_at END,
         invalid_reason = CASE WHEN $9 IS NOT NULL AND $9 IS DISTINCT FROM device_installations.push_token THEN NULL ELSE device_installations.invalid_reason END,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING id, device_id as "deviceId", student_id as "studentId", platform, release_channel as "releaseChannel",
                 app_version as "appVersion", build_number as "buildNumber", permission_status as "permissionStatus",
                 token_valid as "tokenValid", last_seen_at as "lastSeenAt"`,
      [
        installId,
        d.deviceId,
        studentId,
        sessionId,
        d.platform,
        d.releaseChannel,
        d.appVersion,
        d.buildNumber,
        normalizedToken,
        d.tokenProvider,
        d.permissionStatus,
      ]
    );

    return reply.send({
      success: true,
      installation: res.rows[0],
    });
  });

  /**
   * POST /devices/push-token/unregister
   * Detaches student session when signing out or optionally disables token
   */
  fastify.post('/devices/push-token/unregister', async (request, reply) => {
    const body = (request.body || {}) as { deviceId?: string; platform?: string; invalidateToken?: boolean };
    if (!body.deviceId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'DEVICE_ID_REQUIRED', message: 'deviceId is required' },
      });
    }

    const platform = body.platform ? body.platform.toUpperCase() : 'ANDROID';
    await query(
      `UPDATE device_installations
       SET student_id = NULL,
           session_id = NULL,
           token_valid = CASE WHEN $3 = true THEN false ELSE token_valid END,
           invalidated_at = CASE WHEN $3 = true THEN NOW() ELSE invalidated_at END,
           invalid_reason = CASE WHEN $3 = true THEN 'USER_UNREGISTERED' ELSE invalid_reason END,
           updated_at = NOW()
       WHERE device_id = $1 AND platform = $2`,
      [body.deviceId, platform, Boolean(body.invalidateToken)]
    );

    return reply.send({ success: true });
  });

  /**
   * GET /app/updates/check
   * Public client update discovery endpoint — stays usable even on old installed app versions.
   * Filters by platform & release_channel and strictly requires status = 'PUBLISHED'.
   */
  fastify.get('/app/updates/check', async (request, reply) => {
    const {
      platform = 'ANDROID',
      channel = 'PRODUCTION',
      version = '1.0.0',
      build = '0',
      releaseId,
    } = request.query as {
      platform?: string;
      channel?: string;
      version?: string;
      build?: string;
      releaseId?: string;
    };

    const targetPlatform = platform.toUpperCase();
    const targetChannel = channel.toUpperCase();
    const currentBuild = parseInt(build, 10) || 0;
    const currentVersion = version.trim();

    let requestedReleaseWithdrawn = false;
    if (releaseId) {
      try {
        const reqRel = await query<{ status: string; is_published: boolean }>(
          `SELECT status, is_published FROM app_releases WHERE id = $1`,
          [releaseId]
        );
        if (
          reqRel.rows.length === 0 ||
          reqRel.rows[0].status !== 'PUBLISHED' ||
          !reqRel.rows[0].is_published
        ) {
          requestedReleaseWithdrawn = true;
        }
      } catch {}
    }

    let latest: any = null;
    try {
      const res = await query<any>(
        `SELECT id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                download_url as "downloadUrl", status, is_published as "isPublished",
                is_mandatory as "isMandatory", ota_compatible as "otaCompatible",
                requires_native_binary as "requiresNativeBinary", published_at as "publishedAt"
         FROM app_releases
         WHERE status = 'PUBLISHED' AND is_published = true AND platform = $1 AND release_channel = $2
         ORDER BY build_number DESC, created_at DESC
         LIMIT 1`,
        [targetPlatform, targetChannel]
      );
      if (res.rows.length > 0) {
        latest = res.rows[0];
      }
    } catch {}

    if (!latest) {
      return reply.send({
        updateAvailable: false,
        isMandatory: false,
        belowMinSupported: false,
        requestedReleaseWithdrawn,
        message: requestedReleaseWithdrawn
          ? 'This release was withdrawn and is no longer available.'
          : 'No published releases available for this platform and channel.',
      });
    }

    const isNewer =
      Number(latest.buildNumber) > currentBuild ||
      compareSemver(latest.version, currentVersion) > 0;
    const belowMinSupported = compareSemver(currentVersion, latest.minSupportedVersion) < 0;
    const isMandatory = isNewer && (Boolean(latest.isMandatory) || belowMinSupported);

    return reply.send({
      updateAvailable: isNewer,
      isMandatory,
      belowMinSupported,
      requestedReleaseWithdrawn,
      latestRelease: {
        id: latest.id,
        version: latest.version,
        buildNumber: Number(latest.buildNumber),
        platform: latest.platform,
        releaseChannel: latest.releaseChannel,
        downloadUrl: latest.downloadUrl,
        releaseNotes: latest.releaseNotes,
        minSupportedVersion: latest.minSupportedVersion,
        isMandatory: Boolean(latest.isMandatory),
        otaCompatible: Boolean(latest.otaCompatible),
        requiresNativeBinary:
          latest.requiresNativeBinary !== undefined ? Boolean(latest.requiresNativeBinary) : true,
        publishedAt: latest.publishedAt ? new Date(latest.publishedAt).toISOString() : undefined,
      },
    });
  });

  /**
   * POST /app/updates/tap
   * Records user notification tap telemetry for delivery monitoring
   */
  fastify.post('/app/updates/tap', async (request, reply) => {
    const body = (request.body || {}) as { releaseId?: string; deviceId?: string; platform?: string };
    if (body.releaseId && body.deviceId) {
      const platform = (body.platform || 'ANDROID').toUpperCase();
      try {
        await query(
          `UPDATE release_notification_deliveries d
           SET tapped_at = COALESCE(d.tapped_at, NOW()),
               delivered_at = COALESCE(d.delivered_at, NOW()),
               status = CASE WHEN d.status IN ('ACCEPTED_BY_PROVIDER', 'PENDING') THEN 'DELIVERED' ELSE d.status END,
               updated_at = NOW()
           FROM device_installations i
           WHERE d.installation_id = i.id
             AND d.release_id = $1
             AND i.device_id = $2
             AND i.platform = $3`,
          [body.releaseId, body.deviceId, platform]
        );
      } catch {}
    }
    return reply.send({ success: true });
  });
};
