process.env.NODE_ENV = 'test';
import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import { signJwt, hashPassword } from '../lib/security.js';

describe('Requirement 5: Editable Database-Backed Taxonomy Management', async () => {
  let app: any;
  let superAdminToken: string;
  let reviewerToken: string;

  before(async () => {
    app = await buildServer();

    // Create staff users
    const pHash = await hashPassword('TaxonomySecret123!');
    const superAdmin = {
      id: 'adm_tax_super',
      email: 'tax_super@sidprep.in',
      name: 'Taxonomy Super Admin',
      passwordHash: pHash,
      role: 'SUPER_ADMIN' as const,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await db.adminUsers.set(superAdmin.id, superAdmin);

    const reviewer = {
      id: 'adm_tax_rev',
      email: 'tax_reviewer@sidprep.in',
      name: 'Taxonomy Reviewer',
      passwordHash: pHash,
      role: 'REVIEWER' as const,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await db.adminUsers.set(reviewer.id, reviewer);

    superAdminToken = signJwt(
      { sub: superAdmin.id, adminId: superAdmin.id, email: superAdmin.email, role: superAdmin.role, type: 'admin_session', tokenVersion: 1 },
      '8h'
    );
    reviewerToken = signJwt(
      { sub: reviewer.id, adminId: reviewer.id, email: reviewer.email, role: reviewer.role, type: 'admin_session', tokenVersion: 1 },
      '8h'
    );

    // Clean up any residual test records from prior runs
    await query("DELETE FROM syllabus_topics WHERE name IN ('Subject Alpha', 'Topic Beta', 'State Specific General Knowledge', 'Bengal Geography & Rivers', 'Sundarbans Delta Ecosystem')");
    await db.taxonomy.loadFromDb();
  });

  after(async () => {
    try {
      await query("DELETE FROM syllabus_topics WHERE name IN ('Subject Alpha', 'Topic Beta', 'State Specific General Knowledge', 'Bengal Geography & Rivers', 'Sundarbans Delta Ecosystem')");
      await db.taxonomy.loadFromDb();
    } catch {}
    if (app) await app.close();
    await closePool();
  });

  it('5.1: GET /v1/admin/taxonomy returns seeded database hierarchy and counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.tree));
    assert.ok(body.tree.length >= 3, 'Should have at least 3 root subjects');

    const quantSubject = body.tree.find((s: any) => s.name === 'Quantitative Aptitude');
    assert.ok(quantSubject, 'Quantitative Aptitude should exist');
    assert.equal(quantSubject.level, 'SUBJECT');
    assert.ok(quantSubject.children.length > 0, 'Quantitative Aptitude should have topics');
  });

  it('5.2: POST /v1/admin/taxonomy creates Subject, Topic, and Subtopic hierarchy', async () => {
    // 1. Create a custom Subject
    const subjRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'State Specific General Knowledge',
        level: 'SUBJECT',
        description: 'Comprehensive history, geography, and current affairs of West Bengal.',
        examMappings: ['WBPSC_CLERKSHIP'],
      },
    });
    assert.equal(subjRes.statusCode, 201);
    const subj = JSON.parse(subjRes.body).item;
    assert.equal(subj.name, 'State Specific General Knowledge');
    assert.equal(subj.level, 'SUBJECT');

    // 2. Create Topic under this Subject
    const topicRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Bengal Geography & Rivers',
        level: 'TOPIC',
        parentId: subj.id,
        examMappings: ['WBPSC_CLERKSHIP'],
      },
    });
    assert.equal(topicRes.statusCode, 201);
    const topic = JSON.parse(topicRes.body).item;
    assert.equal(topic.name, 'Bengal Geography & Rivers');
    assert.equal(topic.parentId, subj.id);

    // 3. Create Subtopic under Topic
    const subtopicRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Sundarbans Delta Ecosystem',
        level: 'SUBTOPIC',
        parentId: topic.id,
      },
    });
    assert.equal(subtopicRes.statusCode, 201);
    const subtopic = JSON.parse(subtopicRes.body).item;
    assert.equal(subtopic.name, 'Sundarbans Delta Ecosystem');
    assert.equal(subtopic.parentId, topic.id);
  });

  it('5.3: Duplicate sibling names and invalid parent levels are rejected', async () => {
    // Attempt duplicate subject name
    const dupRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Quantitative Aptitude',
        level: 'SUBJECT',
      },
    });
    assert.equal(dupRes.statusCode, 409);

    // Attempt topic without parent
    const noParentRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Orphan Topic',
        level: 'TOPIC',
      },
    });
    assert.equal(noParentRes.statusCode, 400);

    // Attempt subtopic with SUBJECT as parent (must be TOPIC)
    const invalidParentRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: {
        name: 'Direct Subtopic under Subject',
        level: 'SUBTOPIC',
        parentId: 'Quantitative Aptitude',
      },
    });
    assert.equal(invalidParentRes.statusCode, 400);
  });

  it('5.4: Cycle detection prevents moving a node under its own descendant', async () => {
    // Create Subject A -> Topic B -> Subtopic C
    const aRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Subject Alpha', level: 'SUBJECT' },
    });
    const aId = JSON.parse(aRes.body).item.id;

    const bRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Topic Beta', level: 'TOPIC', parentId: aId },
    });
    const bId = JSON.parse(bRes.body).item.id;

    // Moving Topic Beta to have itself as parent must be rejected
    const cycleRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/taxonomy/${bId}`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: { parentId: bId },
    });
    assert.equal(cycleRes.statusCode, 400);
  });

  it('5.5: Dependencies block deletion unless questions are reassigned', async () => {
    // Create a topic and attach a test question to it
    const topicRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/taxonomy',
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: { name: 'Topic To Delete', level: 'TOPIC', parentId: 'Quantitative Aptitude' },
    });
    const topicId = JSON.parse(topicRes.body).item.id;

    // Insert question referencing this topic
    const qId = `q_tax_test_${Date.now()}`;
    await db.questions.set(qId, {
      id: qId,
      topicId: topicId,
      difficulty: 'MEDIUM',
      correctOptionId: 'opt_a',
      createdBy: 'adm_tax_super',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'What is the sum of angles in a triangle?',
          explanation: '180 degrees',
          options: [
            { id: 'opt_a', text: '180' },
            { id: 'opt_b', text: '360' },
          ],
        },
      ],
    });

    // Check dependency endpoint
    const depRes = await app.inject({
      method: 'GET',
      url: `/v1/admin/taxonomy/${topicId}/dependencies`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(depRes.statusCode, 200);
    const depBody = JSON.parse(depRes.body);
    assert.equal(depBody.questionCount, 1);
    assert.equal(depBody.canDeleteDirectly, false);

    // Deleting without reassignToId must be rejected with 409
    const delRejectRes = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/taxonomy/${topicId}`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(delRejectRes.statusCode, 409);

    // Deleting with reassignToId must succeed and reassign question
    const delSuccessRes = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/taxonomy/${topicId}`,
      headers: { Authorization: `Bearer ${superAdminToken}` },
      payload: { reassignToId: 'Arithmetic' },
    });
    assert.equal(delSuccessRes.statusCode, 200);
    const delSuccessBody = JSON.parse(delSuccessRes.body);
    assert.equal(delSuccessBody.reassignedQuestionsCount, 1);

    // Verify question is now assigned to 'Arithmetic'
    const updatedQ = db.questions.get(qId);
    assert.equal(updatedQ?.topicId, 'Arithmetic');
  });

  it('5.6: Public GET /v1/taxonomy returns active curriculum tree without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/taxonomy',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.tree));
    assert.ok(body.tree.length > 0);
  });
});
