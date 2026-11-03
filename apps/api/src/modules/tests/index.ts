import type { FastifyPluginAsync } from 'fastify';
import { db, AttemptRecord } from '../../db/index.js';
import { verifyJwt } from '../../lib/security.js';
import { OfflineSyncBatchSchema } from '@sidprep/contracts';

export const testRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /tests
   * Mock catalogue: full-length, sectional, topic-wise, PYQ
   */
  fastify.get('/tests', async (request, reply) => {
    const { examId, type, page = '1', limit = '20' } = request.query as {
      examId?: string;
      type?: string;
      page?: string;
      limit?: string;
    };

    const p = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10)));

    let items = Array.from(db.tests.values()).filter((t) => t.isPublished);

    if (examId) {
      items = items.filter((t) => t.examCode.toLowerCase() === examId.toLowerCase());
    }

    if (type) {
      items = items.filter((t) => t.type.toUpperCase() === type.toUpperCase());
    }

    const total = items.length;
    const startIndex = (p - 1) * lim;
    const paginated = items.slice(startIndex, startIndex + lim);
    const mapped = paginated.map((t) => ({
      id: t.id,
      examId: t.examCode.toLowerCase(),
      examCode: t.examCode,
      title: t.title,
      type: t.type,
      durationMinutes: t.durationMinutes,
      totalQuestions: t.totalQuestions,
      totalMarks: t.totalMarks,
      isFree: t.isFree,
      isLocked: !t.isFree,
    }));

    return reply.send({
      items: mapped,
      data: mapped,
      total,
      pagination: {
        total,
        page: p,
        limit: lim,
        totalPages: Math.ceil(total / lim) || 1,
      },
    });
  });

  /**
   * GET /tests/:id
   * Test detail, section structure and instructions
   */
  fastify.get('/tests/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const test = db.tests.get(id);

    if (!test || !test.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Test not found' } });
    }

    return reply.send(test);
  });

  /**
   * POST /attempts
   * Start a new test attempt
   */
  fastify.post('/attempts', async (request, reply) => {
    const authHeader = request.headers.authorization;
    let studentId = 'stu_anon';
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyJwt<{ sub: string }>(authHeader.substring(7));
      if (decoded?.sub) studentId = decoded.sub;
    }

    const { testId } = request.body as { testId: string };
    const test = db.tests.get(testId);

    if (!test || !test.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Test not found' } });
    }

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Prepare questions for runner: hide correct answers and explanations until submission!
    const questionsForRunner = test.sections.flatMap((section) =>
      section.questions.map((sq, idx) => {
        const q = db.questions.get(sq.questionId);
        const en = q?.translations.find((t) => t.language === 'en') || q?.translations[0];
        return {
          id: sq.questionId,
          sectionId: section.id,
          sequence: idx + 1,
          text: en?.text || 'Question text unavailable',
          options: en?.options || [], // Options without answer indicators!
          positiveMarks: sq.positiveMarks,
          negativeMarks: sq.negativeMarks,
        };
      })
    );

    const attemptRecord: AttemptRecord = {
      id: attemptId,
      testId,
      studentId,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      durationSeconds: test.durationMinutes * 60,
      score: 0,
      maxScore: test.totalMarks,
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      unattemptedCount: test.totalQuestions,
      answers: new Map(),
    };

    db.attempts.set(attemptId, attemptRecord);

    return reply.code(201).send({
      attemptId,
      testId,
      startedAt: attemptRecord.startedAt,
      durationSeconds: attemptRecord.durationSeconds,
      questions: questionsForRunner,
    });
  });

  /**
   * POST /attempts/:id/submit
   * Authoritative submission & scoring
   */
  fastify.post('/attempts/:id/submit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const attempt = db.attempts.get(id);

    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    if (attempt.status === 'SUBMITTED') {
      return reply.code(400).send({ success: false, error: { code: 'ALREADY_SUBMITTED', message: 'Test attempt was already submitted' } });
    }

    const body = request.body as { answers?: { questionId: string; selectedOptionId: string | null }[]; timeSpentSeconds?: number };
    const submittedAnswers = body.answers || [];

    const test = db.tests.get(attempt.testId);
    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    const sectionBreakdown: { sectionTitle: string; score: number; maxMarks: number; accuracy: number }[] = [];

    if (test) {
      for (const sec of test.sections) {
        let secScore = 0;
        let secMax = 0;
        let secCorrect = 0;
        let secAttempted = 0;

        for (const sq of sec.questions) {
          secMax += sq.positiveMarks;
          const q = db.questions.get(sq.questionId);
          const ans = submittedAnswers.find((a) => a.questionId === sq.questionId);

          if (!ans || !ans.selectedOptionId) {
            unattemptedCount++;
          } else {
            secAttempted++;
            if (q && ans.selectedOptionId === q.correctOptionId) {
              totalScore += sq.positiveMarks;
              secScore += sq.positiveMarks;
              correctCount++;
              secCorrect++;
            } else {
              totalScore -= sq.negativeMarks;
              secScore -= sq.negativeMarks;
              wrongCount++;
            }
          }
        }

        sectionBreakdown.push({
          sectionTitle: sec.title,
          score: Math.max(0, Number(secScore.toFixed(2))),
          maxMarks: secMax,
          accuracy: secAttempted > 0 ? Number(((secCorrect / secAttempted) * 100).toFixed(1)) : 0,
        });
      }
    }

    const attemptedTotal = correctCount + wrongCount;
    const accuracy = attemptedTotal > 0 ? Number(((correctCount / attemptedTotal) * 100).toFixed(1)) : 0;

    attempt.status = 'SUBMITTED';
    attempt.submittedAt = new Date().toISOString();
    attempt.score = Math.max(0, Number(totalScore.toFixed(2)));
    attempt.accuracy = accuracy;
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.unattemptedCount = unattemptedCount;

    return reply.send({
      attemptId: attempt.id,
      score: attempt.score,
      maxScore: attempt.maxScore,
      accuracy: attempt.accuracy,
      timeTakenSeconds: body.timeSpentSeconds || 1800,
      correctCount,
      wrongCount,
      unattemptedCount,
      sectionBreakdown,
    });
  });

  /**
   * POST /sync/answers
   * Monotonic offline answer synchronization
   */
  fastify.post('/sync/answers', async (request, reply) => {
    const parse = OfflineSyncBatchSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_SYNC_PAYLOAD', details: parse.error.format() } });
    }

    const { attemptId, items } = parse.data;
    const attempt = db.attempts.get(attemptId);

    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    let syncedCount = 0;
    for (const item of items) {
      const existing = attempt.answers.get(item.questionId);
      // Ensure monotonic client sequences
      if (!existing || item.clientSequence >= existing.clientSequence) {
        attempt.answers.set(item.questionId, {
          selectedOptionId: item.selectedOptionId,
          clientSequence: item.clientSequence,
          isMarkedForReview: item.isMarkedForReview,
          timestamp: item.timestamp,
        });
        syncedCount++;
      }
    }

    return reply.send({
      success: true,
      syncedCount,
      pendingSequence: 0,
    });
  });
};
