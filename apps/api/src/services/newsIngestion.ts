import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { db, NewsDraftRecord } from '../db/index.js';
import { query } from '../db/pool.js';
import { isSafePublicUrl } from '../lib/security.js';

export interface FeedItemParsed {
  title: string;
  summary: string;
  canonicalUrl: string;
  publicationDate: string;
  category: string;
  relevantExams: string[];
  syllabusTopics: string[];
  keyFacts: string[];
  whyItMatters: string;
  staticGkBackground: string;
  practiceMcqs: {
    question: string;
    options: { id: string; text: string }[];
    correctOptionId: string;
    explanation: string;
  }[];
}

export interface IngestionResult {
  jobId: string;
  sourceId?: string;
  status: 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED';
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  itemsRejected: number;
  itemsFailed: number;
  errors: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

/**
 * Categorize feed item content for competitive exam preparation
 */
export function enrichNewsItem(title: string, rawSummary: string, sourceName: string): Omit<FeedItemParsed, 'title' | 'summary' | 'canonicalUrl' | 'publicationDate'> {
  const content = `${title} ${rawSummary}`.toLowerCase();

  let category = 'National';
  let syllabusTopics: string[] = ['Current Events of National Importance'];
  let whyItMatters = 'Frequently asked in General Awareness & Current Affairs sections across government recruitment examinations.';
  let staticGkBackground = 'Relevant constitutional provisions, statutory bodies, or national policies associated with this domain.';

  if (/\b(rbi|bank|banking|inflation|gdp|economy|economic|repo rate|fiscal)\b/i.test(content)) {
    category = 'Economy & Banking';
    syllabusTopics = ['Indian Economy', 'Monetary Policy', 'Banking Awareness'];
    whyItMatters = 'Directly tested in IBPS PO General Economy awareness and SSC CGL Tier-1 General Studies.';
    staticGkBackground = 'Reserve Bank of India Act 1934, Monetary Policy Committee (MPC) composition and inflation target mandates.';
  } else if (/\b(isro|drdo|space|satellite|missile|technology)\b/i.test(content)) {
    category = 'Science & Technology';
    syllabusTopics = ['Space Technology', 'Defence Indigenisation', 'Scientific Research in India'];
    whyItMatters = 'High-frequency area for RRB NTPC General Science and SSC CGL Scientific Developments.';
    staticGkBackground = 'ISRO founded in 1969 under Department of Space; Headquarters in Bengaluru; Launch centre in Sriharikota (SDSC-SHAR).';
  } else if (/\b(environment|climate|renewable|solar|wildlife|forest|cop\d+)\b/i.test(content)) {
    category = 'Environment & Ecology';
    syllabusTopics = ['Environmental Conservation', 'Renewable Energy Initiatives', 'Biodiversity Hotspots'];
    whyItMatters = 'Crucial for SSC CGL and State PSCs in Geography & Ecology questions.';
    staticGkBackground = 'Environment (Protection) Act 1986, Wildlife Protection Act 1972, and India COP Paris Agreement nationally determined contributions (NDCs).';
  } else if (/\b(supreme court|high court|bill|constitution|parliament|election)\b/i.test(content)) {
    category = 'Polity & Governance';
    syllabusTopics = ['Indian Constitution', 'Union Legislature', 'Judiciary & Governance Reforms'];
    whyItMatters = 'Central theme in SSC CGL General Awareness and WBPSC Indian Polity syllabus.';
    staticGkBackground = 'Articles of the Indian Constitution, constitutional amendments, and landmark Supreme Court judicial doctrines.';
  } else if (/\b(treaty|summit|g20|brics|asean|bilateral|international)\b/i.test(content)) {
    category = 'International Affairs';
    syllabusTopics = ['Bilateral & Multilateral Summits', 'International Organizations', 'India & Its Neighbours'];
    whyItMatters = 'Regularly featured in competitive exam current affairs questions on international agreements.';
    staticGkBackground = 'Headquarters and charters of major multilateral organizations (UN, BRICS, ASEAN, SCO, IMF, World Bank).';
  }

  // Key facts extraction (split by sentence or bullet)
  const sentences = rawSummary
    .replace(/<[^>]*>?/gm, '')
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const keyFacts = sentences.slice(0, 3);
  if (keyFacts.length === 0) {
    keyFacts.push(`Key national development announced by ${sourceName}.`);
  }

  const practiceMcqs = [
    {
      question: `With reference to recent developments reported in "${title}", which of the following statements is correct?`,
      options: [
        { id: 'opt_a', text: `It aligns directly with national development priorities under ${category}.` },
        { id: 'opt_b', text: 'It has been discontinued by the respective governing ministry.' },
        { id: 'opt_c', text: 'It pertains solely to private corporate restructuring without state oversight.' },
        { id: 'opt_d', text: 'It was originally established under the Government of India Act 1919.' },
      ],
      correctOptionId: 'opt_a',
      explanation: `The development forms a central part of recent government policy in ${category}, making statement A the correct formulation.`,
    },
  ];

  return {
    category,
    relevantExams: ['SSC_CGL', 'RRB_NTPC', 'WBPSC_CLERKSHIP', 'IBPS_PO'],
    syllabusTopics,
    keyFacts,
    whyItMatters,
    staticGkBackground,
    practiceMcqs,
  };
}

/**
 * Safely parse raw XML into normalized feed items
 */
export function parseFeedXml(xmlContent: string, sourceName: string): FeedItemParsed[] {
  const parsed = parser.parse(xmlContent);
  const items: FeedItemParsed[] = [];

  // 1. RSS 2.0 channel -> item
  const rawItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

  for (const item of itemsArray) {
    if (!item) continue;
    const title = typeof item.title === 'string' ? item.title.trim() : (item.title?.['#text'] || '').trim();
    if (!title) continue;

    let summary = '';
    if (typeof item.description === 'string') {
      summary = item.description;
    } else if (item.description?.['#text']) {
      summary = item.description['#text'];
    } else if (typeof item.summary === 'string') {
      summary = item.summary;
    } else if (item.summary?.['#text']) {
      summary = item.summary['#text'];
    } else if (typeof item.content === 'string') {
      summary = item.content;
    } else {
      summary = title;
    }

    // Strip HTML tags for clean text summary
    summary = summary.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
    if (summary.length > 500) {
      summary = summary.substring(0, 497) + '...';
    }

    let link = '';
    if (typeof item.link === 'string') {
      link = item.link.trim();
    } else if (item.link?.['@_href']) {
      link = item.link['@_href'].trim();
    } else if (item.guid?.['#text']) {
      link = item.guid['#text'].trim();
    } else if (typeof item.guid === 'string') {
      link = item.guid.trim();
    } else {
      link = `https://pib.gov.in/item/${crypto.createHash('md5').update(title).digest('hex')}`;
    }

    const pubDateStr = item.pubDate || item.published || item.updated || new Date().toISOString();
    let publicationDate: string;
    try {
      publicationDate = new Date(pubDateStr).toISOString();
    } catch {
      publicationDate = new Date().toISOString();
    }

    const enrichment = enrichNewsItem(title, summary, sourceName);

    items.push({
      title,
      summary,
      canonicalUrl: link,
      publicationDate,
      ...enrichment,
    });
  }

  return items;
}

/**
 * Shared durable ingestion engine for manual and scheduled runs
 */
export async function executeNewsFetchJob(options: {
  sourceId?: string;
  adminId?: string;
  workerId?: string;
}): Promise<IngestionResult> {
  const jobId = `njob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const workerId = options.workerId || 'api_manual_worker';

  // Record queued job in PostgreSQL
  try {
    await query(
      `INSERT INTO news_fetch_jobs (id, source_id, status, lease_expires_at, worker_id, created_at, started_at)
       VALUES ($1, $2, 'RUNNING', NOW() + INTERVAL '5 minutes', $3, NOW(), NOW())`,
      [jobId, options.sourceId || null, workerId]
    );
  } catch (err: any) {
    console.warn('[NewsIngestion] PostgreSQL job insert fallback:', err.message);
  }

  const result: IngestionResult = {
    jobId,
    sourceId: options.sourceId,
    status: 'COMPLETED',
    itemsFetched: 0,
    itemsNew: 0,
    itemsDuplicate: 0,
    itemsRejected: 0,
    itemsFailed: 0,
    errors: [],
  };

  // Determine active sources
  let sourcesToFetch: any[] = [];
  try {
    if (options.sourceId) {
      const res = await query('SELECT * FROM news_sources WHERE id = $1', [options.sourceId]);
      sourcesToFetch = res.rows;
    } else {
      const res = await query('SELECT * FROM news_sources WHERE is_enabled = true');
      sourcesToFetch = res.rows;
    }
  } catch {
    // Memory fallback
    sourcesToFetch = Array.from(db.newsSources.values()).filter(
      (s) => (options.sourceId ? s.id === options.sourceId : s.isEnabled)
    );
  }

  // If no sources in DB, seed standard official source (PIB / ISRO)
  if (sourcesToFetch.length === 0) {
    sourcesToFetch = [
      {
        id: 'src_pib_national',
        name: 'Press Information Bureau (PIB)',
        feed_url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
        category: 'National',
        language: 'en',
        fetch_interval_minutes: 60,
        parser_type: 'rss',
      },
    ];
  }

  for (const source of sourcesToFetch) {
    const feedUrl = source.feed_url || source.feedUrl;
    const sourceName = source.name || 'Official Press Bureau';
    const sourceId = source.id;

    // 1. SSRF Safety Check
    if (!isSafePublicUrl(feedUrl)) {
      result.itemsRejected++;
      result.errors.push(`Blocked unsafe or internal feed URL: ${feedUrl}`);
      continue;
    }

    try {
      // 2. Fetch with 10s timeout, 2MB size limit, and conditional headers
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const headers: Record<string, string> = {
        'User-Agent': 'SidPrep-Academic-News-Ingester/2.0 (+https://sidprep.in)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/plain',
      };
      if (source.etag) headers['If-None-Match'] = source.etag;
      if (source.last_modified_header) headers['If-Modified-Since'] = source.last_modified_header;

      let response: Response;
      try {
        response = await fetch(feedUrl, {
          signal: controller.signal,
          headers,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 304) {
        // Not modified
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from source feed.`);
      }

      const responseETag = response.headers.get('etag');
      const responseLastMod = response.headers.get('last-modified');

      // Max 2MB size check
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) {
        throw new Error(`Feed exceeded 2MB size limit: ${text.length} bytes.`);
      }

      // 3. Parse XML
      const parsedItems = parseFeedXml(text, sourceName);
      result.itemsFetched += parsedItems.length;

      // 4. Ingest and Deduplicate
      for (const item of parsedItems) {
        const canonicalUrl = item.canonicalUrl;
        const articleId = `art_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        // Check deduplication
        let isDuplicate = false;
        try {
          const checkRes = await query('SELECT id FROM news_articles WHERE canonical_url = $1', [canonicalUrl]);
          if (checkRes.rows.length > 0) isDuplicate = true;
        } catch {
          // Check memory
          const existing = Array.from(db.newsDrafts.values()).find((d) => d.sourceUrl === canonicalUrl);
          if (existing) isDuplicate = true;
        }

        if (isDuplicate) {
          result.itemsDuplicate++;
          continue;
        }

        // Persist to PostgreSQL news_articles
        try {
          await query(
            `INSERT INTO news_articles (
              id, source_id, source_name, source_url, canonical_url, headline, summary,
              event_date, publication_date, fetch_date, category, relevant_exams, syllabus_topics,
              key_facts, why_it_matters, static_gk_background, practice_mcqs, language, editorial_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14, $15, $16, $17, 'DRAFT')
            ON CONFLICT (canonical_url) DO NOTHING`,
            [
              articleId,
              sourceId,
              sourceName,
              canonicalUrl,
              canonicalUrl,
              item.title,
              item.summary,
              new Date().toISOString().split('T')[0],
              item.publicationDate,
              item.category,
              item.relevantExams,
              item.syllabusTopics,
              JSON.stringify(item.keyFacts),
              item.whyItMatters,
              item.staticGkBackground,
              JSON.stringify(item.practiceMcqs),
              source.language || 'en',
            ]
          );
        } catch (err: any) {
          console.warn('[NewsIngestion] PostgreSQL article insert fallback:', err.message);
        }

        // Also add to memory db.newsDrafts for immediate consistency
        const newDraft: NewsDraftRecord = {
          id: articleId,
          title: item.title,
          originalSummary: item.summary,
          category: item.category,
          targetExams: item.relevantExams,
          keyFacts: item.keyFacts,
          sourceName: sourceName,
          sourceUrl: canonicalUrl,
          confidenceScore: 0.98,
          editorialStatus: 'DRAFT', // Always defaults to DRAFT for human editorial verification
          publishedAt: item.publicationDate,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.newsDrafts.set(articleId, newDraft);

        result.itemsNew++;
      }

      // Update source health in PostgreSQL
      try {
        await query(
          `UPDATE news_sources
           SET last_fetched_at = NOW(), health_status = 'HEALTHY', error_message = NULL,
               consecutive_failures = 0, etag = $1, last_modified_header = $2
           WHERE id = $3`,
          [responseETag || null, responseLastMod || null, sourceId]
        );
      } catch {
        // Fallback
      }
    } catch (err: any) {
      result.itemsFailed++;
      result.errors.push(`Error fetching ${sourceName}: ${err.message}`);

      try {
        await query(
          `UPDATE news_sources
           SET health_status = 'ERROR', error_message = $1, consecutive_failures = consecutive_failures + 1
           WHERE id = $2`,
          [err.message, sourceId]
        );
      } catch {
        // Fallback
      }
    }
  }

  // Update job final status
  if (result.errors.length > 0 && result.itemsNew === 0 && result.itemsFetched === 0) {
    result.status = 'FAILED';
  } else if (result.errors.length > 0) {
    result.status = 'PARTIAL_FAILURE';
  } else {
    result.status = 'COMPLETED';
  }

  try {
    await query(
      `UPDATE news_fetch_jobs
       SET status = $1, items_fetched = $2, items_new = $3, items_duplicate = $4,
           items_rejected = $5, items_failed = $6, error_details = $7, completed_at = NOW()
       WHERE id = $8`,
      [
        result.status,
        result.itemsFetched,
        result.itemsNew,
        result.itemsDuplicate,
        result.itemsRejected,
        result.itemsFailed,
        JSON.stringify(result.errors),
        jobId,
      ]
    );
  } catch {
    // Fallback
  }

  db.logOperational({
    service: 'NEWS_INGESTION_SERVICE',
    level: result.status === 'FAILED' ? 'ERROR' : result.status === 'PARTIAL_FAILURE' ? 'WARN' : 'INFO',
    message: `News ingestion job ${jobId} finished with status ${result.status}`,
    meta: {
      itemsFetched: result.itemsFetched,
      itemsNew: result.itemsNew,
      itemsDuplicate: result.itemsDuplicate,
      errors: result.errors,
    },
  });

  return result;
}

/**
 * Test a feed URL without persisting articles
 */
export async function testFeedConnectivity(feedUrl: string): Promise<{
  success: boolean;
  itemCount: number;
  previewItems: FeedItemParsed[];
  error?: string;
}> {
  if (!isSafePublicUrl(feedUrl)) {
    return {
      success: false,
      itemCount: 0,
      previewItems: [],
      error: 'Invalid or blocked private network feed URL (SSRF safety check failed).',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SidPrep-Academic-News-Ingester/2.0-Test (+https://sidprep.in)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        itemCount: 0,
        previewItems: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const xml = await res.text();
    const items = parseFeedXml(xml, 'Test Source');
    return {
      success: true,
      itemCount: items.length,
      previewItems: items.slice(0, 3),
    };
  } catch (err: any) {
    return {
      success: false,
      itemCount: 0,
      previewItems: [],
      error: err.message || 'Connectivity timeout or error',
    };
  }
}
