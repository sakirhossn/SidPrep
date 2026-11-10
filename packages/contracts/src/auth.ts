import { z } from 'zod';

export const RequestOtpRequestSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional()
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
  email: z.string().email(),
  otp: z.string().length(6),
  deviceInfo: z.object({
    platform: z.enum(['android', 'ios', 'web']),
    deviceName: z.string().optional(),
    appVersion: z.string()
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
