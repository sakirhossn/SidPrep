import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import type { FastifyInstance } from 'fastify';

describe('Stage 3: Test Builder & Question Staging Test Suite', () => {
  let app: FastifyInstance;

  const contentManagerId = `adm_stage3_cm_${Date.now()}`;
  let contentManagerToken: string;

  const studentId = `stu_stage3_${Date.now()}`;
  const studentEmail = `student.testbuilder.${Date.now()}@example.com`;
  let studentToken: string;

  before(async () => {
    app = await buildServer();
    await db.init();

    // Seed Content Manager
    await db.adminUsers.set(contentManagerId, {
      id: contentManagerId,
      email: `cm.builder.${Date.now()}@sidprep.in`,
      name: 'Content Manager Test Builder',
      role: 'CONTENT_MANAGER',
      isActive: true,
      tokenVersion: 1,
      is2faEnabled: true,
      passwordHash: 'dummy_hash',
      totpSecret: 'dummy_secret',
      createdAt: new Date().toISOString(),
    });

    contentManagerToken = signJwt(
      { sub: contentManagerId, email: `cm.builder.${Date.now()}@sidprep.in`, role: 'CONTENT_MANAGER', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );

    // Seed Student
    await db.students.set(studentId, {
      id: studentId,
      email: studentEmail,
      firstName: 'Rahul',
      lastName: 'Verma',
      isSingleName: false,
      phone: '+919876543299',
      phoneCountryCode: '+91',
      isPhoneVerified: true,
      isEmailVerified: true,
      targetExams: ['ssc-cgl'],
      selectedExamIds: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      preferredLanguage: 'en',
      dailyGoalMinutes: 60,
      dailyTargetMinutes: 60,
      streakDays: 1,
      tokenVersion: 1,
      status: 'ACTIVE',
      isProfileComplete: true,
      createdAt: new Date().toISOString(),
    });

    studentToken = signJwt(
      { sub: studentId, email: studentEmail, type: 'student', tokenVersion: 1 },
      '7d',
      { audience: 'sidprep:student_api' }
    );
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  let createdTestId: string;

  it('1. POST /admin/tests creates a new test blueprint and persists it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/tests',
      headers: { authorization: `Bearer ${contentManagerToken}` },
      payload: {
        title: 'SSC CGL Tier-1 Stage 3 Mock Test',
        examCode: 'SSC_CGL',
        type: 'FULL',
        durationMinutes: 60,
        totalQuestions: 25,
        totalMarks: 50,
        isFree: true,
        isPublished: false,
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.title, 'SSC CGL Tier-1 Stage 3 Mock Test');
    assert.equal(body.data.isPublished, false);
    createdTestId = body.data.id;

    // Verify it exists in db.tests
    assert.ok(db.tests.has(createdTestId));
  });

  it('2. PUT /admin/tests/:id updates test blueprint duration and title', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/tests/${createdTestId}`,
      headers: { authorization: `Bearer ${contentManagerToken}` },
      payload: {
        title: 'SSC CGL Tier-1 Stage 3 Mock Test (Updated)',
        durationMinutes: 75,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.title, 'SSC CGL Tier-1 Stage 3 Mock Test (Updated)');
    assert.equal(body.data.durationMinutes, 75);

    const updated = db.tests.get(createdTestId)!;
    assert.equal(updated.title, 'SSC CGL Tier-1 Stage 3 Mock Test (Updated)');
    assert.equal(updated.durationMinutes, 75);
  });

  it('3. PATCH /admin/tests/:id/publish toggles published state and makes test available to students', async () => {
    // Before publishing, test is not visible in student catalogue
    const studentResBefore = await app.inject({
      method: 'GET',
      url: '/v1/tests',
    });
    const catalogueBefore = JSON.parse(studentResBefore.body);
    assert.equal(
      catalogueBefore.data.find((t: any) => t.id === createdTestId),
      undefined
    );

    // Publish
    const pubRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/tests/${createdTestId}/publish`,
      headers: { authorization: `Bearer ${contentManagerToken}` },
      payload: { isPublished: true },
    });
    assert.equal(pubRes.statusCode, 200);

    // Student catalogue now includes the newly published test
    const studentResAfter = await app.inject({
      method: 'GET',
      url: '/v1/tests',
    });
    const catalogueAfter = JSON.parse(studentResAfter.body);
    const found = catalogueAfter.data.find((t: any) => t.id === createdTestId);
    assert.ok(found);
    assert.equal(found.title, 'SSC CGL Tier-1 Stage 3 Mock Test (Updated)');

    // Student can successfully start an attempt for this newly created test
    const startRes = await app.inject({
      method: 'POST',
      url: `/v1/tests/${createdTestId}/start`,
      headers: { authorization: `Bearer ${studentToken}` },
    });
    assert.ok(startRes.statusCode === 200 || startRes.statusCode === 201);
    const startBody = JSON.parse(startRes.body);
    assert.ok(startBody.attemptId);
  });

  it('4. POST /admin/tests/:id/duplicate creates an un-published draft clone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/tests/${createdTestId}/duplicate`,
      headers: { authorization: `Bearer ${contentManagerToken}` },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(body.data.id.includes('_copy_'));
    assert.equal(body.data.isPublished, false);
    assert.ok(body.data.title.includes('(Draft Copy)'));
  });

  it('5. POST /admin/questions/import-staging validates, reports errors, and persists valid rows to DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/import-staging',
      headers: { authorization: `Bearer ${contentManagerToken}` },
      payload: {
        items: [
          {
            text: 'What is the full form of GDP in economics?',
            correctOptionId: 'opt_1',
            difficulty: 'EASY',
            topicId: 'economics',
          },
          {
            // Missing text
            correctOptionId: 'opt_2',
            difficulty: 'MEDIUM',
          },
          {
            // Missing correct option
            text: 'Which planet is known as the Red Planet?',
            difficulty: 'EASY',
          },
          {
            text: 'Who is the author of Arthashastra?',
            correctOptionId: 'opt_3',
            difficulty: 'HARD',
            topicId: 'history',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.stagedCount, 4);
    assert.equal(body.passedCount, 2);
    assert.equal(body.errors.length, 2);

    // Verify valid questions were persisted into db.questions as DRAFT
    const allQuestions = Array.from(db.questions.values());
    const gdpQ = allQuestions.find((q) =>
      q.translations?.some((t) => t.text?.includes('full form of GDP'))
    );
    assert.ok(gdpQ);
    assert.equal(gdpQ.status, 'DRAFT');
    assert.equal(gdpQ.difficulty, 'EASY');
  });
});
