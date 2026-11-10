import { z } from 'zod';

export const StudentRegistrationDraftSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().trim().optional(),
  isSingleName: z.boolean().default(false),
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  phoneCountryCode: z.string().regex(/^\+[1-9]\d{0,3}$/, 'Valid country code required (e.g. +91)').default('+91'),
  phone: z.string().min(5, 'Valid phone number required').max(15).trim(),
  targetExamIds: z.array(z.string()).min(1, 'At least one target exam must be selected'),
  primaryExamId: z.string().min(1, 'Primary target exam is required'),
  preferredLanguage: z.enum(['en', 'hi', 'bn']).default('en'),
});
export type StudentRegistrationDraft = z.infer<typeof StudentRegistrationDraftSchema>;

export const RequestOtpRequestSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  phone: z.string().optional(),
  registrationDraft: StudentRegistrationDraftSchema.optional(),
});
export type RequestOtpRequest = z.infer<typeof RequestOtpRequestSchema>;

export const RequestOtpResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  expiresInSeconds: z.number(),
  resendAvailableInSeconds: z.number()
});
export type RequestOtpResponse = z.infer<typeof RequestOtpResponseSchema>;

export const VerifyOtpRequestSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6).trim(),
  registrationDraft: StudentRegistrationDraftSchema.optional(),
  deviceInfo: z.object({
    platform: z.enum(['android', 'ios', 'web']).optional(),
    deviceName: z.string().optional(),
    appVersion: z.string().optional()
  }).optional()
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number() // seconds
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const VerifyOtpResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
    isNewUser: z.boolean(),
    selectedExamIds: z.array(z.string()),
    primaryExamId: z.string().nullable().optional(),
    preferredLanguage: z.enum(['en', 'hi', 'bn'])
  }),
  tokens: AuthTokensSchema
});
export type VerifyOtpResponse = z.infer<typeof VerifyOtpResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string()
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  platform: z.string(),
  appVersion: z.string(),
  lastActiveAt: z.string(),
  isCurrentSession: z.boolean()
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
