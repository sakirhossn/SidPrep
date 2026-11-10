import type { FastifyPluginAsync } from 'fastify';
import { db, ExamProposalRecord } from '../../db/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';

export const examRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /exams
   * List all verified exam families and stages
   */
  fastify.get('/exams', async (request, reply) => {
    const { family, includeInactive } = request.query as { family?: string; includeInactive?: string };
    let exams = Array.from(db.exams.values());

    if (includeInactive !== 'true') {
      exams = exams.filter((e) => e.isActive !== false);
    }

    if (family) {
      exams = exams.filter((e) => (e.bodyCode || e.body || '').toUpperCase() === family.toUpperCase());
    }

    const summaries = exams.map((e) => {
      const testsCount = Array.from(db.tests.values()).filter((t) => t.examCode === e.code).length;
      const isDateAnnounced = Boolean(e.isDateAnnounced);
      const currentStatus = e.currentStatus || (isDateAnnounced ? 'EXAM_SCHEDULED' : 'DATE_NOT_ANNOUNCED');
      const officialExamDate = isDateAnnounced ? (e.officialExamDate || e.verifiedDate || null) : null;
      const title = e.title || e.name;
      const body = (e.body || e.bodyCode || 'SSC') as any;

      return {
        id: e.id,
        body,
        family: body,
        name: title,
        title,
        code: e.code,
        description: e.description,
        currentStatus,
        officialExamDate,
        isDateAnnounced,
        verificationSourceUrl: e.sourceUrl || null,
        sourceUrl: e.sourceUrl || null,
        lastVerifiedAt: e.verifiedDate || null,
        verifiedDate: e.verifiedDate || null,
        stagesCount: e.stagesCount || 1,
        availableTestsCount: testsCount,
        isActive: e.isActive !== false,
      };
    });

    return reply.send(summaries);
  });

  /**
   * GET /exams/:id
   * Get complete verified exam details and syllabus
   */
  fastify.get('/exams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exam = db.exams.get(id) || Array.from(db.exams.values()).find((e) => e.code.toLowerCase() === id.toLowerCase() || e.id === id);

    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    const testsCount = Array.from(db.tests.values()).filter((t) => t.examCode === exam.code).length;
    const isDateAnnounced = Boolean(exam.isDateAnnounced);
    const currentStatus = exam.currentStatus || (isDateAnnounced ? 'EXAM_SCHEDULED' : 'DATE_NOT_ANNOUNCED');
    const officialExamDate = isDateAnnounced ? (exam.officialExamDate || exam.verifiedDate || null) : null;
    const title = exam.title || exam.name;
    const body = (exam.body || exam.bodyCode || 'SSC') as any;

    return reply.send({
      id: exam.id,
      body,
      family: body,
      code: exam.code,
      title,
      name: title,
      description: exam.description,
      currentStatus,
      officialExamDate,
      isDateAnnounced,
      verificationSourceUrl: exam.sourceUrl || null,
      sourceUrl: exam.sourceUrl || null,
      lastVerifiedAt: exam.verifiedDate || null,
      verifiedDate: exam.verifiedDate || null,
      stagesCount: exam.stagesCount || (exam.stages ? exam.stages.length : 1),
      availableTestsCount: testsCount,
      stages: exam.stages || [],
      syllabusTree: exam.syllabusTree || [],
      latestNotices: (exam as any).latestNotices || [],
      isActive: exam.isActive !== false,
    });
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

  /**
   * GET /admin/exams
   * List all exams in the catalogue including inactive
   */
  fastify.get('/admin/exams', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR', 'REVIEWER', 'SUPPORT'])] }, async (request, reply) => {
    let exams = Array.from(db.exams.values());
    exams.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return reply.send({
      items: exams.map((e) => ({
        ...e,
        name: e.name || e.title,
        title: e.title || e.name,
        status: e.isActive !== false ? 'ACTIVE' : 'INACTIVE',
      })),
      total: exams.length,
    });
  });

  /**
   * POST /admin/exams
   * Create a new exam entry in catalogue
   */
  fastify.post('/admin/exams', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;
    const body = request.body as any;

    if (!body.name || !body.code || !body.body) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Exam name, code, and conducting body are required.' },
      });
    }

    const id = body.id ? body.id.toLowerCase().trim() : body.code.toLowerCase().replace(/_/g, '-').trim();

    if (db.exams.has(id)) {
      return reply.code(409).send({
        success: false,
        error: { code: 'EXAM_ALREADY_EXISTS', message: `Exam with ID '${id}' already exists.` },
      });
    }

    const codeUpper = body.code.toUpperCase().trim();
    const existingWithCode = Array.from(db.exams.values()).find((e) => e.code?.toUpperCase() === codeUpper);
    if (existingWithCode) {
      return reply.code(409).send({
        success: false,
        error: { code: 'EXAM_ALREADY_EXISTS', message: `Exam with code '${body.code}' already exists.` },
      });
    }

    const isDateAnnounced = Boolean(body.isDateAnnounced);
    const newExam: any = {
      id,
      bodyCode: body.body.toUpperCase(),
      body: body.body.toUpperCase(),
      code: body.code.toUpperCase(),
      name: body.name.trim(),
      title: body.name.trim(),
      description: body.description?.trim() || '',
      stagesCount: Number(body.stagesCount) || 1,
      verifiedDate: new Date().toISOString().split('T')[0],
      sourceUrl: body.sourceUrl || '',
      stages: body.stages || [
        { id: `${id}-stage-1`, name: 'Tier 1 / Preliminary', stageNumber: 1, durationMinutes: 60, totalMarks: 200, negativeMarkRatio: 0.25, sectionLock: false }
      ],
      syllabusTree: body.syllabusTree || [],
      isActive: body.isActive !== false,
      isDateAnnounced,
      officialExamDate: isDateAnnounced ? (body.officialExamDate || null) : null,
      currentStatus: body.currentStatus || (isDateAnnounced ? 'EXAM_SCHEDULED' : 'DATE_NOT_ANNOUNCED'),
      displayOrder: Number(body.displayOrder) || (Array.from(db.exams.values()).length + 1),
    };

    await db.exams.set(id, newExam);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_CATALOGUE',
      action: 'CREATE_EXAM',
      targetId: id,
      changesDiff: { name: newExam.name, code: newExam.code, body: newExam.body },
      ipAddress: request.ip,
    });

    return reply.code(201).send(newExam);
  });

  /**
   * PUT /admin/exams/:id
   * Update exam details (non-pattern changes)
   */
  fastify.put('/admin/exams/:id', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };
    const exam = db.exams.get(id);

    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    const body = request.body as any;
    if (body.name) {
      exam.name = body.name.trim();
      exam.title = body.name.trim();
    }
    if (body.description !== undefined) exam.description = body.description.trim();
    if (body.body) {
      exam.body = body.body.toUpperCase();
      exam.bodyCode = body.body.toUpperCase();
    }
    if (body.sourceUrl !== undefined) exam.sourceUrl = body.sourceUrl;
    if (body.isDateAnnounced !== undefined) {
      exam.isDateAnnounced = Boolean(body.isDateAnnounced);
      if (exam.isDateAnnounced) {
        if (body.officialExamDate) exam.officialExamDate = body.officialExamDate;
        exam.currentStatus = 'EXAM_SCHEDULED';
      } else {
        exam.officialExamDate = null;
        exam.currentStatus = 'DATE_NOT_ANNOUNCED';
      }
    }
    if (body.currentStatus) exam.currentStatus = body.currentStatus;
    if (body.displayOrder !== undefined) exam.displayOrder = Number(body.displayOrder);

    await db.exams.set(id, exam);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_CATALOGUE',
      action: 'UPDATE_EXAM',
      targetId: id,
      changesDiff: body,
      ipAddress: request.ip,
    });

    return reply.send(exam);
  });

  /**
   * PATCH /admin/exams/:id/status
   * Activate or deactivate an exam
   */
  fastify.patch('/admin/exams/:id/status', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };
    const exam = db.exams.get(id);

    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Exam not found' } });
    }

    const { isActive } = request.body as { isActive: boolean };
    exam.isActive = Boolean(isActive);
    await db.exams.set(id, exam);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_CATALOGUE',
      action: exam.isActive ? 'ACTIVATE_EXAM' : 'DEACTIVATE_EXAM',
      targetId: id,
      changesDiff: { isActive: exam.isActive },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      id: exam.id,
      isActive: exam.isActive,
      message: `Exam ${exam.name} has been ${exam.isActive ? 'activated' : 'deactivated'}.`,
    });
  });

  /**
   * PUT /admin/exams/order
   * Reorder exams in catalogue
   */
  fastify.put('/admin/exams/order', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { examIds } = request.body as { examIds: string[] };

    if (!Array.isArray(examIds)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'examIds array is required' },
      });
    }

    for (let i = 0; i < examIds.length; i++) {
      const exam = db.exams.get(examIds[i]!);
      if (exam) {
        exam.displayOrder = i + 1;
        await db.exams.set(exam.id, exam);
      }
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'EXAM_CATALOGUE',
      action: 'REORDER_EXAMS',
      targetId: 'catalogue',
      changesDiff: { examIds },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: 'Catalogue order updated successfully.',
    });
  });
};
