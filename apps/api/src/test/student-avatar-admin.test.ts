import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Requirement 7: Display Uploaded Student Profile Pictures in Admin', () => {
  let app: any;
  let adminToken: string;
  let studentToken: string;
  const testStudentId = `stu_av_test_${Date.now()}`;
  const testAdminId = `adm_av_test_${Date.now()}`;

  before(async () => {
    try {
      app = await buildServer();
      await app.ready();

      // Create test admin
      await db.adminUsers.set(testAdminId, {
        id: testAdminId,
        name: 'Test Super Admin',
        email: `admin_${Date.now()}@sidprep.in`,
        passwordHash: 'dummy_hash',
        role: 'SUPER_ADMIN',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        is2faEnabled: false,
        isActive: true,
        tokenVersion: 1,
        createdAt: new Date().toISOString(),
      });

      adminToken = signJwt(
        {
          sub: testAdminId,
          adminId: testAdminId,
          email: `admin_${Date.now()}@sidprep.in`,
          role: 'SUPER_ADMIN',
          type: 'admin_session',
          tokenVersion: 1,
        },
        '1h'
      );

      // Create test student
      await db.students.set(testStudentId, {
        id: testStudentId,
        email: `student_${Date.now()}@example.com`,
        firstName: 'Rohit',
        lastName: 'Sharma',
        isSingleName: false,
        preferredLanguage: 'en',
        targetExams: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        dailyGoalMinutes: 45,
        streakDays: 3,
        status: 'ACTIVE',
        isEmailVerified: true,
        tokenVersion: 1,
        createdAt: new Date().toISOString(),
      });

      studentToken = signJwt(
        {
          sub: testStudentId,
          email: `student_${Date.now()}@example.com`,
          tokenVersion: 1,
          type: 'student',
        },
        '1h',
        { audience: 'sidprep:student_api' }
      );
    } catch (err: any) {
      console.error('CRITICAL BEFORE ERROR:', err);
      throw err;
    }
  });

  after(async () => {
    await db.students.persistDelete(testStudentId).catch(() => {});
    await db.adminUsers.persistDelete(testAdminId).catch(() => {});
    if (app) await app.close();
    await closePool();
  });

  it('7.1: GET /v1/admin/users initially returns avatarUrl as null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?query=${testStudentId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const found = body.find((s: any) => s.id === testStudentId);
    assert.ok(found, 'Student should be present in admin directory');
    assert.equal(found.avatarUrl, null, 'avatarUrl should be null initially');
  });

  it('7.2: Student uploads valid PNG avatar and receives versioned URL', async () => {
    // 1x1 valid PNG binary
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/avatar',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      payload: {
        fileBase64: pngBase64,
        fileType: 'PNG',
        filename: 'profile.png',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.avatarUrl);
    assert.ok(body.avatarUrl.includes('/v1/avatars/avatar_'));

    // Verify DB persistence
    const dbRes = await query('SELECT avatar_url, avatar_storage_path FROM students WHERE id = $1', [testStudentId]);
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].avatar_url, body.avatarUrl);
    assert.ok(fs.existsSync(dbRes.rows[0].avatar_storage_path));
  });

  it('7.3: Avatar URL is preserved across simulated restart (loadFromDb)', async () => {
    // Clear in-memory cache and reload from PostgreSQL
    await db.students.loadFromDb();

    const cached = db.students.get(testStudentId);
    assert.ok(cached, 'Student must be reloaded from PostgreSQL');
    assert.ok(cached.avatarUrl, 'avatarUrl must be reloaded into memory');
    assert.ok(cached.avatarStoragePath, 'avatarStoragePath must be reloaded into memory');
  });

  it('7.4: GET /v1/admin/users and GET /v1/admin/users/:id/full include avatarUrl', async () => {
    // Directory check
    const dirRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?query=${testStudentId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(dirRes.statusCode, 200);
    const dirBody = JSON.parse(dirRes.body);
    const found = dirBody.find((s: any) => s.id === testStudentId);
    assert.ok(found.avatarUrl);
    assert.ok(found.avatarUrl.includes('/v1/avatars/'));

    // Full dossier check
    const dosRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${testStudentId}/full`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(dosRes.statusCode, 200);
    const dosBody = JSON.parse(dosRes.body);
    assert.ok(dosBody.student.avatarUrl);
    assert.equal(dosBody.student.avatarUrl, found.avatarUrl);
  });

  it('7.5: GET /v1/avatars/:filename streams image binary safely', async () => {
    const student = db.students.get(testStudentId)!;
    const filename = path.basename(student.avatarUrl!.split('?')[0]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/avatars/${filename}`,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.ok(res.rawPayload.length > 0);
  });

  it('7.6: DELETE /v1/me/avatar removes file and clears columns in DB and cache', async () => {
    const student = db.students.get(testStudentId)!;
    const oldFilePath = student.avatarStoragePath!;
    assert.ok(fs.existsSync(oldFilePath));

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/me/avatar',
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(fs.existsSync(oldFilePath), false, 'Old avatar file must be unlinked');

    // Verify DB cleared
    const dbRes = await query('SELECT avatar_url, avatar_storage_path FROM students WHERE id = $1', [testStudentId]);
    assert.equal(dbRes.rows[0].avatar_url, null);
    assert.equal(dbRes.rows[0].avatar_storage_path, null);

    // Verify admin directory now reports null
    const dirRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/users?query=${testStudentId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dirBody = JSON.parse(dirRes.body);
    const found = dirBody.find((s: any) => s.id === testStudentId);
    assert.equal(found.avatarUrl, null);
  });
});
