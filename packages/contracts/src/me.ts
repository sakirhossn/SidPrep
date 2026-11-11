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
  name: z.string().max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  isSingleName: z.boolean().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format. Must be 10-15 digits.').optional(),
  phoneCountryCode: z.string().regex(/^\+[1-9]\d{0,3}$/, 'Invalid country code format (e.g. +91)').optional(),
  selectedExamIds: z.array(z.string().min(1)).min(1, 'At least one target exam must be selected').optional(),
  targetExams: z.array(z.string().min(1)).min(1, 'At least one target exam must be selected').optional(),
  primaryExamId: z.string().min(1).optional(),
  preferredLanguage: SupportedLanguageSchema.optional(),
  dailyTargetMinutes: z.number().int().min(15, 'Minimum daily target is 15 minutes').max(720, 'Maximum daily target is 720 minutes').optional(),
  dailyGoalMinutes: z.number().int().min(15, 'Minimum daily target is 15 minutes').max(720, 'Maximum daily target is 720 minutes').optional(),
  avatarUrl: z.string().optional(),
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

export const EmailChangeRequestSchema = z.object({
  newEmail: z.string().email('Valid new email address is required'),
});
export type EmailChangeRequest = z.infer<typeof EmailChangeRequestSchema>;

export const EmailChangeVerifySchema = z.object({
  newEmail: z.string().email('Valid new email address is required'),
  otp: z.string().length(6, 'Verification code must be exactly 6 digits'),
});
export type EmailChangeVerify = z.infer<typeof EmailChangeVerifySchema>;

export const SupportAttachmentSchema = z.object({
  filename: z.string().max(255),
  fileType: z.enum(['PDF', 'JPEG', 'PNG', 'WEBP']),
  fileSizeBytes: z.number().max(5 * 1024 * 1024, 'Attachment cannot exceed 5 MB'),
  fileBase64: z.string().optional(),
  storageKey: z.string().optional(),
  downloadUrl: z.string().optional(),
});
export type SupportAttachment = z.infer<typeof SupportAttachmentSchema>;

export const CreateSupportConversationSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200),
  category: z.string().min(2, 'Category is required').max(100),
  message: z.string().min(1, 'Initial message cannot be empty').max(5000),
  attachments: z.array(SupportAttachmentSchema).max(3, 'Maximum 3 attachments per message').optional(),
});
export type CreateSupportConversation = z.infer<typeof CreateSupportConversationSchema>;

export const AddSupportMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000),
  attachments: z.array(SupportAttachmentSchema).max(3, 'Maximum 3 attachments per message').optional(),
  isInternalNote: z.boolean().optional(),
});
export type AddSupportMessage = z.infer<typeof AddSupportMessageSchema>;

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
