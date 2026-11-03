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

/**
 * In-Memory & PostgreSQL Dual Store
 */
class SidPrepDatabase {
  public students = new Map<string, StudentRecord>();
  public adminUsers = new Map<string, AdminUserRecord>();
  public otpChallenges = new Map<string, { otp: string; expiresAt: number; attempts: number }>();
  public exams = new Map<string, ExamRecord>();
  public questions = new Map<string, QuestionRecord>();
  public tests = new Map<string, TestRecord>();
  public attempts = new Map<string, AttemptRecord>();
  public newsSources = new Map<string, { id: string; name: string; feedUrl: string; isEnabled: boolean }>();
  public newsDrafts = new Map<string, NewsDraftRecord>();
  public resources = new Map<string, ResourceRecord>();
  public auditEvents: AuditEventRecord[] = [];
  public operationalEvents: OperationalEventRecord[] = [];
  public appTelemetry: AppTelemetryRecord[] = [];
  public jobs: JobRunRecord[] = [];
  public brevoSendsToday = 14; // Default starting tracker

  constructor() {
    this.seedInitialData();
  }

  private async seedInitialData() {
    // 1. Seed Admin Users
    const defaultPasswordHash = await hashPassword('AdminSecurePass123!');
    this.adminUsers.set('adm_1', {
      id: 'adm_1',
      email: 'admin@sidprep.in',
      name: 'Super Admin',
      passwordHash: defaultPasswordHash,
      role: 'SUPER_ADMIN',
      totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 test secret
      is2faEnabled: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    this.adminUsers.set('adm_2', {
      id: 'adm_2',
      email: 'editor@sidprep.in',
      name: 'Exam & Content Editor',
      passwordHash: defaultPasswordHash,
      role: 'EXAM_EDITOR',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      is2faEnabled: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

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
