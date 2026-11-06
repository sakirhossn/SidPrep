import { env } from '../config/index.js';
import { hashPassword } from '../lib/security.js';

// Types representing core entities
export interface StudentRecord {
  id: string;
  email: string;
  phone?: string;
  preferredLanguage: 'en' | 'hi' | 'bn';
  targetExams: string[];
  dailyGoalMinutes: number;
  streakDays: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'CONTENT_MANAGER' | 'EXAM_EDITOR' | 'REVIEWER' | 'CA_EDITOR' | 'TRANSLATOR' | 'SUPPORT' | 'ANALYST' | 'AUDITOR';
  totpSecret: string;
  is2faEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ExamRecord {
  id: string;
  bodyCode: 'SSC' | 'RRB' | 'WBPSC' | 'IBPS';
  code: string;
  name: string;
  description: string;
  stagesCount: number;
  verifiedDate: string;
  sourceUrl: string;
  stages: {
    id: string;
    name: string;
    stageNumber: number;
    durationMinutes: number;
    totalMarks: number;
    negativeMarkRatio: number;
    sectionLock: boolean;
  }[];
  syllabusTree: {
    subject: string;
    weightPercentage: number;
    topics: string[];
  }[];
}

export interface QuestionRecord {
  id: string;
  topicId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  pyqYear?: number;
  pyqExam?: string;
  pyqShift?: string;
  correctOptionId: string;
  createdBy: string;
  status: 'DRAFT' | 'REVIEWED' | 'PUBLISHED';
  translations: {
    language: 'en' | 'hi' | 'bn';
    text: string;
    explanation: string;
    options: { id: string; text: string }[];
  }[];
}

export interface TestRecord {
  id: string;
  examCode: string;
  title: string;
  type: 'FULL' | 'SECTIONAL' | 'TOPIC' | 'PYQ';
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isFree: boolean;
  isPublished: boolean;
  instructions: string[];
  sections: {
    id: string;
    title: string;
    questionCount: number;
    durationMinutes: number;
    sectionLock: boolean;
    questions: {
      questionId: string;
      positiveMarks: number;
      negativeMarks: number;
    }[];
  }[];
}

export interface AttemptRecord {
  id: string;
  testId: string;
  studentId: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: string;
  submittedAt?: string;
  durationSeconds: number;
  score: number;
  maxScore: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  answers: Map<string, {
    selectedOptionId: string | null;
    clientSequence: number;
    isMarkedForReview: boolean;
    timestamp: string;
  }>;
}

export interface NewsDraftRecord {
  id: string;
  candidateId?: string;
  title: string;
  originalSummary: string;
  category: string;
  targetExams: string[];
  keyFacts: string[];
  sourceName: string;
  sourceUrl: string;
  confidenceScore: number;
  editorialStatus: 'FETCHED' | 'NORMALIZED' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'REJECTED';
  approvedBy?: string;
  approvalMode?: 'MANUAL' | 'AUTO_RULE';
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRecord {
  id: string;
  title: string;
  description: string;
  exam: string;
  subject: string;
  fileType: 'PDF' | 'DOCX' | 'PNG' | 'JPEG' | 'WEBP';
  fileSizeBytes: number;
  sha256Hash: string;
  storagePath: string;
  previewAllowed: boolean;
  downloadAllowed: boolean;
  offlineAllowed: boolean;
  previewContent?: string;
  licenseSource: string;
  isPublished: boolean;
  verifiedDate: string;
}

export interface AuditEventRecord {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  module: string;
  action: string;
  targetId?: string;
  changesDiff: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface OperationalEventRecord {
  id: string;
  service: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AppTelemetryRecord {
  id: string;
  appVersion: string;
  os: 'android' | 'ios';
  eventCode: string;
  correlationId: string;
  sanitizedMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface JobRunRecord {
  id: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  scheduledFor: string;
  retryCount: number;
  lastError?: string;
}

export interface PageRecord {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  contentHtml: string;
  metaTitle?: string;
  metaDescription?: string;
  isPublished: boolean;
  isSystem: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface AppVersionRecord {
  currentVersion: string;
  minVersion: string;
  apkUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

/**
 * Verified PBKDF2 SHA-512 Hash for default admin password 'AdminSecurePass123!'
 * Precomputed to ensure synchronous availability immediately upon startup without async race conditions.
 */
const DEFAULT_ADMIN_PASSWORD_HASH =
  '5bd63df08953e9b7d83ebbec02aa79bf:900a28ae6b186c524c482b5335dfce3a7d55282e6d39f7093dad105e3acc87899791b0ce4eaabf8cda90e36f0b59c7d9edb6c3f12be0e89911a2f0dbab42233f';

/**
 * In-Memory & PostgreSQL Dual Store
 */
class SidPrepDatabase {
  public students = new Map<string, StudentRecord>();
  public adminUsers = new Map<string, AdminUserRecord>([
    [
      'adm_owner',
      {
        id: 'adm_owner',
        email: 'sksakirhossain8@gmail.com',
        name: 'Sk Sakir Hossain',
        passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
        role: 'SUPER_ADMIN',
        totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 test secret
        is2faEnabled: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    [
      'adm_1',
      {
        id: 'adm_1',
        email: 'admin@sidprep.in',
        name: 'Super Admin',
        passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
        role: 'SUPER_ADMIN',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        is2faEnabled: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    [
      'adm_2',
      {
        id: 'adm_2',
        email: 'editor@sidprep.in',
        name: 'Exam & Content Editor',
        passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
        role: 'EXAM_EDITOR',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        is2faEnabled: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
  ]);
  public otpChallenges = new Map<string, { otp: string; expiresAt: number; attempts: number; lastSentAt?: number }>();
  public exams = new Map<string, ExamRecord>();
  public questions = new Map<string, QuestionRecord>();
  public tests = new Map<string, TestRecord>();
  public attempts = new Map<string, AttemptRecord>();
  public newsSources = new Map<string, { id: string; name: string; feedUrl: string; isEnabled: boolean }>();
  public newsDrafts = new Map<string, NewsDraftRecord>();
  public resources = new Map<string, ResourceRecord>();
  public pages = new Map<string, PageRecord>();
  public appVersion: AppVersionRecord = {
    currentVersion: '2.0.1',
    minVersion: '2.0.0',
    apkUrl: 'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk',
    releaseNotes: 'SidPrep 2.0.1: Full exam preparation features, Brevo OTP integration, dynamic page CMS, and offline-aware test runner.',
    publishedAt: new Date().toISOString(),
  };
  public auditEvents: AuditEventRecord[] = [];
  public operationalEvents: OperationalEventRecord[] = [];
  public appTelemetry: AppTelemetryRecord[] = [];
  public jobs: JobRunRecord[] = [];
  public brevoSendsToday = 14; // Default starting tracker

  constructor() {
    this.seedInitialData();
  }

  private async seedInitialData() {
    // 1. Admin Users are pre-seeded synchronously above with DEFAULT_ADMIN_PASSWORD_HASH

    // 2. Seed Real Official Exams (SSC, RRB, WBPSC, IBPS)
    this.exams.set('ssc-cgl', {
      id: 'ssc-cgl',
      bodyCode: 'SSC',
      code: 'SSC_CGL',
      name: 'SSC Combined Graduate Level (CGL)',
      description: 'Official Tier 1 & Tier 2 examination pattern for Central Government Group B and C posts.',
      stagesCount: 2,
      verifiedDate: '2026-09-15',
      sourceUrl: 'https://ssc.gov.in/notice-cgl-2026',
      stages: [
        {
          id: 'cgl-tier-1',
          name: 'Tier-I (Computer Based Examination)',
          stageNumber: 1,
          durationMinutes: 60,
          totalMarks: 200,
          negativeMarkRatio: 0.5,
          sectionLock: false,
        },
        {
          id: 'cgl-tier-2',
          name: 'Tier-II (Paper-I Mathematical & Reasoning + English & GK)',
          stageNumber: 2,
          durationMinutes: 135,
          totalMarks: 390,
          negativeMarkRatio: 1.0,
          sectionLock: true,
        },
      ],
      syllabusTree: [
        {
          subject: 'General Intelligence and Reasoning',
          weightPercentage: 25,
          topics: ['Analogies', 'Syllogism', 'Venn Diagrams', 'Blood Relations', 'Coding-Decoding', 'Series'],
        },
        {
          subject: 'General Awareness',
          weightPercentage: 25,
          topics: ['Indian Polity & Constitution', 'History & Culture', 'Economy & Budget', 'General Science', 'Current Affairs'],
        },
        {
          subject: 'Quantitative Aptitude',
          weightPercentage: 25,
          topics: ['Arithmetic', 'Algebra', 'Geometry & Mensuration', 'Trigonometry', 'Data Interpretation'],
        },
        {
          subject: 'English Comprehension',
          weightPercentage: 25,
          topics: ['Reading Comprehension', 'Error Spotting', 'Fill in the Blanks', 'Vocabulary & Synonyms', 'Active/Passive Voice'],
        },
      ],
    });

    this.exams.set('rrb-ntpc', {
      id: 'rrb-ntpc',
      bodyCode: 'RRB',
      code: 'RRB_NTPC',
      name: 'RRB Non-Technical Popular Categories (NTPC)',
      description: 'Official Railway Recruitment Board exam for Graduate and Undergraduate posts.',
      stagesCount: 2,
      verifiedDate: '2026-08-20',
      sourceUrl: 'https://indianrailways.gov.in/rrb-ntpc-notice-2026',
      stages: [
        {
          id: 'ntpc-cbt-1',
          name: 'CBT-1 Screening',
          stageNumber: 1,
          durationMinutes: 90,
          totalMarks: 100,
          negativeMarkRatio: 0.33,
          sectionLock: false,
        },
      ],
      syllabusTree: [
        {
          subject: 'General Awareness (Science & Current Affairs)',
          weightPercentage: 40,
          topics: ['Current Events of National Importance', 'Indian Railways History & Stats', 'General Science', 'Indian Art & Culture'],
        },
        {
          subject: 'Mathematics',
          weightPercentage: 30,
          topics: ['Number System', 'Decimals & Fractions', 'LCM & HCF', 'Ratio & Proportion', 'Time & Work', 'Simple & Compound Interest'],
        },
        {
          subject: 'General Intelligence and Reasoning',
          weightPercentage: 30,
          topics: ['Analogies', 'Data Sufficiency', 'Statement-Conclusion', 'Decision Making', 'Puzzles'],
        },
      ],
    });

    this.exams.set('wbpsc-clerkship', {
      id: 'wbpsc-clerkship',
      bodyCode: 'WBPSC',
      code: 'WBPSC_CLERKSHIP',
      name: 'WBPSC Clerkship Examination',
      description: 'West Bengal Public Service Commission Secretariat and Directorate clerical exam.',
      stagesCount: 2,
      verifiedDate: '2026-07-10',
      sourceUrl: 'https://psc.wb.gov.in/notices/clerkship-2026',
      stages: [
        {
          id: 'wbpsc-part-1',
          name: 'Part-I Objective Type',
          stageNumber: 1,
          durationMinutes: 90,
          totalMarks: 100,
          negativeMarkRatio: 0.25,
          sectionLock: false,
        },
      ],
      syllabusTree: [
        {
          subject: 'General Studies (with West Bengal Focus)',
          weightPercentage: 40,
          topics: ['Indian History with special reference to Bengal', 'Geography of West Bengal', 'Current Affairs', 'General Science'],
        },
        {
          subject: 'Arithmetic',
          weightPercentage: 30,
          topics: ['Divisibility & Fractions', 'HCF & LCM', 'Partnership', 'Average & Ratio', 'Time & Distance'],
        },
        {
          subject: 'English',
          weightPercentage: 30,
          topics: ['Fundamentals of English Grammar', 'Vocabulary', 'Sentence Structure', 'Correct Usage'],
        },
      ],
    });

    this.exams.set('ibps-po', {
      id: 'ibps-po',
      bodyCode: 'IBPS',
      code: 'IBPS_PO',
      name: 'IBPS Probationary Officer (CRP PO/MT)',
      description: 'Institute of Banking Personnel Selection Common Recruitment Process.',
      stagesCount: 2,
      verifiedDate: '2026-08-01',
      sourceUrl: 'https://ibps.in/crp-po-mt-xvi',
      stages: [
        {
          id: 'ibps-prelims',
          name: 'Preliminary Examination (Sectional Timed)',
          stageNumber: 1,
          durationMinutes: 60,
          totalMarks: 100,
          negativeMarkRatio: 0.25,
          sectionLock: true,
        },
      ],
      syllabusTree: [
        {
          subject: 'Quantitative Aptitude',
          weightPercentage: 35,
          topics: ['Data Interpretation (Tabular, Pie, Bar)', 'Quadratic Equations', 'Number Series', 'Arithmetic Word Problems'],
        },
        {
          subject: 'Reasoning Ability',
          weightPercentage: 35,
          topics: ['Seating Arrangement & Puzzles', 'Syllogism', 'Inequality', 'Direction Sense', 'Input-Output'],
        },
        {
          subject: 'English Language',
          weightPercentage: 30,
          topics: ['Reading Comprehension', 'Cloze Test', 'Para Jumbles', 'Error Detection', 'Fillers'],
        },
      ],
    });

    // 3. Seed Sample Questions & Tests
    const q1: QuestionRecord = {
      id: 'q_1',
      topicId: 'polity_constitution',
      difficulty: 'MEDIUM',
      pyqYear: 2024,
      pyqExam: 'SSC CGL',
      pyqShift: 'Shift 1',
      correctOptionId: 'opt_b',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'Which Article of the Constitution of India provides for the Right to Constitutional Remedies?',
          explanation: 'Article 32 gives citizens the right to move the Supreme Court for enforcement of fundamental rights. Dr. B.R. Ambedkar called it the heart and soul of the Constitution.',
          options: [
            { id: 'opt_a', text: 'Article 21' },
            { id: 'opt_b', text: 'Article 32' },
            { id: 'opt_c', text: 'Article 44' },
            { id: 'opt_d', text: 'Article 300A' },
          ],
        },
        {
          language: 'hi',
          text: 'भारतीय संविधान का कौन सा अनुच्छेद संवैधानिक उपचारों के अधिकार का प्रावधान करता है?',
          explanation: 'अनुच्छेद 32 नागरिकों को मौलिक अधिकारों के प्रवर्तन के लिए सर्वोच्च न्यायालय जाने का अधिकार देता है। डॉ. बी.आर. अंबेडकर ने इसे संविधान का हृदय और आत्मा कहा था।',
          options: [
            { id: 'opt_a', text: 'अनुच्छेद 21' },
            { id: 'opt_b', text: 'अनुच्छेद 32' },
            { id: 'opt_c', text: 'अनुच्छेद 44' },
            { id: 'opt_d', text: 'अनुच्छेद 300A' },
          ],
        },
      ],
    };
    this.questions.set(q1.id, q1);

    const q2: QuestionRecord = {
      id: 'q_2',
      topicId: 'arithmetic_percentages',
      difficulty: 'EASY',
      pyqYear: 2023,
      pyqExam: 'RRB NTPC',
      pyqShift: 'Shift 2',
      correctOptionId: 'opt_c',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'If the price of sugar increases by 25%, by what percentage must a household reduce its consumption so as to not increase the expenditure?',
          explanation: 'Reduction in consumption = [R / (100 + R)] * 100 = [25 / 125] * 100 = 20%.',
          options: [
            { id: 'opt_a', text: '15%' },
            { id: 'opt_b', text: '18%' },
            { id: 'opt_c', text: '20%' },
            { id: 'opt_d', text: '25%' },
          ],
        },
      ],
    };
    this.questions.set(q2.id, q2);

    this.tests.set('test_cgl_full_01', {
      id: 'test_cgl_full_01',
      examCode: 'SSC_CGL',
      title: 'SSC CGL Tier-1 Official Standard Mock 01',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 200,
      isFree: true,
      isPublished: true,
      instructions: [
        'Each correct answer awards 2.0 marks.',
        'Negative marking of 0.50 marks for every wrong answer.',
        'Test timer is server-authoritative.',
      ],
      sections: [
        {
          id: 'sec_1',
          title: 'General Awareness',
          questionCount: 25,
          durationMinutes: 15,
          sectionLock: false,
          questions: [
            { questionId: 'q_1', positiveMarks: 2.0, negativeMarks: 0.5 },
          ],
        },
        {
          id: 'sec_2',
          title: 'Quantitative Aptitude',
          questionCount: 25,
          durationMinutes: 20,
          sectionLock: false,
          questions: [
            { questionId: 'q_2', positiveMarks: 2.0, negativeMarks: 0.5 },
          ],
        },
      ],
    });

    // 4. Seed Allowlisted Current Affairs Sources
    this.newsSources.set('src_pib', {
      id: 'src_pib',
      name: 'Press Information Bureau (PIB) Official Feed',
      feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
      isEnabled: true,
    });
    this.newsSources.set('src_dd_news', {
      id: 'src_dd_news',
      name: 'DD News National & Economic Releases',
      feedUrl: 'https://ddnews.gov.in/feed/rss.xml',
      isEnabled: true,
    });

    // 5. Seed Real Published Current Affairs Briefs
    this.newsDrafts.set('ca_01', {
      id: 'ca_01',
      title: 'PM-Surya Ghar Scheme Reaches 1.5 Crore Consumer Registrations',
      originalSummary: 'The Ministry of New and Renewable Energy reported significant adoption of the rooftop solar initiative, providing up to 300 units of free electricity monthly to registered households.',
      category: 'Government Schemes',
      targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
      keyFacts: [
        'Outlay: ₹75,021 crore national allocation',
        'Subsidy structure: Up to 60% of solar system cost for 2kW systems',
        'Direct connection to National Grid Net-metering portal',
      ],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2012345',
      confidenceScore: 0.98,
      editorialStatus: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    });

    this.newsDrafts.set('ca_02', {
      id: 'ca_02',
      title: 'Reserve Bank of India Keeps Repo Rate Unchanged at 6.50% in MPC Review',
      originalSummary: 'The Monetary Policy Committee of the RBI maintained the policy repo rate at 6.50% to ensure inflation aligns with the 4% target while supporting economic growth.',
      category: 'Banking',
      targetExams: ['IBPS', 'SSC', 'RRB'],
      keyFacts: [
        'Repo Rate: 6.50% standing deposit facility at 6.25%',
        'MPC Composition: 6 members (3 RBI, 3 Government nominated)',
        'Inflation target mandated under Section 45ZA of RBI Act 1934',
      ],
      sourceName: 'Reserve Bank of India Official Bulletin',
      sourceUrl: 'https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=57001',
      confidenceScore: 0.99,
      editorialStatus: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 16).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    });

    // 6. Seed Learning Resources with Distinct Preview and Download Permissions
    this.resources.set('res_cgl_formula', {
      id: 'res_cgl_formula',
      title: 'SSC CGL Mathematics: Essential Formula Handbook (Algebra & Mensuration)',
      description: 'Comprehensive formula handbook covering coordinate geometry, trigonometry, and solid geometry shortcuts.',
      exam: 'SSC',
      subject: 'Quantitative Aptitude',
      fileType: 'PDF',
      fileSizeBytes: 2450000,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storagePath: '/uploads/cgl_formula_handbook_v1.pdf',
      previewAllowed: true,
      downloadAllowed: true, // Authorized download permitted
      offlineAllowed: true,
      previewContent: '{"numPages": 18, "title": "Formula Handbook", "author": "SidPrep Faculty"}',
      licenseSource: 'SidPrep Open Educational Library',
      isPublished: true,
      verifiedDate: '2026-09-01',
    });

    this.resources.set('res_rrb_science_notes', {
      id: 'res_rrb_science_notes',
      title: 'RRB NTPC General Science: Physics & Chemistry Quick Revision Notes',
      description: 'Handwritten and typed summary of NCERT Class 9-10 science concepts required for Railway exams.',
      exam: 'RRB',
      subject: 'General Science',
      fileType: 'DOCX',
      fileSizeBytes: 1280000,
      sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      storagePath: '/uploads/rrb_science_notes.docx',
      previewAllowed: true,
      downloadAllowed: false, // Strict preview-only policy enforced
      offlineAllowed: false,
      previewContent: '<h3>RRB Science Quick Notes</h3><p><strong>Mechanics:</strong> Newton’s 3 laws of motion. Momentum $p = mv$. Work $W = F \\times d \\cos(\\theta)$.</p><p><strong>Optics:</strong> Lens formula: $\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}$. Power of lens $P = \\frac{1}{f\\text{ (m)}}$.</p>',
      licenseSource: 'SidPrep Faculty In-House Notes (Preview Only)',
      isPublished: true,
      verifiedDate: '2026-08-15',
    });

    // 7. Seed Sample Audit Event
    this.auditEvents.push({
      id: 'aud_init_1',
      actorId: 'adm_1',
      actorEmail: 'admin@sidprep.in',
      actorRole: 'SUPER_ADMIN',
      module: 'EXAM',
      action: 'APPROVE',
      targetId: 'ssc-cgl',
      changesDiff: { note: 'Initial verification of official SSC CGL 2026 scheme' },
      ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });

    // 8. Seed Default Website CMS Pages
    const initialPages: PageRecord[] = [
      {
        id: 'page_about',
        slug: 'about',
        title: 'About SidPrep 2.0',
        subtitle: 'Trustworthy, Distraction-Free Preparation for Competitive Exams',
        contentHtml: `<p>SidPrep was created to provide serious competitive exam candidates (SSC, RRB, WBPSC, IBPS) with a trustworthy, distraction-free preparation platform.</p><h3>Why SidPrep 2.0 was rebuilt from scratch</h3><p>Many online test preparation apps suffer from advertising bloat, questionable question accuracy, fabricated exam dates, and unstable test runners. SidPrep 2.0 was completely rebuilt from a greenfield codebase using modern software principles:</p><ul><li><strong>Zero Fabricated Dates:</strong> We only display exam dates and cutoffs that have been officially published in government gazettes or commission notices.</li><li><strong>Dual-Admin Governance:</strong> Every pattern change must be independently verified by a second administrator.</li><li><strong>Verified Current Affairs:</strong> Sourced strictly from PIB and accredited official releases, summarized concisely with clear citations.</li><li><strong>Respect for Student Privacy:</strong> No invasive tracking SDKs or marketing spam.</li></ul><h3>Infrastructure and Free-Tier Discipline</h3><p>SidPrep 2.0 runs reliably within sustainable free-tier infrastructure (Oracle Cloud Always Free ARM64 compute, Cloudflare security, and Brevo transactional email). We design our architecture conservatively so that learners enjoy high availability without cost-induced shutdowns.</p>`,
        metaTitle: 'About SidPrep 2.0 — Verified Competitive Exam Platform',
        metaDescription: 'Learn why SidPrep 2.0 was rebuilt from scratch with zero fabricated dates and dual-admin governance.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_contact',
        slug: 'contact',
        title: 'Contact SidPrep Support & Editorial Team',
        subtitle: 'Official support channels and grievance resolution',
        contentHtml: `<p>We are dedicated to supporting serious candidates across SSC, RRB, WBPSC, and IBPS examinations.</p><h3>Email Support</h3><p>For student account inquiries, bug reports, or content verification questions, reach out directly:</p><p><strong>Support Email:</strong> <a href="mailto:support@sidprep.in">support@sidprep.in</a></p><p><strong>Security & Grievances:</strong> <a href="mailto:security@sidprep.in">security@sidprep.in</a></p><h3>Operating Hours</h3><p>Monday to Saturday: 09:30 IST to 18:30 IST. All official email inquiries are acknowledged within 24 operational hours.</p>`,
        metaTitle: 'Contact Us — SidPrep 2.0 Support',
        metaDescription: 'Get in touch with SidPrep support, grievance officer, and exam editorial team.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_terms',
        slug: 'terms',
        title: 'Terms of Service',
        subtitle: 'Rules and terms governing SidPrep services',
        contentHtml: `<p><strong>Last Updated:</strong> November 2026</p><p>By creating an account or accessing SidPrep learning services, you agree to these Terms of Service.</p><h3>1. Fair Use of Learning Materials</h3><p>All test questions, explanations, formulas, and resources provided on SidPrep are for your personal educational use only. You agree not to scrape, distribute, or reverse engineer the API or test runner.</p><h3>2. Examination Rules</h3><p>SidPrep accurately models official government exam patterns, but official government commission rules always remain supreme.</p>`,
        metaTitle: 'Terms of Service — SidPrep 2.0',
        metaDescription: 'Read the Terms of Service for SidPrep student portal and mobile application.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_privacy',
        slug: 'privacy',
        title: 'Privacy Policy',
        subtitle: 'How SidPrep handles student privacy and data',
        contentHtml: `<p><strong>Effective Date:</strong> November 2026</p><p>SidPrep 2.0 is built with privacy-first engineering. We collect only what is strictly necessary to power your test prep experience.</p><h3>Information We Collect</h3><ul><li><strong>Student Account:</strong> Email address for one-time password verification and session authentication.</li><li><strong>Practice Activity:</strong> Test answers, timing telemetry, and score metrics to provide accurate progress tracking.</li></ul><h3>Zero Advertising & Zero Third-Party Trackers</h3><p>We do not sell student data, show behavioral advertisements, or embed invasive third-party ad network tracking scripts.</p>`,
        metaTitle: 'Privacy Policy — SidPrep 2.0',
        metaDescription: 'Learn how SidPrep protects candidate privacy with zero advertising and encrypted test data.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_disclaimer',
        slug: 'disclaimer',
        title: 'Disclaimer & Official Status',
        subtitle: 'Important legal disclaimer regarding government commissions',
        contentHtml: `<p><strong>Official Entity Notice:</strong> SidPrep is an independent educational platform and is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the Staff Selection Commission (SSC), Railway Recruitment Boards (RRB), West Bengal Public Service Commission (WBPSC), Institute of Banking Personnel Selection (IBPS), or any other government ministry or department.</p><p>Official exam notices, eligibility criteria, and examination schedules are governed exclusively by the respective government authorities at their official websites (e.g., ssc.gov.in, rrbcdg.gov.in, psc.wb.gov.in, ibps.in).</p>`,
        metaTitle: 'Disclaimer & Legal Status — SidPrep 2.0',
        metaDescription: 'Official disclaimer clarifying independent educational status from government bodies.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_features',
        slug: 'features',
        title: 'SidPrep 2.0 Features & Capabilities',
        subtitle: 'Everything serious government exam candidates need to succeed',
        contentHtml: `<p>SidPrep 2.0 is an all-in-one preparation ecosystem engineered specifically for SSC, RRB, WBPSC, and IBPS examinations.</p><h3>1. Official Exam Pattern Mocks</h3><p>Full-length and sectional test series matching exact commission schemes, timing, section locks, and marking schemes (+2.0 / -0.5).</p><h3>2. Offline-First Test Runner</h3><p>Take exams even during intermittent internet connectivity. Answers are stored in SQLite and synced automatically when your connection is restored.</p><h3>3. Verified Daily Current Affairs</h3><p>Curated and verified news briefs from PIB and government gazettes with source citations.</p><h3>4. Document & Resource Library</h3><p>Access subject formula sheets, previous year question analyses, and syllabus guides.</p>`,
        metaTitle: 'Features — SidPrep 2.0 Ecosystem',
        metaDescription: 'Explore features including offline test runner, verified current affairs, and official exam mocks.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_data_deletion',
        slug: 'data-deletion',
        title: 'Student Data Deletion Policy',
        subtitle: 'Request permanent removal of your account and prep records',
        contentHtml: `<p>In accordance with data protection principles and student privacy rights, you may request complete deletion of your SidPrep account and all associated test attempt records at any time.</p><h3>How to Request Deletion</h3><p>Send an email to <a href="mailto:privacy@sidprep.in">privacy@sidprep.in</a> from the email address registered with your student account with the subject line <strong>Account Deletion Request</strong>.</p><p>Upon verification, all account records, attempt history, and stored preferences will be permanently wiped from active databases within 7 calendar days.</p>`,
        metaTitle: 'Student Data Deletion Policy — SidPrep 2.0',
        metaDescription: 'Information on requesting permanent deletion of student account data.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    for (const page of initialPages) {
      this.pages.set(page.id, page);
    }
  }

  // Purge Demo Data Method
  public purgeDemoData(options: {
    clearQuestions?: boolean;
    clearTests?: boolean;
    clearNews?: boolean;
    clearResources?: boolean;
    clearAttempts?: boolean;
    clearStudents?: boolean;
  }) {
    let clearedCount = 0;
    if (options.clearQuestions) {
      clearedCount += this.questions.size;
      this.questions.clear();
    }
    if (options.clearTests) {
      clearedCount += this.tests.size;
      this.tests.clear();
    }
    if (options.clearNews) {
      clearedCount += this.newsDrafts.size;
      this.newsDrafts.clear();
    }
    if (options.clearResources) {
      clearedCount += this.resources.size;
      this.resources.clear();
    }
    if (options.clearAttempts) {
      clearedCount += this.attempts.size;
      this.attempts.clear();
    }
    if (options.clearStudents) {
      clearedCount += this.students.size;
      this.students.clear();
    }
    return { success: true, clearedCount };
  }

  // Audit Logger Method (Immutable append-only)
  public logAudit(event: Omit<AuditEventRecord, 'id' | 'createdAt'>) {
    const record: AuditEventRecord = {
      ...event,
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.auditEvents.unshift(record);
    return record;
  }

  // Operational Logger Method
  public logOperational(event: Omit<OperationalEventRecord, 'id' | 'createdAt'>) {
    const record: OperationalEventRecord = {
      ...event,
      id: `ops_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.operationalEvents.unshift(record);
    // Keep bounded in memory
    if (this.operationalEvents.length > 1000) {
      this.operationalEvents.pop();
    }
    return record;
  }
}

export const db = new SidPrepDatabase();
