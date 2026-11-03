import { z } from 'zod';
import { SupportedLanguageSchema } from './common.js';

export const NewsCategorySchema = z.enum([
  'POLITY_GOVERNANCE',
  'ECONOMY_BANKING',
  'GOVERNMENT_SCHEMES',
  'SCIENCE_TECH',
  'ENVIRONMENT_ECOLOGY',
  'GEOGRAPHY',
  'HISTORY_CULTURE',
  'SPORTS',
  'AWARDS_HONORS',
  'INTERNATIONAL_AFFAIRS',
  'RAILWAYS_DEFENCE',
  'WEST_BENGAL_STATE',
  'NATIONAL'
]);
export type NewsCategory = z.infer<typeof NewsCategorySchema>;

export const CurrentAffairBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(), // Short original fact-checked summary
  category: NewsCategorySchema,
  categoryLabel: z.string(),
  applicableExams: z.array(z.string()), // ['SSC_CGL', 'RRB_NTPC', etc.]
  importanceLevel: z.enum(['HIGH', 'MEDIUM', 'NORMAL']).default('NORMAL'),
  publishedAt: z.string(), // ISO date
  sourceName: z.string(), // e.g. "PIB Delhi", "The Hindu (Official)", "RBI Gazette"
  sourceUrl: z.string().url(),
  verificationStatus: z.enum(['VERIFIED_OFFICIAL', 'EDITORIAL_APPROVED']),
  language: SupportedLanguageSchema,
  isLanguageFallback: z.boolean().default(false), // true if original requested translation is pending and showing English fallback
  isBookmarked: z.boolean().default(false),
  hasCorrection: z.boolean().default(false),
  correctionNote: z.string().optional(),
  revisionPointers: z.array(z.string()).optional(), // 1-3 bullet points for quick revision
  dailyQuizId: z.string().nullable().optional()
});
export type CurrentAffairBrief = z.infer<typeof CurrentAffairBriefSchema>;

export const DailyQuizQuestionSchema = z.object({
  id: z.string(),
  questionNumber: z.number().int().positive(),
  questionText: z.string(),
  options: z.array(z.object({
    id: z.string(),
    text: z.string()
  }))
});
export type DailyQuizQuestion = z.infer<typeof DailyQuizQuestionSchema>;

export const DailyQuizDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(), // YYYY-MM-DD
  questionsCount: z.number().int().positive(),
  durationMinutes: z.number().int().default(10),
  questions: z.array(DailyQuizQuestionSchema)
});
export type DailyQuizDetail = z.infer<typeof DailyQuizDetailSchema>;

export const DailyQuizResultSchema = z.object({
  quizId: z.string(),
  score: z.number(),
  totalQuestions: z.number(),
  answersReview: z.array(z.object({
    questionId: z.string(),
    userOptionId: z.string().nullable(),
    correctOptionId: z.string(),
    isCorrect: z.boolean(),
    explanation: z.string()
  }))
});
export type DailyQuizResult = z.infer<typeof DailyQuizResultSchema>;
