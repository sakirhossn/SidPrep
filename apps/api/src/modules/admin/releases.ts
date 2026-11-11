import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';

export interface AppReleaseRecord {
  id: string;
  version: string;
  buildNumber: number;
  minSupportedVersion: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  releaseChannel: 'PRODUCTION' | 'BETA';
  releaseNotes?: string;
  downloadUrl: string;
  isPublished: boolean;
  rolloutPercentage: number;
  createdBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const memoryReleases = new Map<string, AppReleaseRecord>();

export function compareSemver(v1: string, v2: string): number {
  const parts1 = (v1 || '0').replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = (v2 || '0').replace(/^v/, '').split('.').map((p) => parseInt(p, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const a = parts1[i] ?? 0;
    const b = parts2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export const releaseRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/releases
   * List all mobile & client releases
   */
  fastify.get(
    '/admin/releases',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const { platform } = request.query as { platform?: string };

      try {
        let sql = `
          SELECT id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                 platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                 download_url as "downloadUrl", is_published as "isPublished", rollout_percentage as "rolloutPercentage",
                 created_by as "createdBy", published_at as "publishedAt", created_at as "createdAt", updated_at as "updatedAt"
          FROM app_releases
        `;
        const params: any[] = [];
        if (platform) {
          sql += ' WHERE platform = $1';
          params.push(platform.toUpperCase());
        }
        sql += ' ORDER BY build_number DESC, created_at DESC';

        const res = await query(sql, params);
        if (res.rows.length > 0) {
          return reply.send({ success: true, releases: res.rows });
        }
      } catch (err: any) {
        console.warn('[Releases] DB query fallback to memory:', err.message);
      }

      let rels = Array.from(memoryReleases.values());
      if (platform) {
        rels = rels.filter((r) => r.platform === platform.toUpperCase());
      }
      rels.sort((a, b) => b.buildNumber - a.buildNumber);

      return reply.send({ success: true, releases: rels });
    }
  );

  /**
   * POST /admin/releases
   * Create a new app release (SUPER_ADMIN only)
   */
  fastify.post(
    '/admin/releases',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = (request.body || {}) as Partial<AppReleaseRecord>;

      if (!body.version || !body.downloadUrl || body.buildNumber === undefined) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_RELEASE_PAYLOAD', message: 'version, buildNumber, and downloadUrl are required.' },
        });
      }

      const releaseId = `rel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const now = new Date().toISOString();
      const version = String(body.version).trim();
      const buildNumber = parseInt(String(body.buildNumber), 10);
      const minSupportedVersion = body.minSupportedVersion ? String(body.minSupportedVersion).trim() : '1.0.0';
      const platform = (body.platform?.toUpperCase() || 'ANDROID') as 'ANDROID' | 'IOS' | 'WEB';
      const releaseChannel = (body.releaseChannel?.toUpperCase() || 'PRODUCTION') as 'PRODUCTION' | 'BETA';
      const isPublished = Boolean(body.isPublished);
      const rolloutPercentage = typeof body.rolloutPercentage === 'number' ? Math.max(0, Math.min(100, body.rolloutPercentage)) : 100;
      const releaseNotes = body.releaseNotes || '';
      const publishedAt = isPublished ? now : undefined;

      const record: AppReleaseRecord = {
        id: releaseId,
        version,
        buildNumber,
        minSupportedVersion,
        platform,
        releaseChannel,
        releaseNotes,
        downloadUrl: body.downloadUrl.trim(),
        isPublished,
        rolloutPercentage,
        createdBy: admin.id,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      };

      memoryReleases.set(releaseId, record);

      try {
        await query(
          `INSERT INTO app_releases 
           (id, version, build_number, min_supported_version, platform, release_channel, release_notes, download_url, is_published, rollout_percentage, created_by, published_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
          [
            releaseId,
            version,
            buildNumber,
            minSupportedVersion,
            platform,
            releaseChannel,
            releaseNotes,
            record.downloadUrl,
            isPublished,
            rolloutPercentage,
            admin.id,
            publishedAt || null,
          ]
        );
      } catch (err: any) {
        console.warn('[Releases] DB insert fallback to memory:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'RELEASE_MANAGEMENT',
        action: 'CREATE_APP_RELEASE',
        targetId: releaseId,
        changesDiff: { version, buildNumber, platform, isPublished },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        release: record,
      });
    }
  );

  /**
   * PATCH /admin/releases/:id/publish
   * Toggle published state or update rollout percentage
   */
  fastify.patch(
    '/admin/releases/:id/publish',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { isPublished?: boolean; rolloutPercentage?: number };

      let rel = memoryReleases.get(id);
      let isPublished = body.isPublished !== undefined ? Boolean(body.isPublished) : rel?.isPublished ?? true;
      let rolloutPercentage = typeof body.rolloutPercentage === 'number' ? Math.max(0, Math.min(100, body.rolloutPercentage)) : rel?.rolloutPercentage ?? 100;
      const now = new Date().toISOString();

      if (rel) {
        rel.isPublished = isPublished;
        rel.rolloutPercentage = rolloutPercentage;
        rel.publishedAt = isPublished ? (rel.publishedAt || now) : undefined;
        rel.updatedAt = now;
      }

      try {
        const res = await query(
          `UPDATE app_releases 
           SET is_published = $2, rollout_percentage = $3, published_at = CASE WHEN $2 = true THEN COALESCE(published_at, NOW()) ELSE NULL END, updated_at = NOW()
           WHERE id = $1
           RETURNING id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion", platform, is_published as "isPublished"`,
          [id, isPublished, rolloutPercentage]
        );
        if (res.rowCount === 0 && !rel) {
          return reply.code(404).send({ success: false, error: { code: 'RELEASE_NOT_FOUND', message: 'Release not found' } });
        }
      } catch (err: any) {
        console.warn('[Releases] DB update fallback to memory:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'RELEASE_MANAGEMENT',
        action: isPublished ? 'PUBLISH_APP_RELEASE' : 'UNPUBLISH_APP_RELEASE',
        targetId: id,
        changesDiff: { isPublished, rolloutPercentage },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        release: rel || { id, isPublished, rolloutPercentage },
      });
    }
  );

  /**
   * GET /app/updates/check
   * Public client update discovery endpoint for mobile APK / in-app updates
   */
  fastify.get('/app/updates/check', async (request, reply) => {
    const { platform = 'ANDROID', version = '1.0.0', build = '0' } = request.query as {
      platform?: string;
      version?: string;
      build?: string;
    };

    const targetPlatform = platform.toUpperCase();
    const currentBuild = parseInt(build, 10) || 0;
    const currentVersion = version.trim();

    let latest: any = null;
    try {
      const res = await query(
        `SELECT id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
                platform, release_channel as "releaseChannel", release_notes as "releaseNotes",
                download_url as "downloadUrl", is_published as "isPublished", published_at as "publishedAt"
         FROM app_releases
         WHERE is_published = true AND platform = $1
         ORDER BY build_number DESC, created_at DESC
         LIMIT 1`,
        [targetPlatform]
      );
      if (res.rows.length > 0) {
        latest = res.rows[0];
      }
    } catch {}

    if (!latest) {
      const pubRels = Array.from(memoryReleases.values()).filter(
        (r) => r.isPublished && r.platform === targetPlatform
      );
      pubRels.sort((a, b) => b.buildNumber - a.buildNumber);
      if (pubRels.length > 0) {
        latest = pubRels[0];
      }
    }

    if (!latest) {
      return reply.send({
        updateAvailable: false,
        isMandatory: false,
        message: 'No published releases available for this platform.',
      });
    }

    const isNewer =
      latest.buildNumber > currentBuild || compareSemver(latest.version, currentVersion) > 0;
    const isMandatory =
      isNewer && compareSemver(currentVersion, latest.minSupportedVersion) < 0;

    return reply.send({
      updateAvailable: isNewer,
      isMandatory,
      latestRelease: {
        id: latest.id,
        version: latest.version,
        buildNumber: latest.buildNumber,
        downloadUrl: latest.downloadUrl,
        releaseNotes: latest.releaseNotes,
        minSupportedVersion: latest.minSupportedVersion,
        publishedAt: latest.publishedAt,
      },
    });
  });
};
