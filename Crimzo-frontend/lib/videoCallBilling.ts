import { apiGet, apiPost, ApiError } from './apiClient';

export const VIDEO_CALL_RATE_PER_MIN = 1;

export type VideoCallRateInfo = {
  success?: boolean;
  ratePerMin: number;
  wallet_balance: number;
  canCall: boolean;
  minRequired: number;
  maxMinutes: number;
  shortfall?: number;
};

export type VideoCallSessionStart = {
  success?: boolean;
  billing?: boolean;
  sessionId?: string;
  wallet_balance?: number;
  minutesCharged?: number;
  totalCharged?: number;
  ratePerMin?: number;
  canContinue?: boolean;
  message?: string;
};

export async function checkVideoCallEligibility(
  token: string,
  peerId?: string | number,
): Promise<VideoCallRateInfo & { beansPerMin?: number }> {
  const qs = peerId ? `?peerId=${encodeURIComponent(String(peerId))}` : '';
  return apiGet(`/api/video-call/check${qs}`, token);
}

export async function getVideoCallRate(token: string): Promise<VideoCallRateInfo> {
  return apiGet<VideoCallRateInfo>('/api/video-call/rate', token);
}

export async function startVideoCallBilling(
  token: string,
  payload: { channelName: string; peerId: string; role: string },
): Promise<VideoCallSessionStart> {
  return apiPost<VideoCallSessionStart>('/api/video-call/start', payload, token);
}

export async function tickVideoCallBilling(
  token: string,
  payload: { channelName: string; sessionId: string },
): Promise<VideoCallSessionStart & { shouldEndCall?: boolean; code?: string }> {
  return apiPost('/api/video-call/tick', payload, token);
}

export async function endVideoCallBilling(
  token: string,
  payload: { channelName: string; sessionId?: string },
): Promise<{ success?: boolean; minutesCharged?: number; totalCharged?: number }> {
  return apiPost('/api/video-call/end', payload, token);
}

export function isInsufficientBalanceError(e: unknown): e is ApiError {
  return e instanceof ApiError
    && (e.status === 400)
    && ((e.data as { code?: string })?.code === 'INSUFFICIENT_BALANCE');
}

export function isBalanceExhaustedError(e: unknown): boolean {
  return e instanceof ApiError
    && (e.data as { code?: string })?.code === 'BALANCE_EXHAUSTED';
}