import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { db } from '../db/index.js';
import { closePool, query } from '../db/pool.js';
import { signJwt } from '../lib/security.js';
import {
  evaluateCompetitiveExamArticle,
  parseFeedXml,
  parseFeedXmlDetailed,
} from '../services/newsIngestion.js';
import type { FastifyInstance } from 'fastify';

describe('Competitive Exam Current Affairs Ingestion & Student Services Test Suite', () => {
  let app: FastifyInstance;

  const editorId = `adm_ca_lead_${Date.now()}`;
  let editorToken: string;

  before(async () => {
    app = await buildServer();
    await db.init();

    await db.adminUsers.set(editorId, {
      id: editorId,
      email: `ca.lead.${Date.now()}@sidprep.in`,
      name: 'Lead CA Editor',
      role: 'CA_EDITOR',
      isActive: true,
      tokenVersion: 1,
      is2faEnabled: true,
      passwordHash: 'dummy_hash',
      totpSecret: 'dummy_secret',
      createdAt: new Date().toISOString(),
    });

    editorToken = signJwt(
      { sub: editorId, email: `ca.lead.${Date.now()}@sidprep.in`, role: 'CA_EDITOR', type: 'admin_session', tokenVersion: 1 },
      '1h',
      { audience: 'sidprep:admin_session' }
    );
  });

  after(async () => {
    await app.close();
    await closePool();
  });

  it('1. Ingestion filters out blacklisted items (politics, local crime, celebrity gossip, ads, tenders)', () => {
    // Political debate / rally / mudslinging
    const resPolitics = evaluateCompetitiveExamArticle(
      'Party Spokesperson hits back at opposition over political slugfest',
      'The party spokesperson blamed rival politicians during an electoral rally and slammed seat sharing talks.',
      'Political News'
    );
    assert.equal(resPolitics.isEligible, false);
    assert.ok(resPolitics.rejectionReason?.includes('POLITICAL_ARGUMENT'));

    // Routine speech / birthday greetings
    const resRoutine = evaluateCompetitiveExamArticle(
      'Minister greets citizens on occasion and congratulates on birthday',
      'The minister delivered a routine address wishing speedy recovery and felicitating party workers.',
      'Local Bureau'
    );
    assert.equal(resRoutine.isEligible, false);
    assert.ok(resRoutine.rejectionReason?.includes('ROUTINE_SPEECH'));

    // Local crime / theft
    const resCrime = evaluateCompetitiveExamArticle(
      'Police arrested for theft after jewelry shop looted in city market',
      'Local police arrested three suspects after gold was looted in hit-and-run robbery incident.',
      'City Crime'
    );
    assert.equal(resCrime.isEligible, false);
    assert.ok(resCrime.rejectionReason?.includes('LOCAL_CRIME'));

    // Celebrity gossip
    const resCelebrity = evaluateCompetitiveExamArticle(
      'Bollywood actor spotted at wedding ceremony with designer red carpet look',
      'Box office collection updates and trailer release dates announced amidst dating rumors.',
      'Showbiz'
    );
    assert.equal(resCelebrity.isEligible, false);
    assert.ok(resCelebrity.rejectionReason?.includes('CELEBRITY_GOSSIP'));

    // Advertisement / Commercial PR
    const resAd = evaluateCompetitiveExamArticle(
      'Smartphone launch: pre-order now with discount offer flat 20% off',
      'Limited period offer price starts at 15000 buy online during promotional campaign sale.',
      'Tech Deals'
    );
    assert.equal(resAd.isEligible, false);
    assert.ok(resAd.rejectionReason?.includes('ADVERTISEMENT'));

    // Tender notice
    const resTender = evaluateCompetitiveExamArticle(
      'Notice Inviting Tender for supply of civil construction works in division',
      'e-tender notice published for procurement tender and auction of scrap materials.',
      'Tenders Portal'
    );
    assert.equal(resTender.isEligible, false);
    assert.ok(resTender.rejectionReason?.includes('TENDER_NOTICE'));
  });

  it('2. Ingestion selects high-value exam topics and converts into headline, facts, static GK, and grounded MCQ', () => {
    // Government Scheme (PM Surya Ghar)
    const schemeEval = evaluateCompetitiveExamArticle(
      'PM-Surya Ghar Muft Bijli Yojana sanctions ₹75,021 crore outlay for rooftop solar systems',
      'The Union Cabinet chaired by the Prime Minister has approved the scheme with an allocation of ₹75,021 crore. It provides 300 units of free electricity monthly for 1 crore households. Administered by Ministry of New and Renewable Energy with 60% subsidy for 2kW capacity systems.',
      'PIB New Delhi'
    );

    assert.equal(schemeEval.isEligible, true);
    assert.equal(schemeEval.category, 'Government Schemes');
    assert.ok(schemeEval.relevantExams?.includes('SSC'));
    assert.ok(schemeEval.relevantExams?.includes('RRB'));
    assert.ok(schemeEval.relevantExams?.includes('WBPSC'));
    assert.ok(schemeEval.relevantExams?.includes('IBPS'));
    assert.ok(schemeEval.keyFacts && schemeEval.keyFacts.length >= 3);
    assert.ok(schemeEval.staticGkBackground && schemeEval.staticGkBackground.includes('Directive Principles'));
    assert.equal(schemeEval.practiceMcqs?.length, 1);
    assert.equal(schemeEval.practiceMcqs?.[0].options.length, 4);
    assert.equal(schemeEval.practiceMcqs?.[0].correctOptionId, 'opt_a');

    // Economy & Banking (RBI Repo Rate)
    const rbiEval = evaluateCompetitiveExamArticle(
      'RBI Monetary Policy Committee keeps Repo Rate unchanged at 6.50 percent',
      'Reserve Bank of India Governor announced Monetary Policy Committee decision maintaining repo rate under liquidity adjustment facility. Standing Deposit Facility SDF rate remains at 6.25% and Marginal Standing Facility MSF rate at 6.75%. Retail inflation CPI projected at 4.5% for current fiscal year.',
      'RBI Gazette'
    );

    assert.equal(rbiEval.isEligible, true);
    assert.equal(rbiEval.category, 'Economy & Banking');
    assert.ok(rbiEval.relevantExams?.includes('IBPS'));
    assert.ok(rbiEval.relevantExams?.includes('SSC'));
    assert.ok(rbiEval.staticGkBackground?.includes('Reserve Bank of India Act, 1934'));
  });

  it('3. Editor can edit draft content, correct exam tags (SSC/RRB/WBPSC/IBPS), and approve for publication', async () => {
    const draftId = `art_test_${Date.now()}`;
    await db.newsDrafts.set(draftId, {
      id: draftId,
      title: 'Draft Scheme Announcement',
      originalSummary: 'Initial raw summary fetched from press feed.',
      category: 'Government Schemes',
      targetExams: ['SSC'],
      keyFacts: ['Initial point 1', 'Initial point 2', 'Initial point 3'],
      sourceName: 'Official Press',
      sourceUrl: 'https://pib.gov.in/test-article',
      confidenceScore: 0.95,
      editorialStatus: 'DRAFT',
      eventDate: '2026-11-11',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Editor corrects exam tags, headline, static GK, and practice MCQ
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}`,
      headers: { authorization: `Bearer ${editorToken}` },
      payload: {
        headline: 'PM Vishwakarma Scheme Crosses 20 Lakh Enrolled Artisans Across States',
        summary: 'Ministry of Micro, Small and Medium Enterprises reported massive outreach providing collateral-free loans up to ₹3 lakh at subsidized 5% interest.',
        category: 'Government Schemes',
        targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
        keyFacts: [
          'Collateral-free credit support up to ₹1 lakh (First Tranche) and ₹2 lakh (Second Tranche).',
          'Concessional interest rate fixed at 5% with Interest Subvention cap of 8% by Government.',
          'Provides Skill Upgradation stipend of ₹500 per day and Tool-kit incentive of ₹15,000.',
        ],
        staticGkBackground: 'Launched on Vishwakarma Jayanti (17 September 2023) under Ministry of MSME as a Central Sector Scheme with 100% Union Government funding.',
        practiceMcqs: [
          {
            question: 'What is the maximum subsidized interest rate charged to beneficiaries under the PM Vishwakarma Scheme?',
            options: [
              { id: 'opt_a', text: '5%' },
              { id: 'opt_b', text: '8%' },
              { id: 'opt_c', text: '3%' },
              { id: 'opt_d', text: '12%' },
            ],
            correctOptionId: 'opt_a',
            explanation: 'Under PM Vishwakarma Scheme, beneficiaries receive loans at a concessional interest rate of 5%, with interest subvention provided by Ministry of MSME.',
          },
        ],
        status: 'APPROVED',
      },
    });

    assert.equal(updateRes.statusCode, 200);
    const updated = JSON.parse(updateRes.body).draft;
    assert.equal(updated.headline, 'PM Vishwakarma Scheme Crosses 20 Lakh Enrolled Artisans Across States');
    assert.deepEqual(updated.targetExams, ['SSC', 'RRB', 'WBPSC', 'IBPS']);
    assert.equal(updated.editorialStatus, 'APPROVED');

    // Publish the approved draft
    const publishRes = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/news/drafts/${draftId}`,
      headers: { authorization: `Bearer ${editorToken}` },
      payload: { status: 'PUBLISHED' },
    });
    assert.equal(publishRes.statusCode, 200);
    const published = JSON.parse(publishRes.body).draft;
    assert.equal(published.editorialStatus, 'PUBLISHED');
  });

  it('4. GET /v1/current-affairs/daily serves daily articles and filters by target exam', async () => {
    const resAll = await app.inject({
      method: 'GET',
      url: '/v1/current-affairs/daily?exam=ALL',
    });
    assert.equal(resAll.statusCode, 200);
    const bodyAll = JSON.parse(resAll.body);
    assert.equal(bodyAll.success, true);
    assert.ok(Array.isArray(bodyAll.articles));
    assert.ok(bodyAll.articles.length > 0);

    const firstArt = bodyAll.articles[0];
    assert.ok(firstArt.headline);
    assert.ok(firstArt.summary);
    assert.ok(Array.isArray(firstArt.keyFacts));

    // Filter by specific exam (e.g. WBPSC)
    const resWbpsc = await app.inject({
      method: 'GET',
      url: '/v1/current-affairs/daily?exam=WBPSC',
    });
    assert.equal(resWbpsc.statusCode, 200);
    const bodyWbpsc = JSON.parse(resWbpsc.body);
    assert.equal(bodyWbpsc.success, true);
    for (const art of bodyWbpsc.articles) {
      assert.ok(art.targetExams.some((e: string) => e.toUpperCase().includes('WBPSC')));
    }
  });

  it('5. GET /v1/current-affairs/daily-quiz generates practice test and POST /submit evaluates score', async () => {
    // 1. Fetch Daily Quiz
    const quizRes = await app.inject({
      method: 'GET',
      url: '/v1/current-affairs/daily-quiz?exam=SSC',
    });

    assert.equal(quizRes.statusCode, 200);
    const quiz = JSON.parse(quizRes.body);
    assert.equal(quiz.success, true);
    assert.ok(quiz.quizId);
    assert.ok(Array.isArray(quiz.questions));
    assert.ok(quiz.questions.length > 0);

    const firstQuestion = quiz.questions[0];
    assert.ok(firstQuestion.id);
    assert.ok(firstQuestion.questionText);
    assert.equal(firstQuestion.options.length, 4);
    // Invariant: public quiz prompt must not leak correctOptionId directly
    assert.equal(firstQuestion.correctOptionId, undefined);

    // 2. Submit Daily Quiz
    const submitRes = await app.inject({
      method: 'POST',
      url: '/v1/current-affairs/daily-quiz/submit',
      payload: {
        quizId: quiz.quizId,
        answers: {
          [firstQuestion.id]: 'opt_a', // correct option
        },
      },
    });

    assert.equal(submitRes.statusCode, 200);
    const result = JSON.parse(submitRes.body);
    assert.equal(result.success, true);
    assert.equal(result.quizId, quiz.quizId);
    assert.ok(typeof result.score === 'number');
    assert.ok(Array.isArray(result.answersReview));
    assert.ok(result.answersReview[0].explanation);
  });

  it('6. GET /v1/current-affairs/monthly returns categorized revision digest for monthly revision', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/current-affairs/monthly?year=2026&month=11&exam=SSC',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.month, '2026-11');
    assert.ok(Array.isArray(body.categories));
    assert.ok(body.totalArticles >= 1);
  });
});
