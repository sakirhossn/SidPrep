import { z } from 'zod';
import { SupportedLanguageSchema } from './common.js';

export const TestTypeSchema = z.enum(['FULL_LENGTH', 'SECTIONAL', 'TOPIC_PRACTICE', 'PYQ']);
export type TestType = z.infer<typeof TestTypeSchema>;

export const TestDifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD', 'EXAM_LEVEL']);
export type TestDifficulty = z.infer<typeof TestDifficultySchema>;

export const QuestionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  imageUrl: z.string().url().optional()
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionContentSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  sectionName: z.string().optional().default('General'),
  questionNumber: z.number().int().positive().optional(),
  sequence: z.number().int().positive().optional(),
  language: SupportedLanguageSchema.default('en'),
  text: z.string(), // supports Markdown and LaTeX formulas, e.g. $E=mc^2$ or \frac{a}{b}
  hasMath: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
  options: z.array(QuestionOptionSchema),
  marks: z.number().positive().optional(),
  positiveMarks: z.number().positive().optional(),
  negativeMarks: z.number().nonnegative()
  // NOTE: Correct answer and solution MUST NOT be here before submission!
});
export type QuestionContent = z.infer<typeof QuestionContentSchema>;

export const TestSectionInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  durationMinutes: z.number().int().optional(),
  isLocked: z.boolean().default(false),
  sectionLock: z.boolean().optional(),
  questionsCount: z.number().int().positive().optional(),
  questionCount: z.number().int().positive().optional(),
  totalMarks: z.number().positive().default(0),
  negativeMarkRate: z.number().nonnegative().optional().default(0)
});
export type TestSectionInfo = z.infer<typeof TestSectionInfoSchema>;

export const TestItemSchema = z.object({
  id: z.string(),
  examId: z.string(),
  examTitle: z.string(),
  stageId: z.string(),
  stageName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  type: TestTypeSchema,
  difficulty: TestDifficultySchema,
  languages: z.array(SupportedLanguageSchema),
  totalQuestions: z.number().int().positive(),
  totalMarks: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  isFree: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  pyqYear: z.number().int().optional(),
  pyqShift: z.string().optional(),
  sections: z.array(TestSectionInfoSchema),
  attemptsCount: z.number().int().default(0),
  userLastAttempt: z.object({
    attemptId: z.string(),
    score: z.number(),
    completedAt: z.string()
  }).nullable().optional()
});
export type TestItem = z.infer<typeof TestItemSchema>;

export const StartAttemptResponseSchema = z.object({
  attemptId: z.string(),
  testId: z.string(),
  startedAt: z.string(), // Server authoritative ISO start time
  serverTime: z.string().optional(), // Server authoritative current time
  expiresAt: z.string().optional(), // Server authoritative ISO expiry time
  durationSeconds: z.number().int().positive(),
  sections: z.array(TestSectionInfoSchema).default([]),
  questions: z.array(QuestionContentSchema).default([]),
  // Existing saved answers if resuming
  savedAnswers: z.array(z.object({
    questionId: z.string(),
    selectedOptionId: z.string().nullable(),
    isMarkedForReview: z.boolean().default(false),
    clientSequence: z.number().int().default(0)
  })).default([])
});
export type StartAttemptResponse = z.infer<typeof StartAttemptResponseSchema>;

export const SubmitAttemptRequestSchema = z.object({
  attemptId: z.string(),
  timeSpentSeconds: z.number().int().nonnegative(),
  answers: z.array(z.object({
    questionId: z.string(),
    selectedOptionId: z.string().nullable(),
    isMarkedForReview: z.boolean().default(false),
    timeSpentSeconds: z.number().nonnegative().default(0),
    clientSequence: z.number().int().default(0)
  }))
});
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>;

export const QuestionSolutionSchema = z.object({
  questionId: z.string(),
  correctOptionId: z.string(),
  userSelectedOptionId: z.string().nullable().optional(),
  isCorrect: z.boolean(),
  marksAwarded: z.number(),
  explanation: z.string(), // Detailed step-by-step solution
  explanationImageUrl: z.string().url().optional(),
  topicName: z.string().optional().default('General'),
  subjectName: z.string().optional().default('General'),
  averageTimeSpentSeconds: z.number().optional()
});
export type QuestionSolution = z.infer<typeof QuestionSolutionSchema>;

export const AttemptSectionResultSchema = z.object({
  sectionId: z.string(),
  sectionName: z.string(),
  totalQuestions: z.number().int(),
  attemptedQuestions: z.number().int(),
  correctCount: z.number().int(),
  incorrectCount: z.number().int(),
  unattemptedCount: z.number().int(),
  marksObtained: z.number(),
  maxMarks: z.number(),
  accuracyPercentage: z.number().min(0).max(100),
  timeSpentSeconds: z.number().int()
});
export type AttemptSectionResult = z.infer<typeof AttemptSectionResultSchema>;

export const AttemptResultSchema = z.object({
  attemptId: z.string(),
  testId: z.string(),
  testTitle: z.string().default('Mock Test'),
  examTitle: z.string().default('Exam'),
  submittedAt: z.string(),
  totalScore: z.number(),
  score: z.number().optional(),
  maxMarks: z.number(),
  maxScore: z.number().optional(),
  overallAccuracy: z.number().min(0).max(100),
  accuracy: z.number().optional(),
  totalTimeSpentSeconds: z.number().int(),
  timeSpentSeconds: z.number().int().optional(),
  totalQuestions: z.number().int(),
  correctCount: z.number().int(),
  incorrectCount: z.number().int(),
  wrongCount: z.number().int().optional(),
  unattemptedCount: z.number().int(),
  
  // Rank & Percentile: Strictly verified sample-size dependent!
  // Prompt 1: "verified rank/percentile with sample size when available... Don't invent ranks or comparison groups."
  percentile: z.number().nullable().default(null),
  rank: z.number().nullable().default(null),
  totalTestTakers: z.number().nullable().default(null),
  isSampleSufficientForRank: z.boolean().default(false),
  rankNote: z.string().optional(),
  
  sections: z.array(AttemptSectionResultSchema).default([]),
  solutions: z.array(QuestionSolutionSchema).default([]),
  weakTopics: z.array(z.object({
    topicId: z.string(),
    topicName: z.string(),
    incorrectCount: z.number(),
    recommendedStudyUrl: z.string().optional()
  })).default([])
});
export type AttemptResult = z.infer<typeof AttemptResultSchema>;
