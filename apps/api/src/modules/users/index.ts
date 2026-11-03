import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { verifyJwt } from '../../lib/security.js';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /me
   * Get current student profile
   */
  fastify.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student token required' } });
    }

    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string }>(token);
    if (!decoded?.sub) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token invalid' } });
    }

    const student = db.students.get(decoded.sub);
    if (!student) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found' } });
    }

    return reply.send(student);
  });

  /**
   * PATCH /me
   * Update student profile preferences
   */
  fastify.patch('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Student token required' } });
    }

    const token = authHeader.substring(7);
    const decoded = verifyJwt<{ sub: string }>(token);
    if (!decoded?.sub) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token invalid' } });
    }

    const student = db.students.get(decoded.sub);
    if (!student) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Student profile not found' } });
    }

    const { preferredLanguage, targetExams, dailyGoalMinutes } = request.body as any;

    if (preferredLanguage) student.preferredLanguage = preferredLanguage;
    if (Array.isArray(targetExams)) student.targetExams = targetExams;
    if (typeof dailyGoalMinutes === 'number') student.dailyGoalMinutes = dailyGoalMinutes;

    return reply.send(student);
  });

  /**
   * GET /home
   * Student home dashboard
   */
  fastify.get('/home', async (request, reply) => {
    const sscExam = Array.from(db.exams.values()).find((e) => e.code.includes('CGL')) || Array.from(db.exams.values())[0];
    const recommended = Array.from(db.tests.values()).slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      examTitle: t.examCode,
      durationMinutes: t.durationMinutes,
      questionsCount: t.totalQuestions,
      type: t.type === 'FULL' ? 'FULL_LENGTH' : t.type === 'PYQ' ? 'PYQ' : 'SECTIONAL',
    }));

    return reply.send({
      primaryExam: sscExam ? {
        id: sscExam.id,
        body: sscExam.bodyCode,
        code: sscExam.code,
        title: sscExam.name,
        description: sscExam.description,
        currentStatus: 'EXAM_SCHEDULED',
        officialExamDate: '2026-09-12T09:00:00Z',
        isDateAnnounced: true,
        verificationSourceUrl: sscExam.sourceUrl,
        lastVerifiedAt: sscExam.verifiedDate,
        stagesCount: sscExam.stagesCount,
        availableTestsCount: 24,
      } : null,
      selectedExams: [],
      dailyGoal: {
        targetMinutes: 60,
        completedMinutes: 35,
        streakDays: 4,
        accuracyRate: 78.5,
      },
      activeAttempt: null,
      todayTasksSummary: {
        totalTasks: 4,
        completedTasks: 2,
      },
      recommendedTests: recommended,
      dailyAffairsCount: Array.from(db.newsDrafts.values()).filter((d) => d.editorialStatus === 'PUBLISHED').length || 2,
    });
  });

  /**
   * GET /study-plan
   * Student daily study plan
   */
  fastify.get('/study-plan', async (request, reply) => {
    return reply.send({
      date: new Date().toISOString().split('T')[0],
      dayStreak: 4,
      targetMinutes: 60,
      completedMinutes: 35,
      missedTasksCount: 0,
      tasks: [
        {
          id: 'task-1',
          title: 'Quantitative Aptitude: Percentages & Successive Discount',
          description: 'Practice 25 high-yield Tier-I calculation questions with formula tricks',
          type: 'TOPIC_STUDY',
          estimatedMinutes: 30,
          isCompleted: true,
          completedAt: new Date().toISOString(),
          isMissed: false,
          subjectName: 'Quantitative Aptitude',
          topicName: 'Percentages',
          actionRoute: '/resources',
        },
        {
          id: 'task-2',
          title: 'Current Affairs Daily 5-Minute Quiz',
          description: 'Fact-checked questions based on today\'s PIB and RBI circulars',
          type: 'CURRENT_AFFAIRS_QUIZ',
          estimatedMinutes: 5,
          isCompleted: true,
          completedAt: new Date().toISOString(),
          isMissed: false,
          subjectName: 'General Awareness',
          actionRoute: '/(tabs)/affairs',
        },
        {
          id: 'task-3',
          title: 'SSC CGL General Intelligence & Reasoning Sectional Mock',
          description: '25 Questions • 50 Marks • Timed exam environment with -0.5 negative marking',
          type: 'SECTIONAL_MOCK',
          estimatedMinutes: 20,
          isCompleted: false,
          isMissed: false,
          subjectName: 'Reasoning',
          actionRoute: '/(tabs)/mocks',
        },
      ],
      weakTopicRecommendations: [
        {
          topicId: 'math_geom',
          topicName: 'Geometry & Triangles Congruency',
          reason: 'Accuracy was 52% in last 3 attempts (target: 80%)',
          suggestedAction: 'Review formula handbook properties of incentre & circumcentre',
        },
      ],
    });
  });

  /**
   * GET /admin/users
   * Admin Student Directory with masked PII and filters
   */
  fastify.get('/admin/users', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'SUPPORT', 'AUDITOR'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to student directory' } });
    }

    const { query, status, exam } = request.query as { query?: string; status?: string; exam?: string };

    let students = Array.from(db.students.values());

    if (status) {
      students = students.filter((s) => s.status === status);
    }

    if (exam) {
      students = students.filter((s) => s.targetExams.includes(exam));
    }

    if (query) {
      const q = query.toLowerCase();
      students = students.filter((s) => s.email.toLowerCase().includes(q));
    }

    // Return with masked PII unless SUPER_ADMIN explicitly requests full details
    const masked = students.map((s) => ({
      id: s.id,
      emailMasked: s.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      phoneMasked: s.phone ? s.phone.replace(/(\d{2})(\d+)(\d{2})/, '$1******$3') : 'Not linked',
      preferredLanguage: s.preferredLanguage,
      targetExams: s.targetExams,
      dailyGoalMinutes: s.dailyGoalMinutes,
      streakDays: s.streakDays,
      status: s.status,
      isEmailVerified: s.isEmailVerified,
      createdAt: s.createdAt,
    }));

    return reply.send(masked);
  });

  /**
   * POST /admin/users/:id/action
   * Admin actions on student account (disable, reactivate, revoke sessions) with mandatory audit reason
   */
  fastify.post('/admin/users/:id/action', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'SUPPORT'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const { id } = request.params as { id: string };
    const { action, reason } = request.body as { action: 'SUSPEND' | 'ACTIVATE' | 'REVOKE_SESSIONS' | 'DELETE_DATA'; reason: string };

    if (!reason || reason.trim().length < 5) {
      return reply.code(400).send({
        success: false,
        error: { code: 'REASON_REQUIRED', message: 'A verified administrative reason is mandatory for student account mutations.' },
      });
    }

    const student = db.students.get(id);
    if (!student) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Student account not found' } });
    }

    if (action === 'SUSPEND') student.status = 'SUSPENDED';
    if (action === 'ACTIVATE') student.status = 'ACTIVE';
    if (action === 'DELETE_DATA') {
      student.status = 'DELETED';
      student.email = `deleted_${student.id}@sidprep.invalid`;
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'STUDENT_USER',
      action: `USER_${action}`,
      targetId: id,
      changesDiff: { action, reason },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: `Account action ${action} executed successfully.`,
      status: student.status,
    });
  });
};
