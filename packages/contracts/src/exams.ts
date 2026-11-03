import { z } from 'zod';

export const ExamBodyTypeSchema = z.enum(['SSC', 'RRB', 'WBPSC', 'IBPS']);
export type ExamBodyType = z.infer<typeof ExamBodyTypeSchema>;

export const ExamOfficialStatusSchema = z.enum([
  'NOTIFICATION_ANNOUNCED',
  'APPLICATION_OPEN',
  'APPLICATION_CLOSED',
  'ADMIT_CARD_RELEASED',
  'EXAM_SCHEDULED',
  'DATE_NOT_ANNOUNCED',
  'EXAM_CONCLUDED',
  'RESULTS_DECLARED'
]);
export type ExamOfficialStatus = z.infer<typeof ExamOfficialStatusSchema>;

export const ExamStageSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalQuestions: z.number().int().positive(),
  totalMarks: z.number().positive(),
  durationMinutes: z.number().int().positive().optional(), // If sectional timing is enforced
  negativeMarking: z.number().nonnegative(),
  isSectionLocked: z.boolean().default(false)
});
export type ExamStageSection = z.infer<typeof ExamStageSectionSchema>;

export const ExamStageSchema = z.object({
  id: z.string(),
  name: z.string(), // e.g. "Tier-I (Computer Based Exam)"
  stageNumber: z.number().int(),
  durationMinutes: z.number().int().positive(),
  totalQuestions: z.number().int().positive(),
  totalMarks: z.number().positive(),
  hasNegativeMarking: z.boolean(),
  negativeMarkRate: z.number().nonnegative(),
  hasSectionalTiming: z.boolean(),
  sections: z.array(ExamStageSectionSchema)
});
export type ExamStage = z.infer<typeof ExamStageSchema>;

export const ExamOfficialNoticeSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  publishedAt: z.string(),
  verifiedAt: z.string(),
  sourceUrl: z.string().url(),
  isOfficial: z.boolean(),
  documentUrl: z.string().url().optional()
});
export type ExamOfficialNotice = z.infer<typeof ExamOfficialNoticeSchema>;

export const SyllabusTopicSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    estimatedHours: z.number().optional(),
    weightagePercentage: z.number().optional(),
    subtopics: z.array(SyllabusTopicSchema).optional(),
    isBookmarked: z.boolean().default(false),
    completionPercentage: z.number().min(0).max(100).default(0)
  })
);
export type SyllabusTopic = {
  id: string;
  title: string;
  description?: string;
  estimatedHours?: number;
  weightagePercentage?: number;
  subtopics?: SyllabusTopic[];
  isBookmarked?: boolean;
  completionPercentage?: number;
};

export const ExamSummarySchema = z.object({
  id: z.string(),
  body: ExamBodyTypeSchema,
  code: z.string(), // e.g., 'SSC_CGL', 'RRB_NTPC', 'WBPSC_CLERKSHIP', 'IBPS_PO'
  title: z.string(),
  description: z.string(),
  iconName: z.string().optional(),
  currentStatus: ExamOfficialStatusSchema,
  officialExamDate: z.string().nullable().optional(), // ISO date only if officially announced
  isDateAnnounced: z.boolean(),
  verificationSourceUrl: z.string().url().nullable().optional(),
  lastVerifiedAt: z.string().nullable().optional(),
  stagesCount: z.number().int().positive(),
  availableTestsCount: z.number().int().default(0)
});
export type ExamSummary = z.infer<typeof ExamSummarySchema>;

export const ExamDetailSchema = ExamSummarySchema.extend({
  stages: z.array(ExamStageSchema),
  syllabusTree: z.array(SyllabusTopicSchema),
  latestNotices: z.array(ExamOfficialNoticeSchema)
});
export type ExamDetail = z.infer<typeof ExamDetailSchema>;

export const HomeDashboardResponseSchema = z.object({
  primaryExam: ExamSummarySchema.nullable(),
  selectedExams: z.array(ExamSummarySchema),
  dailyGoal: z.object({
    targetMinutes: z.number(),
    completedMinutes: z.number(),
    streakDays: z.number(),
    accuracyRate: z.number()
  }),
  activeAttempt: z.object({
    attemptId: z.string(),
    testId: z.string(),
    testTitle: z.string(),
    examTitle: z.string(),
    remainingSeconds: z.number(),
    startedAt: z.string()
  }).nullable(),
  todayTasksSummary: z.object({
    totalTasks: z.number(),
    completedTasks: z.number()
  }),
  recommendedTests: z.array(z.object({
    id: z.string(),
    title: z.string(),
    examTitle: z.string(),
    durationMinutes: z.number(),
    questionsCount: z.number(),
    type: z.enum(['FULL_LENGTH', 'SECTIONAL', 'TOPIC_PRACTICE', 'PYQ'])
  })),
  dailyAffairsCount: z.number()
});
export type HomeDashboardResponse = z.infer<typeof HomeDashboardResponseSchema>;
