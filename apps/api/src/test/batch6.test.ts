process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Batch 6: Public Route Metadata, CMS Directory & Sitemap Alignment (F32)', async () => {
  let app: any;

  const adminId = 'adm_batch6_tester';
  const adminToken = signJwt(
    { sub: adminId, email: 'admin.b6@sidprep.in', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
    '1h',
    { audience: 'sidprep:admin_session' }
  );

  before(async () => {
    app = await buildServer();
    await db.init();

    await db.adminUsers.set(adminId, {
      id: adminId,
      email: 'admin.b6@sidprep.in',
      name: 'Batch 6 Tester',
      passwordHash: 'dummy_hash',
      totpSecret: 'DUMMYSECRET',
      is2faEnabled: true,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  it('F32: GET /v1/pages lists only published CMS pages with real metadata', async () => {
    const pubSlug = `batch6-pub-${Date.now()}`;
    const draftSlug = `batch6-draft-${Date.now()}`;

    // Create a published page via admin route
    const pubRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Published Notice 2026',
        slug: pubSlug,
        subtitle: 'Official examination syllabus guidelines',
        metaTitle: 'Official 2026 Examination Syllabus Guidelines | SidPrep',
        metaDescription: 'Complete verified syllabus structure and topic weightages for government aspirants.',
        contentHtml: '<p>Published content details here.</p>',
      },
    });
    assert.equal(pubRes.statusCode, 201);

    // Ensure it is published
    const pubPage = Array.from(db.pages.values()).find((p) => p.slug === pubSlug);
    assert.ok(pubPage);
    pubPage.isPublished = true;
    await db.pages.set(pubPage.id, pubPage);

    // Create draft page that remains unpublished
    const draftRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Draft Unreleased Page',
        slug: draftSlug,
        subtitle: 'Internal notes not ready for public indexing',
        metaTitle: 'Internal Secret Notes',
        metaDescription: 'Should not appear publicly.',
        contentHtml: '<p>Internal draft only.</p>',
      },
    });
    assert.equal(draftRes.statusCode, 201);
    const draftPage = Array.from(db.pages.values()).find((p) => p.slug === draftSlug);
    assert.ok(draftPage);
    draftPage.isPublished = false;
    await db.pages.set(draftPage.id, draftPage);

    // Fetch public /v1/pages
    const res = await app.inject({
      method: 'GET',
      url: '/v1/pages',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(Array.isArray(body.pages));

    // The published page must be present in the public listing
    const foundPub = body.pages.find((p: any) => p.slug === pubSlug);
    assert.ok(foundPub, 'Published page must appear in public sitemap directory');
    assert.equal(foundPub.title, 'Published Notice 2026');
    assert.equal(foundPub.metaTitle, 'Official 2026 Examination Syllabus Guidelines | SidPrep');
    assert.ok(foundPub.updatedAt, 'Must include real timestamp for sitemap lastModified');

    // The draft/unpublished page must NOT be present
    const foundDraft = body.pages.find((p: any) => p.slug === draftSlug);
    assert.equal(foundDraft, undefined, 'Unpublished draft page must be excluded from public directory');
  });

  it('F32: Public GET /v1/pages/:slug returns 404 for unpublished draft pages', async () => {
    const draftSlug = `batch6-draft-404-${Date.now()}`;
    const pageId = `page_draft_${Date.now()}`;

    await db.pages.set(pageId, {
      id: pageId,
      title: 'Secret Draft',
      slug: draftSlug,
      subtitle: 'Draft',
      contentHtml: '<p>Draft</p>',
      metaTitle: 'Secret Draft',
      metaDescription: 'Draft description',
      isSystem: false,
      isPublished: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/pages/${draftSlug}`,
    });

    assert.equal(res.statusCode, 404, 'Unpublished CMS page must return 404 to public visitors');
  });
});
