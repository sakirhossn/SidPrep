process.env.NODE_ENV = 'test';
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Batch 3: Student Journey, Runner Synchronization & Schema Coherence (F08, F09, F10, F14, F23, F25, F29)', async () => {
  let app: any;

  const studentId = 'stu_batch3_journey_01';
  const studentToken = signJwt(
    { sub: studentId, email: 'journey.student@example.com', type: 'student', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:student_api' }
  );

  let activeAttemptId: string;
  let activeExpiresAt: string;

  before(async () => {
    app = await buildServer();
    await db.init();

    // Seed test student
    await db.students.set(studentId, {
      id: studentId,
      email: 'journey.student@example.com',
      preferredLanguage: 'en',
      targetExams: ['SSC_CGL'],
      dailyGoalMinutes: 60,
      streakDays: 4,
      status: 'ACTIVE',
      isEmailVerified: true,
      tokenVersion: 1,
      completedTasks: [],
      settings: {},
      createdAt: new Date().toISOString(),
    });
  });

  after(async () => {
    if (app) await app.close();
    await closePool();
  });

  it('F08: GET /me returns unified targetExams, selectedExamIds, dailyGoalMinutes, dailyTargetMinutes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.ok(Array.isArray(body.selectedExamIds), 'selectedExamIds must be an array');
    assert.ok(Array.isArray(body.targetExams), 'targetExams must be an array');
    assert.equal(body.selectedExamIds.length, body.targetExams.length);
    assert.equal(body.dailyTargetMinutes, body.dailyGoalMinutes);
    assert.equal(body.primaryExamId, 'SSC_CGL');
  });

  it('F08: POST /me/onboarding updates and returns unified profile preferences', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/onboarding',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        selectedExamIds: ['SSC_CGL', 'RRB_NTPC'],
        primaryExamId: 'SSC_CGL',
        dailyTargetMinutes: 90,
        preferredLanguage: 'hi',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.student.preferredLanguage, 'hi');
    assert.equal(body.student.dailyGoalMinutes, 90);
    assert.equal(body.student.dailyTargetMinutes, 90);
    assert.deepEqual(body.student.selectedExamIds, ['SSC_CGL', 'RRB_NTPC']);

    // Verify PostgreSQL persistence
    const sqlRes = await query<{ preferred_language: string; daily_goal_minutes: number; target_exams: string }>(
      'SELECT preferred_language, daily_goal_minutes, target_exams FROM students WHERE id = $1',
      [studentId]
    );
    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].preferred_language, 'hi');
    assert.equal(Number(sqlRes.rows[0].daily_goal_minutes), 90);
  });

  it('F09 & F14: POST /tests/:id/start creates attempt with serverTime, expiresAt, and empty savedAnswers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tests/test_cgl_full_01/start',
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);

    assert.ok(body.attemptId, 'attemptId must be generated');
    assert.equal(body.testId, 'test_cgl_full_01');
    assert.ok(body.startedAt, 'startedAt must be populated');
    assert.ok(body.serverTime, 'serverTime must be populated');
    assert.ok(body.expiresAt, 'expiresAt must be populated');
    assert.ok(Array.isArray(body.savedAnswers), 'savedAnswers must be an array');
    assert.equal(body.savedAnswers.length, 0);
    assert.ok(Array.isArray(body.sections), 'sections must be an array');
    assert.ok(Array.isArray(body.questions), 'questions must be an array');

    // Questions must NOT reveal answers or explanations to the student
    for (const q of body.questions) {
      assert.equal((q as any).correctOptionId, undefined, 'Runner questions must not expose correctOptionId');
      assert.equal((q as any).explanation, undefined, 'Runner questions must not expose explanation');
    }

    activeAttemptId = body.attemptId;
    activeExpiresAt = body.expiresAt;

    // Verify row directly in PostgreSQL database table
    const sqlRes = await query<{ id: string; expires_at: string; status: string }>(
      'SELECT id, expires_at, status FROM attempts WHERE id = $1',
      [activeAttemptId]
    );
    assert.equal(sqlRes.rows.length, 1);
    assert.equal(sqlRes.rows[0].status, 'IN_PROGRESS');
    assert.ok(sqlRes.rows[0].expires_at, 'expires_at must be persisted in PostgreSQL');
  });

  it('F14: POST /tests/:id/start resumes active attempt without restarting the clock', async () => {
    const resumeRes = await app.inject({
      method: 'POST',
      url: '/v1/tests/test_cgl_full_01/start',
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(resumeRes.statusCode, 200, 'Should return 200 OK for resume');
    const body = JSON.parse(resumeRes.body);

    assert.equal(body.attemptId, activeAttemptId, 'Must resume existing attempt');
    assert.equal(body.expiresAt, activeExpiresAt, 'Expiry deadline must remain authoritative');
  });

  it('F14 & F23: POST /sync/answers acknowledges sequence and stores answers monotonically', async () => {
    const syncRes = await app.inject({
      method: 'POST',
      url: '/v1/sync/answers',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        attemptId: activeAttemptId,
        answers: [
          {
            questionId: 'q_1',
            selectedOptionId: 'opt_a',
            isMarkedForReview: false,
            clientSequence: 10,
            timeSpentSeconds: 25,
          },
        ],
      },
    });

    assert.equal(syncRes.statusCode, 200);
    const body = JSON.parse(syncRes.body);
    assert.equal(body.success, true);
    assert.equal(body.syncedCount, 1);
    assert.deepEqual(body.syncedQuestionIds, ['q_1']);
    assert.equal(body.acknowledgedSequences[0].clientSequence, 10);
    assert.ok(body.remainingSeconds >= 0);

    // Resuming now includes the saved answer
    const resumeRes = await app.inject({
      method: 'POST',
      url: '/v1/tests/test_cgl_full_01/start',
      headers: { authorization: `Bearer ${studentToken}` },
    });
    assert.equal(resumeRes.statusCode, 200);
    const resumeBody = JSON.parse(resumeRes.body);
    assert.equal(resumeBody.savedAnswers.length, 1);
    assert.equal(resumeBody.savedAnswers[0].questionId, 'q_1');
    assert.equal(resumeBody.savedAnswers[0].selectedOptionId, 'opt_a');
  });

  it('F10: POST /attempts/:id/submit computes full results and prohibits rank invention', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: `/v1/attempts/${activeAttemptId}/submit`,
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        timeSpentSeconds: 600,
        answers: [
          { questionId: 'q_1', selectedOptionId: 'opt_b' },
        ],
      },
    });

    assert.equal(submitRes.statusCode, 200);
    const body = JSON.parse(submitRes.body);

    assert.equal(body.attemptId, activeAttemptId);
    assert.ok(typeof body.totalScore === 'number');
    assert.ok(typeof body.maxMarks === 'number');
    assert.ok(Array.isArray(body.solutions), 'solutions must be returned on submit');
    assert.ok(Array.isArray(body.sections), 'sections breakdown must be returned');

    // Strict invariant: Rank and percentile must NOT be invented
    assert.equal(body.rank, null, 'Rank must be null when cohort sample is insufficient');
    assert.equal(body.percentile, null, 'Percentile must be null when cohort sample is insufficient');
    assert.equal(body.isSampleSufficientForRank, false);
    assert.ok(body.rankNote, 'Must provide explanatory note for pending rank');

    // Verify snapshot persistence in PostgreSQL
    const sqlRes = await query<{ status: string; result_snapshot: any }>(
      'SELECT status, result_snapshot FROM attempts WHERE id = $1',
      [activeAttemptId]
    );
    assert.equal(sqlRes.rows[0].status, 'SUBMITTED');
    assert.ok(sqlRes.rows[0].result_snapshot, 'result_snapshot must be persisted in PostgreSQL');
  });

  it('F10: GET /attempts/:id/result retrieves persisted resultSnapshot from DB', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/attempts/${activeAttemptId}/result`,
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.attemptId, activeAttemptId);
    assert.ok(body.solutions.length > 0);
    assert.equal(body.rank, null);
    assert.equal(body.isSampleSufficientForRank, false);
  });

  it('F14: POST /sync/answers rejects answers after attempt deadline has expired', async () => {
    // Create an expired attempt directly
    const expiredAttemptId = 'att_expired_001';
    await db.attempts.set(expiredAttemptId, {
      id: expiredAttemptId,
      testId: 'test_cgl_full_01',
      studentId,
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
      durationSeconds: 3600,
      score: 0,
      maxScore: 200,
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      unattemptedCount: 100,
      answers: new Map(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/sync/answers',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        attemptId: expiredAttemptId,
        answers: [{ questionId: 'q_1', selectedOptionId: 'opt_a', clientSequence: 1 }],
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'ATTEMPT_EXPIRED');
  });

  it('F29: PATCH /study-plan/tasks/:id persists task completion across student records and /home reflects progress', async () => {
    // 1. Mark task completed
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/v1/study-plan/tasks/task-3',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { isCompleted: true },
    });

    assert.equal(patchRes.statusCode, 200);
    const patchBody = JSON.parse(patchRes.body);
    assert.equal(patchBody.taskId, 'task-3');
    assert.equal(patchBody.isCompleted, true);

    // 2. Verify GET /study-plan reflects this task completion
    const planRes = await app.inject({
      method: 'GET',
      url: '/v1/study-plan',
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(planRes.statusCode, 200);
    const planBody = JSON.parse(planRes.body);
    const task3 = planBody.tasks.find((t: any) => t.id === 'task-3');
    assert.ok(task3);
    assert.equal(task3.isCompleted, true);

    // 3. Verify GET /home reflects completed tasks summary
    const homeRes = await app.inject({
      method: 'GET',
      url: '/v1/home',
      headers: { authorization: `Bearer ${studentToken}` },
    });

    assert.equal(homeRes.statusCode, 200);
    const homeBody = JSON.parse(homeRes.body);
    assert.ok(homeBody.todayTasksSummary.completedTasks >= 1);

    // 4. Verify PostgreSQL persistence of completed_tasks
    const sqlRes = await query<{ completed_tasks: any }>(
      'SELECT completed_tasks FROM students WHERE id = $1',
      [studentId]
    );
    const tasks = typeof sqlRes.rows[0].completed_tasks === 'string'
      ? JSON.parse(sqlRes.rows[0].completed_tasks)
      : sqlRes.rows[0].completed_tasks;
    assert.ok(Array.isArray(tasks));
    assert.ok(tasks.includes('task-3'), 'task-3 must be in PostgreSQL completed_tasks column');
  });
});
