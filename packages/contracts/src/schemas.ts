import { z } from 'zod';
import { RequestOtpRequestSchema } from './auth.js';

export const AdminRoleEnum = z.enum([
  'SUPER_ADMIN',
  'CONTENT_MANAGER',
  'EXAM_EDITOR',
  'REVIEWER',
  'CA_EDITOR',
  'TRANSLATOR',
  'SUPPORT',
  'ANALYST',
  'AUDITOR',
]);
export type AdminRole = z.infer<typeof AdminRoleEnum>;

export const EditorialStatusEnum = z.enum([
  'FETCHED',
  'NORMALIZED',
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'REJECTED',
  'RETRACTED',
  'FAILED',
]);
export type EditorialStatus = z.infer<typeof EditorialStatusEnum>;

// Admin Auth Schemas
export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const AdminTotpVerifySchema = z.object({
  preAuthToken: z.string(),
  totpCode: z.string().regex(/^[0-9]{6}$/, 'TOTP code must be 6 digits'),
});

// Resource Create / Metadata
export const ResourceCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  exam: z.string(),
  subject: z.string(),
  fileType: z.enum(['PDF', 'DOCX', 'PNG', 'JPEG', 'WEBP']),
  fileSizeBytes: z.number().int().positive(),
  previewAllowed: z.boolean().default(true),
  downloadAllowed: z.boolean().default(false),
  offlineAllowed: z.boolean().default(false),
  licenseSource: z.string().default('Official / Open Education'),
});

// Aliases matching API module imports
export const StudentOtpChallengeSchema = RequestOtpRequestSchema;
export const StudentOtpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^[0-9]{6}$/, 'OTP must be 6 digits'),
});
export const TelemetryBatchSchema = z.object({
  appVersion: z.string(),
  os: z.enum(['android', 'ios']),
  events: z.array(
    z.object({
      eventCode: z.string(),
      timestamp: z.string(),
      correlationId: z.string(),
      metadata: z.record(z.any()).optional(),
    })
  ).max(50),
});
export const OfflineSyncBatchSchema = z.object({
  attemptId: z.string(),
  items: z.array(
    z.object({
      questionId: z.string(),
      selectedOptionId: z.string().nullable(),
      clientSequence: z.number().int().nonnegative(),
      isMarkedForReview: z.boolean().default(false),
      timestamp: z.string(),
    })
  ),
});
