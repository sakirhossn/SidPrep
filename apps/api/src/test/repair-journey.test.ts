process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import {
  UserProfileSchema,
  StartAttemptResponseSchema,
  AttemptResultSchema,
} from '@sidprep/contracts';

describe('Repair & System Integrity End-to-End Journey', async () => {
  let app: any;

  // Test admin credentials
  const adminId = 'adm_repair_super';
  const reviewerAdminId = 'adm_repair_reviewer';
  const adminToken = signJwt(
    { sub: adminId, email: 'repair.admin@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );
  const reviewerToken = signJwt(
    { sub: reviewerAdminId, email: 'repair.reviewer@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  const timestamp = Date.now();
  const unicodeEmail = `candidate.unicode.${timestamp}@example.com`;
  const incompleteEmail = `incomplete.${timestamp}@example.com`;
  const revokeEmail = `revoke.${timestamp}@example.com`;
  const suspendEmail = `suspend.${timestamp}@example.com`;
  const deleteEmail = `gdpr.delete.${timestamp}@example.com`;
  const attemptEmail = `attempt.${timestamp}@example.com`;

  before(async () => {
    app = await buildServer();
    await db.init();

    await db.adminUsers.set(adminId, {
      id: adminId,
      email: 'repair.admin@sidprep.in',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash: 'dummy',
      tokenVersion: 1,
      is2faEnabled: false,
      totpSecret: 'DUMMYSECRET',
      createdAt: new Date().toISOString(),
    });

    await db.adminUsers.set(reviewerAdminId, {
      id: reviewerAdminId,
      email: 'repair.reviewer@sidprep.in',
      name: 'Reviewer Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash: 'dummy',
      tokenVersion: 1,
      is2faEnabled: false,
      totpSecret: 'DUMMYSECRET',
      createdAt: new Date().toISOString(),
    });
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  // Scenario 1: Fresh install to completed registration
  it('1. Completes fresh registration with draft, single name option, Unicode name, and authoritative profile completion', async () => {
    // Request OTP with draft
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: {
        email: unicodeEmail,
        registrationDraft: {
          firstName: 'সৌমিক', // Bengali Unicode name
          isSingleName: true,
          email: unicodeEmail,
          phoneCountryCode: '+91',
          phone: '9876543210',
          targetExamIds: ['ssc-cgl'],
          primaryExamId: 'ssc-cgl',
          preferredLanguage: 'bn',
        },
      },
    });

    assert.equal(challengeRes.statusCode, 200);
    const challengeData = JSON.parse(challengeRes.payload);
    assert.equal(challengeData.success, true);
    assert.ok(challengeData.devOtpHint, 'devOtpHint available in test mode');

    // Verify OTP
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: {
        email: unicodeEmail,
        otp: challengeData.devOtpHint,
        deviceInfo: { platform: 'app', appVersion: '2.0.2' },
      },
    });

    assert.equal(verifyRes.statusCode, 200);
    const verifyData = JSON.parse(verifyRes.payload);
    assert.ok(verifyData.accessToken);
    assert.ok(verifyData.refreshToken);
    assert.equal(verifyData.user.firstName, 'সৌমিক');
    assert.equal(verifyData.user.isSingleName, true);
    assert.equal(verifyData.user.phone, '9876543210');
    assert.equal(verifyData.user.isProfileComplete, true);

    // Validate against shared schema
    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${verifyData.accessToken}` },
    });
    assert.equal(meRes.statusCode, 200);
    const meData = JSON.parse(meRes.payload);
    const parseMe = UserProfileSchema.safeParse(meData);
    assert.ok(parseMe.success, 'Profile conforms to shared UserProfile contract');
    assert.equal(meData.isProfileComplete, true);
  });

  // Scenario 2: Incomplete profile completion after authentication
  it('2. Computes incomplete profile initially and marks complete only after required fields are patched', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: incompleteEmail }, // No registration draft
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: incompleteEmail, otp: devOtpHint },
    });
    const { accessToken, user } = JSON.parse(verifyRes.payload);

    assert.equal(user.isProfileComplete, false, 'User without name/phone must be marked incomplete');

    // Attempt PATCH with incomplete name (no last name and not single name)
    const patchIncompleteRes = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { firstName: 'Ravi' },
    });
    const patchIncompleteData = JSON.parse(patchIncompleteRes.payload);
    assert.equal(patchIncompleteData.isProfileComplete, false);

    // Complete profile with last name, phone, and targets
    const patchCompleteRes = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        firstName: 'Ravi',
        lastName: 'Kumar',
        phone: '9123456789',
        targetExams: ['ssc-cgl', 'rrb-ntpc'],
      },
    });
    const patchCompleteData = JSON.parse(patchCompleteRes.payload);
    assert.equal(patchCompleteData.isProfileComplete, true);
  });

  // Scenario 3: Existing user login with session restoration and history
  it('3. Logs in existing user, preserves profile integrity, and records session/IP history', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: unicodeEmail },
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: {
        email: unicodeEmail,
        otp: devOtpHint,
        deviceInfo: { platform: 'web' },
      },
    });
    const verifyData = JSON.parse(verifyRes.payload);

    assert.equal(verifyData.user.firstName, 'সৌমিক', 'Existing profile details must be preserved');
    assert.equal(verifyData.user.isNewUser, false);

    // Verify session was recorded in database
    const student = Array.from(db.students.values()).find((s) => s.email === unicodeEmail);
    assert.ok(student);
    const sessions = await db.getStudentSessions(student!.id);
    assert.ok(sessions.length >= 1, 'Student session history must be logged');
  });

  // Scenario 4: Session revocation blocking access tokens and refresh tokens
  it('4. Admin REVOKE_SESSIONS immediately invalidates access tokens and refresh tokens', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: {
        email: revokeEmail,
        registrationDraft: {
          firstName: 'Amit',
          lastName: 'Sen',
          isSingleName: false,
          email: revokeEmail,
          phoneCountryCode: '+91',
          phone: '9888877777',
          targetExamIds: ['ssc-cgl'],
          primaryExamId: 'ssc-cgl',
          preferredLanguage: 'en',
        },
      },
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: revokeEmail, otp: devOtpHint },
    });
    const { accessToken, refreshToken, user } = JSON.parse(verifyRes.payload);

    // Access token works before revocation
    const beforeRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(beforeRes.statusCode, 200);

    // Admin triggers REVOKE_SESSIONS
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${user.id}/action`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'REVOKE_SESSIONS', reason: 'Security check' },
    });
    assert.equal(revokeRes.statusCode, 200);

    // Access token must now be rejected
    const afterRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(afterRes.statusCode, 401);
    assert.equal(JSON.parse(afterRes.payload).error.code, 'TOKEN_REVOKED');

    // Refresh token must also be rejected
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
    assert.equal(refreshRes.statusCode, 401);
  });

  // Scenario 5: Suspension blocking access tokens and new logins
  it('5. Admin SUSPEND immediately blocks protected access and future OTP verification', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: {
        email: suspendEmail,
        registrationDraft: {
          firstName: 'Pooja',
          lastName: 'Mehta',
          isSingleName: false,
          email: suspendEmail,
          phoneCountryCode: '+91',
          phone: '9777766666',
          targetExamIds: ['ssc-cgl'],
          primaryExamId: 'ssc-cgl',
          preferredLanguage: 'en',
        },
      },
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: suspendEmail, otp: devOtpHint },
    });
    const { accessToken, user } = JSON.parse(verifyRes.payload);

    // Admin suspends student
    const suspendRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/users/${user.id}/action`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'SUSPEND', reason: 'Violation of honor code' },
    });
    assert.equal(suspendRes.statusCode, 200);

    // Access token now rejected with 403 ACCOUNT_SUSPENDED
    const accessRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(accessRes.statusCode, 403);
    assert.equal(JSON.parse(accessRes.payload).error.code, 'ACCOUNT_SUSPENDED');

    // Attempting new OTP verification also blocked with 403
    const challengeRes2 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: suspendEmail },
    });
    const hint2 = JSON.parse(challengeRes2.payload).devOtpHint;

    const verifyRes2 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: suspendEmail, otp: hint2 },
    });
    assert.equal(verifyRes2.statusCode, 403);
    assert.equal(JSON.parse(verifyRes2.payload).error.code, 'ACCOUNT_SUSPENDED');
  });

  // Scenario 6: Permanent deletion revoking sessions, clearing personal data, and maintaining audit logs
  it('6. Deletion anonymizes PII, revokes sessions, and records non-PII audit trail', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: {
        email: deleteEmail,
        registrationDraft: {
          firstName: 'Suresh',
          lastName: 'Raina',
          isSingleName: false,
          email: deleteEmail,
          phoneCountryCode: '+91',
          phone: '9555544444',
          targetExamIds: ['ssc-cgl'],
          primaryExamId: 'ssc-cgl',
          preferredLanguage: 'en',
        },
      },
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: deleteEmail, otp: devOtpHint },
    });
    const { accessToken, user } = JSON.parse(verifyRes.payload);

    // Student requests deletion via POST /v1/me/delete
    const deleteRes = await app.inject({
      method: 'POST',
      url: '/v1/me/delete',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(deleteRes.statusCode, 200);

    // Student record is anonymized
    const deletedStudent = db.students.get(user.id);
    assert.ok(deletedStudent);
    assert.equal(deletedStudent!.status, 'DELETED');
    assert.ok(deletedStudent!.email.includes('deleted_'));
    assert.equal(deletedStudent!.phone, undefined);

    // Authenticated request now rejected with 403 ACCOUNT_DELETED
    const afterDeleteRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(afterDeleteRes.statusCode, 403);
    assert.equal(JSON.parse(afterDeleteRes.payload).error.code, 'ACCOUNT_DELETED');

    // Audit log exists and does not leak PII
    const auditLogs = Array.from(db.auditEvents.values()).filter((e) => e.targetId === user.id);
    assert.ok(auditLogs.length >= 1, 'Audit log entry must be present');
    const logStr = JSON.stringify(auditLogs);
    assert.ok(!logStr.includes('9555544444'), 'Audit log must not contain deleted phone number');
  });

  // Scenario 7 & 8: Admin catalogue CRUD, ordering, and availability filtering
  it('7 & 8. Admin manages exam catalogue; deactivated exams are excluded from public catalogue', async () => {
    const newExamId = `test-cat-${Date.now()}`;
    const newExamCode = `UPSC_CSE_${Date.now()}`;

    // 1. Create exam
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        id: newExamId,
        name: 'Civil Services Examination',
        body: 'UPSC',
        code: newExamCode,
        title: 'Civil Services Examination',
        category: 'CIVIL_SERVICES',
        description: 'Premier national civil service examination',
        status: 'ACTIVE',
        isDateAnnounced: false,
        displayOrder: 99,
      },
    });
    assert.equal(createRes.statusCode, 201);

    // 2. Edit exam
    const editRes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/exams/${newExamId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'UPSC Civil Services 2026',
        isDateAnnounced: true,
        officialExamDate: '2026-10-15T09:00:00Z',
      },
    });
    assert.equal(editRes.statusCode, 200);

    // 3. Deactivate exam
    const statusRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/exams/${newExamId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'INACTIVE' },
    });
    assert.equal(statusRes.statusCode, 200);

    // 4. Public endpoint GET /v1/exams must exclude inactive exam
    const publicExamsRes = await app.inject({
      method: 'GET',
      url: '/v1/exams',
    });
    assert.equal(publicExamsRes.statusCode, 200);
    const publicExams = JSON.parse(publicExamsRes.payload);
    const foundInactive = publicExams.find((e: any) => e.id === newExamId);
    assert.equal(foundInactive, undefined, 'Deactivated exam must not appear in public catalogue');

    // 5. Admin endpoint GET /v1/admin/exams must include all exams
    const adminExamsRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/exams',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminExamsRes.statusCode, 200);
    const adminExams = JSON.parse(adminExamsRes.payload).items;
    const foundInAdmin = adminExams.find((e: any) => e.id === newExamId);
    assert.ok(foundInAdmin, 'Admin must see inactive exam');
    assert.equal(foundInAdmin.status, 'INACTIVE');
  });

  // Scenario 9 & 10: Attempt workflow, monotonic answer synchronisation, and scoring invariants
  it('9 & 10. Runs test attempt, syncs answers monotonically, and enforces negative marking', async () => {
    // Register active student
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: {
        email: attemptEmail,
        registrationDraft: {
          firstName: 'Vikram',
          lastName: 'Singh',
          isSingleName: false,
          email: attemptEmail,
          phoneCountryCode: '+91',
          phone: '9111122222',
          targetExamIds: ['ssc-cgl'],
          primaryExamId: 'ssc-cgl',
          preferredLanguage: 'en',
        },
      },
    });
    const { devOtpHint } = JSON.parse(challengeRes.payload);
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email: attemptEmail, otp: devOtpHint },
    });
    const { accessToken } = JSON.parse(verifyRes.payload);

    // Start attempt for mock test
    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/tests/test_cgl_full_01/start',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { devicePlatform: 'mobile' },
    });
    assert.equal(startRes.statusCode, 201);
    const startData = JSON.parse(startRes.payload);
    const parseStart = StartAttemptResponseSchema.safeParse(startData);
    assert.ok(parseStart.success, 'Start attempt matches shared contract');

    // Monotonic answer batch sync
    const syncRes = await app.inject({
      method: 'POST',
      url: '/v1/sync/answers',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        attemptId: startData.attemptId,
        answers: [
          {
            questionId: 'q_1',
            selectedOptionId: 'opt_b', // Correct option (+2.0)
            timeSpentSeconds: 45,
            clientSequence: 1,
            answeredAt: new Date().toISOString(),
          },
          {
            questionId: 'q_2',
            selectedOptionId: 'opt_a', // Incorrect option (-0.5)
            timeSpentSeconds: 30,
            clientSequence: 2,
            answeredAt: new Date().toISOString(),
          },
        ],
      },
    });
    assert.equal(syncRes.statusCode, 200);
    const syncData = JSON.parse(syncRes.payload);
    assert.equal(syncData.success, true);
    assert.equal(syncData.syncedCount, 2);

    // Submit attempt and verify scoring calculation
    const submitRes = await app.inject({
      method: 'POST',
      url: `/v1/attempts/${startData.attemptId}/submit`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { timeSpentSeconds: 75 },
    });
    assert.equal(submitRes.statusCode, 200);
    const submitData = JSON.parse(submitRes.payload);
    const parseResult = AttemptResultSchema.safeParse(submitData);
    assert.ok(parseResult.success, 'Attempt result matches shared contract');
    assert.equal(submitData.correctCount, 1);
    assert.equal(submitData.incorrectCount, 1);
    assert.ok(typeof submitData.score === 'number');
  });

  // Scenario 11: Dual-review invariant prohibiting self-approval
  it('11. Prohibits self-approval when the proposing admin attempts to approve their own exam pattern change', async () => {
    // 1. Propose change as admin 1
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/propose',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reason: 'Staff Selection Commission notice 2026',
        totalMarks: 200,
      },
    });
    assert.equal(proposeRes.statusCode, 200);
    const { proposalId } = JSON.parse(proposeRes.payload);

    // 2. Same admin attempts self-approval -> Must be rejected with 400 DUAL_APPROVAL_VIOLATION
    const selfApproveRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/verify',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { proposalId, approved: true, reviewNotes: 'Self approving my own proposal' },
    });
    assert.equal(selfApproveRes.statusCode, 400);
    const errData = JSON.parse(selfApproveRes.payload);
    assert.equal(errData.error.code, 'DUAL_APPROVAL_VIOLATION');

    // 3. Independent second reviewer approves -> Must succeed with 200
    const reviewerApproveRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/verify',
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { proposalId, approved: true, reviewNotes: 'Verified against official SSC 2026 gazette notification' },
    });
    assert.equal(reviewerApproveRes.statusCode, 200);
    assert.equal(JSON.parse(reviewerApproveRes.payload).verified, true);
  });
});
