import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validatePasswordPolicy,
  estimatePasswordStrength,
  type PasswordPolicyCriteria,
  type PasswordPolicyResult,
  type PasswordStrengthResult,
} from './passwordPolicy.js';

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validatePasswordPolicy,
  estimatePasswordStrength,
  type PasswordPolicyCriteria,
  type PasswordPolicyResult,
  type PasswordStrengthResult,
};

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

export const OtpPurposeEnum = z.enum([
  'student_registration',
  'admin_login',
  'student_recovery',
  'email_change',
]);
export type OtpPurpose = z.infer<typeof OtpPurposeEnum>;

export const RequestOtpRequestSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  phone: z.string().optional(),
  purpose: OtpPurposeEnum.default('student_registration').optional(),
  registrationDraft: StudentRegistrationDraftSchema.optional(),
});
export type RequestOtpRequest = z.infer<typeof RequestOtpRequestSchema>;

export const RequestOtpResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  maskedEmail: z.string().optional(),
  reused: z.boolean().optional(),
  expiresInSeconds: z.number(),
  resendAvailableInSeconds: z.number(),
  remainingAttempts: z.number().optional(),
  challengeId: z.string().optional(),
  devOtpHint: z.string().optional(),
});
export type RequestOtpResponse = z.infer<typeof RequestOtpResponseSchema>;

export const VerifyOtpRequestSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6).trim(),
  purpose: OtpPurposeEnum.default('student_registration').optional(),
  registrationDraft: StudentRegistrationDraftSchema.optional(),
  deviceInfo: z.object({
    platform: z.enum(['android', 'ios', 'web']).optional(),
    deviceName: z.string().optional(),
    appVersion: z.string().optional(),
  }).optional(),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
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
    preferredLanguage: z.enum(['en', 'hi', 'bn']),
  }).optional(),
  tokens: AuthTokensSchema.optional(),
  verificationGrant: z.string().optional(),
  verified: z.boolean().optional(),
  message: z.string().optional(),
});
export type VerifyOtpResponse = z.infer<typeof VerifyOtpResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  platform: z.string(),
  appVersion: z.string(),
  lastActiveAt: z.string(),
  isCurrentSession: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

// Password Login Schema for Students
export const StudentPasswordLoginSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  deviceInfo: z.object({
    platform: z.enum(['android', 'ios', 'web']).optional(),
    deviceName: z.string().optional(),
    appVersion: z.string().optional(),
  }).optional(),
});
export type StudentPasswordLogin = z.infer<typeof StudentPasswordLoginSchema>;

// Student Registration with Verified Grant & Password Policy
export const StudentPasswordRegisterSchema = z.object({
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().trim().optional(),
  isSingleName: z.boolean().default(false),
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  phoneCountryCode: z.string().regex(/^\+[1-9]\d{0,3}$/, 'Valid country code required (e.g. +91)').default('+91'),
  phone: z.string().min(5, 'Valid phone number required').max(15).trim(),
  targetExamIds: z.array(z.string()).min(1, 'At least one target exam must be selected'),
  primaryExamId: z.string().min(1, 'Primary target exam is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(14, 'Password cannot exceed 14 characters'),
  verificationGrant: z.string().min(1, 'Valid email verification grant is required'),
  preferredLanguage: z.enum(['en', 'hi', 'bn']).default('en'),
});
export type StudentPasswordRegister = z.infer<typeof StudentPasswordRegisterSchema>;

// Password Reset Request
export const PasswordResetRequestSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

// Password Reset Execution (Admin & Student)
export const PasswordResetConfirmSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  resetToken: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(14, 'Password cannot exceed 14 characters'),
});
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;

// Password Setup (For existing OTP-only students)
export const PasswordSetupRequestSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
});
export type PasswordSetupRequest = z.infer<typeof PasswordSetupRequestSchema>;

export const PasswordSetupConfirmSchema = z.object({
  email: z.string().email('Valid email is required').trim().toLowerCase(),
  setupToken: z.string().min(1, 'Setup token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(14, 'Password cannot exceed 14 characters'),
});
export type PasswordSetupConfirm = z.infer<typeof PasswordSetupConfirmSchema>;

// Password Change (Authenticated)
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(14, 'Password cannot exceed 14 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
