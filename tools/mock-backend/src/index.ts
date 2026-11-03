import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  ExamDetail,
  HomeDashboardResponse,
  TestItem,
  StartAttemptResponse,
  AttemptResult,
  CurrentAffairBrief,
  DailyStudyPlanResponse,
  ResourceItem,
  TelemetryBatchResponse
} from '@sidprep/contracts';

export function createMockApp(): FastifyInstance {
  const app = fastify({ logger: false });

  app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  });

  const mockExams: ExamDetail[] = [
    {
      id: 'ssc-cgl',
      body: 'SSC',
      code: 'SSC_CGL',
      title: 'SSC Combined Graduate Level (CGL) 2026',
      description: 'Premier national competitive exam for Group B & C posts in Ministries and Departments of Government of India.',
      currentStatus: 'EXAM_SCHEDULED',
      officialExamDate: '2026-09-15T09:00:00Z',
      isDateAnnounced: true,
      verificationSourceUrl: 'https://ssc.gov.in/notices/cgl-2026-schedule',
      lastVerifiedAt: '2026-03-01T10:00:00Z',
      stagesCount: 2,
      availableTestsCount: 24,
      stages: [
        {
          id: 'tier-1',
          name: 'Tier-I (Computer Based Examination)',
          stageNumber: 1,
          durationMinutes: 60,
          totalQuestions: 100,
          totalMarks: 200,
          hasNegativeMarking: true,
          negativeMarkRate: 0.5,
          hasSectionalTiming: false,
          sections: [
            { id: 's1', name: 'General Intelligence and Reasoning', totalQuestions: 25, totalMarks: 50, negativeMarking: 0.5, isSectionLocked: false },
            { id: 's2', name: 'General Awareness', totalQuestions: 25, totalMarks: 50, negativeMarking: 0.5, isSectionLocked: false },
            { id: 's3', name: 'Quantitative Aptitude', totalQuestions: 25, totalMarks: 50, negativeMarking: 0.5, isSectionLocked: false },
            { id: 's4', name: 'English Comprehension', totalQuestions: 25, totalMarks: 50, negativeMarking: 0.5, isSectionLocked: false }
          ]
        }
      ],
      syllabusTree: [
        {
          id: 'quant',
          title: 'Quantitative Aptitude',
          estimatedHours: 40,
          weightagePercentage: 25,
          completionPercentage: 65,
          subtopics: [
            { id: 'arithmetic', title: 'Arithmetic & Number Systems', estimatedHours: 15, completionPercentage: 80 },
            { id: 'algebra', title: 'Algebra & Geometry', estimatedHours: 15, completionPercentage: 50 }
          ]
        }
      ],
      latestNotices: [
        {
          id: 'not-01',
          title: 'Official Notification: Revised Normalization Formula for CGL 2026',
          summary: 'Staff Selection Commission publishes verified normalization formula details for multi-shift Tier-1.',
          publishedAt: '2026-02-28T05:30:00Z',
          verifiedAt: '2026-03-01T10:00:00Z',
          sourceUrl: 'https://ssc.gov.in/files/notice-normalization-2026.pdf',
          isOfficial: true
        }
      ]
    },
    {
      id: 'rrb-ntpc',
      body: 'RRB',
      code: 'RRB_NTPC',
      title: 'RRB Non-Technical Popular Categories (NTPC)',
      description: 'Recruitment for Station Master, Goods Guard, Senior Clerk, and Commercial Apprentice.',
      currentStatus: 'DATE_NOT_ANNOUNCED',
      officialExamDate: null,
      isDateAnnounced: false,
      verificationSourceUrl: 'https://indianrailways.gov.in/rrb-notices',
      lastVerifiedAt: '2026-02-20T12:00:00Z',
      stagesCount: 2,
      availableTestsCount: 18,
      stages: [],
      syllabusTree: [],
      latestNotices: []
    },
    {
      id: 'wbpsc-clerkship',
      body: 'WBPSC',
      code: 'WBPSC_CLERKSHIP',
      title: 'WBPSC Clerkship Examination',
      description: 'State civil recruitment for administrative clerks across West Bengal directorates and secretariats.',
      currentStatus: 'EXAM_SCHEDULED',
      officialExamDate: '2026-11-20T10:00:00Z',
      isDateAnnounced: true,
      verificationSourceUrl: 'https://psc.wb.gov.in/announcements',
      lastVerifiedAt: '2026-03-02T15:00:00Z',
      stagesCount: 2,
      availableTestsCount: 12,
      stages: [],
      syllabusTree: [],
      latestNotices: []
    }
  ];

  const mockTests: TestItem[] = [
    {
      id: 'cgl-mock-01',
      examId: 'ssc-cgl',
      examTitle: 'SSC CGL 2026',
      stageId: 'tier-1',
      stageName: 'Tier-I',
      title: 'SSC CGL Tier-I Full Length All-India Live Mock 01',
      description: 'Exact exam simulation based on latest verified SSC CGL pattern.',
      type: 'FULL_LENGTH',
      difficulty: 'EXAM_LEVEL',
      languages: ['en', 'hi'],
      totalQuestions: 100,
      totalMarks: 200,
      durationMinutes: 60,
      isFree: true,
      isLocked: false,
      sections: [
        { id: 's1', name: 'General Intelligence & Reasoning', questionsCount: 25, totalMarks: 50, negativeMarkRate: 0.5, isLocked: false }
      ],
      attemptsCount: 1420
    }
  ];

  const mockResources: ResourceItem[] = [
    {
      id: 'res-quant-formula',
      title: 'SSC CGL Complete Arithmetic & Algebra Formula Sheet (Handwritten & Verified)',
      description: 'High-yield formula book covering percentage, profit & loss, algebra expansions, and cyclic quadrilaterals.',
      fileType: 'PDF',
      fileSizeBytes: 2450000,
      fileSizeFormatted: '2.4 MB',
      pageCount: 32,
      language: 'en',
      examId: 'ssc-cgl',
      examTitle: 'SSC CGL',
      subjectName: 'Quantitative Aptitude',
      uploadedAt: '2026-02-15T10:00:00Z',
      sourceAttribution: 'SidPrep Editorial Council',
      previewAllowed: true,
      downloadAllowed: true,
      offlineAllowed: true,
      isOfflineCached: false,
      previewUrl: 'https://api.sidprep.in/v1/resources/res-quant-formula/preview'
    },
    {
      id: 'res-rrb-ga-compendium',
      title: 'Railway General Awareness 2026 Monthly Compendium (Preview Only)',
      description: 'Internal reference document for upcoming CBT-1 test takers.',
      fileType: 'DOCX',
      fileSizeBytes: 4100000,
      fileSizeFormatted: '4.1 MB',
      pageCount: 45,
      language: 'en',
      examId: 'rrb-ntpc',
      examTitle: 'RRB NTPC',
      subjectName: 'General Awareness',
      uploadedAt: '2026-02-28T14:00:00Z',
      sourceAttribution: 'Indian Railways Gazetteers Review',
      previewAllowed: true,
      downloadAllowed: false,
      offlineAllowed: false,
      isOfflineCached: false,
      previewUrl: 'https://api.sidprep.in/v1/resources/res-rrb-ga-compendium/preview'
    }
  ];

  const attemptsStore = new Map<string, {
    attemptId: string;
    testId: string;
    startedAt: string;
    expiresAt: string;
    answers: Map<string, { selectedOptionId: string | null; isMarkedForReview: boolean; sequence: number }>;
  }>();

  // Auth Endpoints
  app.post('/v1/auth/otp/request', async (req, reply) => {
    const body = req.body as { email?: string };
    if (!body.email) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Valid email is required' });
    }
    return {
      success: true,
      message: 'OTP sent to registered email via Brevo',
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60
    };
  });

  app.post('/v1/auth/otp/verify', async (req, reply) => {
    const body = req.body as { email?: string; otp?: string };
    if (!body.email || body.otp !== '123456') {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired OTP' });
    }
    return {
      user: {
        id: 'usr_student_01',
        email: body.email,
        phone: null,
        isNewUser: false,
        selectedExamIds: ['ssc-cgl'],
        primaryExamId: 'ssc-cgl',
        preferredLanguage: 'en'
      },
      tokens: {
        accessToken: 'jwt_mock_access_token_sidprep',
        refreshToken: 'jwt_mock_refresh_token_sidprep',
        expiresIn: 3600
      }
    };
  });

  app.post('/v1/auth/refresh', async () => {
    return {
      accessToken: 'jwt_mock_access_token_sidprep_refreshed',
      refreshToken: 'jwt_mock_refresh_token_sidprep',
      expiresIn: 3600
    };
  });

  app.get('/v1/me', async () => {
    return {
      id: 'usr_student_01',
      email: 'student@example.com',
      name: 'SidPrep Aspirant',
      selectedExamIds: ['ssc-cgl'],
      primaryExamId: 'ssc-cgl',
      preferredLanguage: 'en',
      dailyTargetMinutes: 60,
      streakDays: 4,
      todayMinutesSpent: 35,
      accuracyRate: 78.5,
      testsCompletedCount: 6,
      settings: {
        theme: 'system',
        textSizeScale: 1.0,
        notificationExamAlerts: true,
        notificationCurrentAffairs: true,
        notificationStudyReminders: true
      },
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };
  });

  app.get('/v1/exams', async () => {
    return mockExams.map(e => ({
      id: e.id,
      body: e.body,
      code: e.code,
      title: e.title,
      description: e.description,
      currentStatus: e.currentStatus,
      officialExamDate: e.officialExamDate,
      isDateAnnounced: e.isDateAnnounced,
      verificationSourceUrl: e.verificationSourceUrl,
      lastVerifiedAt: e.lastVerifiedAt,
      stagesCount: e.stagesCount,
      availableTestsCount: e.availableTestsCount
    }));
  });

  app.get('/v1/tests', async () => {
    return {
      items: mockTests,
      total: mockTests.length,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasMore: false
    };
  });

  app.post('/v1/tests/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const attemptId = `att_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const questions = [
      {
        id: 'q1',
        sectionId: 's1',
        sectionName: 'General Intelligence',
        questionNumber: 1,
        language: 'en' as const,
        text: 'GATE : HZSD :: DOOR : ?',
        hasMath: false,
        options: [
          { id: 'opt_1a', text: 'EPPQ' },
          { id: 'opt_1b', text: 'ENNS' }
        ],
        marks: 2.0,
        negativeMarks: 0.5
      },
      {
        id: 'q2',
        sectionId: 's1',
        sectionName: 'General Intelligence',
        questionNumber: 2,
        language: 'en' as const,
        text: 'If x + 1/x = 5, what is x^3 + 1/x^3?',
        hasMath: true,
        options: [
          { id: 'opt_2a', text: '110' },
          { id: 'opt_2b', text: '125' }
        ],
        marks: 2.0,
        negativeMarks: 0.5
      }
    ];

    attemptsStore.set(attemptId, {
      attemptId,
      testId: id,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      answers: new Map()
    });

    const response: StartAttemptResponse = {
      attemptId,
      testId: id,
      startedAt: now.toISOString(),
      serverTime: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      durationSeconds: 3600,
      sections: [{ id: 's1', name: 'General Intelligence', questionsCount: 2, totalMarks: 4, negativeMarkRate: 0.5, isLocked: false }],
      questions,
      savedAnswers: []
    };
    return response;
  });

  app.post('/v1/sync/answers', async (req) => {
    const body = req.body as {
      attemptId: string;
      answers: Array<{ questionId: string; selectedOptionId: string | null; isMarkedForReview: boolean; clientSequence: number }>;
    };
    const attempt = attemptsStore.get(body.attemptId);
    if (attempt) {
      for (const a of body.answers) {
        attempt.answers.set(a.questionId, {
          selectedOptionId: a.selectedOptionId,
          isMarkedForReview: a.isMarkedForReview,
          sequence: a.clientSequence
        });
      }
    }
    return {
      syncedQuestionIds: body.answers.map(a => a.questionId),
      serverTime: new Date().toISOString(),
      remainingSeconds: 3500
    };
  });

  app.post('/v1/attempts/:id/submit', async (req) => {
    const { id } = req.params as { id: string };
    const attempt = attemptsStore.get(id);

    const solutions = [
      {
        questionId: 'q1',
        correctOptionId: 'opt_1b',
        userSelectedOptionId: attempt?.answers.get('q1')?.selectedOptionId ?? null,
        isCorrect: (attempt?.answers.get('q1')?.selectedOptionId === 'opt_1b'),
        marksAwarded: 2.0,
        explanation: 'Shift pattern produces ENNS.',
        topicName: 'Alphabet Analogy',
        subjectName: 'Reasoning'
      },
      {
        questionId: 'q2',
        correctOptionId: 'opt_2a',
        userSelectedOptionId: attempt?.answers.get('q2')?.selectedOptionId ?? null,
        isCorrect: (attempt?.answers.get('q2')?.selectedOptionId === 'opt_2a'),
        marksAwarded: 2.0,
        explanation: 'Formula gives 110.',
        topicName: 'Algebraic Identities',
        subjectName: 'Quantitative'
      }
    ];

    const result: AttemptResult = {
      attemptId: id,
      testId: attempt?.testId ?? 'cgl-mock-01',
      testTitle: 'SSC CGL Tier-I Full Length All-India Live Mock 01',
      examTitle: 'SSC CGL 2026',
      submittedAt: new Date().toISOString(),
      totalScore: 4.0,
      maxMarks: 4.0,
      overallAccuracy: 100,
      totalTimeSpentSeconds: 75,
      totalQuestions: 2,
      correctCount: 2,
      incorrectCount: 0,
      unattemptedCount: 0,
      percentile: 95.5,
      rank: 42,
      totalTestTakers: 1420,
      isSampleSufficientForRank: true,
      sections: [],
      solutions,
      weakTopics: []
    };
    return result;
  });

  app.get('/v1/resources', async () => {
    return {
      items: mockResources,
      total: mockResources.length,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasMore: false
    };
  });

  app.post('/v1/resources/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string };
    const resItem = mockResources.find(r => r.id === id);
    if (!resItem) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Resource not found' });
    }
    if (!resItem.downloadAllowed) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Download permission denied for this document by admin policy. Preview only allowed in app.'
      });
    }
    return {
      downloadUrl: `https://api.sidprep.in/v1/downloads/signed/${id}?token=mock_signed_ticket_15m`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      fileName: `${id}.pdf`,
      mimeType: 'application/pdf',
      checksumSha256: 'mock_checksum'
    };
  });

  app.post('/v1/telemetry', async (req) => {
    const body = req.body as { events?: any[] };
    return {
      acceptedCount: body.events?.length ?? 0,
      serverTimestamp: new Date().toISOString()
    };
  });

  return app;
}

export async function startServer(port = 4000) {
  const app = createMockApp();
  await app.listen({ port, host: '127.0.0.1' });
  return app;
}

if (process.argv[1]?.includes('mock-backend') && process.env['NODE_ENV'] !== 'test') {
  startServer().then(() => {
    console.log('SidPrep Mock API Server running at http://127.0.0.1:4000/v1');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
