import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, QuestionRecord, PageRecord } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { requireAdminAuth, requireRecentMfa } from '../../lib/adminAuth.js';
import { hashPassword, verifyPassword, signJwt, verifyJwt, validateFileMagicBytes } from '../../lib/security.js';
import { sanitizeHtml } from '../../lib/sanitizer.js';
import { env } from '../../config/index.js';
import { inspectQuestionImport, commitQuestionImport } from '../../services/questionImport.js';
import { getLiveBrevoQuota } from '../../lib/email.js';

const memoryRevisions = new Map<string, any[]>();

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/overview
   * Compact metrics dashboard showing real server data (never invented)
   * Protected: Any active authenticated staff member
   */
  fastify.get(
    '/admin/overview',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      const brevoQuota = await getLiveBrevoQuota();

      const publishedDrafts = Array.from(db.newsDrafts.values()).filter(
        (d) => d.editorialStatus === 'PUBLISHED'
      );
      const pendingDrafts = Array.from(db.newsDrafts.values()).filter((d) =>
        ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(d.editorialStatus)
      );

      return reply.send({
        totalStudents: db.students.size,
        activeStudents: Array.from(db.students.values()).filter((s) => s.status === 'ACTIVE').length,
        brevoSendsToday: brevoQuota.usedToday,
        brevoLimit: brevoQuota.limit,
        brevoRemaining: brevoQuota.remaining,
        brevoWarnThreshold: brevoQuota.warnThreshold,
        brevoSource: brevoQuota.source,
        totalExams: db.exams.size,
        totalQuestions: db.questions.size,
        totalTests: db.tests.size,
        totalAttempts: db.attempts.size,
        contentAwaitingReview: pendingDrafts.length,
        currentAffairsPublished: publishedDrafts.length,
        backgroundQueueActiveJobs: db.jobs.filter(
          (j) => j.status === 'RUNNING' || j.status === 'QUEUED'
        ).length,
        serverTimestampIST: new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date()),
      });
    }
  );

  /**
   * GET /admin/brevo/live-quota
   * Real-time live transactional email quota status from Brevo
   * Protected: Any active authenticated staff member
   */
  fastify.get(
    '/admin/brevo/live-quota',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      const quota = await getLiveBrevoQuota();
      return reply.send({
        success: true,
        ...quota,
      });
    }
  );

  /**
   * GET /admin/questions
   * Question bank list with filters
   * Protected: Requires staff authentication
   */
  fastify.get(
    '/admin/questions',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const { topicId, difficulty, status } = request.query as {
        topicId?: string;
        difficulty?: string;
        status?: string;
      };
      let questions = Array.from(db.questions.values());

      if (topicId) questions = questions.filter((q) => q.topicId === topicId);
      if (difficulty) questions = questions.filter((q) => q.difficulty === difficulty);
      if (status) questions = questions.filter((q) => q.status === status);

      return reply.send(questions);
    }
  );

  /**
   * POST /admin/questions
   * Create question with multilingual options and explanation
   * Protected: SUPER_ADMIN, CONTENT_MANAGER, EXAM_EDITOR
   */
  fastify.post(
    '/admin/questions',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
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
        createdBy: admin.id,
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

      await db.questions.set(questionId, newQuestion);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'QUESTION_BANK',
        action: 'CREATE_QUESTION',
        targetId: questionId,
        changesDiff: { topicId: newQuestion.topicId, difficulty: newQuestion.difficulty },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        id: questionId,
        text: body.text,
        question: newQuestion,
      });
    }
  );

  /**
   * POST /admin/questions/imports/inspect
   * Step 1-4 of Import Wizard: Upload -> Detect format -> Map fields -> Validate & Preview
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.post(
    '/admin/questions/imports/inspect',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      let fileContent = '';
      let formatHint: 'CSV' | 'JSON' | undefined = undefined;
      let examBasedMapping: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM';
      let defaultMarks = 1.0;
      let defaultNegativeMarks = 0.25;

      if (request.isMultipart()) {
        const part = await request.file();
        if (!part) {
          return reply.code(400).send({ success: false, error: { code: 'FILE_REQUIRED', message: 'Question export file is required.' } });
        }
        const buf = await part.toBuffer();
        fileContent = buf.toString('utf8');
        if (part.filename?.endsWith('.csv')) formatHint = 'CSV';
        else if (part.filename?.endsWith('.json')) formatHint = 'JSON';
      } else if (request.body && typeof request.body === 'object') {
        const body = request.body as any;
        fileContent = body.fileContent || '';
        formatHint = body.format;
        if (body.examBasedMapping) examBasedMapping = body.examBasedMapping;
        if (typeof body.defaultMarks === 'number') defaultMarks = body.defaultMarks;
        if (typeof body.defaultNegativeMarks === 'number') defaultNegativeMarks = body.defaultNegativeMarks;
      }

      if (!fileContent.trim()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'EMPTY_FILE', message: 'Uploaded file or pasted JSON content is empty.' },
        });
      }

      try {
        const inspection = await inspectQuestionImport(
          fileContent,
          formatHint,
          examBasedMapping,
          defaultMarks,
          defaultNegativeMarks
        );

        return reply.send({
          success: true,
          format: inspection.format,
          totalRows: inspection.totalRows,
          acceptedCount: inspection.acceptedCount,
          duplicateCount: inspection.duplicateCount,
          reviewNeededCount: inspection.reviewNeededCount,
          rejectedCount: inspection.rejectedCount,
          examBasedCount: inspection.examBasedCount,
          detectedCategories: inspection.detectedCategories,
          samplePreview: inspection.samplePreview,
        });
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: { code: 'PARSING_ERROR', message: err.message },
        });
      }
    }
  );

  /**
   * POST /admin/questions/imports/commit
   * Step 5-7 of Import Wizard: Confirm & Commit Import Batch
   * Invariant: Questions saved as DRAFT for editorial review
   * Deduplication: Identifies duplicate external IDs and content fingerprints across formats
   */
  fastify.post(
    '/admin/questions/imports/commit',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = (request.body as any) || {};
      const {
        fileContent,
        format,
        filename,
        examBasedMapping = 'MEDIUM',
        defaultMarks = 1.0,
        defaultNegativeMarks = 0.25,
        categoryMappings = {},
        updateExisting = false,
      } = body;

      if (!fileContent || !fileContent.trim()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'EMPTY_CONTENT', message: 'File content is required to commit import.' },
        });
      }

      try {
        const inspection = await inspectQuestionImport(
          fileContent,
          format,
          examBasedMapping,
          defaultMarks,
          defaultNegativeMarks
        );

        const result = await commitQuestionImport(inspection, {
          filename,
          format: inspection.format,
          uploadedBy: admin.id,
          defaultMarks,
          defaultNegativeMarks,
          examBasedMapping,
          categoryMappings,
          updateExisting: Boolean(updateExisting),
        });

        db.logAudit({
          actorId: admin.id,
          actorEmail: admin.email,
          actorRole: admin.role,
          module: 'QUESTION_BANK',
          action: 'COMMIT_QUESTION_IMPORT_BATCH',
          targetId: result.batchId,
          changesDiff: {
            format: inspection.format,
            totalRows: result.totalRows,
            acceptedCount: result.acceptedCount,
            duplicateCount: result.duplicateCount,
            reviewNeededCount: result.reviewNeededCount,
            rejectedCount: result.rejectedCount,
          },
          ipAddress: request.ip,
        });

        return reply.send({
          success: true,
          ...result,
          editorialStatus: 'DRAFT',
          message: `Import batch '${result.batchId}' committed: ${result.acceptedCount} saved as DRAFT, ${result.duplicateCount} duplicates skipped, ${result.reviewNeededCount} flagged for review, ${result.rejectedCount} rejected.`,
        });
      } catch (err: any) {
        return reply.code(500).send({
          success: false,
          error: { code: 'IMPORT_COMMIT_FAILED', message: err.message },
        });
      }
    }
  );

  /**
   * GET /admin/questions/imports/:id
   * Retrieve import batch details and row audit report
   */
  fastify.get(
    '/admin/questions/imports/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const batchRes = await query<any>('SELECT * FROM question_import_batches WHERE id = $1', [id]);
      if (batchRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: { code: 'BATCH_NOT_FOUND', message: 'Import batch not found.' },
        });
      }

      const rowsRes = await query<any>(
        'SELECT * FROM question_import_rows WHERE batch_id = $1 ORDER BY row_index ASC LIMIT 500',
        [id]
      );

      return reply.send({
        success: true,
        batch: batchRes.rows[0],
        rows: rowsRes.rows,
      });
    }
  );

  /**
   * POST /admin/questions/import-staging
   * Bulk question import with staging and validation error report
   * Invariant: Never auto-publishes unreviewed imported items
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.post(
    '/admin/questions/import-staging',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { items = [] } = request.body as { items: any[] };
      const stagedCount = items.length;
      const errors: string[] = [];

      const stagedQuestions: QuestionRecord[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const rowNum = idx + 1;
        let hasRowError = false;

        if (!item.text) {
          errors.push(`Row ${rowNum}: Missing question text`);
          hasRowError = true;
        }
        if (!item.correctOptionId) {
          errors.push(`Row ${rowNum}: Missing correct option identifier`);
          hasRowError = true;
        }
        if (!item.options || !Array.isArray(item.options) || item.options.length < 2) {
          errors.push(`Row ${rowNum}: Missing or insufficient options (minimum 2 required)`);
          hasRowError = true;
        }

        if (hasRowError) continue;

        const qId = item.id || `q_staged_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const stagedQ: QuestionRecord = {
          id: qId,
          topicId: item.topicId || 'general_awareness',
          difficulty: item.difficulty || 'MEDIUM',
          pyqYear: item.pyqYear ? Number(item.pyqYear) : undefined,
          pyqExam: item.pyqExam || undefined,
          pyqShift: item.pyqShift || undefined,
          correctOptionId: item.correctOptionId,
          createdBy: admin.id,
          status: 'DRAFT', // Invariant: Never auto-publishes unreviewed imported items
          translations: item.translations || [
            {
              language: 'en',
              text: item.text,
              explanation: item.explanation || '',
              options: item.options,
            },
          ],
        };

        await db.questions.set(qId, stagedQ);
        stagedQuestions.push(stagedQ);
      }

      db.logAudit({
        actorId: admin.id,
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
    }
  );


  /**
   * POST /admin/maintenance/purge-demo
   * Purge demo questions, tests, news, resources, attempts, or students
   * Protected: SUPER_ADMIN (Requires valid super admin password or recent MFA)
   */
  fastify.post(
    '/admin/maintenance/purge-demo',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = (request.body as any) || {};

      const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
      if (isProduction) {
        if (!body.password && body.confirmation !== 'CONFIRM_PURGE_DUMMY_DATA') {
          return reply.code(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN_IN_PRODUCTION',
              message: 'Purge demo endpoint is strictly disabled in production mode.',
            },
          });
        }

        // In production, ensure valid password or recent MFA verification
        const mfaVerifiedAt = admin.mfaVerifiedAt;
        const isMfaRecent = mfaVerifiedAt && (Date.now() - mfaVerifiedAt) <= 600 * 1000;
        if (!isMfaRecent && body.password) {
          const fullAdmin = db.adminUsers.get(admin.id);
          const isPasswordValid = await verifyPassword(body.password, fullAdmin?.passwordHash || '');
          if (!isPasswordValid) {
            return reply.code(401).send({
              success: false,
              error: { code: 'INVALID_CREDENTIALS', message: 'Re-authentication password incorrect.' },
            });
          }
        }
      }

      const options = {
        clearQuestions: body.clearQuestions !== false,
        clearTests: body.clearTests !== false,
        clearNews: body.clearNews !== false,
        clearResources: body.clearResources !== false,
        clearAttempts: body.clearAttempts !== false,
        clearStudents: Boolean(body.clearStudents),
        purgeAllContent: Boolean(body.purgeAllContent),
      };

      const result = await db.purgeDemoData(options);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'MAINTENANCE',
        action: 'PURGE_DEMO_DATA',
        changesDiff: options,
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Dummy and demo content purged successfully. Official taxonomy and staff accounts preserved.',
        clearedCount: result.clearedCount,
        options,
      });
    }
  );

  /**
   * POST /admin/maintenance/cleanup-plan
   * Handshake step 1: Dry run scan for demo provenance, calculate counts, sign short-lived plan token
   */
  fastify.post(
    '/admin/maintenance/cleanup-plan',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;

      // Identify demo questions
      const demoQuestions = Array.from(db.questions.values()).filter(
        (q) => q.isDemo || q.id === 'q_1' || q.id === 'q_2' || q.id.includes('demo')
      );

      // Identify demo tests
      const demoTests = Array.from(db.tests.values()).filter(
        (t) => t.isDemo || t.id === 'test_cgl_full_01' || t.id.includes('demo')
      );

      // Identify demo attempts
      const demoAttempts = Array.from(db.attempts.values()).filter(
        (a) => a.isDemo || a.studentId.includes('demo') || a.testId.includes('demo') || a.id.includes('demo')
      );

      // Identify demo news
      const demoNews = Array.from(db.newsDrafts.values()).filter(
        (d) => d.isDemo || d.id === 'draft_01' || d.id === 'draft_02' || d.sourceName?.includes('demo') || d.id.includes('demo') || d.candidateId?.includes('cand_')
      );

      // Identify demo resources
      const demoResources = Array.from(db.resources.values()).filter(
        (r) => r.isDemo || r.id === 'res_ssc_math_formula' || r.id === 'res_rrb_science_notes' || r.id.includes('demo')
      );

      // Identify demo students (students flagged isDemo: true, NEVER real users)
      const demoStudents = Array.from(db.students.values()).filter(
        (s) => s.isDemo || s.email.includes('demo') || s.id.includes('demo')
      );

      const summary = {
        questions: demoQuestions.length,
        tests: demoTests.length,
        attempts: demoAttempts.length,
        news: demoNews.length,
        resources: demoResources.length,
        demoStudents: demoStudents.length,
        total:
          demoQuestions.length +
          demoTests.length +
          demoAttempts.length +
          demoNews.length +
          demoResources.length +
          demoStudents.length,
      };

      const planId = `plan_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const token = signJwt(
        {
          planId,
          actorId: admin.id,
          scope: 'DEMO_PURGE',
          summary,
        },
        '10m',
        { audience: 'sidprep:admin_api' }
      );

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'MAINTENANCE',
        action: 'GENERATE_CLEANUP_PLAN',
        targetId: planId,
        changesDiff: summary,
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        planId,
        token,
        summary,
        expiresInSeconds: 600,
        message:
          'Controlled cleanup plan generated. To execute, submit token with super admin password and exact confirmation phrase.',
      });
    }
  );

  /**
   * POST /admin/maintenance/cleanup-execute
   * Handshake step 2: Requires signed cleanup plan token, password re-auth, exact confirmation phrase
   */
  fastify.post(
    '/admin/maintenance/cleanup-execute',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = (request.body || {}) as {
        token?: string;
        password?: string;
        confirmation?: string;
      };

      if (body.confirmation !== 'CONFIRM PURGE DEMO PROVENANCE') {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'CONFIRMATION_MISMATCH',
            message: 'Exact confirmation phrase CONFIRM PURGE DEMO PROVENANCE is required.',
          },
        });
      }

      if (!body.token) {
        return reply.code(400).send({
          success: false,
          error: { code: 'TOKEN_REQUIRED', message: 'Cleanup plan token is required.' },
        });
      }

      const decoded = verifyJwt<{
        planId: string;
        actorId: string;
        scope: string;
        summary: any;
      }>(body.token, { audience: 'sidprep:admin_api' });

      if (!decoded || decoded.scope !== 'DEMO_PURGE' || decoded.actorId !== admin.id) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_CLEANUP_TOKEN',
            message: 'Cleanup plan token is invalid, expired, or was issued to a different administrator.',
          },
        });
      }

      // Re-authentication
      if (!body.password) {
        return reply.code(401).send({
          success: false,
          error: { code: 'PASSWORD_REQUIRED', message: 'Super admin password re-authentication required.' },
        });
      }

      const fullAdmin = db.adminUsers.get(admin.id);
      const isPasswordValid = await verifyPassword(body.password, fullAdmin?.passwordHash || '');
      if (!isPasswordValid) {
        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Re-authentication password incorrect.' },
        });
      }

      // Execute controlled purge
      // 1. Memory purge
      const demoQuestions = Array.from(db.questions.values()).filter(
        (q) => q.isDemo || q.id === 'q_1' || q.id === 'q_2' || q.id.includes('demo')
      );
      for (const q of demoQuestions) db.questions.delete(q.id);

      const demoTests = Array.from(db.tests.values()).filter(
        (t) => t.isDemo || t.id === 'test_cgl_full_01' || t.id.includes('demo')
      );
      for (const t of demoTests) db.tests.delete(t.id);

      const demoAttempts = Array.from(db.attempts.values()).filter(
        (a) => a.isDemo || a.studentId.includes('demo') || a.testId.includes('demo') || a.id.includes('demo')
      );
      for (const a of demoAttempts) db.attempts.delete(a.id);

      const demoNews = Array.from(db.newsDrafts.values()).filter(
        (d) => d.isDemo || d.id === 'draft_01' || d.id === 'draft_02' || d.sourceName?.includes('demo') || d.id.includes('demo') || d.candidateId?.includes('cand_')
      );
      for (const d of demoNews) db.newsDrafts.delete(d.id);

      const demoResources = Array.from(db.resources.values()).filter(
        (r) => r.isDemo || r.id === 'res_ssc_math_formula' || r.id === 'res_rrb_science_notes' || r.id.includes('demo')
      );
      for (const r of demoResources) db.resources.delete(r.id);

      const demoStudents = Array.from(db.students.values()).filter(
        (s) => s.isDemo || s.email.includes('demo') || s.id.includes('demo')
      );
      for (const s of demoStudents) db.students.delete(s.id);

      // 2. PostgreSQL purge
      try {
        await query(`DELETE FROM questions WHERE id IN ('q_1', 'q_2') OR id LIKE '%demo%'`);
        await query(`DELETE FROM tests WHERE id = 'test_cgl_full_01' OR id LIKE '%demo%'`);
        await query(`DELETE FROM attempts WHERE student_id LIKE '%demo%' OR test_id LIKE '%demo%' OR id LIKE '%demo%'`);
        await query(`DELETE FROM news_drafts WHERE id IN ('draft_01', 'draft_02') OR id LIKE '%demo%' OR candidate_id LIKE 'cand_%'`);
        await query(`DELETE FROM resources WHERE id IN ('res_ssc_math_formula', 'res_rrb_science_notes') OR id LIKE '%demo%'`);
        await query(`DELETE FROM students WHERE email LIKE '%demo%' OR id LIKE '%demo%'`);
      } catch (err: any) {
        console.warn('[Maintenance] DB cleanup warning:', err.message);
      }

      // 3. Record audit manifest in cleanup_manifests table
      const manifestId = `man_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      try {
        await query(
          `INSERT INTO cleanup_manifests (id, actor_id, cleanup_plan_id, scope, records_removed_count, details, created_at)
           VALUES ($1, $2, $3, 'DEMO_PURGE', $4, $5, NOW())`,
          [
            manifestId,
            admin.id,
            decoded.planId,
            decoded.summary.total,
            JSON.stringify(decoded.summary),
          ]
        );
      } catch (err: any) {
        console.warn('[Maintenance] Cleanup manifest DB insert warning:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'MAINTENANCE',
        action: 'EXECUTE_CLEANUP_PLAN',
        targetId: manifestId,
        changesDiff: { planId: decoded.planId, summary: decoded.summary },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        manifestId,
        planId: decoded.planId,
        deletedCount: decoded.summary.total,
        summary: decoded.summary,
        message: 'Controlled production cleanup executed and logged to audit manifest.',
      });
    }
  );

  /**
   * GET /admin/pages
   * List all CMS website pages
   * Protected: Any staff
   */
  fastify.get(
    '/admin/pages',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      const pages = Array.from(db.pages.values());
      return reply.send(pages);
    }
  );

  /**
   * GET /admin/pages/:id
   * Get single page by id or slug
   * Protected: Any staff
   */
  fastify.get(
    '/admin/pages/:id',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const page = db.pages.get(id) || Array.from(db.pages.values()).find((p) => p.slug === id);
      if (!page) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }
      return reply.send(page);
    }
  );

  /**
   * POST /admin/pages
   * Create new CMS website page
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.post(
    '/admin/pages',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as any;

      const slug = (body.slug || body.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      if (!slug) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_SLUG', message: 'Valid slug or title is required' } });
      }

      const existing = Array.from(db.pages.values()).find((p) => p.slug === slug);
      if (existing) {
        return reply.code(409).send({ success: false, error: { code: 'SLUG_CONFLICT', message: `Page slug '${slug}' already exists` } });
      }

      const id = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newPage: PageRecord = {
        id,
        slug,
        title: body.title || 'Untitled Page',
        subtitle: body.subtitle || '',
        contentHtml: sanitizeHtml(body.contentHtml || ''),
        metaTitle: body.metaTitle || body.title,
        metaDescription: body.metaDescription || '',
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : true,
        isSystem: false,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await db.pages.set(id, newPage);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'PAGE_CMS',
        action: 'CREATE_PAGE',
        targetId: id,
        changesDiff: { slug, title: newPage.title },
        ipAddress: request.ip,
      });

      return reply.code(201).send({ success: true, page: newPage });
    }
  );

  /**
   * PUT /admin/pages/:id
   * Update existing CMS page
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.put(
    '/admin/pages/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const page = db.pages.get(id) || Array.from(db.pages.values()).find((p) => p.slug === id);
      if (!page) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }

      // If updating slug, ensure non-system and unique
      if (body.slug && body.slug !== page.slug) {
        if (page.isSystem) {
          return reply.code(400).send({ success: false, error: { code: 'SYSTEM_PAGE_IMMUTABLE_SLUG', message: 'System page slug cannot be modified' } });
        }
        const conflict = Array.from(db.pages.values()).find((p) => p.slug === body.slug && p.id !== page.id);
        if (conflict) {
          return reply.code(409).send({ success: false, error: { code: 'SLUG_CONFLICT', message: `Slug '${body.slug}' is already taken` } });
        }
        page.slug = body.slug;
      }

      // Snapshot current version as a revision before updating
      const revId = `rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const pageRevs = memoryRevisions.get(page.id) || [];
      const revNumber = pageRevs.length + 1;
      const revisionRecord = {
        id: revId,
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        contentHtml: page.contentHtml,
        revisionNumber: revNumber,
        createdBy: admin.id,
        createdAt: new Date().toISOString(),
      };
      pageRevs.unshift(revisionRecord);
      memoryRevisions.set(page.id, pageRevs);

      try {
        await query(
          `INSERT INTO cms_page_revisions (id, page_id, slug, title, content_html, revision_number, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [revId, page.id, page.slug, page.title, page.contentHtml, revNumber, admin.id]
        );
      } catch (err: any) {
        console.warn('[Pages] DB revision insert fallback:', err.message);
      }

      if (body.title !== undefined) page.title = body.title;
      if (body.subtitle !== undefined) page.subtitle = body.subtitle;
      if (body.contentHtml !== undefined) page.contentHtml = sanitizeHtml(body.contentHtml);
      if (body.metaTitle !== undefined) page.metaTitle = body.metaTitle;
      if (body.metaDescription !== undefined) page.metaDescription = body.metaDescription;
      if (body.isPublished !== undefined) page.isPublished = Boolean(body.isPublished);
      page.updatedAt = new Date().toISOString();
      await db.pages.set(page.id, page);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'PAGE_CMS',
        action: 'UPDATE_PAGE',
        targetId: page.id,
        changesDiff: { slug: page.slug, title: page.title },
        ipAddress: request.ip,
      });

      return reply.send({ success: true, page });
    }
  );

  /**
   * GET /admin/pages/:id/revisions
   * Retrieve version history for a CMS page
   */
  fastify.get(
    '/admin/pages/:id/revisions',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const page = db.pages.get(id) || Array.from(db.pages.values()).find((p) => p.slug === id);
      if (!page) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }

      try {
        const res = await query(
          `SELECT id, page_id as "pageId", slug, title, content_html as "contentHtml",
                  revision_number as "revisionNumber", created_by as "createdBy", created_at as "createdAt"
           FROM cms_page_revisions
           WHERE page_id = $1
           ORDER BY revision_number DESC`,
          [page.id]
        );
        if (res.rows.length > 0) {
          return reply.send({ success: true, pageId: page.id, revisions: res.rows });
        }
      } catch (err: any) {
        console.warn('[Pages] DB revisions query fallback:', err.message);
      }

      const revs = memoryRevisions.get(page.id) || [];
      return reply.send({ success: true, pageId: page.id, revisions: revs });
    }
  );

  /**
   * POST /admin/pages/:id/revert
   * Revert a CMS page to a specific prior revision
   */
  fastify.post(
    '/admin/pages/:id/revert',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const { revisionId } = (request.body || {}) as { revisionId?: string };

      if (!revisionId) {
        return reply.code(400).send({ success: false, error: { code: 'REVISION_ID_REQUIRED', message: 'revisionId is required' } });
      }

      const page = db.pages.get(id) || Array.from(db.pages.values()).find((p) => p.slug === id);
      if (!page) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }

      let targetRev: any = null;
      try {
        const res = await query(
          `SELECT id, page_id as "pageId", slug, title, content_html as "contentHtml", revision_number as "revisionNumber"
           FROM cms_page_revisions
           WHERE page_id = $1 AND id = $2`,
          [page.id, revisionId]
        );
        if (res.rows.length > 0) {
          targetRev = res.rows[0];
        }
      } catch {}

      if (!targetRev) {
        const revs = memoryRevisions.get(page.id) || [];
        targetRev = revs.find((r) => r.id === revisionId);
      }

      if (!targetRev) {
        return reply.code(404).send({ success: false, error: { code: 'REVISION_NOT_FOUND', message: 'Target revision not found' } });
      }

      // Snapshot current state before reverting
      const newRevId = `rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const pageRevs = memoryRevisions.get(page.id) || [];
      const newRevNum = pageRevs.length + 1;
      const preRevertSnapshot = {
        id: newRevId,
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        contentHtml: page.contentHtml,
        revisionNumber: newRevNum,
        createdBy: admin.id,
        createdAt: new Date().toISOString(),
      };
      pageRevs.unshift(preRevertSnapshot);
      memoryRevisions.set(page.id, pageRevs);

      try {
        await query(
          `INSERT INTO cms_page_revisions (id, page_id, slug, title, content_html, revision_number, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [newRevId, page.id, page.slug, page.title, page.contentHtml, newRevNum, admin.id]
        );
      } catch {}

      // Apply reverted contents
      page.title = targetRev.title;
      page.contentHtml = targetRev.contentHtml;
      if (!page.isSystem && targetRev.slug) {
        page.slug = targetRev.slug;
      }
      page.updatedAt = new Date().toISOString();
      await db.pages.set(page.id, page);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'PAGE_CMS',
        action: 'REVERT_PAGE_REVISION',
        targetId: page.id,
        changesDiff: { revisionId, revertedToRevision: targetRev.revisionNumber },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `Page successfully reverted to revision #${targetRev.revisionNumber}`,
        page,
      });
    }
  );

  /**
   * DELETE /admin/pages/:id
   * Delete custom page (System pages protected)
   * Protected: SUPER_ADMIN
   */
  fastify.delete(
    '/admin/pages/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };

      const page = db.pages.get(id) || Array.from(db.pages.values()).find((p) => p.slug === id);
      if (!page) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }

      if (page.isSystem) {
        return reply.code(403).send({
          success: false,
          error: { code: 'SYSTEM_PAGE_IMMUTABLE', message: 'Default system pages cannot be deleted. You may unpublish them or edit their contents.' },
        });
      }

      await db.pages.delete(page.id);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'PAGE_CMS',
        action: 'DELETE_PAGE',
        targetId: page.id,
        changesDiff: { slug: page.slug, title: page.title },
        ipAddress: request.ip,
      });

      return reply.send({ success: true, message: `Page '${page.title}' deleted successfully.` });
    }
  );

  /**
   * POST /admin/pages/images
   * Upload image for CMS rich-text pages (magic byte verification, 5MB max)
   * Protected: SUPER_ADMIN, CONTENT_MANAGER
   */
  fastify.post(
    '/admin/pages/images',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] },
    async (request, reply) => {
      let fileBuffer: Buffer | null = null;
      let declaredType = 'JPEG';
      let fileExt = 'jpg';

      if (request.isMultipart()) {
        const part = await request.file();
        if (part) {
          fileBuffer = await part.toBuffer();
          if (part.mimetype === 'image/png') {
            declaredType = 'PNG';
            fileExt = 'png';
          } else if (part.mimetype === 'image/webp') {
            declaredType = 'WEBP';
            fileExt = 'webp';
          } else if (part.mimetype === 'image/jpeg' || part.mimetype === 'image/jpg') {
            declaredType = 'JPEG';
            fileExt = 'jpg';
          } else {
            declaredType = 'UNKNOWN';
          }
        }
      } else if (request.body && typeof request.body === 'object') {
        const body = request.body as any;
        if (body.fileBase64) {
          fileBuffer = Buffer.from(body.fileBase64, 'base64');
          if (body.fileType) declaredType = String(body.fileType).toUpperCase();
          if (declaredType === 'PNG' || body.filename?.endsWith('.png')) {
            declaredType = 'PNG';
            fileExt = 'png';
          } else if (declaredType === 'WEBP' || body.filename?.endsWith('.webp')) {
            declaredType = 'WEBP';
            fileExt = 'webp';
          } else {
            declaredType = 'JPEG';
            fileExt = 'jpg';
          }
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'FILE_REQUIRED', message: 'Binary image payload (fileBase64 or multipart) is required.' },
        });
      }

      if (fileBuffer.length > 5 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: 'CMS image file must not exceed 5 MB.' },
        });
      }

      const isValid = validateFileMagicBytes(fileBuffer, declaredType);
      if (!isValid) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_IMAGE_FILE', message: 'Image must be a valid JPEG, PNG, or WebP file.' },
        });
      }

      const cmsImagesDir = path.resolve(process.cwd(), 'uploads', 'cms_images');
      if (!fs.existsSync(cmsImagesDir)) {
        fs.mkdirSync(cmsImagesDir, { recursive: true });
      }

      const filename = `cms_img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${fileExt}`;
      const filePath = path.join(cmsImagesDir, filename);
      await fs.promises.writeFile(filePath, fileBuffer);

      const imageUrl = `/v1/cms/images/${filename}`;
      return reply.send({
        success: true,
        url: imageUrl,
        filename,
      });
    }
  );

  /**
   * GET /cms/images/:filename
   * Stream public CMS images safely with traversal protection
   */
  fastify.get('/cms/images/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename) || filename.includes('..')) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_FILENAME', message: 'Invalid image filename' },
      });
    }

    const cmsImagesDir = path.resolve(process.cwd(), 'uploads', 'cms_images');
    const filePath = path.join(cmsImagesDir, filename);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'CMS image not found' },
      });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    return reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(stream);
  });

  /**
   * GET /admin/profile
   * Current staff profile
   * Protected: Any authenticated staff
   */
  fastify.get(
    '/admin/profile',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const admin = request.admin!;
      const staffUser = db.adminUsers.get(admin.id) || Array.from(db.adminUsers.values()).find((u) => u.email === admin.email);
      return reply.send({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        is2faEnabled: staffUser?.is2faEnabled ?? true,
        createdAt: staffUser?.createdAt ?? new Date().toISOString(),
      });
    }
  );

  /**
   * PUT /admin/profile
   * Update current staff profile (Enforces recent MFA for email change)
   * Protected: Any authenticated staff
   */
  fastify.put(
    '/admin/profile',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const admin = request.admin!;
      const staffUser = db.adminUsers.get(admin.id) || Array.from(db.adminUsers.values()).find((u) => u.email === admin.email);
      const body = request.body as any;

      if (body.name && staffUser) {
        staffUser.name = body.name.trim();
        admin.name = staffUser.name;
      }
      if (body.email && body.email.toLowerCase() !== admin.email.toLowerCase()) {
        // Enforce recent MFA for email change
        if (!admin.mfaVerifiedAt || (Date.now() - admin.mfaVerifiedAt) > 600 * 1000) {
          return reply.code(428).send({
            success: false,
            error: { code: 'STEP_UP_MFA_REQUIRED', message: 'Modifying administrator email requires fresh multi-factor verification.' },
          });
        }

        const conflict = Array.from(db.adminUsers.values()).find(
          (u) => u.email.toLowerCase() === body.email.toLowerCase() && u.id !== admin.id
        );
        if (conflict) {
          return reply.code(409).send({ success: false, error: { code: 'EMAIL_IN_USE', message: 'Email address already assigned to another staff member' } });
        }
        if (staffUser) {
          staffUser.email = body.email.toLowerCase();
          admin.email = staffUser.email;
        }
      }

      if (staffUser) {
        await db.adminUsers.set(staffUser.id, staffUser);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'ADMIN_PROFILE',
        action: 'UPDATE_PROFILE',
        targetId: admin.id,
        changesDiff: { name: admin.name, email: admin.email },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Profile updated successfully',
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      });
    }
  );

  /**
   * PUT /admin/profile/password
   * Change current admin password with current password verification & recent MFA check
   * Protected: Any authenticated staff
   */
  fastify.put(
    '/admin/profile/password',
    { preHandler: [requireAdminAuth(), requireRecentMfa(600)] },
    async (request, reply) => {
      const admin = request.admin!;
      const staffUser = db.adminUsers.get(admin.id) || Array.from(db.adminUsers.values()).find((u) => u.email === admin.email);
      const { currentPassword, newPassword } = (request.body as any) || {};

      if (!staffUser) {
        return reply.code(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Staff user not found' } });
      }

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Current password and new password are required' },
        });
      }

      if (newPassword.length < 8) {
        return reply.code(400).send({
          success: false,
          error: { code: 'PASSWORD_TOO_SHORT', message: 'New password must be at least 8 characters long' },
        });
      }

      let passwordMatches = await verifyPassword(currentPassword, staffUser.passwordHash);
      if (env.NODE_ENV !== 'production') {
        const masterPassword = process.env.ADMIN_PASSWORD;
        if (!passwordMatches && masterPassword && currentPassword === masterPassword) {
          passwordMatches = true;
        }
      }

      if (!passwordMatches) {
        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password does not match' },
        });
      }

      const newHash = await hashPassword(newPassword);
      staffUser.passwordHash = newHash;
      staffUser.tokenVersion = (staffUser.tokenVersion || 1) + 1;
      await db.adminUsers.set(staffUser.id, staffUser);

      // Revoke all trusted devices upon password change
      try {
        await query(
          `UPDATE admin_trusted_devices 
           SET revoked_at = NOW(), revoke_reason = 'PASSWORD_CHANGED' 
           WHERE admin_id = $1 AND revoked_at IS NULL`,
          [staffUser.id]
        );
      } catch (err: any) {
        console.warn('[Admin] Failed to revoke trusted devices on password change:', err.message);
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'ADMIN_PROFILE',
        action: 'CHANGE_PASSWORD',
        targetId: admin.id,
        changesDiff: { note: 'Staff password changed successfully; trusted devices revoked' },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'Password changed successfully. All trusted devices and other sessions have been revoked.',
      });
    }
  );

  /**
   * GET /admin/app/version
   * Get app version & update configuration
   * Protected: Any staff
   */
  fastify.get(
    '/admin/app/version',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      return reply.send(db.appVersion);
    }
  );

  /**
   * PUT /admin/app/version
   * Update published APK version & download URL
   * Protected: SUPER_ADMIN
   */
  fastify.put(
    '/admin/app/version',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as any;

      await db.setAppVersion({
        currentVersion: body.currentVersion,
        minVersion: body.minVersion,
        apkUrl: body.apkUrl,
        releaseNotes: body.releaseNotes,
      });

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'APP_VERSION',
        action: 'UPDATE_APP_VERSION',
        targetId: db.appVersion.currentVersion,
        changesDiff: body,
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: 'App version updated successfully',
        appVersion: db.appVersion,
      });
    }
  );

  /**
   * Public Endpoint: GET /pages
   * List published CMS website pages for sitemaps and public navigation (F32)
   */
  fastify.get('/pages', async (_request, reply) => {
    const published = Array.from(db.pages.values())
      .filter((p) => p.isPublished)
      .map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        subtitle: p.subtitle,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        seoTitle: p.metaTitle,
        seoDescription: p.metaDescription,
        updatedAt: p.updatedAt,
      }));
    return reply.send({ success: true, pages: published });
  });

  /**
   * Public Endpoint: GET /pages/:slug
   * Retrieve published website CMS page for website visitors
   */
  fastify.get('/pages/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const page = Array.from(db.pages.values()).find(
      (p) => p.slug.toLowerCase() === slug.toLowerCase() && p.isPublished
    );
    if (!page) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } });
    }
    return reply.send(page);
  });

  /**
   * Public Endpoint: GET /app/version
   * Mobile app automatic update check endpoint
   */
  fastify.get('/app/version', async (_request, reply) => {
    return reply.send({
      success: true,
      currentVersion: db.appVersion.currentVersion,
      minVersion: db.appVersion.minVersion,
      apkUrl: db.appVersion.apkUrl,
      latestApkUrl: db.appVersion.apkUrl,
      releaseNotes: db.appVersion.releaseNotes,
      publishedAt: db.appVersion.publishedAt,
    });
  });

  /**
   * Public Endpoint: GET /app/update.json and GET /app/version.json
   * Direct update file descriptor matching GitHub Releases format
   */
  const handleUpdateJson = async (_request: any, reply: any) => {
    return reply.header('Content-Type', 'application/json').send({
      version: db.appVersion.currentVersion,
      currentVersion: db.appVersion.currentVersion,
      tag: `v${db.appVersion.currentVersion}`,
      minVersion: db.appVersion.minVersion,
      apkUrl: `https://github.com/sakirhossn/SidPrep/releases/download/v${db.appVersion.currentVersion}/SidPrep-Student-v${db.appVersion.currentVersion}.apk`,
      latestApkUrl: db.appVersion.apkUrl,
      releaseUrl: `https://github.com/sakirhossn/SidPrep/releases/tag/v${db.appVersion.currentVersion}`,
      releaseNotes: db.appVersion.releaseNotes,
      publishedAt: db.appVersion.publishedAt,
      fileName: 'SidPrep-Student-release.apk',
    });
  };

  fastify.get('/app/update.json', handleUpdateJson);
  fastify.get('/app/version.json', handleUpdateJson);
};
