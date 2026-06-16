import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Modal,
  Image,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import LiveChat from '../../components/LiveChat';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../../components/agoraImports';

import { API_URL, apiGet, apiPost, ApiError } from '../../lib/apiClient';

const LIVE_START_TIMEOUT_MS = 10000;
const LOADING_SAFETY_MS = 15000;

const { width: SW, height: SH } = Dimensions.get('window');

// Timer duration options
const TIMER_OPTIONS = [
  { label: 'No Limit', value: 0 },
  { label: '10 Minutes', value: 10 * 60 },
  { label: '30 Minutes', value: 30 * 60 },
  { label: '1 Hour', value: 60 * 60 },
  { label: '2 Hours', value: 2 * 60 * 60 },
  { label: '3 Hours', value: 3 * 60 * 60 },
];

// ── Sub-Components ──

const PulsingDot = React.memo(() => {
  const pulse = useRef(new Animated.Value(1)).current;
  const opac = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(pulse, { toValue: 2, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(opac, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.timing(opac, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55', transform: [{ scale: pulse }], opacity: opac }} />
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#FF4466' }} />
    </View>
  );
});

const LiveTimer = React.memo(({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime]);
  const m = Math.floor(elapsed / 60), s = elapsed % 60;
  return <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</Text>;
});

const CountdownTimer = React.memo(({ duration, startTime, onExpired }: { duration: number; startTime: number; onExpired: () => void }) => {
  const [remaining, setRemaining] = useState(duration);
  useEffect(() => {
    const iv = setInterval(() => {
      const rem = Math.max(0, duration - Math.floor((Date.now() - startTime) / 1000));
      setRemaining(rem);
      if (rem <= 0) { clearInterval(iv); onExpired(); }
    }, 1000);
    return () => clearInterval(iv);
  }, [duration, startTime]);
  const m = Math.floor(remaining / 60), secs = remaining % 60;
  const isLow = remaining <= 60;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isLow ? 'rgba(255,45,85,0.3)' : 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
      <Ionicons name="timer-outline" size={12} color={isLow ? '#FF4466' : 'rgba(255,255,255,0.6)'} />
      <Text style={{ color: isLow ? '#FF4466' : 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' }}>{String(m).padStart(2, '0')}:{String(secs).padStart(2, '0')}</Text>
    </View>
  );
});

const GoLiveGlow = React.memo(() => {
  const s1 = useRef(new Animated.Value(1)).current;
  const o1 = useRef(new Animated.Value(0.3)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const o2 = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(s1, { toValue: 1.3, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(s1, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(o1, { toValue: 0.05, duration: 1800, useNativeDriver: true }),
        Animated.timing(o1, { toValue: 0.3, duration: 1800, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(s2, { toValue: 1.5, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(s2, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(o2, { toValue: 0, duration: 2000, useNativeDriver: true }),
        Animated.timing(o2, { toValue: 0.15, duration: 2000, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: '#FF2D55', transform: [{ scale: s1 }], opacity: o1 }} />
      <Animated.View style={{ position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: '#FF2D55', transform: [{ scale: s2 }], opacity: o2 }} />
    </View>
  );
});

function formatViewers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// ═══════════════════════════════════════════════════
// ── Main Component ──
// ═══════════════════════════════════════════════════
export default function BroadcastScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveStartTime, setLiveStartTime] = useState(0);
  const socketRef = useRef<any>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);

  // Controls state
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const useExpoCamera = !isAgoraNativeLinked;

  // Timer state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(0);
  const [timerExpired, setTimerExpired] = useState(false);

  // Entrance animation
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    requestPermissions().catch(() => {});
    if (useExpoCamera) {
      requestCameraPermission();
      requestMicPermission();
    }
  }, [useExpoCamera]);

  useEffect(() => {
    if (token) {
      apiGet('/api/health', token, 5000).catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    if (!loading) return;
    const safety = setTimeout(() => setLoading(false), LOADING_SAFETY_MS);
    return () => clearTimeout(safety);
  }, [loading]);

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
    };
  }, []);

  // Socket for viewer count
  useEffect(() => {
    if (!isLive || !sessionId || !API_URL) return;
    const s = io(API_URL, { transports: ['websocket'], auth: { token } });
    s.on('connect', () => {
      console.log('[Broadcast] viewer socket connected, joining live');
      s.emit('join_live', { sessionId, userId: user?.id, username: user?.username });
    });
    s.on('viewer_count_update', (d: { count: number }) => setViewerCount(Math.max(0, d.count - 1)));
    s.on('stream_ended', async (data: { message?: string }) => {
      setIsLive(false);
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
      if (sessionId) {
        try { await apiPost(`/api/live/end/${sessionId}`, {}, token); } catch { }
      }
      Alert.alert(
        'Stream Ended',
        data?.message || 'Your live stream was ended by a moderator.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }],
      );
    });
    socketRef.current = s;
    return () => { 
      try { s.emit('leave_live', { sessionId }); } catch {}
      s.disconnect(); 
      socketRef.current = null; 
    };
  }, [isLive, sessionId, user?.id, user?.username, token, router]);

  const handleTimerExpired = useCallback(() => {
    if (timerExpired) return;
    setTimerExpired(true);
    Alert.alert('Time Up!', 'Your stream duration has ended.', [{
      text: 'OK', onPress: async () => {
        if (sessionId) {
          try { await apiPost(`/api/live/end/${sessionId}`, {}, token); } catch { }
          setIsLive(false); router.replace('/(tabs)/home');
        }
      }
    }]);
  }, [sessionId, token, router, timerExpired]);

  const toggleCamera = useCallback(() => {
    if (!useExpoCamera) {
      engineRef.current?.switchCamera();
    }
    setFacing(c => c === 'back' ? 'front' : 'back');
  }, [useExpoCamera]);
  const toggleMic = useCallback(() => {
    setMicEnabled(prev => {
      if (engineRef.current && typeof engineRef.current.muteLocalAudioStream === 'function') {
        engineRef.current.muteLocalAudioStream(prev); // prev=true means currently on, so mute it
      }
      return !prev;
    });
  }, []);
  const toggleCameraOnOff = useCallback(() => {
    setCameraEnabled(prev => {
      if (engineRef.current && typeof engineRef.current.muteLocalVideoStream === 'function') {
        engineRef.current.muteLocalVideoStream(prev); // prev is current, muting it
      }
      return !prev;
    });
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }
  };

  const initBroadcastMedia = useCallback(async (
    channelName: string,
    agoraToken: string,
    appId: string,
    hostUid: number,
  ) => {
    if (isAgoraNativeLinked) {
      const engine = createAgoraRtcEngine();
      engine.initialize({
        appId,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });
      engine.registerEventHandler({
        onJoinChannelSuccess: () => { console.log('[Broadcast] Host joined Agora channel'); },
        onError: (err: unknown, msg: unknown) => { console.error('[Broadcast] Agora error:', err, msg); },
      });
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.enableVideo();
      engine.enableAudio();
      engine.startPreview();

      const numericUid = typeof hostUid === 'number'
        ? hostUid
        : (parseInt(String(user?.id || 0).replace(/\D/g, '').slice(-9)) || 12345);
      engine.joinChannel(agoraToken, channelName, numericUid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      engineRef.current = engine;

      if (!micEnabled && typeof engine.muteLocalAudioStream === 'function') {
        engine.muteLocalAudioStream(true);
      }
      if (!cameraEnabled && typeof engine.muteLocalVideoStream === 'function') {
        engine.muteLocalVideoStream(true);
      }

      setAgoraReady(true);
      return;
    }

    let camGranted = cameraPermission?.granted;
    if (!camGranted) {
      const cam = await requestCameraPermission();
      camGranted = cam.granted;
    }
    if (!camGranted) {
      Alert.alert(
        'Camera Permission',
        'Camera access is needed for live preview. You can still go live — viewers will see your profile until camera is allowed.',
      );
    }
    if (!micPermission?.granted) {
      await requestMicPermission();
    }
    setAgoraReady(false);
  }, [user?.id, cameraPermission, micPermission, requestCameraPermission, requestMicPermission, micEnabled, cameraEnabled]);

  const startBroadcast = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Web Limitation', 'Live broadcast with camera is not fully supported on web. Please use the mobile app (Android/iOS) for full camera and streaming features.');
      return;
    }
    if (!token) {
      Alert.alert('Login Required', 'Please log in to go live.');
      return;
    }
    setLoading(true);
    try {
      await Promise.race([
        requestPermissions(),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);

      const r = await apiPost<{
        success?: boolean;
        sessionId: string;
        channelName: string;
        token: string;
        appId: string;
        uid: number;
        error?: string;
        detail?: string;
      }>(
        '/api/live/start',
        { location: user?.country || 'Unknown' },
        token,
        LIVE_START_TIMEOUT_MS,
      );

      if (!r?.sessionId) {
        throw new ApiError(r?.error || r?.detail || 'Could not start live session', 500, r);
      }

      const { sessionId: sid, channelName, token: agoraToken, appId, uid: hostUid } = r;

      setSessionId(sid);
      setIsLive(true);
      setLiveStartTime(Date.now());
      setTimerExpired(false);
      setLoading(false);

      void initBroadcastMedia(channelName, agoraToken, appId, hostUid).catch((mediaErr) => {
        console.error('[Broadcast] Media init failed (stream is live):', mediaErr);
      });
    } catch (e: unknown) {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
      setAgoraReady(false);
      const msg = e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Failed to start broadcast.';
      Alert.alert('Go Live Failed', msg);
      setLoading(false);
    }
  }, [user, token, initBroadcastMedia]);

  const endBroadcast = useCallback(async () => {
    if (!sessionId) return;
    Alert.alert('End Stream', 'Are you sure you want to end your live stream?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Stream', style: 'destructive', onPress: async () => {
          try { await apiPost(`/api/live/end/${sessionId}`, {}, token); } catch { }
          if (engineRef.current) { engineRef.current.leaveChannel(); engineRef.current.release(); engineRef.current = null; }
          setAgoraReady(false); setIsLive(false); router.replace('/(tabs)/home');
        }
      },
    ]);
  }, [sessionId, token, router]);

  const handleGoBack = useCallback(() => {
    if (isLive) endBroadcast();
    else { engineRef.current = null; router.back(); }
  }, [isLive, endBroadcast, router]);

  const noopPress = useCallback(() => { }, []);
  const selectedTimerLabel = TIMER_OPTIONS.find(o => o.value === selectedDuration)?.label || 'No Limit';
  const avatarUri = user?.avatar;
  const initial = (user?.username || 'U').charAt(0).toUpperCase();

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ═══ CAMERA VIEW ═══ */}
      <View style={st.cameraWrap}>
        {agoraReady ? (
          <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} />
        ) : useExpoCamera && cameraPermission?.granted && cameraEnabled ? (
          <CameraView style={{ flex: 1 }} facing={facing} mode="video" />
        ) : (
          <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="videocam" size={56} color="rgba(255,255,255,0.06)" />
            <Text style={{ color: 'rgba(255,255,255,0.15)', fontSize: 13, marginTop: 8 }}>
              {useExpoCamera ? 'Allow camera to preview' : 'Camera Preview'}
            </Text>
          </LinearGradient>
        )}

        {!cameraEnabled && (agoraReady || (useExpoCamera && isLive)) && (
          <View style={st.cameraOffOverlay}>
            <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={StyleSheet.absoluteFill} />
            <View style={st.cameraOffContent}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={st.cameraOffAvatar} />
              ) : (
                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.cameraOffAvatarFallback}>
                  <Text style={st.cameraOffAvatarText}>{initial}</Text>
                </LinearGradient>
              )}
              <Text style={st.cameraOffUsername}>{user?.username || 'Host'}</Text>
              <View style={st.cameraOffBadge}>
                <Ionicons name="videocam-off" size={14} color="#FF4466" />
                <Text style={st.cameraOffBadgeText}>Camera Off</Text>
              </View>
            </View>
          </View>
        )}

        {useExpoCamera && isLive && (
          <View style={st.devModeBanner}>
            <Text style={st.devModeBannerText}>Dev mode: viewers need production build for HD stream</Text>
          </View>
        )}
      </View>

      {/* Gradient overlays */}
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={[st.topGrad, { pointerEvents: 'none' }]} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={[st.bottomGrad, { pointerEvents: 'none' }]} />

      {/* ═══ OVERLAY ═══ */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none', zIndex: 20, elevation: 20 }]}>

        {/* ── HEADER ── */}
        <SafeAreaView style={[st.headerWrap, { pointerEvents: 'box-none' }]} edges={['top']}>
          <View style={st.headerRow}>
            {/* Back / Close */}
            <TouchableOpacity onPress={handleGoBack} activeOpacity={0.7}>
              <View style={st.iconBtn}>
                <Ionicons name={isLive ? 'close' : 'arrow-back'} size={22} color="#FFF" />
              </View>
            </TouchableOpacity>

            {/* LIVE badge */}
            {isLive && (
              <LinearGradient colors={['#FF2D55', '#FF6B8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.liveBadge}>
                <PulsingDot />
                <Text style={st.liveBadgeText}>LIVE</Text>
                {liveStartTime > 0 && <LiveTimer startTime={liveStartTime} />}
              </LinearGradient>
            )}

            {/* Right side */}
            <View style={st.headerRight}>
              {isLive && (
                <View style={st.viewerPill}>
                  <Ionicons name="people" size={12} color="#FFF" />
                  <Text style={st.viewerText}>{formatViewers(viewerCount)}</Text>
                </View>
              )}
              {isLive && (
                <View style={st.diamondPill}>
                  <Ionicons name="diamond" size={12} color="#00BFFF" />
                  <Text style={st.diamondText}>{user?.diamonds || 0}</Text>
                </View>
              )}
              {!isLive && (
                <TouchableOpacity onPress={toggleCamera} activeOpacity={0.7}>
                  <View style={st.iconBtn}><Ionicons name="camera-reverse" size={20} color="#FFF" /></View>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Host info row when live */}
          {isLive && (
            <View style={st.hostRowOuter}>
              <View style={st.hostPill}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={st.hostAvatar} />
                ) : (
                  <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.hostAvatarFallback}>
                    <Text style={st.hostAvatarText}>{initial}</Text>
                  </LinearGradient>
                )}
                <Text style={st.hostName} numberOfLines={1}>{user?.username || 'User'}</Text>
              </View>
              {selectedDuration > 0 && liveStartTime > 0 && (
                <CountdownTimer duration={selectedDuration} startTime={liveStartTime} onExpired={handleTimerExpired} />
              )}
            </View>
          )}
        </SafeAreaView>

        {/* ── SIDE ACTIONS ── */}
        {isLive && (
          <View style={st.sideActions}>
            <TouchableOpacity style={st.sideBtn} onPress={toggleCamera} activeOpacity={0.7}>
              <View style={st.sideBtnCircle}><Ionicons name="camera-reverse" size={20} color="#FFF" /></View>
              <Text style={st.sideBtnLabel}>Flip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sideBtn} onPress={toggleMic} activeOpacity={0.7}>
              <View style={[st.sideBtnCircle, !micEnabled && st.sideBtnOff]}>
                <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={20} color={micEnabled ? '#FFF' : '#FF4466'} />
              </View>
              <Text style={st.sideBtnLabel}>{micEnabled ? 'Mic On' : 'Mic Off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sideBtn} onPress={toggleCameraOnOff} activeOpacity={0.7}>
              <View style={[st.sideBtnCircle, !cameraEnabled && st.sideBtnOff]}>
                <Ionicons name={cameraEnabled ? 'videocam' : 'videocam-off'} size={20} color={cameraEnabled ? '#FFF' : '#FF4466'} />
              </View>
              <Text style={st.sideBtnLabel}>{cameraEnabled ? 'Cam On' : 'Cam Off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sideBtn} onPress={noopPress} activeOpacity={0.7}>
              <View style={st.sideBtnCircle}><Ionicons name="share-social" size={20} color="#FFF" /></View>
              <Text style={st.sideBtnLabel}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={endBroadcast} activeOpacity={0.85} style={{ marginTop: 8, alignItems: 'center' }}>
              <View style={st.endBtn}><Ionicons name="stop-circle" size={20} color="#FFF" /></View>
              <Text style={st.sideBtnLabel}>End</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── LIVE CHAT ── */}
        {isLive && sessionId && user && token && (
          <LiveChat sessionId={sessionId} userId={user.id} username={user.username} token={token} isHost={true} hostUserId={user.id} onStickerPress={noopPress} />
        )}

        {/* ── PRE-BROADCAST BOTTOM ── */}
        {!isLive && (
          <Animated.View style={[st.prePanel, { paddingBottom: Math.max(insets.bottom, 16) + 16, opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            {/* Tool buttons */}
            <View style={st.toolRow}>
              <TouchableOpacity style={st.toolBtn} onPress={() => setShowTimerModal(true)} activeOpacity={0.7}>
                <View style={[st.toolBtnIcon, selectedDuration > 0 && st.toolBtnActive]}>
                  <Ionicons name="timer-outline" size={20} color={selectedDuration > 0 ? '#FF2D55' : 'rgba(255,255,255,0.8)'} />
                </View>
                <Text style={[st.toolBtnLabel, selectedDuration > 0 && { color: '#FF2D55' }]}>{selectedTimerLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.toolBtn} onPress={toggleMic} activeOpacity={0.7}>
                <View style={[st.toolBtnIcon, !micEnabled && st.toolBtnOff]}>
                  <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={20} color={micEnabled ? 'rgba(255,255,255,0.8)' : '#FF4466'} />
                </View>
                <Text style={st.toolBtnLabel}>{micEnabled ? 'Mic On' : 'Mic Off'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.toolBtn} onPress={toggleCameraOnOff} activeOpacity={0.7}>
                <View style={[st.toolBtnIcon, !cameraEnabled && st.toolBtnOff]}>
                  <Ionicons name={cameraEnabled ? 'videocam' : 'videocam-off'} size={20} color={cameraEnabled ? 'rgba(255,255,255,0.8)' : '#FF4466'} />
                </View>
                <Text style={st.toolBtnLabel}>{cameraEnabled ? 'Cam On' : 'Cam Off'}</Text>
              </TouchableOpacity>
            </View>

            {/* GO LIVE button */}
            <View style={st.goLiveWrap}>
              <GoLiveGlow />
              <TouchableOpacity onPress={startBroadcast} disabled={loading} activeOpacity={0.9}>
                <LinearGradient colors={loading ? ['#4A1525', '#4A1525'] : ['#FF2D55', '#FF6B8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.goLiveBtn}>
                  {loading ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <><Ionicons name="radio" size={30} color="#FFF" /><Text style={st.goLiveText}>GO LIVE</Text></>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* User info */}
            <View style={st.preUserRow}>
              <View style={st.preAvatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.preAvatarGrad}>
                    <Text style={st.preAvatarText}>{initial}</Text>
                  </LinearGradient>
                )}
              </View>
              <View style={st.preUserInfo}>
                <Text style={st.preUserName}>{user?.username || 'User'}</Text>
                <Text style={st.preUserSub}>Visible to all users</Text>
              </View>
              <View style={st.preTag}>
                <Ionicons name="globe-outline" size={11} color="rgba(255,255,255,0.5)" />
                <Text style={st.preTagText}>Public</Text>
              </View>
            </View>
          </Animated.View>
        )}
      </View>

      {/* ── TIMER MODAL ── */}
      <Modal visible={showTimerModal} transparent animationType="slide" onRequestClose={() => setShowTimerModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowTimerModal(false)}>
          <View style={st.modalContent} onStartShouldSetResponder={() => true}>
            <View style={st.modalHandle} />
            <Text style={st.modalTitle}>Stream Duration</Text>
            <Text style={st.modalSub}>Set a time limit for your live stream</Text>
            {TIMER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[st.timerOpt, selectedDuration === opt.value && st.timerOptActive]}
                onPress={() => { setSelectedDuration(opt.value); setShowTimerModal(false); }}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.value === 0 ? 'infinite' : 'timer-outline'} size={20} color={selectedDuration === opt.value ? '#FF2D55' : 'rgba(255,255,255,0.6)'} />
                <Text style={[st.timerOptText, selectedDuration === opt.value && { color: '#FF2D55' }]}>{opt.label}</Text>
                {selectedDuration === opt.value && <Ionicons name="checkmark-circle" size={20} color="#FF2D55" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  cameraWrap: { flex: 1 },

  // Camera off overlay
  cameraOffOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  cameraOffContent: { alignItems: 'center', gap: 12 },
  cameraOffAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: 'rgba(255,255,255,0.15)' },
  cameraOffAvatarFallback: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.15)' },
  cameraOffAvatarText: { color: '#FFF', fontSize: 48, fontWeight: '800' },
  cameraOffUsername: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 4 },
  cameraOffBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,45,85,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  cameraOffBadgeText: { color: '#FF4466', fontSize: 13, fontWeight: '700' },
  devModeBanner: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  devModeBannerText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center', fontWeight: '600' },

  // Gradients
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, zIndex: 5 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280, zIndex: 5 },

  // Header
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6 },
  liveBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  viewerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  viewerText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  diamondPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,191,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,191,255,0.15)' },
  diamondText: { color: '#00BFFF', fontSize: 12, fontWeight: '800' },

  // Host info
  hostRowOuter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 14, marginTop: 4 },
  hostPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.4)', paddingLeft: 4, paddingRight: 14, paddingVertical: 4, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  hostAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  hostAvatarFallback: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  hostAvatarText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  hostName: { color: '#FFF', fontSize: 13, fontWeight: '700', maxWidth: 120 },

  // Side actions
  sideActions: { position: 'absolute', right: 12, top: '28%', zIndex: 15, gap: 14, alignItems: 'center' },
  sideBtn: { alignItems: 'center', gap: 3 },
  sideBtnCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sideBtnOff: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: 'rgba(255,45,85,0.3)' },
  sideBtnLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' },
  endBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,45,85,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,45,85,0.4)' },

  // Pre-broadcast panel
  prePanel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 20, paddingHorizontal: 20, zIndex: 10 },
  toolRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 24 },
  toolBtn: { alignItems: 'center', gap: 5 },
  toolBtnIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  toolBtnActive: { backgroundColor: 'rgba(255,45,85,0.15)', borderColor: 'rgba(255,45,85,0.3)' },
  toolBtnOff: { backgroundColor: 'rgba(255,45,85,0.15)', borderColor: 'rgba(255,45,85,0.3)' },
  toolBtnLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' },
  goLiveWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  goLiveBtn: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 16, gap: 2 },
  goLiveText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  preUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  preAvatar: { borderRadius: 18, overflow: 'hidden' },
  preAvatarGrad: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  preAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  preUserInfo: { flex: 1 },
  preUserName: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  preUserSub: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  preTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  preTagText: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600' },

  // Timer modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: '#0D0D14', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  modalSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  timerOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  timerOptActive: { backgroundColor: 'rgba(255,45,85,0.1)', borderColor: 'rgba(255,45,85,0.25)' },
  timerOptText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
});
