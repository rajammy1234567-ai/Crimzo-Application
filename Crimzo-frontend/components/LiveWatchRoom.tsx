import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { appAlert } from '../lib/appAlert';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing, Dimensions, StatusBar, Image, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import {
  requestLiveCall,
  getLiveCallStatus,
  isInsufficientCallBalanceError,
} from '../lib/liveCallRequest';
import {
  requestLiveTalk,
  getLiveTalkStatus,
  startLiveTalkBilling,
  tickLiveTalkBilling,
  endLiveTalkBilling,
  isInsufficientBalanceError,
  isBalanceExhaustedError,
} from '../lib/liveTalkBilling';
import { resolveRates } from '../lib/userRates';

import { parseFollowResponse } from '../lib/followHelpers';
import { subscribe } from '../lib/realtimeSync';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import LiveChat from '../components/LiveChat';
import PrivateTalkChat from '../components/PrivateTalkChat';
import HostBusyOverlay from '../components/HostBusyOverlay';
import StickerPanel from '../components/StickerPanel';
import GiftSplashOverlay from '../components/GiftSplashOverlay';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../components/agoraImports';
import { toAgoraUid } from '../lib/agoraUid';

import { API_URL, apiGet, apiPost, ApiError } from '../lib/apiClient';
const { width: SW, height: SH } = Dimensions.get('window');

// ── Pulsing red LIVE indicator ──
function PulsingDot({ size = 8 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const opac = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 2, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opac, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opac, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: '#FF2D55', transform: [{ scale: pulse }], opacity: opac }} />
      <View style={{ width: size * 0.65, height: size * 0.65, borderRadius: size * 0.325, backgroundColor: '#FF4466' }} />
    </View>
  );
}

// ── Format viewer count (1.2k, 240k etc) ──
function formatViewers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export type LiveStreamPreview = {
  id: string | number;
  username?: string;
  avatar?: string | null;
  viewers_count?: number;
};

export type LiveWatchRoomProps = {
  sessionId: string;
  isActive?: boolean;
  feedMode?: boolean;
  talk?: string;
  preview?: LiveStreamPreview;
  onClose?: () => void;
  onStreamEnded?: () => void;
};

export default function LiveWatchRoom({
  sessionId: sessionIdProp,
  isActive = true,
  feedMode = false,
  talk,
  preview,
  onClose,
  onStreamEnded,
}: LiveWatchRoomProps) {
  const { user, token, updateUser } = useAuth();

  const router = useRouter();
  const sessionId = sessionIdProp;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [streamData, setStreamData] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [showStickers, setShowStickers] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequested, setIsRequested] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [hostFollowers, setHostFollowers] = useState(0);
  const socketRef = useRef<any>(null);
  const [viewerSocket, setViewerSocket] = useState<ReturnType<typeof io> | null>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const billingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const talkSessionIdRef = useRef<string | null>(null);
  const canChatRef = useRef(false);
  const exitingTalkRef = useRef(false);
  const talkPromptShownRef = useRef(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const remoteUidRef = useRef<number | null>(null);
  const [hostCameraOff, setHostCameraOff] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const [talkRequestId, setTalkRequestId] = useState<string | null>(null);
  const [talkStatus, setTalkStatus] = useState<'idle' | 'pending' | 'active' | 'rejected'>('idle');
  const [talkMinutes, setTalkMinutes] = useState(0);
  const [talkCharged, setTalkCharged] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [requestingTalk, setRequestingTalk] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'pending' | 'accepted'>('idle');
  const [callRequestId, setCallRequestId] = useState<string | null>(null);
  const [requestingCall, setRequestingCall] = useState(false);
  const [activeTalkSessionId, setActiveTalkSessionId] = useState<string | null>(null);
  const [privateChatOpen, setPrivateChatOpen] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [hostBusyType, setHostBusyType] = useState<'talk' | 'call' | null>(null);

  const hostRates = useMemo(
    () => resolveRates(streamData?.hostVoiceRatePerMin, streamData?.hostChatRatePerMin),
    [streamData?.hostVoiceRatePerMin, streamData?.hostChatRatePerMin],
  );

  useEffect(() => {
    canChatRef.current = canChat;
  }, [canChat]);

  useEffect(() => {
    return subscribe('follow_status_changed', (payload) => {
      const data = payload as { userId?: string; isFollowing?: boolean; isRequested?: boolean };
      if (!data?.userId || String(data.userId) !== String(streamData?.hostId)) return;
      if (data.isFollowing != null) setIsFollowing(!!data.isFollowing);
      if (data.isRequested != null) setIsRequested(!!data.isRequested);
    });
  }, [streamData?.hostId]);

  // Entrance animation
  const headerFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const clearTalkBilling = useCallback(() => {
    if (billingTimerRef.current) {
      clearInterval(billingTimerRef.current);
      billingTimerRef.current = null;
    }
  }, []);

  const finalizeTalkBilling = useCallback(async () => {
    if (!token || !sessionId || !talkSessionIdRef.current || exitingTalkRef.current) return;
    exitingTalkRef.current = true;
    const endingSessionId = talkSessionIdRef.current;
    clearTalkBilling();
    try {
      await endLiveTalkBilling(token, {
        sessionId: String(sessionId),
        talkSessionId: endingSessionId,
      });
    } catch {
      // non-fatal
    } finally {
      exitingTalkRef.current = false;
    }
    talkSessionIdRef.current = null;
    setActiveTalkSessionId(null);
    setPrivateChatOpen(false);
    setCanChat(false);
    setTalkStatus('idle');
    setTalkMinutes(0);
    setTalkCharged(0);
  }, [token, sessionId, clearTalkBilling]);

  const exitPrivateChat = useCallback(() => {
    setPrivateChatOpen(false);
    void finalizeTalkBilling();
  }, [finalizeTalkBilling]);

  const startTalkBillingLoop = useCallback(() => {
    if (!token || !sessionId || billingTimerRef.current) return;
    billingTimerRef.current = setInterval(async () => {
      if (!talkSessionIdRef.current) return;
      try {
        const tick = await tickLiveTalkBilling(token, {
          sessionId: String(sessionId),
          talkSessionId: talkSessionIdRef.current,
        });
        if (tick.wallet_balance != null) {
          setWalletBalance(tick.wallet_balance);
          updateUser({ wallet_balance: tick.wallet_balance });
        }
        if (tick.minutesCharged != null) setTalkMinutes(tick.minutesCharged);
        if (tick.totalCharged != null) setTalkCharged(tick.totalCharged);
        if (tick.canContinue === false) {
          clearTalkBilling();
          setCanChat(false);
          setTalkStatus('idle');
          appAlert(
            'Balance Low',
            'Wallet balance is too low to continue live chat. Recharge to chat again.',
            [{ text: 'OK' }],
          );
        }
      } catch (e) {
        if (isBalanceExhaustedError(e)) {
          clearTalkBilling();
          void finalizeTalkBilling();
          appAlert('Balance Over', 'Wallet balance exhausted — you can no longer chat.');
        }
      }
    }, 60000);
  }, [token, sessionId, clearTalkBilling, finalizeTalkBilling, updateUser]);

  const beginTalkBilling = useCallback(async (requestId: string) => {
    if (!token || !sessionId) return;
    try {
      const billing = await startLiveTalkBilling(token, {
        sessionId: String(sessionId),
        requestId,
      });
      if (billing.talkSessionId) {
        talkSessionIdRef.current = billing.talkSessionId;
        setActiveTalkSessionId(billing.talkSessionId);
        setPrivateChatOpen(true);
        setCanChat(true);
        setTalkStatus('active');
        setHostBusy(false);
        setHostBusyType(null);
        if (billing.wallet_balance != null) {
          setWalletBalance(billing.wallet_balance);
          updateUser({ wallet_balance: billing.wallet_balance });
        }
        if (billing.minutesCharged != null) setTalkMinutes(billing.minutesCharged);
        if (billing.totalCharged != null) setTalkCharged(billing.totalCharged);
        startTalkBillingLoop();
        const chatRate = streamData?.hostChatRatePerMin ?? 1;
        const chatBeans = streamData?.hostChatBeansPerMin ?? hostRates.chatBeansPerMin;
        appAlert(
          'Private Chat Started',
          `You are now in a private 1-on-1 room with the host. Only you two can see messages.\n\n₹${chatRate}/min · Host earns ${chatBeans} beans/min`,
        );
      }
    } catch (e) {
      appAlert('Billing Error', e instanceof ApiError ? e.message : 'Could not start talk billing');
    }
  }, [token, sessionId, startTalkBillingLoop, updateUser, streamData, hostRates.chatBeansPerMin]);

  const refreshTalkStatus = useCallback(async () => {
    if (!token || !sessionId || !user?.id) return;
    try {
      const status = await getLiveTalkStatus(token, String(sessionId));
      if (status.wallet_balance != null) setWalletBalance(status.wallet_balance);
      if (status.canChat) {
        setCanChat(true);
        setTalkStatus('active');
        setHostBusy(false);
        setHostBusyType(null);
        if (status.activeTalk?.id) {
          talkSessionIdRef.current = status.activeTalk.id;
          setActiveTalkSessionId(status.activeTalk.id);
          setTalkMinutes(status.activeTalk.minutesCharged);
          setTalkCharged(status.activeTalk.totalCharged);
          startTalkBillingLoop();
        }
      } else {
        setHostBusy(!!status.hostBusy);
        setHostBusyType(status.hostBusy ? (status.hostBusyType ?? 'talk') : null);
        if (status.pendingRequest?.id) {
          setTalkRequestId(status.pendingRequest.id);
          setTalkStatus('pending');
        }
      }
    } catch {
      // non-fatal
    }
  }, [token, sessionId, user?.id, startTalkBillingLoop]);

  const joinAcceptedCall = useCallback((data: {
    channelName?: string;
    requesterId?: string;
    hostId?: string;
    hostName?: string;
    hostAvatar?: string | null;
    ratePerMin?: number;
    beansPerMin?: number;
  }) => {
    if (!data?.channelName) return;
    if (engineRef.current) {
      const eng = engineRef.current;
      engineRef.current = null;
      eng.leaveChannel();
      setTimeout(() => {
        try { eng.release(); } catch {}
      }, 300);
    }
    if (socketRef.current) {
      try { socketRef.current.emit('leave_live', { sessionId }); } catch { /* ignore */ }
    }
    remoteUidRef.current = null;
    setRemoteUid(null);
    setAgoraReady(false);
    setCallStatus('accepted');
    setTimeout(() => {
      router.push({
        pathname: '/call',
        params: {
          channel: data.channelName,
          role: 'caller',
          peerId: String(data.hostId || streamData?.hostId || ''),
          peerName: data.hostName || streamData?.hostUsername || 'Host',
          peerAvatar: data.hostAvatar || streamData?.hostAvatar || '',
          ratePerMin: String(data.ratePerMin ?? hostRates.voiceRatePerMin),
          beansPerMin: data.beansPerMin != null ? String(data.beansPerMin) : '',
          fromLive: '1',
          accepted: '1',
          sessionId: String(sessionId || ''),
        },
      } as any);
    }, 400);
  }, [router, streamData, hostRates.voiceRatePerMin, sessionId]);

  const sendCallRequest = useCallback(async () => {
    if (!token || !sessionId || requestingCall) return;
    setRequestingCall(true);
    try {
      const res = await requestLiveCall(token, String(sessionId));
      if (res.alreadyAccepted && res.channelName) {
        joinAcceptedCall({
          channelName: res.channelName,
          hostId: streamData?.hostId,
          hostName: streamData?.hostUsername,
          hostAvatar: streamData?.hostAvatar,
          ratePerMin: hostRates.voiceRatePerMin,
          beansPerMin: hostRates.voiceBeansPerMin,
        });
        return;
      }
      if (res.requestId) {
        setCallRequestId(res.requestId);
        setCallStatus('pending');
        appAlert(
          'Call Request Sent',
          `Request sent to the host. Voice call at ₹${hostRates.voiceRatePerMin}/min once accepted. Host earns ${hostRates.voiceBeansPerMin} beans/min.`,
        );
      }
    } catch (e) {
      if (isInsufficientCallBalanceError(e)) {
        const data = e.data as { wallet_balance?: number };
        appAlert(
          'Recharge Required',
          `Please recharge your wallet first for voice calls.\n\nRate: ₹${hostRates.voiceRatePerMin}/min\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
      } else {
        appAlert('Error', e instanceof ApiError ? e.message : 'Call request failed');
      }
    } finally {
      setRequestingCall(false);
    }
  }, [token, sessionId, requestingCall, router, joinAcceptedCall, streamData, hostRates]);

  const refreshCallStatus = useCallback(async () => {
    if (!token || !sessionId || !user?.id) return;
    try {
      const status = await getLiveCallStatus(token, String(sessionId));
      if (status.pendingRequest?.id) {
        setCallRequestId(status.pendingRequest.id);
        setCallStatus('pending');
      } else if (status.acceptedCall?.channelName) {
        setCallStatus('accepted');
      }
    } catch {
      // non-fatal
    }
  }, [token, sessionId, user?.id]);

  const sendTalkRequest = useCallback(async () => {
    if (!token || !sessionId || requestingTalk) return;
    setRequestingTalk(true);
    try {
      const res = await requestLiveTalk(token, String(sessionId));
      if (res.alreadyActive && res.talkSessionId) {
        talkSessionIdRef.current = res.talkSessionId;
        setActiveTalkSessionId(res.talkSessionId);
        setPrivateChatOpen(true);
        setCanChat(true);
        setTalkStatus('active');
        startTalkBillingLoop();
        return;
      }
      if (res.requestId) {
        setTalkRequestId(res.requestId);
        setTalkStatus('pending');
        const chatRate = streamData?.hostChatRatePerMin ?? hostRates.chatRatePerMin;
        const chatBeans = streamData?.hostChatBeansPerMin ?? hostRates.chatBeansPerMin;
        appAlert('Request Sent', `Request sent to the host. Chat at ₹${chatRate}/min once accepted. Host earns ${chatBeans} beans/min.`);
      }
    } catch (e) {
      if (isInsufficientBalanceError(e)) {
        const data = e.data as { wallet_balance?: number };
        appAlert(
          'Recharge Required',
          `Please recharge your wallet first for live chat.\n\nRate: ₹${hostRates.chatRatePerMin}/min\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
      } else {
        appAlert('Error', e instanceof ApiError ? e.message : 'Request failed');
      }
    } finally {
      setRequestingTalk(false);
    }
  }, [token, sessionId, requestingTalk, router, startTalkBillingLoop, streamData, hostRates]);

  const promptTalkRequest = useCallback(() => {
    if (talkPromptShownRef.current || canChat || talkStatus === 'pending') return;
    talkPromptShownRef.current = true;
    appAlert(
      'Chat with the host?',
      `Send a request to chat with this live host.\n\n₹${hostRates.chatRatePerMin}/min from wallet\nHost earns ${hostRates.chatBeansPerMin} beans/min\nChat opens once accepted.`,
      [
        { text: 'Watch Only', style: 'cancel' },
        { text: 'Send Request', onPress: () => void sendTalkRequest() },
      ],
    );
  }, [canChat, talkStatus, sendTalkRequest, hostRates]);

  const teardownStream = useCallback(() => {
    clearTalkBilling();
    void finalizeTalkBilling();
    if (socketRef.current) {
      try { socketRef.current.emit('leave_live', { sessionId }); } catch { /* ignore */ }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setViewerSocket(null);
    if (engineRef.current) {
      try {
        engineRef.current.leaveChannel();
        engineRef.current.release();
      } catch { /* ignore */ }
      engineRef.current = null;
    }
    remoteUidRef.current = null;
    setRemoteUid(null);
    setAgoraReady(false);
    setStreamData(null);
    setLoading(true);
    setStreamEnded(false);
    setShowStickers(false);
    setPrivateChatOpen(false);
    setCanChat(false);
    setTalkStatus('idle');
    setCallStatus('idle');
    talkSessionIdRef.current = null;
    setActiveTalkSessionId(null);
  }, [clearTalkBilling, finalizeTalkBilling, sessionId]);

  useEffect(() => () => { teardownStream(); }, [teardownStream]);

  useEffect(() => {
    if (!isActive) {
      teardownStream();
      return;
    }
    if (sessionId) joinStream();
  }, [sessionId, isActive]);

  // Socket for viewer count & stream ended
  useEffect(() => {
    if (!isActive || !sessionId || !API_URL || !streamData) return;
    const s = io(API_URL, { transports: ['websocket'], auth: { token } });
    s.on('connect', () => {
      console.log('[Watch] viewer socket connected, joining live');
      if (user?.id) s.emit('join_user', { userId: user.id });
      s.emit('join_live', { sessionId: String(sessionId), userId: user?.id, username: user?.username });
    });
    s.on('viewer_count_update', (d: { count: number }) => setViewerCount(d.count));
    s.on('stream_ended', (data: { message?: string }) => {
      setStreamEnded(true);
      clearTalkBilling();
      void finalizeTalkBilling();
      if (feedMode && onStreamEnded) {
        onStreamEnded();
        return;
      }
      appAlert(
        'Stream Ended',
        data?.message || 'The host has ended the live stream.',
        [{ text: 'OK', onPress: () => (onClose ? onClose() : router.replace('/(tabs)/home')) }],
      );
    });
    s.on('live_talk_accepted', (data: { requestId?: string }) => {
      if (data?.requestId) {
        void beginTalkBilling(data.requestId);
      }
    });
    s.on('live_call_accepted', (data: {
      channelName?: string;
      hostId?: string;
      hostName?: string;
      hostAvatar?: string | null;
      ratePerMin?: number;
      beansPerMin?: number;
    }) => {
      joinAcceptedCall(data);
    });
    s.on('live_call_rejected', () => {
      setCallStatus('idle');
      setCallRequestId(null);
      appAlert('Call Declined', 'The host declined your call request.');
    });
    s.on('live_talk_rejected', () => {
      setTalkStatus('rejected');
      setTalkRequestId(null);
      appAlert('Request Declined', 'The host declined your chat request.');
    });
    s.on('talk_private_ready', (data: { talkSessionId?: string }) => {
      if (data?.talkSessionId) {
        talkSessionIdRef.current = data.talkSessionId;
        setActiveTalkSessionId(data.talkSessionId);
        setHostBusy(false);
        setHostBusyType(null);
      }
    });
    s.on('talk_private_ended', () => {
      talkSessionIdRef.current = null;
      setActiveTalkSessionId(null);
      setPrivateChatOpen(false);
      setCanChat(false);
      setTalkStatus('idle');
      setTalkMinutes(0);
      setTalkCharged(0);
      clearTalkBilling();
    });
    s.on('live_host_busy', (data: { busy?: boolean; type?: 'talk' | 'call' | null }) => {
      if (canChatRef.current) return;
      setHostBusy(!!data?.busy);
      setHostBusyType(data?.busy ? (data?.type ?? 'talk') : null);
    });
    socketRef.current = s;
    setViewerSocket(s);
    return () => { 
      try { s.emit('leave_live', { sessionId }); } catch {}
      s.disconnect(); 
      socketRef.current = null;
      setViewerSocket(null);
    };
  }, [sessionId, streamData, user?.id, user?.username, token, isActive, feedMode, onStreamEnded, onClose, clearTalkBilling, finalizeTalkBilling, beginTalkBilling, joinAcceptedCall, router]);

  useEffect(() => {
    if (!loading && streamData && talk === '1' && streamData.hostId !== user?.id) {
      promptTalkRequest();
    }
  }, [loading, streamData, talk, user?.id, promptTalkRequest]);

  useEffect(() => {
    if (!loading && streamData && token && sessionId) {
      void refreshTalkStatus();
      void refreshCallStatus();
    }
  }, [loading, streamData, token, sessionId, refreshTalkStatus, refreshCallStatus]);

  // Check follow status with host
  useEffect(() => {
    if (!streamData?.hostId || !token) return;
    void checkFollowStatus();
  }, [streamData?.hostId, token]);

  const checkFollowStatus = async () => {
    try {
      const data = await apiGet<{
        isFollowing?: boolean;
        isRequested?: boolean;
      }>(`/api/user/interaction?userId=${streamData?.hostId}`, token);
      setIsFollowing(!!data.isFollowing);
      setIsRequested(!!data.isRequested);
    } catch { }
  };

  const joinStream = async () => {
    try {
      const r = await apiPost<{
        appId?: string;
        token?: string;
        channelName?: string;
        uid?: number;
        hostUid?: number;
        hostFollowers?: number;
        hostId?: string;
        hostBusy?: boolean;
        hostBusyType?: 'talk' | 'call' | null;
      }>(`/api/live/join/${sessionId}`, {}, token);
      const hostId = r.hostId != null ? String(r.hostId) : r.hostId;
      const hostAgoraUid = typeof r.hostUid === 'number'
        ? r.hostUid
        : toAgoraUid(hostId);
      setStreamData({
        ...r,
        hostId,
        hostUid: hostAgoraUid,
      });
      setViewerCount(1);
      setHostFollowers(r.hostFollowers || 0);
      setHostBusy(!!r.hostBusy);
      setHostBusyType(r.hostBusy ? (r.hostBusyType ?? 'talk') : null);

      if (!isAgoraNativeLinked) {
        console.warn('[Watch] Agora native module not linked — video requires production/dev build');
        return;
      }

      if (!r.appId || !r.token || !r.channelName) {
        throw new Error('Stream connection details missing');
      }

      // Initialize Agora for viewer
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        }
        const engine = createAgoraRtcEngine();
        engine.initialize({
          appId: r.appId,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });

        const bindHostUid = (uid: number) => {
          if (!uid || uid === remoteUidRef.current) return;
          remoteUidRef.current = uid;
          setRemoteUid(uid);
          setHostCameraOff(false);
        };

        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            console.log('[Watch] Viewer joined Agora channel, subscribing to host uid', hostAgoraUid);
            setAgoraReady(true);
            bindHostUid(hostAgoraUid);
            try {
              const eng = engine as IRtcEngine & {
                muteRemoteVideoStream?: (uid: number, mute: boolean) => void;
                muteRemoteAudioStream?: (uid: number, mute: boolean) => void;
              };
              eng.muteRemoteVideoStream?.(hostAgoraUid, false);
              eng.muteRemoteAudioStream?.(hostAgoraUid, false);
            } catch { /* optional SDK APIs */ }
          },
          onUserJoined: (_conn: unknown, uid: number) => {
            if (uid === hostAgoraUid) bindHostUid(uid);
          },
          onUserOffline: (_conn: unknown, uid: number) => {
            if (uid === remoteUidRef.current) {
              remoteUidRef.current = null;
              setRemoteUid(null);
            }
          },
          onRemoteVideoStateChanged: (_conn: unknown, uid: number, state: number) => {
            if (uid === hostAgoraUid && state === 2) {
              bindHostUid(uid);
            }
          },
          onUserMuteVideo: (_conn: unknown, uid: number, muted: boolean) => {
            if (uid === hostAgoraUid || uid === remoteUidRef.current) {
              setHostCameraOff(muted);
            }
          },
          onError: (err: unknown, msg: unknown) => {
            console.error('[Watch] Agora viewer error:', err, msg);
          },
        });
        engine.setClientRole(ClientRoleType.ClientRoleAudience);
        engine.enableVideo();
        engine.enableAudio();

        const viewerUid = typeof r.uid === 'number' ? r.uid : toAgoraUid(user?.id);
        engine.joinChannel(r.token, r.channelName, viewerUid, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        engineRef.current = engine;
      } catch (agoraErr) {
        console.error('[Watch] Agora init error:', agoraErr);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to join stream';
      if (feedMode && onStreamEnded) {
        onStreamEnded();
      } else {
        appAlert('Error', msg, [{ text: 'OK', onPress: () => (onClose ? onClose() : router.replace('/(tabs)/home')) }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const leaveStream = () => {
    teardownStream();
    if (onClose) onClose();
    else router.replace('/(tabs)/home');
  };

  const handleFollow = useCallback(async () => {
    if (followLoading || !streamData?.hostId) return;
    setFollowLoading(true);
    try {
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
        followers_count?: number;
      }>(
        '/api/user/follow',
        { userId: streamData.hostId },
        token,
      );
      const state = parseFollowResponse(res);
      setIsFollowing(state.isFollowing);
      setIsRequested(state.isRequested);
      if (res.followers_count != null) setHostFollowers(res.followers_count);
      else if (res.action === 'followed') setHostFollowers((c) => c + 1);
      else if (res.action === 'unfollowed') setHostFollowers((c) => Math.max(0, c - 1));
    } catch { }
    setFollowLoading(false);
  }, [streamData?.hostId, followLoading, token]);

  useEffect(() => {
    if (!streamEnded || !feedMode || !onStreamEnded) return;
    const t = setTimeout(() => onStreamEnded(), 700);
    return () => clearTimeout(t);
  }, [streamEnded, feedMode, onStreamEnded]);

  if (!isActive) {
    const previewName = preview?.username || 'Host';
    const previewAvatar = preview?.avatar;
    const previewInitial = previewName.charAt(0).toUpperCase();
    const previewViewers = preview?.viewers_count ?? 0;
    return (
      <View style={s.container}>
        <LinearGradient colors={['#1a0a2e', '#12121a', '#0a0a14']} style={StyleSheet.absoluteFill} />
        <View style={s.previewCenter}>
          {previewAvatar ? (
            <Image source={{ uri: previewAvatar }} style={s.previewAvatar} />
          ) : (
            <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.previewAvatarFallback}>
              <Text style={s.previewAvatarText}>{previewInitial}</Text>
            </LinearGradient>
          )}
          <View style={s.previewLiveBadge}>
            <PulsingDot size={8} />
            <Text style={s.previewLiveText}>LIVE</Text>
          </View>
          <Text style={s.previewName}>{previewName}</Text>
          <Text style={s.previewViewers}>{formatViewers(previewViewers)} watching</Text>
        </View>
        {feedMode ? (
          <View style={s.swipeHint}>
            <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.45)" />
            <Text style={s.swipeHintText}>Swipe for more lives</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#1a0a1e', '#0a0a14', '#0a0a14']} style={s.loadingWrap}>
          <View style={s.loadingPulse}>
            <PulsingDot size={16} />
          </View>
          <Text style={s.loadingTitle}>Joining Stream</Text>
          <Text style={s.loadingSub}>Connecting to live...</Text>
        </LinearGradient>
      </View>
    );
  }

  // ── Stream ended state ──
  if (streamEnded && feedMode) {
    return (
      <View style={s.container}>
        <LinearGradient colors={['#1a0a1e', '#0a0a14']} style={s.loadingWrap}>
          <Text style={s.endedSub}>Stream ended — swiping to next...</Text>
        </LinearGradient>
      </View>
    );
  }

  if (streamEnded) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#1a0a1e', '#0a0a14']} style={s.loadingWrap}>
          <View style={s.endedIcon}>
            <Ionicons name="videocam-off" size={48} color="rgba(255,255,255,0.15)" />
          </View>
          <Text style={s.endedTitle}>Stream Ended</Text>
          <Text style={s.endedSub}>The host has ended the live stream</Text>
          <TouchableOpacity onPress={() => (onClose ? onClose() : router.replace('/(tabs)/home'))} activeOpacity={0.85}>
            <LinearGradient colors={['#FF2D55', '#FF6B8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.goHomeBtn}>
              <Ionicons name="home" size={18} color="#FFF" />
              <Text style={s.goHomeText}>Go Home</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  const hostInitial = (streamData?.hostUsername || 'H').charAt(0).toUpperCase();
  const hostAvatar = streamData?.hostAvatar || streamData?.host_avatar;
  const isViewer = streamData?.hostId !== user?.id;
  const hostAgoraUid = streamData?.hostUid ?? toAgoraUid(streamData?.hostId);
  const showHostVideo = isAgoraNativeLinked && agoraReady && !!hostAgoraUid;
  const showBusyOverlay = isViewer && hostBusy && !canChat;

  const handleVoiceCall = () => {
    if (!streamData?.hostId) return;
    if (hostBusy) {
      appAlert('Host Busy', 'The host is busy with someone right now. Please try again later.');
      return;
    }
    if (callStatus === 'pending') return;
    if (callStatus === 'accepted') {
      appAlert('Call Ready', 'Your call request was accepted. Joining the private call...');
      return;
    }
    appAlert(
      'Request Voice Call',
      `Send a call request to ${streamData.hostUsername}?\n\n₹${hostRates.voiceRatePerMin}/min from wallet once accepted\nHost earns ${hostRates.voiceBeansPerMin} beans/min`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Request', onPress: () => void sendCallRequest() },
      ],
    );
  };

  const handleChatRequest = () => {
    if (canChat && activeTalkSessionId) {
      setPrivateChatOpen(true);
      return;
    }
    if (hostBusy) {
      appAlert('Host Busy', 'The host is busy with someone right now. Please try again later.');
      return;
    }
    if (talkStatus === 'pending') return;
    void sendTalkRequest();
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {isActive ? <GiftSplashOverlay /> : null}

      {/* ═══ STREAM VIDEO ═══ */}
      <View style={StyleSheet.absoluteFill}>
        {showBusyOverlay ? (
          <HostBusyOverlay
            username={streamData?.hostUsername || 'Host'}
            avatar={hostAvatar}
            message="Busy with someone"
          />
        ) : showHostVideo ? (
          <>
            <RtcSurfaceView
              style={{ flex: 1 }}
              canvas={{ uid: remoteUid ?? hostAgoraUid }}
            />
            {/* Profile image overlay when host camera is OFF */}
            {hostCameraOff && (
              <View style={s.cameraOffOverlay}>
                <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={StyleSheet.absoluteFill} />
                <View style={s.cameraOffContent}>
                  {hostAvatar ? (
                    <Image source={{ uri: hostAvatar }} style={s.cameraOffAvatar} />
                  ) : (
                    <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.cameraOffAvatarFallback}>
                      <Text style={s.cameraOffAvatarText}>{hostInitial}</Text>
                    </LinearGradient>
                  )}
                  <Text style={s.cameraOffUsername}>{streamData?.hostUsername || 'Host'}</Text>
                  <View style={s.cameraOffBadge}>
                    <Ionicons name="videocam-off" size={14} color="#FF4466" />
                    <Text style={s.cameraOffBadgeText}>Camera Off</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        ) : (
          <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <ActivityIndicator size="large" color="#FF2D55" />
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
              {!isAgoraNativeLinked
                ? 'Live video requires the Crimzo app (not Expo Go). Install the production APK.'
                : agoraReady
                  ? 'Waiting for host video...'
                  : 'Connecting to stream...'}
            </Text>
          </LinearGradient>
        )}
      </View>

      {/* Top gradient overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.0)']} style={[s.topGrad, { pointerEvents: 'none' }]} />
      {/* Bottom gradient overlay */}
      <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']} style={[s.bottomGrad, { pointerEvents: 'none' }]} />

      {/* ═══ HEADER ═══ */}
      <SafeAreaView style={[s.headerSafe, { pointerEvents: 'box-none' }]} edges={['top']}>
        <Animated.View style={[s.headerRow, { opacity: headerFade }]}>
          {/* Host info pill */}
          <View style={s.hostPill}>
            <View style={s.hostAvatarWrap}>
              {hostAvatar ? (
                <Image source={{ uri: hostAvatar }} style={s.hostAvatarImg} />
              ) : (
                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.hostAvatarFallback}>
                  <Text style={s.hostAvatarText}>{hostInitial}</Text>
                </LinearGradient>
              )}
              {/* Online pulse */}
              <View style={s.onlineDot} />
            </View>

            <View style={s.hostInfo}>
              <Text style={s.hostName} numberOfLines={1}>{streamData?.hostUsername || 'Host'}</Text>
              <View style={s.viewerRow}>
                <Ionicons name="eye-outline" size={11} color="rgba(255,255,255,0.55)" />
                <Text style={s.viewerText}>{formatViewers(viewerCount)} viewers</Text>
              </View>
              {hostFollowers > 0 && (
                <View style={s.viewerRow}>
                  <Ionicons name="people-outline" size={11} color="rgba(255,255,255,0.4)" />
                  <Text style={s.viewerText}>{formatViewers(hostFollowers)} followers</Text>
                </View>
              )}
            </View>

            {/* Follow button */}
            {streamData?.hostId !== user?.id && (
              <TouchableOpacity onPress={handleFollow} activeOpacity={0.8} disabled={followLoading}>
                {isFollowing ? (
                  <View style={s.followingBtn}>
                    <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />
                  </View>
                ) : isRequested ? (
                  <View style={s.followingBtn}>
                    <Text style={s.followBtnText}>Requested</Text>
                  </View>
                ) : (
                  <LinearGradient colors={['#FF2D55', '#FF6B8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.followBtn}>
                    <Text style={s.followBtnText}>Follow</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Right side: close button */}
          <TouchableOpacity onPress={leaveStream} activeOpacity={0.7} style={s.closeBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* Call + Chat — highlighted above live chat input */}
      {isViewer && (
        <View style={[s.actionBar, { bottom: 62 + Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity
            style={[s.actionBarBtnWrap, {
              shadowColor: callStatus === 'pending' ? '#64748B' : '#10B981',
            }]}
            onPress={handleVoiceCall}
            disabled={hostBusy || requestingCall || callStatus === 'pending'}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={
                callStatus === 'pending'
                  ? ['#94A3B8', '#64748B', '#475569']
                  : ['#34D399', '#10B981', '#059669']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.actionBarBtn, (requestingCall || callStatus === 'pending') && s.actionBarBtnDisabled]}
            >
              <View style={s.actionBarIcon}>
                <Ionicons
                  name={callStatus === 'pending' ? 'time' : 'call'}
                  size={22}
                  color="#FFF"
                />
              </View>
              <View style={s.actionBarTextCol}>
                <Text style={s.actionBarTitle}>
                  {callStatus === 'pending' ? 'Calling...' : 'Call'}
                </Text>
                <Text style={s.actionBarRate}>₹{hostRates.voiceRatePerMin}/min</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBarBtnWrap, {
              shadowColor: talkStatus === 'active' ? '#F59E0B' : talkStatus === 'pending' ? '#64748B' : '#3B82F6',
            }]}
            onPress={handleChatRequest}
            disabled={hostBusy || requestingTalk || talkStatus === 'pending'}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={
                talkStatus === 'active'
                  ? ['#FBBF24', '#F59E0B', '#D97706']
                  : talkStatus === 'pending'
                    ? ['#94A3B8', '#64748B', '#475569']
                    : ['#60A5FA', '#3B82F6', '#2563EB']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.actionBarBtn, (requestingTalk || talkStatus === 'pending') && s.actionBarBtnDisabled]}
            >
              <View style={s.actionBarIcon}>
                <Ionicons
                  name={talkStatus === 'active' ? 'chatbubble' : talkStatus === 'pending' ? 'time' : 'chatbubble-ellipses'}
                  size={22}
                  color="#FFF"
                />
              </View>
              <View style={s.actionBarTextCol}>
                <Text style={s.actionBarTitle}>
                  {talkStatus === 'active' ? 'Chatting' : talkStatus === 'pending' ? 'Pending' : 'Chat'}
                </Text>
                <Text style={s.actionBarRate}>₹{hostRates.chatRatePerMin}/min</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Talk billing status */}
      {isViewer && hostBusy && !canChat && talkStatus === 'idle' && callStatus === 'idle' && (
        <View style={s.talkBanner}>
          <Text style={s.talkBannerText}>Host is busy in a private session</Text>
        </View>
      )}

      {isViewer && (talkStatus === 'active' || talkStatus === 'pending' || callStatus === 'pending') && (
        <View style={s.talkBanner}>
          <Text style={s.talkBannerText}>
            {talkStatus === 'active'
              ? `Live chat · ₹${talkCharged || hostRates.chatRatePerMin} charged · ${talkMinutes} min${walletBalance != null ? ` · Bal ₹${walletBalance}` : ''}`
              : callStatus === 'pending' && talkStatus === 'pending'
                ? 'Chat & call requests sent — waiting for host...'
                : callStatus === 'pending'
                  ? 'Call request sent — waiting for host to accept...'
                  : 'Chat request sent — waiting for host to accept...'}
          </Text>
        </View>
      )}

      {/* ═══ PRIVATE 1-ON-1 CHAT (paid talk — invisible to other viewers) ═══ */}
      {canChat && activeTalkSessionId && sessionId && user && streamData?.hostId && (
        <PrivateTalkChat
          visible={privateChatOpen}
          talkSessionId={activeTalkSessionId}
          sessionId={String(sessionId)}
          userId={user.id}
          username={user.username}
          peerUserId={String(streamData.hostId)}
          peerUsername={streamData.hostUsername || 'Host'}
          isHost={false}
          sharedSocket={viewerSocket}
          onGiftPress={() => setShowStickers(true)}
          onClose={exitPrivateChat}
          onEnd={() => {
            clearTalkBilling();
            setCanChat(false);
            setTalkStatus('idle');
            setActiveTalkSessionId(null);
            setPrivateChatOpen(false);
            talkSessionIdRef.current = null;
            setTalkMinutes(0);
            setTalkCharged(0);
          }}
        />
      )}

      {canChat && !privateChatOpen && (
        <TouchableOpacity
          style={[s.privateChatFab, { bottom: 130 + Math.max(insets.bottom, 8) }]}
          onPress={() => setPrivateChatOpen(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="lock-closed" size={14} color="#E9D5FF" />
          <Text style={s.privateChatFabText}>Private chat</Text>
        </TouchableOpacity>
      )}

      {/* ═══ PUBLIC LIVE CHAT (read-only for viewers; host broadcast only) ═══ */}
      {sessionId && user && token && !canChat && (
        <LiveChat
          sessionId={sessionId as string}
          userId={user.id}
          username={user.username}
          token={token}
          isHost={false}
          hostUserId={streamData?.hostId ? String(streamData.hostId) : undefined}
          canChat={false}
          talkRatePerMin={hostRates.chatRatePerMin}
          sharedSocket={viewerSocket}
          onStickerPress={() => setShowStickers(true)}
        />
      )}

      {/* ═══ STICKER PANEL ═══ */}
      {feedMode ? (
        <View style={[s.swipeHint, { bottom: 18 + Math.max(insets.bottom, 8) }]} pointerEvents="none">
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.4)" />
          <Text style={s.swipeHintText}>Swipe up · more lives</Text>
        </View>
      ) : null}

      {token && (
        <StickerPanel
          visible={showStickers}
          onClose={() => setShowStickers(false)}
          token={token}
          receiverId={streamData?.hostId != null ? String(streamData.hostId) : undefined}
          receiverUsername={streamData?.hostUsername || 'Host'}
          sessionId={sessionId as string}
          talkSessionId={canChat && activeTalkSessionId ? activeTalkSessionId : undefined}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  previewCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  previewAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  previewAvatarFallback: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { color: '#FFF', fontSize: 44, fontWeight: '900' },
  previewLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: 'rgba(255,45,85,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.35)',
  },
  previewLiveText: { color: '#FF6B8A', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  previewName: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 12 },
  previewViewers: { color: 'rgba(255,255,255,0.45)', fontSize: 14, marginTop: 6, fontWeight: '600' },
  swipeHint: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  swipeHintText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },

  // Camera off overlay (when host turns off camera)
  cameraOffOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  cameraOffContent: { alignItems: 'center', gap: 12 },
  cameraOffAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: 'rgba(255,255,255,0.15)' },
  cameraOffAvatarFallback: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.15)' },
  cameraOffAvatarText: { color: '#FFF', fontSize: 48, fontWeight: '800' },
  cameraOffUsername: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 4 },
  cameraOffBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,45,85,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  cameraOffBadgeText: { color: '#FF4466', fontSize: 13, fontWeight: '700' },

  // Loading / Ended
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingPulse: { marginBottom: 8 },
  loadingTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  loadingSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  endedIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  endedTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  endedSub: { color: 'rgba(255,255,255,0.35)', fontSize: 14, marginTop: 4 },
  goHomeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 28, shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  goHomeText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Gradients
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, zIndex: 5 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 250, zIndex: 5 },

  // Header
  headerSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },

  // Host pill
  hostPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 28, paddingLeft: 4, paddingRight: 6, paddingVertical: 4, gap: 8, maxWidth: SW * 0.72, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  hostAvatarWrap: { width: 40, height: 40, borderRadius: 20, position: 'relative' },
  hostAvatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  hostAvatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  hostAvatarText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#34D399', borderWidth: 2, borderColor: 'rgba(0,0,0,0.6)' },
  hostInfo: { flex: 1 },
  hostName: { color: '#FFF', fontSize: 14, fontWeight: '700', maxWidth: 140 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  viewerText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500' },

  // Follow button
  followBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18, shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  followBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  followingBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  // Close
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  talkBanner: {
    position: 'absolute',
    top: 120,
    left: 14,
    right: 14,
    zIndex: 25,
    alignItems: 'center',
  },
  talkBannerText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  talkRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  talkRequestText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  privateChatFab: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(109,40,217,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  privateChatFabText: { color: '#F5F3FF', fontSize: 13, fontWeight: '800' },

  actionBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
    flexDirection: 'row',
    gap: 10,
  },
  actionBarBtnWrap: {
    flex: 1,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 14,
  },
  actionBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  actionBarBtnDisabled: { opacity: 0.72 },
  actionBarIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  actionBarTextCol: { flex: 1 },
  actionBarTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionBarRate: {
    color: '#FFFDE7',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
