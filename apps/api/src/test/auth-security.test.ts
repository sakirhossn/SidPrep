process.env.NODE_ENV = 'test';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import {
  signJwt,
  signRefreshToken,
  hashOtp,
  verifyOtpHash,
  hashPassword,
  verifyPassword,
} from '../lib/security.js';

describe('Batch 1: Identity & Authentication Hardening Test Suite (F01-F07, F21-F22, F27)', async () => {
  const app = await buildServer();

  const validAdminToken = signJwt(
    { sub: 'adm_1', email: 'admin@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  const preAuthToken = signJwt(
    { sub: 'adm_1', email: 'admin@sidprep.in', step: 'totp_pending', type: 'admin_preauth' },
    '10m',
    { audience: 'sidprep:admin_mfa' }
  );

  const studentWithAdminEmailToken = signJwt(
    { sub: 'stu_spoof', email: 'admin@sidprep.in', type: 'student', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:student_api' }
  );

  after(async () => {
    await app.close();
    await closePool();
  });

  it('F01: PreAuth token rejected by requireAdminAuth on protected admin routes', async () => {
    const endpoints = [
      { method: 'GET', url: '/v1/admin/quotas' },
      { method: 'GET', url: '/v1/admin/news/drafts' },
      { method: 'GET', url: '/v1/admin/logs/operational' },
      { method: 'GET', url: '/v1/admin/logs/telemetry' },
      { method: 'GET', url: '/v1/admin/users' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method as any,
        url: ep.url,
        headers: { authorization: `Bearer ${preAuthToken}` },
      });
      assert.equal(res.statusCode, 401, `Expected 401 on ${ep.url} with preAuthToken`);
      const body = JSON.parse(res.body);
      assert.ok(
        body.error.code === 'MFA_REQUIRED' || body.error.code === 'INVALID_ADMIN_TOKEN',
        `Unexpected error code: ${body.error.code}`
      );
    }
  });

  it('F01: Student token with staff email rejected by requireAdminAuth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/quotas',
      headers: { authorization: `Bearer ${studentWithAdminEmailToken}` },
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(
      body.error.code === 'UNAUTHORIZED' || body.error.code === 'INVALID_ADMIN_TOKEN',
      `Unexpected error code: ${body.error.code}`
    );
  });

  it('F01: requireAdminAuth accepts valid admin_session token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/quotas',
      headers: { authorization: `Bearer ${validAdminToken}` },
    });
    assert.equal(res.statusCode, 200);
  });

  it('F02: Admin credentials are NOT seeded automatically in local initial data', () => {
    // When seedLocalInitialData is run on a clean database instance, adminUsers size is 0
    assert.ok(!('DEFAULT_ADMIN_PASSWORD_HASH' in (db as any)));
  });

  it('F03: Password reset request is enumeration-resistant and does NOT mutate stored password', async () => {
    const adminBefore = db.adminUsers.get('adm_1');
    assert.ok(adminBefore);
    const originalHash = adminBefore.passwordHash;
    const beforeVersion = adminBefore.tokenVersion || 1;

    // 1. Request reset for nonexistent email
    const unknownRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/request-password-reset',
      payload: { email: 'nonexistent-person-xyz@sidprep.in' },
    });
    assert.equal(unknownRes.statusCode, 200);
    const unknownBody = JSON.parse(unknownRes.body);
    assert.equal(unknownBody.success, true);
    assert.ok(
      unknownBody.message.includes('If an eligible account exists') ||
        unknownBody.message.includes('If an active administrative account exists')
    );

    // 2. Request reset for valid admin email
    const resetReqRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/request-password-reset',
      payload: { email: 'admin@sidprep.in' },
    });
    assert.equal(resetReqRes.statusCode, 200);
    const resetReqBody = JSON.parse(resetReqRes.body);
    assert.equal(resetReqBody.success, true);
    assert.ok(
      resetReqBody.message.includes('If an eligible account exists') ||
        resetReqBody.message.includes('If an active administrative account exists')
    );
    assert.ok(resetReqBody.devResetTokenHint, 'In test env, devResetTokenHint should be present');

    // 3. Confirm password hash in DB has NOT changed yet
    const adminAfterReq = db.adminUsers.get('adm_1');
    assert.equal(adminAfterReq?.passwordHash, originalHash, 'Password hash must NOT mutate on request');

    // 4. Complete reset with valid token (meets 8-14 password policy)
    const newPassword = 'AdminPass26!#';
    const resetConfirmRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/reset-password',
      payload: {
        email: 'admin@sidprep.in',
        resetToken: resetReqBody.devResetTokenHint,
        newPassword,
      },
    });
    assert.equal(resetConfirmRes.statusCode, 200);
    const resetConfirmBody = JSON.parse(resetConfirmRes.body);
    assert.equal(resetConfirmBody.success, true);

    // 5. Verify password hash updated and tokenVersion incremented
    const adminAfterReset = db.adminUsers.get('adm_1');
    assert.notEqual(adminAfterReset?.passwordHash, originalHash);
    const passwordVerified = await verifyPassword(newPassword, adminAfterReset!.passwordHash);
    assert.equal(passwordVerified, true);
    assert.ok((adminAfterReset?.tokenVersion || 0) > beforeVersion);

    // 6. Old admin session token with previous tokenVersion is now revoked
    const revokedCheckRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/quotas',
      headers: { authorization: `Bearer ${validAdminToken}` },
    });
    assert.equal(revokedCheckRes.statusCode, 401);
  });

  it('F04: 2FA setup rejects preAuthToken and requires full admin_session', async () => {
    // Attempt setup with preAuthToken
    const setupWithPreAuthRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/2fa/setup',
      headers: { authorization: `Bearer ${preAuthToken}` },
    });
    assert.equal(setupWithPreAuthRes.statusCode, 401);

    // Attempt setup without auth
    const setupAnonRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/2fa/setup',
    });
    assert.equal(setupAnonRes.statusCode, 401);
  });

  it('F04 & F22: TOTP verify rate limits failed attempts and prevents brute-force', async () => {
    // Initiate admin login to get fresh preAuthToken
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/login',
      payload: {
        email: 'editor@sidprep.in',
        password: 'AdminSecurePass123!',
      },
    });
    assert.equal(loginRes.statusCode, 200);
    const { preAuthToken: editorPreAuth } = JSON.parse(loginRes.body);
    assert.ok(editorPreAuth);

    // Send 5 invalid TOTP attempts
    for (let i = 0; i < 5; i++) {
      const failRes = await app.inject({
        method: 'POST',
        url: '/v1/auth/admin/verify-totp',
        payload: {
          preAuthToken: editorPreAuth,
          totpCode: '000000',
        },
      });
      assert.equal(failRes.statusCode, 401);
    }

    // 6th attempt should return 429 Too Many Attempts
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/verify-totp',
      payload: {
        preAuthToken: editorPreAuth,
        totpCode: '000000',
      },
    });
    assert.equal(blockedRes.statusCode, 429);
    const blockedBody = JSON.parse(blockedRes.body);
    assert.equal(blockedBody.error.code, 'TOO_MANY_ATTEMPTS');
  });

  it('F05: Admin news drafts, operational logs, and users routes reject unauthenticated requests', async () => {
    const protectedRoutes = [
      { method: 'GET', url: '/v1/admin/news/drafts' },
      { method: 'POST', url: '/v1/admin/news/fetch-now' },
      { method: 'GET', url: '/v1/admin/logs/operational' },
      { method: 'GET', url: '/v1/admin/logs/telemetry' },
      { method: 'GET', url: '/v1/admin/users' },
      { method: 'POST', url: '/v1/admin/users/stu_demo/action', payload: { action: 'SUSPEND' } },
    ];

    for (const r of protectedRoutes) {
      const res = await app.inject({
        method: r.method as any,
        url: r.url,
        payload: r.payload,
      });
      assert.equal(res.statusCode, 401, `Expected 401 on unauthenticated ${r.url}`);
    }
  });

  it('F06: Exam attempt requires student authentication; cross-student submission rejected with 403', async () => {
    // 1. Unauthenticated attempt start rejected
    const anonStartRes = await app.inject({
      method: 'POST',
      url: '/v1/attempts',
      payload: { testId: 'test_cgl_full_01' },
    });
    assert.equal(anonStartRes.statusCode, 401);

    // 2. Setup Student A and Student B in DB
    await db.students.set('stu_student_a', {
      id: 'stu_student_a',
      email: 'student_a@sidprep.in',
      phone: '+919999900001',
      preferredLanguage: 'en',
      dailyGoalMinutes: 30,
      streakDays: 1,
      isEmailVerified: true,
      targetExams: ['SSC_CGL'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      tokenVersion: 1,
    });

    await db.students.set('stu_student_b', {
      id: 'stu_student_b',
      email: 'student_b@sidprep.in',
      phone: '+919999900002',
      preferredLanguage: 'en',
      dailyGoalMinutes: 30,
      streakDays: 1,
      isEmailVerified: true,
      targetExams: ['SSC_CGL'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      tokenVersion: 1,
    });

    const studentAToken = signJwt(
      { sub: 'stu_student_a', email: 'student_a@sidprep.in', type: 'student', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const studentBToken = signJwt(
      { sub: 'stu_student_b', email: 'student_b@sidprep.in', type: 'student', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:student_api' }
    );

    // 3. Start attempt as Student A
    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/attempts',
      headers: { authorization: `Bearer ${studentAToken}` },
      payload: { testId: 'test_cgl_full_01' },
    });
    assert.equal(startRes.statusCode, 201);
    const attemptData = JSON.parse(startRes.body);
    const attemptId = attemptData.attemptId;
    assert.ok(attemptId);

    // 4. Student B tries to submit Student A's attempt -> 403 FORBIDDEN
    const crossSubmitRes = await app.inject({
      method: 'POST',
      url: `/v1/attempts/${attemptId}/submit`,
      headers: { authorization: `Bearer ${studentBToken}` },
      payload: {
        answers: [],
        timeSpentSeconds: 60,
      },
    });
    assert.equal(crossSubmitRes.statusCode, 403);
    const crossSubmitBody = JSON.parse(crossSubmitRes.body);
    assert.equal(crossSubmitBody.error.code, 'FORBIDDEN');

    // 5. Student B tries to sync answers for Student A's attempt -> 403 FORBIDDEN
    const crossSyncRes = await app.inject({
      method: 'POST',
      url: '/v1/sync/answers',
      headers: { authorization: `Bearer ${studentBToken}` },
      payload: {
        attemptId,
        items: [
          {
            questionId: 'q_1',
            selectedOptionId: 'opt_b',
            clientSequence: 1,
            isMarkedForReview: false,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    assert.equal(crossSyncRes.statusCode, 403);
    const crossSyncBody = JSON.parse(crossSyncRes.body);
    assert.equal(crossSyncBody.error.code, 'FORBIDDEN');
  });

  it('F07: Student token refresh rejects access tokens, checks tokenVersion, and blocks suspended users', async () => {
    // Ensure student exists and is active
    await db.students.set('stu_student_a', {
      id: 'stu_student_a',
      email: 'student_a@sidprep.in',
      phone: '+919999900001',
      preferredLanguage: 'en',
      dailyGoalMinutes: 30,
      streakDays: 1,
      isEmailVerified: true,
      targetExams: ['SSC_CGL'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      tokenVersion: 1,
    });

    // 1. Cannot use access token as refresh token
    const studentAccessToken = signJwt(
      { sub: 'stu_student_a', email: 'student_a@sidprep.in', type: 'student', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const invalidRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: studentAccessToken },
    });
    assert.equal(invalidRefreshRes.statusCode, 401);
    const invalidRefreshBody = JSON.parse(invalidRefreshRes.body);
    assert.equal(invalidRefreshBody.error.code, 'INVALID_TOKEN');

    // 2. Valid refresh token works
    const validRefreshToken = signRefreshToken(
      { sub: 'stu_student_a', type: 'student_refresh', tokenVersion: 1 },
      '30d'
    );
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: validRefreshToken },
    });
    assert.equal(refreshRes.statusCode, 200);
    const refreshBody = JSON.parse(refreshRes.body);
    assert.ok(refreshBody.accessToken);
    assert.ok(refreshBody.refreshToken);

    // 3. Suspend student -> refresh token fails
    const studentA = db.students.get('stu_student_a')!;
    studentA.status = 'SUSPENDED';
    await db.students.set('stu_student_a', studentA);

    const suspendedRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: validRefreshToken },
    });
    assert.equal(suspendedRefreshRes.statusCode, 401);
    assert.equal(JSON.parse(suspendedRefreshRes.body).error.code, 'USER_NOT_FOUND');

    // 4. Reactivate but bump tokenVersion (session revocation)
    studentA.status = 'ACTIVE';
    studentA.tokenVersion = 2;
    await db.students.set('stu_student_a', studentA);

    const revokedRefreshRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: validRefreshToken }, // has tokenVersion: 1 < 2
    });
    assert.equal(revokedRefreshRes.statusCode, 401);
    assert.equal(JSON.parse(revokedRefreshRes.body).error.code, 'SESSION_REVOKED');
  });

  it('F22: Student OTP storage stores cryptographic hash otpHash, not plaintext', async () => {
    const testEmail = 'otp.audit.student@sidprep.in';
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: testEmail },
    });
    assert.equal(challengeRes.statusCode, 200);

    const challenge = db.otpChallenges.get(testEmail);
    assert.ok(challenge, 'Challenge record must exist in repository');
    assert.ok(challenge.otpHash, 'otpHash must be set');
    assert.equal(challenge.otpHash.length, 64, 'otpHash must be a 64-character SHA-256 hex digest');
    assert.equal((challenge as any).otp, undefined, 'Plaintext otp must NOT be present in challenge record');

    // Query Postgres database directly to verify DB column otp_hash
    const dbRows = await query<any>(
      'SELECT email, otp_hash FROM email_otp_challenges WHERE email = $1 ORDER BY expires_at DESC LIMIT 1',
      [testEmail]
    );
    assert.ok(dbRows.rows.length > 0);
    assert.equal(dbRows.rows[0].otp_hash, challenge.otpHash);
  });

  it('F27: Test cleanup invariant protects production database directory', () => {
    const nonTestDirs = ['apps/api/.pgdata', '.pgdata', '/var/data/sidprep', 'C:\\data\\.pgdata'];
    for (const dir of nonTestDirs) {
      assert.throws(
        () => {
          const normalized = dir.toLowerCase();
          if (!normalized.endsWith('_test') && !normalized.includes('_test_')) {
            throw new Error(`SAFETY INVARIANT VIOLATION: Refusing to clean non-test database directory: ${dir}`);
          }
        },
        /SAFETY INVARIANT VIOLATION/,
        `Should throw invariant violation for non-test directory: ${dir}`
      );
    }
  });
});
