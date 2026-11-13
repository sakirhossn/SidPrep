import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { query, closePool } from '../db/pool.js';
import { signJwt } from '../lib/security.js';

describe('Requirement 3: Multi-Format Question Importer (CSV & JSON) with Deduplication & Editorial Staging', () => {
  let app: any;
  let adminToken: string;
  const adminId = `adm_imp_${Date.now()}`;
  let csvBatchId = '';

  const csvPath = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\42002f34-9bdc-43ec-a2f9-065f7691a64f\\.user_uploaded\\media_1794489611588_1082507a.csv';
  const jsonPath = 'C:\\1002\\Agent\\export_questions_1794488598766.json';

  before(async () => {
    app = await buildServer();
    await app.ready();

    // Setup Content Manager admin
    await db.adminUsers.set(adminId, {
      id: adminId,
      name: 'Content Manager Importer',
      email: `content_mgr_${Date.now()}@sidprep.in`,
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
        email: `content_mgr_${Date.now()}@sidprep.in`,
        role: 'CONTENT_MANAGER',
        type: 'admin_session',
        tokenVersion: 1,
      },
      '2h'
    );
  });

  after(async () => {
    try {
      if (csvBatchId) {
        await query('DELETE FROM question_import_rows WHERE batch_id = $1', [csvBatchId]);
        await query('DELETE FROM question_import_batches WHERE id = $1', [csvBatchId]);
        await query('DELETE FROM questions WHERE import_batch_id = $1', [csvBatchId]);
      }
      await db.adminUsers.delete(adminId);
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    await closePool();
  });

  it('3.1 should inspect the real 1,737-row CSV export, detect categories, and flag exam_based items', async () => {
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/imports/inspect',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileContent: csvContent,
        filename: 'export_questions_1794488590723.csv',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.format, 'CSV');
    assert.equal(body.totalRows, 1737);
    assert.equal(body.examBasedCount, 5, 'Must explicitly detect all 5 exam_based rows');
    assert.ok(Object.keys(body.detectedCategories).length > 0, 'Must detect taxonomy categories');

    // Verify sample preview includes questionText, options, and letter
    assert.ok(body.samplePreview.length > 0);
    const sample = body.samplePreview[0];
    assert.ok(sample.questionText);
    assert.ok(sample.optionsCount >= 4);
    assert.ok(sample.correctLetter);
  });

  it('3.2 should reject questions with invalid answers or flag letter-text disagreements', async () => {
    // Malformed CSV row with mismatching answer text vs option
    const malformedCsv = `ID,Question,Category,Difficulty,Option A,Option B,Option C,Option D,Correct Answer,Explanation
mal_1,"What is the capital of India?","Geography","easy","New Delhi","Mumbai","Kolkata","Chennai","(B) New Delhi","Capital of India"
`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/imports/inspect',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileContent: malformedCsv,
        formatHint: 'CSV',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.totalRows, 1);
    assert.equal(body.reviewNeededCount, 1, 'Disagreement between letter (B) and text (New Delhi) must flag review needed');
  });

  it('3.3 should commit the 1,737-row CSV export as DRAFT with explicit default marks and exam_based mapping', async () => {
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/imports/commit',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileContent: csvContent,
        filename: 'export_questions_1794488590723.csv',
        format: 'CSV',
        examBasedMapping: 'MEDIUM',
        defaultMarks: 2.0,
        defaultNegativeMarks: 0.5,
        categoryMappings: {
          'Modern Indian History': 'history_modern',
          'Geography of India': 'geography_india',
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.editorialStatus, 'DRAFT', 'All imported questions must be saved as DRAFT');
    assert.equal(body.totalRows, 1737);
    assert.ok(body.acceptedCount > 1700);
    assert.ok(body.batchId);
    csvBatchId = body.batchId;

    // Verify in PostgreSQL database
    const dbBatch = await query<any>('SELECT * FROM question_import_batches WHERE id = $1', [csvBatchId]);
    assert.equal(dbBatch.rows.length, 1);
    assert.equal(dbBatch.rows[0].status, 'COMPLETED');
    assert.equal(dbBatch.rows[0].total_rows, 1737);

    // Verify questions in PostgreSQL have status DRAFT and marks_source IMPORT_DEFAULT
    const savedQuestions = await query<any>(
      'SELECT id, status, marks, negative_marks, marks_source, external_source_id FROM questions WHERE import_batch_id = $1 LIMIT 5',
      [csvBatchId]
    );
    assert.equal(savedQuestions.rows.length, 5);
    for (const q of savedQuestions.rows) {
      assert.equal(q.status, 'DRAFT');
      assert.equal(Number(q.marks), 2.0);
      assert.equal(Number(q.negative_marks), 0.5);
      assert.equal(q.marks_source, 'IMPORT_DEFAULT');
      assert.ok(q.external_source_id);
    }
  });

  it('3.4 should inspect JSON export and detect all 1,737 questions as DUPLICATES', async () => {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/imports/inspect',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileContent: jsonContent,
        filename: 'export_questions_1794488598766.json',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.format, 'JSON');
    assert.equal(body.totalRows, 1737);
    assert.equal(
      body.duplicateCount,
      1737,
      'All 1,737 questions in JSON export must be recognized as DUPLICATE of previously imported CSV questions'
    );
    assert.equal(body.acceptedCount, 0, 'Zero questions accepted because all are duplicates');
  });

  it('3.5 should safely commit JSON import with updateExisting=false skipping duplicates', async () => {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/questions/imports/commit',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        fileContent: jsonContent,
        filename: 'export_questions_1794488598766.json',
        format: 'JSON',
        updateExisting: false,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.totalRows, 1737);
    assert.equal(body.duplicateCount, 1737, 'Must skip all duplicates');
    assert.equal(body.acceptedCount, 0, 'No new questions inserted');

    // Clean up second batch
    if (body.batchId) {
      await query('DELETE FROM question_import_rows WHERE batch_id = $1', [body.batchId]);
      await query('DELETE FROM question_import_batches WHERE id = $1', [body.batchId]);
    }
  });

  it('3.6 should retrieve import batch report with row-level audits', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/questions/imports/${csvBatchId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.batch);
    assert.equal(body.batch.id, csvBatchId);
    assert.ok(Array.isArray(body.rows));
    assert.ok(body.rows.length > 0);
    assert.ok(body.rows[0].external_source_id);
  });
});
