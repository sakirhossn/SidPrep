import crypto from 'node:crypto';
import { compareSemver } from '@sidprep/contracts';
import { query } from '../db/pool.js';
import { db } from '../db/index.js';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  channelId?: string;
  data?: Record<string, any>;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

export interface PushProviderTransport {
  sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

const PERMANENT_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
  'InvalidPushToken',
]);

class ExpoHttpPushTransport implements PushProviderTransport {
  public async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err: any = new Error(`Expo Push API HTTP ${response.status}: ${text.slice(0, 200)}`);
      err.retryable = response.status >= 500 || response.status === 429;
      throw err;
    }

    const json = (await response.json()) as { data?: ExpoPushTicket[] };
    return Array.isArray(json.data) ? json.data : [];
  }

  public async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!response.ok) {
      return {};
    }

    const json = (await response.json()) as { data?: Record<string, ExpoPushReceipt> };
    return json.data || {};
  }
}

let activeTransport: PushProviderTransport = new ExpoHttpPushTransport();

export function setPushTransport(transport?: PushProviderTransport): void {
  activeTransport = transport || new ExpoHttpPushTransport();
}

export async function invalidateDeviceToken(installationId: string, reason: string): Promise<void> {
  await query(
    `UPDATE device_installations
     SET token_valid = false,
         invalidated_at = NOW(),
         invalid_reason = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [installationId, reason]
  );
}

export interface DispatchReleaseResult {
  releaseId: string;
  skippedReason?: string;
  targetedCount: number;
  acceptedCount: number;
  failedRetryableCount: number;
  failedPermanentCount: number;
}

/**
 * Enqueues and dispatches notifications for a published app release to matching older installations.
 */
export async function executeReleaseNotificationJob(
  releaseId: string,
  jobId?: string
): Promise<DispatchReleaseResult> {
  const relRes = await query<any>(
    `SELECT id, version, build_number as "buildNumber", min_supported_version as "minSupportedVersion",
            platform, release_channel as "releaseChannel", status, is_published as "isPublished"
     FROM app_releases
     WHERE id = $1`,
    [releaseId]
  );

  const release = relRes.rows[0];
  if (!release) {
    return {
      releaseId,
      skippedReason: 'RELEASE_NOT_FOUND',
      targetedCount: 0,
      acceptedCount: 0,
      failedRetryableCount: 0,
      failedPermanentCount: 0,
    };
  }

  if (release.status !== 'PUBLISHED' || !release.isPublished) {
    await query(
      `UPDATE release_notification_deliveries
       SET status = 'SKIPPED_WITHDRAWN', updated_at = NOW()
       WHERE release_id = $1 AND status IN ('PENDING', 'FAILED_RETRYABLE')`,
      [releaseId]
    );
    return {
      releaseId,
      skippedReason: `RELEASE_NOT_PUBLISHED_${release.status}`,
      targetedCount: 0,
      acceptedCount: 0,
      failedRetryableCount: 0,
      failedPermanentCount: 0,
    };
  }

  // Find candidate device installations on matching platform + channel with valid non-denied tokens
  const candidatesRes = await query<any>(
    `SELECT id, device_id as "deviceId", platform, release_channel as "releaseChannel",
            app_version as "appVersion", build_number as "buildNumber", push_token as "pushToken"
     FROM device_installations
     WHERE platform = $1
       AND release_channel = $2
       AND token_valid = true
       AND push_token IS NOT NULL
       AND permission_status != 'DENIED'`,
    [release.platform, release.releaseChannel]
  );

  // Target ONLY installations running an older version/build
  const eligible = candidatesRes.rows.filter((inst) => {
    const olderSemver = compareSemver(release.version, inst.appVersion) > 0;
    const olderBuild = Number(release.buildNumber) > Number(inst.buildNumber);
    return olderSemver || olderBuild;
  });

  // Insert delivery records idempotently (uq_release_notif_dedupe guarantees no duplicates)
  for (const inst of eligible) {
    const delId = `del_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await query(
      `INSERT INTO release_notification_deliveries (
         id, release_id, job_id, installation_id, push_token, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW())
       ON CONFLICT (release_id, installation_id) DO NOTHING`,
      [delId, releaseId, jobId || null, inst.id, inst.pushToken]
    );
  }

  const dispatchResult = await dispatchPendingDeliveriesForRelease(release);

  db.logOperational({
    service: 'PUSH_NOTIFICATIONS',
    level: 'INFO',
    message: `Processed release notification dispatch for ${release.version} (${release.platform}/${release.releaseChannel})`,
    meta: { ...dispatchResult },
  });

  return dispatchResult;
}

async function dispatchPendingDeliveriesForRelease(release: {
  id: string;
  version: string;
  buildNumber: number;
  platform: string;
  releaseChannel: string;
}): Promise<DispatchReleaseResult> {
  // Re-verify release status right before network dispatch
  const checkRes = await query<{ status: string; is_published: boolean }>(
    `SELECT status, is_published FROM app_releases WHERE id = $1`,
    [release.id]
  );
  if (checkRes.rows[0]?.status !== 'PUBLISHED' || !checkRes.rows[0]?.is_published) {
    await query(
      `UPDATE release_notification_deliveries
       SET status = 'SKIPPED_WITHDRAWN', updated_at = NOW()
       WHERE release_id = $1 AND status IN ('PENDING', 'FAILED_RETRYABLE')`,
      [release.id]
    );
    return {
      releaseId: release.id,
      skippedReason: 'RELEASE_WITHDRAWN_BEFORE_DISPATCH',
      targetedCount: 0,
      acceptedCount: 0,
      failedRetryableCount: 0,
      failedPermanentCount: 0,
    };
  }

  const pendingRes = await query<{
    id: string;
    installationId: string;
    pushToken: string;
    attemptCount: number;
    maxAttempts: number;
  }>(
    `SELECT d.id, d.installation_id as "installationId", d.push_token as "pushToken",
            d.attempt_count as "attemptCount", d.max_attempts as "maxAttempts"
     FROM release_notification_deliveries d
     JOIN device_installations i ON i.id = d.installation_id
     WHERE d.release_id = $1
       AND i.token_valid = true
       AND (
         d.status = 'PENDING'
         OR (d.status = 'FAILED_RETRYABLE' AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW()) AND d.attempt_count < d.max_attempts)
       )
     ORDER BY d.created_at ASC`,
    [release.id]
  );

  const pending = pendingRes.rows;
  if (pending.length === 0) {
    return {
      releaseId: release.id,
      targetedCount: 0,
      acceptedCount: 0,
      failedRetryableCount: 0,
      failedPermanentCount: 0,
    };
  }

  let acceptedCount = 0;
  let failedRetryableCount = 0;
  let failedPermanentCount = 0;

  // Send in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE);
    const messages: ExpoPushMessage[] = chunk.map((row) => ({
      to: row.pushToken,
      title: 'SidPrep update available',
      body: `Version ${release.version} is ready. Tap to see what’s new and update.`,
      sound: 'default',
      channelId: 'app-releases',
      data: {
        type: 'APP_RELEASE_UPDATE',
        releaseId: release.id,
        version: release.version,
        buildNumber: release.buildNumber,
        platform: release.platform,
        releaseChannel: release.releaseChannel,
        screen: '/update',
      },
    }));

    let tickets: ExpoPushTicket[];
    try {
      tickets = await activeTransport.sendBatch(messages);
    } catch (err: any) {
      // Network or HTTP-level failure: schedule retry with backoff
      for (const row of chunk) {
        const nextAttempt = row.attemptCount + 1;
        const exhausted = nextAttempt >= row.maxAttempts;
        const status = exhausted ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE';
        const delaySeconds = nextAttempt * 120; // 2m, 4m, 6m
        await query(
          `UPDATE release_notification_deliveries
           SET status = $2::varchar,
               attempt_count = $3::int,
               error_code = $4::varchar,
               error_message = $5::text,
               next_retry_at = CASE WHEN $2::varchar = 'FAILED_RETRYABLE' THEN NOW() + ($6::int * INTERVAL '1 second') ELSE NULL END,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, status, nextAttempt, 'PROVIDER_HTTP_ERROR', err?.message || 'Transport error', delaySeconds]
        );
        if (exhausted) failedPermanentCount++;
        else failedRetryableCount++;
      }
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const ticket = tickets[j];
      const nextAttempt = row.attemptCount + 1;

      if (!ticket) {
        const exhausted = nextAttempt >= row.maxAttempts;
        const status = exhausted ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE';
        await query(
          `UPDATE release_notification_deliveries
           SET status = $2::varchar, attempt_count = $3::int, error_code = 'MISSING_TICKET',
               next_retry_at = CASE WHEN $2::varchar = 'FAILED_RETRYABLE' THEN NOW() + INTERVAL '2 minutes' ELSE NULL END,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, status, nextAttempt]
        );
        if (exhausted) failedPermanentCount++;
        else failedRetryableCount++;
        continue;
      }

      if (ticket.status === 'ok') {
        await query(
          `UPDATE release_notification_deliveries
           SET status = 'ACCEPTED_BY_PROVIDER',
               attempt_count = $2,
               provider_ticket_id = $3,
               accepted_at = NOW(),
               error_code = NULL,
               error_message = NULL,
               next_retry_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, nextAttempt, ticket.id || null]
        );
        await query(
          `UPDATE device_installations SET last_notified_release_id = $2, updated_at = NOW() WHERE id = $1`,
          [row.installationId, release.id]
        );
        acceptedCount++;
      } else {
        const errCode = ticket.details?.error || 'PROVIDER_ERROR';
        const isPermanent = PERMANENT_TOKEN_ERRORS.has(errCode);
        const exhausted = isPermanent || nextAttempt >= row.maxAttempts;
        const status = exhausted ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE';
        const delaySeconds = nextAttempt * 120;

        await query(
          `UPDATE release_notification_deliveries
           SET status = $2::varchar,
               attempt_count = $3::int,
               error_code = $4::varchar,
               error_message = $5::text,
               next_retry_at = CASE WHEN $2::varchar = 'FAILED_RETRYABLE' THEN NOW() + ($6::int * INTERVAL '1 second') ELSE NULL END,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, status, nextAttempt, errCode, ticket.message || errCode, delaySeconds]
        );

        if (isPermanent) {
          await invalidateDeviceToken(row.installationId, errCode);
        }

        if (exhausted) failedPermanentCount++;
        else failedRetryableCount++;
      }
    }
  }

  return {
    releaseId: release.id,
    targetedCount: pending.length,
    acceptedCount,
    failedRetryableCount,
    failedPermanentCount,
  };
}

/**
 * Process due retries across all published releases and poll provider receipts for ACCEPTED deliveries.
 */
export async function processPushRetriesAndReceipts(): Promise<{
  retriedReleases: number;
  receiptsChecked: number;
  deliveredConfirmed: number;
  invalidatedTokens: number;
}> {
  let retriedReleases = 0;
  let receiptsChecked = 0;
  let deliveredConfirmed = 0;
  let invalidatedTokens = 0;

  // 1. Cancel retries on any withdrawn releases
  await query(
    `UPDATE release_notification_deliveries d
     SET status = 'SKIPPED_WITHDRAWN', updated_at = NOW()
     FROM app_releases r
     WHERE d.release_id = r.id
       AND (r.status != 'PUBLISHED' OR r.is_published = false)
       AND d.status IN ('PENDING', 'FAILED_RETRYABLE')`
  );

  // 2. Retry due deliveries on currently published releases
  const dueRelRes = await query<any>(
    `SELECT DISTINCT r.id, r.version, r.build_number as "buildNumber", r.platform, r.release_channel as "releaseChannel"
     FROM release_notification_deliveries d
     JOIN app_releases r ON r.id = d.release_id
     WHERE r.status = 'PUBLISHED' AND r.is_published = true
       AND d.status = 'FAILED_RETRYABLE'
       AND d.attempt_count < d.max_attempts
       AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())`
  );

  for (const rel of dueRelRes.rows) {
    await dispatchPendingDeliveriesForRelease(rel);
    retriedReleases++;
  }

  // 3. Check provider receipts for ACCEPTED_BY_PROVIDER tickets
  const acceptedRes = await query<{
    id: string;
    installationId: string;
    providerTicketId: string;
  }>(
    `SELECT id, installation_id as "installationId", provider_ticket_id as "providerTicketId"
     FROM release_notification_deliveries
     WHERE status = 'ACCEPTED_BY_PROVIDER'
       AND provider_ticket_id IS NOT NULL
     ORDER BY accepted_at ASC
     LIMIT 100`
  );

  if (acceptedRes.rows.length > 0) {
    const ticketIds = acceptedRes.rows.map((r) => r.providerTicketId);
    const receipts = await activeTransport.getReceipts(ticketIds);
    receiptsChecked = acceptedRes.rows.length;

    for (const row of acceptedRes.rows) {
      const receipt = receipts[row.providerTicketId];
      if (!receipt) {
        await query(
          `UPDATE release_notification_deliveries SET receipt_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        continue;
      }

      if (receipt.status === 'ok') {
        await query(
          `UPDATE release_notification_deliveries
           SET status = 'DELIVERED',
               provider_receipt_status = 'ok',
               receipt_checked_at = NOW(),
               delivered_at = COALESCE(delivered_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        deliveredConfirmed++;
      } else {
        const errCode = receipt.details?.error || 'RECEIPT_ERROR';
        await query(
          `UPDATE release_notification_deliveries
           SET status = 'FAILED_PERMANENT',
               provider_receipt_status = 'error',
               error_code = $2,
               error_message = $3,
               receipt_checked_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, errCode, receipt.message || errCode]
        );
        if (PERMANENT_TOKEN_ERRORS.has(errCode)) {
          await invalidateDeviceToken(row.installationId, errCode);
          invalidatedTokens++;
        }
      }
    }
  }

  return { retriedReleases, receiptsChecked, deliveredConfirmed, invalidatedTokens };
}
