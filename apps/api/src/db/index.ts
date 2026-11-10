import { env } from '../config/index.js';
import { generateTotpSecret, hashPassword } from '../lib/security.js';
import { runMigrations } from './migrate.js';
import { StudentRepository } from './repositories/students.js';
import { AdminUserRepository } from './repositories/adminUsers.js';
import { ExamRepository } from './repositories/exams.js';
import { QuestionRepository } from './repositories/questions.js';
import { TestRepository } from './repositories/tests.js';
import { AttemptRepository, PersistentAnswersMap } from './repositories/attempts.js';
import { NewsSourceRepository, NewsDraftRepository } from './repositories/news.js';
import { ResourceRepository } from './repositories/resources.js';
import { PageRepository } from './repositories/pages.js';
import { AuditEventRepository, OperationalEventRepository, AppTelemetryRepository } from './repositories/logs.js';
import { JobRepository } from './repositories/jobs.js';
import { OtpChallengeRepository } from './repositories/otp.js';
import { ExamProposalRepository } from './repositories/examProposals.js';
import { query } from './pool.js';

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
  tokenVersion?: number;
  isDemo?: boolean;
  completedTasks?: string[];
  settings?: Record<string, any>;
  createdAt: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'CONTENT_MANAGER' | 'EXAM_EDITOR' | 'REVIEWER' | 'CA_EDITOR' | 'TRANSLATOR' | 'SUPPORT' | 'ANALYST' | 'AUDITOR';
  totpSecret: string;
  pendingTotpSecret?: string;
  is2faEnabled: boolean;
  isActive: boolean;
  tokenVersion?: number;
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
  version?: number;
  lastVerifiedBy?: string;
  isActive?: boolean;
  body?: string;
}

export interface ExamProposalRecord {
  id: string;
  proposalId: string;
  examId: string;
  proposedByAdminId: string;
  proposedByEmail: string;
  diff: any;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  verifiedByAdminId?: string;
  verifiedAt?: string;
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
  isDemo?: boolean;
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
  isDemo?: boolean;
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
  expiresAt?: string;
  submittedAt?: string;
  durationSeconds: number;
  score: number;
  maxScore: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  answers: PersistentAnswersMap | any;
  resultSnapshot?: any;
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
  isDemo?: boolean;
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
  isDemo?: boolean;
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
 * Official SidPrep PostgreSQL Database Layer
 * All entities are backed by PostgreSQL repositories executing real SQL queries.
 */
export class SidPrepDatabase {
  public students = new StudentRepository();
  public adminUsers = new AdminUserRepository();
  public otpChallenges = new OtpChallengeRepository();
  public exams = new ExamRepository();
  public questions = new QuestionRepository();
  public tests = new TestRepository();
  public attempts = new AttemptRepository();
  public newsSources = new NewsSourceRepository();
  public newsDrafts = new NewsDraftRepository();
  public resources = new ResourceRepository();
  public pages = new PageRepository();
  public auditEvents = new AuditEventRepository();
  public operationalEvents = new OperationalEventRepository();
  public appTelemetry = new AppTelemetryRepository();
  public jobs = new JobRepository();
  public examProposals = new ExamProposalRepository();

  public getPendingExamProposal(examId: string): ExamProposalRecord | undefined {
    return Array.from(this.examProposals.values())
      .reverse()
      .find((p) => p.examId === examId && p.status === 'PENDING');
  }

  public appVersion: AppVersionRecord = {
    currentVersion: '2.0.1',
    minVersion: '2.0.0',
    apkUrl: 'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk',
    releaseNotes: 'SidPrep 2.0.1: Full exam preparation features, Brevo OTP integration, dynamic page CMS, and offline-aware test runner.',
    publishedAt: new Date().toISOString(),
  };

  public async setAppVersion(newVersion: Partial<AppVersionRecord>): Promise<AppVersionRecord> {
    this.appVersion = { ...this.appVersion, ...newVersion, publishedAt: new Date().toISOString() };
    try {
      await query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        ['app_version', JSON.stringify(this.appVersion)]
      );
    } catch (err: any) {
      console.error('[SidPrepDatabase] Failed to persist app_version to app_settings:', err.message);
    }
    return this.appVersion;
  }

  public brevoSendsToday = 0;
  private isInitialized = false;

  /**
   * Helper: Get current calendar date in Asia/Kolkata (YYYY-MM-DD)
   */
  public getTodayIst(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: env.NEWS_TIMEZONE || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  }

  /**
   * Get durable email quota usage for current day from PostgreSQL
   */
  public async getEmailQuotaUsage(provider: string = 'brevo'): Promise<{
    usedToday: number;
    limit: number;
    remaining: number;
    dateIst: string;
  }> {
    const dateIst = this.getTodayIst();
    const limit = env.BREVO_DAILY_QUOTA_LIMIT || 300;

    try {
      const res = await query(
        `SELECT sent_count, cap_limit FROM email_quota_ledger WHERE provider = $1 AND date_ist = $2`,
        [provider, dateIst]
      );
      if (res.rows.length > 0) {
        const used = Number(res.rows[0].sent_count) || 0;
        const cap = Number(res.rows[0].cap_limit) || limit;
        this.brevoSendsToday = used;
        return { usedToday: used, limit: cap, remaining: Math.max(0, cap - used), dateIst };
      }
    } catch (err: any) {
      console.warn('[SidPrepDatabase] Could not query email_quota_ledger from PostgreSQL:', err.message);
    }

    return {
      usedToday: this.brevoSendsToday,
      limit,
      remaining: Math.max(0, limit - this.brevoSendsToday),
      dateIst,
    };
  }

  /**
   * Atomically reserve quota before sending email.
   * If priority OTP, allows emergency headroom up to limit + 50.
   */
  public async reserveEmailQuota(
    provider: string = 'brevo',
    isPriorityOtp: boolean = false
  ): Promise<{ allowed: boolean; usedToday: number; remaining: number; reason?: string }> {
    const dateIst = this.getTodayIst();
    const limit = env.BREVO_DAILY_QUOTA_LIMIT || 300;
    const quotaId = `quota_${provider}_${dateIst}`;

    try {
      // Atomic upsert and increment in PostgreSQL
      const res = await query(
        `INSERT INTO email_quota_ledger (id, provider, date_ist, sent_count, cap_limit, updated_at)
         VALUES ($1, $2, $3, 1, $4, NOW())
         ON CONFLICT (provider, date_ist) DO UPDATE
         SET sent_count = email_quota_ledger.sent_count + 1, updated_at = NOW()
         RETURNING sent_count, cap_limit`,
        [quotaId, provider, dateIst, limit]
      );

      if (res.rows.length > 0) {
        const newUsed = Number(res.rows[0].sent_count);
        const cap = Number(res.rows[0].cap_limit);
        this.brevoSendsToday = newUsed;

        // If exceeded cap
        if (newUsed > cap) {
          if (!isPriorityOtp) {
            // Roll back increment for non-priority sends
            await query(
              `UPDATE email_quota_ledger SET sent_count = sent_count - 1 WHERE id = $1`,
              [quotaId]
            );
            this.brevoSendsToday = newUsed - 1;
            return {
              allowed: false,
              usedToday: newUsed - 1,
              remaining: 0,
              reason: 'DAILY_QUOTA_EXHAUSTED',
            };
          }
          // Priority OTPs are allowed with emergency headroom up to cap + 50
          if (newUsed > cap + 50) {
            return {
              allowed: false,
              usedToday: newUsed,
              remaining: 0,
              reason: 'EMERGENCY_QUOTA_EXHAUSTED',
            };
          }
        }

        return {
          allowed: true,
          usedToday: newUsed,
          remaining: Math.max(0, cap - newUsed),
        };
      }
    } catch (err: any) {
      console.warn('[SidPrepDatabase] PostgreSQL quota reservation failed, falling back to local counter:', err.message);
    }

    // Local fallback
    this.brevoSendsToday++;
    if (this.brevoSendsToday > limit && !isPriorityOtp) {
      this.brevoSendsToday--;
      return { allowed: false, usedToday: this.brevoSendsToday, remaining: 0, reason: 'DAILY_QUOTA_EXHAUSTED' };
    }
    return { allowed: true, usedToday: this.brevoSendsToday, remaining: Math.max(0, limit - this.brevoSendsToday) };
  }

  public async flush(): Promise<void> {
    await Promise.all([
      this.students.flush(),
      this.adminUsers.flush(),
      this.exams.flush(),
      this.questions.flush(),
      this.tests.flush(),
      this.attempts.flush(),
      this.newsSources.flush(),
      this.newsDrafts.flush(),
      this.resources.flush(),
      this.pages.flush(),
      this.otpChallenges.flush(),
      this.examProposals.flush(),
    ]);
  }

  constructor() {
    this.seedLocalInitialData();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await runMigrations();
      await Promise.all([
        this.students.loadFromDb(),
        this.adminUsers.loadFromDb(),
        this.exams.loadFromDb(),
        this.questions.loadFromDb(),
        this.tests.loadFromDb(),
        this.attempts.loadFromDb(),
        this.newsSources.loadFromDb(),
        this.newsDrafts.loadFromDb(),
        this.resources.loadFromDb(),
        this.pages.loadFromDb(),
        this.auditEvents.loadFromDb(),
        this.operationalEvents.loadFromDb(),
        this.appTelemetry.loadFromDb(),
        this.jobs.loadFromDb(),
        this.otpChallenges.loadFromDb(),
        this.examProposals.loadFromDb(),
      ]);

      // Load app_settings for appVersion
      try {
        const settingsRes = await query<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key = $1', ['app_version']);
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].value) {
          const parsed = typeof settingsRes.rows[0].value === 'string' ? JSON.parse(settingsRes.rows[0].value) : settingsRes.rows[0].value;
          this.appVersion = { ...this.appVersion, ...parsed };
        }
      } catch {
        // Table may not exist yet or query failed in unit test mock
      }

      if (this.exams.size === 0 || (process.env.NODE_ENV === 'test' && this.tests.size === 0)) {
        await this.persistInitialData();
      }
      if (process.env.NODE_ENV === 'test') {
        await this.seedTestAdminUsers();
      }

      // Sanitize legacy insecure hardcoded TOTP secrets in persisted database
      for (const admin of this.adminUsers.values()) {
        if (admin.totpSecret === 'JBSWY3DPEHPK3PXP') {
          admin.totpSecret = generateTotpSecret();
          await this.adminUsers.set(admin.id, admin);
        }
      }

      this.isInitialized = true;
    } catch (err: any) {
      console.error('[SidPrepDatabase] Init error:', err?.message || err);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`[SidPrepDatabase] Fatal initialization error in production mode: ${err?.message || err}`);
      }
    }
  }

  public seedLocalInitialData() {
        // 2. Seed Official Exams locally
    this.exams.setLocal('ssc-cgl', {
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

    this.exams.setLocal('rrb-ntpc', {
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

    // 3. Seed Demo Questions locally
    this.questions.setLocal('q_1', {
      id: 'q_1',
      topicId: 'Indian Polity & Constitution',
      difficulty: 'EASY',
      pyqYear: 2024,
      pyqExam: 'SSC CGL Tier-1',
      pyqShift: 'Shift 2',
      correctOptionId: 'opt_b',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'Under which Article of the Constitution of India is the Right to Equality before Law guaranteed?',
          explanation: 'Article 14 guarantees equality before the law and the equal protection of the laws within the territory of India.',
          options: [
            { id: 'opt_a', text: 'Article 19' },
            { id: 'opt_b', text: 'Article 14' },
            { id: 'opt_c', text: 'Article 21' },
            { id: 'opt_d', text: 'Article 32' },
          ],
        },
      ],
    });

    this.questions.setLocal('q_2', {
      id: 'q_2',
      topicId: 'Arithmetic',
      difficulty: 'MEDIUM',
      pyqYear: 2023,
      pyqExam: 'SSC CGL Tier-1',
      pyqShift: 'Shift 1',
      correctOptionId: 'opt_c',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'A train 240 m in length crosses a telegraph post in 16 seconds. What is the speed of the train in km/h?',
          explanation: 'Speed = Distance / Time = 240 / 16 = 15 m/s. In km/h = 15 * (18 / 5) = 54 km/h.',
          options: [
            { id: 'opt_a', text: '48 km/h' },
            { id: 'opt_b', text: '60 km/h' },
            { id: 'opt_c', text: '54 km/h' },
            { id: 'opt_d', text: '72 km/h' },
          ],
        },
      ],
    });

    // 4. Seed Tests locally
    this.tests.setLocal('test_cgl_full_01', {
      id: 'test_cgl_full_01',
      examCode: 'SSC_CGL',
      title: 'SSC CGL Tier-1 Full Mock Test #01 (2026 Scheme)',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 2,
      totalMarks: 4.0,
      isFree: true,
      isPublished: true,
      instructions: [
        'Each question carries 2.0 marks for correct answer.',
        'There is a penalty of 0.50 marks for each incorrect response.',
        'Total duration is 60 minutes with auto-submission.',
      ],
      sections: [
        {
          id: 'sec_cgl_ga',
          title: 'General Awareness & Reasoning',
          questionCount: 2,
          durationMinutes: 30,
          sectionLock: false,
          questions: [
            { questionId: 'q_1', positiveMarks: 2.0, negativeMarks: 0.5 },
            { questionId: 'q_2', positiveMarks: 2.0, negativeMarks: 0.5 },
          ],
        },
      ],
    });

    // 5. Seed News Sources locally
    this.newsSources.setLocal('pib-india', {
      id: 'pib-india',
      name: 'Press Information Bureau (PIB) Government of India',
      feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
      isEnabled: true,
    });

    // 6. Seed News Drafts locally
    this.newsDrafts.setLocal('draft_01', {
      id: 'draft_01',
      candidateId: 'cand_101',
      title: 'Cabinet Approves National Green Hydrogen Mission Implementation Directives',
      originalSummary: 'The Union Cabinet chaired by the Prime Minister has approved operational modalities for standard incentives under the National Green Hydrogen Mission to achieve 5 MMT production by 2030.',
      category: 'Economy & National Policy',
      targetExams: ['SSC_CGL', 'RRB_NTPC', 'UPSC_CSE'],
      keyFacts: [
        'Target production: 5 MMT per annum by 2030',
        'Overseen by Ministry of New and Renewable Energy (MNRE)',
        'Strategic Intervention for Green Hydrogen Transition (SIGHT) programme allocation',
      ],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=1987654',
      confidenceScore: 0.98,
      editorialStatus: 'PUBLISHED',
      approvedBy: 'adm_1',
      approvalMode: 'MANUAL',
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 7. Seed Resources locally
    this.resources.setLocal('res_ssc_math_formula', {
      id: 'res_ssc_math_formula',
      title: 'SSC CGL Advanced Mathematics Formula Pocket Handbook',
      description: 'Comprehensive algebra, geometry, trigonometry, and coordinate geometry theorems verified for SSC CGL 2026.',
      exam: 'SSC_CGL',
      subject: 'Quantitative Aptitude',
      fileType: 'PDF',
      fileSizeBytes: 2457600,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storagePath: 'resources/ssc/ssc_cgl_math_handbook_2026.pdf',
      previewAllowed: true,
      downloadAllowed: true,
      offlineAllowed: true,
      previewContent: '<div class="formula-preview"><h3>Algebraic Identities</h3><p>(a + b)^2 = a^2 + 2ab + b^2</p></div>',
      licenseSource: 'SidPrep Academic Editorial Team',
      isPublished: true,
      verifiedDate: '2026-09-01',
    });

    this.resources.setLocal('res_rrb_science_notes', {
      id: 'res_rrb_science_notes',
      title: 'RRB NTPC General Science Essential Revision Sheet',
      description: 'Physics, Chemistry, and Life Sciences key principles and units.',
      exam: 'RRB_NTPC',
      subject: 'General Awareness',
      fileType: 'DOCX',
      fileSizeBytes: 1843200,
      sha256Hash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      storagePath: 'resources/rrb/rrb_general_science_notes.docx',
      previewAllowed: true,
      downloadAllowed: false,
      offlineAllowed: false,
      previewContent: '<div class="science-preview"><h3>Physical Constants & Units</h3><p>Speed of light: 3x10^8 m/s</p></div>',
      licenseSource: 'SidPrep Academic Editorial Team',
      isPublished: true,
      verifiedDate: '2026-08-25',
    });

    // 8. Seed CMS Pages locally
    const initialPages: PageRecord[] = [
      {
        id: 'page_about',
        slug: 'about',
        title: 'About SidPrep 2.0',
        subtitle: 'Free, open, and high-performance exam preparation for Indian aspirants',
        contentHtml: `<p>SidPrep 2.0 is an independent, non-profit aligned exam preparation platform engineered to deliver authoritative mock examinations, syllabus breakdowns, and verified daily current affairs for India's major public recruitment exams including SSC, RRB, WBPSC, and IBPS.</p><h3>Our Mission</h3><p>To eliminate financial barriers to government exam preparation by providing every aspirant with authentic, commission-pattern tests and real-time study tracking without predatory subscription paywalls.</p>`,
        metaTitle: 'About SidPrep 2.0 — Open Government Exam Preparation',
        metaDescription: 'Learn about SidPrep 2.0 mission, editorial independence, and exam coverage.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_contact',
        slug: 'contact',
        title: 'Contact Us',
        subtitle: 'Get in touch with the SidPrep academic and support team',
        contentHtml: `<p>We welcome questions, feedback, bug reports, and academic corrections from students and educators.</p>`,
        metaTitle: 'Contact SidPrep 2.0 — Support & Feedback',
        metaDescription: 'Reach the SidPrep team for student support, academic questions, or feedback.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_terms',
        slug: 'terms',
        title: 'Terms of Service',
        subtitle: 'Guidelines and rules for using the SidPrep 2.0 ecosystem',
        contentHtml: `<p>By accessing or using the SidPrep website, mobile application, or mock test runner, you agree to comply with and be bound by these Terms of Service.</p>`,
        metaTitle: 'Terms of Service — SidPrep 2.0',
        metaDescription: 'Terms and conditions governing the use of SidPrep 2.0 website and apps.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_privacy',
        slug: 'privacy',
        title: 'Privacy Policy',
        subtitle: 'How we collect, store, and protect your information',
        contentHtml: `<p>Your privacy is paramount. SidPrep collects minimal student data required to deliver account functionality and offline test synchronization.</p>`,
        metaTitle: 'Privacy Policy — SidPrep 2.0',
        metaDescription: 'Read how SidPrep 2.0 protects user privacy and secures student prep records.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_disclaimer',
        slug: 'disclaimer',
        title: 'Official Disclaimer',
        subtitle: 'SidPrep 2.0 is an independent educational platform',
        contentHtml: `<p><strong>SidPrep 2.0 is NOT affiliated with, authorized by, endorsed by, or in any way officially connected with the Staff Selection Commission (SSC), Railway Recruitment Boards (RRB), West Bengal Public Service Commission (WBPSC), Institute of Banking Personnel Selection (IBPS), or any other government ministry or agency.</strong></p>`,
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
        contentHtml: `<p>SidPrep 2.0 is an all-in-one preparation ecosystem engineered specifically for SSC, RRB, WBPSC, and IBPS examinations.</p>`,
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
        contentHtml: `<p>In accordance with data protection principles and student privacy rights, you may request complete deletion of your SidPrep account and all associated test attempt records at any time.</p>`,
        metaTitle: 'Student Data Deletion Policy — SidPrep 2.0',
        metaDescription: 'Information on requesting permanent deletion of student account data.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    for (const page of initialPages) {
      this.pages.setLocal(page.id, page);
    }
  }

  public async seedTestAdminUsers() {
    const testPassword = 'AdminSecurePass123!';
    const testHash = await hashPassword(testPassword);
    await this.adminUsers.set('adm_owner', {
      id: 'adm_owner',
      email: 'sksakirhossain8@gmail.com',
      name: 'Sk Sakir Hossain',
      passwordHash: testHash,
      role: 'SUPER_ADMIN',
      totpSecret: generateTotpSecret(),
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
    await this.adminUsers.set('adm_1', {
      id: 'adm_1',
      email: 'admin@sidprep.in',
      name: 'Super Admin',
      passwordHash: testHash,
      role: 'SUPER_ADMIN',
      totpSecret: generateTotpSecret(),
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
    await this.adminUsers.set('adm_2', {
      id: 'adm_2',
      email: 'editor@sidprep.in',
      name: 'Exam & Content Editor',
      passwordHash: testHash,
      role: 'EXAM_EDITOR',
      totpSecret: generateTotpSecret(),
      is2faEnabled: true,
      isActive: true,
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    });
  }

  public async persistInitialData() {
    await this.seedInitialData();
  }

  public async seedInitialData() {
        // 2. Seed Official Exams
    await this.exams.set('ssc-cgl', {
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

    await this.exams.set('rrb-ntpc', {
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

    // 3. Seed Demo Questions
    await this.questions.set('q_1', {
      id: 'q_1',
      topicId: 'Indian Polity & Constitution',
      difficulty: 'EASY',
      pyqYear: 2024,
      pyqExam: 'SSC CGL Tier-1',
      pyqShift: 'Shift 2',
      correctOptionId: 'opt_b',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'Under which Article of the Constitution of India is the Right to Equality before Law guaranteed?',
          explanation: 'Article 14 guarantees equality before the law and the equal protection of the laws within the territory of India.',
          options: [
            { id: 'opt_a', text: 'Article 19' },
            { id: 'opt_b', text: 'Article 14' },
            { id: 'opt_c', text: 'Article 21' },
            { id: 'opt_d', text: 'Article 32' },
          ],
        },
        {
          language: 'hi',
          text: 'भारतीय संविधान के किस अनुच्छेद के तहत कानून के समक्ष समानता की गारंटी दी गई है?',
          explanation: 'अनुच्छेद 14 कानून के समक्ष समानता और भारत के क्षेत्र में कानूनों के समान संरक्षण की गारंटी देता है।',
          options: [
            { id: 'opt_a', text: 'अनुच्छेद 19' },
            { id: 'opt_b', text: 'अनुच्छेद 14' },
            { id: 'opt_c', text: 'अनुच्छेद 21' },
            { id: 'opt_d', text: 'अनुच्छेद 32' },
          ],
        },
        {
          language: 'bn',
          text: 'ভারতের সংবিধানের কোন অনুচ্ছেদের অধীনে আইনের দৃষ্টিতে সমতার নিশ্চয়তা দেওয়া হয়েছে?',
          explanation: 'ধারা ১৪ ভারতের ভূখণ্ডে আইনের দৃষ্টিতে সমতা এবং আইনের সমান সুরক্ষার নিশ্চয়তা দেয়।',
          options: [
            { id: 'opt_a', text: 'অনুচ্ছেদ ১৯' },
            { id: 'opt_b', text: 'অনুচ্ছেদ ১৪' },
            { id: 'opt_c', text: 'অনুচ্ছেদ ২১' },
            { id: 'opt_d', text: 'অনুচ্ছেদ ৩২' },
          ],
        },
      ],
    });

    await this.questions.set('q_2', {
      id: 'q_2',
      topicId: 'Arithmetic',
      difficulty: 'MEDIUM',
      pyqYear: 2023,
      pyqExam: 'SSC CGL Tier-1',
      pyqShift: 'Shift 1',
      correctOptionId: 'opt_c',
      createdBy: 'adm_1',
      status: 'PUBLISHED',
      translations: [
        {
          language: 'en',
          text: 'A train 240 m in length crosses a telegraph post in 16 seconds. What is the speed of the train in km/h?',
          explanation: 'Speed = Distance / Time = 240 / 16 = 15 m/s. In km/h = 15 * (18 / 5) = 54 km/h.',
          options: [
            { id: 'opt_a', text: '48 km/h' },
            { id: 'opt_b', text: '60 km/h' },
            { id: 'opt_c', text: '54 km/h' },
            { id: 'opt_d', text: '72 km/h' },
          ],
        },
        {
          language: 'hi',
          text: '240 मीटर लंबी एक ट्रेन 16 सेकंड में एक टेलीग्राफ पोस्ट को पार करती है। ट्रेन की गति किमी/घंटा में क्या है?',
          explanation: 'गति = दूरी / समय = 240 / 16 = 15 मीटर/सेकंड। किमी/घंटा में = 15 * (18 / 5) = 54 किमी/घंटा।',
          options: [
            { id: 'opt_a', text: '48 किमी/घंटा' },
            { id: 'opt_b', text: '60 किमी/घंटा' },
            { id: 'opt_c', text: '54 किमी/घंटा' },
            { id: 'opt_d', text: '72 किमी/घंटा' },
          ],
        },
      ],
    });

    // 4. Seed Tests
    await this.tests.set('test_cgl_full_01', {
      id: 'test_cgl_full_01',
      examCode: 'SSC_CGL',
      title: 'SSC CGL Tier-1 Full Mock Test #01 (2026 Scheme)',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 2,
      totalMarks: 4.0,
      isFree: true,
      isPublished: true,
      instructions: [
        'Each question carries 2.0 marks for correct answer.',
        'There is a penalty of 0.50 marks for each incorrect response.',
        'Total duration is 60 minutes with auto-submission.',
      ],
      sections: [
        {
          id: 'sec_cgl_ga',
          title: 'General Awareness & Reasoning',
          questionCount: 2,
          durationMinutes: 30,
          sectionLock: false,
          questions: [
            { questionId: 'q_1', positiveMarks: 2.0, negativeMarks: 0.5 },
            { questionId: 'q_2', positiveMarks: 2.0, negativeMarks: 0.5 },
          ],
        },
      ],
    });

    // 5. Seed News Sources
    await this.newsSources.set('pib-india', {
      id: 'pib-india',
      name: 'Press Information Bureau (PIB) Government of India',
      feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
      isEnabled: true,
    });

    // 6. Seed News Drafts
    await this.newsDrafts.set('draft_01', {
      id: 'draft_01',
      candidateId: 'cand_101',
      title: 'Cabinet Approves National Green Hydrogen Mission Implementation Directives',
      originalSummary: 'The Union Cabinet chaired by the Prime Minister has approved operational modalities for standard incentives under the National Green Hydrogen Mission to achieve 5 MMT production by 2030.',
      category: 'Economy & National Policy',
      targetExams: ['SSC_CGL', 'RRB_NTPC', 'UPSC_CSE'],
      keyFacts: [
        'Target production: 5 MMT per annum by 2030',
        'Overseen by Ministry of New and Renewable Energy (MNRE)',
        'Strategic Intervention for Green Hydrogen Transition (SIGHT) programme allocation',
      ],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=1987654',
      confidenceScore: 0.98,
      editorialStatus: 'PUBLISHED',
      approvedBy: 'adm_1',
      approvalMode: 'MANUAL',
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 7. Seed Resources
    await this.resources.set('res_ssc_math_formula', {
      id: 'res_ssc_math_formula',
      title: 'SSC CGL Advanced Mathematics Formula Pocket Handbook',
      description: 'Comprehensive algebra, geometry, trigonometry, and coordinate geometry theorems verified for SSC CGL 2026.',
      exam: 'SSC_CGL',
      subject: 'Quantitative Aptitude',
      fileType: 'PDF',
      fileSizeBytes: 2457600,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      storagePath: 'resources/ssc/ssc_cgl_math_handbook_2026.pdf',
      previewAllowed: true,
      downloadAllowed: true,
      offlineAllowed: true,
      previewContent: '<div class="formula-preview"><h3>Algebraic Identities</h3><p>(a + b)^2 = a^2 + 2ab + b^2</p><p>a^3 + b^3 + c^3 - 3abc = (a+b+c)(a^2+b^2+c^2-ab-bc-ca)</p></div>',
      licenseSource: 'SidPrep Academic Editorial Team',
      isPublished: true,
      verifiedDate: '2026-09-01',
    });

    await this.resources.set('res_rrb_science_notes', {
      id: 'res_rrb_science_notes',
      title: 'RRB NTPC General Science Essential Revision Sheet',
      description: 'Physics, Chemistry, and Life Sciences key principles and units.',
      exam: 'RRB_NTPC',
      subject: 'General Awareness',
      fileType: 'DOCX',
      fileSizeBytes: 1843200,
      sha256Hash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      storagePath: 'resources/rrb/rrb_general_science_notes.pdf',
      previewAllowed: true,
      downloadAllowed: false,
      offlineAllowed: false,
      previewContent: '<div class="science-preview"><h3>Physical Constants & Units</h3><p>Speed of light: 3x10^8 m/s</p><p>Gravitational constant G: 6.674x10^-11 N m^2/kg^2</p></div>',
      licenseSource: 'SidPrep Academic Editorial Team',
      isPublished: true,
      verifiedDate: '2026-08-25',
    });

    // 8. Seed CMS Pages
    const initialPages: PageRecord[] = [
      {
        id: 'page_about',
        slug: 'about',
        title: 'About SidPrep 2.0',
        subtitle: 'Free, open, and high-performance exam preparation for Indian aspirants',
        contentHtml: `<p>SidPrep 2.0 is an independent, non-profit aligned exam preparation platform engineered to deliver authoritative mock examinations, syllabus breakdowns, and verified daily current affairs for India's major public recruitment exams including SSC, RRB, WBPSC, and IBPS.</p><h3>Our Mission</h3><p>To eliminate financial barriers to government exam preparation by providing every aspirant with authentic, commission-pattern tests and real-time study tracking without predatory subscription paywalls.</p>`,
        metaTitle: 'About SidPrep 2.0 — Open Government Exam Preparation',
        metaDescription: 'Learn about SidPrep 2.0 mission, editorial independence, and exam coverage.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_contact',
        slug: 'contact',
        title: 'Contact Us',
        subtitle: 'Get in touch with the SidPrep academic and support team',
        contentHtml: `<p>We welcome questions, feedback, bug reports, and academic corrections from students and educators.</p><h3>Support Channels</h3><p><strong>General Inquiries:</strong> <a href="mailto:support@sidprep.in">support@sidprep.in</a></p><p><strong>Editorial & Question Corrections:</strong> <a href="mailto:editorial@sidprep.in">editorial@sidprep.in</a></p><p><strong>Privacy & Legal:</strong> <a href="mailto:privacy@sidprep.in">privacy@sidprep.in</a></p>`,
        metaTitle: 'Contact SidPrep 2.0 — Support & Feedback',
        metaDescription: 'Reach the SidPrep team for student support, academic questions, or feedback.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_terms',
        slug: 'terms',
        title: 'Terms of Service',
        subtitle: 'Guidelines and rules for using the SidPrep 2.0 ecosystem',
        contentHtml: `<p>By accessing or using the SidPrep website, mobile application, or mock test runner, you agree to comply with and be bound by these Terms of Service.</p><h3>Educational Purpose</h3><p>SidPrep 2.0 is an independent educational prep platform. Mock exams, test series, and syllabus guides are created for preparatory practice only.</p>`,
        metaTitle: 'Terms of Service — SidPrep 2.0',
        metaDescription: 'Terms and conditions governing the use of SidPrep 2.0 website and apps.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_privacy',
        slug: 'privacy',
        title: 'Privacy Policy',
        subtitle: 'How we collect, store, and protect your information',
        contentHtml: `<p>Your privacy is paramount. SidPrep collects minimal student data required to deliver account functionality and offline test synchronization.</p><h3>Information We Collect</h3><ul><li>Email address (for authentication and password recovery)</li><li>Test attempt scores and timing telemetry</li><li>Device platform (Android/Web) for update delivery</li></ul>`,
        metaTitle: 'Privacy Policy — SidPrep 2.0',
        metaDescription: 'Read how SidPrep 2.0 protects user privacy and secures student prep records.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'page_disclaimer',
        slug: 'disclaimer',
        title: 'Official Disclaimer',
        subtitle: 'SidPrep 2.0 is an independent educational platform',
        contentHtml: `<p><strong>SidPrep 2.0 is NOT affiliated with, authorized by, endorsed by, or in any way officially connected with the Staff Selection Commission (SSC), Railway Recruitment Boards (RRB), West Bengal Public Service Commission (WBPSC), Institute of Banking Personnel Selection (IBPS), or any other government ministry or agency.</strong></p>`,
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
        contentHtml: `<p>SidPrep 2.0 is an all-in-one preparation ecosystem engineered specifically for SSC, RRB, WBPSC, and IBPS examinations.</p>`,
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
        contentHtml: `<p>In accordance with data protection principles and student privacy rights, you may request complete deletion of your SidPrep account and all associated test attempt records at any time.</p>`,
        metaTitle: 'Student Data Deletion Policy — SidPrep 2.0',
        metaDescription: 'Information on requesting permanent deletion of student account data.',
        isPublished: true,
        isSystem: true,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    for (const page of initialPages) {
      await this.pages.set(page.id, page);
    }
  }

  // Purge Demo Data Method backed by real SQL deletions
  public async purgeDemoData(options: {
    clearQuestions?: boolean;
    clearTests?: boolean;
    clearNews?: boolean;
    clearResources?: boolean;
    clearAttempts?: boolean;
    clearStudents?: boolean;
  }): Promise<{ success: boolean; clearedCount: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Broad table purge is strictly forbidden in production mode.');
    }

    let clearedCount = 0;
    if (options.clearQuestions) {
      const demoQIds = Array.from(this.questions.values())
        .filter((q: any) => q.isDemo || q.id === 'q_1' || q.id === 'q_2' || q.id.startsWith('demo_'))
        .map((q) => q.id);
      for (const id of demoQIds) {
        await this.questions.delete(id);
        clearedCount++;
      }
    }
    if (options.clearTests) {
      const demoTestIds = Array.from(this.tests.values())
        .filter((t: any) => t.isDemo || t.id === 'test_cgl_full_01' || t.id.startsWith('demo_'))
        .map((t) => t.id);
      for (const id of demoTestIds) {
        await this.tests.delete(id);
        clearedCount++;
      }
    }
    if (options.clearNews) {
      const demoDraftIds = Array.from(this.newsDrafts.values())
        .filter((d: any) => d.isDemo || d.id === 'draft_01' || d.id.startsWith('demo_'))
        .map((d) => d.id);
      for (const id of demoDraftIds) {
        await this.newsDrafts.delete(id);
        clearedCount++;
      }
    }
    if (options.clearResources) {
      const demoResIds = Array.from(this.resources.values())
        .filter((r: any) => r.isDemo || r.id === 'res_ssc_math_formula' || r.id === 'res_rrb_science_notes' || r.id.startsWith('demo_'))
        .map((r) => r.id);
      for (const id of demoResIds) {
        await this.resources.delete(id);
        clearedCount++;
      }
    }
    if (options.clearAttempts) {
      const demoAttemptIds = Array.from(this.attempts.values())
        .filter((a: any) => a.isDemo || a.id.startsWith('att_demo_') || a.id.startsWith('demo_'))
        .map((a) => a.id);
      for (const id of demoAttemptIds) {
        await this.attempts.delete(id);
        clearedCount++;
      }
    }
    if (options.clearStudents) {
      const demoStudentIds = Array.from(this.students.values())
        .filter((s: any) => s.isDemo || s.id.startsWith('stu_demo_') || s.id.startsWith('demo_'))
        .map((s) => s.id);
      for (const id of demoStudentIds) {
        await this.students.delete(id);
        clearedCount++;
      }
    }
    return { success: true, clearedCount };
  }

  // Audit Logger Method (Immutable append-only backed by audit_events table)
  public logAudit(event: Omit<AuditEventRecord, 'id' | 'createdAt'>) {
    const record: AuditEventRecord = {
      ...event,
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.auditEvents.unshift(record);
    return record;
  }

  // Operational Logger Method backed by operational_events table
  public logOperational(event: Omit<OperationalEventRecord, 'id' | 'createdAt'>) {
    const record: OperationalEventRecord = {
      ...event,
      id: `ops_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.operationalEvents.unshift(record);
    return record;
  }
}

export const db = new SidPrepDatabase();
