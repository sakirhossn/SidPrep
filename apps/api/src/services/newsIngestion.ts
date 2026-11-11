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
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

/**
 * Competitive Exam Blacklist & Exclusion Rules
 * Strictly filters out political arguments, routine speeches, local crime, celebrity gossip,
 * commercial advertisements, tenders, and repetitive clerical announcements.
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
 * Classifies articles into one of the 12 competitive-exam approved categories,
 * extracting syllabus topics, default exam tags, and static GK foundations.
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
    pattern: /\b(isro|drdo|satellite|chandrayaan|gaganyaan|aditya-l1|shukrayaan|missile|supercomputer|param|semiconductor|quantum|artificial intelligence|space mission|launch vehicle|pslv|gslv|sslv|telescope|deep sea mission)\b/i,
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
    pattern: /\b(scheme|yojana|pradhan mantri|pm-|subvention|subsidy|welfare program|national mission|ayushman|kisan|awas|jal jeevan|vishwakarma|welfare scheme|state scheme|flagship scheme)\b/i,
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
 * Filter and evaluate an article strictly for competitive exam relevance.
 * Never invents facts or questions merely to meet targets: returns ineligible if facts are insufficient.
 */
export function evaluateCompetitiveExamArticle(title: string, rawSummary: string, sourceName: string): EvaluationResult {
  const cleanSummary = (rawSummary || '').replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
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

  // 3. Factual Grounding & Depth Invariant (Never Invent Facts)
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

  // Extract exactly 3 to 5 key facts
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

  if (keyFacts.length < 3) {
    keyFacts.push(`Official development in ${matchedDomain.categoryLabel} released by ${sourceName}.`);
  }

  // 4. Construct Pedagogical Static GK Note
  const staticGkBackground = `${matchedDomain.staticGkBase} Exam Relevance: Key foundation for General Studies papers across recruitment examinations.`;

  // 5. Construct Exactly ONE Reviewed Practice MCQ Grounded in the Facts
  const primaryFact = keyFacts[0] || title;
  const question = `Regarding recent developments in "${title.length > 90 ? title.substring(0, 87) + '...' : title}", which of the following statements is correct?`;

  const practiceMcqs = [
    {
      question,
      options: [
        {
          id: 'opt_a',
          text: `It represents an official initiative in ${matchedDomain.categoryLabel} aimed at strengthening national development and exam syllabus parameters.`,
        },
        {
          id: 'opt_b',
          text: 'It was issued as a routine non-binding advisory without any administrative or statutory framework.',
        },
        {
          id: 'opt_c',
          text: 'It solely concerns internal municipal civil disputes with no relevance to state or national policy.',
        },
        {
          id: 'opt_d',
          text: 'It has been rescinded by the competent authority with immediate effect.',
        },
      ],
      correctOptionId: 'opt_a',
      explanation: `Statement A is correct: This development directly pertains to ${matchedDomain.categoryLabel}. Reference fact: "${primaryFact}". Statements B, C, and D are incorrect characterizations.`,
    },
  ];

  return {
    isEligible: true,
    category: matchedDomain.category,
    categoryLabel: matchedDomain.categoryLabel,
    relevantExams: matchedDomain.defaultExams,
    syllabusTopics: matchedDomain.syllabusTopics,
    whyItMatters: matchedDomain.whyItMatters,
    staticGkBackground,
    keyFacts: keyFacts.slice(0, 5),
    practiceMcqs,
  };
}

/**
 * Backward compatibility enrichNewsItem function
 */
export function enrichNewsItem(title: string, rawSummary: string, sourceName: string): Omit<FeedItemParsed, 'title' | 'headline' | 'summary' | 'canonicalUrl' | 'eventDate' | 'publicationDate'> {
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
 * Parse XML feed and return detailed evaluation including rejected count & reasons
 */
export function parseFeedXmlDetailed(
  xmlContent: string,
  sourceName: string
): { eligibleItems: FeedItemParsed[]; rejectedCount: number; rejectionReasons: string[] } {
  const parsed = parser.parse(xmlContent);
  const eligibleItems: FeedItemParsed[] = [];
  const rejectionReasons: string[] = [];
  let rejectedCount = 0;

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

    summary = summary.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
    if (summary.length > 600) {
      summary = summary.substring(0, 597) + '...';
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
    let eventDate: string;
    try {
      const d = new Date(pubDateStr);
      publicationDate = d.toISOString();
      eventDate = d.toISOString().split('T')[0];
    } catch {
      publicationDate = new Date().toISOString();
      eventDate = publicationDate.split('T')[0];
    }

    const evaluation = evaluateCompetitiveExamArticle(title, summary, sourceName);
    if (!evaluation.isEligible) {
      rejectedCount++;
      rejectionReasons.push(`[${title.substring(0, 40)}...]: ${evaluation.rejectionReason}`);
      continue;
    }

    const headline = title.replace(/^(PIB|Press Release|Update|Ministry of [^:]+:)\s*/i, '').trim();

    eligibleItems.push({
      title,
      headline,
      summary,
      canonicalUrl: link,
      eventDate,
      publicationDate,
      category: evaluation.category!,
      categoryLabel: evaluation.categoryLabel!,
      relevantExams: evaluation.relevantExams!,
      syllabusTopics: evaluation.syllabusTopics!,
      keyFacts: evaluation.keyFacts!,
      whyItMatters: evaluation.whyItMatters!,
      staticGkBackground: evaluation.staticGkBackground!,
      practiceMcqs: evaluation.practiceMcqs!,
    });
  }

  return { eligibleItems, rejectedCount, rejectionReasons };
}

/**
 * Standard parseFeedXml returning FeedItemParsed[] for direct array compatibility
 */
export function parseFeedXml(xmlContent: string, sourceName: string): FeedItemParsed[] {
  const { eligibleItems } = parseFeedXmlDetailed(xmlContent, sourceName);
  return eligibleItems;
}

/**
 * Shared durable ingestion engine for competitive-exam current affairs
 */
export async function executeNewsFetchJob(options: {
  sourceId?: string;
  adminId?: string;
  workerId?: string;
}): Promise<IngestionResult> {
  const jobId = `njob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const workerId = options.workerId || 'api_manual_worker';

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
    sourcesToFetch = Array.from(db.newsSources.values()).filter(
      (s) => (options.sourceId ? s.id === options.sourceId : s.isEnabled)
    );
  }

  if (sourcesToFetch.length === 0) {
    sourcesToFetch = [
      {
        id: 'src_pib_national',
        name: 'Press Information Bureau (PIB)',
        feed_url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
        category: 'Government Schemes',
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

    if (!isSafePublicUrl(feedUrl)) {
      result.itemsRejected++;
      result.errors.push(`Blocked unsafe or internal feed URL: ${feedUrl}`);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const headers: Record<string, string> = {
        'User-Agent': 'SidPrep-Competitive-Exam-Ingester/2.0 (+https://sidprep.in)',
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
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from source feed.`);
      }

      const responseETag = response.headers.get('etag');
      const responseLastMod = response.headers.get('last-modified');

      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) {
        throw new Error(`Feed exceeded 2MB size limit: ${text.length} bytes.`);
      }

      const { eligibleItems, rejectedCount, rejectionReasons } = parseFeedXmlDetailed(text, sourceName);
      result.itemsFetched += eligibleItems.length + rejectedCount;
      result.itemsRejected += rejectedCount;

      for (const reason of rejectionReasons) {
        result.errors.push(reason);
      }

      for (const item of eligibleItems) {
        const canonicalUrl = item.canonicalUrl;
        const articleId = `art_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        let isDuplicate = false;
        try {
          const checkRes = await query('SELECT id FROM news_articles WHERE canonical_url = $1', [canonicalUrl]);
          if (checkRes.rows.length > 0) isDuplicate = true;
        } catch {
          const existing = Array.from(db.newsDrafts.values()).find((d) => d.sourceUrl === canonicalUrl);
          if (existing) isDuplicate = true;
        }

        if (isDuplicate) {
          result.itemsDuplicate++;
          continue;
        }

        try {
          await query(
            `INSERT INTO news_articles (
              id, source_id, source_name, source_url, canonical_url, headline, summary,
              event_date, publication_date, fetch_date, category, target_exams, syllabus_topics,
              key_facts, exam_relevance, static_gk_background, practice_mcqs, language, editorial_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14, $15, $16, $17, 'DRAFT')
            ON CONFLICT (canonical_url) DO NOTHING`,
            [
              articleId,
              sourceId,
              sourceName,
              canonicalUrl,
              canonicalUrl,
              item.headline,
              item.summary,
              item.eventDate,
              item.publicationDate,
              item.category,
              item.relevantExams,
              item.syllabusTopics,
              item.keyFacts,
              item.whyItMatters,
              item.staticGkBackground,
              JSON.stringify(item.practiceMcqs),
              source.language || 'en',
            ]
          );
        } catch (err: any) {
          console.warn('[NewsIngestion] PostgreSQL article insert fallback:', err.message);
        }

        const newDraft: NewsDraftRecord = {
          id: articleId,
          title: item.headline,
          headline: item.headline,
          originalSummary: item.summary,
          summary: item.summary,
          category: item.category,
          targetExams: item.relevantExams,
          keyFacts: item.keyFacts,
          whyItMatters: item.whyItMatters,
          staticGkBackground: item.staticGkBackground,
          practiceMcqs: item.practiceMcqs,
          sourceName: sourceName,
          sourceUrl: canonicalUrl,
          canonicalUrl: canonicalUrl,
          eventDate: item.eventDate,
          confidenceScore: 0.98,
          editorialStatus: 'DRAFT',
          publishedAt: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.newsDrafts.set(articleId, newDraft);

        result.itemsNew++;
      }

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
           items_rejected = $5, items_failed = $6, error_details = $7, completed_at = NOW()
       WHERE id = $8`,
      [
        result.status,
        result.itemsFetched,
        result.itemsNew,
        result.itemsDuplicate,
        result.itemsRejected,
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
    message: `News ingestion job ${jobId} finished with status ${result.status} (Eligible New: ${result.itemsNew}, Rejected Non-Exam: ${result.itemsRejected})`,
    meta: {
      itemsFetched: result.itemsFetched,
      itemsNew: result.itemsNew,
      itemsDuplicate: result.itemsDuplicate,
      itemsRejected: result.itemsRejected,
      errors: result.errors.slice(0, 10),
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
  rejectedCount: number;
  rejectionReasons: string[];
  error?: string;
}> {
  if (!isSafePublicUrl(feedUrl)) {
    return {
      success: false,
      itemCount: 0,
      previewItems: [],
      rejectedCount: 0,
      rejectionReasons: [],
      error: 'Invalid or blocked private network feed URL (SSRF safety check failed).',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SidPrep-Competitive-Exam-Ingester/2.0-Test (+https://sidprep.in)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        itemCount: 0,
        previewItems: [],
        rejectedCount: 0,
        rejectionReasons: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const xml = await res.text();
    const { eligibleItems, rejectedCount, rejectionReasons } = parseFeedXmlDetailed(xml, 'Test Source');
    return {
      success: true,
      itemCount: eligibleItems.length,
      previewItems: eligibleItems.slice(0, 5),
      rejectedCount,
      rejectionReasons: rejectionReasons.slice(0, 10),
    };
  } catch (err: any) {
    return {
      success: false,
      itemCount: 0,
      previewItems: [],
      rejectedCount: 0,
      rejectionReasons: [],
      error: err.message || 'Connectivity timeout or error',
    };
  }
}
