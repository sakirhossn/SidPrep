import { getPlatformOS } from '../services/platform';
import { secureStorage } from '../services/secureStorage';
import { telemetry } from '../services/telemetry';
import {
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  UserProfile,
  UpdateProfileRequest,
  HomeDashboardResponse,
  ExamSummary,
  ExamDetail,
  TestItem,
  StartAttemptResponse,
  AnswerBatchSyncRequest,
  AnswerBatchSyncResponse,
  SubmitAttemptRequest,
  AttemptResult,
  CurrentAffairBrief,
  DailyStudyPlanResponse,
  ResourceItem,
  ResourceDownloadTicketResponse,
  NotificationItem,
  PaginatedResponseSchema,
  UpdateCheckResponse,
  RegisterPushTokenInput,
  ReleasePlatform,
  ReleaseChannel,
  compareSemver
} from '@sidprep/contracts';

function resolveDefaultApiUrl(): string {
  // 1. Explicit runtime environment variable override (e.g. CI / local test harness)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'test') {
    return 'https://api.sidprep.in/v1';
  }

  // 2. Production/Staging app.json configuration authority (F25)
  try {
    const Constants = require('expo-constants');
    const config = Constants?.default?.expoConfig || Constants?.expoConfig;
    if (config?.extra?.apiBaseUrl) {
      return config.extra.apiBaseUrl;
    }

    // In local development / Expo Go ONLY, use hostUri for LAN testing if __DEV__ is true
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const hostUri = config?.hostUri;
      if (hostUri) {
        const ip = hostUri.split(':')[0];
        if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
          return `http://${ip}:4000/v1`;
        }
      }
    }
  } catch {}

  let url = 'http://localhost:4000/v1';

  // Self-healing Android emulator loopback: Android treats localhost as device self
  if (getPlatformOS() === 'android' && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    url = url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  }

  return url;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isOffline(): boolean {
    return this.statusCode === 0;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

export class SidPrepApiClient {
  private baseUrl = resolveDefaultApiUrl();
  private customFetch?: typeof fetch;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(customBaseUrl?: string, customFetch?: typeof fetch) {
    if (customBaseUrl) {
      this.baseUrl = customBaseUrl;
      telemetry.setBaseUrl(customBaseUrl);
    }
    if (customFetch) {
      this.customFetch = customFetch;
    }
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
    telemetry.setBaseUrl(url);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const correlationId = telemetry.generateCorrelationId();
    const url = `${this.baseUrl}${endpoint}`;
    const token = await secureStorage.getAccessToken();

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'x-correlation-id': correlationId,
      ...(options.headers as Record<string, string>)
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const fetchFn = this.customFetch || fetch;
      const response = await fetchFn(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle 401 Unauthorized: Attempt token refresh
      if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
        const refreshedToken = await this.refreshToken();
        if (refreshedToken) {
          return this.request<T>(endpoint, options, true);
        }
      }

      if (!response.ok) {
        let errJson: any = {};
        try {
          errJson = await response.json();
        } catch {
          // Response was not JSON
        }

        const apiError = new ApiError(
          response.status,
          errJson.code || `HTTP_${response.status}`,
          errJson.message || `Request failed with status ${response.status}`,
          errJson.details
        );

        telemetry.track('API_FAILURE', {
          statusCode: response.status,
          endpoint,
          errorCode: apiError.code
        }, correlationId);

        throw apiError;
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Network or Abort / Offline error
      const offlineError = new ApiError(
        0,
        'OFFLINE_OR_TIMEOUT',
        err.name === 'AbortError' ? 'Network request timed out' : 'No network connection or server unreachable'
      );

      telemetry.track('API_FAILURE', {
        statusCode: 0,
        endpoint,
        errorName: err.name || 'NetworkError'
      }, correlationId);

      throw offlineError;
    }
  }

  private async refreshToken(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = await secureStorage.getRefreshToken();
        if (!refreshToken) {
          await secureStorage.clearAuth();
          return null;
        }

        const fetchFn = this.customFetch || fetch;
        const res = await fetchFn(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });

        if (!res.ok) {
          await secureStorage.clearAuth();
          return null;
        }

        const data = await res.json();
        await secureStorage.saveTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // 1. Auth Endpoints
  async requestOtp(data: RequestOtpRequest): Promise<RequestOtpResponse> {
    return this.request<RequestOtpResponse>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async verifyOtp(data: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const res = await this.request<VerifyOtpResponse>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.tokens) {
      await secureStorage.saveTokens(res.tokens.accessToken, res.tokens.refreshToken);
    }
    if (res.user) {
      await secureStorage.saveUserProfile(JSON.stringify(res.user));
      telemetry.setAnonymousUserId(res.user.id);
    }
    return res;
  }

  async loginWithPassword(email: string, password: string): Promise<any> {
    const res = await this.request<any>('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, deviceInfo: { platform: 'app' } })
    });
    if (res.accessToken) {
      await secureStorage.saveTokens(res.accessToken, res.refreshToken);
      if (res.user) {
        await secureStorage.saveUserProfile(JSON.stringify(res.user));
        telemetry.setAnonymousUserId(res.user.id);
      }
    }
    return res;
  }

  async registerWithPassword(data: any): Promise<any> {
    const res = await this.request<any>('/auth/student/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.accessToken) {
      await secureStorage.saveTokens(res.accessToken, res.refreshToken);
      if (res.user) {
        await secureStorage.saveUserProfile(JSON.stringify(res.user));
        telemetry.setAnonymousUserId(res.user.id);
      }
    }
    return res;
  }

  async verifyEmailOtp(email: string, otp: string): Promise<any> {
    return this.request<any>('/auth/student/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), otp, purpose: 'student_registration' })
    });
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<any> {
    const res = await this.request<any>('/auth/student/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    if (res.accessToken) {
      await secureStorage.saveTokens(res.accessToken, res.refreshToken);
    }
    return res;
  }

  async requestPasswordReset(email: string): Promise<any> {
    return this.request<any>('/auth/student/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    });
  }

  async requestPasswordSetup(email: string): Promise<any> {
    return this.request<any>('/auth/student/request-password-setup', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() })
    });
  }

  async getSessions(): Promise<any> {
    return this.request<any>('/me/sessions');
  }

  async revokeSession(sessionId?: string): Promise<any> {
    const endpoint = sessionId ? `/me/sessions/${sessionId}` : '/me/sessions';
    return this.request<any>(endpoint, { method: 'DELETE' });
  }

  async logout(): Promise<void> {
    await secureStorage.clearAuth();
    telemetry.setAnonymousUserId(null);
  }

  // 2. Profile & Home Endpoints
  async getMe(): Promise<UserProfile> {
    return this.request<UserProfile>('/me');
  }

  async updateMe(data: UpdateProfileRequest): Promise<UserProfile> {
    return this.request<UserProfile>('/me', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async requestDataExport(): Promise<{ success: boolean; requestId: string; status: string; message: string }> {
    return this.request<{ success: boolean; requestId: string; status: string; message: string }>('/me/export', {
      method: 'POST'
    });
  }

  async requestAccountDeletion(): Promise<{ success: boolean; requestId: string; status: string; message: string }> {
    return this.request<{ success: boolean; requestId: string; status: string; message: string }>('/me/delete', {
      method: 'POST'
    });
  }

  async getHomeDashboard(): Promise<HomeDashboardResponse> {
    return this.request<HomeDashboardResponse>('/home');
  }

  // 3. Exam Endpoints
  async getExams(): Promise<ExamSummary[]> {
    const res = await this.request<any>('/exams');
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.items)) return res.items;
    return [];
  }

  async getExamDetail(id: string): Promise<ExamDetail> {
    return this.request<ExamDetail>(`/exams/${id}`);
  }

  // 4. Test & Attempt Endpoints
  async getTests(params?: { examId?: string; type?: string }): Promise<{ items: TestItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.examId) query.append('examId', params.examId);
    if (params?.type) query.append('type', params.type);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await this.request<any>(`/tests${queryString}`);
    const items: TestItem[] = Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : [];
    const total = typeof res?.total === 'number' ? res.total : (res?.pagination?.total ?? items.length);
    return { items, total };
  }

  async getTestById(id: string): Promise<TestItem> {
    return this.request<TestItem>(`/tests/${id}`);
  }

  async startAttempt(testId: string): Promise<StartAttemptResponse> {
    return this.request<StartAttemptResponse>(`/tests/${testId}/start`, {
      method: 'POST'
    });
  }

  async syncAnswers(data: AnswerBatchSyncRequest): Promise<AnswerBatchSyncResponse> {
    return this.request<AnswerBatchSyncResponse>('/sync/answers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async submitAttempt(attemptId: string, data: SubmitAttemptRequest): Promise<AttemptResult> {
    return this.request<AttemptResult>(`/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getAttemptResult(attemptId: string): Promise<AttemptResult> {
    return this.request<AttemptResult>(`/attempts/${attemptId}/result`);
  }

  // 5. Current Affairs & Quizzes
  async getCurrentAffairs(): Promise<{ items: CurrentAffairBrief[]; total: number }> {
    const res = await this.request<any>('/current-affairs');
    const items: CurrentAffairBrief[] = Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : [];
    const total = typeof res?.total === 'number' ? res.total : (res?.pagination?.total ?? items.length);
    return { items, total };
  }

  // 6. Study Plan
  async getStudyPlan(): Promise<DailyStudyPlanResponse> {
    return this.request<DailyStudyPlanResponse>('/study-plan');
  }

  async updateStudyTask(taskId: string, isCompleted: boolean): Promise<{ success: boolean; taskId: string; isCompleted: boolean }> {
    return this.request<{ success: boolean; taskId: string; isCompleted: boolean }>(`/study-plan/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isCompleted })
    });
  }

  // 7. Resource Library & Viewer
  async getResources(): Promise<{ items: ResourceItem[]; total: number }> {
    const res = await this.request<any>('/resources');
    const items: ResourceItem[] = Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : [];
    const total = typeof res?.total === 'number' ? res.total : (res?.pagination?.total ?? items.length);
    return { items, total };
  }

  async getDownloadTicket(resourceId: string): Promise<ResourceDownloadTicketResponse> {
    return this.request<ResourceDownloadTicketResponse>(`/resources/${resourceId}/download`, {
      method: 'POST'
    });
  }

  // 8. In-App Updates, Version Health Check & Push Token Registration
  async checkReleaseUpdates(params: {
    platform: ReleasePlatform;
    channel: ReleaseChannel;
    version: string;
    buildNumber: number;
    releaseId?: string;
  }): Promise<UpdateCheckResponse> {
    const qs = new URLSearchParams({
      platform: params.platform,
      channel: params.channel,
      version: params.version,
      build: String(params.buildNumber),
    });
    if (params.releaseId) {
      qs.set('releaseId', params.releaseId);
    }

    // 1. Query dedicated platform/channel release endpoint
    try {
      const res = await this.request<UpdateCheckResponse>(`/app/updates/check?${qs.toString()}`);
      if (res && typeof res.updateAvailable === 'boolean') {
        return res;
      }
    } catch {
      // Fall through to legacy endpoint or GitHub fallback
    }

    // 2. Fallback to legacy /app/version
    try {
      const legacy = await this.checkAppVersion();
      const isNewer = compareSemver(legacy.currentVersion, params.version) > 0;
      const belowMin = compareSemver(params.version, legacy.minVersion) < 0;
      return {
        updateAvailable: isNewer,
        isMandatory: isNewer && belowMin,
        belowMinSupported: belowMin,
        latestRelease: isNewer
          ? {
              id: `legacy_${legacy.currentVersion}`,
              version: legacy.currentVersion,
              buildNumber: params.buildNumber + 1,
              platform: params.platform,
              releaseChannel: params.channel,
              downloadUrl: legacy.apkUrl,
              releaseNotes: legacy.releaseNotes,
              minSupportedVersion: legacy.minVersion,
              isMandatory: belowMin,
              otaCompatible: false,
              requiresNativeBinary: true,
              publishedAt: legacy.publishedAt,
            }
          : undefined,
      };
    } catch {
      throw new Error('Unable to check for updates from server or GitHub releases');
    }
  }

  async registerPushToken(payload: RegisterPushTokenInput): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/devices/push-token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async unregisterPushToken(payload: {
    deviceId: string;
    platform: ReleasePlatform;
    invalidateToken?: boolean;
  }): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/devices/push-token/unregister', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async trackReleaseTap(payload: {
    releaseId: string;
    deviceId: string;
    platform: ReleasePlatform;
  }): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/app/updates/tap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async checkAppVersion(): Promise<{
    currentVersion: string;
    minVersion: string;
    apkUrl: string;
    releaseNotes: string;
    publishedAt: string;
  }> {
    // 1. First attempt to check the primary backend server
    try {
      const res = await this.request<any>('/app/version');
      if (res && (res.currentVersion || res.version)) {
        return {
          currentVersion: res.currentVersion || res.version,
          minVersion: res.minVersion || '2.0.0',
          apkUrl: res.apkUrl || res.latestApkUrl || 'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk',
          releaseNotes: res.releaseNotes || 'Bug fixes, performance improvements, and enhanced exam test runner.',
          publishedAt: res.publishedAt || new Date().toISOString()
        };
      }
    } catch {
      // Fall through to GitHub Releases update file check
    }

    // 2. Resilient fallback: Query official GitHub Releases update file directly
    try {
      const ghRes = await fetch('https://raw.githubusercontent.com/sakirhossn/SidPrep/main/apps/mobile/update.json', {
        headers: { Accept: 'application/json' }
      });
      if (ghRes.ok) {
        const data = await ghRes.json();
        return {
          currentVersion: data.currentVersion || data.version,
          minVersion: data.minVersion || '2.0.0',
          apkUrl: data.latestApkUrl || data.apkUrl || 'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk',
          releaseNotes: data.releaseNotes || 'New official release available on GitHub.',
          publishedAt: data.publishedAt || new Date().toISOString()
        };
      }
    } catch {
      // Fall through
    }

    throw new Error('Unable to check for updates from server or GitHub releases');
  }
}

export const api = new SidPrepApiClient();
