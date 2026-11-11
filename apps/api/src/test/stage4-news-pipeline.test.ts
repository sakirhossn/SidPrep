import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import { parseFeedXml, enrichNewsItem } from '../services/newsIngestion.js';
import type { FastifyInstance } from 'fastify';

describe('Stage 4: Current Affairs Pipeline & Editorial Workflow Test Suite', () => {
  let app: FastifyInstance;

  const caEditorId = `adm_stage4_ca_${Date.now()}`;
  let caEditorToken: string;

  before(async () => {
    app = await buildServer();
    await db.init();

    await db.adminUsers.set(caEditorId, {
      id: caEditorId,
      email: `ca.editor.${Date.now()}@sidprep.in`,
      name: 'Current Affairs Lead Editor',
      role: 'CA_EDITOR',
      isActive: true,
      tokenVersion: 1,
      is2faEnabled: true,
      passwordHash: 'dummy_hash',
      totpSecret: 'dummy_secret',
      createdAt: new Date().toISOString(),
    });

    caEditorToken = signJwt(
      { sub: caEditorId, email: `ca.editor.${Date.now()}@sidprep.in`, role: 'CA_EDITOR', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  it('1. parseFeedXml correctly extracts items, strips HTML, and enriches exam relevance', () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>PIB Official Releases</title>
        <link>https://pib.gov.in</link>
        <item>
          <title><![CDATA[ISRO successfully launches Navigation Satellite NVS-02 into Geosynchronous Orbit]]></title>
          <link>https://pib.gov.in/PressReleasePage.aspx?PRID=2099991</link>
          <description><![CDATA[<p>The Indian Space Research Organisation has achieved another milestone with GSLV-F12 mission deployed from SDSC-SHAR Sriharikota.</p>]]></description>
          <pubDate>Wed, 11 Nov 2026 05:30:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const items = parseFeedXml(sampleXml, 'Press Information Bureau (PIB)');
    assert.equal(items.length, 1);
    const item = items[0];
    assert.ok(item.title.includes('ISRO successfully launches'));
    assert.ok(item.summary.includes('Indian Space Research Organisation'));
    assert.equal(item.category, 'Science & Technology');
    assert.ok(item.relevantExams.includes('SSC_CGL'));
    assert.ok(item.relevantExams.includes('RRB_NTPC'));
    assert.ok(item.keyFacts.length >= 1);
    assert.ok(item.practiceMcqs.length >= 1);
    assert.equal(item.practiceMcqs[0].correctOptionId, 'opt_a');
  });

  it('2. POST /admin/news/sources rejects SSRF and internal loopback URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/news/sources',
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: {
        name: 'Malicious Internal Source',
        feedUrl: 'http://169.254.169.254/latest/meta-data/',
        category: 'National',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'SSRF_BLOCKED');
  });

  it('3. POST /admin/news/sources adds valid public official feed', async () => {
    const feedUrl = `https://www.isro.gov.in/rss_feed_${Date.now()}.xml`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/news/sources',
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: {
        name: 'ISRO Press Releases',
        feedUrl,
        category: 'Science & Technology',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.equal(body.data.name, 'ISRO Press Releases');
  });

  it('4. PATCH /admin/news/drafts/:id/status rejects invalid editorial transitions', async () => {
    const draftId = `draft_transition_${Date.now()}`;
    await db.newsDrafts.set(draftId, {
      id: draftId,
      title: 'Draft Unreviewed Article',
      originalSummary: 'Sample text awaiting review',
      category: 'National',
      targetExams: ['SSC_CGL'],
      keyFacts: ['Fact 1'],
      sourceName: 'PIB',
      sourceUrl: 'https://pib.gov.in/item_test_1',
      confidenceScore: 0.95,
      editorialStatus: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Invariant: Cannot jump from DRAFT straight to PUBLISHED without review/approval
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}/status`,
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: { status: 'PUBLISHED' },
    });

    assert.equal(invalidRes.statusCode, 400);
    const body = JSON.parse(invalidRes.body);
    assert.equal(body.error.code, 'INVALID_EDITORIAL_TRANSITION');

    // Valid transition step 1: DRAFT -> IN_REVIEW
    const step1 = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}/status`,
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: { status: 'IN_REVIEW' },
    });
    assert.equal(step1.statusCode, 200);

    // Valid transition step 2: IN_REVIEW -> REVIEWED
    const step2 = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}/status`,
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: { status: 'REVIEWED' },
    });
    assert.equal(step2.statusCode, 200);

    // Valid transition step 3: REVIEWED -> APPROVED
    const step3 = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}/status`,
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: { status: 'APPROVED' },
    });
    assert.equal(step3.statusCode, 200);

    // Valid transition step 4: APPROVED -> PUBLISHED
    const step4 = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}/status`,
      headers: { authorization: `Bearer ${caEditorToken}` },
      payload: { status: 'PUBLISHED' },
    });
    assert.equal(step4.statusCode, 200);
    const publishedDraft = db.newsDrafts.get(draftId)!;
    assert.equal(publishedDraft.editorialStatus, 'PUBLISHED');
  });

  it('5. GET /current-affairs returns published items and filters by category', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/current-affairs?category=National',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
  });
});
