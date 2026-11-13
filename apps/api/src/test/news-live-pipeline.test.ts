process.env.NODE_ENV = 'test';
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import { executeNewsFetchJob } from '../services/newsIngestion.js';
import { signJwt, hashPassword } from '../lib/security.js';

describe('Requirement 2: Live News Fetching Pipeline, Telemetry Funnel & Retries', async () => {
  let app: any;
  let adminToken: string;

  before(async () => {
    app = await buildServer();

    // Ensure news_fetch_source_reports table exists
    await query(`
      CREATE TABLE IF NOT EXISTS news_fetch_source_reports (
        id VARCHAR(64) PRIMARY KEY,
        job_id VARCHAR(64) NOT NULL,
        source_id VARCHAR(64),
        source_name VARCHAR(255) NOT NULL,
        http_status INT DEFAULT 0,
        status_category VARCHAR(64) NOT NULL DEFAULT 'OK',
        parsed_count INT DEFAULT 0,
        in_date_range_count INT DEFAULT 0,
        duplicate_count INT DEFAULT 0,
        rejected_count INT DEFAULT 0,
        drafts_saved_count INT DEFAULT 0,
        rejection_reasons JSONB DEFAULT '[]',
        error_detail TEXT,
        latency_ms INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const pHash = await hashPassword('NewsAdminSecret123!');
    const caEditor = {
      id: 'adm_ca_editor_1',
      email: 'ca_editor@sidprep.in',
      name: 'Current Affairs Lead Editor',
      passwordHash: pHash,
      role: 'CA_EDITOR' as const,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await db.adminUsers.set(caEditor.id, caEditor);

    adminToken = signJwt(
      { sub: caEditor.id, adminId: caEditor.id, email: caEditor.email, role: caEditor.role, type: 'admin_session', tokenVersion: 1 },
      '8h'
    );
  });

  after(async () => {
    if (app) await app.close();
    await closePool();
  });

  it('2.1: Live execution of RBI Bulletin produces real database drafts with zero synthetic MCQs', async () => {
    // Run live fetch against RBI Official Bulletin
    const result = await executeNewsFetchJob({
      sourceId: 'src_rbi_bulletin',
      workerId: 'test_live_runner',
      maxConcurrency: 1,
      timeoutMs: 15000,
      maxAgeHours: 720, // 30 days to guarantee real press releases pass date window
    });

    assert.ok(result.jobId, 'Should generate a job ID');
    assert.ok(result.sourceReports.length > 0, 'Should have source report');

    const rbiReport = result.sourceReports[0];
    assert.equal(rbiReport.sourceId, 'src_rbi_bulletin');
    assert.equal(rbiReport.httpStatus, 200);
    assert.ok(rbiReport.parsedCount > 0, 'Should have parsed live entries from RBI feed');
    assert.ok(rbiReport.inDateRangeCount > 0, 'Live entries should be in date range');
    assert.ok(['OK', 'ALL_ITEMS_FILTERED'].includes(rbiReport.statusCategory));

    // Verify drafts in DB
    const drafts = Array.from(db.newsDrafts.values()).filter((d) => d.sourceName.includes('Reserve Bank'));
    if (drafts.length > 0) {
      const sample = drafts[0];
      assert.ok(sample.headline, 'Must have headline');
      assert.ok(sample.keyFacts && sample.keyFacts.length > 0, 'Must have factual pointers');
      // Invariant: Practice MCQs must NOT contain fake synthetic boilerplate
      assert.deepEqual(sample.practiceMcqs, [], 'Incoming draft must not synthesize fake boilerplate options');
      assert.ok(['DRAFT', 'NEEDS_SOURCE_REVIEW'].includes(sample.editorialStatus));
    }

    // Verify report was persisted in PostgreSQL
    const dbReportRes = await query(`SELECT * FROM news_fetch_source_reports WHERE job_id = $1`, [result.jobId]);
    assert.ok(dbReportRes.rows.length > 0, 'PostgreSQL news_fetch_source_reports should have record');
  });

  it('2.2: Live Google News Discovery parses real items, and tracks per-source telemetry', async () => {
    const result = await executeNewsFetchJob({
      sourceId: 'src_gnews_defence',
      workerId: 'test_live_runner',
      maxConcurrency: 1,
      timeoutMs: 15000,
      maxAgeHours: 72,
    });

    assert.ok(result.sourceReports.length > 0);
    const gnewsReport = result.sourceReports[0];
    assert.equal(gnewsReport.httpStatus, 200);
    assert.ok(gnewsReport.parsedCount > 0, 'Google News Discovery should return entries');
    assert.equal(gnewsReport.statusCategory, 'OK');
    assert.ok(gnewsReport.draftsSavedCount > 0 || gnewsReport.duplicateCount > 0, 'Should save new drafts or deduplicate');
  });

  it('2.3: POST /v1/admin/news/fetch-now triggers live ingestion and returns full funnel report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/news/fetch-now',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { sourceId: 'src_gnews_sports', maxAgeHours: 48 },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.jobId);
    assert.ok(Array.isArray(body.sourceReports));
    assert.ok(body.sourceReports.length > 0);

    const report = body.sourceReports[0];
    assert.equal(report.httpStatus, 200);
    assert.ok(typeof report.parsedCount === 'number');
    assert.ok(typeof report.inDateRangeCount === 'number');
    assert.ok(typeof report.duplicateCount === 'number');
    assert.ok(typeof report.rejectedCount === 'number');
    assert.ok(typeof report.draftsSavedCount === 'number');
  });

  it('2.4: GET /v1/admin/news/jobs/:id/reports returns per-source report with rejection reasons', async () => {
    // Create dummy job and report with rejections
    const testJobId = `job_test_rep_${Date.now()}`;
    await query(`
      INSERT INTO news_fetch_jobs (id, status, worker_id, created_at, started_at)
      VALUES ($1, 'COMPLETED', 'test_worker', NOW(), NOW())
    `, [testJobId]);

    const testRepId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await query(`
      INSERT INTO news_fetch_source_reports (
        id, job_id, source_id, source_name, http_status, status_category,
        parsed_count, in_date_range_count, duplicate_count, rejected_count,
        drafts_saved_count, rejection_reasons, latency_ms
      ) VALUES (
        $2, $1, NULL, 'Test Custom Source', 200, 'ALL_ITEMS_FILTERED',
        10, 8, 2, 6, 0, '["[Headline 1]: LOW_EXAM_RELEVANCE", "[Headline 2]: STALE_PUBLICATION_DATE"]'::jsonb, 150
      )
    `, [testJobId, testRepId]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/news/jobs/${testJobId}/reports`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.reports.length, 1);
    assert.equal(body.reports[0].status_category, 'ALL_ITEMS_FILTERED');
    assert.equal(body.reports[0].rejected_count, 6);
  });

  it('2.5: Newly created drafts appear in GET /v1/admin/news/drafts without filter hiding', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/news/drafts?status=ALL',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const drafts = JSON.parse(res.body);
    assert.ok(Array.isArray(drafts));
    assert.ok(drafts.length > 0, 'Should have real drafts in the database');
    const firstDraft = drafts[0];
    assert.ok(['DRAFT', 'NEEDS_SOURCE_REVIEW', 'APPROVED', 'PUBLISHED'].includes(firstDraft.editorialStatus));
  });
});
