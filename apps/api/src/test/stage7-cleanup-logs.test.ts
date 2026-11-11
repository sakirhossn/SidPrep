import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { signJwt, hashPassword } from '../lib/security.js';
import { closePool } from '../db/pool.js';

describe('Stage 7 Regression: Controlled Cleanup Handshake & 3-Layer Logs', () => {
  let app: FastifyInstance;
  const ts = Date.now();
  const superAdminId = `adm_stage7_super_${ts}`;
  const superAdminEmail = `super.stage7_${ts}@example.com`;
  const superAdminPassword = 'SuperSecretPassword123!';
  let superAdminToken: string;

  const staffEditorId = `adm_stage7_editor_${ts}`;
  let staffEditorToken: string;

  before(async () => {
    app = await buildServer();
    await app.ready();

    const passwordHash = await hashPassword(superAdminPassword);
    await db.adminUsers.set(superAdminId, {
      id: superAdminId,
      email: superAdminEmail,
      name: 'Stage 7 Super Admin',
      passwordHash,
      totpSecret: 'dummy',
      is2faEnabled: false,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    await db.adminUsers.set(staffEditorId, {
      id: staffEditorId,
      email: `editor.stage7_${ts}@example.com`,
      name: 'Stage 7 Editor',
      passwordHash: 'dummy',
      totpSecret: 'dummy',
      is2faEnabled: false,
      role: 'EXAM_EDITOR',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    superAdminToken = signJwt(
      { sub: superAdminId, email: superAdminEmail, name: 'Stage 7 Super Admin', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_api' }
    );

    staffEditorToken = signJwt(
      { sub: staffEditorId, email: `editor.stage7_${ts}@example.com`, name: 'Stage 7 Editor', role: 'EXAM_EDITOR', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_api' }
    );

    // Seed some demo items to be purged
    await db.questions.set(`q_demo_${ts}_1`, {
      id: `q_demo_${ts}_1`,
      topicId: 'general_awareness',
      difficulty: 'EASY',
      correctOptionId: 'opt_1',
      createdBy: superAdminId,
      status: 'DRAFT',
      isDemo: true,
      translations: [],
    });

    await db.tests.set(`test_demo_${ts}_1`, {
      id: `test_demo_${ts}_1`,
      examCode: 'SSC_CGL',
      title: 'Demo Mock Test #1',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 25,
      totalMarks: 50,
      isFree: true,
      isPublished: false,
      sections: [],
      instructions: [],
      isDemo: true,
    });
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  test('7.1 Cleanup plan generation (RBAC & dry-run scan)', async () => {
    // 1. Non-super admin receives 403 Forbidden
    const editorRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-plan',
      headers: { authorization: `Bearer ${staffEditorToken}` },
    });
    assert.equal(editorRes.statusCode, 403);

    // 2. Super admin generates cleanup plan
    const planRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-plan',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(planRes.statusCode, 200);
    const planBody = JSON.parse(planRes.body);
    assert.equal(planBody.success, true);
    assert.ok(planBody.planId);
    assert.ok(planBody.token);
    assert.ok(planBody.summary.questions >= 1);
    assert.ok(planBody.summary.tests >= 1);
  });

  test('7.2 Controlled cleanup execution gate (confirmation phrase, re-auth, token verification)', async () => {
    // 1. Generate fresh plan
    const planRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-plan',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    const { token } = JSON.parse(planRes.body);

    // 2. Reject mismatched confirmation phrase
    const badPhraseRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-execute',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        token,
        password: superAdminPassword,
        confirmation: 'PURGE PLEASE',
      },
    });
    assert.equal(badPhraseRes.statusCode, 400);
    assert.equal(JSON.parse(badPhraseRes.body).error?.code, 'CONFIRMATION_MISMATCH');

    // 3. Reject wrong super admin password
    const badPassRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-execute',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        token,
        password: 'WrongPassword!',
        confirmation: 'CONFIRM PURGE DEMO PROVENANCE',
      },
    });
    assert.equal(badPassRes.statusCode, 401);
    assert.equal(JSON.parse(badPassRes.body).error?.code, 'INVALID_CREDENTIALS');

    // 4. Reject tampered token
    const badTokenRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-execute',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        token: 'invalid.tampered.token',
        password: superAdminPassword,
        confirmation: 'CONFIRM PURGE DEMO PROVENANCE',
      },
    });
    assert.equal(badTokenRes.statusCode, 400);
    assert.equal(JSON.parse(badTokenRes.body).error?.code, 'INVALID_CLEANUP_TOKEN');

    // 5. Successful execution with exact credentials
    const validExecRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/cleanup-execute',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        token,
        password: superAdminPassword,
        confirmation: 'CONFIRM PURGE DEMO PROVENANCE',
      },
    });
    assert.equal(validExecRes.statusCode, 200);
    const execBody = JSON.parse(validExecRes.body);
    assert.equal(execBody.success, true);
    assert.ok(execBody.manifestId);

    // Verify demo records purged from memory
    assert.equal(db.questions.get(`q_demo_${ts}_1`), undefined);
    assert.equal(db.tests.get(`test_demo_${ts}_1`), undefined);

    // INVARIANT: Official exam catalogue and staff accounts preserved!
    assert.ok(db.exams.size > 0);
    assert.ok(db.adminUsers.get(superAdminId));
  });

  test('7.3 3-Layer Logs Console & Retention Purge', async () => {
    // 1. Audit logs inspection
    const auditRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/logs/audit?limit=20',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(auditRes.statusCode, 200);
    const auditLogs = JSON.parse(auditRes.body);
    assert.ok(Array.isArray(auditLogs));
    // The cleanup execution earlier logged an audit event
    assert.ok(auditLogs.some((l: any) => l.action === 'EXECUTE_CLEANUP_PLAN'));

    // 2. Operational logs inspection
    const opsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/logs/operational?limit=20',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(opsRes.statusCode, 200);
    assert.ok(Array.isArray(JSON.parse(opsRes.body)));

    // 3. Telemetry logs inspection
    const telRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/logs/telemetry?limit=20',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(telRes.statusCode, 200);
    assert.ok(Array.isArray(JSON.parse(telRes.body)));

    // 4. Log retention purge (purging operational & telemetry logs older than 0 days)
    const purgeRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/logs/purge',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        layer: 'both',
        olderThanDays: 0,
      },
    });
    assert.equal(purgeRes.statusCode, 200);
    const purgeBody = JSON.parse(purgeRes.body);
    assert.equal(purgeBody.success, true);

    // Audit logs MUST NEVER be purged!
    assert.ok(db.auditEvents.length > 0);
  });
});
