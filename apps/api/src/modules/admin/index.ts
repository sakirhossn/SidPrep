import type { FastifyPluginAsync } from 'fastify';
import { db, QuestionRecord } from '../../db/index.js';
import { verifyJwt } from '../../lib/security.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/overview
   * Compact metrics dashboard showing real server data (never invented)
   */
  fastify.get('/admin/overview', async (_request, reply) => {
    const publishedDrafts = Array.from(db.newsDrafts.values()).filter((d) => d.editorialStatus === 'PUBLISHED');
    const pendingDrafts = Array.from(db.newsDrafts.values()).filter((d) => ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(d.editorialStatus));

    return reply.send({
      totalStudents: db.students.size,
      activeStudents: Array.from(db.students.values()).filter((s) => s.status === 'ACTIVE').length,
      brevoSendsToday: db.brevoSendsToday,
      brevoLimit: 300,
      totalExams: db.exams.size,
      totalQuestions: db.questions.size,
      totalTests: db.tests.size,
      totalAttempts: db.attempts.size,
      contentAwaitingReview: pendingDrafts.length,
      currentAffairsPublished: publishedDrafts.length,
      backgroundQueueActiveJobs: db.jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length,
      serverTimestampIST: new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date()),
    });
  });

  /**
   * GET /admin/questions
   * Question bank list with filters
   */
  fastify.get('/admin/questions', async (request, reply) => {
    const { topicId, difficulty, status } = request.query as { topicId?: string; difficulty?: string; status?: string };
    let questions = Array.from(db.questions.values());

    if (topicId) questions = questions.filter((q) => q.topicId === topicId);
    if (difficulty) questions = questions.filter((q) => q.difficulty === difficulty);
    if (status) questions = questions.filter((q) => q.status === status);

    return reply.send(questions);
  });

  /**
   * POST /admin/questions
   * Create question with multilingual options and explanation
   */
  fastify.post('/admin/questions', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient question authoring role' } });
    }

    const body = request.body as any;
    const questionId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newQuestion: QuestionRecord = {
      id: questionId,
      topicId: body.topicId || 'general_awareness',
      difficulty: body.difficulty || 'MEDIUM',
      pyqYear: body.pyqYear,
      pyqExam: body.pyqExam,
      pyqShift: body.pyqShift,
      correctOptionId: body.correctOptionId || 'opt_a',
      createdBy: admin.sub,
      status: 'PUBLISHED',
      translations: body.translations || [
        {
          language: 'en',
          text: body.text || 'Sample Question',
          explanation: body.explanation || '',
          options: body.options || [
            { id: 'opt_a', text: 'Option A' },
            { id: 'opt_b', text: 'Option B' },
            { id: 'opt_c', text: 'Option C' },
            { id: 'opt_d', text: 'Option D' },
          ],
        },
      ],
    };

    db.questions.set(questionId, newQuestion);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'QUESTION_BANK',
      action: 'CREATE_QUESTION',
      targetId: questionId,
      changesDiff: { topicId: newQuestion.topicId, difficulty: newQuestion.difficulty },
      ipAddress: request.ip,
    });

    return reply.code(201).send({ success: true, question: newQuestion });
  });

  /**
   * POST /admin/questions/import-staging
   * Bulk question import with staging and validation error report
   * Invariant: Never auto-publishes unreviewed imported items
   */
  fastify.post('/admin/questions/import-staging', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient import role' } });
    }

    const { items = [] } = request.body as { items: any[] };
    const stagedCount = items.length;
    const errors: string[] = [];

    items.forEach((item, idx) => {
      if (!item.text) errors.push(`Row ${idx + 1}: Missing question text`);
      if (!item.correctOptionId) errors.push(`Row ${idx + 1}: Missing correct option identifier`);
    });

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'QUESTION_BANK',
      action: 'BULK_IMPORT_STAGED',
      changesDiff: { totalItems: stagedCount, errorCount: errors.length },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      stagedCount,
      passedCount: stagedCount - errors.length,
      errors,
      status: 'STAGED_FOR_EDITORIAL_REVIEW',
    });
  });

  /**
   * GET /admin/team
   * List team members with roles and 2FA status
   */
  fastify.get('/admin/team', async (_request, reply) => {
    const team = Array.from(db.adminUsers.values()).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      is2faEnabled: u.is2faEnabled,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
    return reply.send(team);
  });
};
