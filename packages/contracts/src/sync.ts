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
  answers: z.array(AnswerSyncItemSchema)
});
export type AnswerBatchSyncRequest = z.infer<typeof AnswerBatchSyncRequestSchema>;

export const AnswerBatchSyncResponseSchema = z.object({
  syncedQuestionIds: z.array(z.string()),
  serverTime: z.string(),
  remainingSeconds: z.number().int().nonnegative()
});
export type AnswerBatchSyncResponse = z.infer<typeof AnswerBatchSyncResponseSchema>;
