import { z } from 'zod';
import { SupportedLanguageSchema } from './common.js';

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  phoneCountryCode: z.string().optional(),
  isPhoneVerified: z.boolean().default(false),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isSingleName: z.boolean().default(false),
  isProfileComplete: z.boolean().default(false),
  selectedExamIds: z.array(z.string()).default([]),
  targetExams: z.array(z.string()).optional(),
  primaryExamId: z.string().nullable().optional(),
  preferredLanguage: SupportedLanguageSchema.default('en'),
  dailyTargetMinutes: z.number().int().min(10).max(480).default(60),
  dailyGoalMinutes: z.number().int().min(10).max(480).optional(),
  streakDays: z.number().int().min(0).default(0),
  todayMinutesSpent: z.number().int().min(0).default(0),
  accuracyRate: z.number().min(0).max(100).default(0),
  testsCompletedCount: z.number().int().min(0).default(0),
  registrationIp: z.string().optional(),
  lastLoginIp: z.string().optional(),
  lastLoginAt: z.string().optional(),
  loginSource: z.enum(['app', 'web']).optional(),
  settings: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    textSizeScale: z.number().min(0.85).max(1.3).default(1.0),
    notificationExamAlerts: z.boolean().default(true),
    notificationCurrentAffairs: z.boolean().default(true),
    notificationStudyReminders: z.boolean().default(true),
    quietHoursStart: z.string().optional(),
    quietHoursEnd: z.string().optional()
  }).default({}),
  createdAt: z.string(),
  updatedAt: z.string().optional()
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UpdateProfileRequestSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isSingleName: z.boolean().optional(),
  phone: z.string().optional(),
  phoneCountryCode: z.string().optional(),
  selectedExamIds: z.array(z.string()).optional(),
  targetExams: z.array(z.string()).optional(),
  primaryExamId: z.string().optional(),
  preferredLanguage: SupportedLanguageSchema.optional(),
  dailyTargetMinutes: z.number().int().min(10).max(480).optional(),
  dailyGoalMinutes: z.number().int().min(10).max(480).optional(),
  settings: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    textSizeScale: z.number().min(0.85).max(1.3).optional(),
    notificationExamAlerts: z.boolean().optional(),
    notificationCurrentAffairs: z.boolean().optional(),
    notificationStudyReminders: z.boolean().optional(),
    quietHoursStart: z.string().optional(),
    quietHoursEnd: z.string().optional()
  }).optional()
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const DataExportResponseSchema = z.object({
  downloadUrl: z.string(),
  expiresAt: z.string(),
  fileSizeEstimate: z.string()
});
export type DataExportResponse = z.infer<typeof DataExportResponseSchema>;

export const DeleteAccountRequestSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT'),
  reason: z.string().optional()
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
