import { apiGet, apiPost, ApiError } from './apiClient';

export type LiveCallStatus = {
  success?: boolean;
  isHost?: boolean;
  ratePerMin: number;
  beansPerMin?: number;
  wallet_balance: number;
  canCall: boolean;
  pendingRequest?: {
    id: string;
    status: string;
    channelName?: string;
    callType?: LiveCallType;
  } | null;
  pendingRequests_all?: Array<{
    id: string;
    status: string;
    channelName?: string;
    callType?: LiveCallType;
  }>;
  acceptedCall?: {
    id: string;
    channelName: string;
    status: string;
    callType?: LiveCallType;
  } | null;
  videoRatePerMin?: number;
  videoBeansPerMin?: number;
  pendingRequests?: Array<{
    id: string;
    requesterId?: string;
    requesterName?: string;
    requesterAvatar?: string | null;
    channelName?: string;
  }>;
};

export type LiveCallType = 'voice' | 'video';

export async function requestLiveCall(token: string, sessionId: string, callType: LiveCallType = 'voice') {
  return apiPost<{
    success?: boolean;
    requestId?: string;
    channelName?: string;
    callType?: LiveCallType;
    status?: string;
    alreadyAccepted?: boolean;
  }>('/api/live/call/request', { sessionId, callType }, token);
}

export async function respondLiveCall(token: string, requestId: string, action: 'accept' | 'reject') {
  return apiPost<{
    success?: boolean;
    channelName?: string;
    requesterId?: string;
    requesterName?: string;
    callType?: LiveCallType;
    ratePerMin?: number;
    beansPerMin?: number;
  }>('/api/live/call/respond', { requestId, action }, token);
}

export async function getLiveCallStatus(token: string, sessionId: string) {
  return apiGet<LiveCallStatus>(`/api/live/call/status/${sessionId}`, token);
}

export function isInsufficientCallBalanceError(e: unknown): e is ApiError {
  return e instanceof ApiError
    && e.status === 400
    && (e.data as { code?: string })?.code === 'INSUFFICIENT_BALANCE';
}