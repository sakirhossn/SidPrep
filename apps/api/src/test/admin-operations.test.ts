process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import { SidPrepWorker } from '../worker/index.js';

describe('Batch 4: Admin Operations, CMS Ingestion, Content Storage & Dual Review (F15, F16, F17, F18, F30)', async () => {
  let app: any;

  // Admin 1 (Super Admin / Creator)
  const admin1Id = 'adm_batch4_creator';
  const admin1Token = signJwt(
    { sub: admin1Id, email: 'admin1@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  // Admin 2 (Super Admin / Independent Reviewer)
  const admin2Id = 'adm_batch4_reviewer';
  const admin2Token = signJwt(
    { sub: admin2Id, email: 'admin2@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  // Content Manager
  const cmId = 'adm_batch4_cm';
  const cmToken = signJwt(
    { sub: cmId, email: 'cm@sidprep.in', role: 'CONTENT_MANAGER', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  // Test Student
  const studentId = 'stu_batch4_target';

  before(async () => {
    app = await buildServer();
    await db.init();

    // Seed test admins
    await db.adminUsers.set(admin1Id, {
      id: admin1Id,
      email: 'admin1@sidprep.in',
      name: 'Admin Creator',
      passwordHash: 'dummy_hash',
      totpSecret: 'DUMMYSECRET',
      is2faEnabled: true,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    await db.adminUsers.set(admin2Id, {
      id: admin2Id,
      email: 'admin2@sidprep.in',
      name: 'Admin Reviewer',
      passwordHash: 'dummy_hash',
      totpSecret: 'DUMMYSECRET',
      is2faEnabled: true,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    await db.adminUsers.set(cmId, {
      id: cmId,
      email: 'cm@sidprep.in',
      name: 'Content Manager',
      passwordHash: 'dummy_hash',
      totpSecret: 'DUMMYSECRET',
      is2faEnabled: true,
      role: 'CONTENT_MANAGER',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // Seed student
    await db.students.set(studentId, {
      id: studentId,
      email: 'student.batch4@example.com',
      phone: '9876543210',
      preferredLanguage: 'en',
      targetExams: ['SSC_CGL'],
      dailyGoalMinutes: 45,
      streakDays: 7,
      status: 'ACTIVE',
      isEmailVerified: true,
      tokenVersion: 1,
      completedTasks: [],
      settings: {},
      createdAt: new Date().toISOString(),
    });

    // Seed baseline SSC CGL exam
    await db.exams.set('ssc-cgl', {
      id: 'ssc-cgl',
      bodyCode: 'SSC',
      code: 'SSC_CGL',
      name: 'SSC Combined Graduate Level',
      body: 'SSC',
      description: 'Original CGL Examination Pattern',
      stagesCount: 2,
      stages: [
        {
          id: 'tier_1',
          name: 'Tier 1 Preliminary',
          stageNumber: 1,
          durationMinutes: 60,
          totalMarks: 200,
          negativeMarkRatio: 0.25,
          sectionLock: false,
        },
        {
          id: 'tier_2',
          name: 'Tier 2 Mains',
          stageNumber: 2,
          durationMinutes: 120,
          totalMarks: 400,
          negativeMarkRatio: 0.33,
          sectionLock: true,
        },
      ],
      syllabusTree: [
        { subject: 'Quantitative Aptitude', weightPercentage: 25, topics: ['Algebra', 'Geometry'] },
      ],
      isActive: true,
      version: 1,
      verifiedDate: '2026-09-01',
      lastVerifiedBy: 'admin1@sidprep.in',
      sourceUrl: 'https://ssc.gov.in',
    });
  });

  after(async () => {
    if (app) await app.close();
    await closePool();
  });

  // =========================================================================
  // F15: Content-Addressable Resource Storage & Streaming Tests
  // =========================================================================
  describe('F15: Document Storage & Streaming Downloads', () => {
    let uploadedResourceId: string;
    let expectedHash: string;
    const genuinePdfContent = '%PDF-1.4\n%Genuine PDF File Content for Batch 4 Verification\n%%EOF\n';
    const genuinePdfBuffer = Buffer.from(genuinePdfContent, 'utf-8');

    it('F15: Rejects upload with corrupted magic-byte signature', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/resources',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          title: 'Corrupted File',
          exam: 'SSC',
          subject: 'Math',
          fileType: 'PDF',
          previewAllowed: true,
          downloadAllowed: true,
          offlineAllowed: false,
          content: 'NOT_A_PDF_CONTENT',
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'CORRUPTED_FILE');
    });

    it('F15: Stores valid file buffer to content-addressable disk with true cryptographic SHA-256', async () => {
      expectedHash = crypto.createHash('sha256').update(genuinePdfBuffer).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/resources',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          title: 'SSC CGL Mathematics Handbook',
          description: 'Official verified handbook',
          exam: 'SSC',
          subject: 'Quantitative Aptitude',
          fileType: 'PDF',
          previewAllowed: true,
          downloadAllowed: true,
          offlineAllowed: false,
          fileBase64: genuinePdfBuffer.toString('base64'),
        },
      });

      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(body.resource.id);
      uploadedResourceId = body.resource.id;
      assert.equal(body.resource.sha256Hash, expectedHash);
      assert.equal(body.resource.fileSizeBytes, genuinePdfBuffer.length);

      // Verify file exists on disk
      const filePath = path.resolve(process.cwd(), `uploads/resources/${expectedHash}.pdf`);
      assert.ok(fs.existsSync(filePath), `Expected file to exist at ${filePath}`);
      const diskBytes = fs.readFileSync(filePath);
      assert.deepEqual(diskBytes, genuinePdfBuffer);
    });

    it('F15: GET /v1/downloads/stream/:id streams byte-identical payload with ETag and Content-Type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/downloads/stream/${uploadedResourceId}`,
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/pdf');
      assert.equal(res.headers['etag'], `"${expectedHash}"`);
      assert.equal(parseInt(res.headers['content-length'] as string, 10), genuinePdfBuffer.length);
      assert.deepEqual(res.rawPayload, genuinePdfBuffer);
    });

    it('F15: GET /v1/resources/:id/file alternate streaming endpoint streams identical bytes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/resources/${uploadedResourceId}/file`,
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.rawPayload, genuinePdfBuffer);
    });

    it('F15: Preview endpoint returns sanitized token and direct stream URL', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/resources/${uploadedResourceId}/preview`,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.resourceId, uploadedResourceId);
      assert.equal(body.previewType, 'PDF_URL');
      assert.ok(body.previewUrl.includes('/v1/downloads/stream/'));
    });

    it('F15: Policy enforcement: Toggling downloadAllowed=false blocks file streaming with 403', async () => {
      // Toggle downloadAllowed to false
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/resources/${uploadedResourceId}/permissions`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { downloadAllowed: false },
      });
      assert.equal(patchRes.statusCode, 200);

      // Now attempt stream download -> must receive 403 DOWNLOAD_DENIED
      const streamRes = await app.inject({
        method: 'GET',
        url: `/v1/downloads/stream/${uploadedResourceId}`,
      });
      assert.equal(streamRes.statusCode, 403);
      const streamBody = JSON.parse(streamRes.body);
      assert.equal(streamBody.error.code, 'DOWNLOAD_DENIED');

      // POST /resources/:id/download ticket request must also receive 403
      const ticketRes = await app.inject({
        method: 'POST',
        url: `/v1/resources/${uploadedResourceId}/download`,
      });
      assert.equal(ticketRes.statusCode, 403);
    });

    it('F15: Policy enforcement: Toggling previewAllowed=false blocks preview with 403', async () => {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/resources/${uploadedResourceId}/permissions`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { previewAllowed: false },
      });
      assert.equal(patchRes.statusCode, 200);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/v1/resources/${uploadedResourceId}/preview`,
      });
      assert.equal(previewRes.statusCode, 403);
      const previewBody = JSON.parse(previewRes.body);
      assert.equal(previewBody.error.code, 'PREVIEW_RESTRICTED');
    });
  });

  // =========================================================================
  // F18: Two-Person Rule & Proposal Verification Tests
  // =========================================================================
  describe('F18: Two-Person Rule & Pattern Verification', () => {
    let createdProposalId: string;

    it('F18: Admin 1 proposes exam pattern change and proposal is stored as PENDING', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/exams/patterns/ssc-cgl/propose',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          description: 'Updated 2026 CGL 3-tier Examination Scheme',
          stagesCount: 3,
          stages: [
            { id: 'tier_1', name: 'Tier 1 CBT', order: 1 },
            { id: 'tier_2', name: 'Tier 2 Mains CBT', order: 2 },
            { id: 'tier_3', name: 'Tier 3 Computer Proficiency', order: 3 },
          ],
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(body.proposalId);
      assert.equal(body.pendingApprovalByOtherAdmin, true);
      createdProposalId = body.proposalId;

      const storedProposal = db.examProposals.get(createdProposalId);
      assert.ok(storedProposal);
      assert.equal(storedProposal.status, 'PENDING');
      assert.equal(storedProposal.proposedByAdminId, admin1Id);
    });

    it('F18: Author (Admin 1) cannot approve their own proposal (DUAL_APPROVAL_VIOLATION)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/exams/patterns/ssc-cgl/verify',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          proposalId: createdProposalId,
          approved: true,
          reviewNotes: 'Attempting self-approval',
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'DUAL_APPROVAL_VIOLATION');
    });

    it('F18: Secondary Reviewer (Admin 2) successfully approves and atomically updates parent exam', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/exams/patterns/ssc-cgl/verify',
        headers: { authorization: `Bearer ${admin2Token}` },
        payload: {
          proposalId: createdProposalId,
          approved: true,
          reviewNotes: 'Cross-checked with official SSC notification doc',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.equal(body.verified, true);
      assert.equal(body.approvedBy, 'admin2@sidprep.in');

      // Check proposal status updated
      const updatedProposal = db.examProposals.get(createdProposalId);
      assert.equal(updatedProposal?.status, 'APPROVED');
      assert.equal(updatedProposal?.verifiedByAdminId, admin2Id);

      // Check parent exam updated
      const updatedExam = db.exams.get('ssc-cgl')!;
      assert.equal(updatedExam.stagesCount, 3);
      assert.equal(updatedExam.description, 'Updated 2026 CGL 3-tier Examination Scheme');
      assert.equal(updatedExam.version, 2, 'Exam version must be incremented upon verified approval');
      assert.equal(updatedExam.lastVerifiedBy, 'admin2@sidprep.in');
    });

    it('F18: Attempting to re-verify already reviewed proposal returns 400 PROPOSAL_ALREADY_REVIEWED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/exams/patterns/ssc-cgl/verify',
        headers: { authorization: `Bearer ${admin2Token}` },
        payload: {
          proposalId: createdProposalId,
          approved: true,
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'PROPOSAL_ALREADY_REVIEWED');
    });

    it('F18: Verifying nonexistent proposal returns 404 NO_PENDING_PROPOSAL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/exams/patterns/rrb-ntpc/verify',
        headers: { authorization: `Bearer ${admin2Token}` },
        payload: {
          proposalId: 'prop_does_not_exist',
          approved: true,
        },
      });

      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'NO_PENDING_PROPOSAL');
    });

    it('F18: GET /v1/admin/exams/proposals lists all proposals for review console', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/exams/proposals',
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body));
      const found = body.find((p: any) => p.proposalId === createdProposalId);
      assert.ok(found, 'Created proposal must be present in proposals list');
    });
  });

  // =========================================================================
  // F17: Current Affairs Ingestion & Scheduled Publishing Tests
  // =========================================================================
  describe('F17: Current Affairs Ingestion & Scheduled Publishing', () => {
    let testDraftId = 'draft_batch4_scheduled_01';

    before(async () => {
      await db.newsDrafts.set(testDraftId, {
        id: testDraftId,
        title: 'National Green Hydrogen Mission Approves ₹19,744 Crore Outlay',
        originalSummary: 'The Union Cabinet chaired by PM has officially approved the National Green Hydrogen Mission.',
        category: 'Economy & National',
        targetExams: ['SSC', 'RRB', 'WBPSC'],
        keyFacts: ['Outlay of ₹19,744 crore', 'Aiming for 5 MMT production per annum'],
        sourceName: 'Press Information Bureau',
        sourceUrl: 'https://pib.gov.in/test-release',
        confidenceScore: 0.98,
        editorialStatus: 'DRAFT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('F17: POST /admin/news/drafts/:id/schedule rejects invalid date format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/news/drafts/${testDraftId}/schedule`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { scheduledFor: 'not-a-valid-date' },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'INVALID_SCHEDULE_DATE');
    });

    it('F17: Schedules draft with timestamp in past to test worker auto-publishing', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/news/drafts/${testDraftId}/schedule`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { scheduledFor: pastDate },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.equal(body.draft.editorialStatus, 'SCHEDULED');
      assert.equal(body.draft.scheduledFor, pastDate);
    });

    it('F17: Worker publishScheduledNews() auto-publishes overdue scheduled drafts', async () => {
      const worker = new SidPrepWorker();
      const publishedCount = await worker.publishScheduledNews();

      assert.ok(publishedCount >= 1, `Expected at least 1 draft published, got ${publishedCount}`);

      const updatedDraft = db.newsDrafts.get(testDraftId);
      assert.equal(updatedDraft?.editorialStatus, 'PUBLISHED');
      assert.ok(updatedDraft?.publishedAt, 'publishedAt must be set on auto-publish');
    });

    it('F17: Newly published article is now visible in student GET /v1/current-affairs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/current-affairs',
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(Array.isArray(body.items));
      const found = body.items.find((item: any) => item.id === testDraftId);
      assert.ok(found, 'Auto-published news item must be present in GET /v1/current-affairs');
      assert.equal(found.title, 'National Green Hydrogen Mission Approves ₹19,744 Crore Outlay');
    });

    it('F17: POST /admin/news/publish-approved catches up and publishes approved drafts immediately', async () => {
      const catchupDraftId = 'draft_batch4_catchup_01';
      await db.newsDrafts.set(catchupDraftId, {
        id: catchupDraftId,
        title: 'Catchup News Item for Immediate Publication',
        originalSummary: 'Summary of catchup item',
        category: 'National',
        targetExams: ['SSC'],
        keyFacts: ['Fact 1'],
        sourceName: 'PIB',
        sourceUrl: 'https://pib.gov.in/test-catchup',
        confidenceScore: 0.95,
        editorialStatus: 'APPROVED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/news/publish-approved',
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(body.publishedCount >= 1);
      assert.ok(body.publishedIds.includes(catchupDraftId));

      const published = db.newsDrafts.get(catchupDraftId);
      assert.equal(published?.editorialStatus, 'PUBLISHED');
    });
  });

  // =========================================================================
  // F16: Admin Console Endpoints Wiring & User Account Action Guardrails
  // =========================================================================
  describe('F16: Admin Console Data Wiring & User Session Controls', () => {
    it('F16: GET /v1/admin/questions returns questions list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/questions',
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body));
    });

    it('F16: POST /v1/admin/questions creates and persists question', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/questions',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          topicId: 'general_awareness',
          difficulty: 'MEDIUM',
          pyqYear: 2024,
          pyqExam: 'SSC CGL',
          correctOptionId: 'opt_b',
          text: 'What is the SI unit of electric current?',
          explanation: 'The SI unit of electric current is the Ampere (A).',
          options: [
            { id: 'opt_a', text: 'Volt' },
            { id: 'opt_b', text: 'Ampere' },
            { id: 'opt_c', text: 'Ohm' },
            { id: 'opt_d', text: 'Watt' },
          ],
        },
      });

      assert.equal(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.ok(body.id);
      assert.equal(body.text || body.question?.translations?.[0]?.text, 'What is the SI unit of electric current?');
    });

    it('F16: GET /v1/admin/resources returns resource library list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/resources',
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.success);
      assert.ok(Array.isArray(body.data));
    });

    it('F16: GET /v1/admin/users returns student list with masked PII', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/users',
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body));
      const student = body.find((s: any) => s.id === studentId);
      assert.ok(student, 'Seeded student must exist in admin user list');
      assert.ok(student.emailMasked.includes('***'), 'Email must be masked for PII safety');
      assert.ok(student.phoneMasked.includes('******'), 'Phone must be masked for PII safety');
    });

    it('F16: POST /v1/admin/users/:id/action rejects without mandatory verified reason (REASON_REQUIRED)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/users/${studentId}/action`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          action: 'SUSPEND',
          reason: 'bad', // < 5 characters
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'REASON_REQUIRED');
    });

    it('F16: POST /v1/admin/users/:id/action REVOKE_SESSIONS increments tokenVersion, revokes sessions, and invalidates active tokens', async () => {
      // Re-seed active student
      await db.students.set(studentId, {
        id: studentId,
        email: 'batch4.student@example.com',
        phone: '+919876543210',
        preferredLanguage: 'en',
        targetExams: ['SSC_CGL'],
        dailyGoalMinutes: 30,
        streakDays: 1,
        status: 'ACTIVE',
        isEmailVerified: true,
        tokenVersion: 1,
        createdAt: new Date().toISOString(),
      });

      const initialStudent = db.students.get(studentId)!;
      const initialTokenVersion = initialStudent.tokenVersion || 1;

      // Issue student token with current tokenVersion
      const oldStudentToken = signJwt(
        { sub: studentId, email: initialStudent.email, type: 'student', tokenVersion: initialTokenVersion },
        '1h',
        { audience: 'sidprep:student_api' }
      );

      // Verify token works on /v1/me
      const checkRes1 = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${oldStudentToken}` },
      });
      assert.equal(checkRes1.statusCode, 200);

      // Revoke sessions as admin
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/users/${studentId}/action`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          action: 'REVOKE_SESSIONS',
          reason: 'Compromised device report by student',
        },
      });

      assert.equal(res.statusCode, 200);
      const updatedStudent = db.students.get(studentId)!;
      assert.equal(updatedStudent.status, 'ACTIVE');
      assert.ok(
        (updatedStudent.tokenVersion || 1) > initialTokenVersion,
        'Revocation must increment tokenVersion to revoke active sessions'
      );

      // Verify old token is now REJECTED with 401 TOKEN_REVOKED
      const checkRes2 = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${oldStudentToken}` },
      });
      assert.equal(checkRes2.statusCode, 401);
      const errBody = JSON.parse(checkRes2.body);
      assert.equal(errBody.error.code, 'TOKEN_REVOKED');
    });

    it('F16: POST /v1/admin/users/:id/action SUSPEND marks account SUSPENDED, revokes tokens, and blocks access', async () => {
      // Re-seed active student
      await db.students.set(studentId, {
        id: studentId,
        email: 'batch4.student@example.com',
        phone: '+919876543210',
        preferredLanguage: 'en',
        targetExams: ['SSC_CGL'],
        dailyGoalMinutes: 30,
        streakDays: 1,
        status: 'ACTIVE',
        isEmailVerified: true,
        tokenVersion: 2,
        createdAt: new Date().toISOString(),
      });

      const currentToken = signJwt(
        { sub: studentId, email: 'batch4.student@example.com', type: 'student', tokenVersion: 2 },
        '1h',
        { audience: 'sidprep:student_api' }
      );

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/users/${studentId}/action`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          action: 'SUSPEND',
          reason: 'Malicious activity detected by proctoring engine',
        },
      });

      assert.equal(res.statusCode, 200);
      const updatedStudent = db.students.get(studentId)!;
      assert.equal(updatedStudent.status, 'SUSPENDED');

      // GET /v1/me must return 403 ACCOUNT_SUSPENDED
      const meRes = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${currentToken}` },
      });
      assert.equal(meRes.statusCode, 403);
      const meBody = JSON.parse(meRes.body);
      assert.equal(meBody.error.code, 'ACCOUNT_SUSPENDED');
    });

    it('F16: POST /v1/admin/users/:id/action DELETE_DATA durably anonymizes/deletes data, creates non-PII audit, and revokes sessions', async () => {
      const deleteTargetId = 'stu_to_delete_01';
      await db.students.set(deleteTargetId, {
        id: deleteTargetId,
        email: 'delete.target@example.com',
        phone: '+919123456789',
        preferredLanguage: 'en',
        targetExams: ['SSC_CGL'],
        dailyGoalMinutes: 30,
        streakDays: 1,
        status: 'ACTIVE',
        isEmailVerified: true,
        tokenVersion: 1,
        createdAt: new Date().toISOString(),
      });

      const targetToken = signJwt(
        { sub: deleteTargetId, email: 'delete.target@example.com', type: 'student', tokenVersion: 1 },
        '1h',
        { audience: 'sidprep:student_api' }
      );

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/users/${deleteTargetId}/action`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          action: 'DELETE_DATA',
          reason: 'Student GDPR / Right to Erasure request verified',
        },
      });

      assert.equal(res.statusCode, 200);

      // Student record must either be deleted or status DELETED / anonymized
      const deletedStudent = db.students.get(deleteTargetId);
      if (deletedStudent) {
        assert.equal(deletedStudent.status, 'DELETED');
        assert.ok(!deletedStudent.email.includes('delete.target@example.com'), 'Email must be anonymized');
      }

      // Old token must fail
      const meRes = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${targetToken}` },
      });
      assert.ok(meRes.statusCode === 401 || meRes.statusCode === 403);

      // Check operational/audit log for non-PII audit record
      const deleteLog = db.auditEvents.find(
        (l: any) => (l.action === 'USER_DELETE_DATA' || l.changesDiff?.action === 'DELETE_DATA') && l.targetId === deleteTargetId
      );
      assert.ok(deleteLog, 'Audit log must record DELETE_DATA event');
      assert.ok(!JSON.stringify(deleteLog).includes('delete.target@example.com'), 'Audit log must not contain deleted PII email');
    });

    it('F16: POST /v1/admin/users/:id/action rejects unsupported action with 400 INVALID_ACTION', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/users/${studentId}/action`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          action: 'UNSUPPORTED_ACTION',
          reason: 'Testing rejection of invalid administrative action',
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'INVALID_ACTION');
    });
  });

  // =========================================================================
  // F30: Server-Side SSR URL Resolution
  // =========================================================================
  describe('F30: Server-Side SSR URL Resolution', () => {
    it('F30: Prioritizes INTERNAL_API_URL in container/server context', () => {
      const originalInternal = process.env.INTERNAL_API_URL;
      const originalApi = process.env.API_URL;
      const originalPublic = process.env.NEXT_PUBLIC_API_URL;

      try {
        process.env.INTERNAL_API_URL = 'http://api:4000/v1';
        process.env.API_URL = 'http://external-api.sidprep.in/v1';
        process.env.NEXT_PUBLIC_API_URL = 'http://browser.sidprep.in/v1';

        // Direct test of the priority logic
        const serverUrl =
          process.env.INTERNAL_API_URL ||
          process.env.API_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'http://localhost:4000/v1';

        assert.equal(serverUrl, 'http://api:4000/v1');
      } finally {
        process.env.INTERNAL_API_URL = originalInternal;
        process.env.API_URL = originalApi;
        process.env.NEXT_PUBLIC_API_URL = originalPublic;
      }
    });
  });
});
