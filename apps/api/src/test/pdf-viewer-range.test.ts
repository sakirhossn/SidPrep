import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Requirement 8: Integrated PDF Viewer, Byte-Range Streaming (HTTP 206) & Security Sandboxing', () => {
  let app: any;
  let adminToken: string;
  let studentToken: string;
  const adminId = `adm_pdf_${Date.now()}`;
  const studentId = `stu_pdf_${Date.now()}`;

  let safePdfResourceId = '';
  let previewRestrictedResourceId = '';
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'resources');

  // Minimal valid PDF binary (PDF-1.4)
  const validPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 712 Td
(SidPrep Official Study Notes) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`;

  // Malicious PDF with embedded active JavaScript action
  const maliciousPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert("Pwned");) >> >>
endobj
2 0 obj
<< /Type /Pages /Kids [] /Count 0 >>
endobj
trailer
<< /Size 3 /Root 1 0 R >>
startxref
120
%%EOF`;

  before(async () => {
    app = await buildServer();
    await app.ready();

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // 1. Setup Admin
    await db.adminUsers.set(adminId, {
      id: adminId,
      name: 'Resource Admin',
      email: `res_admin_${Date.now()}@sidprep.in`,
      passwordHash: 'dummy_hash',
      role: 'CONTENT_MANAGER',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    adminToken = signJwt(
      {
        sub: adminId,
        adminId: adminId,
        email: `res_admin_${Date.now()}@sidprep.in`,
        role: 'CONTENT_MANAGER',
        type: 'admin_session',
        tokenVersion: 1,
      },
      '2h'
    );

    // 2. Setup Student
    await db.students.set(studentId, {
      id: studentId,
      email: `pdf_student_${Date.now()}@example.com`,
      phone: '+919876543210',
      status: 'ACTIVE',
      tokenVersion: 1,
      preferredLanguage: 'en',
      targetExams: ['ssc_cgl'],
      dailyGoalMinutes: 60,
      streakDays: 1,
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
    });

    studentToken = signJwt(
      {
        sub: studentId,
        studentId: studentId,
        email: `pdf_student_${Date.now()}@example.com`,
        tokenVersion: 1,
      },
      '2h',
      { audience: 'sidprep:student_api' }
    );
  });

  after(async () => {
    try {
      if (safePdfResourceId) {
        const res = db.resources.get(safePdfResourceId);
        if (res?.storagePath && fs.existsSync(res.storagePath)) {
          fs.unlinkSync(res.storagePath);
        }
        await db.resources.delete(safePdfResourceId);
      }
      if (previewRestrictedResourceId) {
        const res = db.resources.get(previewRestrictedResourceId);
        if (res?.storagePath && fs.existsSync(res.storagePath)) {
          fs.unlinkSync(res.storagePath);
        }
        await db.resources.delete(previewRestrictedResourceId);
      }
      await db.adminUsers.delete(adminId);
      await db.students.delete(studentId);
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
    await closePool();
  });

  it('8.1 should reject PDF upload containing unsafe executable /JavaScript or /Launch actions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/resources',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        title: 'Exploit Test PDF',
        exam: 'SSC',
        subject: 'General Awareness',
        fileType: 'PDF',
        fileBase64: Buffer.from(maliciousPdfContent).toString('base64'),
        previewAllowed: true,
        downloadAllowed: true,
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNSAFE_PDF_CONTENT');
    assert.ok(body.error.message.includes('/JavaScript'));
  });

  it('8.2 should accept valid clean PDF and store genuine cryptographic SHA-256 binary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/resources',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        title: 'SSC CGL Official Polity Notes 2026',
        exam: 'SSC',
        subject: 'General Awareness',
        fileType: 'PDF',
        fileBase64: Buffer.from(validPdfContent).toString('base64'),
        previewAllowed: true,
        downloadAllowed: true,
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.resource.id);
    assert.equal(body.resource.fileType, 'PDF');
    assert.ok(body.resource.sha256Hash);
    safePdfResourceId = body.resource.id;

    // Verify stored on disk
    const stored = db.resources.get(safePdfResourceId);
    assert.ok(stored?.storagePath && fs.existsSync(stored.storagePath));
  });

  it('8.3 should support HTTP 206 Partial Content byte-range streaming for progressive PDF loading', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/downloads/stream/${safePdfResourceId}?preview=true`,
      headers: {
        range: 'bytes=0-99',
      },
    });

    assert.equal(res.statusCode, 206, 'Must return HTTP 206 Partial Content');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(res.headers['content-range'], `bytes 0-99/${validPdfContent.length}`);
    assert.equal(res.headers['content-length'], '100');
    assert.equal(res.headers['content-type'], 'application/pdf');

    // Verify received bytes match slice
    assert.equal(res.payload.length, 100);
    assert.ok(res.payload.startsWith('%PDF-1.4'));
  });

  it('8.4 should return HTTP 416 Range Not Satisfiable when range is beyond document bounds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/downloads/stream/${safePdfResourceId}?preview=true`,
      headers: {
        range: 'bytes=99999-100000',
      },
    });

    assert.equal(res.statusCode, 416);
    assert.equal(res.headers['content-range'], `bytes */${validPdfContent.length}`);
  });

  it('8.5 should separate administrative preview permissions from student access policy', async () => {
    // 1. Create a preview-restricted & unpublished resource
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/resources',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        title: 'Restricted Staff Draft Material',
        exam: 'RRB',
        subject: 'General Science',
        fileType: 'PDF',
        fileBase64: Buffer.from(validPdfContent).toString('base64'),
        previewAllowed: false, // Student preview disabled!
        downloadAllowed: false, // Student download disabled!
      },
    });
    assert.equal(createRes.statusCode, 201);
    previewRestrictedResourceId = JSON.parse(createRes.payload).resource.id;

    // Student attempt: /downloads/stream/:id?preview=true should be blocked (403)
    const studentRes = await app.inject({
      method: 'GET',
      url: `/v1/downloads/stream/${previewRestrictedResourceId}?preview=true`,
    });
    assert.equal(studentRes.statusCode, 403);
    assert.equal(JSON.parse(studentRes.payload).error.code, 'PREVIEW_RESTRICTED');

    // Admin preview stream: /admin/resources/:id/preview-stream should succeed (200)
    const adminRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/resources/${previewRestrictedResourceId}/preview-stream`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(adminRes.statusCode, 200);
    assert.equal(adminRes.headers['content-type'], 'application/pdf');
    assert.equal(adminRes.headers['accept-ranges'], 'bytes');
    assert.ok(adminRes.payload.startsWith('%PDF-1.4'));
  });

  it('8.6 should return 404 RESOURCE_FILE_MISSING when binary file is absent (never generate fake substitute files)', async () => {
    // Resource pointing to non-existent disk path
    const ghostResourceId = `res_ghost_${Date.now()}`;
    await db.resources.set(ghostResourceId, {
      id: ghostResourceId,
      title: 'Ghost PDF Document',
      description: 'Ghost resource description',
      exam: 'SSC',
      subject: 'Polity',
      fileType: 'PDF',
      fileSizeBytes: 1024,
      sha256Hash: 'fake_sha256',
      storagePath: 'C:\\non_existent\\path\\ghost.pdf',
      previewAllowed: true,
      downloadAllowed: true,
      offlineAllowed: false,
      licenseSource: 'SidPrep Original',
      isPublished: true,
      verifiedDate: '2026-01-01',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/downloads/stream/${ghostResourceId}?preview=true`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RESOURCE_FILE_MISSING');

    await db.resources.delete(ghostResourceId);
  });
});
