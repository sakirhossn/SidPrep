import { buildServer } from '../server.js';
import { closePool } from '../db/pool.js';
import { db } from '../db/index.js';

async function verifyPersistence() {
  console.log('=== [PHASE 1] Starting Server Instance 1 ===');
  const server1 = await buildServer();

  console.log('Logging in as admin...');
  const loginRes = await server1.inject({
    method: 'POST',
    url: '/v1/auth/admin/login',
    payload: {
      email: 'admin@sidprep.in',
      password: 'dev-only-do-not-use-admin-password',
    },
  });

  const loginData = JSON.parse(loginRes.body);
  if (!loginData.success || !loginData.preAuthToken) {
    throw new Error(`Admin login step 1 failed: ${loginRes.body}`);
  }
  console.log('Admin login step 1 success! Got preAuthToken.');

  console.log('Verifying 2FA TOTP...');
  const totpRes = await server1.inject({
    method: 'POST',
    url: '/v1/auth/admin/verify-totp',
    payload: {
      preAuthToken: loginData.preAuthToken,
      totpCode: '123456',
    },
  });

  const totpData = JSON.parse(totpRes.body);
  if (!totpData.success || !totpData.adminToken) {
    throw new Error(`Admin 2FA verification failed: ${totpRes.body}`);
  }
  const adminToken = totpData.adminToken;
  console.log('Admin 2FA verification success! Received adminToken.');

  console.log('Creating a new question via POST /v1/admin/questions...');
  const questionPayload = {
    text: 'What is the speed of light in vacuum?',
    topicId: 'physics_constants',
    difficulty: 'EASY',
    correctOptionId: 'opt_c',
    translations: [
      {
        language: 'en',
        text: 'What is the speed of light in vacuum?',
        explanation: 'The speed of light in vacuum is approximately 3 x 10^8 m/s.',
        options: [
          { id: 'opt_a', text: '3 x 10^6 m/s' },
          { id: 'opt_b', text: '3 x 10^7 m/s' },
          { id: 'opt_c', text: '3 x 10^8 m/s' },
          { id: 'opt_d', text: '3 x 10^9 m/s' },
        ],
      },
    ],
  };

  const createQuestionRes = await server1.inject({
    method: 'POST',
    url: '/v1/admin/questions',
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
    payload: questionPayload,
  });

  const createdQuestionData = JSON.parse(createQuestionRes.body);
  if (!createdQuestionData.success || !createdQuestionData.question?.id) {
    throw new Error(`Create question failed: ${createQuestionRes.body}`);
  }
  const createdQuestionId = createdQuestionData.question.id;
  console.log(`Created question successfully with ID: ${createdQuestionId}`);

  console.log('Creating a new exam in the database...');
  const testExamId = `exam_persisted_${Date.now()}`;
  const testExamCode = `UPSC_CSE_PRELIMS_${Date.now()}`;
  db.exams.set(testExamId, {
    id: testExamId,
    bodyCode: 'RRB',
    name: 'RRB NTPC Graduate Level (Persisted)',
    code: testExamCode,
    description: 'Exam pattern created to test persistence across restarts',
    stagesCount: 3,
    verifiedDate: '2026-11-07',
    sourceUrl: 'https://rrbcdg.gov.in',
    stages: [],
    syllabusTree: [],
  });
  console.log(`Created exam record with ID: ${testExamId}`);

  console.log('Flushing all pending writes to PostgreSQL...');
  await db.flush();

  console.log('=== [PHASE 2] Simulating API Process Restart ===');
  console.log('Shutting down Server 1 and closing database connections...');
  await server1.close();
  await closePool();
  console.log('Server 1 completely stopped. Connections closed.');

  console.log('Starting Server Instance 2 (Cold Start from Storage)...');
  const server2 = await buildServer();
  console.log('Server 2 started and connected to database.');

  console.log('Verifying created exam via GET /v1/exams on Server 2...');
  const examsRes = await server2.inject({
    method: 'GET',
    url: '/v1/exams',
  });

  const exams = JSON.parse(examsRes.body) as Array<{ id: string; name: string }>;
  const persistedExam = exams.find((e) => e.id === testExamId);
  if (!persistedExam) {
    throw new Error(`Persisted exam ${testExamId} NOT found in GET /v1/exams response!`);
  }
  console.log(`CONFIRMED: Exam ${testExamId} found after restart: "${persistedExam.name}"!`);

  console.log('Verifying created question via GET /v1/admin/questions on Server 2...');
  const questionsRes = await server2.inject({
    method: 'GET',
    url: `/v1/admin/questions?topicId=physics_constants`,
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });

  const rawQuestions = JSON.parse(questionsRes.body);
  const questionsList = Array.isArray(rawQuestions) ? rawQuestions : rawQuestions.questions || [];
  const persistedQuestion = questionsList.find((q: any) => q.id === createdQuestionId);
  if (!persistedQuestion) {
    throw new Error(`Persisted question ${createdQuestionId} NOT found in GET /v1/admin/questions response! Response was: ${questionsRes.body}`);
  }
  console.log(`CONFIRMED: Question ${createdQuestionId} found after restart: "${persistedQuestion.translations?.[0]?.text || 'Found'}"!`);

  await server2.close();
  await closePool();
  console.log('\n========================================');
  console.log('VERIFICATION PASSED: Data survived restart 100%!');
  console.log('========================================');
}

verifyPersistence().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
