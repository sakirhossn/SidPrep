import type { FastifyPluginAsync } from 'fastify';
import { db, TestRecord } from '../../db/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';

export const adminTestRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/tests
   * List all mock test blueprints with draft & published state
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR, REVIEWER, AUDITOR
   */
  fastify.get(
    '/admin/tests',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR', 'REVIEWER', 'AUDITOR'])] },
    async (request, reply) => {
      const { examCode, status, query: searchQuery } = request.query as {
        examCode?: string;
        status?: string;
        query?: string;
      };

      let tests = Array.from(db.tests.values());

      if (examCode && examCode !== 'ALL') {
        tests = tests.filter((t) => t.examCode.toLowerCase() === examCode.toLowerCase());
      }

      if (status && status !== 'ALL') {
        if (status === 'PUBLISHED') {
          tests = tests.filter((t) => t.isPublished);
        } else if (status === 'DRAFT') {
          tests = tests.filter((t) => !t.isPublished);
        }
      }

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        tests = tests.filter(
          (t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        );
      }

      return reply.send({
        success: true,
        data: tests,
        total: tests.length,
      });
    }
  );

  /**
   * GET /admin/tests/:id
   * Get single test blueprint detail
   */
  fastify.get(
    '/admin/tests/:id',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const test = db.tests.get(id);

      if (!test) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test blueprint not found.' },
        });
      }

      return reply.send({
        success: true,
        data: test,
      });
    }
  );

  /**
   * POST /admin/tests
   * Create a new mock test blueprint
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR
   */
  fastify.post(
    '/admin/tests',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as any;

      if (!body.title || body.title.trim().length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Test blueprint title is required.' },
        });
      }

      if (!body.examCode) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Target exam code is required.' },
        });
      }

      const durationMinutes = Number(body.durationMinutes) || 60;
      if (durationMinutes <= 0 || durationMinutes > 360) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Duration must be between 1 and 360 minutes.' },
        });
      }

      const testId = body.id || `test_${body.examCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

      // Check if test ID already exists
      if (db.tests.has(testId)) {
        return reply.code(409).send({
          success: false,
          error: { code: 'DUPLICATE_ID', message: 'A test with this ID already exists.' },
        });
      }

      const sections = Array.isArray(body.sections) ? body.sections : [];
      let totalQuestions = Number(body.totalQuestions) || 0;
      if (sections.length > 0 && totalQuestions === 0) {
        totalQuestions = sections.reduce(
          (acc: number, s: any) => acc + (s.questions?.length || s.questionCount || 0),
          0
        );
      }

      const totalMarks = Number(body.totalMarks) || 100;

      const newTest: TestRecord = {
        id: testId,
        examCode: body.examCode.toUpperCase(),
        title: body.title.trim(),
        type: (body.type as any) || 'FULL',
        durationMinutes,
        totalQuestions,
        totalMarks,
        isFree: body.isFree !== undefined ? Boolean(body.isFree) : true,
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : false,
        instructions: Array.isArray(body.instructions) ? body.instructions : [
          'All questions are compulsory.',
          'Marking scheme is as per latest official syllabus pattern.',
          'No external aids or electronic devices permitted.',
        ],
        sections: sections.length > 0 ? sections : [
          {
            id: `sec_${Date.now()}_1`,
            title: 'General Section',
            questionCount: totalQuestions,
            durationMinutes,
            sectionLock: false,
            questions: [],
          },
        ],
      };

      await db.tests.set(testId, newTest);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TEST_BUILDER',
        action: 'CREATE_TEST_BLUEPRINT',
        targetId: testId,
        changesDiff: { title: newTest.title, examCode: newTest.examCode, totalQuestions, totalMarks },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        message: 'Test blueprint created successfully.',
        data: newTest,
      });
    }
  );

  /**
   * PUT /admin/tests/:id
   * Update an existing mock test blueprint
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR
   */
  fastify.put(
    '/admin/tests/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const existing = db.tests.get(id);
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test blueprint not found.' },
        });
      }

      if (body.title !== undefined && body.title.trim().length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title cannot be empty.' },
        });
      }

      const updatedTest: TestRecord = {
        ...existing,
        title: body.title !== undefined ? body.title.trim() : existing.title,
        examCode: body.examCode !== undefined ? body.examCode.toUpperCase() : existing.examCode,
        type: body.type !== undefined ? body.type : existing.type,
        durationMinutes: body.durationMinutes !== undefined ? Number(body.durationMinutes) : existing.durationMinutes,
        totalQuestions: body.totalQuestions !== undefined ? Number(body.totalQuestions) : existing.totalQuestions,
        totalMarks: body.totalMarks !== undefined ? Number(body.totalMarks) : existing.totalMarks,
        isFree: body.isFree !== undefined ? Boolean(body.isFree) : existing.isFree,
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : existing.isPublished,
        instructions: body.instructions !== undefined ? body.instructions : existing.instructions,
        sections: body.sections !== undefined ? body.sections : existing.sections,
      };

      await db.tests.set(id, updatedTest);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TEST_BUILDER',
        action: 'UPDATE_TEST_BLUEPRINT',
        targetId: id,
        changesDiff: { title: updatedTest.title, isPublished: updatedTest.isPublished },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Test blueprint updated successfully.',
        data: updatedTest,
      });
    }
  );

  /**
   * PATCH /admin/tests/:id/publish
   * Publish or unpublish a test blueprint
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, REVIEWER
   */
  fastify.patch(
    '/admin/tests/:id/publish',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'REVIEWER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const { isPublished } = request.body as { isPublished?: boolean };

      const existing = db.tests.get(id);
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test blueprint not found.' },
        });
      }

      const targetStatus = isPublished !== undefined ? Boolean(isPublished) : !existing.isPublished;
      existing.isPublished = targetStatus;
      await db.tests.set(id, existing);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TEST_BUILDER',
        action: targetStatus ? 'PUBLISH_TEST' : 'UNPUBLISH_TEST',
        targetId: id,
        changesDiff: { isPublished: targetStatus },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `Test ${targetStatus ? 'published' : 'unpublished'} successfully.`,
        data: existing,
      });
    }
  );

  /**
   * POST /admin/tests/:id/duplicate
   * Clone a blueprint into a new DRAFT test
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR
   */
  fastify.post(
    '/admin/tests/:id/duplicate',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };

      const existing = db.tests.get(id);
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test blueprint not found.' },
        });
      }

      const duplicateId = `test_${existing.examCode.toLowerCase()}_copy_${Date.now()}`;
      const duplicateTest: TestRecord = {
        ...JSON.parse(JSON.stringify(existing)),
        id: duplicateId,
        title: `${existing.title} (Draft Copy)`,
        isPublished: false,
      };

      await db.tests.set(duplicateId, duplicateTest);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TEST_BUILDER',
        action: 'DUPLICATE_TEST_BLUEPRINT',
        targetId: duplicateId,
        changesDiff: { originalId: id, newId: duplicateId },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        message: 'Test blueprint duplicated into draft.',
        data: duplicateTest,
      });
    }
  );

  /**
   * DELETE /admin/tests/:id
   * Delete test blueprint
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.delete(
    '/admin/tests/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };

      const existing = db.tests.get(id);
      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test blueprint not found.' },
        });
      }

      await db.tests.delete(id);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TEST_BUILDER',
        action: 'DELETE_TEST_BLUEPRINT',
        targetId: id,
        changesDiff: { deletedTitle: existing.title },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Test blueprint deleted successfully.',
      });
    }
  );
};
