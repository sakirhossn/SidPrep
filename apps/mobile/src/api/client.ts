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
  PaginatedResponseSchema
} from '@sidprep/contracts';

function resolveDefaultApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'test') {
    return 'https://api.sidprep.in/v1';
  }
  try {
    const Constants = require('expo-constants');
    const config = Constants?.default?.expoConfig || Constants?.expoConfig;
    const hostUri = config?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:4000/v1`;
      }
    }
  } catch {}
  return 'http://localhost:4000/v1';
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
    await secureStorage.saveTokens(res.tokens.accessToken, res.tokens.refreshToken);
    await secureStorage.saveUserProfile(JSON.stringify(res.user));
    telemetry.setAnonymousUserId(res.user.id);
    return res;
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
}

export const api = new SidPrepApiClient();
