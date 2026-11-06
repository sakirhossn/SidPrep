import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { signJwt } from '../lib/security.js';

describe('SidPrep 2.0 Shared API Test Suite', async () => {
  const app = await buildServer();
  const testAdminToken = signJwt({ sub: 'adm_1', email: 'admin@sidprep.in', role: 'SUPER_ADMIN' }, '1h');

  it('1. Health check returns 200 with operational checks and brevo quota', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'healthy');
    assert.equal(body.checks.database, 'connected');
    assert.equal(body.checks.brevoQuota.limit, 300);
    assert.ok(res.headers['x-request-id']);
  });

  it('2. Quota dashboard enforces admin authentication and reports free-tier metrics', async () => {
    // 2a. Unauthenticated read must fail with 401 Unauthorized
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/quotas',
    });
    assert.equal(unauthRes.statusCode, 401);

    // 2b. Authenticated staff read succeeds with 200 OK
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/quotas',
      headers: {
        authorization: `Bearer ${testAdminToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.oracleCloud.allocatedCpus, 2);
    assert.equal(body.oracleCloud.allocatedMemoryMb, 12288);
    assert.equal(body.brevoEmail.dailyQuota, 300);
    assert.equal(body.cloudflareR2.status, 'WITHIN_FREE_ALLOWANCE');
  });

  it('3. Student OTP challenge and verify workflow works with Brevo quota tracking', async () => {
    const testEmail = 'student.candidate@sidprep.in';

    // Step 1: Challenge
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: testEmail },
    });

    assert.equal(challengeRes.statusCode, 200);
    const challengeBody = JSON.parse(challengeRes.body);
    assert.equal(challengeBody.success, true);
    assert.ok(challengeBody.devOtpHint, 'devOtpHint present in development mode');

    // Step 2: Verify with correct OTP
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: {
        email: testEmail,
        otp: challengeBody.devOtpHint,
      },
    });

    assert.equal(verifyRes.statusCode, 200);
    const verifyBody = JSON.parse(verifyRes.body);
    assert.equal(verifyBody.success, true);
    assert.ok(verifyBody.accessToken);
    assert.equal(verifyBody.user.email, testEmail);
  });

  it('4. Dual-Admin verification invariant: Creator CANNOT approve own pattern change', async () => {
    // Propose update
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/admin/exams/patterns/ssc-cgl/propose',
      headers: {
        authorization: 'Bearer dummy',
      },
      payload: { syllabusUpdate: 'Revised Quantitative Reasoning' },
    });

    // Test the dual verification endpoint directly using admin token
    // First log in as super admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/login',
      payload: {
        email: 'admin@sidprep.in',
        password: 'AdminSecurePass123!',
      },
    });
    assert.equal(loginRes.statusCode, 200);
    const { preAuthToken } = JSON.parse(loginRes.body);

    const totpRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/verify-totp',
      payload: {
        preAuthToken,
        totpCode: '123456',
      },
    });
    assert.equal(totpRes.statusCode, 200);
    const { adminToken } = JSON.parse(totpRes.body);

    // Try to self-approve with same actor ID (adm_1)
    const selfApproveRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/exams/patterns/ssc-cgl/verify',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        proposedByActorId: 'adm_1', // Same creator
        approved: true,
      },
    });

    assert.equal(selfApproveRes.statusCode, 400);
    const errBody = JSON.parse(selfApproveRes.body);
    assert.equal(errBody.error.code, 'DUAL_APPROVAL_VIOLATION');
  });

  it('5. Resource Library: Enforces previewAllowed vs downloadAllowed', async () => {
    // res_rrb_science_notes has downloadAllowed = false
    const downloadRes = await app.inject({
      method: 'GET',
      url: '/v1/resources/res_rrb_science_notes/download',
    });

    assert.equal(downloadRes.statusCode, 403);
    const errBody = JSON.parse(downloadRes.body);
    assert.equal(errBody.error.code, 'DOWNLOAD_DENIED');

    // Preview should succeed
    const previewRes = await app.inject({
      method: 'GET',
      url: '/v1/resources/res_rrb_science_notes/preview',
    });

    assert.equal(previewRes.statusCode, 200);
    const previewBody = JSON.parse(previewRes.body);
    assert.equal(previewBody.previewType, 'HTML');
    assert.equal(previewBody.downloadAllowed, false);
  });

  it('6. Test Runner & Scoring: Accurate calculation of positive & negative marks', async () => {
    // Start attempt
    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/attempts',
      payload: { testId: 'test_cgl_full_01' },
    });

    assert.equal(startRes.statusCode, 201);
    const { attemptId } = JSON.parse(startRes.body);

    // Submit attempt with 1 correct answer (q_1 -> opt_b) and 1 wrong answer (q_2 -> opt_a)
    // q_1: +2.0, q_2: -0.5 => Net score: 1.5
    const submitRes = await app.inject({
      method: 'POST',
      url: `/v1/attempts/${attemptId}/submit`,
      payload: {
        answers: [
          { questionId: 'q_1', selectedOptionId: 'opt_b' },
          { questionId: 'q_2', selectedOptionId: 'opt_a' },
        ],
        timeSpentSeconds: 600,
      },
    });

    assert.equal(submitRes.statusCode, 200);
    const result = JSON.parse(submitRes.body);
    assert.equal(result.score, 1.5);
    assert.equal(result.correctCount, 1);
    assert.equal(result.wrongCount, 1);
    assert.equal(result.accuracy, 50);
  });

  it('7. Audit Logging: Audit trail contains immutable events', async () => {
    assert.ok(db.auditEvents.length > 0);
    const latestEvent = db.auditEvents[0];
    assert.ok(latestEvent.actorId);
    assert.ok(latestEvent.module);
    assert.ok(latestEvent.action);
    assert.ok(latestEvent.createdAt);
  });

  it('8. Admin 2FA Email OTP and Master Credentials Login', async () => {
    // Step 1: Login with owner email
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/login',
      payload: {
        email: 'sksakirhossain8@gmail.com',
        password: 'AdminSecurePass123!',
      },
    });
    assert.equal(loginRes.statusCode, 200);
    const { preAuthToken } = JSON.parse(loginRes.body);
    assert.ok(preAuthToken);

    // Step 2: Request 2FA OTP via Brevo Email
    const emailOtpRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/send-email-otp',
      payload: { preAuthToken },
    });
    assert.equal(emailOtpRes.statusCode, 200);
    const emailOtpBody = JSON.parse(emailOtpRes.body);
    assert.equal(emailOtpBody.success, true);
    assert.ok(emailOtpBody.devOtpHint);

    // Step 3: Verify using the emailed OTP
    const verifyTotpRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/verify-totp',
      payload: {
        preAuthToken,
        totpCode: emailOtpBody.devOtpHint,
      },
    });
    assert.equal(verifyTotpRes.statusCode, 200);
    const verifyTotpBody = JSON.parse(verifyTotpRes.body);
    assert.equal(verifyTotpBody.success, true);
    assert.ok(verifyTotpBody.adminToken);
    assert.equal(verifyTotpBody.email, 'sksakirhossain8@gmail.com');
  });

  it('9. Website Page CMS: Create, Fetch, and Update dynamic page', async () => {
    const adminToken = testAdminToken;

    // Create custom page
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Syllabus Breakdown 2026',
        slug: 'syllabus-breakdown-2026',
        subtitle: 'Comprehensive topics list for SSC and RRB',
        contentHtml: '<p>Complete topic-wise weightage and breakdown.</p>',
        isPublished: true,
      },
    });
    assert.equal(createRes.statusCode, 201);
    const createdPage = JSON.parse(createRes.body).page;
    assert.equal(createdPage.slug, 'syllabus-breakdown-2026');

    // Fetch public page
    const publicRes = await app.inject({
      method: 'GET',
      url: '/v1/pages/syllabus-breakdown-2026',
    });
    assert.equal(publicRes.statusCode, 200);
    const publicPage = JSON.parse(publicRes.body);
    assert.equal(publicPage.title, 'Syllabus Breakdown 2026');

    // System pages seeded: verify /about exists
    const aboutRes = await app.inject({
      method: 'GET',
      url: '/v1/pages/about',
    });
    assert.equal(aboutRes.statusCode, 200);
    assert.equal(JSON.parse(aboutRes.body).slug, 'about');
  });

  it('10. Admin Profile & Password Change workflow', async () => {
    const adminToken = testAdminToken;

    // Read profile
    const profileRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/profile',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(profileRes.statusCode, 200);
    const profile = JSON.parse(profileRes.body);
    assert.equal(profile.email, 'admin@sidprep.in');

    // Change password
    const pwdRes = await app.inject({
      method: 'PUT',
      url: '/v1/admin/profile/password',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        currentPassword: 'AdminSecurePass123!',
        newPassword: 'BrandNewSecurePassword2026!',
      },
    });
    assert.equal(pwdRes.statusCode, 200);
    assert.equal(JSON.parse(pwdRes.body).success, true);
  });

  it('11. App Version & Automatic Update Checker endpoint', async () => {
    // Public endpoint for mobile clients
    const versionRes = await app.inject({
      method: 'GET',
      url: '/v1/app/version',
    });
    assert.equal(versionRes.statusCode, 200);
    const version = JSON.parse(versionRes.body);
    assert.equal(version.success, true);
    assert.equal(version.currentVersion, '2.0.1');
    assert.ok(version.apkUrl);
  });

  it('12. Purge Demo Data endpoint preserves taxonomy & staff', async () => {
    const adminToken = testAdminToken;

    const purgeRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/maintenance/purge-demo',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clearQuestions: true,
        clearTests: true,
        clearNews: true,
        clearResources: false,
        clearAttempts: true,
        clearStudents: false,
      },
    });

    assert.equal(purgeRes.statusCode, 200);
    const purgeBody = JSON.parse(purgeRes.body);
    assert.equal(purgeBody.success, true);
    assert.ok(purgeBody.clearedCount > 0);

    // Verify questions and tests were cleared
    assert.equal(db.questions.size, 0);
    assert.equal(db.tests.size, 0);

    // Verify official exams taxonomy was preserved
    assert.ok(db.exams.size > 0);
    // Verify staff was preserved
    assert.ok(db.adminUsers.size > 0);
  });
});
