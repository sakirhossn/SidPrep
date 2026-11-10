import type { FastifyPluginAsync } from 'fastify';
import { db, ExamProposalRecord } from '../../db/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';

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
  fastify.post('/admin/exams/patterns/:id/propose', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'EXAM_EDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;

    const { id } = request.params as { id: string };
    const exam = db.exams.get(id);
    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    const body = request.body as any;
    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const proposal: ExamProposalRecord = {
      id: proposalId,
      proposalId,
      examId: id,
      proposedByAdminId: admin.sub,
      proposedByEmail: admin.email,
      diff: body,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await db.examProposals.set(proposalId, proposal);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_PATTERN',
      action: 'PROPOSE_UPDATE',
      targetId: id,
      changesDiff: { proposalId, ...body },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      proposalId,
      message: 'Pattern update proposed. Pending verification by a second administrator.',
      pendingApprovalByOtherAdmin: true,
      proposedBy: admin.email,
    });
  });

  /**
   * GET /admin/exams/proposals
   * List exam proposals for review console (F18)
   */
  fastify.get('/admin/exams/proposals', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'EXAM_EDITOR', 'REVIEWER', 'SUPPORT'])] }, async (request, reply) => {
    const { examId, status } = request.query as { examId?: string; status?: string };
    let proposals = Array.from(db.examProposals.values());
    if (examId) proposals = proposals.filter((p) => p.examId === examId);
    if (status) proposals = proposals.filter((p) => p.status === status);
    proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reply.send(proposals);
  });

  /**
   * POST /admin/exams/patterns/:id/verify
   * Dual-Admin Verification: Enforces that the approver is NOT the creator (F18)
   */
  fastify.post('/admin/exams/patterns/:id/verify', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'EXAM_EDITOR', 'REVIEWER'])] }, async (request, reply) => {
    const admin = request.admin!;

    const { id } = request.params as { id: string };
    const { proposalId, approved, reviewNotes } = (request.body as any) || {};

    // Look up real proposal record persisted server-side
    const proposal = proposalId
      ? db.examProposals.get(proposalId)
      : db.getPendingExamProposal(id);

    if (!proposal) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NO_PENDING_PROPOSAL', message: 'No pending proposal found for this exam.' },
      });
    }

    if (proposal.status !== 'PENDING') {
      return reply.code(400).send({
        success: false,
        error: { code: 'PROPOSAL_ALREADY_REVIEWED', message: `Proposal has already been ${proposal.status.toLowerCase()}.` },
      });
    }

    // Dual-admin invariant check: author cannot approve own proposal
    if (admin.sub === proposal.proposedByAdminId) {
      db.logOperational({
        service: 'ADMIN_GOVERNANCE',
        level: 'WARN',
        message: `Admin ${admin.email} attempted to self-approve exam pattern update`,
        meta: { examId: id, proposalId: proposal.proposalId },
      });
      return reply.code(400).send({
        success: false,
        error: {
          code: 'DUAL_APPROVAL_VIOLATION',
          message: 'Dual-admin verification failure: The creator cannot approve their own pattern change.',
        },
      });
    }

    proposal.status = approved ? 'APPROVED' : 'REJECTED';
    proposal.verifiedByAdminId = admin.sub;
    proposal.verifiedAt = new Date().toISOString();
    if (reviewNotes) {
      (proposal as any).reviewNotes = reviewNotes;
    }
    await db.examProposals.set(proposal.proposalId, proposal);

    if (approved) {
      const exam = db.exams.get(id) || Array.from(db.exams.values()).find((e) => e.code.toLowerCase() === id.toLowerCase());
      if (exam && proposal.diff) {
        if (proposal.diff.stages) exam.stages = proposal.diff.stages;
        if (proposal.diff.stagesCount) exam.stagesCount = proposal.diff.stagesCount;
        if (proposal.diff.description) exam.description = proposal.diff.description;
        if (proposal.diff.name) exam.name = proposal.diff.name;
        exam.version = ((exam as any).version || 1) + 1;
        exam.verifiedDate = new Date().toISOString().split('T')[0];
        (exam as any).lastVerifiedBy = admin.email;
        await db.exams.set(exam.id, exam);
      }
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_PATTERN',
      action: approved ? 'VERIFY_APPROVE' : 'VERIFY_REJECT',
      targetId: id,
      changesDiff: { proposalId: proposal.proposalId, approved, verifiedBy: admin.email },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      proposalId: proposal.proposalId,
      verified: approved,
      approvedBy: admin.email,
    });
  });
};
