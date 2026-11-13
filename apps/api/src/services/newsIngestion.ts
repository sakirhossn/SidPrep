import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { db, NewsDraftRecord } from '../db/index.js';
import { query } from '../db/pool.js';
import { isSafePublicUrl } from '../lib/security.js';

export interface FeedItemParsed {
  title: string;
  headline: string;
  summary: string;
  canonicalUrl: string;
  originalUrl?: string;
  feedEntryId: string;
  originalPublisher: string;
  eventDate: string;
  publicationDate: string;
  category: string;
  categoryLabel: string;
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
  needsSourceReview: boolean;
  articleContent?: string;
  alternativeSourceUrls?: string[];
  publisherUsageRights?: 'OFFICIAL_GOVT' | 'PUBLIC_OPEN_ACCESS' | 'FAIR_DEALING_DISCOVERY' | 'REQUIRES_LICENSE';
}

export interface NewsSourceFunnelReport {
  id: string;
  jobId: string;
  sourceId?: string;
  sourceName: string;
  httpStatus: number;
  statusCategory: 'OK' | 'EMPTY' | 'PARSER_ERROR' | 'BLOCKED_HTML' | 'NETWORK_ERROR' | 'ALL_ITEMS_FILTERED';
  parsedCount: number;
  inDateRangeCount: number;
  duplicateCount: number;
  rejectedCount: number;
  draftsSavedCount: number;
  rejectionReasons: string[];
  errorDetail?: string;
  latencyMs: number;
}

export interface IngestionResult {
  jobId: string;
  sourceId?: string;
  sourceGroup?: string;
  status: 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED';
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  itemsRejected: number;
  itemsReviewNeeded: number;
  itemsFailed: number;
  errors: string[];
  sourceReports: NewsSourceFunnelReport[];
  durationMs?: number;
}

export interface EvaluationResult {
  isEligible: boolean;
  rejectionReason?: string;
  category?: string;
  categoryLabel?: string;
  relevantExams?: string[];
  syllabusTopics?: string[];
  whyItMatters?: string;
  staticGkBackground?: string;
  keyFacts?: string[];
  practiceMcqs?: {
    question: string;
    options: { id: string; text: string }[];
    correctOptionId: string;
    explanation: string;
  }[];
  needsSourceReview?: boolean;
}

export interface SourceGroupConfig {
  id: string;
  label: string;
  description: string;
  defaultCategory: string;
  defaultExams: string[];
}

/**
 * 9 Standard Editable Source Groups (adapted from DailyDigest for SidPrep)
 */
export const SOURCE_GROUPS: SourceGroupConfig[] = [
  {
    id: 'national_governance',
    label: 'National Affairs & Governance',
    description: 'Union Cabinet decisions, welfare schemes, national portals, constitutional bodies, and bills.',
    defaultCategory: 'Government Schemes',
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
  },
  {
    id: 'economy_banking',
    label: 'Economy & Banking',
    description: 'RBI monetary policy, GDP indicators, inflation, fiscal deficit, and banking regulations.',
    defaultCategory: 'Economy & Banking',
    defaultExams: ['IBPS', 'SSC', 'RRB', 'WBPSC'],
  },
  {
    id: 'defence_sci_tech',
    label: 'Defence, Science & Technology',
    description: 'ISRO space missions, DRDO defence inductions, military exercises, and supercomputing.',
    defaultCategory: 'Science & Technology',
    defaultExams: ['SSC', 'RRB', 'WBPSC'],
  },
  {
    id: 'international_affairs',
    label: 'International Affairs',
    description: 'Bilateral treaties, summits (G20, BRICS, SCO, ASEAN), UN bodies, and global agreements.',
    defaultCategory: 'International Summits',
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
  },
  {
    id: 'sports',
    label: 'Sports',
    description: 'National and international championships, Olympic/Asian Games, Grand Slams, and sports honors.',
    defaultCategory: 'Sports',
    defaultExams: ['SSC', 'RRB', 'WBPSC'],
  },
  {
    id: 'awards_appointments',
    label: 'Awards & Appointments',
    description: 'National awards (Padma, Bharat Ratna), CJI, CAG, CEC, institutional chiefs, and laureates.',
    defaultCategory: 'Awards & Honours',
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
  },
  {
    id: 'environment',
    label: 'Environment & Ecology',
    description: 'Ramsar sites, tiger reserves, national parks, wildlife protection, and climate COP pledges.',
    defaultCategory: 'Environment & Ecology',
    defaultExams: ['SSC', 'RRB', 'WBPSC'],
  },
  {
    id: 'important_days',
    label: 'Important Days & Themes',
    description: 'National and UN observances, official commemorative dates, and statutory annual themes.',
    defaultCategory: 'Important Days & Themes',
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
  },
  {
    id: 'west_bengal_affairs',
    label: 'West Bengal Affairs',
    description: 'State government schemes, WBPSC regional geography, heritage milestones, and Kolkata events.',
    defaultCategory: 'State Affairs',
    defaultExams: ['WBPSC', 'SSC', 'RRB'],
  },
];

/**
 * DailyDigest Configured Sources Imported as Candidate Sources for SidPrep
 * Retains PIB and RBI as primary official sources. Candidate publisher feeds start as isVerified: false.
 */
export const DEFAULT_CANDIDATE_SOURCES = [
  // 1. National Affairs & Governance
  {
    id: 'src_pib_national',
    name: 'Press Information Bureau (PIB) National',
    feed_url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
    source_group: 'national_governance',
    source_type: 'DIRECT_FEED',
    category: 'Government Schemes',
    language: 'en',
    fetch_interval_minutes: 60,
    priority_tier: 1,
    is_verified: true,
    publisher_usage_rights: 'OFFICIAL_GOVT',
    is_enabled: true,
  },
  {
    id: 'src_ddnews_national',
    name: 'DD News National',
    feed_url: 'https://ddnews.gov.in/en/category/national/feed/',
    source_group: 'national_governance',
    source_type: 'DIRECT_FEED',
    category: 'Government Schemes',
    language: 'en',
    fetch_interval_minutes: 120,
    priority_tier: 1,
    is_verified: false,
    publisher_usage_rights: 'OFFICIAL_GOVT',
    is_enabled: true,
  },
  {
    id: 'src_thehindu_national',
    name: 'The Hindu National News',
    feed_url: 'https://www.thehindu.com/news/national/feeder/default.rss',
    source_group: 'national_governance',
    source_type: 'DIRECT_FEED',
    category: 'Government Schemes',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 2,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: false,
  },
  {
    id: 'src_gnews_national',
    name: 'Google News Discovery: National & Governance',
    feed_url: 'https://news.google.com/rss/search?q=(Cabinet+decision+OR+PIB+OR+%22government+scheme%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'national_governance',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '(Cabinet decision OR PIB OR "government scheme") when:1d',
    query_keywords: ['Cabinet decision', 'PIB', '"government scheme"'],
    category: 'Government Schemes',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 2. Economy & Banking
  {
    id: 'src_rbi_bulletin',
    name: 'Reserve Bank of India Official Bulletin',
    feed_url: 'https://rbi.org.in/pressreleases_rss.xml',
    source_group: 'economy_banking',
    source_type: 'DIRECT_FEED',
    category: 'Economy & Banking',
    language: 'en',
    fetch_interval_minutes: 60,
    priority_tier: 1,
    is_verified: true,
    publisher_usage_rights: 'OFFICIAL_GOVT',
    is_enabled: true,
  },
  {
    id: 'src_thehindu_economy',
    name: 'The Hindu Economy',
    feed_url: 'https://www.thehindu.com/business/Economy/feeder/default.rss',
    source_group: 'economy_banking',
    source_type: 'DIRECT_FEED',
    category: 'Economy & Banking',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 2,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: false,
  },
  {
    id: 'src_livemint_economy',
    name: 'Livemint Economy',
    feed_url: 'https://www.livemint.com/rss/economy',
    source_group: 'economy_banking',
    source_type: 'DIRECT_FEED',
    category: 'Economy & Banking',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 2,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: false,
  },
  {
    id: 'src_gnews_economy',
    name: 'Google News Discovery: Economy & Banking',
    feed_url: 'https://news.google.com/rss/search?q=(%22Reserve+Bank+of+India%22+OR+RBI+OR+SEBI+OR+inflation)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'economy_banking',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("Reserve Bank of India" OR RBI OR SEBI OR inflation) when:1d',
    query_keywords: ['"Reserve Bank of India"', 'RBI', 'SEBI', 'inflation'],
    category: 'Economy & Banking',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 3. Defence, Science & Technology
  {
    id: 'src_thehindu_scitech',
    name: 'The Hindu Science & Technology',
    feed_url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss',
    source_group: 'defence_sci_tech',
    source_type: 'DIRECT_FEED',
    category: 'Science & Technology',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 2,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: false,
  },
  {
    id: 'src_gnews_defence',
    name: 'Google News Discovery: Defence & Space',
    feed_url: 'https://news.google.com/rss/search?q=(ISRO+OR+DRDO+OR+missile+OR+%22military+exercise%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'defence_sci_tech',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '(ISRO OR DRDO OR missile OR "military exercise") when:1d',
    query_keywords: ['ISRO', 'DRDO', 'missile', '"military exercise"'],
    category: 'Science & Technology',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 4. International Affairs
  {
    id: 'src_thehindu_intl',
    name: 'The Hindu International News',
    feed_url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    source_group: 'international_affairs',
    source_type: 'DIRECT_FEED',
    category: 'International Summits',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 2,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: false,
  },
  {
    id: 'src_gnews_intl',
    name: 'Google News Discovery: International Summits',
    feed_url: 'https://news.google.com/rss/search?q=(%22bilateral+summit%22+OR+G20+OR+BRICS+OR+%22United+Nations%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'international_affairs',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("bilateral summit" OR G20 OR BRICS OR "United Nations") when:1d',
    query_keywords: ['"bilateral summit"', 'G20', 'BRICS', '"United Nations"'],
    category: 'International Summits',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 5. Sports
  {
    id: 'src_ddnews_sports',
    name: 'DD News Sports',
    feed_url: 'https://ddnews.gov.in/en/category/sports/feed/',
    source_group: 'sports',
    source_type: 'DIRECT_FEED',
    category: 'Sports',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 1,
    is_verified: false,
    publisher_usage_rights: 'OFFICIAL_GOVT',
    is_enabled: true,
  },
  {
    id: 'src_gnews_sports',
    name: 'Google News Discovery: Sports Winners',
    feed_url: 'https://news.google.com/rss/search?q=(%22championship+win%22+OR+%22Olympic+gold%22+OR+%22Asian+Games%22+OR+%22World+Cup%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'sports',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("championship win" OR "Olympic gold" OR "Asian Games" OR "World Cup") when:1d',
    query_keywords: ['"championship win"', '"Olympic gold"', '"Asian Games"', '"World Cup"'],
    category: 'Sports',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 6. Awards & Appointments
  {
    id: 'src_gnews_awards',
    name: 'Google News Discovery: Awards & Appointments',
    feed_url: 'https://news.google.com/rss/search?q=(%22appointed+as%22+OR+%22assumes+charge%22+OR+%22Chief+Justice%22+OR+%22Padma+Vibhushan%22+OR+%22Padma+Shri%22+OR+%22Khel+Ratna%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'awards_appointments',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("appointed as" OR "assumes charge" OR "Chief Justice" OR "Padma Vibhushan" OR "Padma Shri" OR "Khel Ratna") when:1d',
    query_keywords: ['"appointed as"', '"assumes charge"', '"Chief Justice"', '"Padma Vibhushan"', '"Padma Shri"', '"Khel Ratna"'],
    category: 'Awards & Honours',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 7. Environment & Ecology
  {
    id: 'src_gnews_environment',
    name: 'Google News Discovery: Environment & Wildlife',
    feed_url: 'https://news.google.com/rss/search?q=(%22Ramsar+site%22+OR+%22tiger+reserve%22+OR+%22national+park%22+OR+%22renewable+energy+capacity%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'environment',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("Ramsar site" OR "tiger reserve" OR "national park" OR "renewable energy capacity") when:1d',
    query_keywords: ['"Ramsar site"', '"tiger reserve"', '"national park"', '"renewable energy capacity"'],
    category: 'Environment & Ecology',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 8. Important Days & Themes
  {
    id: 'src_gnews_days',
    name: 'Google News Discovery: Important Days & Themes',
    feed_url: 'https://news.google.com/rss/search?q=(%22celebrated+on%22+OR+%22observed+on%22+OR+%22theme+for+202%22+OR+%22theme+of+202%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'important_days',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("celebrated on" OR "observed on" OR "theme for 202" OR "theme of 202") when:1d',
    query_keywords: ['"celebrated on"', '"observed on"', '"theme for 202"', '"theme of 202"'],
    category: 'Important Days & Themes',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },

  // 9. West Bengal Affairs
  {
    id: 'src_gnews_wb',
    name: 'Google News Discovery: West Bengal Affairs',
    feed_url: 'https://news.google.com/rss/search?q=(%22West+Bengal%22+OR+%22Kolkata%22+OR+WBPSC+OR+%22state+cabinet+decision%22+OR+Kanyashree)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    source_group: 'west_bengal_affairs',
    source_type: 'GOOGLE_NEWS_DISCOVERY',
    query_template: '("West Bengal" OR "Kolkata" OR WBPSC OR "state cabinet decision" OR Kanyashree) when:1d',
    query_keywords: ['"West Bengal"', '"Kolkata"', 'WBPSC', '"state cabinet decision"', 'Kanyashree'],
    category: 'State Affairs',
    language: 'en',
    fetch_interval_minutes: 180,
    priority_tier: 3,
    is_verified: false,
    publisher_usage_rights: 'FAIR_DEALING_DISCOVERY',
    is_enabled: true,
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

/**
 * Builds Google News RSS search URL with Indian English locale and grouped freshness
 * e.g. (ISRO OR DRDO OR "military exercise") when:1d
 */
export function buildGoogleNewsDiscoveryUrl(queryGroup: string): string {
  let clean = queryGroup.trim().replace(/\s+when:\d+[dhwmy]/gi, '');
  clean = clean.replace(/^[\(\s]+|[\)\s]+$/g, '');
  const groupedQuery = `(${clean}) when:1d`;
  const encoded = encodeURIComponent(groupedQuery);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/**
 * Strips HTML tags, scripts, styles, extraneous whitespace, and decodes HTML entities
 * (Adapted from DailyDigest clean_html)
 */
export function cleanHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let text = String(rawHtml);
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–');
  text = text.replace(/\s+([.,!?;:])/g, '$1');
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Unicode-aware tokenization supporting English, Bengali, Hindi, and Indian scripts
 */
export function tokenizeHeadlineUnicode(text: string): Set<string> {
  if (!text) return new Set();
  const clean = text.toLowerCase();
  const tokens = clean.match(/[\p{L}\p{N}]{2,}/gu) || [];
  return new Set(tokens);
}

/**
 * Jaccard token similarity for headline deduplication
 */
export function calculateHeadlineSimilarity(t1: string, t2: string): number {
  const s1 = tokenizeHeadlineUnicode(t1);
  const s2 = tokenizeHeadlineUnicode(t2);
  if (s1.size === 0 || s2.size === 0) return 0;
  let intersection = 0;
  for (const token of s1) {
    if (s2.has(token)) intersection++;
  }
  const union = s1.size + s2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Anti-False-Positive Guards: Prevents merging distinct events even if headline similarity is high
 * Specifically guards against merging:
 * 1. Different appointments with similar headlines
 * 2. Different editions or dates of the same report
 * 3. Separate sporting events, genders, or categories
 * 4. Corrections, amendments, or clarifications
 */
export function shouldProhibitHeadlineMerge(t1: string, t2: string): boolean {
  const low1 = t1.toLowerCase();
  const low2 = t2.toLowerCase();

  // 1. Appointments & Demissions Guard
  const isAppointAction1 = /\b(appointed|assumes charge|takes oath|sworn in|new chief|new chairman|new president|new cji)\b/i.test(low1);
  const isAppointAction2 = /\b(appointed|assumes charge|takes oath|sworn in|new chief|new chairman|new president|new cji)\b/i.test(low2);
  const isDemissionAction1 = /\b(demits|retires|resigns|steps down|relinquishes|tenure ends)\b/i.test(low1);
  const isDemissionAction2 = /\b(demits|retires|resigns|steps down|relinquishes|tenure ends)\b/i.test(low2);

  if ((isAppointAction1 && isDemissionAction2) || (isAppointAction2 && isDemissionAction1)) {
    return true;
  }

  // Ordinal / Edition count differences (e.g., 50th vs 51st, 15th vs 16th)
  const ord1 = low1.match(/\b\d+(st|nd|rd|th)\b/);
  const ord2 = low2.match(/\b\d+(st|nd|rd|th)\b/);
  if (ord1 && ord2 && ord1[0] !== ord2[0]) {
    return true;
  }

  if (isAppointAction1 || isAppointAction2 || isDemissionAction1 || isDemissionAction2) {
    if (low1.includes('chief election') !== low2.includes('chief election')) return true;
    if (low1.includes('army chief') !== low2.includes('army chief')) return true;
    if (low1.includes('navy chief') !== low2.includes('navy chief')) return true;
    if (low1.includes('governor') !== low2.includes('governor')) return true;

    // Detect distinct capitalized person names (excluding institutional title words)
    const titleStopWords = new Set([
      'Justice', 'Chief', 'Prime', 'Minister', 'President', 'Governor', 'Chairman',
      'Secretary', 'General', 'India', 'Union', 'State', 'Court', 'Director', 'Head',
      'Officer', 'High', 'Supreme', 'Bank', 'Reserve', 'Commission', 'Commissioner', 'National',
    ]);
    const names1: string[] = (Array.from(t1.match(/\b[A-Z][a-z]{3,}\b/g) || []) as string[])
      .filter((w) => !titleStopWords.has(w));
    const names2: string[] = (Array.from(t2.match(/\b[A-Z][a-z]{3,}\b/g) || []) as string[])
      .filter((w) => !titleStopWords.has(w));
    const commonNames = names1.filter((n) => names2.includes(n));
    if (names1.length > 0 && names2.length > 0 && commonNames.length === 0) {
      return true;
    }
  }

  // 2. Report Editions Guard
  const report1 = low1.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|202[4-9]|edition \d+|vol\.? \d+)\b/i);
  const report2 = low2.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|202[4-9]|edition \d+|vol\.? \d+)\b/i);
  if (report1 && report2 && report1[0] !== report2[0]) {
    return true;
  }

  // 3. Sports Guard (Category, Gender, Discipline, Medal)
  const sportCategories = ['men', 'women', 'junior', 'senior', 'singles', 'doubles', 'gold', 'silver', 'bronze', '10m', '50m', '100m', '200m'];
  for (const cat of sportCategories) {
    const has1 = new RegExp(`\\b${cat}\\b`, 'i').test(low1);
    const has2 = new RegExp(`\\b${cat}\\b`, 'i').test(low2);
    if (has1 !== has2) return true;
  }

  // 4. Corrections & Amendments Guard
  const isCorrection1 = /\b(corrigendum|correction|amendment|revised|clarification)\b/i.test(low1);
  const isCorrection2 = /\b(corrigendum|correction|amendment|revised|clarification)\b/i.test(low2);
  if (isCorrection1 !== isCorrection2) return true;

  return false;
}

/**
 * Headline similarity clustering with false-positive prevention
 */
export function areTitlesSimilar(t1: string, t2: string, threshold = 0.65): boolean {
  if (shouldProhibitHeadlineMerge(t1, t2)) {
    return false;
  }
  const similarity = calculateHeadlineSimilarity(t1, t2);
  return similarity >= threshold;
}

/**
 * Bounded Concurrency Runner (runs tasks up to maxConcurrency)
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err: any) {
        results[idx] = err;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Detects feed format from raw XML response
 */
export function detectFeedFormat(xmlContent: string): 'RSS_2_0' | 'ATOM_1_0' | 'RSS_1_0' | 'INVALID_HTML' | 'UNKNOWN' {
  if (!xmlContent || typeof xmlContent !== 'string') return 'UNKNOWN';
  const trimmed = xmlContent.trim();
  if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html') || trimmed.includes('<html xmlns')) {
    return 'INVALID_HTML';
  }
  if (trimmed.includes('<rss') || (trimmed.includes('<channel>') && trimmed.includes('<item>'))) {
    return 'RSS_2_0';
  }
  if (trimmed.includes('<feed') && (trimmed.includes('xmlns="http://www.w3.org/2005/Atom"') || trimmed.includes('<entry>'))) {
    return 'ATOM_1_0';
  }
  if (trimmed.includes('rdf:RDF') || trimmed.includes('xmlns:rdf=')) {
    return 'RSS_1_0';
  }
  return 'UNKNOWN';
}

/**
 * Competitive Exam Blacklist & Exclusion Rules
 */
export const EXCLUSION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(party spokesperson|slams|hits back|retorts|political slugfest|blames rival|electoral rally|seat sharing|vote bank|campaign speech|factional feud|party workers clash)\b/i,
    reason: 'POLITICAL_ARGUMENT: Partisan political debates or party campaign statements without statutory/policy substance.',
  },
  {
    pattern: /\b(greets on occasion|congratulates on birthday|wishes speedy recovery|condolences on demise of local|routine address|felicitates on occasion|inaugurates party office)\b/i,
    reason: 'ROUTINE_SPEECH: Ceremonial speech, courtesy greeting, or political condolence lacking exam-tested policy facts.',
  },
  {
    pattern: /\b(murder|robbery|looted|arrested for theft|hit-and-run|liquor seized|smuggling gold at airport|dowry death|assaulted by mob|custody battle|chain snatching|petty dispute)\b/i,
    reason: 'LOCAL_CRIME: Local crime, accident, or routine police incident of negligible competitive-exam relevance.',
  },
  {
    pattern: /\b(box office collection|bollywood actor|actress spotted|wedding ceremony of actor|trailer release|dating rumors|fashion show|red carpet look|celebrity baby)\b/i,
    reason: 'CELEBRITY_GOSSIP: Entertainment trivia, celebrity gossip, or movie promotional event.',
  },
  {
    pattern: /\b(discount offer|pre-order now|buy online|limited period offer|price starts at|sponsored post|promotional campaign|sale on amazon|smartphone launch|flat \d+% off)\b/i,
    reason: 'ADVERTISEMENT: Commercial advertisement, sponsored PR, or private consumer gadget launch.',
  },
  {
    pattern: /\b(e-tender notice|invitation for bids|notice inviting tender|rfp for supply|auction of scrap|procurement tender|expression of interest for civil works)\b/i,
    reason: 'TENDER_NOTICE: Administrative procurement notice, bidding auction, or routine tender advertisement.',
  },
  {
    pattern: /\b(last date extended by one day|hall ticket download link active|admit card download server busy|technical glitch in website)\b/i,
    reason: 'REPETITIVE_ANNOUNCEMENT: Repetitive clerical announcement without persistent syllabus value.',
  },
];

/**
 * Competitive Exam Domain Matchers
 */
export const COMPETITIVE_EXAM_DOMAINS: Array<{
  category: string;
  categoryLabel: string;
  pattern: RegExp;
  defaultExams: string[];
  syllabusTopics: string[];
  whyItMatters: string;
  staticGkBase: string;
}> = [
  {
    category: 'Science & Technology',
    categoryLabel: 'Science & Technology',
    pattern: /\b(isro|drdo|satellites?|chandrayaan|gaganyaan|aditya-l1|shukrayaan|missiles?|supercomputers?|param|semiconductors?|quantum|artificial intelligence|space missions?|launch vehicles?|pslv|gslv|sslv|telescopes?|deep sea mission)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Space Exploration Missions', 'Defence Indigenisation', 'Supercomputing & Quantum Tech'],
    whyItMatters: 'High-frequency domain for RRB NTPC / Group D General Science and SSC CGL Tier-1 scientific advances.',
    staticGkBase: 'ISRO founded on 15 August 1969; Headquarters in Bengaluru; Father of Indian Space Program: Dr. Vikram Sarabhai; Launch facility at Satish Dhawan Space Centre (SDSC-SHAR) in Sriharikota, Andhra Pradesh.',
  },
  {
    category: 'Defence & Security',
    categoryLabel: 'Defence & Security Exercises',
    pattern: /\b(exercise|yudh abhyas|malabar|varuna|garuda|surya kiran|nomadic elephant|sampriti|simbex|milan|warship|commissioned|ins |submarine|air force exercise|joint military|tri-service|defence procurement|rafale|tejas)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Bilateral Military Exercises', 'Indigenisation of Naval Assets', 'Strategic Defence Doctrines'],
    whyItMatters: 'Recurring questions in SSC CGL, SSC GD, and RRB recruitment exams testing bilateral exercise names.',
    staticGkBase: 'Tri-service Supreme Command rests with the President of India (Article 53(2)); Chief of Defence Staff (CDS) office created in 2019 heading Department of Military Affairs; Key bilateral exercises: Surya Kiran (India-Nepal), Sampriti (India-Bangladesh), Mitra Shakti (India-Sri Lanka).',
  },
  {
    category: 'Economy & Banking',
    categoryLabel: 'Economy, Banking & Finance',
    pattern: /\b(rbi|reserve bank|monetary policy|repo rate|inflation|cpi|wpi|gdp|economic growth|fiscal deficit|union budget|gst collection|banking regulation|sebi|liquidity adjustment facility|statutory liquidity ratio|cash reserve ratio)\b/i,
    defaultExams: ['IBPS', 'SSC', 'RRB', 'WBPSC', 'IBPS_PO', 'SSC_CGL'],
    syllabusTopics: ['Monetary Policy Framework', 'Fiscal Policy & Public Finance', 'Banking Structure in India'],
    whyItMatters: 'Core pillar of IBPS PO / Clerk Banking Awareness and SSC CGL Tier-1 & Tier-2 General Studies.',
    staticGkBase: 'Reserve Bank of India Act, 1934; RBI nationalized on 1 January 1949; First RBI Governor: Sir Osborne Smith; First Indian Governor: C.D. Deshmukh; Monetary Policy Committee (MPC) mandated under Section 45ZB of RBI Act with 6 members.',
  },
  {
    category: 'Appointments & Resignations',
    categoryLabel: 'Appointments & Resignations',
    pattern: /\b(appointed as|assumes charge as|takes oath as|sworn in as|chief justice|cji|governor|cag|attorney general|election commissioner|chairman of|director general of|isro chief|drdo chief|army chief|navy chief|air chief|sebi chief|upsc chairman|world bank president|imf chief)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Constitutional Appointments', 'Heads of National Bodies', 'International Institutional Leadership'],
    whyItMatters: 'Direct single-mark questions in SSC CHSL, SSC CGL, RRB NTPC, and Banking General Awareness.',
    staticGkBase: 'Constitutional bodies provisions: Article 76 (Attorney General), Article 124 (Supreme Court), Article 148 (CAG), Article 280 (Finance Commission), and Article 324 (Election Commission).',
  },
  {
    category: 'Awards & Honours',
    categoryLabel: 'Awards & Honours',
    pattern: /\b(award|honour|honor|padma vibhushan|padma bhushan|padma shri|bharat ratna|nobel prize|booker prize|sahitya akademi|khel ratna|arjuna award|dronacharya|dadasaheb phalke|gallantry award|param vir chakra|pulitzer|oscar|grammy|abel prize)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['National Civilian Honours', 'Literary & Artistic Recognitions', 'International Prestigious Laureates'],
    whyItMatters: 'Guaranteed questions in SSC CGL, WBPSC Miscellaneous, and IBPS General Awareness.',
    staticGkBase: 'Bharat Ratna instituted in 1954; Padma Awards announced on Republic Day; Sahitya Akademi founded in 1954 under Ministry of Culture; Major Dhyan Chand Khel Ratna highest sporting honor in India.',
  },
  {
    category: 'Sports',
    categoryLabel: 'Sports Winners & Tournaments',
    pattern: /\b(olympic|asian games|commonwealth|world cup|grand slam|wimbledon|us open|french open|australian open|chess olympiad|badminton|khelo india|national games|won gold|clinched title|world champion|archery|shooting world cup|athletics)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['International Championships', 'Indian Sporting Records', 'Major Multilateral Tournaments'],
    whyItMatters: 'Frequent question target in SSC CGL, RRB NTPC, and WBPSC Clerkship General Knowledge sections.',
    staticGkBase: 'Olympic Games governing body (IOC headquartered in Lausanne, Switzerland); first modern Olympics held in 1896 in Athens; Sports Authority of India (SAI) established in 1984 under Ministry of Youth Affairs and Sports.',
  },
  {
    category: 'International Summits',
    categoryLabel: 'International Summits & Conferences',
    pattern: /\b(summit|g20|g7|brics|asean|sco|bimstec|united nations|un general assembly|cop\d+|world economic forum|davos|bilateral summit|presidency|declaration|nam summit)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Multilateral Summits', 'International Organizations', 'Global Treaties & India Leadership'],
    whyItMatters: 'Essential for SSC CGL General Awareness, IBPS PO Economy, and WBPSC WBCS Group A/B current events.',
    staticGkBase: 'UN Headquarters: New York; BRICS established in 2009 (expanded with new members); ASEAN Secretariat: Jakarta, Indonesia; SCO Secretariat: Beijing, China; BIMSTEC Secretariat: Dhaka, Bangladesh.',
  },
  {
    category: 'Reports & Indices',
    categoryLabel: 'Reports, Indices & Rankings',
    pattern: /\b(index|report|ranking|global hunger index|human development index|press freedom|niti aayog|sdg index|ranked|ease of doing business|world happiness|gdp forecast|multidimensional poverty|competitiveness index)\b/i,
    defaultExams: ['IBPS', 'SSC', 'WBPSC', 'RRB', 'IBPS_PO', 'SSC_CGL'],
    syllabusTopics: ['Global Composite Indices', 'NITI Aayog National Rankings', 'Socio-Economic Development Metrics'],
    whyItMatters: 'Standard question type across IBPS PO, SBI PO, and SSC CGL examining releasing agency and India ranking.',
    staticGkBase: 'Human Development Index (HDI) developed by Mahbub ul Haq and Amartya Sen, published annually by UNDP since 1990; NITI Aayog established on 1 January 2015 via cabinet resolution replacing the Planning Commission.',
  },
  {
    category: 'Government Schemes',
    categoryLabel: 'Government Schemes & Welfare Initiatives',
    pattern: /\b(scheme|yojana|pradhan mantri|pm-|subvention|subsidy|welfare program|national mission|ayushman|kisan|awas|jal jeevan|vishwakarma|welfare scheme|state scheme|flagship scheme|cabinet approves|cabinet decision|policy directive|national policy|union cabinet|bill passed|act passed)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Social Sector Initiatives', 'Welfare Schemes for Vulnerable Sections', 'Union Government Programs'],
    whyItMatters: 'Extensively tested in SSC CGL Tier-1 General Studies, RRB NTPC General Awareness, and IBPS PO Banking Economy.',
    staticGkBase: 'Nodal Ministry structure, constitutional Directive Principles (Part IV Articles 38-47), and targeted beneficiary eligibility frameworks under Union welfare policies.',
  },
  {
    category: 'Environment & Ecology',
    categoryLabel: 'Environment, Ecology & Climate',
    pattern: /\b(ramsar site|wetland|tiger reserve|national park|wildlife sanctuary|iucn|project tiger|project cheetah|forest report|biodiversity|climate change|renewable energy|mangrove|cop climate|endangered species|biosphere reserve)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Protected Areas Network', 'Biodiversity Conservation Acts', 'Climate Pledges & Renewable Goals'],
    whyItMatters: 'High-yield subject in SSC CGL, RRB NTPC, and State PSC examinations (WBPSC Geography).',
    staticGkBase: 'Wildlife (Protection) Act, 1972; Project Tiger launched in 1973 (Jim Corbett National Park); Ramsar Convention signed in Iran in 1971; Environment (Protection) Act, 1986 passed in aftermath of Bhopal Gas Tragedy.',
  },
  {
    category: 'Important Days & Themes',
    categoryLabel: 'Important Days & Themes',
    pattern: /\b(celebrated on|observed on|theme for|theme of|national science day|world environment day|international yoga day|constitution day|good governance day|world health day|national youth day|panchayati raj day|world water day|earth day)\b/i,
    defaultExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['National Commemorative Days', 'UN International Observances', 'Annual Official Themes'],
    whyItMatters: 'Frequently asked in SSC CHSL, SSC MTS, and RRB NTPC Stage 1 exams.',
    staticGkBase: 'National Science Day (28 Feb) commemorates discovery of Raman Effect by Sir C.V. Raman (Nobel Prize in Physics 1930); National Youth Day (12 Jan) marks birth anniversary of Swami Vivekananda; Constitution Day (26 Nov) marks adoption of Constitution in 1949.',
  },
  {
    category: 'State Affairs',
    categoryLabel: 'State & Regional Affairs (Focus WB & Major States)',
    pattern: /\b(west bengal|wbpsc|kolkata|howrah|darjeeling|state cabinet|gi tag|geographical indication|kanyashree|sabooj sathi|duare sarkar|state budget|heritage festival|sundarbans)\b/i,
    defaultExams: ['WBPSC', 'SSC', 'RRB', 'WBPSC_CLERKSHIP', 'SSC_CGL'],
    syllabusTopics: ['State Government Welfare Schemes', 'Regional Geography & Heritage', 'State Institutional Milestones'],
    whyItMatters: 'Essential for WBPSC WBCS, Clerkship, Food SI, and Eastern Railway zone examinations.',
    staticGkBase: 'West Bengal shares international borders with Bangladesh, Nepal, and Bhutan; State animal: Fishing Cat; State tree: Chatim; Sundarbans is a UNESCO World Heritage Site (1987) and Ramsar Wetland (2019).',
  },
];

/**
 * Filter and evaluate an article strictly for competitive exam relevance
 */
export function evaluateCompetitiveExamArticle(title: string, rawSummary: string, sourceName: string): EvaluationResult {
  const cleanSummary = cleanHtml(rawSummary);
  const text = `${title} ${cleanSummary}`;

  // 1. Exclusion Pattern Check (Blacklist)
  for (const rule of EXCLUSION_PATTERNS) {
    if (rule.pattern.test(text)) {
      return {
        isEligible: false,
        rejectionReason: rule.reason,
      };
    }
  }

  // 2. Domain Matcher Check (Whitelist)
  let matchedDomain: (typeof COMPETITIVE_EXAM_DOMAINS)[0] | null = null;
  for (const domain of COMPETITIVE_EXAM_DOMAINS) {
    if (domain.pattern.test(text)) {
      matchedDomain = domain;
      break;
    }
  }

  if (!matchedDomain) {
    return {
      isEligible: false,
      rejectionReason: 'LOW_EXAM_RELEVANCE: Story does not match recognized competitive exam syllabus domains (schemes, appointments, awards, sports, defence, science, summits, economy, ecology, days, or state affairs).',
    };
  }

  // 3. Factual Grounding & Depth Invariant
  const sentences = cleanSummary
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const factualPointers: string[] = [];
  for (const sentence of sentences) {
    if (/\b(\d+|crore|lakh|percent|%|ministry|minister|appointed|launched|sanctioned|inaugurated|signed|treaty|exercise|headquarters|act|section|mission|satellite|isro|rbi)\b/i.test(sentence)) {
      factualPointers.push(sentence);
    }
  }

  const keyFacts: string[] = [];
  for (const s of factualPointers.slice(0, 4)) {
    const cleanFact = s.length > 180 ? s.substring(0, 177) + '...' : s;
    keyFacts.push(cleanFact);
  }

  if (keyFacts.length < 3) {
    for (const s of sentences) {
      if (!keyFacts.includes(s) && keyFacts.length < 3) {
        keyFacts.push(s.length > 180 ? s.substring(0, 177) + '...' : s);
      }
    }
  }

  // If still fewer than 3 facts, mark needsSourceReview = true rather than inventing fake facts
  const needsSourceReview = keyFacts.length < 3;
  if (needsSourceReview) {
    keyFacts.push(`Official development in ${matchedDomain.categoryLabel} released by ${sourceName}. Additional factual verification needed.`);
  }

  const staticGkBackground = `${matchedDomain.staticGkBase} Exam Relevance: Key foundation for General Studies papers across recruitment examinations.`;

  return {
    isEligible: true,
    category: matchedDomain.category,
    categoryLabel: matchedDomain.categoryLabel,
    relevantExams: matchedDomain.defaultExams,
    syllabusTopics: matchedDomain.syllabusTopics,
    whyItMatters: matchedDomain.whyItMatters,
    staticGkBackground,
    keyFacts: keyFacts.slice(0, 5),
    practiceMcqs: [], // Real factual MCQs authored/verified during editorial review, never fabricated synthetically
    needsSourceReview,
  };
}

/**
 * Backward compatibility enrichNewsItem function
 */
export function enrichNewsItem(title: string, rawSummary: string, sourceName: string): Omit<FeedItemParsed, 'title' | 'headline' | 'summary' | 'canonicalUrl' | 'eventDate' | 'publicationDate' | 'feedEntryId' | 'originalPublisher' | 'needsSourceReview'> {
  const evalResult = evaluateCompetitiveExamArticle(title, rawSummary, sourceName);
  if (evalResult.isEligible && evalResult.category) {
    return {
      category: evalResult.category,
      categoryLabel: evalResult.categoryLabel || evalResult.category,
      relevantExams: evalResult.relevantExams || ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
      syllabusTopics: evalResult.syllabusTopics || ['Current Affairs of National Importance'],
      keyFacts: evalResult.keyFacts || [`Verified official update from ${sourceName}`],
      whyItMatters: evalResult.whyItMatters || 'Frequently tested in competitive recruitment examinations.',
      staticGkBackground: evalResult.staticGkBackground || 'Constitutional and statutory framework in India.',
      practiceMcqs: evalResult.practiceMcqs || [],
    };
  }

  return {
    category: 'Government Schemes',
    categoryLabel: 'National Current Affairs',
    relevantExams: ['SSC', 'RRB', 'WBPSC', 'IBPS', 'SSC_CGL', 'RRB_NTPC'],
    syllabusTopics: ['Current Events of National Importance'],
    keyFacts: [`Official update released by ${sourceName}.`],
    whyItMatters: 'Relevant for General Awareness in competitive examinations.',
    staticGkBackground: 'Constitutional and administrative governance in India.',
    practiceMcqs: [],
  };
}

/**
 * Retrieves permitted article content when feed description is too short (< 40 words)
 */
export async function retrieveArticleContentIfShort(
  url: string,
  currentSummary: string
): Promise<{ content: string; wasRetrieved: boolean }> {
  const wordCount = (currentSummary || '').trim().split(/\s+/).length;
  if (wordCount >= 40) {
    return { content: currentSummary, wasRetrieved: false };
  }

  if (!isSafePublicUrl(url)) {
    return { content: currentSummary, wasRetrieved: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SidPrep-CurrentAffairs-Bot/2.0 (+https://sidprep.in)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return { content: currentSummary, wasRetrieved: false };

    const html = await res.text();
    if (html.length > 2 * 1024 * 1024) return { content: currentSummary, wasRetrieved: false };

    const cleaned = cleanHtml(html);
    if (cleaned.length > currentSummary.length + 50) {
      const articleLead = cleaned.substring(0, 1200);
      return { content: articleLead, wasRetrieved: true };
    }
  } catch {
    // Graceful fallback to existing summary on error or timeout
  }

  return { content: currentSummary, wasRetrieved: false };
}

export interface ParseFeedXmlOptions {
  maxAgeHours?: number; // Configurable freshness window (default: 72 hours)
  retrieveShortArticles?: boolean;
}

/**
 * Parse XML feed (RSS 2.0, Atom 1.0, RDF) with detailed evaluation, freshness window,
 * Google News title parsing, and short description handling
 */
export interface RawFeedEntry {
  rawTitle: string;
  cleanedTitle: string;
  headline: string;
  originalPublisher: string;
  summary: string;
  link: string;
  feedEntryId: string;
  pubDateRaw?: string | null;
}

/**
 * Extracts raw un-filtered entries from XML RSS/Atom/RDF feed
 */
export function extractRawFeedEntries(
  xmlContent: string,
  sourceName: string
): {
  detectedFormat: 'RSS_2_0' | 'ATOM_1_0' | 'RSS_1_0' | 'INVALID_HTML' | 'UNKNOWN';
  rawEntries: RawFeedEntry[];
  formatError?: string;
} {
  const detectedFormat = detectFeedFormat(xmlContent);
  if (detectedFormat === 'INVALID_HTML') {
    return {
      detectedFormat,
      rawEntries: [],
      formatError: 'INVALID_FEED_FORMAT: Endpoint returned an HTML document instead of an XML RSS/Atom feed.',
    };
  }

  let parsed: any;
  try {
    parsed = parser.parse(xmlContent);
  } catch (err: any) {
    return {
      detectedFormat,
      rawEntries: [],
      formatError: `MALFORMED_XML: ${err.message}`,
    };
  }

  let rawItems: any[] = [];
  if (parsed?.rss?.channel?.item) {
    rawItems = parsed.rss.channel.item;
  } else if (parsed?.feed?.entry) {
    rawItems = parsed.feed.entry;
  } else if (parsed?.['rdf:RDF']?.item) {
    rawItems = parsed['rdf:RDF'].item;
  }
  const itemsArray = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const rawEntries: RawFeedEntry[] = [];
  for (const item of itemsArray) {
    if (!item) continue;

    const rawTitle = typeof item.title === 'string' ? item.title.trim() : (item.title?.['#text'] || '').trim();
    if (!rawTitle || rawTitle.length < 5) continue;

    const cleanedTitle = cleanHtml(rawTitle);

    let headline = cleanedTitle;
    let originalPublisher = sourceName;
    const gnewsMatch = cleanedTitle.match(/^(.*?)\s*-\s*([^-]+)$/);
    if (gnewsMatch && gnewsMatch[1].length > 10 && gnewsMatch[2].length < 60) {
      headline = gnewsMatch[1].trim();
      originalPublisher = gnewsMatch[2].trim();
    } else if (item.source && typeof item.source === 'string') {
      originalPublisher = item.source.trim();
    } else if (item.source?.['#text']) {
      originalPublisher = item.source['#text'].trim();
    } else if (item['dc:creator']) {
      originalPublisher = typeof item['dc:creator'] === 'string' ? item['dc:creator'].trim() : originalPublisher;
    }

    headline = headline.replace(/^(PIB|Press Release|Update|Ministry of [^:]+:)\s*/i, '').trim();

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
    } else if (item.content?.['#text']) {
      summary = item.content['#text'];
    } else {
      summary = headline;
    }

    summary = cleanHtml(summary);
    if (summary.length > 800) {
      summary = summary.substring(0, 797) + '...';
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
    } else if (item.id) {
      link = typeof item.id === 'string' ? item.id.trim() : item.id['#text']?.trim() || '';
    } else {
      link = `https://sidprep.in/news/${crypto.createHash('md5').update(headline).digest('hex')}`;
    }

    const feedEntryId =
      (typeof item.guid === 'string' ? item.guid.trim() : item.guid?.['#text']?.trim()) ||
      (typeof item.id === 'string' ? item.id.trim() : item.id?.['#text']?.trim()) ||
      link;

    const pubDateRaw = item.pubDate || item.published || item.updated || item['dc:date'] || null;

    rawEntries.push({
      rawTitle,
      cleanedTitle,
      headline,
      originalPublisher,
      summary,
      link,
      feedEntryId,
      pubDateRaw,
    });
  }

  return { detectedFormat, rawEntries };
}

/**
 * Parse XML feed (RSS 2.0, Atom 1.0, RDF) with detailed evaluation, freshness window,
 * Google News title parsing, and short description handling
 */
export function parseFeedXmlDetailed(
  xmlContent: string,
  sourceName: string,
  options: ParseFeedXmlOptions = {}
): {
  eligibleItems: FeedItemParsed[];
  rejectedCount: number;
  rejectionReasons: string[];
  detectedFormat: 'RSS_2_0' | 'ATOM_1_0' | 'RSS_1_0' | 'INVALID_HTML' | 'UNKNOWN';
} {
  const { detectedFormat, rawEntries, formatError } = extractRawFeedEntries(xmlContent, sourceName);
  if (formatError) {
    return {
      eligibleItems: [],
      rejectedCount: 1,
      rejectionReasons: [formatError],
      detectedFormat,
    };
  }

  const eligibleItems: FeedItemParsed[] = [];
  const rejectionReasons: string[] = [];
  let rejectedCount = 0;

  const now = Date.now();
  const maxAgeMs = (options.maxAgeHours || 72) * 3600 * 1000;

  for (const entry of rawEntries) {
    let publicationDate = new Date().toISOString();
    let eventDate = publicationDate.split('T')[0];

    if (entry.pubDateRaw) {
      const parsedTime = Date.parse(entry.pubDateRaw);
      if (!isNaN(parsedTime)) {
        if (options.maxAgeHours && now - parsedTime > maxAgeMs) {
          rejectedCount++;
          rejectionReasons.push(`[${entry.headline.substring(0, 35)}...]: STALE_PUBLICATION_DATE: Published ${new Date(parsedTime).toISOString()} exceeds ${options.maxAgeHours}h window.`);
          continue;
        }
        publicationDate = new Date(parsedTime).toISOString();
        eventDate = publicationDate.split('T')[0];
      }
    }

    const evaluation = evaluateCompetitiveExamArticle(entry.headline, entry.summary, entry.originalPublisher);
    if (!evaluation.isEligible) {
      rejectedCount++;
      rejectionReasons.push(`[${entry.headline.substring(0, 35)}...]: ${evaluation.rejectionReason}`);
      continue;
    }

    eligibleItems.push({
      title: entry.cleanedTitle,
      headline: entry.headline,
      summary: entry.summary,
      canonicalUrl: entry.link,
      originalUrl: entry.link,
      feedEntryId: entry.feedEntryId,
      originalPublisher: entry.originalPublisher,
      eventDate,
      publicationDate,
      category: evaluation.category!,
      categoryLabel: evaluation.categoryLabel!,
      relevantExams: evaluation.relevantExams!,
      syllabusTopics: evaluation.syllabusTopics!,
      keyFacts: evaluation.keyFacts!,
      whyItMatters: evaluation.whyItMatters!,
      staticGkBackground: evaluation.staticGkBackground!,
      practiceMcqs: evaluation.practiceMcqs || [],
      needsSourceReview: Boolean(evaluation.needsSourceReview),
      publisherUsageRights: entry.originalPublisher.includes('Press Information Bureau') || entry.originalPublisher.includes('Reserve Bank') ? 'OFFICIAL_GOVT' : 'FAIR_DEALING_DISCOVERY',
    });
  }

  return { eligibleItems, rejectedCount, rejectionReasons, detectedFormat };
}

/**
 * Standard parseFeedXml returning FeedItemParsed[] for direct array compatibility
 */
export function parseFeedXml(xmlContent: string, sourceName: string): FeedItemParsed[] {
  const { eligibleItems } = parseFeedXmlDetailed(xmlContent, sourceName);
  return eligibleItems;
}

/**
 * Test feed connectivity with comprehensive diagnostics (HTTP status, final URL, detected format, 3 sample entries, failure states)
 */
export async function testFeedConnectivity(feedUrl: string, sourceId?: string): Promise<{
  success: boolean;
  httpStatus: number;
  finalUrl: string;
  detectedFormat: string;
  itemCount: number;
  sampleEntries: Array<{ headline: string; date: string; publisher: string }>;
  rejectedCount: number;
  rejectionReasons: string[];
  isBlocked: boolean;
  isInvalidFormat: boolean;
  isEmpty: boolean;
  error?: string;
}> {
  if (!isSafePublicUrl(feedUrl)) {
    return {
      success: false,
      httpStatus: 400,
      finalUrl: feedUrl,
      detectedFormat: 'UNKNOWN',
      itemCount: 0,
      sampleEntries: [],
      rejectedCount: 0,
      rejectionReasons: [],
      isBlocked: true,
      isInvalidFormat: false,
      isEmpty: false,
      error: 'Invalid or blocked private network feed URL (SSRF safety check failed).',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SidPrep-CurrentAffairs-Bot/2.0-Test (+https://sidprep.in; connectivity-test@sidprep.in)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/plain',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const httpStatus = res.status;
    const finalUrl = res.url || feedUrl;

    if (!res.ok) {
      const isBlocked = httpStatus === 403 || httpStatus === 401;
      return {
        success: false,
        httpStatus,
        finalUrl,
        detectedFormat: 'UNKNOWN',
        itemCount: 0,
        sampleEntries: [],
        rejectedCount: 0,
        rejectionReasons: [],
        isBlocked,
        isInvalidFormat: false,
        isEmpty: false,
        error: `HTTP ${httpStatus}: ${res.statusText}`,
      };
    }

    const xml = await res.text();
    const { eligibleItems, rejectedCount, rejectionReasons, detectedFormat } = parseFeedXmlDetailed(xml, 'Test Source');

    const isInvalidFormat = detectedFormat === 'INVALID_HTML' || detectedFormat === 'UNKNOWN';
    const totalFound = eligibleItems.length + rejectedCount;
    const isEmpty = totalFound === 0;

    const sampleEntries = eligibleItems.slice(0, 3).map((item) => ({
      headline: item.headline,
      date: item.eventDate || item.publicationDate,
      publisher: item.originalPublisher,
    }));

    const result = {
      success: !isInvalidFormat && !isEmpty,
      httpStatus,
      finalUrl,
      detectedFormat,
      itemCount: eligibleItems.length,
      sampleEntries,
      rejectedCount,
      rejectionReasons: rejectionReasons.slice(0, 10),
      isBlocked: false,
      isInvalidFormat,
      isEmpty,
      error: isInvalidFormat
        ? 'Feed format invalid: server returned HTML or unrecognized document instead of XML.'
        : isEmpty
        ? 'Feed parsed successfully but contained 0 entries.'
        : undefined,
    };

    // Save test result in PostgreSQL if sourceId provided
    if (sourceId) {
      try {
        await query(
          `UPDATE news_sources
           SET last_test_result = $1, last_tested_at = NOW(), feed_format = $2, is_verified = $3
           WHERE id = $4`,
          [JSON.stringify(result), detectedFormat, result.success, sourceId]
        );
      } catch {
        // Fallback
      }
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 0,
      finalUrl: feedUrl,
      detectedFormat: 'UNKNOWN',
      itemCount: 0,
      sampleEntries: [],
      rejectedCount: 0,
      rejectionReasons: [],
      isBlocked: false,
      isInvalidFormat: false,
      isEmpty: false,
      error: err.name === 'AbortError' ? 'Feed request timed out after 10 seconds.' : err.message || 'Connectivity failure',
    };
  }
}

/**
 * Shared durable ingestion engine for competitive-exam current affairs
 * Features:
 * - Bounded concurrency: exactly 6 simultaneous feed fetches
 * - Configurable timeout: 10 seconds
 * - Google News discovery handling & original publisher extraction
 * - Short description content retrieval (< 40 words)
 * - Unicode headline similarity clustering with anti-false-positive guards
 * - Deterministic preferred-source ranking and alternative source preservation
 * - Needs source review marking
 */
export async function executeNewsFetchJob(options: {
  sourceId?: string;
  sourceGroup?: string;
  adminId?: string;
  workerId?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  maxAgeHours?: number;
}): Promise<IngestionResult> {
  const startTime = Date.now();
  const jobId = `njob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const workerId = options.workerId || 'api_manual_worker';
  const concurrency = options.maxConcurrency || 6;
  const timeoutMs = options.timeoutMs || 10000;
  const maxAgeHours = options.maxAgeHours || 72;

  // Ensure default candidate sources exist in PostgreSQL news_sources
  try {
    for (const src of DEFAULT_CANDIDATE_SOURCES) {
      await query(
        `INSERT INTO news_sources (
          id, name, feed_url, category, source_group, source_type, query_template,
          query_keywords, publisher_usage_rights, is_verified, is_enabled, priority_tier,
          language, fetch_interval_minutes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
        ) ON CONFLICT (id) DO UPDATE SET feed_url = EXCLUDED.feed_url, is_enabled = EXCLUDED.is_enabled`,
        [
          src.id,
          src.name,
          src.feed_url,
          src.category,
          src.source_group,
          src.source_type,
          src.query_template || null,
          src.query_keywords || [],
          src.publisher_usage_rights,
          src.is_verified || false,
          src.is_enabled,
          src.priority_tier || 2,
          src.language || 'en',
          src.fetch_interval_minutes || 180,
        ]
      );
    }
  } catch (err: any) {
    // Graceful fallback
  }

  let validJobSourceId: string | null = null;
  if (options.sourceId) {
    try {
      const chk = await query('SELECT id FROM news_sources WHERE id = $1', [options.sourceId]);
      if (chk.rows.length > 0) validJobSourceId = options.sourceId;
    } catch {}
  }

  try {
    await query(
      `INSERT INTO news_fetch_jobs (id, source_id, source_group, status, lease_expires_at, worker_id, created_at, started_at)
       VALUES ($1, $2, $3, 'RUNNING', NOW() + INTERVAL '10 minutes', $4, NOW(), NOW())`,
      [jobId, validJobSourceId, options.sourceGroup || null, workerId]
    );
  } catch (err: any) {
    console.warn('[NewsIngestion] PostgreSQL job insert fallback:', err.message);
  }

  const result: IngestionResult = {
    jobId,
    sourceId: options.sourceId,
    sourceGroup: options.sourceGroup,
    status: 'COMPLETED',
    itemsFetched: 0,
    itemsNew: 0,
    itemsDuplicate: 0,
    itemsRejected: 0,
    itemsReviewNeeded: 0,
    itemsFailed: 0,
    errors: [],
    sourceReports: [],
  };

  // 1. Resolve Sources to Fetch
  let sourcesToFetch: any[] = [];
  try {
    if (options.sourceId) {
      const res = await query('SELECT * FROM news_sources WHERE id = $1', [options.sourceId]);
      sourcesToFetch = res.rows;
    } else if (options.sourceGroup) {
      const res = await query('SELECT * FROM news_sources WHERE is_enabled = true AND source_group = $1', [options.sourceGroup]);
      sourcesToFetch = res.rows;
    } else {
      const res = await query('SELECT * FROM news_sources WHERE is_enabled = true ORDER BY priority_tier ASC, created_at ASC');
      sourcesToFetch = res.rows;
    }
  } catch {
    sourcesToFetch = Array.from(db.newsSources.values()).filter((s) => {
      if (options.sourceId) return s.id === options.sourceId;
      if (options.sourceGroup) return (s.sourceGroup || 'national_governance') === options.sourceGroup && s.isEnabled;
      return s.isEnabled;
    });
  }

  if (sourcesToFetch.length === 0) {
    sourcesToFetch = DEFAULT_CANDIDATE_SOURCES.filter((s) => s.is_enabled);
  }

  // Active articles for deduplication
  const existingArticles: Array<{ id: string; headline: string; canonicalUrl: string; sourceUrl: string; priorityTier: number }> = [];
  try {
    const res = await query('SELECT id, headline, canonical_url, source_url FROM news_articles LIMIT 2000');
    for (const r of res.rows) {
      existingArticles.push({
        id: r.id,
        headline: r.headline,
        canonicalUrl: r.canonical_url,
        sourceUrl: r.source_url,
        priorityTier: 2,
      });
    }
  } catch {
    for (const d of db.newsDrafts.values()) {
      existingArticles.push({
        id: d.id,
        headline: d.headline || d.title,
        canonicalUrl: d.canonicalUrl || d.sourceUrl,
        sourceUrl: d.sourceUrl,
        priorityTier: 2,
      });
    }
  }

  const now = Date.now();
  const maxAgeMs = maxAgeHours * 3600 * 1000;

  // 2. Fetch Sources with Bounded Concurrency (6 workers)
  await mapConcurrent(sourcesToFetch, concurrency, async (source) => {
    const sourceStartTime = Date.now();
    let feedUrl = source.feed_url || source.feedUrl;
    const sourceName = source.name || 'News Source';
    const sourceId = source.id;
    const priorityTier = Number(source.priority_tier || source.priorityTier || 2);
    const sourceType = source.source_type || source.sourceType || 'DIRECT_FEED';
    const queryTemplate = source.query_template || source.queryTemplate;

    // Handle Google News Discovery query construction
    if (sourceType === 'GOOGLE_NEWS_DISCOVERY' && queryTemplate) {
      feedUrl = buildGoogleNewsDiscoveryUrl(queryTemplate);
    }

    let httpStatus = 0;
    let statusCategory: NewsSourceFunnelReport['statusCategory'] = 'OK';
    let parsedCount = 0;
    let inDateRangeCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let draftsSavedCount = 0;
    const rejectionReasons: string[] = [];
    let errorDetail: string | undefined = undefined;

    const recordReportAndPersist = async () => {
      const report: NewsSourceFunnelReport = {
        id: `nsr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        jobId,
        sourceId,
        sourceName,
        httpStatus,
        statusCategory,
        parsedCount,
        inDateRangeCount,
        duplicateCount,
        rejectedCount,
        draftsSavedCount,
        rejectionReasons: rejectionReasons.slice(0, 50),
        errorDetail,
        latencyMs: Date.now() - sourceStartTime,
      };

      let validReportSourceId: string | null = null;
      if (sourceId) {
        try {
          const chk = await query('SELECT id FROM news_sources WHERE id = $1', [sourceId]);
          if (chk.rows.length > 0) validReportSourceId = sourceId;
        } catch {}
      }

      try {
        await query(
          `INSERT INTO news_fetch_source_reports (
            id, job_id, source_id, source_name, http_status, status_category,
            parsed_count, in_date_range_count, duplicate_count, rejected_count,
            drafts_saved_count, rejection_reasons, error_detail, latency_ms, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
          [
            report.id,
            jobId,
            validReportSourceId,
            sourceName,
            httpStatus,
            statusCategory,
            parsedCount,
            inDateRangeCount,
            duplicateCount,
            rejectedCount,
            draftsSavedCount,
            JSON.stringify(report.rejectionReasons),
            errorDetail || null,
            report.latencyMs,
          ]
        );
      } catch (err: any) {
        console.warn('[NewsIngestion] PostgreSQL source report insert fallback:', err.message);
      }

      result.sourceReports.push(report);
    };

    if (!isSafePublicUrl(feedUrl)) {
      statusCategory = 'NETWORK_ERROR';
      errorDetail = `Blocked unsafe or internal feed URL: ${feedUrl}`;
      result.itemsRejected++;
      result.errors.push(`[${sourceName}]: ${errorDetail}`);
      await recordReportAndPersist();
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 (compatible; SidPrep-Bot/2.0; +https://sidprep.in)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/plain, */*',
      };
      if (source.etag) headers['If-None-Match'] = source.etag;
      if (source.last_modified_header) headers['If-Modified-Since'] = source.last_modified_header;

      let response: Response;
      try {
        response = await fetch(feedUrl, {
          signal: controller.signal,
          headers,
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timeout);
      }

      httpStatus = response.status;

      if (response.status === 304) {
        statusCategory = 'OK';
        errorDetail = 'HTTP 304 Not Modified (content unchanged).';
        await recordReportAndPersist();
        return;
      }

      if (!response.ok) {
        statusCategory = (response.status === 403 || response.status === 401) ? 'BLOCKED_HTML' : 'NETWORK_ERROR';
        errorDetail = `HTTP ${response.status} from source feed.`;
        throw new Error(errorDetail);
      }

      const responseETag = response.headers.get('etag');
      const responseLastMod = response.headers.get('last-modified');

      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) {
        statusCategory = 'PARSER_ERROR';
        errorDetail = `Feed exceeded 2MB size limit: ${text.length} bytes.`;
        throw new Error(errorDetail);
      }

      const { detectedFormat, rawEntries, formatError } = extractRawFeedEntries(text, sourceName);

      if (formatError) {
        statusCategory = formatError.includes('HTML') ? 'BLOCKED_HTML' : 'PARSER_ERROR';
        errorDetail = formatError;
        result.itemsFailed++;
        result.errors.push(`[${sourceName}]: ${formatError}`);
        await recordReportAndPersist();
        return;
      }

      parsedCount = rawEntries.length;
      if (parsedCount === 0) {
        statusCategory = 'EMPTY';
        errorDetail = 'Valid feed containing 0 items.';
        await recordReportAndPersist();
        return;
      }

      // Process each raw entry
      for (const entry of rawEntries) {
        // 1. Freshness filter
        let publicationDate = new Date().toISOString();
        let eventDate = publicationDate.split('T')[0];

        if (entry.pubDateRaw) {
          const parsedTime = Date.parse(entry.pubDateRaw);
          if (!isNaN(parsedTime)) {
            if (maxAgeHours && (now - parsedTime > maxAgeMs)) {
              rejectedCount++;
              rejectionReasons.push(`[${entry.headline.substring(0, 35)}...]: STALE_PUBLICATION_DATE: Published ${new Date(parsedTime).toISOString()} exceeds ${maxAgeHours}h window.`);
              continue;
            }
            publicationDate = new Date(parsedTime).toISOString();
            eventDate = publicationDate.split('T')[0];
          }
        }
        inDateRangeCount++;

        // 2. Fetch full article content BEFORE short description rejection
        let contentToEvaluate = entry.summary;
        let articleContent: string | undefined = undefined;
        if ((entry.summary || '').split(/\s+/).length < 40 && isSafePublicUrl(entry.link)) {
          const retrieval = await retrieveArticleContentIfShort(entry.link, entry.summary);
          if (retrieval.wasRetrieved) {
            articleContent = retrieval.content;
            contentToEvaluate = retrieval.content;
          }
        }

        // 3. Competitive exam evaluation
        const evaluation = evaluateCompetitiveExamArticle(entry.headline, contentToEvaluate, entry.originalPublisher);
        if (!evaluation.isEligible) {
          rejectedCount++;
          rejectionReasons.push(`[${entry.headline.substring(0, 35)}...]: ${evaluation.rejectionReason}`);
          continue;
        }

        // 4. Deduplication
        const exactMatch = existingArticles.find((a) => a.canonicalUrl === entry.link || a.sourceUrl === entry.link);
        if (exactMatch) {
          duplicateCount++;
          continue;
        }

        const similarMatch = existingArticles.find((a) => areTitlesSimilar(entry.headline, a.headline, 0.65));
        if (similarMatch) {
          duplicateCount++;
          try {
            await query(
              `UPDATE news_articles
               SET alternative_source_urls = array_append(alternative_source_urls, $1)
               WHERE id = $2 AND NOT ($1 = ANY(alternative_source_urls))`,
              [entry.link, similarMatch.id]
            );
          } catch {
            // Ignore if array_append fallback
          }
          continue;
        }

        // 5. Unique article -> save draft
        const articleId = `art_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        draftsSavedCount++;

        try {
          await query(
            `INSERT INTO news_articles (
              id, source_id, source_name, source_url, canonical_url, feed_entry_id, original_publisher,
              headline, summary, event_date, publication_date, fetch_date, category, target_exams,
              syllabus_topics, key_facts, exam_relevance, static_gk_background, practice_mcqs,
              language, editorial_status, needs_source_review, article_content, publisher_usage_rights
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            ON CONFLICT (canonical_url) DO NOTHING`,
            [
              articleId,
              sourceId,
              sourceName,
              entry.link,
              entry.link,
              entry.feedEntryId,
              entry.originalPublisher,
              entry.headline,
              entry.summary,
              eventDate,
              publicationDate,
              evaluation.category,
              evaluation.relevantExams,
              evaluation.syllabusTopics,
              evaluation.keyFacts,
              evaluation.whyItMatters,
              evaluation.staticGkBackground,
              JSON.stringify(evaluation.practiceMcqs || []),
              source.language || 'en',
              evaluation.needsSourceReview ? 'NEEDS_SOURCE_REVIEW' : 'DRAFT',
              Boolean(evaluation.needsSourceReview),
              articleContent || null,
              entry.originalPublisher.includes('Press Information Bureau') || entry.originalPublisher.includes('Reserve Bank') ? 'OFFICIAL_GOVT' : 'FAIR_DEALING_DISCOVERY',
            ]
          );
        } catch (err: any) {
          console.warn('[NewsIngestion] PostgreSQL article insert fallback:', err.message);
        }

        const newDraft: NewsDraftRecord = {
          id: articleId,
          title: entry.headline,
          headline: entry.headline,
          originalSummary: entry.summary,
          summary: entry.summary,
          category: evaluation.category!,
          targetExams: evaluation.relevantExams || [],
          keyFacts: evaluation.keyFacts || [],
          whyItMatters: evaluation.whyItMatters,
          staticGkBackground: evaluation.staticGkBackground,
          practiceMcqs: evaluation.practiceMcqs || [],
          sourceName: sourceName,
          sourceUrl: entry.link,
          canonicalUrl: entry.link,
          feedEntryId: entry.feedEntryId,
          originalPublisher: entry.originalPublisher,
          alternativeSourceUrls: [],
          needsSourceReview: Boolean(evaluation.needsSourceReview),
          articleContent,
          publisherUsageRights: entry.originalPublisher.includes('Press Information Bureau') || entry.originalPublisher.includes('Reserve Bank') ? 'OFFICIAL_GOVT' : 'FAIR_DEALING_DISCOVERY',
          eventDate,
          confidenceScore: evaluation.needsSourceReview ? 0.75 : 0.98,
          editorialStatus: evaluation.needsSourceReview ? 'NEEDS_SOURCE_REVIEW' : 'DRAFT',
          publishedAt: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.newsDrafts.set(articleId, newDraft);

        if (evaluation.needsSourceReview) {
          result.itemsReviewNeeded++;
        }

        existingArticles.push({
          id: articleId,
          headline: entry.headline,
          canonicalUrl: entry.link,
          sourceUrl: entry.link,
          priorityTier,
        });
      }

      // Determine final status category
      if (draftsSavedCount > 0 || duplicateCount > 0) {
        statusCategory = 'OK';
      } else if (inDateRangeCount > 0) {
        statusCategory = 'ALL_ITEMS_FILTERED';
        errorDetail = 'All items in date range were filtered out by exam relevance criteria.';
      } else {
        statusCategory = 'ALL_ITEMS_FILTERED';
        errorDetail = 'All items filtered (all items exceeded freshness window).';
      }

      await recordReportAndPersist();

      result.itemsFetched += parsedCount;
      result.itemsNew += draftsSavedCount;
      result.itemsDuplicate += duplicateCount;
      result.itemsRejected += rejectedCount;

      for (const reason of rejectionReasons) {
        result.errors.push(reason);
      }

      // Update source health and format
      try {
        await query(
          `UPDATE news_sources
           SET last_fetched_at = NOW(), health_status = 'HEALTHY', error_message = NULL,
               consecutive_failures = 0, etag = $1, last_modified_header = $2,
               feed_format = $3
           WHERE id = $4`,
          [responseETag || null, responseLastMod || null, detectedFormat, sourceId]
        );
      } catch {
        // Fallback
      }
    } catch (err: any) {
      result.itemsFailed++;
      result.errors.push(`Error fetching ${sourceName}: ${err.message}`);

      if (!statusCategory || statusCategory === 'OK') {
        statusCategory = (err.message.includes('403') || err.message.includes('HTML')) ? 'BLOCKED_HTML' : 'NETWORK_ERROR';
      }
      errorDetail = err.message;
      await recordReportAndPersist();

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
  });

  result.durationMs = Date.now() - startTime;

  if (result.errors.length > 0 && result.itemsNew === 0 && result.itemsFetched === 0) {
    result.status = 'FAILED';
  } else if (result.errors.length > 0 && result.itemsNew === 0) {
    result.status = 'PARTIAL_FAILURE';
  } else {
    result.status = 'COMPLETED';
  }

  try {
    await query(
      `UPDATE news_fetch_jobs
       SET status = $1, items_fetched = $2, items_new = $3, items_duplicate = $4,
           items_rejected = $5, items_review_needed = $6, items_failed = $7,
           error_details = $8, completed_at = NOW()
       WHERE id = $9`,
      [
        result.status,
        result.itemsFetched,
        result.itemsNew,
        result.itemsDuplicate,
        result.itemsRejected,
        result.itemsReviewNeeded,
        result.itemsFailed,
        JSON.stringify(result.errors.slice(0, 50)),
        jobId,
      ]
    );
  } catch {
    // Fallback
  }

  db.logOperational({
    service: 'NEWS_INGESTION_SERVICE',
    level: result.status === 'FAILED' ? 'ERROR' : result.status === 'PARTIAL_FAILURE' ? 'WARN' : 'INFO',
    message: `News ingestion job ${jobId} finished with status ${result.status} (New: ${result.itemsNew}, ReviewNeeded: ${result.itemsReviewNeeded}, Dupes: ${result.itemsDuplicate}, Filtered: ${result.itemsRejected}) in ${result.durationMs}ms`,
    meta: {
      itemsFetched: result.itemsFetched,
      itemsNew: result.itemsNew,
      itemsDuplicate: result.itemsDuplicate,
      itemsRejected: result.itemsRejected,
      itemsReviewNeeded: result.itemsReviewNeeded,
      durationMs: result.durationMs,
      errors: result.errors.slice(0, 10),
    },
  });

  return result;
}
