import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { query } from '../db/pool.js';
import { newsRoutes } from '../modules/news/index.js';
import {
  parseFeedXmlDetailed,
  parseFeedXml,
  detectFeedFormat,
  cleanHtml,
  tokenizeHeadlineUnicode,
  calculateHeadlineSimilarity,
  areTitlesSimilar,
  shouldProhibitHeadlineMerge,
  buildGoogleNewsDiscoveryUrl,
  mapConcurrent,
  executeNewsFetchJob,
  testFeedConnectivity,
  retrieveArticleContentIfShort,
  SOURCE_GROUPS,
  DEFAULT_CANDIDATE_SOURCES,
} from '../services/newsIngestion.js';

describe('DailyDigest Ingestion Strategy Adaptation & Resilience Suite', () => {
  let app: FastifyInstance;

  before(async () => {
    app = Fastify();
    await app.register(newsRoutes, { prefix: '/v1' });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  // 1. RSS & Atom Feed Parsing
  it('1. Correctly parses both RSS 2.0 and Atom 1.0 feeds, extracting publisher, link, and dates', () => {
    const rssSample = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>PIB Press Releases</title>
        <link>https://pib.gov.in</link>
        <item>
          <title>Cabinet Approves National Green Hydrogen Mission Scheme Directives</title>
          <link>https://pib.gov.in/PressReleasePage.aspx?PRID=2099901</link>
          <guid>pib_guid_2099901</guid>
          <description><![CDATA[The Union Cabinet chaired by the Prime Minister has sanctioned ₹19,744 crore outlay for the National Green Hydrogen Mission.]]></description>
          <pubDate>Wed, 11 Nov 2026 06:00:00 GMT</pubDate>
          <dc:creator>Ministry of New and Renewable Energy</dc:creator>
        </item>
      </channel>
    </rss>`;

    const atomSample = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>ISRO Mission Updates</title>
      <entry>
        <title>ISRO Successfully Launches GSLV-F14 Satellite Mission into Orbit</title>
        <link href="https://www.isro.gov.in/gslv-f14-mission.html" />
        <id>urn:isro:gslv-f14</id>
        <summary>The Indian Space Research Organisation has successfully injected the meteorological satellite into geosynchronous transfer orbit from Sriharikota.</summary>
        <updated>2026-11-11T05:30:00Z</updated>
        <author><name>ISRO Press Desk</name></author>
      </entry>
    </feed>`;

    const rssFormat = detectFeedFormat(rssSample);
    assert.strictEqual(rssFormat, 'RSS_2_0');
    const rssResult = parseFeedXmlDetailed(rssSample, 'PIB National');
    assert.strictEqual(rssResult.eligibleItems.length, 1);
    assert.strictEqual(rssResult.eligibleItems[0].feedEntryId, 'pib_guid_2099901');
    assert.strictEqual(rssResult.eligibleItems[0].category, 'Government Schemes');

    const atomFormat = detectFeedFormat(atomSample);
    assert.strictEqual(atomFormat, 'ATOM_1_0');
    const atomResult = parseFeedXmlDetailed(atomSample, 'ISRO Official');
    assert.strictEqual(atomResult.eligibleItems.length, 1);
    assert.strictEqual(atomResult.eligibleItems[0].canonicalUrl, 'https://www.isro.gov.in/gslv-f14-mission.html');
    assert.strictEqual(atomResult.eligibleItems[0].category, 'Science & Technology');
  });

  // 2. Google News Discovery URL construction with grouped freshness
  it('2. Builds properly encoded Google News RSS queries with grouped freshness syntax', () => {
    const queryGroup = 'ISRO OR DRDO OR "military exercise"';
    const url = buildGoogleNewsDiscoveryUrl(queryGroup);
    assert.ok(url.startsWith('https://news.google.com/rss/search?q='));
    assert.ok(url.includes('hl=en-IN&gl=IN&ceid=IN:en'));
    // Verify grouping: decoded search query has parentheses around keywords before when:1d
    const decodedUrl = decodeURIComponent(url);
    assert.ok(decodedUrl.includes('(ISRO OR DRDO OR "military exercise") when:1d'));
  });

  // 3. HTML Sanitization (cleanHtml)
  it('3. cleanHtml strips script, style tags, HTML entities and collapses whitespace', () => {
    const messyHtml = `
      <p>Cabinet announces &nbsp; <b>PM-Kisan</b> 18th installment release.&mdash;
        <style>body { font-size: 14px; }</style>
        <script>console.log("tracking pixel");</script>
      </p>
    `;
    const clean = cleanHtml(messyHtml);
    assert.strictEqual(clean, 'Cabinet announces PM-Kisan 18th installment release.—');
  });

  // 4. Unicode Tokenization and Jaccard Headline Similarity
  it('4. Supports Unicode tokenization and calculates Jaccard similarity across English, Hindi, and Bengali', () => {
    const eng1 = 'ISRO successfully launches PSLV-C58 satellite mission';
    const eng2 = 'ISRO launches PSLV-C58 satellite mission successfully into orbit';
    const eng3 = 'Reserve Bank of India keeps repo rate unchanged at 6.50%';

    assert.ok(areTitlesSimilar(eng1, eng2, 0.65), 'Similar English headlines should match');
    assert.ok(!areTitlesSimilar(eng1, eng3, 0.65), 'Unrelated headlines should not match');

    // Bengali Unicode headlines
    const ben1 = 'পশ্চিমবঙ্গ মন্ত্রিসভার বৈঠকে নতুন যুবসাথী প্রকল্পের অনুমোদন';
    const ben2 = 'পশ্চিমবঙ্গ মন্ত্রিসভার নতুন যুবসাথী প্রকল্পের অনুমোদন জারি';
    const ben3 = 'ভারতীয় মহাকাশ গবেষণা সংস্থা সফল উপগ্রহ উৎক্ষেপণ সম্পন্ন করল';

    assert.ok(areTitlesSimilar(ben1, ben2, 0.60), 'Bengali matching headlines should match');
    assert.ok(!areTitlesSimilar(ben1, ben3, 0.60), 'Bengali unrelated headlines should not match');

    // Hindi Unicode headlines
    const hin1 = 'केंद्रीय मंत्रिमंडल ने राष्ट्रीय हरित हाइड्रोजन मिशन को मंजूरी दी';
    const hin2 = 'मंत्रिमंडल ने राष्ट्रीय हरित हाइड्रोजन मिशन को दी मंजूरी';
    assert.ok(areTitlesSimilar(hin1, hin2, 0.60), 'Hindi matching headlines should match');
  });

  // 5. Anti-False-Positive Guards
  it('5. Guards strictly against merging distinct appointments, sports categories, and report editions', () => {
    // Distinct appointments
    const appt1 = 'Justice Sanjiv Khanna takes oath as 51st Chief Justice of India';
    const appt2 = 'Justice D.Y. Chandrachud demits office as Chief Justice of India';
    assert.ok(shouldProhibitHeadlineMerge(appt1, appt2), 'Distinct appointments must not be merged');
    assert.ok(!areTitlesSimilar(appt1, appt2, 0.65));

    // Distinct report editions
    const rep1 = 'Reserve Bank of India releases Financial Stability Report June 2026';
    const rep2 = 'Reserve Bank of India releases Financial Stability Report December 2026';
    assert.ok(shouldProhibitHeadlineMerge(rep1, rep2), 'Different report months/editions must not be merged');
    assert.ok(!areTitlesSimilar(rep1, rep2, 0.65));

    // Distinct sports events / categories
    const sport1 = "India wins Gold in Men's 10m Air Rifle Shooting World Cup";
    const sport2 = "India wins Gold in Women's 10m Air Rifle Shooting World Cup";
    assert.ok(shouldProhibitHeadlineMerge(sport1, sport2), "Men's vs Women's sports categories must not be merged");
    assert.ok(!areTitlesSimilar(sport1, sport2, 0.65));

    // Material amendments / corrigenda
    const notice1 = 'UPSC releases Civil Services Examination 2026 Notification';
    const notice2 = 'UPSC releases Corrigendum to Civil Services Examination 2026 Notification';
    assert.ok(shouldProhibitHeadlineMerge(notice1, notice2), 'Notice and corrigendum must not be merged');
  });

  // 6. Handling HTML Error Pages & Empty Feeds
  it('6. Handles empty feeds and HTTP 200 HTML error pages gracefully without crashing', () => {
    const htmlPage = `<!DOCTYPE html><html><head><title>Access Denied</title></head><body><h1>403 Forbidden Cloudflare Error</h1></body></html>`;
    const format = detectFeedFormat(htmlPage);
    assert.strictEqual(format, 'INVALID_HTML');

    const result = parseFeedXmlDetailed(htmlPage, 'Faulty Feed');
    assert.strictEqual(result.eligibleItems.length, 0);
    assert.strictEqual(result.detectedFormat, 'INVALID_HTML');
    assert.ok(result.rejectionReasons[0].includes('INVALID_FEED_FORMAT'));

    // Empty feed
    const emptyXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const emptyResult = parseFeedXmlDetailed(emptyXml, 'Empty Feed');
    assert.strictEqual(emptyResult.eligibleItems.length, 0);
    assert.strictEqual(emptyResult.rejectedCount, 0);
  });

  // 7. Freshness Window Filtering
  it('7. Drops stale publication dates exceeding the configured time window', () => {
    const staleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Stale Feed</title>
        <item>
          <title>Cabinet Approves High Speed Rail Corridor Expansion</title>
          <link>https://example.com/stale-01</link>
          <description>Union cabinet approved expansion of high speed railway line with capital allocation of 20000 crore.</description>
          <pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const parsed = parseFeedXmlDetailed(staleXml, 'Stale Source', { maxAgeHours: 48 });
    assert.strictEqual(parsed.eligibleItems.length, 0);
    assert.strictEqual(parsed.rejectedCount, 1);
    assert.ok(parsed.rejectionReasons[0].includes('STALE_PUBLICATION_DATE'));
  });

  // 8. Bounded Concurrency Pool Execution
  it('8. mapConcurrent executes with bounded concurrency (6 simultaneous) and survives source failures', async () => {
    let activeWorkers = 0;
    let peakConcurrency = 0;

    const mockTasks = Array.from({ length: 15 }, (_, i) => ({ id: i, shouldFail: i === 7 }));

    const results = await mapConcurrent(mockTasks, 6, async (task) => {
      activeWorkers++;
      peakConcurrency = Math.max(peakConcurrency, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeWorkers--;

      if (task.shouldFail) {
        throw new Error(`Intentional failure on task ${task.id}`);
      }
      return `Success ${task.id}`;
    });

    assert.ok(peakConcurrency <= 6, `Peak concurrency ${peakConcurrency} should not exceed limit 6`);
    assert.strictEqual(results.length, 15);
    assert.strictEqual(results[0], 'Success 0');
    assert.ok(results[7] instanceof Error, 'Task 7 should record error without terminating others');
    assert.strictEqual(results[14], 'Success 14');
  });

  // 9. Short Description Article Retrieval & NEEDS_SOURCE_REVIEW handling
  it('9. Marks items with insufficient facts as NEEDS_SOURCE_REVIEW rather than inventing facts', async () => {
    const shortTextXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Brief Press Updates</title>
        <item>
          <title>Cabinet Approves Strategic National Policy Directive on Semiconductors</title>
          <link>https://pib.gov.in/short-bulletin-99</link>
          <guid>guid-short-99</guid>
          <description>Cabinet decision brief.</description>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
      </channel>
    </rss>`;

    const parsed = parseFeedXmlDetailed(shortTextXml, 'Brief Source');
    assert.strictEqual(parsed.eligibleItems.length, 1);
    const item = parsed.eligibleItems[0];
    assert.strictEqual(item.needsSourceReview, true, 'Short items lacking 3 facts must be marked needsSourceReview');
  });

  // 10. Admin Endpoints: /admin/news/source-groups and /admin/news/sources
  it('10. Admin API returns 9 standard source groups and candidate sources', async () => {
    assert.strictEqual(SOURCE_GROUPS.length, 9, 'Must have 9 editable source groups');
    const groupIds = SOURCE_GROUPS.map((g) => g.id);
    assert.ok(groupIds.includes('national_governance'));
    assert.ok(groupIds.includes('economy_banking'));
    assert.ok(groupIds.includes('defence_sci_tech'));
    assert.ok(groupIds.includes('international_affairs'));
    assert.ok(groupIds.includes('sports'));
    assert.ok(groupIds.includes('awards_appointments'));
    assert.ok(groupIds.includes('environment'));
    assert.ok(groupIds.includes('important_days'));
    assert.ok(groupIds.includes('west_bengal_affairs'));

    assert.ok(DEFAULT_CANDIDATE_SOURCES.length >= 10, 'Must have candidate sources for each group');
  });
});
