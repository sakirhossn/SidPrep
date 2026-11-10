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
   * Helper: Start or Resume attempt logic
   */
  const startAttemptHandler = async (testId: string, request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Student authentication token required to start attempt.' },
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string; type?: string; tokenVersion?: number }>(token);
    if (!decoded?.sub || (decoded.type && decoded.type !== 'student')) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Valid student session required.' },
      });
    }

    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Student account is not active or has been suspended.' },
      });
    }

    if (student.tokenVersion !== undefined && decoded.tokenVersion !== undefined && decoded.tokenVersion < student.tokenVersion) {
      return reply.code(401).send({
        success: false,
        error: { code: 'SESSION_REVOKED', message: 'Session has been revoked.' },
      });
    }

    const test = db.tests.get(testId);

    if (!test || !test.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Test not found' } });
    }

    // Invariant F06: Check entitlement if test is not free
    if (!test.isFree) {
      const isEntitled = student.targetExams && (
        student.targetExams.includes(test.examCode) ||
        student.targetExams.includes('ALL')
      );
      if (!isEntitled) {
        return reply.code(403).send({
          success: false,
          error: { code: 'ENTITLEMENT_REQUIRED', message: 'This premium test requires an active enrollment in the target exam.' },
        });
      }
    }

    const studentId = student.id;

    // Format sections
    const formattedSections = test.sections.map((s) => ({
      id: s.id,
      name: s.title,
      title: s.title,
      durationMinutes: s.durationMinutes,
      isLocked: s.sectionLock ?? false,
      sectionLock: s.sectionLock ?? false,
      questionsCount: s.questions?.length ?? 0,
      questionCount: s.questions?.length ?? 0,
      totalMarks: s.questions?.reduce((acc, q) => acc + (q.positiveMarks || 0), 0) || 0,
      negativeMarkRate: s.questions?.[0]?.negativeMarks || 0,
    }));

    // Prepare questions for runner: hide correct answers and explanations until submission!
    const questionsForRunner = test.sections.flatMap((section) =>
      section.questions.map((sq, idx) => {
        const q = db.questions.get(sq.questionId);
        const en = q?.translations?.find((t) => t.language === 'en') || q?.translations?.[0];
        return {
          id: sq.questionId,
          sectionId: section.id,
          sectionName: section.title,
          questionNumber: idx + 1,
          sequence: idx + 1,
          language: (en?.language || 'en') as 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr',
          text: en?.text || 'Question text unavailable',
          hasMath: !!(en?.text && (en.text.includes('$') || en.text.includes('\\'))),
          imageUrl: (q as any)?.imageUrl,
          options: (en?.options || []).map((o: any) => ({ id: o.id, text: o.text, imageUrl: o.imageUrl })), // Options without answer indicators!
          marks: sq.positiveMarks,
          positiveMarks: sq.positiveMarks,
          negativeMarks: sq.negativeMarks,
        };
      })
    );

    // F14: Check for existing in-progress attempt to resume without restarting the clock
    const existingAttempt = Array.from(db.attempts.values()).find(
      (a) => a.studentId === studentId && a.testId === testId && a.status === 'IN_PROGRESS'
    );

    if (existingAttempt) {
      const now = Date.now();
      const expTime = existingAttempt.expiresAt ? new Date(existingAttempt.expiresAt).getTime() : 0;
      if (expTime > now) {
        // Active unexpired attempt: Resume it!
        const savedAnswers: { questionId: string; selectedOptionId: string | null; isMarkedForReview: boolean; clientSequence: number }[] = [];
        for (const [qId, ans] of existingAttempt.answers.entries()) {
          savedAnswers.push({
            questionId: qId,
            selectedOptionId: ans.selectedOptionId,
            isMarkedForReview: ans.isMarkedForReview || false,
            clientSequence: ans.clientSequence || 0,
          });
        }

        return reply.code(200).send({
          attemptId: existingAttempt.id,
          testId,
          startedAt: existingAttempt.startedAt,
          serverTime: new Date().toISOString(),
          expiresAt: existingAttempt.expiresAt,
          durationSeconds: existingAttempt.durationSeconds,
          sections: formattedSections,
          questions: questionsForRunner,
          savedAnswers,
        });
      } else {
        // Existing attempt was expired
        existingAttempt.status = 'EXPIRED';
        await db.attempts.set(existingAttempt.id, existingAttempt);
      }
    }

    // Start a brand new attempt
    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const durationSeconds = test.durationMinutes * 60;
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    const attemptRecord: AttemptRecord = {
      id: attemptId,
      testId,
      studentId,
      status: 'IN_PROGRESS',
      startedAt,
      expiresAt,
      durationSeconds,
      score: 0,
      maxScore: test.totalMarks,
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      unattemptedCount: test.totalQuestions,
      answers: new Map(),
    };

    await db.attempts.set(attemptId, attemptRecord);

    return reply.code(201).send({
      attemptId,
      testId,
      startedAt: attemptRecord.startedAt,
      serverTime: startedAt,
      expiresAt,
      durationSeconds: attemptRecord.durationSeconds,
      sections: formattedSections,
      questions: questionsForRunner,
      savedAnswers: [],
    });
  };

  /**
   * POST /attempts
   * Start a new test attempt via testId in body
   */
  fastify.post('/attempts', async (request, reply) => {
    const { testId } = (request.body as { testId?: string }) || {};
    if (!testId) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'testId is required' } });
    }
    return startAttemptHandler(testId, request, reply);
  });

  /**
   * POST /tests/:id/start
   * Start attempt via route parameter (OpenAPI alias)
   */
  fastify.post('/tests/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    return startAttemptHandler(id, request, reply);
  });

  /**
   * GET /attempts/:id
   * Get attempt status and details
   */
  fastify.get('/attempts/:id', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student authentication required.' } });
    }
    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string; type?: string }>(token);
    if (!decoded?.sub || (decoded.type && decoded.type !== 'student')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Valid student session required.' } });
    }
    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Student account is not active.' } });
    }

    const { id } = request.params as { id: string };
    const attempt = db.attempts.get(id);
    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    if (attempt.studentId !== student.id) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this attempt.' } });
    }

    const remainingSeconds = attempt.expiresAt
      ? Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000))
      : 0;

    return reply.send({
      id: attempt.id,
      testId: attempt.testId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      remainingSeconds,
      durationSeconds: attempt.durationSeconds,
      score: attempt.score,
      maxScore: attempt.maxScore,
      accuracy: attempt.accuracy,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unattemptedCount: attempt.unattemptedCount,
      savedAnswersCount: attempt.answers.size,
    });
  });

  /**
   * GET /attempts/:id/result
   * Retrieve authoritative attempt result and breakdown (F10)
   */
  fastify.get('/attempts/:id/result', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student authentication required.' } });
    }
    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string; type?: string }>(token);
    if (!decoded?.sub || (decoded.type && decoded.type !== 'student')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Valid student session required.' } });
    }
    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Student account is not active.' } });
    }

    const { id } = request.params as { id: string };
    const attempt = db.attempts.get(id);
    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    if (attempt.studentId !== student.id) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this attempt result.' } });
    }

    if (attempt.status !== 'SUBMITTED' && attempt.status !== 'EXPIRED') {
      return reply.code(400).send({
        success: false,
        error: { code: 'ATTEMPT_NOT_SUBMITTED', message: 'Attempt has not been submitted yet.' },
      });
    }

    if (attempt.resultSnapshot) {
      return reply.send(attempt.resultSnapshot);
    }

    // Fallback: Return basic result structure if snapshot was not stored
    const test = db.tests.get(attempt.testId);
    return reply.send({
      attemptId: attempt.id,
      testId: attempt.testId,
      testTitle: test?.title || 'Mock Test',
      examTitle: test?.examCode || 'Exam',
      submittedAt: attempt.submittedAt || new Date().toISOString(),
      totalScore: attempt.score,
      score: attempt.score,
      maxMarks: attempt.maxScore,
      maxScore: attempt.maxScore,
      overallAccuracy: attempt.accuracy,
      accuracy: attempt.accuracy,
      totalTimeSpentSeconds: attempt.durationSeconds,
      timeSpentSeconds: attempt.durationSeconds,
      totalQuestions: test?.totalQuestions || (attempt.correctCount + attempt.wrongCount + attempt.unattemptedCount),
      correctCount: attempt.correctCount,
      incorrectCount: attempt.wrongCount,
      wrongCount: attempt.wrongCount,
      unattemptedCount: attempt.unattemptedCount,
      percentile: null,
      rank: null,
      totalTestTakers: null,
      isSampleSufficientForRank: false,
      rankNote: 'Cohort size threshold pending for verified percentile calculation.',
      sections: [],
      solutions: [],
      weakTopics: [],
    });
  });

  /**
   * POST /attempts/:id/submit
   * Authoritative submission & scoring
   */
  fastify.post('/attempts/:id/submit', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student authentication required.' } });
    }
    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string; type?: string; tokenVersion?: number }>(token);
    if (!decoded?.sub || (decoded.type && decoded.type !== 'student')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Valid student session required.' } });
    }
    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Student account is not active or has been suspended.' } });
    }

    const { id } = request.params as { id: string };
    const attempt = db.attempts.get(id);

    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    // Invariant F06: Ownership boundary check
    if (attempt.studentId !== student.id) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to submit this test attempt.' },
      });
    }

    if (attempt.status === 'SUBMITTED') {
      if (attempt.resultSnapshot) {
        return reply.send(attempt.resultSnapshot);
      }
      return reply.code(400).send({ success: false, error: { code: 'ALREADY_SUBMITTED', message: 'Test attempt was already submitted' } });
    }

    const body = request.body as { answers?: { questionId: string; selectedOptionId: string | null }[]; timeSpentSeconds?: number };
    const submittedAnswers = body.answers || [];

    // Merge submitted answers into attempt answers map if provided
    for (const ans of submittedAnswers) {
      if (!attempt.answers.has(ans.questionId) || ans.selectedOptionId !== null) {
        attempt.answers.set(ans.questionId, {
          selectedOptionId: ans.selectedOptionId,
          clientSequence: 999999,
          isMarkedForReview: false,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const test = db.tests.get(attempt.testId);
    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;

    const sectionBreakdown: {
      sectionId: string;
      sectionName: string;
      totalQuestions: number;
      attemptedQuestions: number;
      correctCount: number;
      incorrectCount: number;
      unattemptedCount: number;
      marksObtained: number;
      maxMarks: number;
      accuracyPercentage: number;
      timeSpentSeconds: number;
    }[] = [];

    const solutions: any[] = [];
    const weakTopicCounts: Record<string, { topicName: string; incorrectCount: number }> = {};

    if (test) {
      for (const sec of test.sections) {
        let secScore = 0;
        let secMax = 0;
        let secCorrect = 0;
        let secWrong = 0;
        let secUnattempted = 0;
        let secAttempted = 0;

        for (const sq of sec.questions) {
          secMax += sq.positiveMarks;
          const q = db.questions.get(sq.questionId);
          const saved = attempt.answers.get(sq.questionId);
          const selectedOptionId = saved?.selectedOptionId || null;
          const en = q?.translations?.find((t) => t.language === 'en') || q?.translations?.[0];

          if (!selectedOptionId) {
            unattemptedCount++;
            secUnattempted++;
            solutions.push({
              questionId: sq.questionId,
              correctOptionId: q?.correctOptionId || '',
              userSelectedOptionId: null,
              isCorrect: false,
              marksAwarded: 0,
              explanation: en?.explanation || en?.text || 'Standard solution explanation.',
              explanationImageUrl: (q as any)?.explanationImageUrl,
              topicName: q?.topicId || 'General',
              subjectName: (q as any)?.subjectId || q?.topicId || 'General',
            });
          } else {
            secAttempted++;
            const isCorrect = !!(q && selectedOptionId === q.correctOptionId);
            if (isCorrect) {
              totalScore += sq.positiveMarks;
              secScore += sq.positiveMarks;
              correctCount++;
              secCorrect++;
              solutions.push({
                questionId: sq.questionId,
                correctOptionId: q?.correctOptionId || '',
                userSelectedOptionId: selectedOptionId,
                isCorrect: true,
                marksAwarded: sq.positiveMarks,
                explanation: en?.explanation || en?.text || 'Standard solution explanation.',
                explanationImageUrl: (q as any)?.explanationImageUrl,
                topicName: q?.topicId || 'General',
                subjectName: (q as any)?.subjectId || q?.topicId || 'General',
              });
            } else {
              totalScore -= sq.negativeMarks;
              secScore -= sq.negativeMarks;
              wrongCount++;
              secWrong++;
              solutions.push({
                questionId: sq.questionId,
                correctOptionId: q?.correctOptionId || '',
                userSelectedOptionId: selectedOptionId,
                isCorrect: false,
                marksAwarded: -sq.negativeMarks,
                explanation: en?.explanation || en?.text || 'Standard solution explanation.',
                explanationImageUrl: (q as any)?.explanationImageUrl,
                topicName: q?.topicId || 'General',
                subjectName: (q as any)?.subjectId || q?.topicId || 'General',
              });

              if (q?.topicId) {
                if (!weakTopicCounts[q.topicId]) {
                  weakTopicCounts[q.topicId] = { topicName: q.topicId, incorrectCount: 0 };
                }
                weakTopicCounts[q.topicId].incorrectCount++;
              }
            }
          }
        }

        const secAccuracy = secAttempted > 0 ? Number(((secCorrect / secAttempted) * 100).toFixed(1)) : 0;
        sectionBreakdown.push({
          sectionId: sec.id,
          sectionName: sec.title,
          totalQuestions: sec.questions.length,
          attemptedQuestions: secAttempted,
          correctCount: secCorrect,
          incorrectCount: secWrong,
          unattemptedCount: secUnattempted,
          marksObtained: Math.max(0, Number(secScore.toFixed(2))),
          maxMarks: secMax,
          accuracyPercentage: secAccuracy,
          timeSpentSeconds: Math.round((body.timeSpentSeconds || 1800) / (test.sections.length || 1)),
        });
      }
    }

    const attemptedTotal = correctCount + wrongCount;
    const accuracy = attemptedTotal > 0 ? Number(((correctCount / attemptedTotal) * 100).toFixed(1)) : 0;

    const submittedAt = new Date().toISOString();
    attempt.status = 'SUBMITTED';
    attempt.submittedAt = submittedAt;
    attempt.score = Math.max(0, Number(totalScore.toFixed(2)));
    attempt.accuracy = accuracy;
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.unattemptedCount = unattemptedCount;

    const weakTopics = Object.values(weakTopicCounts).map((w) => ({
      topicId: w.topicName,
      topicName: w.topicName,
      incorrectCount: w.incorrectCount,
    }));

    const resultSnapshot = {
      attemptId: attempt.id,
      testId: attempt.testId,
      testTitle: test?.title || 'Mock Test',
      examTitle: test?.examCode || 'Exam',
      submittedAt,
      totalScore: attempt.score,
      score: attempt.score,
      maxMarks: attempt.maxScore,
      maxScore: attempt.maxScore,
      overallAccuracy: attempt.accuracy,
      accuracy: attempt.accuracy,
      totalTimeSpentSeconds: body.timeSpentSeconds || 1800,
      timeSpentSeconds: body.timeSpentSeconds || 1800,
      totalQuestions: test?.totalQuestions || (correctCount + wrongCount + unattemptedCount),
      correctCount,
      incorrectCount: wrongCount,
      wrongCount,
      unattemptedCount,
      percentile: null,
      rank: null,
      totalTestTakers: null,
      isSampleSufficientForRank: false,
      rankNote: 'Cohort size threshold pending for verified percentile calculation.',
      sections: sectionBreakdown,
      solutions,
      weakTopics,
    };

    attempt.resultSnapshot = resultSnapshot;
    await db.attempts.set(attempt.id, attempt);

    return reply.send(resultSnapshot);
  });

  /**
   * POST /sync/answers
   * Monotonic offline answer synchronization with deadline enforcement (F14, F23)
   */
  fastify.post('/sync/answers', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student authentication required.' } });
    }
    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string; type?: string; tokenVersion?: number }>(token);
    if (!decoded?.sub || (decoded.type && decoded.type !== 'student')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Valid student session required.' } });
    }
    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Student account is not active or has been suspended.' } });
    }

    const parse = OfflineSyncBatchSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_SYNC_PAYLOAD', details: parse.error.format() } });
    }

    const { attemptId } = parse.data;
    const rawAnswers = (parse.data as any).answers || (parse.data as any).items || [];
    const attempt = db.attempts.get(attemptId);

    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Attempt not found' } });
    }

    // Invariant F06: Ownership boundary check
    if (attempt.studentId !== student.id) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to sync answers for this test attempt.' },
      });
    }

    // F14: Authoritative deadline check (with 60-second grace period for latency)
    const now = Date.now();
    if (attempt.status === 'SUBMITTED') {
      return reply.code(400).send({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Test attempt was already submitted.' },
      });
    }

    if (attempt.status === 'EXPIRED') {
      return reply.code(400).send({
        success: false,
        error: { code: 'ATTEMPT_EXPIRED', message: 'Test time limit has expired.' },
      });
    }

    if (attempt.expiresAt && now > new Date(attempt.expiresAt).getTime() + 60000) {
      attempt.status = 'EXPIRED';
      await db.attempts.set(attempt.id, attempt);
      return reply.code(400).send({
        success: false,
        error: { code: 'ATTEMPT_EXPIRED', message: 'Test time limit has expired.' },
      });
    }

    const syncedQuestionIds: string[] = [];
    const acknowledgedSequences: Array<{ questionId: string; clientSequence: number }> = [];
    let syncedCount = 0;

    for (const item of rawAnswers) {
      const qId = item.questionId;
      const existing = attempt.answers.get(qId);
      const clientSeq = item.clientSequence ?? 0;

      // Ensure monotonic client sequences (F23)
      if (!existing || clientSeq >= (existing.clientSequence ?? 0)) {
        attempt.answers.set(qId, {
          selectedOptionId: item.selectedOptionId,
          clientSequence: clientSeq,
          isMarkedForReview: item.isMarkedForReview ?? false,
          timestamp: item.clientTimestamp || item.timestamp || new Date().toISOString(),
        });
        syncedQuestionIds.push(qId);
        acknowledgedSequences.push({ questionId: qId, clientSequence: clientSeq });
        syncedCount++;
      }
    }

    await db.attempts.set(attempt.id, attempt);

    const remainingSeconds = attempt.expiresAt
      ? Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000))
      : 0;

    return reply.send({
      success: true,
      syncedCount,
      syncedQuestionIds,
      acknowledgedSequences,
      serverTime: new Date().toISOString(),
      remainingSeconds,
      pendingSequence: 0,
    });
  });
};
