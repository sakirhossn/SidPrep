import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import type { FastifyInstance } from 'fastify';

describe('Stage 2: Full User Visibility & Staff Management Test Suite', () => {
  let app: FastifyInstance;
  const superAdminId = `adm_stage2_super_${Date.now()}`;
  let superAdminToken: string;

  const contentManagerId = `adm_stage2_cm_${Date.now()}`;
  let contentManagerToken: string;

  const studentId = `stu_stage2_${Date.now()}`;
  const studentEmail = `student.visibility.${Date.now()}@example.com`;

  before(async () => {
    app = await buildServer();
    await db.init();

    // 1. Seed Super Admin
    await db.adminUsers.set(superAdminId, {
      id: superAdminId,
      email: `superadmin.${Date.now()}@sidprep.in`,
      name: 'Super Admin User',
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      is2faEnabled: false,
      passwordHash: 'dummy_hash',
      totpSecret: 'dummy_secret',
      createdAt: new Date().toISOString(),
    });

    superAdminToken = signJwt(
      { sub: superAdminId, email: `superadmin.${Date.now()}@sidprep.in`, role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );

    // 2. Seed Content Manager
    await db.adminUsers.set(contentManagerId, {
      id: contentManagerId,
      email: `cm.${Date.now()}@sidprep.in`,
      name: 'Content Manager User',
      role: 'CONTENT_MANAGER',
      isActive: true,
      tokenVersion: 1,
      is2faEnabled: false,
      passwordHash: 'dummy_hash',
      totpSecret: 'dummy_secret',
      createdAt: new Date().toISOString(),
    });

    contentManagerToken = signJwt(
      { sub: contentManagerId, email: `cm.${Date.now()}@sidprep.in`, role: 'CONTENT_MANAGER', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );

    // 3. Seed Student
    await db.students.set(studentId, {
      id: studentId,
      email: studentEmail,
      firstName: 'Priya',
      lastName: 'Sharma',
      isSingleName: false,
      phone: '+919876501234',
      phoneCountryCode: '+91',
      isPhoneVerified: true,
      isEmailVerified: true,
      targetExams: ['ssc-cgl'],
      selectedExamIds: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      preferredLanguage: 'en',
      dailyGoalMinutes: 60,
      dailyTargetMinutes: 60,
      streakDays: 5,
      tokenVersion: 1,
      status: 'ACTIVE',
      isProfileComplete: true,
      createdAt: new Date().toISOString(),
    });

    // Seed session in DB if available
    try {
      await query(
        `INSERT INTO student_sessions (id, student_id, token_hash, ip_address, user_agent, login_source, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [`sess_${Date.now()}`, studentId, 'mock_hash', '103.21.244.2', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'mobile_app']
      );
    } catch {
      // Postgres table fallback
    }

    // Seed mock attempt
    await db.attempts.set(`att_${Date.now()}`, {
      id: `att_${Date.now()}`,
      testId: 'test_cgl_full_01',
      studentId: studentId,
      status: 'SUBMITTED',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      submittedAt: new Date().toISOString(),
      durationSeconds: 3600,
      timeSpentSeconds: 3200,
      score: 142.5,
      maxScore: 200,
      accuracy: 85.5,
      correctCount: 75,
      wrongCount: 15,
      unattemptedCount: 10,
      answers: {},
    });
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  it('1. GET /admin/users/:id/full returns full dossier to SUPER_ADMIN with no-store caching', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${studentId}/full`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['cache-control']?.includes('no-store'));
    const body = JSON.parse(res.body);

    assert.ok(body.success);
    assert.equal(body.student.id, studentId);
    assert.equal(body.student.email, studentEmail);
    assert.equal(body.student.firstName, 'Priya');
    assert.equal(body.student.lastName, 'Sharma');
    assert.ok(Array.isArray(body.student.attempts));
    assert.ok(body.student.attempts.length >= 1);
    assert.equal(body.student.attempts[0].score, 142.5);
    // Never expose password hash or otp secrets
    assert.equal(body.student.passwordHash, undefined);
    assert.equal(body.student.otpHash, undefined);
  });

  it('2. GET /admin/users/:id/full is forbidden (403) for non-SUPER_ADMIN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${studentId}/full`,
      headers: { authorization: `Bearer ${contentManagerToken}` },
    });

    assert.equal(res.statusCode, 403);
  });

  it('3. GET /admin/team lists team members for SUPER_ADMIN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/team',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
    const superAdmin = body.data.find((u: any) => u.id === superAdminId);
    assert.ok(superAdmin);
    assert.equal(superAdmin.role, 'SUPER_ADMIN');
  });

  it('4. POST /admin/team/invite invites new staff member and prevents duplicate email', async () => {
    const inviteEmail = `invited.${Date.now()}@sidprep.in`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/team/invite',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        email: inviteEmail,
        name: 'Invited Reviewer',
        role: 'CONTENT_MANAGER',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.user.email, inviteEmail);
    assert.equal(body.user.role, 'CONTENT_MANAGER');
    assert.ok(body.invitationToken);

    // Duplicate invite should fail
    const dupRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/team/invite',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        email: inviteEmail,
        name: 'Duplicate Invitee',
        role: 'CONTENT_MANAGER',
      },
    });
    assert.equal(dupRes.statusCode, 409);
  });

  it('5. Protects last active SUPER_ADMIN from demotion or deactivation', async () => {
    // Isolate superAdminId as the sole active SUPER_ADMIN
    for (const [id, user] of db.adminUsers.entries()) {
      if (id !== superAdminId && user.role === 'SUPER_ADMIN') {
        user.isActive = false;
      }
    }
    const mySuperAdmin = db.adminUsers.get(superAdminId)!;
    mySuperAdmin.isActive = true;

    // Attempt to deactivate the last super admin
    const deactRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/team/${superAdminId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { isActive: false },
    });

    assert.equal(deactRes.statusCode, 400);
    const deactBody = JSON.parse(deactRes.body);
    assert.equal(deactBody.error.code, 'CANNOT_DEMOTE_LAST_SUPER_ADMIN');

    // Attempt to demote the last super admin
    const demoteRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/team/${superAdminId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { role: 'SUPPORT' },
    });

    assert.equal(demoteRes.statusCode, 400);
    const demoteBody = JSON.parse(demoteRes.body);
    assert.equal(demoteBody.error.code, 'CANNOT_DEMOTE_LAST_SUPER_ADMIN');

    // Attempt to delete the last super admin
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/team/${superAdminId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(delRes.statusCode, 400);
    const delBody = JSON.parse(delRes.body);
    assert.equal(delBody.error.code, 'CANNOT_REMOVE_LAST_SUPER_ADMIN');
  });

  it('6. POST /admin/team/:id/revoke revokes staff session and increments tokenVersion', async () => {
    const targetUser = db.adminUsers.get(contentManagerId)!;
    const initialVersion = targetUser.tokenVersion || 1;

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/team/${contentManagerId}/revoke`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const updatedUser = db.adminUsers.get(contentManagerId)!;
    assert.equal(updatedUser.tokenVersion, initialVersion + 1);
  });
});
