import { z } from 'zod';

export const ReleasePlatformSchema = z.enum(['ANDROID', 'IOS', 'WEB']);
export type ReleasePlatform = z.infer<typeof ReleasePlatformSchema>;

export const ReleaseChannelSchema = z.enum(['PRODUCTION', 'BETA']);
export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ReleaseStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'WITHDRAWN']);
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;

export const PushPermissionStatusSchema = z.enum(['GRANTED', 'DENIED', 'UNDETERMINED']);
export type PushPermissionStatus = z.infer<typeof PushPermissionStatusSchema>;

export const PushTokenProviderSchema = z.enum(['EXPO', 'FCM', 'APNS']);
export type PushTokenProvider = z.infer<typeof PushTokenProviderSchema>;

const APPROVED_RELEASE_DOMAINS = [
  'sidprep.in',
  'cdn.sidprep.in',
  'www.sidprep.in',
  'play.google.com',
  'apps.apple.com',
  'itunes.apple.com',
  'github.com',
  'expo.dev',
];

/**
 * Validates that a release download/store URL uses HTTPS and points to an approved distribution host.
 */
export function isApprovedDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    const isSidprepSubdomain = host === 'sidprep.in' || host.endsWith('.sidprep.in');
    if (isSidprepSubdomain) {
      return true;
    }
    if (host === 'github.com') {
      return parsed.pathname.toLowerCase().startsWith('/sakirhossn/sidprep/');
    }
    return APPROVED_RELEASE_DOMAINS.includes(host);
  } catch {
    return false;
  }
}

/**
 * Semantic version comparison utility.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const parts1 = String(v1 || '0')
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((p) => parseInt(p, 10) || 0);
  const parts2 = String(v2 || '0')
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const a = parts1[i] ?? 0;
    const b = parts2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export const CreateAppReleaseSchema = z.object({
  platform: ReleasePlatformSchema.default('ANDROID'),
  releaseChannel: ReleaseChannelSchema.default('PRODUCTION'),
  version: z.string().trim().min(1).max(50),
  buildNumber: z.coerce.number().int().min(1),
  minSupportedVersion: z.string().trim().min(1).max(50).default('2.0.0'),
  releaseNotes: z.string().trim().max(5000).optional().default(''),
  downloadUrl: z.string().trim().url().refine(isApprovedDownloadUrl, {
    message: 'Download URL must use HTTPS and point to an approved SidPrep, GitHub Release, Play Store, or App Store URL.',
  }),
  isMandatory: z.boolean().optional().default(false),
  status: ReleaseStatusSchema.optional(),
  isPublished: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional().default(100),
  otaCompatible: z.boolean().optional().default(false),
  requiresNativeBinary: z.boolean().optional().default(true),
});
export type CreateAppReleaseInput = z.infer<typeof CreateAppReleaseSchema>;

export const UpdateAppReleaseSchema = z.object({
  platform: ReleasePlatformSchema.optional(),
  releaseChannel: ReleaseChannelSchema.optional(),
  version: z.string().trim().min(1).max(50).optional(),
  buildNumber: z.coerce.number().int().min(1).optional(),
  minSupportedVersion: z.string().trim().min(1).max(50).optional(),
  releaseNotes: z.string().trim().max(5000).optional(),
  downloadUrl: z
    .string()
    .trim()
    .url()
    .refine(isApprovedDownloadUrl, {
      message: 'Download URL must use HTTPS and point to an approved SidPrep, GitHub Release, Play Store, or App Store URL.',
    })
    .optional(),
  isMandatory: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  otaCompatible: z.boolean().optional(),
  requiresNativeBinary: z.boolean().optional(),
});
export type UpdateAppReleaseInput = z.infer<typeof UpdateAppReleaseSchema>;

export const RegisterPushTokenSchema = z.object({
  deviceId: z.string().trim().min(3).max(128),
  platform: ReleasePlatformSchema,
  releaseChannel: ReleaseChannelSchema.optional().default('PRODUCTION'),
  appVersion: z.string().trim().min(1).max(50),
  buildNumber: z.coerce.number().int().min(0),
  pushToken: z.string().trim().min(10).max(512).nullable().optional(),
  tokenProvider: PushTokenProviderSchema.optional().default('EXPO'),
  permissionStatus: PushPermissionStatusSchema.optional().default('UNDETERMINED'),
  sessionId: z.string().trim().max(64).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenSchema>;

export interface ReleaseDeliverySummary {
  totalTargeted: number;
  pendingCount: number;
  acceptedCount: number;
  deliveredCount: number;
  failedRetryableCount: number;
  failedPermanentCount: number;
  skippedWithdrawnCount: number;
  tappedCount: number;
}

export interface AppReleaseRecord {
  id: string;
  version: string;
  buildNumber: number;
  minSupportedVersion: string;
  platform: ReleasePlatform;
  releaseChannel: ReleaseChannel;
  releaseNotes?: string;
  downloadUrl: string;
  status: ReleaseStatus;
  isPublished: boolean;
  isMandatory: boolean;
  rolloutPercentage: number;
  otaCompatible: boolean;
  requiresNativeBinary: boolean;
  createdBy?: string;
  publishedAt?: string;
  withdrawnAt?: string;
  withdrawnReason?: string;
  notificationEnqueuedAt?: string;
  notificationJobId?: string;
  deliverySummary?: ReleaseDeliverySummary;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCheckResponse {
  updateAvailable: boolean;
  isMandatory: boolean;
  belowMinSupported?: boolean;
  requestedReleaseWithdrawn?: boolean;
  message?: string;
  latestRelease?: {
    id: string;
    version: string;
    buildNumber: number;
    platform: ReleasePlatform;
    releaseChannel: ReleaseChannel;
    downloadUrl: string;
    releaseNotes?: string;
    minSupportedVersion: string;
    isMandatory: boolean;
    otaCompatible: boolean;
    requiresNativeBinary: boolean;
    publishedAt?: string;
  };
}
