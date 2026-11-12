import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { signJwt } from '../lib/security.js';
import { closePool, query } from '../db/pool.js';
import { worker } from '../worker/index.js';
import {
  setPushTransport,
  executeReleaseNotificationJob,
  processPushRetriesAndReceipts,
  type ExpoPushMessage,
  type ExpoPushTicket,
  type ExpoPushReceipt,
} from '../services/pushNotifications.js';

describe('App Releases & Automatic Push Notification Suite', () => {
  let app: FastifyInstance;
  const ts = Date.now();
  const adminId = `adm_rel_test_${ts}`;
  const adminEmail = `admin.rel.${ts}@example.com`;
  let adminToken: string;

  const studentId = `stu_rel_test_${ts}`;
  let studentToken: string;

  const sentBatches: ExpoPushMessage[][] = [];

  before(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildServer();
    await app.ready();

    await db.adminUsers.set(adminId, {
      id: adminId,
      email: adminEmail,
      name: 'Release Manager Admin',
      passwordHash: 'dummy',
      totpSecret: 'dummy',
      is2faEnabled: false,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    await db.students.set(studentId, {
      id: studentId,
      email: `student.rel.${ts}@example.com`,
      firstName: 'Test',
      lastName: 'Student',
      role: 'STUDENT',
      status: 'ACTIVE',
      preferredLanguage: 'en',
      targetExams: ['exam_ssc_cgl'],
      isProfileComplete: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    } as any);

    adminToken = signJwt(
      {
        sub: adminId,
        email: adminEmail,
        name: 'Release Manager Admin',
        role: 'SUPER_ADMIN',
        type: 'admin_session',
        tokenVersion: 1,
      },
      '1h',
      { audience: 'sidprep:admin_api' }
    );

    studentToken = signJwt(
      {
        sub: studentId,
        email: `student.rel.${ts}@example.com`,
        role: 'STUDENT',
        type: 'student',
        sid: `sess_rel_${ts}`,
        tokenVersion: 1,
      },
      '1h',
      { audience: 'sidprep:student_api' }
    );
  });

  beforeEach(async () => {
    sentBatches.length = 0;
    setPushTransport(undefined);
    await query('DELETE FROM release_notification_deliveries');
    await query('DELETE FROM device_installations');
    await query("DELETE FROM jobs WHERE job_type IN ('RELEASE_NOTIFICATION', 'PUSH_RETRY_AND_RECEIPTS')");
    await query('DELETE FROM app_releases');
  });

  after(async () => {
    setPushTransport(undefined);
    await app.close();
    await closePool();
  });

  test('1. Rejects unapproved or non-HTTPS download URLs cleanly', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        version: '2.0.4',
        buildNumber: 204,
        minSupportedVersion: '2.0.0',
        releaseNotes: 'Test',
        downloadUrl: 'http://cdn.sidprep.in/app.apk',
        status: 'DRAFT',
      },
    });
    assert.equal(res1.statusCode, 400);

    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        version: '2.0.4',
        buildNumber: 204,
        minSupportedVersion: '2.0.0',
        releaseNotes: 'Test',
        downloadUrl: 'https://evil-unapproved-domain.example/sidprep.apk',
        status: 'DRAFT',
      },
    });
    assert.equal(res2.statusCode, 400);
  });

  test('2. Platform/channel/version targeting, exact notification copy, edit deduplication, and receipts', async () => {
    // Register installations:
    // A: Eligible older ANDROID PRODUCTION (student logged in)
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        deviceId: 'dev_eligible_old',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.1',
        buildNumber: 201,
        pushToken: 'ExponentPushToken[eligible_old_token]',
        permissionStatus: 'GRANTED',
      },
    });

    // B: Same platform/channel, ALREADY on 2.0.4 build 204 -> NOT eligible
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_already_current',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.4',
        buildNumber: 204,
        pushToken: 'ExponentPushToken[current_token]',
        permissionStatus: 'GRANTED',
      },
    });

    // C: ANDROID PRODUCTION older, but notification permission DENIED -> NOT eligible
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_denied_perm',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.1',
        buildNumber: 201,
        pushToken: null,
        permissionStatus: 'DENIED',
      },
    });

    // D: IOS PRODUCTION older -> NOT eligible for ANDROID release
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_ios_old',
        platform: 'IOS',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.1',
        buildNumber: 201,
        pushToken: 'ExponentPushToken[ios_token]',
        permissionStatus: 'GRANTED',
      },
    });

    // E: ANDROID BETA older -> NOT eligible for PRODUCTION release
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_beta_old',
        platform: 'ANDROID',
        releaseChannel: 'BETA',
        appVersion: '2.0.1',
        buildNumber: 201,
        pushToken: 'ExponentPushToken[beta_token]',
        permissionStatus: 'GRANTED',
      },
    });

    // Verify student session linked on dev_eligible_old
    const instRow = await query<any>(
      `SELECT student_id FROM device_installations WHERE device_id = 'dev_eligible_old'`
    );
    assert.equal(instRow.rows[0].student_id, studentId);

    // Mock transport returning ticket accepted (NOT yet confirmed delivered until receipt check)
    setPushTransport({
      async sendBatch(messages) {
        sentBatches.push(messages);
        return messages.map(() => ({ status: 'ok', id: 'ticket_abc_1' }) as ExpoPushTicket);
      },
      async getReceipts(ids) {
        const map: Record<string, ExpoPushReceipt> = {};
        for (const id of ids) {
          map[id] = { status: 'ok' };
        }
        return map;
      },
    });

    // Create & publish release 2.0.4 build 204
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        version: '2.0.4',
        buildNumber: 204,
        minSupportedVersion: '2.0.0',
        releaseNotes: 'Automatic update alerts and security fixes.',
        downloadUrl: 'https://github.com/sakirhossn/SidPrep/releases/download/v2.0.4/SidPrep-Student-v2.0.4.apk',
        isMandatory: false,
        status: 'PUBLISHED',
      },
    });
    assert.equal(createRes.statusCode, 201);
    const createdBody = JSON.parse(createRes.body);
    const relId = createdBody.release.id;
    assert.ok(createdBody.notificationJobId);

    // Worker processes durable job
    const processed = await worker.processNextJob();
    assert.equal(processed, true);

    assert.equal(sentBatches.length, 1);
    assert.equal(sentBatches[0].length, 1);
    assert.equal(sentBatches[0][0].to, 'ExponentPushToken[eligible_old_token]');
    assert.equal(sentBatches[0][0].title, 'SidPrep update available');
    assert.equal(
      sentBatches[0][0].body,
      'Version 2.0.4 is ready. Tap to see what’s new and update.'
    );
    assert.equal(sentBatches[0][0].data?.releaseId, relId);

    // Provider acceptance MUST be ACCEPTED_BY_PROVIDER (not yet DELIVERED)
    const delRes1 = await app.inject({
      method: 'GET',
      url: `/v1/admin/releases/${relId}/deliveries`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const delBody1 = JSON.parse(delRes1.body);
    assert.equal(delBody1.summary.acceptedCount, 1);
    assert.equal(delBody1.summary.deliveredCount, 0);

    // Edit release metadata -> MUST NOT re-notify or enqueue duplicate job
    const editRes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/releases/${relId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        releaseNotes: 'Updated release notes wording.',
      },
    });
    assert.equal(editRes.statusCode, 200);
    assert.equal(JSON.parse(editRes.body).reNotified, false);

    // Executing job again does NOT send a duplicate push
    await executeReleaseNotificationJob(relId, createdBody.notificationJobId);
    assert.equal(sentBatches.length, 1);

    // Poll push receipts -> transitions ACCEPTED_BY_PROVIDER -> DELIVERED
    const receiptRes = await processPushRetriesAndReceipts();
    assert.equal(receiptRes.receiptsChecked, 1);
    assert.equal(receiptRes.deliveredConfirmed, 1);

    const delRes2 = await app.inject({
      method: 'GET',
      url: `/v1/admin/releases/${relId}/deliveries`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const delBody2 = JSON.parse(delRes2.body);
    assert.equal(delBody2.summary.deliveredCount, 1);
  });

  test('3. Retries transient push failures and invalidates permanently unregistered tokens', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_transient',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.0',
        buildNumber: 200,
        pushToken: 'ExponentPushToken[transient_device]',
        permissionStatus: 'GRANTED',
      },
    });

    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_unregistered',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.0',
        buildNumber: 200,
        pushToken: 'ExponentPushToken[dead_device]',
        permissionStatus: 'GRANTED',
      },
    });

    let callIndex = 0;
    setPushTransport({
      async sendBatch(messages) {
        callIndex++;
        if (callIndex === 1) {
          // 1st attempt: transient error for transient_device, DeviceNotRegistered for dead_device
          return messages.map((m) =>
            m.to.includes('dead_device')
              ? { status: 'error', message: 'Not registered', details: { error: 'DeviceNotRegistered' } }
              : { status: 'error', message: 'Rate limited', details: { error: 'MessageRateExceeded' } }
          );
        }
        return messages.map(() => ({ status: 'ok', id: 'ticket_retry_ok' }));
      },
      async getReceipts() {
        return {};
      },
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        version: '2.0.5',
        buildNumber: 205,
        minSupportedVersion: '2.0.0',
        releaseNotes: 'Retry test',
        downloadUrl: 'https://cdn.sidprep.in/releases/v2.0.5.apk',
        status: 'PUBLISHED',
      },
    });
    const relId = JSON.parse(createRes.body).release.id;

    await worker.processNextJob();

    // Dead device must be permanently failed and token_valid = false
    const deadRow = await query<any>(
      `SELECT token_valid, invalid_reason FROM device_installations WHERE device_id = 'dev_unregistered'`
    );
    assert.equal(deadRow.rows[0].token_valid, false);
    assert.equal(deadRow.rows[0].invalid_reason, 'DeviceNotRegistered');

    // Simulate backoff time elapsed for retryable delivery
    await query(
      `UPDATE release_notification_deliveries SET next_retry_at = NOW() - INTERVAL '1 minute' WHERE status = 'FAILED_RETRYABLE'`
    );

    const retryRes = await processPushRetriesAndReceipts();
    assert.equal(retryRes.retriedReleases, 1);

    const delSummary = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/admin/releases/${relId}/deliveries`,
          headers: { authorization: `Bearer ${adminToken}` },
        })
      ).body
    ).summary;

    assert.equal(delSummary.acceptedCount, 1);
    assert.equal(delSummary.failedPermanentCount, 1);
    assert.equal(delSummary.failedRetryableCount, 0);
  });

  test('4. Withdrawing a release cancels queued notifications and flags update check as withdrawn', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      payload: {
        deviceId: 'dev_withdraw_target',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.0',
        buildNumber: 200,
        pushToken: 'ExponentPushToken[withdraw_target]',
        permissionStatus: 'GRANTED',
      },
    });

    let pushCount = 0;
    setPushTransport({
      async sendBatch(messages) {
        pushCount += messages.length;
        return messages.map(() => ({ status: 'ok', id: 'ticket_should_not_send' }));
      },
      async getReceipts() {
        return {};
      },
    });

    // Publish release (queues job in test mode without executing immediately)
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        version: '2.0.6',
        buildNumber: 206,
        minSupportedVersion: '2.0.0',
        releaseNotes: 'Bad build to be withdrawn',
        downloadUrl: 'https://cdn.sidprep.in/releases/v2.0.6.apk',
        status: 'PUBLISHED',
      },
    });
    const relId = JSON.parse(createRes.body).release.id;

    // Immediately withdraw the release BEFORE notification job runs
    const withdrawRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/releases/${relId}/publish`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        status: 'WITHDRAWN',
        withdrawnReason: 'Regression detected',
      },
    });
    assert.equal(withdrawRes.statusCode, 200);
    assert.equal(JSON.parse(withdrawRes.body).release.status, 'WITHDRAWN');

    // Even if notification job runs directly, nothing is sent
    const dispatchRes = await executeReleaseNotificationJob(relId);
    assert.equal(pushCount, 0);
    assert.ok(dispatchRes.skippedReason?.includes('WITHDRAWN'));

    // Notification tap / update screen recheck sees requestedReleaseWithdrawn = true
    const checkRes = await app.inject({
      method: 'GET',
      url: `/v1/app/updates/check?platform=ANDROID&channel=PRODUCTION&version=2.0.0&build=200&releaseId=${relId}`,
    });
    assert.equal(checkRes.statusCode, 200);
    const checkBody = JSON.parse(checkRes.body);
    assert.equal(checkBody.updateAvailable, false);
    assert.equal(checkBody.requestedReleaseWithdrawn, true);
  });

  test('5. Token refresh resets token validity and logout unlinks student session', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        deviceId: 'dev_refresh_test',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.2',
        buildNumber: 202,
        pushToken: 'ExponentPushToken[old_invalid]',
        permissionStatus: 'GRANTED',
      },
    });

    await query(
      `UPDATE device_installations SET token_valid = false, invalid_reason = 'DeviceNotRegistered' WHERE device_id = 'dev_refresh_test'`
    );

    // Refresh with rotated token
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        deviceId: 'dev_refresh_test',
        platform: 'ANDROID',
        releaseChannel: 'PRODUCTION',
        appVersion: '2.0.3',
        buildNumber: 203,
        pushToken: 'ExponentPushToken[new_rotated]',
        permissionStatus: 'GRANTED',
      },
    });

    const refreshed = await query<any>(
      `SELECT push_token, token_valid, app_version, student_id FROM device_installations WHERE device_id = 'dev_refresh_test'`
    );
    assert.equal(refreshed.rows[0].push_token, 'ExponentPushToken[new_rotated]');
    assert.equal(refreshed.rows[0].token_valid, true);
    assert.equal(refreshed.rows[0].app_version, '2.0.3');
    assert.equal(refreshed.rows[0].student_id, studentId);

    // Unregister on logout detaches student_id cleanly
    await app.inject({
      method: 'POST',
      url: '/v1/devices/push-token/unregister',
      payload: {
        deviceId: 'dev_refresh_test',
        platform: 'ANDROID',
      },
    });

    const afterLogout = await query<any>(
      `SELECT student_id FROM device_installations WHERE device_id = 'dev_refresh_test'`
    );
    assert.equal(afterLogout.rows[0].student_id, null);
  });
});
