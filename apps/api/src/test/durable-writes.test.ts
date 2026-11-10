process.env.NODE_ENV = 'test';
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query, checkHealth } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Batch 2: Durable Writes, Resilience & Fail-Closed Database Policies (F11, F12, F13, F28)', async () => {
  let app: any;

  const adminToken = signJwt(
    { sub: 'adm_1', email: 'admin@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  const reviewerToken = signJwt(
    { sub: 'adm_2', email: 'editor@sidprep.in', role: 'EXAM_EDITOR', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  const studentId = 'stu_durable_test_01';
  const studentToken = signJwt(
    { sub: studentId, email: 'durable.student@example.com', type: 'student', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:student_api' }
  );

  before(async () => {
    app = await buildServer();
    await db.init();

    // Seed test student for durable writes
    await db.students.set(studentId, {
      id: studentId,
      email: 'durable.student@example.com',
      preferredLanguage: 'en',
      targetExams: ['SSC_CGL'],
      dailyGoalMinutes: 45,
      streakDays: 3,
      status: 'ACTIVE',
      isEmailVerified: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
  });

  after(async () => {
    if (app) await app.close();
    await closePool();
  });

  it('F11: PATCH /me immediately flushes student profile changes to PostgreSQL', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        preferredLanguage: 'hi',
        dailyGoalMinutes: 90,
      },
    });

    assert.equal(patchRes.statusCode, 200);
    const body = JSON.parse(patchRes.body);
    assert.equal(body.dailyGoalMinutes, 90);
    assert.equal(body.preferredLanguage, 'hi');

    // Verify row directly in PostgreSQL database table
    const sqlRes = await query<{ preferred_language: string; daily_goal_minutes: number }>(
      'SELECT preferred_language, daily_goal_minutes FROM students WHERE id = $1',
      [studentId]
    );

    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].preferred_language, 'hi');
    assert.equal(Number(sqlRes.rows[0].daily_goal_minutes), 90);
  });

  it('F11: PUT /admin/pages/:id immediately flushes CMS updates to PostgreSQL', async () => {
    // 1. Create a dynamic test page
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Initial Durable Page',
        slug: 'durable-test-page',
        contentHtml: '<p>Initial content</p>',
        isPublished: true,
      },
    });
    assert.equal(createRes.statusCode, 201);
    const created = JSON.parse(createRes.body).page;

    // 2. Update page content
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/pages/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Updated Durable Title 2026',
        contentHtml: '<p>Updated content successfully persisted</p>',
      },
    });
    assert.equal(updateRes.statusCode, 200);

    // 3. Verify PostgreSQL row directly
    const sqlRes = await query<{ title: string; content_html: string }>(
      'SELECT title, content_html FROM pages WHERE id = $1',
      [created.id]
    );
    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].title, 'Updated Durable Title 2026');
    assert.equal(sqlRes.rows[0].content_html, '<p>Updated content successfully persisted</p>');
  });

  it('F11: Dual-admin exam pattern proposals are persisted to PostgreSQL table exam_proposals', async () => {
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/propose',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        description: 'Proposed update for SSC CGL Tier 1',
        stagesCount: 3,
      },
    });

    assert.equal(proposeRes.statusCode, 200);
    const proposeBody = JSON.parse(proposeRes.body);
    assert.ok(proposeBody.proposalId);

    // Check direct SQL table exam_proposals
    const sqlRes = await query<{ id: string; status: string; proposed_by_admin_id: string }>(
      'SELECT id, status, proposed_by_admin_id FROM exam_proposals WHERE id = $1',
      [proposeBody.proposalId]
    );
    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].id, proposeBody.proposalId);
    assert.equal(sqlRes.rows[0].status, 'PENDING');
    assert.equal(sqlRes.rows[0].proposed_by_admin_id, 'adm_1');

    // Dual admin approval by editor adm_2
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/verify',
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: {
        proposalId: proposeBody.proposalId,
        approved: true,
      },
    });
    assert.equal(verifyRes.statusCode, 200);

    // Check PostgreSQL status changed to APPROVED
    const updatedSql = await query<{ status: string; verified_by_admin_id: string }>(
      'SELECT status, verified_by_admin_id FROM exam_proposals WHERE id = $1',
      [proposeBody.proposalId]
    );
    assert.equal(updatedSql.rows[0].status, 'APPROVED');
    assert.equal(updatedSql.rows[0].verified_by_admin_id, 'adm_2');
  });

  it('F11: PUT /admin/app/version flushes settings to app_settings table in PostgreSQL', async () => {
    const versionRes = await app.inject({
      method: 'PUT',
      url: '/v1/admin/app/version',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        currentVersion: '2.0.5',
        minVersion: '2.0.0',
        releaseNotes: 'Durable writes verified release notes',
      },
    });

    assert.equal(versionRes.statusCode, 200);

    // Verify row in app_settings table
    const sqlRes = await query<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings WHERE key = $1',
      ['app_version']
    );
    assert.equal(sqlRes.rows.length, 1);
    const parsed = typeof sqlRes.rows[0].value === 'string' ? JSON.parse(sqlRes.rows[0].value) : sqlRes.rows[0].value;
    assert.equal(parsed.currentVersion, '2.0.5');
    assert.equal(parsed.releaseNotes, 'Durable writes verified release notes');
  });

  it('F11: Test attempt submission and answers flush directly to PostgreSQL', async () => {
    // 1. Start attempt
    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/attempts',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { testId: 'test_cgl_full_01' },
    });
    assert.equal(startRes.statusCode, 201);
    const { attemptId } = JSON.parse(startRes.body);

    // 2. Submit answers
    const submitRes = await app.inject({
      method: 'POST',
      url: `/v1/attempts/${attemptId}/submit`,
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        answers: [
          { questionId: 'q_1', selectedOptionId: 'opt_b' },
          { questionId: 'q_2', selectedOptionId: 'opt_c' },
        ],
        timeSpentSeconds: 120,
      },
    });
    assert.equal(submitRes.statusCode, 200);

    // 3. Verify in PostgreSQL table attempts
    const sqlRes = await query<{ id: string; status: string; score: number; accuracy: number }>(
      'SELECT id, status, score, accuracy FROM attempts WHERE id = $1',
      [attemptId]
    );
    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].status, 'SUBMITTED');
    assert.ok(Number(sqlRes.rows[0].score) > 0);
  });

  it('F12: GET /health reports databaseEngine and health status', async () => {
    const healthRes = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });
    assert.equal(healthRes.statusCode, 200);
    const healthBody = JSON.parse(healthRes.body);
    assert.equal(healthBody.status, 'healthy');
    assert.ok(healthBody.checks.databaseEngine);
  });

  it('F13: Maintenance purge is strictly forbidden in production mode (403 Forbidden)', async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      // Temporarily simulate production environment
      process.env.NODE_ENV = 'production';

      const purgeRes = await app.inject({
        method: 'POST',
        url: '/v1/admin/maintenance/purge-demo',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { clearQuestions: true },
      });

      assert.equal(purgeRes.statusCode, 403);
      const body = JSON.parse(purgeRes.body);
      assert.equal(body.error.code, 'FORBIDDEN_IN_PRODUCTION');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('F13: Maintenance purge in test/dev strictly preserves non-demo questions and real records', async () => {
    // Insert a real question with custom ID
    const realQuestionId = 'q_real_aspirant_practice_101';
    await db.questions.set(realQuestionId, {
      id: realQuestionId,
      topicId: 'Indian Polity & Constitution',
      difficulty: 'HARD',
      correctOptionId: 'opt_a',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      isDemo: false,
      translations: [
        {
          language: 'en',
          text: 'Which constitutional amendment introduced the Goods and Services Tax (GST)?',
          explanation: 'The 101st Constitutional Amendment Act, 2016 introduced the GST.',
          options: [
            { id: 'opt_a', text: '101st Amendment' },
            { id: 'opt_b', text: '99th Amendment' },
          ],
        },
      ],
    });

    // Insert a demo question
    const demoQuestionId = 'demo_q_throwaway_sample';
    await db.questions.set(demoQuestionId, {
      id: demoQuestionId,
      topicId: 'Arithmetic',
      difficulty: 'EASY',
      correctOptionId: 'opt_a',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      isDemo: true,
      translations: [
        {
          language: 'en',
          text: 'Demo question text',
          explanation: 'Demo explanation',
          options: [{ id: 'opt_a', text: 'A' }],
        },
      ],
    });

    // Run purge demo data
    const purgeResult = await db.purgeDemoData({ clearQuestions: true });
    assert.equal(purgeResult.success, true);

    // Verify demo question was purged
    assert.equal(db.questions.has(demoQuestionId), false);

    // Verify real non-demo question survived!
    assert.equal(db.questions.has(realQuestionId), true);
    const fetched = db.questions.get(realQuestionId);
    assert.ok(fetched);
    assert.equal(fetched.id, realQuestionId);

    // Clean up test question
    await db.questions.delete(realQuestionId);
  });
});
