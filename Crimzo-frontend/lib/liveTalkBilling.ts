import { apiGet, apiPost, ApiError } from './apiClient';

import { inrToBeans } from './diamondPackages';

export const LIVE_TALK_RATE_PER_MIN = 1;
export const LIVE_TALK_BEANS_PER_MIN = inrToBeans(LIVE_TALK_RATE_PER_MIN);

export type LiveTalkStatus = {
  success?: boolean;
  isHost?: boolean;
  ratePerMin: number;
  wallet_balance: number;
  canTalk: boolean;
  canChat: boolean;
  pendingRequest?: { id: string; status: string } | null;
  activeTalk?: {
    id: string;
    minutesCharged: number;
    totalCharged: number;
    canChat: boolean;
  } | null;
  pendingRequests?: Array<{
    id: string;
    requesterId?: string;
    requesterName?: string;
    requesterAvatar?: string | null;
  }>;
  hostBusy?: boolean;
  hostBusyType?: 'talk' | 'call' | null;
  hostChatEarnings?: {
    beansPerMinute: number;
    sessionBeansEarned: number;
    activeChats: number;
    activeViewers?: Array<{
      talkSessionId: string;
      requesterName: string;
      minutesCharged: number;
      beansEarned: number;
    }>;
  } | null;
};

export async function checkLiveTalkEligibility(token: string) {
  return apiGet('/api/live/talk/check', token);
}

export async function requestLiveTalk(token: string, sessionId: string) {
  return apiPost<{
    success?: boolean;
    requestId?: string;
    status?: string;
    alreadyActive?: boolean;
    talkSessionId?: string;
  }>('/api/live/talk/request', { sessionId }, token);
}

export async function respondLiveTalk(token: string, requestId: string, action: 'accept' | 'reject') {
  return apiPost('/api/live/talk/respond', { requestId, action }, token);
}

export async function getLiveTalkStatus(token: string, sessionId: string) {
  return apiGet<LiveTalkStatus>(`/api/live/talk/status/${sessionId}`, token);
}

export async function startLiveTalkBilling(token: string, payload: { sessionId: string; requestId: string }) {
  return apiPost<{
    success?: boolean;
    talkSessionId?: string;
    wallet_balance?: number;
    minutesCharged?: number;
    totalCharged?: number;
    canContinue?: boolean;
  }>('/api/live/talk/start', payload, token);
}

export async function tickLiveTalkBilling(token: string, payload: { sessionId: string; talkSessionId: string }) {
  return apiPost<{
    success?: boolean;
    wallet_balance?: number;
    minutesCharged?: number;
    totalCharged?: number;
    canContinue?: boolean;
    code?: string;
    shouldEndTalk?: boolean;
  }>('/api/live/talk/tick', payload, token);
}

export async function endLiveTalkBilling(token: string, payload: { sessionId: string; talkSessionId?: string }) {
  return apiPost('/api/live/talk/end', payload, token);
}

export function isInsufficientBalanceError(e: unknown): e is ApiError {
  return e instanceof ApiError
    && e.status === 400
    && (e.data as { code?: string })?.code === 'INSUFFICIENT_BALANCE';
}

export function isBalanceExhaustedError(e: unknown): boolean {
  return e instanceof ApiError
    && (e.data as { code?: string })?.code === 'BALANCE_EXHAUSTED';
}