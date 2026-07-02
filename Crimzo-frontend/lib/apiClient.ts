import {
  API_URL,
  getApiUrlCandidates,
  getRequestTimeoutMs,
  getTransientRetryCount,
  isDeployedBackend,
  setActiveApiUrl,
  subscribeApiUrl,
} from './apiConfig';

export { API_URL, subscribeApiUrl };

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min for photos/videos over WiFi
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const LOCAL_RETRY_BASE_DELAY_MS = 800;
const DEPLOYED_RETRY_BASE_DELAY_MS = 2_500;

/** Rewrites localhost media URLs so videos/images load on phone/emulator */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  try {
    const apiOrigin = new URL(API_URL).origin;
    return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, apiOrigin);
  } catch {
    return url;
  }
}

export function getPrivacyUrl(): string {
  return `${API_URL}/privacy`;
}

export function getTermsUrl(): string {
  return `${API_URL}/terms`;
}

export function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** Duck-type check — instanceof ApiError breaks across RN/Hermes module boundaries. */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

export function getApiErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    return typeof msg === 'string' ? msg : undefined;
  }
  return undefined;
}

export function isApiError(error: unknown): error is ApiError {
  return getApiErrorStatus(error) !== undefined;
}

function isMissingRouteError(error: unknown): boolean {
  const status = getApiErrorStatus(error);
  if (status !== 404) return false;
  const msg = (getApiErrorMessage(error) || '').toLowerCase();
  return msg === 'not found' || msg === '';
}

type ApiFetchOptions = RequestInit & {
  token?: string | null;
  timeoutMs?: number;
};

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.message === 'Network request failed' ||
        error.message === 'Network Error' ||
        error.message === 'Failed to fetch'))
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIdempotentMethod(method?: string): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

function isDeployedHostList(hosts: string[]): boolean {
  return hosts.some(isDeployedBackend);
}

function networkErrorMessage(tried: string[]): string {
  const list = tried.join(', ');
  if (isDeployedHostList(tried)) {
    return (
      `Cannot reach server (tried: ${list}). ` +
      'The cloud backend may be waking up — wait 30–60 seconds and try again.'
    );
  }
  return (
    `Cannot reach backend. Tried: ${list}. ` +
    'Ensure backend is running (npm start in crimzo_app_backend), phone and PC are on the same WiFi, ' +
    'and Windows Firewall allows port 5001.'
  );
}

function timeoutErrorMessage(tried: string[], isUpload: boolean): string {
  const hosts = tried.join(', ');
  if (isDeployedHostList(tried)) {
    if (isUpload) {
      return `Upload timed out (tried: ${hosts}). Server may be waking up — try again in a minute.`;
    }
    return (
      `Server is waking up (tried: ${hosts}). ` +
      'Wait 30–60 seconds and try again — Render free tier needs time after sleep.'
    );
  }
  if (isUpload) {
    return (
      `Upload timed out (tried: ${hosts}). ` +
      'Try a smaller photo/video, same WiFi, or restart backend.'
    );
  }
  return (
    `Request timed out (tried: ${hosts}). ` +
    'Ensure the backend is running (cd crimzo_app_backend && npm start), phone/emulator and PC are on the same network, and Windows Firewall allows port 5001.'
  );
}

function retryDelayMs(base: string, attempt: number): number {
  const baseDelay = isDeployedBackend(base) ? DEPLOYED_RETRY_BASE_DELAY_MS : LOCAL_RETRY_BASE_DELAY_MS;
  return baseDelay * (attempt + 1);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const payload = typeof data === 'object' && data ? (data as { error?: string; details?: string }) : null;
    const message =
      payload?.details ||
      payload?.error ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { token, timeoutMs, headers, ...rest } = options;

  const isFormData =
    typeof FormData !== 'undefined' && rest.body instanceof FormData;

  // Prefer API_URL (set by warmup/login) then other device-specific candidates.
  // RN FormData with {uri,type,name} can be retried across URLs; web File blobs can too.
  const bases = [API_URL, ...getApiUrlCandidates().filter((u) => u !== API_URL)];

  const tried: string[] = [];
  let sawTimeout = false;
  let lastNetworkError: unknown = null;
  const allowTransientRetry = isIdempotentMethod(rest.method);

  for (const base of bases) {
    tried.push(base);
    const maxAttempts = allowTransientRetry ? getTransientRetryCount(base) : 1;
    const effectiveTimeout =
      timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : getRequestTimeoutMs(base));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const requestHeaders: Record<string, string> = {
          ...authHeaders(token),
          ...(headers as Record<string, string> | undefined),
        };
        if (isFormData) {
          delete requestHeaders['Content-Type'];
          delete requestHeaders['content-type'];
        }

        const response = await fetch(`${base}${path}`, {
          ...rest,
          signal: controller.signal,
          headers: requestHeaders,
        });

        if (
          allowTransientRetry &&
          RETRYABLE_STATUSES.has(response.status) &&
          attempt < maxAttempts - 1
        ) {
          await sleep(retryDelayMs(base, attempt));
          continue;
        }

        if (base !== API_URL) {
          setActiveApiUrl(base);
        }

        return await parseResponse<T>(response);
      } catch (error: unknown) {
        if (isApiError(error)) {
          // Route missing on this host — try next backend URL (e.g. prod vs local).
          if (allowTransientRetry && isMissingRouteError(error)) break;
          throw error;
        }
        if (isAbortError(error)) {
          if (allowTransientRetry && attempt < maxAttempts - 1) {
            await sleep(retryDelayMs(base, attempt));
            continue;
          }
          sawTimeout = true;
          break;
        }
        if (isNetworkError(error)) {
          if (allowTransientRetry && attempt < maxAttempts - 1) {
            await sleep(retryDelayMs(base, attempt));
            continue;
          }
          lastNetworkError = error;
          break;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  if (sawTimeout) {
    throw new ApiError(timeoutErrorMessage(tried, isFormData), 408);
  }
  if (lastNetworkError) {
    throw new ApiError(networkErrorMessage(tried), 0);
  }
  throw new ApiError(networkErrorMessage(tried), 0);
}

/** Multipart upload helper — long timeout, correct device URL. */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  token?: string | null,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    token,
    body: formData,
    timeoutMs,
  });
}

export async function apiGet<T = unknown>(path: string, token?: string | null, timeoutMs?: number) {
  return apiFetch<T>(path, { method: 'GET', token, timeoutMs });
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  token?: string | null,
  timeoutMs?: number,
) {
  return apiFetch<T>(path, {
    method: 'POST',
    token,
    timeoutMs,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T = unknown>(path: string, token?: string | null, timeoutMs?: number) {
  return apiFetch<T>(path, { method: 'DELETE', token, timeoutMs });
}