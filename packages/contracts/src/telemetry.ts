import { z } from 'zod';

export const TelemetryEventCodeSchema = z.enum([
  'APP_STARTUP',
  'API_FAILURE',
  'SYNC_CONFLICT',
  'SYNC_SUCCESS',
  'TEST_STARTED',
  'TEST_COMPLETED',
  'FILE_PREVIEW_OPEN',
  'FILE_PREVIEW_FAILURE',
  'DOWNLOAD_STARTED',
  'DOWNLOAD_FAILED',
  'NOTIFICATION_RECEIVED',
  'NOTIFICATION_OPENED',
  'APP_CRASH'
]);
export type TelemetryEventCode = z.infer<typeof TelemetryEventCodeSchema>;

export const TelemetryEventSchema = z.object({
  eventId: z.string(),
  eventCode: TelemetryEventCodeSchema,
  anonymousUserId: z.string().optional(), // No PII
  appVersion: z.string(),
  osPlatform: z.enum(['android', 'ios', 'unknown']),
  osVersion: z.string().optional(),
  deviceModel: z.string().optional(),
  networkType: z.enum(['wifi', 'cellular', 'none', 'unknown']).default('unknown'),
  correlationId: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  // NOTE: Strict policy: Never include OTPs, JWTs, answers, passwords, or emails.
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const TelemetryBatchRequestSchema = z.object({
  events: z.array(TelemetryEventSchema)
});
export type TelemetryBatchRequest = z.infer<typeof TelemetryBatchRequestSchema>;

export const TelemetryBatchResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  serverTimestamp: z.string()
});
export type TelemetryBatchResponse = z.infer<typeof TelemetryBatchResponseSchema>;
