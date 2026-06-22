import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL, ApiError } from '../lib/apiClient';
import {
  checkVideoCallEligibility,
  isInsufficientBalanceError,
  VIDEO_CALL_RATE_PER_MIN,
} from '../lib/videoCallBilling';

export type IncomingCall = {
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  channelName: string;
};

type VideoCallContextValue = {
  incomingCall: IncomingCall | null;
  startCall: (peerId: string | number, peerName: string, peerAvatar?: string | null) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  clearIncoming: () => void;
};

const VideoCallContext = createContext<VideoCallContextValue | null>(null);

export function VideoCallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

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

    socket.on('video_call_incoming', (data: IncomingCall) => {
      if (!data?.channelName || !data?.callerId) return;
      setIncomingCall(data);
      Alert.alert(
        'Incoming Video Call',
        `${data.callerName} is calling you`,
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
                },
              } as any);
            },
          },
        ],
        { cancelable: false },
      );
    });

    socket.on('video_call_rejected', () => {
      Alert.alert('Call Declined', 'The other person declined your call.');
    });

    socket.on('video_call_ended', (data?: { reason?: string }) => {
      const msg = data?.reason === 'balance_exhausted'
        ? 'Call ended — wallet balance exhausted.'
        : 'The other person left the call.';
      Alert.alert('Call Ended', msg);
    });

    socket.on('video_call_error', (data?: { code?: string; message?: string; wallet_balance?: number }) => {
      if (data?.code === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Recharge Required',
          `${data.message || `Video call costs ₹${VIDEO_CALL_RATE_PER_MIN}/min.`}\n\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
        return;
      }
      Alert.alert('Call Error', data?.message || 'Could not start video call.');
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, user?.username, router]);

  const startCall = useCallback(async (peerId: string | number, peerName: string, peerAvatar?: string | null) => {
    if (!user?.id || !socketRef.current || !token) {
      Alert.alert('Error', 'Could not start call. Check your connection.');
      return;
    }

    try {
      await checkVideoCallEligibility(token);
    } catch (e) {
      if (isInsufficientBalanceError(e)) {
        const data = e.data as { wallet_balance?: number; shortfall?: number };
        Alert.alert(
          'Recharge Required',
          `Please recharge your wallet first for video calls.\n\nRate: ₹${VIDEO_CALL_RATE_PER_MIN}/min\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
        return;
      }
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not verify wallet balance');
      return;
    }

    const channelName = `vc_${Date.now()}_${user.id}_${peerId}`;
    socketRef.current.emit('video_call_invite', {
      calleeId: peerId,
      callerId: user.id,
      callerName: user.username,
      callerAvatar: user.avatar || null,
      channelName,
    });
    router.push({
      pathname: '/call',
      params: {
        channel: channelName,
        role: 'caller',
        peerId: String(peerId),
        peerName,
        peerAvatar: peerAvatar || '',
      },
    } as any);
  }, [user?.id, user?.username, user?.avatar, token, router]);

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
    <VideoCallContext.Provider value={{ incomingCall, startCall, acceptCall, rejectCall, clearIncoming }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall() {
  const ctx = useContext(VideoCallContext);
  if (!ctx) throw new Error('useVideoCall must be used within VideoCallProvider');
  return ctx;
}