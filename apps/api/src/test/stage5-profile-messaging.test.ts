import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { signJwt } from '../lib/security.js';
import { closePool } from '../db/pool.js';

describe('Stage 5 Regression: Student Profile, Verified Email Changes, Avatars & Messaging', () => {
  let app: FastifyInstance;
  const ts = Date.now();
  const student1Id = `stu_stage5_1_${ts}`;
  const student2Id = `stu_stage5_2_${ts}`;
  const adminId = `adm_stage5_${ts}`;

  const student1Email = `student1.stage5_${ts}@example.com`;
  const student2Email = `student2.stage5_${ts}@example.com`;
  const adminEmail = `staff.stage5_${ts}@example.com`;

  let student1Token: string;
  let student2Token: string;
  let adminToken: string;

  before(async () => {
    app = await buildServer();
    await app.ready();

    // Create student 1
    await db.students.set(student1Id, {
      id: student1Id,
      email: student1Email,
      firstName: 'Rahul',
      lastName: 'Sharma',
      phone: '+919876543210',
      preferredLanguage: 'en',
      targetExams: ['ssc_cgl'],
      primaryExamId: 'ssc_cgl',
      dailyGoalMinutes: 60,
      streakDays: 5,
      status: 'ACTIVE',
      isEmailVerified: true,
      isProfileComplete: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // Create student 2
    await db.students.set(student2Id, {
      id: student2Id,
      email: student2Email,
      firstName: 'Priya',
      lastName: 'Patel',
      phone: '+919876543211',
      preferredLanguage: 'hi',
      targetExams: ['rrb_ntpc'],
      primaryExamId: 'rrb_ntpc',
      dailyGoalMinutes: 45,
      streakDays: 2,
      status: 'ACTIVE',
      isEmailVerified: true,
      isProfileComplete: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    // Create staff admin
    await db.adminUsers.set(adminId, {
      id: adminId,
      email: adminEmail,
      name: 'Stage 5 Support Staff',
      passwordHash: 'dummy',
      totpSecret: 'dummy',
      is2faEnabled: false,
      role: 'SUPPORT',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    student1Token = signJwt({ sub: student1Id, email: student1Email, type: 'student', tokenVersion: 1 }, '1h', { audience: 'sidprep:student_api' });
    student2Token = signJwt({ sub: student2Id, email: student2Email, type: 'student', tokenVersion: 1 }, '1h', { audience: 'sidprep:student_api' });
    adminToken = signJwt({ sub: adminId, email: adminEmail, name: 'Stage 5 Support Staff', role: 'SUPPORT', type: 'admin_session', tokenVersion: 1 }, '1h', { audience: 'sidprep:admin_api' });
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  test('5.1 Email change request & validation (same email, conflict, valid OTP)', async () => {
    // 1. Same email rejected
    const sameRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/request',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: student1Email },
    });
    assert.equal(sameRes.statusCode, 400);
    const sameBody = JSON.parse(sameRes.body);
    assert.equal(sameBody.error?.code, 'SAME_EMAIL');

    // 2. Conflict with existing student rejected
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/request',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: student2Email },
    });
    assert.equal(conflictRes.statusCode, 409);
    const conflictBody = JSON.parse(conflictRes.body);
    assert.equal(conflictBody.error?.code, 'EMAIL_ALREADY_IN_USE');

    // 3. Valid new email creates pending OTP
    const newTargetEmail = `rahul.new_${ts}@example.com`;
    const validRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/request',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: newTargetEmail },
    });
    assert.equal(validRes.statusCode, 200);
    const validBody = JSON.parse(validRes.body);
    assert.equal(validBody.success, true);
    assert.ok(validBody.testOtp); // Test OTP exposed in test environment

    // Verify student record updated in memory
    const s1 = db.students.get(student1Id);
    assert.equal(s1?.pendingEmail, newTargetEmail);
    assert.ok(s1?.pendingEmailOtpHash);
  });

  test('5.2 Email change verification & session revocation', async () => {
    const verifiedTargetEmail = `rahul.verified_${ts}@example.com`;
    // 1. Request new email
    const reqRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/request',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: verifiedTargetEmail },
    });
    const otp = JSON.parse(reqRes.body).testOtp;

    // 2. Incorrect OTP rejected
    const badRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/verify',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: verifiedTargetEmail, otp: '000000' },
    });
    assert.equal(badRes.statusCode, 400);
    const badBody = JSON.parse(badRes.body);
    assert.equal(badBody.error?.code, 'INVALID_OTP');

    // 3. Correct OTP updates email and increments tokenVersion
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/me/email/verify',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { newEmail: verifiedTargetEmail, otp },
    });
    assert.equal(verifyRes.statusCode, 200);
    const verifyBody = JSON.parse(verifyRes.body);
    assert.equal(verifyBody.success, true);
    assert.equal(verifyBody.email, verifiedTargetEmail);
    assert.equal(verifyBody.tokenVersion, 2);

    // 4. Old tokenVersion 1 is now rejected on protected endpoints!
    const oldTokenRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${student1Token}` },
    });
    assert.equal(oldTokenRes.statusCode, 401);

    // 5. Issue new token with tokenVersion 2, now accepted
    student1Token = signJwt({ sub: student1Id, email: verifiedTargetEmail, type: 'student', tokenVersion: 2 }, '1h', { audience: 'sidprep:student_api' });
    const newTokenRes = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${student1Token}` },
    });
    assert.equal(newTokenRes.statusCode, 200);
    assert.equal(JSON.parse(newTokenRes.body).email, verifiedTargetEmail);
  });

  test('5.3 Avatar upload with magic bytes, stream & delete', async () => {
    // 1. Fake image rejected (magic byte mismatch)
    const fakeImgBase64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    const fakeRes = await app.inject({
      method: 'POST',
      url: '/v1/me/avatar',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { fileBase64: fakeImgBase64, fileType: 'PNG', filename: 'fake.png' },
    });
    assert.equal(fakeRes.statusCode, 400);
    assert.equal(JSON.parse(fakeRes.body).error?.code, 'INVALID_AVATAR_FILE');

    // 2. Real PNG magic bytes (89 50 4E 47 ...) accepted
    const realPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const realPngBase64 = realPngBuffer.toString('base64');
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/me/avatar',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { fileBase64: realPngBase64, fileType: 'PNG', filename: 'profile.png' },
    });
    assert.equal(uploadRes.statusCode, 200);
    const uploadBody = JSON.parse(uploadRes.body);
    assert.ok(uploadBody.avatarUrl);
    const avatarUrl = uploadBody.avatarUrl;

    // 3. Stream avatar from /v1/avatars/:filename
    const streamRes = await app.inject({
      method: 'GET',
      url: avatarUrl,
    });
    assert.equal(streamRes.statusCode, 200);
    assert.equal(streamRes.headers['content-type'], 'image/png');

    // 4. Delete avatar
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/v1/me/avatar',
      headers: { authorization: `Bearer ${student1Token}` },
    });
    assert.equal(delRes.statusCode, 200);

    const s1 = db.students.get(student1Id);
    assert.equal(s1?.avatarUrl, undefined);
  });

  test('5.4 Support conversations: creation, strict ownership & messaging', async () => {
    // 1. Student 1 opens ticket
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/support/conversations',
      headers: { authorization: `Bearer ${student1Token}` },
      payload: {
        subject: 'Cannot access mock test #4',
        category: 'Technical Issue',
        message: 'When I click Start Test on CGL Mock 4, the timer spins indefinitely.',
      },
    });
    assert.equal(createRes.statusCode, 201);
    const convId = JSON.parse(createRes.body).conversationId;
    assert.ok(convId);

    // 2. Student 2 tries to view Student 1 ticket -> 403 Forbidden!
    const intruderRes = await app.inject({
      method: 'GET',
      url: `/v1/support/conversations/${convId}`,
      headers: { authorization: `Bearer ${student2Token}` },
    });
    assert.equal(intruderRes.statusCode, 403);
    assert.equal(JSON.parse(intruderRes.body).error?.code, 'FORBIDDEN');

    // 3. Student 1 views ticket -> 200
    const ownerRes = await app.inject({
      method: 'GET',
      url: `/v1/support/conversations/${convId}`,
      headers: { authorization: `Bearer ${student1Token}` },
    });
    assert.equal(ownerRes.statusCode, 200);
    const ownerBody = JSON.parse(ownerRes.body);
    assert.equal(ownerBody.messages.length, 1);
    assert.equal(ownerBody.messages[0].senderType, 'STUDENT');

    // 4. Staff views tickets list and inspects ticket
    const adminListRes = await app.inject({
      method: 'GET',
      url: '/v1/admin/support/conversations',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminListRes.statusCode, 200);

    // 5. Staff posts an internal note (isInternalNote: true)
    const noteRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/support/conversations/${convId}/reply`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        message: 'Internal review: student browser version is outdated, but test server had no crash.',
        isInternalNote: true,
      },
    });
    assert.equal(noteRes.statusCode, 201);

    // 6. Staff posts a visible reply
    const replyRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/support/conversations/${convId}/reply`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        message: 'Hi Rahul, we reviewed the test session. Please clear your app cache or update to v1.2.',
        isInternalNote: false,
      },
    });
    assert.equal(replyRes.statusCode, 201);

    // 7. Student 1 views messages: internal note MUST NOT be visible!
    const studentCheckRes = await app.inject({
      method: 'GET',
      url: `/v1/support/conversations/${convId}`,
      headers: { authorization: `Bearer ${student1Token}` },
    });
    assert.equal(studentCheckRes.statusCode, 200);
    const studentMessages = JSON.parse(studentCheckRes.body).messages;
    assert.equal(studentMessages.length, 2); // Initial message + visible reply only!
    assert.ok(!studentMessages.some((m: any) => m.messageText.includes('Internal review')));

    // 8. Staff marks conversation CLOSED
    const closeRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/support/conversations/${convId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'CLOSED' },
    });
    assert.equal(closeRes.statusCode, 200);

    // 9. Student cannot reply to closed conversation
    const replyClosedRes = await app.inject({
      method: 'POST',
      url: `/v1/support/conversations/${convId}/messages`,
      headers: { authorization: `Bearer ${student1Token}` },
      payload: { message: 'Thanks for resolving this!' },
    });
    assert.equal(replyClosedRes.statusCode, 400);
    assert.equal(JSON.parse(replyClosedRes.body).error?.code, 'CONVERSATION_CLOSED');
  });
});
