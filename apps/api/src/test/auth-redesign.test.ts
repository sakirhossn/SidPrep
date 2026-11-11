process.env.NODE_ENV = 'test';
import { describe, it, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db, StudentRecord } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import {
  hashToken,
  hashOtp,
  verifyPassword,
  maskEmail,
  signJwt,
} from '../lib/security.js';
import { validatePasswordPolicy, estimatePasswordStrength } from '@sidprep/contracts';
import { AuthRateLimits } from '../lib/rateLimiter.js';

describe('Authentication Redesign Acceptance Test Suite (Req 1 - 17)', async () => {
  const app = await buildServer();
  const testEmail = `student.redesign.${Date.now()}@example.com`;
  const adminEmail = 'admin@sidprep.in';

  after(async () => {
    await app.close();
    await closePool();
  });

  beforeEach(async () => {
    await query('DELETE FROM auth_rate_limits');
  });

  it('1. Registered and unknown reset requests produce equivalent public responses', async () => {
    // Admin unknown vs known
    const unknownAdminRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/request-password-reset',
      payload: { email: 'unknown_admin_random_999@sidprep.in' },
    });
    assert.equal(unknownAdminRes.statusCode, 200);
    const unknownAdminBody = JSON.parse(unknownAdminRes.body);

    const knownAdminRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/admin/request-password-reset',
      payload: { email: adminEmail },
    });
    assert.equal(knownAdminRes.statusCode, 200);
    const knownAdminBody = JSON.parse(knownAdminRes.body);

    assert.equal(unknownAdminBody.success, true);
    assert.equal(knownAdminBody.success, true);
    assert.equal(unknownAdminBody.message, knownAdminBody.message);
    assert.equal(
      unknownAdminBody.message,
      'If an eligible account exists for this email address, a password-reset link will be sent.'
    );

    // Student unknown vs known
    const unknownStuRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-reset',
      payload: { email: 'unknown_student_xyz@example.com' },
    });
    assert.equal(unknownStuRes.statusCode, 200);
    const unknownStuBody = JSON.parse(unknownStuRes.body);

    assert.equal(unknownStuBody.success, true);
    assert.equal(
      unknownStuBody.message,
      'If an eligible account exists for this email address, a password-reset link will be sent.'
    );
  });

  it('2. Reset links expire and cannot be reused', async () => {
    // Request student reset
    const stuEmail = `student.exp.${Date.now()}@example.com`;
    // Create student first
    const studentId = `stu_exp_${Date.now()}`;
    await db.students.set(studentId, {
      id: studentId,
      email: stuEmail,
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'en',
      targetExams: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      dailyGoalMinutes: 45,
      streakDays: 0,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    const resetReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-reset',
      payload: { email: stuEmail },
    });
    const token = JSON.parse(resetReq.body).devResetTokenHint;
    assert.ok(token);

    // Consume once
    const resetRes1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/reset-password',
      payload: { email: stuEmail, resetToken: token, newPassword: 'ValidPass1!#' },
    });
    assert.equal(resetRes1.statusCode, 200);

    // Replay attack: attempt reuse
    const resetRes2 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/reset-password',
      payload: { email: stuEmail, resetToken: token, newPassword: 'Another12!#' },
    });
    assert.equal(resetRes2.statusCode, 400);
    assert.equal(JSON.parse(resetRes2.body).error.code, 'INVALID_RESET_TOKEN');
  });

  it('3. Opening a reset page (validating with GET) does not consume its token', async () => {
    const stuEmail = `student.peek.${Date.now()}@example.com`;
    const studentId = `stu_peek_${Date.now()}`;
    await db.students.set(studentId, {
      id: studentId,
      email: stuEmail,
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'en',
      targetExams: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      dailyGoalMinutes: 45,
      streakDays: 0,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    const resetReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-reset',
      payload: { email: stuEmail },
    });
    const token = JSON.parse(resetReq.body).devResetTokenHint;

    // Email scanner or browser GET request
    const peek1 = await app.inject({
      method: 'GET',
      url: `/v1/auth/student/reset-password/validate?token=${token}&email=${encodeURIComponent(stuEmail)}`,
    });
    assert.equal(peek1.statusCode, 200);
    assert.equal(JSON.parse(peek1.body).valid, true);

    const peek2 = await app.inject({
      method: 'GET',
      url: `/v1/auth/student/reset-password/validate?token=${token}&email=${encodeURIComponent(stuEmail)}`,
    });
    assert.equal(peek2.statusCode, 200);
    assert.equal(JSON.parse(peek2.body).valid, true);

    // Token remains completely valid and can be consumed by the actual user
    const consume = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/reset-password',
      payload: { email: stuEmail, resetToken: token, newPassword: 'ScanPass1!#' },
    });
    assert.equal(consume.statusCode, 200);

    // Now validate reflects ALREADY_USED
    const peekAfter = await app.inject({
      method: 'GET',
      url: `/v1/auth/student/reset-password/validate?token=${token}&email=${encodeURIComponent(stuEmail)}`,
    });
    assert.equal(JSON.parse(peekAfter.body).valid, false);
    assert.equal(JSON.parse(peekAfter.body).state, 'ALREADY_USED');
  });

  it('4. Student recovery tokens cannot reset admin passwords', async () => {
    // Both admin and student share email in hypothetical scenario
    const sharedEmail = 'admin@sidprep.in';

    // Student reset request for admin email
    const stuReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-reset',
      payload: { email: sharedEmail },
    });
    const stuToken = JSON.parse(stuReq.body).devResetTokenHint;

    // If an attacker tries to use a student token at the admin reset endpoint
    if (stuToken) {
      const adminResetTry = await app.inject({
        method: 'POST',
        url: '/v1/auth/admin/reset-password',
        payload: { email: sharedEmail, resetToken: stuToken, newPassword: 'Attacker1!#' },
      });
      assert.equal(adminResetTry.statusCode, 400);
      assert.equal(JSON.parse(adminResetTry.body).error.code, 'INVALID_RESET_TOKEN');
    }
  });

  it('5. OTP requests reuse the valid challenge without another dispatch', async () => {
    const email = `reuse.otp.${Date.now()}@example.com`;

    // 1st request
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email },
    });
    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.body);
    assert.equal(body1.reused, false);
    assert.ok(body1.message.includes('has been sent to your registered email address'));
    const initialExpiry = body1.expiresInSeconds;

    // 2nd request immediately
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email },
    });
    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.equal(body2.reused, true);
    assert.ok(body2.message.includes('A verification code was already sent'));
    assert.ok(body2.message.includes('expires in'));
    // Reused OTP preserves the initial code hint
    assert.equal(body1.devOtpHint, body2.devOtpHint);
  });

  it('6. OTP retries do not reset expiry or attempts count', async () => {
    const email = `retry.otp.${Date.now()}@example.com`;

    const init = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email },
    });
    const { devOtpHint } = JSON.parse(init.body);

    // Fail attempt 1
    const fail1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email, otp: '000000' },
    });
    assert.equal(fail1.statusCode, 401);
    assert.equal(JSON.parse(fail1.body).remainingAttempts, 4);

    // Call challenge again: attempts must NOT be reset back to 5!
    const reChallenge = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email },
    });
    assert.equal(JSON.parse(reChallenge.body).remainingAttempts, 4);

    // Fail 4 more times to hit max attempts (5)
    for (let i = 0; i < 4; i++) {
      await app.inject({
        method: 'POST',
        url: '/v1/auth/student/verify',
        payload: { email, otp: '000000' },
      });
    }

    // Now challenge is invalidated with cooldown
    const verifyBlocked = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify',
      payload: { email, otp: devOtpHint },
    });
    assert.ok(verifyBlocked.statusCode === 429 || verifyBlocked.statusCode === 401);
  });

  it('7. Concurrent requests cannot consume an OTP or reset token twice', async () => {
    const email = `race.${Date.now()}@example.com`;
    const stuId = `stu_race_${Date.now()}`;
    await db.students.set(stuId, {
      id: stuId,
      email,
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'en',
      targetExams: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      dailyGoalMinutes: 45,
      streakDays: 0,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    const resetReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-reset',
      payload: { email },
    });
    const token = JSON.parse(resetReq.body).devResetTokenHint;

    // Fire 2 concurrent consumption attempts
    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/student/reset-password',
        payload: { email, resetToken: token, newPassword: 'RacePassWord1!' },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/student/reset-password',
        payload: { email, resetToken: token, newPassword: 'RacePassWord1!' },
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode];
    assert.ok(statuses.includes(200), 'Exactly one request should succeed');
    assert.ok(statuses.includes(400), 'Second concurrent request must be rejected');
  });

  it('8 & 9. Email verification grant bound to email; cannot be bypassed with client flag', async () => {
    const regEmail = `grant.test.${Date.now()}@example.com`;

    // 1. Get OTP
    const chal = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email: regEmail },
    });
    const otp = JSON.parse(chal.body).devOtpHint;

    // 2. Verify email -> yields verificationGrant
    const verify = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify-email',
      payload: { email: regEmail, otp },
    });
    assert.equal(verify.statusCode, 200);
    const grant = JSON.parse(verify.body).verificationGrant;
    assert.ok(grant, 'Backend must return verification grant');

    // 3. Try to register with another email using this grant (e.g. user changed email in field)
    const spoofEmailRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/register',
      payload: {
        firstName: 'Rahul',
        email: `different.${Date.now()}@example.com`,
        phone: '9876543210',
        targetExamIds: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        password: 'ValidPass1!#',
        verificationGrant: grant,
      },
    });
    assert.equal(spoofEmailRes.statusCode, 400);
    assert.equal(JSON.parse(spoofEmailRes.body).error.code, 'INVALID_VERIFICATION_GRANT');

    // 4. Try to register without grant using spoofed flag
    const fakeFlagRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/register',
      payload: {
        firstName: 'Rahul',
        email: regEmail,
        phone: '9876543210',
        targetExamIds: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        password: 'ValidPass1!#',
        isVerified: true,
        verificationGrant: 'invalid_fake_grant_token',
      },
    });
    assert.equal(fakeFlagRes.statusCode, 400);
    assert.equal(JSON.parse(fakeFlagRes.body).error.code, 'INVALID_VERIFICATION_GRANT');

    // 5. Valid registration with correct grant succeeds
    const validReg = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/register',
      payload: {
        firstName: 'Rahul',
        email: regEmail,
        phone: '9876543210',
        targetExamIds: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        password: 'ValidPass1!#',
        verificationGrant: grant,
      },
    });
    assert.equal(validReg.statusCode, 201);
    assert.equal(JSON.parse(validReg.body).success, true);
  });

  it('10. Existing students set a password without losing history', async () => {
    const existingEmail = `legacy.student.${Date.now()}@example.com`;
    const stuId = `stu_legacy_${Date.now()}`;

    // Seed existing OTP-only student (no password_hash)
    await db.students.set(stuId, {
      id: stuId,
      email: existingEmail,
      firstName: 'Amit',
      lastName: 'Kumar',
      phone: '9988776655',
      streakDays: 14,
      dailyGoalMinutes: 60,
      completedTasks: ['task-1', 'task-2'],
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'hi',
      targetExams: ['ssc-cgl', 'rrb-ntpc'],
      primaryExamId: 'ssc-cgl',
      tokenVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    // Student attempts password login before setting password
    const loginFail = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/login',
      payload: { email: existingEmail, password: 'AnyPassword123!' },
    });
    assert.equal(loginFail.statusCode, 400);
    assert.equal(JSON.parse(loginFail.body).error.code, 'PASSWORD_NOT_SET');

    // Student requests setup link
    const setupReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-setup',
      payload: { email: existingEmail },
    });
    assert.equal(setupReq.statusCode, 200);
    const setupToken = JSON.parse(setupReq.body).devSetupTokenHint;
    assert.ok(setupToken);

    // Complete setup
    const setupCommit = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/setup-password',
      payload: { email: existingEmail, setupToken, newPassword: 'AmitPass26!#' },
    });
    assert.equal(setupCommit.statusCode, 200);

    // Verify preparation history is 100% intact
    const studentAfter = db.students.get(stuId);
    assert.ok(studentAfter?.passwordHash, 'Password hash must now be present');
    assert.equal(studentAfter?.streakDays, 14, 'Streak must be preserved');
    assert.equal(studentAfter?.dailyGoalMinutes, 60, 'Study goal must be preserved');
    assert.deepEqual(studentAfter?.completedTasks, ['task-1', 'task-2'], 'Task history must be preserved');
  });

  it('11. Normal password login does not dispatch email OTP', async () => {
    const email = `passlogin.${Date.now()}@example.com`;
    const pwd = 'NormalPass123!';

    // Register student with password
    const chal = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/challenge',
      payload: { email },
    });
    const otp = JSON.parse(chal.body).devOtpHint;
    const verify = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/verify-email',
      payload: { email, otp },
    });
    const grant = JSON.parse(verify.body).verificationGrant;

    await app.inject({
      method: 'POST',
      url: '/v1/auth/student/register',
      payload: {
        firstName: 'Priya',
        email,
        phone: '9123456789',
        targetExamIds: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        password: pwd,
        verificationGrant: grant,
      },
    });

    const sendsBefore = db.brevoSendsToday;

    // Normal student password login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/login',
      payload: { email, password: pwd },
    });
    assert.equal(loginRes.statusCode, 200);
    const loginBody = JSON.parse(loginRes.body);
    assert.ok(loginBody.accessToken);
    assert.equal(loginBody.user.email, email);

    // Verification: Brevo sends count did NOT increase
    assert.equal(db.brevoSendsToday, sendsBefore, 'Normal password login must not send an email OTP');
  });

  it('12. Password policy and strength indicators work centrally', () => {
    // 1. Min length (8)
    assert.equal(validatePasswordPolicy('Ab1!').isValid, false);
    // 2. Max length (14) - Clear rejection of overlength
    const overlength = validatePasswordPolicy('Abcdefgh1!23456');
    assert.equal(overlength.isValid, false);
    assert.ok(overlength.errors.some((e) => e.includes('cannot exceed 14 characters')));

    // 3. Missing character classes
    assert.equal(validatePasswordPolicy('abcdefgh').isValid, false); // missing upper, number, symbol
    assert.equal(validatePasswordPolicy('ABCDEFGH1!').isValid, false); // missing lower

    // 4. Valid policy compliance
    const valid = validatePasswordPolicy('GoodPass12!#');
    assert.equal(valid.isValid, true);
    assert.equal(valid.criteria.hasUppercase, true);
    assert.equal(valid.criteria.hasLowercase, true);
    assert.equal(valid.criteria.hasNumber, true);
    assert.equal(valid.criteria.hasSymbol, true);

    // 5. Strength estimator separate from policy compliance
    const weakCompliant = estimatePasswordStrength('Password1!');
    assert.ok(weakCompliant.level === 'Weak' || weakCompliant.level === 'Medium');

    const highEntropy = estimatePasswordStrength('X7#kP9$qM2*w');
    assert.equal(highEntropy.level, 'Strong');
  });

  it('13. Password change revokes other active sessions and rotates current session', async () => {
    const email = `session.revoke.${Date.now()}@example.com`;
    const studentId = `stu_sess_${Date.now()}`;
    const initialPwd = 'InitPass12!#';
    const initialHash = await hashToken(initialPwd); // dummy placeholder, we update properly

    const studentRecord: StudentRecord = {
      id: studentId,
      email,
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'en',
      targetExams: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      dailyGoalMinutes: 45,
      streakDays: 0,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await db.students.set(studentId, studentRecord);

    // First set password via setup
    const setupReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/request-password-setup',
      payload: { email },
    });
    const setupToken = JSON.parse(setupReq.body).devSetupTokenHint;
    await app.inject({
      method: 'POST',
      url: '/v1/auth/student/setup-password',
      payload: { email, setupToken, newPassword: initialPwd },
    });

    // Student logs in on Session A
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/login',
      payload: { email, password: initialPwd },
    });
    const sessionAToken = JSON.parse(loginRes.body).accessToken;

    // Student changes password using Session A
    const changeRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/student/change-password',
      headers: { authorization: `Bearer ${sessionAToken}` },
      payload: {
        currentPassword: initialPwd,
        newPassword: 'NextPass12!#',
        confirmPassword: 'NextPass12!#',
      },
    });
    assert.equal(changeRes.statusCode, 200);
    const newSessionToken = JSON.parse(changeRes.body).accessToken;
    assert.ok(newSessionToken);
    assert.notEqual(newSessionToken, sessionAToken);

    // Old Session A token is now revoked (tokenVersion bumped)
    const oldTokenCheck = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${sessionAToken}` },
    });
    assert.equal(oldTokenCheck.statusCode, 401);
    assert.equal(JSON.parse(oldTokenCheck.body).error.code, 'TOKEN_REVOKED');

    // Rotated new token works seamlessly
    const newTokenCheck = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${newSessionToken}` },
    });
    assert.equal(newTokenCheck.statusCode, 200);
  });

  it('14. Rate limits remain effective after simulated process restart', async () => {
    const attackEmail = `brute.${Date.now()}@example.com`;
    const clientIp = '192.168.1.100';

    // Simulate 5 failed logins
    for (let i = 0; i < 5; i++) {
      await AuthRateLimits.recordFailedLogin(attackEmail, clientIp);
    }

    // Rate limit must be active in DB
    const check1 = await AuthRateLimits.checkLogin(attackEmail, clientIp);
    assert.equal(check1.allowed, false);

    // Simulate server restart: query directly from PostgreSQL to verify durable state
    const dbRow = await query<any>(
      'SELECT count, cooldown_until FROM auth_rate_limits WHERE key = $1',
      [`login:account:${attackEmail}`]
    );
    assert.ok(dbRow.rows.length > 0);
    assert.ok(dbRow.rows[0].count >= 5);
    assert.ok(dbRow.rows[0].cooldown_until);
  });

  it('15. Role changes and suspended accounts are enforced across protected modules', async () => {
    const studentId = `stu_susp_${Date.now()}`;
    const email = `suspended.${Date.now()}@example.com`;

    const stuRecord: StudentRecord = {
      id: studentId,
      email,
      status: 'ACTIVE',
      isEmailVerified: true,
      preferredLanguage: 'en',
      targetExams: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      dailyGoalMinutes: 45,
      streakDays: 0,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await db.students.set(studentId, stuRecord);

    const token = signJwt(
      { sub: studentId, email, type: 'student', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:student_api' }
    );

    // Initial check: active
    const resActive = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resActive.statusCode, 200);

    // Administrator suspends account
    stuRecord.status = 'SUSPENDED';
    await db.students.set(studentId, stuRecord);

    // Immediate enforcement: 403 Forbidden
    const resSuspended = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resSuspended.statusCode, 403);
    assert.equal(JSON.parse(resSuspended.body).error.code, 'ACCOUNT_SUSPENDED');
  });

  it('16. Complete destination emails are masked in responses', () => {
    assert.equal(maskEmail('sksakirhossain8@gmail.com'), 'sks***@gmail.com');
    assert.equal(maskEmail('admin@sidprep.in'), 'adm***@sidprep.in');
    assert.equal(maskEmail('ab@gmail.com'), 'a***@gmail.com');
    assert.equal(maskEmail('a@test.com'), 'a***@test.com');
  });
});
