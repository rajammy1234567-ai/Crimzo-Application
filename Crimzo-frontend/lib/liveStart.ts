import { apiPost, ApiError, getApiErrorStatus } from './apiClient';

export type LiveStartResponse = {
  success?: boolean;
  sessionId?: string;
  session_id?: string;
  channelName?: string;
  token?: string;
  appId?: string;
  uid?: number;
  error?: string;
  detail?: string;
};

const LIVE_START_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 4;
const RETRY_STATUSES = new Set([0, 408, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSessionId(payload?: LiveStartResponse | null): string | undefined {
  if (!payload) return undefined;
  const id = payload.sessionId || payload.session_id;
  return id ? String(id) : undefined;
}

function formatStartLiveError(payload?: LiveStartResponse | null, fallback?: string): string {
  const parts = [payload?.error, payload?.detail, fallback].filter(Boolean);
  return parts[0] || 'Could not start live session';
}

/** Go-live can hit a cold Render instance — retry with a long timeout. */
export async function startLiveSession(
  authToken: string,
  location?: string,
): Promise<Required<Pick<LiveStartResponse, 'sessionId' | 'channelName' | 'token' | 'appId' | 'uid'>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await apiPost<LiveStartResponse>(
        '/api/live/start',
        { location: location || 'Unknown' },
        authToken,
        LIVE_START_TIMEOUT_MS,
      );

      const sessionId = resolveSessionId(response);
      if (
        sessionId &&
        response.channelName &&
        response.token &&
        response.appId &&
        response.uid != null
      ) {
        return {
          sessionId,
          channelName: response.channelName,
          token: response.token,
          appId: response.appId,
          uid: Number(response.uid),
        };
      }

      throw new ApiError(formatStartLiveError(response), 500, response);
    } catch (error: unknown) {
      lastError = error;
      const status = getApiErrorStatus(error);
      if (RETRY_STATUSES.has(status ?? -1) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiError('Could not start live session', 500);
}