import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { signJwt } from '../lib/security.js';
import { closePool, query } from '../db/pool.js';

describe('Stage 6 Regression: CMS Page Editor, Revision History & App Updates', () => {
  let app: FastifyInstance;
  const ts = Date.now();
  const superAdminId = `adm_stage6_super_${ts}`;
  const superAdminEmail = `super.stage6_${ts}@example.com`;
  let superAdminToken: string;

  before(async () => {
    app = await buildServer();
    await app.ready();
    await query('DELETE FROM app_releases');

    await db.adminUsers.set(superAdminId, {
      id: superAdminId,
      email: superAdminEmail,
      name: 'Stage 6 Super Admin',
      passwordHash: 'dummy',
      totpSecret: 'dummy',
      is2faEnabled: false,
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });

    superAdminToken = signJwt(
      { sub: superAdminId, email: superAdminEmail, name: 'Stage 6 Super Admin', role: 'SUPER_ADMIN', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_api' }
    );
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  test('6.1 CMS Page revision snapshots & revert mechanism', async () => {
    const pageSlug = `stage6-test-page-${ts}`;

    // 1. Create page (Initial Version)
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/pages',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        title: 'Original Title',
        slug: pageSlug,
        contentHtml: '<p>Initial content version 1</p>',
        isPublished: true,
      },
    });
    assert.equal(createRes.statusCode, 201);
    const createdPage = JSON.parse(createRes.body).page;
    assert.ok(createdPage.id);

    // 2. Update page to version 2 (creating revision snapshot #1)
    const update1Res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/pages/${createdPage.id}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        title: 'Second Revision Title',
        contentHtml: '<p>Updated content version 2</p>',
      },
    });
    assert.equal(update1Res.statusCode, 200);

    // 3. Update page to version 3 (creating revision snapshot #2)
    const update2Res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/pages/${createdPage.id}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        title: 'Third Revision Title',
        contentHtml: '<p>Updated content version 3</p>',
      },
    });
    assert.equal(update2Res.statusCode, 200);

    // 4. Fetch revisions list
    const revsRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/pages/${createdPage.id}/revisions`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(revsRes.statusCode, 200);
    const revsBody = JSON.parse(revsRes.body);
    assert.equal(revsBody.success, true);
    assert.ok(Array.isArray(revsBody.revisions));
    assert.equal(revsBody.revisions.length, 2);

    // Revision 1 holds 'Original Title' and 'Initial content version 1'
    const rev1 = revsBody.revisions.find((r: any) => r.revisionNumber === 1);
    assert.ok(rev1);
    assert.equal(rev1.title, 'Original Title');
    assert.ok(rev1.contentHtml.includes('version 1'));

    // 5. Revert to Revision 1
    const revertRes = await app.inject({
      method: 'POST',
      url: `/v1/admin/pages/${createdPage.id}/revert`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { revisionId: rev1.id },
    });
    assert.equal(revertRes.statusCode, 200);
    const revertBody = JSON.parse(revertRes.body);
    assert.equal(revertBody.success, true);
    assert.equal(revertBody.page.title, 'Original Title');
    assert.ok(revertBody.page.contentHtml.includes('version 1'));

    // Verify in db.pages
    const livePage = db.pages.get(createdPage.id);
    assert.equal(livePage?.title, 'Original Title');
  });

  test('6.2 Application update pipeline & version checks', async () => {
    // 1. Create a draft release v1.1.0 (build 11)
    const draftRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        version: '1.1.0',
        buildNumber: 11,
        minSupportedVersion: '1.0.0',
        platform: 'ANDROID',
        releaseNotes: 'Performance improvements and bug fixes.',
        downloadUrl: 'https://cdn.sidprep.in/releases/sidprep-v1.1.0.apk',
        isPublished: false,
      },
    });
    assert.equal(draftRes.statusCode, 201);
    const releaseId = JSON.parse(draftRes.body).release.id;

    // 2. Client checks update -> draft is not visible
    const check1 = await app.inject({
      method: 'GET',
      url: '/v1/app/updates/check?platform=ANDROID&version=1.0.0&build=10',
    });
    assert.equal(check1.statusCode, 200);
    assert.equal(JSON.parse(check1.body).updateAvailable, false);

    // 3. Publish the release
    const pubRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/releases/${releaseId}/publish`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { isPublished: true, rolloutPercentage: 100 },
    });
    assert.equal(pubRes.statusCode, 200);

    // 4. Client with v1.0.0 checks update -> updateAvailable: true, isMandatory: false (1.0.0 >= min 1.0.0)
    const check2 = await app.inject({
      method: 'GET',
      url: '/v1/app/updates/check?platform=ANDROID&version=1.0.0&build=10',
    });
    assert.equal(check2.statusCode, 200);
    const check2Body = JSON.parse(check2.body);
    assert.equal(check2Body.updateAvailable, true);
    assert.equal(check2Body.isMandatory, false);
    assert.equal(check2Body.latestRelease.version, '1.1.0');

    // 5. Create and publish major release v2.0.0 (build 20) with minSupportedVersion '1.5.0'
    const majorRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/releases',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        version: '2.0.0',
        buildNumber: 20,
        minSupportedVersion: '1.5.0',
        platform: 'ANDROID',
        releaseNotes: 'Major new UI and features.',
        downloadUrl: 'https://cdn.sidprep.in/releases/sidprep-v2.0.0.apk',
        isPublished: true,
      },
    });
    assert.equal(majorRes.statusCode, 201);

    // 6. Client with v1.0.0 checks update -> updateAvailable: true, isMandatory: true! (1.0.0 < 1.5.0)
    const check3 = await app.inject({
      method: 'GET',
      url: '/v1/app/updates/check?platform=ANDROID&version=1.0.0&build=10',
    });
    assert.equal(check3.statusCode, 200);
    const check3Body = JSON.parse(check3.body);
    assert.equal(check3Body.updateAvailable, true);
    assert.equal(check3Body.isMandatory, true);
    assert.equal(check3Body.latestRelease.version, '2.0.0');

    // 7. Client already on v2.0.0 build 20 checks update -> updateAvailable: false
    const check4 = await app.inject({
      method: 'GET',
      url: '/v1/app/updates/check?platform=ANDROID&version=2.0.0&build=20',
    });
    assert.equal(check4.statusCode, 200);
    assert.equal(JSON.parse(check4.body).updateAvailable, false);
  });
});
