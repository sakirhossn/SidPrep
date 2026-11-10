/**
 * Shared API Client for SidPrep Web & Admin
 * Standardises client-side same-origin requests (/v1/...) and server-side internal calls.
 */

export class ApiError extends Error {
  public status: number;
  public code: string;
  public details?: any;

  constructor(status: number, message: string, code = 'API_ERROR', details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Resolves the base URL for API calls.
 * - In the browser: uses NEXT_PUBLIC_API_URL if explicitly configured, otherwise relative '' (same-origin /v1)
 * - On the server: prioritizes INTERNAL_API_URL -> API_URL -> NEXT_PUBLIC_API_URL
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use configured public URL if present, otherwise same-origin relative
    const publicUrl = process.env.NEXT_PUBLIC_API_URL || '';
    return publicUrl.replace(/\/+$/, '');
  }

  // Server-side (SSR / Server Actions)
  const serverUrl =
    process.env.INTERNAL_API_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:4000/v1' : '');

  const clean = serverUrl.replace(/\/+$/, '');
  return clean.endsWith('/v1') ? clean.replace(/\/v1$/, '') : clean;
}

export interface ApiRequestOptions extends RequestInit {
  token?: string | null;
}

/**
 * Universal API fetch helper
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const base = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${base}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // Auth token resolution: explicit token -> localStorage (browser only)
  let token = options.token;
  if (!token && typeof window !== 'undefined') {
    token =
      localStorage.getItem('admin_token') ||
      localStorage.getItem('student_token') ||
      localStorage.getItem('token') ||
      null;
  }

  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errCode = (data && typeof data === 'object' && (data.error?.code || data.code)) || `HTTP_${res.status}`;
      const errMessage =
        (data && typeof data === 'object' && (data.error?.message || data.message)) ||
        res.statusText ||
        'Request failed';
      throw new ApiError(res.status, errMessage, errCode, data?.error || data);
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network failure or abort
    throw new ApiError(0, err.message || 'Network request failed', 'NETWORK_ERROR');
  }
}

export const apiClient = {
  get: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};
