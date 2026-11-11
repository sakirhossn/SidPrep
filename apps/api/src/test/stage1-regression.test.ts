import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import type { FastifyInstance } from 'fastify';

describe('Stage 1 Regression & Audit Defects Test Suite', () => {
  let app: FastifyInstance;
  const studentId = `stu_stage1_${Date.now()}`;
  const studentEmail = `candidate.${Date.now()}@example.com`;
  let studentToken: string;

  const superAdminId = `adm_stage1_super_${Date.now()}`;
  let superAdminToken: string;

  const disabledStaffId = `adm_stage1_disabled_${Date.now()}`;
  let disabledStaffToken: string;

  before(async () => {
    app = await buildServer();
    await db.init();

    // Seed test student
    await db.students.set(studentId, {
      id: studentId,
      email: studentEmail,
      firstName: 'Rohit',
      lastName: 'Kumar',
      isSingleName: false,
      phone: '+919876543210',
      phoneCountryCode: '+91',
      isPhoneVerified: true,
      isEmailVerified: true,
      targetExams: ['ssc-cgl'],
      selectedExamIds: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      preferredLanguage: 'en',
      dailyGoalMinutes: 60,
      dailyTargetMinutes: 60,
      streakDays: 0,
      tokenVersion: 1,
      status: 'ACTIVE',
      isProfileComplete: true,
      createdAt: new Date().toISOString(),
    });

    studentToken = signJwt(
      { sub: studentId, email: studentEmail, type: 'student', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:student_api' }
    );

    // Seed Super Admin
    await db.adminUsers.set(superAdminId, {
      id: superAdminId,
      email: `super.${Date.now()}@sidprep.in`,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
      passwordHash: 'dummy',
      tokenVersion: 1,
      is2faEnabled: false,
      totpSecret: 'DUMMYSECRET',
      createdAt: new Date().toISOString(),
    });

    superAdminToken = signJwt(
      { sub: superAdminId, email: `super.${Date.now()}@sidprep.in`, role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );

    // Seed Disabled Staff member
    await db.adminUsers.set(disabledStaffId, {
      id: disabledStaffId,
      email: `disabled.${Date.now()}@sidprep.in`,
      name: 'Disabled Content Manager',
      role: 'CONTENT_MANAGER',
      isActive: false, // DEACTIVATED
      passwordHash: 'dummy',
      tokenVersion: 1,
      is2faEnabled: false,
      totpSecret: 'DUMMYSECRET',
      createdAt: new Date().toISOString(),
    });

    disabledStaffToken = signJwt(
      { sub: disabledStaffId, email: `disabled.${Date.now()}@sidprep.in`, role: 'CONTENT_MANAGER', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  it('1. Rejects PATCH /me with invalid phone number format', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { phone: '123' }, // Invalid phone format
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_PROFILE_UPDATE');
  });

  it('2. Rejects PATCH /me with nonexistent or inactive target exam', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { targetExams: ['NONEXISTENT_EXAM_999'] },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_EXAM_SELECTION');
  });

  it('3. Rejects PATCH /me with out-of-range daily study goal', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { dailyGoalMinutes: 99999 }, // Way exceeds 720 min limit
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_PROFILE_UPDATE');
  });

  it('4. Successfully updates valid profile preferences', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: {
        firstName: 'Amit',
        lastName: 'Sharma',
        phone: '+919876543219',
        targetExams: ['ssc-cgl'],
        dailyGoalMinutes: 90,
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.firstName, 'Amit');
    assert.equal(body.phone, '+919876543219');
    assert.equal(body.dailyGoalMinutes, 90);
    assert.equal(body.isProfileComplete, true);
  });

  it('5. Rejects disabled staff on document routes (POST /admin/resources)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/resources',
      headers: { authorization: `Bearer ${disabledStaffToken}` },
      payload: {
        title: 'Unauthorized Document',
        exam: 'SSC_CGL',
        subject: 'General Awareness',
        fileType: 'PDF',
        fileBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
      },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('6. Rejects disabled staff on document routes (GET /admin/resources)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/resources',
      headers: { authorization: `Bearer ${disabledStaffToken}` },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('7. Rejects revoked admin session on document routes', async () => {
    // Revoke super admin session by incrementing tokenVersion
    const admin = db.adminUsers.get(superAdminId)!;
    admin.tokenVersion = (admin.tokenVersion || 1) + 1;
    await db.adminUsers.set(superAdminId, admin);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/resources',
      headers: { authorization: `Bearer ${superAdminToken}` }, // outdated tokenVersion: 1
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'SESSION_REVOKED');
  });

  it('8. Rejects unauthenticated student data export (POST /v1/me/export)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/export',
    });
    assert.equal(res.statusCode, 401);
  });

  it('9. Returns 404 RESOURCE_FILE_MISSING when document binary is missing from storage (no synthetic file)', async () => {
    const missingResId = `res_missing_${Date.now()}`;
    await db.resources.set(missingResId, {
      id: missingResId,
      title: 'Missing File Notice',
      description: 'Test file that does not exist on disk',
      exam: 'SSC_CGL',
      subject: 'Math',
      fileType: 'PDF',
      fileSizeBytes: 1024,
      sha256Hash: 'nonexistent_hash_12345',
      storagePath: 'uploads/resources/nonexistent_file.pdf',
      previewAllowed: true,
      downloadAllowed: true,
      offlineAllowed: false,
      licenseSource: 'SidPrep Academic Editorial Team',
      isPublished: true,
      verifiedDate: '2026-11-10',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/downloads/stream/${missingResId}`,
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'RESOURCE_FILE_MISSING');
  });
});
