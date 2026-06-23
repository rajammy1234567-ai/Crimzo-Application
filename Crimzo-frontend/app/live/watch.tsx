import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  Image,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  requestLiveTalk,
  getLiveTalkStatus,
  startLiveTalkBilling,
  tickLiveTalkBilling,
  endLiveTalkBilling,
  isInsufficientBalanceError,
  isBalanceExhaustedError,
  LIVE_TALK_RATE_PER_MIN,
} from '../../lib/liveTalkBilling';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import LiveChat from '../../components/LiveChat';
import StickerPanel from '../../components/StickerPanel';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  type IRtcEngine,
} from '../../components/agoraImports';

import { API_URL, apiGet, apiPost, ApiError } from '../../lib/apiClient';
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

export default function WatchScreen() {
  const { sessionId, talk } = useLocalSearchParams<{ sessionId?: string; talk?: string }>();
  const { user, token, updateUser } = useAuth();
  const router = useRouter();
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
  const engineRef = useRef<IRtcEngine | null>(null);
  const billingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const talkSessionIdRef = useRef<string | null>(null);
  const talkPromptShownRef = useRef(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [hostCameraOff, setHostCameraOff] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const [talkRequestId, setTalkRequestId] = useState<string | null>(null);
  const [talkStatus, setTalkStatus] = useState<'idle' | 'pending' | 'active' | 'rejected'>('idle');
  const [talkMinutes, setTalkMinutes] = useState(0);
  const [talkCharged, setTalkCharged] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [requestingTalk, setRequestingTalk] = useState(false);

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
    if (!token || !sessionId || !talkSessionIdRef.current) return;
    try {
      await endLiveTalkBilling(token, {
        sessionId: String(sessionId),
        talkSessionId: talkSessionIdRef.current,
      });
    } catch {
      // non-fatal
    }
    talkSessionIdRef.current = null;
    setCanChat(false);
    setTalkStatus('idle');
  }, [token, sessionId]);

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
          Alert.alert('Balance Low', 'Insufficient balance for the next minute. Ending the chat.', [
            { text: 'OK', onPress: () => void finalizeTalkBilling() },
          ]);
        }
      } catch (e) {
        if (isBalanceExhaustedError(e)) {
          clearTalkBilling();
          void finalizeTalkBilling();
          Alert.alert('Balance Over', 'Wallet balance exhausted — you can no longer chat.');
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
        setCanChat(true);
        setTalkStatus('active');
        if (billing.wallet_balance != null) {
          setWalletBalance(billing.wallet_balance);
          updateUser({ wallet_balance: billing.wallet_balance });
        }
        if (billing.minutesCharged != null) setTalkMinutes(billing.minutesCharged);
        if (billing.totalCharged != null) setTalkCharged(billing.totalCharged);
        startTalkBillingLoop();
        Alert.alert('Connected!', `You can now chat with the host. ₹${LIVE_TALK_RATE_PER_MIN}/min is being charged.`);
      }
    } catch (e) {
      Alert.alert('Billing Error', e instanceof ApiError ? e.message : 'Could not start talk billing');
    }
  }, [token, sessionId, startTalkBillingLoop, updateUser]);

  const refreshTalkStatus = useCallback(async () => {
    if (!token || !sessionId || !user?.id) return;
    try {
      const status = await getLiveTalkStatus(token, String(sessionId));
      if (status.wallet_balance != null) setWalletBalance(status.wallet_balance);
      if (status.canChat) {
        setCanChat(true);
        setTalkStatus('active');
        if (status.activeTalk?.id) {
          talkSessionIdRef.current = status.activeTalk.id;
          setTalkMinutes(status.activeTalk.minutesCharged);
          setTalkCharged(status.activeTalk.totalCharged);
          startTalkBillingLoop();
        }
      } else if (status.pendingRequest?.id) {
        setTalkRequestId(status.pendingRequest.id);
        setTalkStatus('pending');
      }
    } catch {
      // non-fatal
    }
  }, [token, sessionId, user?.id, startTalkBillingLoop]);

  const sendTalkRequest = useCallback(async () => {
    if (!token || !sessionId || requestingTalk) return;
    setRequestingTalk(true);
    try {
      const res = await requestLiveTalk(token, String(sessionId));
      if (res.alreadyActive && res.talkSessionId) {
        talkSessionIdRef.current = res.talkSessionId;
        setCanChat(true);
        setTalkStatus('active');
        startTalkBillingLoop();
        return;
      }
      if (res.requestId) {
        setTalkRequestId(res.requestId);
        setTalkStatus('pending');
        Alert.alert('Request Sent', `Request sent to the host. Chat will start at ₹${LIVE_TALK_RATE_PER_MIN}/min once accepted.`);
      }
    } catch (e) {
      if (isInsufficientBalanceError(e)) {
        const data = e.data as { wallet_balance?: number };
        Alert.alert(
          'Recharge Required',
          `Please recharge your wallet first for live talk.\n\nRate: ₹${LIVE_TALK_RATE_PER_MIN}/min\nBalance: ₹${(data.wallet_balance || 0).toLocaleString('en-IN')}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Money', onPress: () => router.push('/profile/wallet' as any) },
          ],
        );
      } else {
        Alert.alert('Error', e instanceof ApiError ? e.message : 'Request failed');
      }
    } finally {
      setRequestingTalk(false);
    }
  }, [token, sessionId, requestingTalk, router, startTalkBillingLoop]);

  const promptTalkRequest = useCallback(() => {
    if (talkPromptShownRef.current || canChat || talkStatus === 'pending') return;
    talkPromptShownRef.current = true;
    Alert.alert(
      'Chat with the host?',
      `You need to send a request to chat with this live host.\n\nRate: ₹${LIVE_TALK_RATE_PER_MIN}/min (from wallet)\nChat opens once the host accepts.`,
      [
        { text: 'Watch Only', style: 'cancel' },
        { text: 'Send Request', onPress: () => void sendTalkRequest() },
      ],
    );
  }, [canChat, talkStatus, sendTalkRequest]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearTalkBilling();
      void finalizeTalkBilling();
      if (socketRef.current) {
        socketRef.current.emit('leave_live', { sessionId });
        socketRef.current.disconnect();
      }
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
    };
  }, [clearTalkBilling, finalizeTalkBilling, sessionId]);

  // Join stream
  useEffect(() => {
    if (sessionId) joinStream();
  }, [sessionId]);

  // Socket for viewer count & stream ended
  useEffect(() => {
    if (!sessionId || !API_URL || !streamData) return;
    const s = io(API_URL, { transports: ['websocket'], auth: { token } });
    s.on('connect', () => {
      console.log('[Watch] viewer socket connected, joining live');
      s.emit('join_live', { sessionId, userId: user?.id, username: user?.username });
    });
    s.on('viewer_count_update', (d: { count: number }) => setViewerCount(d.count));
    s.on('stream_ended', (data: { message?: string }) => {
      setStreamEnded(true);
      clearTalkBilling();
      void finalizeTalkBilling();
      Alert.alert(
        'Stream Ended',
        data?.message || 'The host has ended the live stream.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }],
      );
    });
    s.on('live_talk_accepted', (data: { requestId?: string }) => {
      if (data?.requestId) {
        void beginTalkBilling(data.requestId);
      }
    });
    s.on('live_talk_rejected', () => {
      setTalkStatus('rejected');
      setTalkRequestId(null);
      Alert.alert('Request Declined', 'The host declined your chat request.');
    });
    socketRef.current = s;
    return () => { 
      try { s.emit('leave_live', { sessionId }); } catch {}
      s.disconnect(); 
      socketRef.current = null; 
    };
  }, [sessionId, streamData, user?.id, user?.username, token, clearTalkBilling, finalizeTalkBilling, beginTalkBilling]);

  useEffect(() => {
    if (!loading && streamData && talk === '1' && streamData.hostId !== user?.id) {
      promptTalkRequest();
    }
  }, [loading, streamData, talk, user?.id, promptTalkRequest]);

  useEffect(() => {
    if (!loading && streamData && token && sessionId) {
      void refreshTalkStatus();
    }
  }, [loading, streamData, token, sessionId, refreshTalkStatus]);

  // Check follow status
  useEffect(() => {
    if (!streamData?.hostId || !token) return;
    checkFollowStatus();
  }, [streamData?.hostId]);

  const checkFollowStatus = async () => {
    try {
      const data = await apiGet<{ following?: { id: string }[] }>(
        `/api/user/following/${user?.id}`,
        token,
      );
      const ids = (data.following || []).map((f) => f.id);
      setIsFollowing(ids.includes(streamData?.hostId));
    } catch { }
  };

  const joinStream = async () => {
    try {
      const r = await apiPost<{
        appId?: string;
        token?: string;
        channelName?: string;
        uid?: number;
        hostFollowers?: number;
        hostId?: string;
      }>(`/api/live/join/${sessionId}`, {}, token);
      setStreamData(r);
      setViewerCount(1);
      setHostFollowers(r.hostFollowers || 0);

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
        engine.registerEventHandler({
          onJoinChannelSuccess: () => { console.log('Viewer joined Agora channel'); },
          onUserJoined: (_conn: any, uid: number) => { setRemoteUid(uid); setHostCameraOff(false); },
          onUserOffline: (_conn: any, uid: number) => { if (uid === remoteUid) setRemoteUid(null); },
          onUserMuteVideo: (_conn: any, uid: number, muted: boolean) => { setHostCameraOff(muted); },
          onError: (err: any, msg: any) => { console.error('Agora viewer error:', err, msg); },
        });
        engine.setClientRole(ClientRoleType.ClientRoleAudience);
        engine.enableVideo();
        engine.enableAudio();

        // Use numeric uid returned from backend (or derive)
        const viewerUid = r.uid;
        const numericUid = typeof viewerUid === 'number' ? viewerUid : (parseInt(String(user?.id || 0).replace(/\D/g, '').slice(-9)) || 12345);
        engine.joinChannel(r.token!, r.channelName!, numericUid, {
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        engineRef.current = engine;
      } catch (agoraErr) {
        console.error('Agora init error for viewer:', agoraErr);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to join stream';
      Alert.alert('Error', msg, [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]);
    } finally {
      setLoading(false);
    }
  };

  const leaveStream = () => {
    clearTalkBilling();
    void finalizeTalkBilling();
    if (socketRef.current) { socketRef.current.emit('leave_live', { sessionId }); socketRef.current.disconnect(); socketRef.current = null; }
    if (engineRef.current) { engineRef.current.leaveChannel(); engineRef.current.release(); engineRef.current = null; }
    router.replace('/(tabs)/home');
  };

  const handleFollow = useCallback(async () => {
    if (followLoading || !streamData?.hostId) return;
    setFollowLoading(true);
    try {
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
      }>(
        '/api/user/follow',
        { userId: streamData.hostId },
        token,
      );
      setIsFollowing(res.isFollowing ?? (res.action === 'followed' || res.action === 'accepted'));
      setIsRequested(res.isRequested ?? res.action === 'requested');
    } catch { }
    setFollowLoading(false);
  }, [streamData?.hostId, followLoading, token]);

  const handleSendSticker = (sticker: any) => {
    if (!sessionId || !socketRef.current) return;
    socketRef.current.emit('live_send_sticker', {
      sessionId, userId: user?.id, username: user?.username,
      stickerId: sticker.id != null ? String(sticker.id) : undefined, emoji: sticker.emoji, stickerName: sticker.name,
      icon_name: sticker.icon_name, icon_color: sticker.icon_color, bg_color: sticker.bg_color,
    });
  };

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
          <TouchableOpacity onPress={() => router.replace('/(tabs)/home')} activeOpacity={0.85}>
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

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══ STREAM VIDEO ═══ */}
      <View style={StyleSheet.absoluteFill}>
        {remoteUid ? (
          <>
            <RtcSurfaceView
              style={{ flex: 1 }}
              canvas={{ uid: remoteUid }}
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
          <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#FF2D55" />
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>Connecting to stream...</Text>
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

      {/* Talk request / billing banner */}
      {streamData?.hostId !== user?.id && (
        <View style={s.talkBanner}>
          {talkStatus === 'active' ? (
            <Text style={s.talkBannerText}>
              Live chat active · ₹{talkCharged || LIVE_TALK_RATE_PER_MIN} charged · {talkMinutes} min
              {walletBalance != null ? ` · Bal ₹${walletBalance}` : ''}
            </Text>
          ) : talkStatus === 'pending' ? (
            <Text style={s.talkBannerText}>Request sent — waiting for host to accept...</Text>
          ) : (
            <TouchableOpacity onPress={() => void sendTalkRequest()} disabled={requestingTalk} activeOpacity={0.85}>
              <LinearGradient colors={['#FFD700', '#FF9500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.talkRequestBtn}>
                <Ionicons name="chatbubbles" size={16} color="#FFF" />
                <Text style={s.talkRequestText}>
                  {requestingTalk ? 'Sending...' : `Chat with host · ₹${LIVE_TALK_RATE_PER_MIN}/min`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ═══ LIVE CHAT OVERLAY ═══ */}
      {sessionId && user && token && (
        <LiveChat
          sessionId={sessionId as string}
          userId={user.id}
          username={user.username}
          token={token}
          isHost={false}
          hostUserId={streamData?.hostId}
          canChat={canChat}
          talkRatePerMin={LIVE_TALK_RATE_PER_MIN}
          onStickerPress={() => setShowStickers(true)}
        />
      )}

      {/* ═══ STICKER PANEL ═══ */}
      {token && (
        <StickerPanel
          visible={showStickers}
          onClose={() => setShowStickers(false)}
          onSendSticker={handleSendSticker}
          token={token}
          receiverId={streamData?.hostId}
          sessionId={sessionId as string}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

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
});
