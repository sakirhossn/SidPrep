import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { verifyJwt } from '../../lib/security.js';

export const examRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /exams
   * List all verified exam families and stages
   */
  fastify.get('/exams', async (request, reply) => {
    const { family } = request.query as { family?: string };
    let exams = Array.from(db.exams.values());

    if (family) {
      exams = exams.filter((e) => e.bodyCode.toUpperCase() === family.toUpperCase());
    }

    const summaries = exams.map((e) => ({
      id: e.id,
      family: e.bodyCode,
      name: e.name,
      code: e.code,
      description: e.description,
      stagesCount: e.stagesCount,
      verifiedDate: e.verifiedDate,
      sourceUrl: e.sourceUrl,
    }));

    return reply.send(summaries);
  });

  /**
   * GET /exams/:id
   * Get complete verified exam details and syllabus
   */
  fastify.get('/exams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exam = db.exams.get(id) || Array.from(db.exams.values()).find((e) => e.code === id);

    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    return reply.send(exam);
  });

  /**
   * POST /admin/exams/patterns/:id/propose
   * Propose a pattern update (Step 1 of dual verification)
   */
  fastify.post('/admin/exams/patterns/:id/propose', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'EXAM_EDITOR'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient administrative privileges' } });
    }

    const { id } = request.params as { id: string };
    const exam = db.exams.get(id);
    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    const body = request.body as any;

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_PATTERN',
      action: 'PROPOSE_UPDATE',
      targetId: id,
      changesDiff: body,
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: 'Pattern update proposed. Pending verification by a second administrator.',
      pendingApprovalByOtherAdmin: true,
      proposedBy: admin.email,
    });
  });

  /**
   * POST /admin/exams/patterns/:id/verify
   * Dual-Admin Verification: Enforces that the approver is NOT the creator!
   */
  fastify.post('/admin/exams/patterns/:id/verify', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'EXAM_EDITOR', 'REVIEWER'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient privileges to verify pattern' } });
    }

    const { id } = request.params as { id: string };
    const { proposedByActorId, approved } = request.body as { proposedByActorId: string; approved: boolean };

    // Dual-admin invariant check
    if (admin.sub === proposedByActorId) {
      db.logOperational({
        service: 'ADMIN_GOVERNANCE',
        level: 'WARN',
        message: `Admin ${admin.email} attempted to self-approve exam pattern update`,
        meta: { examId: id },
      });
      return reply.code(400).send({
        success: false,
        error: {
          code: 'DUAL_APPROVAL_VIOLATION',
          message: 'Dual-admin verification failure: The creator cannot approve their own pattern change.',
        },
      });
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_PATTERN',
      action: approved ? 'VERIFY_APPROVE' : 'VERIFY_REJECT',
      targetId: id,
      changesDiff: { approved, verifiedBy: admin.email },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      verified: approved,
      approvedBy: admin.email,
    });
  });
};
