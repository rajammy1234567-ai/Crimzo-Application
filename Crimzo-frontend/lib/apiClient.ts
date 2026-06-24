import { API_URL, getApiUrlCandidates, setActiveApiUrl } from './apiConfig';

export { API_URL };

const DEFAULT_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min for photos/videos over WiFi

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

export const PRIVACY_URL = `${API_URL}/privacy`;
export const TERMS_URL = `${API_URL}/terms`;

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

function networkErrorMessage(tried: string[]): string {
  const list = tried.join(', ');
  return (
    `Cannot reach backend. Tried: ${list}. ` +
    'Ensure backend is running (npm start in crimzo_app_backend), phone and PC are on the same WiFi, ' +
    'and Windows Firewall allows port 5001.'
  );
}

function timeoutErrorMessage(tried: string[]): string {
  return (
    `Upload timed out (tried: ${tried.join(', ')}). ` +
    'Try a smaller photo/video, same WiFi, or restart backend.'
  );
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

  const effectiveTimeout = timeoutMs ?? (isFormData ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  // Prefer API_URL (set by warmup/login) then other device-specific candidates.
  // RN FormData with {uri,type,name} can be retried across URLs; web File blobs can too.
  const bases = [API_URL, ...getApiUrlCandidates().filter((u) => u !== API_URL)];

  const tried: string[] = [];
  let sawTimeout = false;
  let lastNetworkError: unknown = null;

  for (const base of bases) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    tried.push(base);

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

      if (base !== API_URL) {
        setActiveApiUrl(base);
      }

      return await parseResponse<T>(response);
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      if (isAbortError(error)) {
        sawTimeout = true;
        continue;
      }
      if (isNetworkError(error)) {
        lastNetworkError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (sawTimeout) {
    throw new ApiError(timeoutErrorMessage(tried), 408);
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