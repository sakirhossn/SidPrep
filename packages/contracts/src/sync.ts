import { z } from 'zod';

export const AnswerSyncItemSchema = z.object({
  attemptId: z.string(),
  questionId: z.string(),
  selectedOptionId: z.string().nullable(),
  isMarkedForReview: z.boolean(),
  clientSequence: z.number().int().nonnegative(), // Monotonically increasing per attempt
  clientTimestamp: z.string(), // ISO string
  timeSpentSeconds: z.number().int().nonnegative()
});
export type AnswerSyncItem = z.infer<typeof AnswerSyncItemSchema>;

export const AnswerBatchSyncRequestSchema = z.object({
  attemptId: z.string(),
  answers: z.array(AnswerSyncItemSchema).optional(),
  items: z.array(AnswerSyncItemSchema).optional(),
});
export type AnswerBatchSyncRequest = z.infer<typeof AnswerBatchSyncRequestSchema>;

export const AnswerBatchSyncResponseSchema = z.object({
  success: z.boolean().default(true),
  syncedCount: z.number().int().nonnegative().optional(),
  syncedQuestionIds: z.array(z.string()).default([]),
  acknowledgedSequences: z.record(z.number()).optional(),
  serverTime: z.string().optional(),
  remainingSeconds: z.number().int().nonnegative().default(0),
  pendingSequence: z.number().int().default(0),
});
export type AnswerBatchSyncResponse = z.infer<typeof AnswerBatchSyncResponseSchema>;
