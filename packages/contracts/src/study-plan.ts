import { z } from 'zod';

export const StudyTaskTypeSchema = z.enum([
  'TOPIC_STUDY',
  'CURRENT_AFFAIRS_QUIZ',
  'SECTIONAL_MOCK',
  'REVISION',
  'FORMULA_PRACTICE'
]);
export type StudyTaskType = z.infer<typeof StudyTaskTypeSchema>;

export const StudyTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  type: StudyTaskTypeSchema,
  estimatedMinutes: z.number().int().positive(),
  isCompleted: z.boolean().default(false),
  completedAt: z.string().nullable().optional(),
  isMissed: z.boolean().default(false),
  subjectName: z.string().optional(),
  topicName: z.string().optional(),
  actionRoute: z.string().optional() // e.g. "/mock/123", "/quiz/today", "/resources/456"
});
export type StudyTask = z.infer<typeof StudyTaskSchema>;

export const DailyStudyPlanResponseSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  dayStreak: z.number().int().nonnegative(),
  targetMinutes: z.number().int().positive(),
  completedMinutes: z.number().int().nonnegative(),
  tasks: z.array(StudyTaskSchema),
  missedTasksCount: z.number().int().default(0),
  weakTopicRecommendations: z.array(z.object({
    topicId: z.string(),
    topicName: z.string(),
    reason: z.string(),
    suggestedAction: z.string()
  }))
});
export type DailyStudyPlanResponse = z.infer<typeof DailyStudyPlanResponseSchema>;

export const ToggleStudyTaskRequestSchema = z.object({
  taskId: z.string(),
  isCompleted: z.boolean()
});
export type ToggleStudyTaskRequest = z.infer<typeof ToggleStudyTaskRequestSchema>;
