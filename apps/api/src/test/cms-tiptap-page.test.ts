import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Requirement 4: Website Page CMS Visual Editor, Sanitization, Revisions & Safe URL Handling', () => {
  let app: any;
  let adminToken: string;
  const adminId = `adm_cms_${Date.now()}`;
  let createdPageId = '';
  const testSlug = `exam-guide-${Date.now()}`;

  before(async () => {
    app = await buildServer();
    await app.ready();

    // Create Content Manager admin
    await db.adminUsers.set(adminId, {
      id: adminId,
      name: 'CMS Content Editor',
      email: `cms_editor_${Date.now()}@sidprep.in`,
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
        email: `cms_editor_${Date.now()}@sidprep.in`,
        role: 'CONTENT_MANAGER',
        type: 'admin_session',
        tokenVersion: 1,
      },
      '2h'
    );
  });

  after(async () => {
    try {
      if (createdPageId) {
        await query('DELETE FROM cms_page_revisions WHERE page_id = $1', [createdPageId]);
        await db.pages.delete(createdPageId);
      }
      await db.adminUsers.delete(adminId);
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
    await closePool();
  });

  it('4.1 should create a new CMS page with rich-text HTML (headings, lists, tables, images, links) and sanitize dangerous scripts', async () => {
    const rawHtmlContent = `
      <h1>Complete SSC CGL 2026 Preparation Strategy</h1>
      <p>Follow this authoritative blueprint for <strong>Tier-1 and Tier-2</strong> success.</p>
      <ul>
        <li>Quantitative Aptitude</li>
        <li>General Intelligence and Reasoning</li>
        <li>English Comprehension</li>
      </ul>
      <table class="w-full border border-slate-700">
        <thead>
          <tr><th>Subject</th><th>Questions</th><th>Marks</th></tr>
        </thead>
        <tbody>
          <tr><td>General Awareness</td><td>25</td><td>50</td></tr>
          <tr><td>Quantitative</td><td>25</td><td>50</td></tr>
        </tbody>
      </table>
      <img src="https://images.unsplash.com/photo-123" alt="Study Plan" />
      <a href="https://sidprep.in/syllabus" target="_blank">View Official Syllabus</a>
      <script>alert("XSS Attack!");</script>
      <div onclick="evilCode()">Clickable div</div>
      <a href="javascript:stealTokens()">Malicious Link</a>
    `;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        title: 'Complete SSC CGL 2026 Preparation Strategy',
        slug: testSlug,
        subtitle: 'Comprehensive roadmap for competitive aspirants',
        contentHtml: rawHtmlContent,
        metaTitle: 'SSC CGL 2026 Preparation Guide | SidPrep',
        metaDescription: 'Best tips, syllabus, and study plan for SSC CGL 2026 exam.',
        isPublished: true,
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.page.id);
    createdPageId = body.page.id;

    // Verify sanitization
    const sanitizedHtml = body.page.contentHtml;
    assert.ok(sanitizedHtml.includes('<h1>Complete SSC CGL 2026 Preparation Strategy</h1>'));
    assert.ok(sanitizedHtml.includes('<table'));
    assert.ok(sanitizedHtml.includes('<th>Subject</th>'));
    assert.ok(sanitizedHtml.includes('<img src="https://images.unsplash.com/photo-123" alt="Study Plan"'));
    assert.ok(sanitizedHtml.includes('href="https://sidprep.in/syllabus"'));

    // Invariants: dangerous scripts, inline event handlers, and javascript: links stripped
    assert.ok(!sanitizedHtml.includes('<script>'), 'Must strip <script> tags');
    assert.ok(!sanitizedHtml.includes('alert("XSS Attack!")'));
    assert.ok(!sanitizedHtml.includes('onclick='), 'Must strip inline onclick handlers');
    assert.ok(!sanitizedHtml.includes('javascript:stealTokens()'), 'Must strip javascript: URLs');
  });

  it('4.2 should render saved rich-text page on public endpoint /v1/pages/:slug', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/pages/${testSlug}`,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.slug, testSlug);
    assert.ok(body.contentHtml.includes('Complete SSC CGL 2026 Preparation Strategy'));
    assert.ok(body.contentHtml.includes('<table'));
  });

  it('4.3 should hide draft page from public endpoint when isPublished is false', async () => {
    // Unpublish page
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/pages/${createdPageId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        isPublished: false,
      },
    });
    assert.equal(updateRes.statusCode, 200);

    // Public lookup should now return 404
    const publicRes = await app.inject({
      method: 'GET',
      url: `/v1/pages/${testSlug}`,
    });
    assert.equal(publicRes.statusCode, 404);
  });

  it('4.4 should track revisions on updates and allow 1-click restore to earlier snapshot', async () => {
    const initialContent = (db.pages.get(createdPageId) || {}).contentHtml;

    // Perform an update with new content
    const updatedHtml = `<h2>Updated Syllabus Section</h2><p>This is revision #2 content.</p>`;
    const putRes = await app.inject({
      method: 'PUT',
      url: `/v1/admin/pages/${createdPageId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        contentHtml: updatedHtml,
        isPublished: true,
      },
    });
    assert.equal(putRes.statusCode, 200);

    // Query revisions
    const revsRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/pages/${createdPageId}/revisions`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(revsRes.statusCode, 200);
    const revsBody = JSON.parse(revsRes.payload);
    assert.ok(Array.isArray(revsBody.revisions));
    assert.ok(revsBody.revisions.length >= 1);

    const firstSnapshot = revsBody.revisions[revsBody.revisions.length - 1];

    // Revert to first snapshot
    const revertRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/pages/${createdPageId}/revert`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        revisionId: firstSnapshot.id,
      },
    });

    assert.equal(revertRes.statusCode, 200);
    const revertBody = JSON.parse(revertRes.payload);
    assert.equal(revertBody.success, true);

    // Verify content restored
    const restoredPage = db.pages.get(createdPageId);
    assert.equal(restoredPage?.contentHtml, firstSnapshot.contentHtml);
  });

  it('4.5 should upload and stream CMS images with magic byte validation and cache headers', async () => {
    // 1x1 transparent PNG file bytes
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages/images',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileBase64: pngBase64,
        filename: 'test_chart.png',
        fileType: 'PNG',
      },
    });

    assert.equal(uploadRes.statusCode, 200);
    const uploadBody = JSON.parse(uploadRes.payload);
    assert.equal(uploadBody.success, true);
    assert.ok(uploadBody.url);
    assert.ok(uploadBody.filename);

    // Stream image
    const streamRes = await app.inject({
      method: 'GET',
      url: uploadBody.url,
    });
    assert.equal(streamRes.statusCode, 200);
    assert.equal(streamRes.headers['content-type'], 'image/png');
    assert.ok(streamRes.headers['cache-control']?.includes('public'));
  });
});
