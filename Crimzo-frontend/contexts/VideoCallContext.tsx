import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { appAlert } from '../lib/appAlert';

import { useRouter } from 'expo-router';
import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL, apiGet, getApiErrorMessage, getApiErrorStatus } from '../lib/apiClient';
import {
  checkVideoCallEligibility,
  isInsufficientBalanceError,
  VIDEO_CALL_RATE_PER_MIN,
} from '../lib/videoCallBilling';
import { CALL_RING_TIMEOUT_MS } from '../lib/videoCallUi';
import { publish } from '../lib/realtimeSync';

export type CallMode = 'voice' | 'video';

export type IncomingCall = {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  channelName: string;
  callMode?: CallMode;
  ratePerMin?: number;
  beansPerMin?: number;
};

type VideoCallContextValue = {
  incomingCall: IncomingCall | null;
  startCall: (peerId: string | number, peerName: string, peerAvatar?: string | null) => void;
  startVoiceCall: (peerId: string | number, peerName: string, peerAvatar?: string | null) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  clearIncoming: () => void;
};

const VideoCallContext = createContext<VideoCallContextValue | null>(null);

export function VideoCallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!token || !user?.id || !API_URL) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(API_URL, { transports: ['websocket'], auth: { token } });
    socket.on('connect', () => {
      socket.emit('join_user', { userId: user.id });
    });

    socket.on('video_call_incoming', (data: IncomingCall & { ratePerMin?: number; beansPerMin?: number }) => {
      if (!data?.channelName || !data?.callerId) return;
      const callMode: CallMode = data.callMode === 'voice' ? 'voice' : 'video';
      const incoming: IncomingCall = { ...data, callMode };
      setIncomingCall(incoming);
      const rateLine = data.ratePerMin
        ? `\n\nThey pay ₹${data.ratePerMin}/min${data.beansPerMin ? ` · you earn ${data.beansPerMin} beans/min` : ''}`
        : '';
      const callLabel = callMode === 'voice' ? 'Voice Call' : 'Video Call';
      appAlert(
        `Incoming ${callLabel}`,
        `${data.callerName} is calling you${rateLine}`,
        [
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => {
              socket.emit('video_call_reject', { callerId: data.callerId });
              setIncomingCall(null);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              socket.emit('video_call_accept', {
                callerId: data.callerId,
                calleeId: user.id,
                calleeName: user.username,
                channelName: data.channelName,
              });
              setIncomingCall(null);
              router.push({
                pathname: '/call',
                params: {
                  channel: data.channelName,
                  role: 'callee',
                  peerId: data.callerId,
                  peerName: data.callerName,
                  peerAvatar: data.callerAvatar || '',
                  ratePerMin: data.ratePerMin != null ? String(data.ratePerMin) : '',
                  beansPerMin: data.beansPerMin != null ? String(data.beansPerMin) : '',
                  callMode,
                },
              } as any);
            },
          },
        ],
        { cancelable: false },
      );
    });

    socket.on('video_call_accepted', (data?: { channelName?: string }) => {
      clearRingTimeout();
      publish('video_call_accepted', data);
    });

    socket.on('video_call_rejected', () => {
      clearRingTimeout();
      setIncomingCall(null);
      publish('video_call_rejected', {});
    });

    socket.on('video_call_ended', (data?: { reason?: string; channelName?: string }) => {
      clearRingTimeout();
      setIncomingCall(null);
      publish('video_call_force_end', data);
    });

    socket.on('video_call_error', (data?: { code?: string; message?: string; wallet_balance?: number; ratePerMin?: number; beansPerMin?: number }) => {
      clearRingTimeout();
      if (data?.code === 'FOLLOW_REQUIRED') {
        appAlert('Follow First', data.message || 'Follow each other to start a video call.');
        return;
      }
      if (data?.code === 'INSUFFICIENT_BALANCE') {
        const rate = data.ratePerMin ?? VIDEO_CALL_RATE_PER_MIN;
        appAlert(
          'Recharge Required',
          `${data.message || `Video call costs ₹${rate}/min.`}\n\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
        return;
      }
      appAlert('Call Error', data?.message || 'Could not start video call.');
    });

    socketRef.current = socket;
    return () => {
      clearRingTimeout();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, user?.username, router, clearRingTimeout]);

  const startCallWithMode = useCallback(async (
    peerId: string | number,
    peerName: string,
    peerAvatar: string | null | undefined,
    callMode: CallMode,
  ) => {
    if (!user?.id || !socketRef.current || !token) {
      appAlert('Error', 'Could not start call. Check your connection.');
      return;
    }

    const isVoice = callMode === 'voice';
    const callLabel = isVoice ? 'voice call' : 'video call';

    try {
      const interaction = await apiGet<{
        canInteract?: boolean;
        canVideoCall?: boolean;
        isMutualFriend?: boolean;
        reason?: string;
      }>(`/api/user/interaction?userId=${peerId}`, token);
      const allowed = interaction.canVideoCall ?? interaction.canInteract;
      if (!allowed) {
        appAlert(
          'Follow First',
          interaction.reason || `Follow each other to start a ${callLabel}.`,
        );
        return;
      }
    } catch (e) {
      const status = getApiErrorStatus(e);
      const message = getApiErrorMessage(e);
      if (status === 403) {
        appAlert('Follow First', message || `Follow each other to start a ${callLabel}.`);
        return;
      }
      appAlert('Error', message || 'Could not verify call permissions. Check your connection.');
      return;
    }

    let ratePerMin = VIDEO_CALL_RATE_PER_MIN;
    let beansPerMin: number | undefined;
    try {
      const eligibility = await checkVideoCallEligibility(token, peerId);
      ratePerMin = eligibility.ratePerMin ?? VIDEO_CALL_RATE_PER_MIN;
      beansPerMin = eligibility.beansPerMin;
    } catch (e) {
      if (isInsufficientBalanceError(e)) {
        const data = e.data as { wallet_balance?: number; ratePerMin?: number; beansPerMin?: number };
        const rate = data.ratePerMin ?? VIDEO_CALL_RATE_PER_MIN;
        const beansLine = data.beansPerMin ? `\nThey earn ${data.beansPerMin} beans/min` : '';
        appAlert(
          'Recharge Required',
          `Please recharge your wallet first for ${callLabel}s.\n\nRate: ₹${rate}/min${beansLine}\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
        return;
      }
      appAlert('Error', getApiErrorMessage(e) || 'Could not verify wallet balance');
      return;
    }

    const channelPrefix = isVoice ? 'vc_voice_' : 'vc_';
    const channelName = `${channelPrefix}${Date.now()}_${user.id}_${peerId}`;
    socketRef.current.emit('video_call_invite', {
      calleeId: peerId,
      callerId: user.id,
      callerName: user.username,
      callerAvatar: user.avatar || null,
      channelName,
      callMode,
    });

    clearRingTimeout();
    ringTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('video_call_reject', {
        callerId: user.id,
        calleeId: peerId,
        reason: 'no_answer',
      });
      publish('video_call_rejected', { peerId: String(peerId) });
      appAlert('No Answer', `${peerName} did not answer.`, [{ text: 'OK' }]);
      if (router.canGoBack()) router.back();
    }, CALL_RING_TIMEOUT_MS);

    router.push({
      pathname: '/call',
      params: {
        channel: channelName,
        role: 'caller',
        peerId: String(peerId),
        peerName,
        peerAvatar: peerAvatar || '',
        ratePerMin: String(ratePerMin),
        beansPerMin: beansPerMin != null ? String(beansPerMin) : '',
        callMode,
      },
    } as any);
  }, [user?.id, user?.username, user?.avatar, token, router, clearRingTimeout]);

  const startCall = useCallback(
    (peerId: string | number, peerName: string, peerAvatar?: string | null) =>
      void startCallWithMode(peerId, peerName, peerAvatar, 'video'),
    [startCallWithMode],
  );

  const startVoiceCall = useCallback(
    (peerId: string | number, peerName: string, peerAvatar?: string | null) =>
      void startCallWithMode(peerId, peerName, peerAvatar, 'voice'),
    [startCallWithMode],
  );

  const acceptCall = useCallback(() => {
    if (!incomingCall || !socketRef.current || !user?.id) return;
    socketRef.current.emit('video_call_accept', {
      callerId: incomingCall.callerId,
      calleeId: user.id,
      calleeName: user.username,
      channelName: incomingCall.channelName,
    });
    router.push({
      pathname: '/call',
      params: {
        channel: incomingCall.channelName,
        role: 'callee',
        peerId: incomingCall.callerId,
        peerName: incomingCall.callerName,
        peerAvatar: incomingCall.callerAvatar || '',
        ratePerMin: incomingCall.ratePerMin != null ? String(incomingCall.ratePerMin) : '',
        beansPerMin: incomingCall.beansPerMin != null ? String(incomingCall.beansPerMin) : '',
        callMode: incomingCall.callMode || 'video',
      },
    } as any);
    setIncomingCall(null);
  }, [incomingCall, user?.id, user?.username, router]);

  const rejectCall = useCallback(() => {
    if (incomingCall && socketRef.current) {
      socketRef.current.emit('video_call_reject', { callerId: incomingCall.callerId });
    }
    setIncomingCall(null);
  }, [incomingCall]);

  const clearIncoming = useCallback(() => setIncomingCall(null), []);

  return (
    <VideoCallContext.Provider value={{ incomingCall, startCall, startVoiceCall, acceptCall, rejectCall, clearIncoming }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall() {
  const ctx = useContext(VideoCallContext);
  if (!ctx) throw new Error('useVideoCall must be used within VideoCallProvider');
  return ctx;
}