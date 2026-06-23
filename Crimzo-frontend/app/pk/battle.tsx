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
  Platform,
  PermissionsAndroid,
  Image,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../../components/agoraImports';

import { API_URL, apiGet, apiPost, ApiError, resolveMediaUrl } from '../../lib/apiClient';
import { toAgoraUid, sameUserId } from '../../lib/agoraUid';
import { PK_GIFTS, findPkGiftByValue } from '../../lib/pkGifts';

const { width: SW, height: SH } = Dimensions.get('window');
const BATTLE_DURATION = 300; // 5 minutes
const GIFTS = PK_GIFTS;

// ── Pulsing VS Badge ──
const PulsingVS = React.memo(() => {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.8, duration: 800, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.vsCircle, { transform: [{ scale }], opacity: glow }]}>
      <LinearGradient colors={['#FF9500', '#FF2D55']} style={styles.vsGradient}>
        <Text style={styles.vsText}>VS</Text>
      </LinearGradient>
    </Animated.View>
  );
});

// ── Score Bar ──
const ScoreBar = React.memo(({ host1Score, host2Score }: { host1Score: number; host2Score: number }) => {
  const total = host1Score + host2Score || 1;
  const host1Pct = (host1Score / total) * 100;
  const host2Pct = (host2Score / total) * 100;
  const animWidth = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: host1Pct || 50,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [host1Pct]);

  return (
    <View style={styles.scoreBarWrap}>
      <View style={styles.scoreLabels}>
        <View style={styles.scoreLabelRow}>
          <Ionicons name="flame" size={14} color="#FF2D55" />
          <Text style={styles.scoreNum}>{host1Score}</Text>
        </View>
        <View style={styles.scoreLabelRow}>
          <Text style={styles.scoreNum}>{host2Score}</Text>
          <Ionicons name="flame" size={14} color="#30D158" />
        </View>
      </View>
      <View style={styles.scoreBarTrack}>
        <Animated.View
          style={[
            styles.scoreBarFillLeft,
            { width: animWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
});

// ── Countdown Timer ──
const CountdownTimer = React.memo(({ remaining }: { remaining: number }) => {
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const isLow = remaining <= 30;
  return (
    <View style={[styles.timerBadge, isLow && styles.timerBadgeLow]}>
      <Ionicons name="timer-outline" size={13} color={isLow ? '#FF4466' : '#FFF'} />
      <Text style={[styles.timerText, isLow && styles.timerTextLow]}>
        {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </Text>
    </View>
  );
});

// ── Gift Float Animation ──
const GiftFloat = ({ gift, side, onDone }: { gift: any; side: 'left' | 'right'; onDone: () => void }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 1500, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 300, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.View
      style={[
        styles.giftFloat,
        side === 'left' ? { left: 20 } : { right: 20 },
        { transform: [{ translateY }, { scale }], opacity },
      ]}
    >
      <View style={[styles.giftFloatBubble, { backgroundColor: gift.color + '30' }]}>
        <Ionicons name={gift.icon as any} size={22} color={gift.color} />
        <Text style={[styles.giftFloatValue, { color: gift.color }]}>+{gift.value}</Text>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════
// ── Main PK Battle Screen ──
// ══════════════════════════════════════════════════
export default function PKBattleScreen() {
  const { mode, battleId: paramBattleId } = useLocalSearchParams();
  const { user, token, updateUser } = useAuth();
  const router = useRouter();

  // State
  const [loading, setLoading] = useState(true);
  const [battleData, setBattleData] = useState<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [host1Score, setHost1Score] = useState(0);
  const [host2Score, setHost2Score] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(BATTLE_DURATION);
  const [host1Info, setHost1Info] = useState<any>(null);
  const [host2Info, setHost2Info] = useState<any>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [winnerData, setWinnerData] = useState<any>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [floatingGifts, setFloatingGifts] = useState<any[]>([]);
  const [selectedHost, setSelectedHost] = useState<'host1' | 'host2' | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);

  // Refs
  const socketRef = useRef<any>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<'host1' | 'host2'>('host1');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const useExpoCamera = !isAgoraNativeLinked;
  const pendingOpponentNotify = useRef(false);
  const joinedUserRef = useRef<any>(null);

  // Entrance anim
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (useExpoCamera) {
      requestCameraPermission();
    }
  }, [useExpoCamera]);

  // Init battle
  useEffect(() => {
    if (mode === 'create') {
      setMyRole('host1');
      createBattle();
    } else if (mode === 'host' && paramBattleId) {
      setMyRole('host1');
      resumeBattle();
    } else if (mode === 'join' && paramBattleId) {
      setMyRole('host2');
      joinBattle();
    }
    return () => {
      cleanupAll();
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!isActive) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Socket connection
  useEffect(() => {
    if (!battleData?.battleId || !API_URL) return;
    const s = io(API_URL, { transports: ['websocket'], auth: { token } });
    s.on('connect', () => {
      s.emit('join_battle', { battleId: battleData.battleId });
      if (pendingOpponentNotify.current && joinedUserRef.current) {
        s.emit('pk_opponent_joined', {
          battleId: battleData.battleId,
          user: joinedUserRef.current,
        });
        pendingOpponentNotify.current = false;
      }
    });
    s.on('score_update', (data: any) => {
      if (data?.host1_score != null) setHost1Score(data.host1_score);
      if (data?.host2_score != null) setHost2Score(data.host2_score);
    });
    s.on('gift_sent', (data: any) => {
      if (data?.host1_score != null) setHost1Score(data.host1_score);
      if (data?.host2_score != null) setHost2Score(data.host2_score);
      const gift = findPkGiftByValue(data?.giftValue) || {
        id: 0,
        name: 'Gift',
        value: data?.giftValue || 0,
        icon: 'gift',
        color: '#FFD700',
      };
      const side = data?.side === 'host1' ? 'left' : 'right';
      const floatId = Date.now() + Math.random();
      setFloatingGifts((prev) => [...prev, { id: floatId, gift, side }]);
    });
    s.on('pk_opponent_joined', (data: any) => {
      const joined = {
        ...data.user,
        agoraUid: data.user?.agoraUid ?? toAgoraUid(data.user?.id),
      };
      setHost2Info(joined);
      setRemoteUid(joined.agoraUid);
      setIsActive(true);
      setTimeRemaining(BATTLE_DURATION);
    });
    s.on('pk_battle_ended', (data: any) => {
      showWinnerModal(data.winner ?? null, data.host1Score, data.host2Score);
    });
    s.on('pk_chat_message', (data: any) => {
      setChatMessages((prev) => [...prev.slice(-40), data]);
    });
    s.on('gift_error', (data: any) => {
      Alert.alert('Gift Error', data.message || 'Could not send gift');
    });
    s.on('diamond_update', (data: { diamonds?: number }) => {
      if (typeof data?.diamonds === 'number') {
        updateUser({ diamonds: data.diamonds });
      }
    });
    socketRef.current = s;
    return () => {
      s.emit('leave_battle', { battleId: battleData.battleId });
      s.disconnect();
      socketRef.current = null;
    };
  }, [battleData?.battleId]);

  const cleanupAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (engineRef.current) {
      try {
        engineRef.current.leaveChannel();
        engineRef.current.release();
      } catch {}
      engineRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    }
  };

  const initAgora = async (appId: string, channelName: string, agoraToken: string, agoraUid: number) => {
    if (!isAgoraNativeLinked) return;
    try {
      await requestPermissions();
      const engine = createAgoraRtcEngine();
      engine.initialize({
        appId,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });
      engine.registerEventHandler({
        onJoinChannelSuccess: () => { console.log('[PK] Joined Agora channel'); },
        onUserJoined: (_conn: any, uid: any) => {
          console.log('[PK] Remote user joined:', uid);
          setRemoteUid(uid);
          setIsActive(true);
        },
        onUserOffline: (_conn: any, uid: any) => {
          console.log('[PK] Remote user left:', uid);
          setRemoteUid(null);
        },
        onError: (err: any, msg: any) => { console.error('[PK] Agora error:', err, msg); },
      });
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.enableVideo();
      engine.enableAudio();
      engine.startPreview();
      engine.joinChannel(agoraToken, channelName, agoraUid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      engineRef.current = engine;
      setAgoraReady(true);
    } catch (e: any) {
      console.error('[PK] Agora init failed:', e);
    }
  };

  const createBattle = async () => {
    setLoading(true);
    try {
      const data = await apiPost<{
        battleId: string;
        channelName: string;
        token?: string;
        appId?: string;
        uid?: number;
        host1?: { id: string; username?: string; avatar?: string; agoraUid?: number };
      }>('/api/pk/create', {}, token);
      setBattleData(data);
      setHost1Info(data.host1 || { id: user?.id, username: user?.username, avatar: user?.avatar });
      setIsActive(false);

      const agoraUid = data.uid ?? data.host1?.agoraUid ?? toAgoraUid(user?.id);
      if (data.appId && data.token) {
        await initAgora(data.appId, data.channelName, data.token, agoraUid);
      }
    } catch (error: unknown) {
      console.error('Create battle error:', error);
      const msg = error instanceof ApiError
        ? String((error.data as { details?: string; error?: string })?.details || error.message)
        : 'Failed to create battle';
      Alert.alert('Error', msg);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const applyBattleSession = async (
    data: {
      battleId: string;
      channelName: string;
      token?: string;
      appId?: string;
      uid?: number;
      status?: string;
      role?: 'host1' | 'host2';
      host1?: { id: string; username?: string; avatar?: string; agoraUid?: number };
      host2?: { id: string; username?: string; avatar?: string; agoraUid?: number } | null;
      host1_score?: number;
      host2_score?: number;
    },
    role: 'host1' | 'host2',
  ) => {
    setBattleData(data);
    setHost1Info(data.host1);
    if (data.host2) {
      setHost2Info(data.host2);
      setRemoteUid(data.host2.agoraUid ?? toAgoraUid(data.host2.id));
    } else if (role === 'host2') {
      setHost2Info({ id: user?.id, username: user?.username, avatar: user?.avatar });
    }
    setHost1Score(data.host1_score || 0);
    setHost2Score(data.host2_score || 0);
    setMyRole(role);
    setIsActive(data.status === 'active');
    if (data.status === 'active') {
      setTimeRemaining(BATTLE_DURATION);
    }

    const agoraUid = data.uid ?? (role === 'host1'
      ? (data.host1?.agoraUid ?? toAgoraUid(user?.id))
      : (data.host2?.agoraUid ?? toAgoraUid(user?.id)));
    if (data.appId && data.token) {
      await initAgora(data.appId, data.channelName, data.token, agoraUid);
    }
  };

  const resumeBattle = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{
        battleId: string;
        channelName: string;
        token?: string;
        appId?: string;
        uid?: number;
        status?: string;
        role?: 'host1' | 'host2';
        host1?: { id: string; username?: string; avatar?: string; agoraUid?: number };
        host2?: { id: string; username?: string; avatar?: string; agoraUid?: number } | null;
        host1_score?: number;
        host2_score?: number;
      }>(`/api/pk/resume/${paramBattleId}`, token);
      await applyBattleSession(data, data.role || 'host1');
    } catch (error: unknown) {
      console.error('Resume battle error:', error);
      const msg = error instanceof ApiError ? error.message : 'Failed to resume battle';
      Alert.alert('Error', msg);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const joinBattle = async () => {
    setLoading(true);
    try {
      const data = await apiPost<{
        battleId: string;
        channelName: string;
        token?: string;
        appId?: string;
        uid?: number;
        host1?: { id: string; username?: string; avatar?: string; agoraUid?: number };
        host2?: { id: string; username?: string; avatar?: string; agoraUid?: number };
      }>(`/api/pk/join/${paramBattleId}`, {}, token);
      await applyBattleSession(data, 'host2');

      const joinedUser = { id: user?.id, username: user?.username, avatar: user?.avatar };
      joinedUserRef.current = joinedUser;
      pendingOpponentNotify.current = true;
      if (socketRef.current?.connected) {
        socketRef.current.emit('pk_opponent_joined', {
          battleId: data.battleId,
          user: joinedUser,
        });
        pendingOpponentNotify.current = false;
      }
    } catch (error: unknown) {
      console.error('Join battle error:', error);
      if (error instanceof ApiError && error.message.toLowerCase().includes('own battle')) {
        setLoading(false);
        await resumeBattle();
        return;
      }
      const msg = error instanceof ApiError ? error.message : 'Failed to join battle';
      Alert.alert('Error', msg);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const sendGift = (gift: typeof GIFTS[number], targetHost: 'host1' | 'host2') => {
    if (!battleData?.battleId || !isActive || showWinner) return;
    const hostId = targetHost === 'host1' ? host1Info?.id : host2Info?.id;
    if (!hostId) return;

    socketRef.current?.emit('send_gift', {
      battleId: battleData.battleId,
      hostId,
      giftValue: gift.value,
      senderId: user?.id,
    });
  };

  const removeFloatingGift = useCallback((id: number) => {
    setFloatingGifts((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const sendChatMessage = useCallback(() => {
    if (!chatInput.trim() || !socketRef.current || !battleData?.battleId) return;
    socketRef.current.emit('pk_chat_message', {
      battleId: battleData.battleId,
      userId: user?.id,
      username: user?.username,
      message: chatInput.trim(),
    });
    setChatInput('');
    Keyboard.dismiss();
  }, [chatInput, battleData?.battleId, user]);

  const handleTimeUp = async () => {
    if (!battleData?.battleId) return;
    try {
      const res = await apiPost<{
        winnerId: string | null;
        host1_score: number;
        host2_score: number;
      }>(`/api/pk/end/${battleData.battleId}`, {}, token);
      showWinnerModal(res.winnerId, res.host1_score, res.host2_score);
      socketRef.current?.emit('pk_battle_ended', {
        battleId: battleData.battleId,
        winner: res.winnerId,
        host1Score: res.host1_score,
        host2Score: res.host2_score,
      });
    } catch (error: unknown) {
      console.error('End battle error:', error);
    }
  };

  const endBattleManual = () => {
    Alert.alert('End Battle', 'Are you sure you want to end this PK battle?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Now', style: 'destructive', onPress: handleTimeUp },
    ]);
  };

  const showWinnerModal = (winnerId: string | number | null, h1Score: number, h2Score: number) => {
    setHost1Score(h1Score);
    setHost2Score(h2Score);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeRemaining(0);

    let winnerInfo = null;
    let isDraw = false;
    if (!winnerId) {
      isDraw = true;
    } else if (sameUserId(winnerId, host1Info?.id)) {
      winnerInfo = host1Info;
    } else {
      winnerInfo = host2Info;
    }
    setWinnerId(winnerId ? String(winnerId) : null);
    setWinnerData({ winner: winnerInfo, isDraw, host1Score: h1Score, host2Score: h2Score });
    setShowWinner(true);
    setIsActive(false);
  };

  const isHost1Winner = winnerId && sameUserId(winnerId, host1Info?.id);
  const isHost2Winner = winnerId && sameUserId(winnerId, host2Info?.id);

  const handleExit = () => {
    cleanupAll();
    router.back();
  };

  const host1AgoraUid = host1Info?.agoraUid ?? toAgoraUid(host1Info?.id);
  const host2AgoraUid = host2Info?.agoraUid ?? toAgoraUid(host2Info?.id);

  const renderHost1Video = () => {
    if (myRole === 'host1') {
      if (agoraReady) return <RtcSurfaceView style={styles.videoView} canvas={{ uid: 0 }} />;
      if (useExpoCamera && cameraPermission?.granted) {
        return <CameraView style={styles.videoView} facing="front" mode="video" />;
      }
    } else if (agoraReady && remoteUid != null) {
      const uid = remoteUid === host1AgoraUid ? remoteUid : host1AgoraUid;
      return <RtcSurfaceView style={styles.videoView} canvas={{ uid }} />;
    }
    return (
      <View style={styles.videoPlaceholder}>
        {host1Info?.avatar ? (
          <Image source={{ uri: resolveMediaUrl(host1Info.avatar) }} style={styles.avatarLarge} />
        ) : (
          <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={styles.avatarFallback}>
            <Text style={styles.avatarText}>
              {(host1Info?.username || 'H1').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        )}
      </View>
    );
  };

  const renderHost2Video = () => {
    if (myRole === 'host2') {
      if (agoraReady) return <RtcSurfaceView style={styles.videoView} canvas={{ uid: 0 }} />;
      if (useExpoCamera && cameraPermission?.granted) {
        return <CameraView style={styles.videoView} facing="front" mode="video" />;
      }
    } else if (agoraReady && remoteUid != null && isActive) {
      const uid = remoteUid === host2AgoraUid ? remoteUid : host2AgoraUid;
      return <RtcSurfaceView style={styles.videoView} canvas={{ uid }} />;
    }
    return (
      <View style={styles.videoPlaceholder}>
        {isActive && host2Info?.avatar ? (
          <Image source={{ uri: resolveMediaUrl(host2Info.avatar) }} style={styles.avatarLarge} />
        ) : isActive && host2Info ? (
          <LinearGradient colors={['#30D158', '#4ADE80']} style={styles.avatarFallback}>
            <Text style={styles.avatarText}>
              {(host2Info?.username || 'H2').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.waitingWrap}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.waitingLabel}>Waiting for{'\n'}opponent...</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Loading Screen ──
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#1a0a1e', '#0d0d1a', '#000']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={styles.loadingText}>
            {mode === 'create' ? 'Creating PK Battle...' : 'Joining PK Battle...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── BATTLE ARENA (Split Screen) ── */}
      <View style={styles.arenaWrap}>
        {/* Host 1 (Left - Red) */}
        <View style={styles.hostPanel}>
          <LinearGradient colors={['rgba(255,45,85,0.15)', 'rgba(255,45,85,0.05)', 'transparent']} style={StyleSheet.absoluteFill} />
          {renderHost1Video()}
          {/* Host 1 info overlay */}
          <View style={styles.hostInfoOverlay}>
            <View style={styles.hostNameBadge}>
              <View style={[styles.hostDot, { backgroundColor: '#FF2D55' }]} />
              <Text style={styles.hostNameText} numberOfLines={1}>
                {host1Info?.username || 'Host 1'}
              </Text>
            </View>
            {showWinner && isHost1Winner && (
              <View style={styles.winnerSideBadge}>
                <Ionicons name="trophy" size={12} color="#FFD700" />
                <Text style={styles.winnerSideText}>WINNER</Text>
              </View>
            )}
          </View>
          {/* Tap target for gifts */}
          {isActive && selectedHost === 'host1' && (
            <View style={[styles.selectedOverlay, { borderColor: '#FF2D55' }]} />
          )}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={0.8}
            onPress={() => setSelectedHost('host1')}
          />
        </View>

        {/* VS Badge - center */}
        <View style={styles.vsContainer}>
          <PulsingVS />
        </View>

        {/* Host 2 (Right - Green) */}
        <View style={styles.hostPanel}>
          <LinearGradient colors={['rgba(48,209,88,0.15)', 'rgba(48,209,88,0.05)', 'transparent']} style={StyleSheet.absoluteFill} />
          {renderHost2Video()}
          {/* Host 2 info overlay */}
          <View style={styles.hostInfoOverlay}>
            <View style={styles.hostNameBadge}>
              <View style={[styles.hostDot, { backgroundColor: '#30D158' }]} />
              <Text style={styles.hostNameText} numberOfLines={1}>
                {host2Info?.username || (isActive ? 'Host 2' : 'Waiting...')}
              </Text>
            </View>
            {showWinner && isHost2Winner && (
              <View style={[styles.winnerSideBadge, { borderColor: 'rgba(48,209,88,0.5)' }]}>
                <Ionicons name="trophy" size={12} color="#FFD700" />
                <Text style={styles.winnerSideText}>WINNER</Text>
              </View>
            )}
          </View>
          {isActive && selectedHost === 'host2' && (
            <View style={[styles.selectedOverlay, { borderColor: '#30D158' }]} />
          )}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={0.8}
            onPress={() => setSelectedHost('host2')}
          />
        </View>
      </View>

      {/* ── Floating Gifts ── */}
      {floatingGifts.map((fg) => (
        <GiftFloat
          key={fg.id}
          gift={fg.gift}
          side={fg.side}
          onDone={() => removeFloatingGift(fg.id)}
        />
      ))}

      {/* ── TOP HUD ── */}
      <Animated.View style={[styles.topHud, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleExit}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>PK BATTLE</Text>
          </View>
          <CountdownTimer remaining={timeRemaining} />
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={endBattleManual}>
          <Ionicons name="flag" size={16} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── SCORE BAR ── */}
      <View style={styles.scoreBarPosition}>
        <ScoreBar host1Score={host1Score} host2Score={host2Score} />
      </View>

      {/* ── GIFT PANEL (Bottom) ── */}
      {isActive && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.bottomPanel}
          keyboardVerticalOffset={0}
        >
          {/* Chat messages overlay */}
          {showChat && chatMessages.length > 0 && (
            <View style={styles.chatOverlay}>
              {chatMessages.slice(-5).map((msg) => (
                <View key={msg.id} style={styles.chatBubble}>
                  <Text style={styles.chatText}>
                    <Text style={styles.chatName}>{msg.username} </Text>
                    {msg.message}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Chat input row */}
          <View style={styles.chatInputRow}>
            <View style={styles.chatInputField}>
              <TextInput
                style={styles.chatTextInput}
                placeholder="Say something..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
                maxLength={150}
              />
            </View>
            <TouchableOpacity onPress={sendChatMessage} disabled={!chatInput.trim()} activeOpacity={0.7}>
              <View style={[styles.chatSendBtn, chatInput.trim() ? styles.chatSendBtnActive : null]}>
                <Ionicons name="send" size={16} color={chatInput.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChat(!showChat)} activeOpacity={0.7}>
              <View style={styles.chatToggleBtn}>
                <Ionicons name={showChat ? 'chatbubble' : 'chatbubble-outline'} size={16} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>

          {selectedHost && (
            <Text style={styles.giftTargetText}>
              Sending to: <Text style={{ color: selectedHost === 'host1' ? '#FF2D55' : '#30D158', fontWeight: '700' }}>
                {selectedHost === 'host1' ? host1Info?.username : host2Info?.username}
              </Text>
            </Text>
          )}
          <View style={styles.giftsRow}>
            {GIFTS.map((gift) => (
              <TouchableOpacity
                key={gift.id}
                style={[
                  styles.giftBtn,
                  !selectedHost && styles.giftBtnDisabled,
                ]}
                onPress={() => selectedHost && sendGift(gift, selectedHost)}
                activeOpacity={selectedHost ? 0.7 : 1}
              >
                <View style={[styles.giftIconWrap, { backgroundColor: gift.color + '20' }]}>
                  <Ionicons name={gift.icon as any} size={20} color={gift.color} />
                </View>
                <Text style={styles.giftName}>{gift.name}</Text>
                <View style={styles.giftCoinRow}>
                  <Ionicons name="diamond" size={10} color="#FFD700" />
                  <Text style={styles.giftCoinText}>{gift.value}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {!selectedHost && (
            <Text style={styles.tapHint}>Tap a host to send them gifts</Text>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── Waiting overlay when not active ── */}
      {!isActive && !loading && (
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <ActivityIndicator size="small" color="#FF2D55" />
            <Text style={styles.waitingCardTitle}>Waiting for Opponent</Text>
            <Text style={styles.waitingCardSub}>Share your battle link to invite someone!</Text>
            <Text style={styles.waitingCardId}>Battle #{battleData?.battleId?.slice(0, 8)}</Text>
          </View>
        </View>
      )}

      {/* ── WINNER MODAL ── */}
      <Modal visible={showWinner} transparent animationType="fade">
        <View style={styles.winnerOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.9)', 'rgba(26,10,30,0.95)']} style={StyleSheet.absoluteFill} />
          <Animated.View style={styles.winnerCard}>
            {winnerData?.isDraw ? (
              <>
                <View style={styles.winnerIconWrap}>
                  <Ionicons name="hand-left" size={48} color="#FF9500" />
                </View>
                <Text style={styles.winnerTitle}>It's a Draw!</Text>
                <Text style={styles.winnerSub}>Both hosts performed equally well</Text>
              </>
            ) : (
              <>
                <View style={styles.winnerIconWrap}>
                  <Ionicons name="trophy" size={48} color="#FFD700" />
                </View>
                <Text style={styles.winnerTitle}>
                  {winnerData?.winner?.username || 'Winner'}
                </Text>
                <Text style={styles.winnerLabel}>WINS THE BATTLE!</Text>
              </>
            )}
            <View style={styles.winnerScores}>
              <View style={styles.winnerScoreBox}>
                <Text style={styles.winnerScoreName}>{host1Info?.username || 'Host 1'}</Text>
                <Text style={[styles.winnerScoreNum, { color: '#FF2D55' }]}>
                  {winnerData?.host1Score || 0}
                </Text>
              </View>
              <Text style={styles.winnerVs}>vs</Text>
              <View style={styles.winnerScoreBox}>
                <Text style={styles.winnerScoreName}>{host2Info?.username || 'Host 2'}</Text>
                <Text style={[styles.winnerScoreNum, { color: '#30D158' }]}>
                  {winnerData?.host2Score || 0}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.winnerExitBtn} onPress={handleExit}>
              <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={styles.winnerExitGrad}>
                <Text style={styles.winnerExitText}>Back to Lobby</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Loading
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: '#AAA', fontSize: 15 },

  // Arena
  arenaWrap: { flex: 1, flexDirection: 'row' },
  hostPanel: { flex: 1, overflow: 'hidden' },
  videoView: { flex: 1 },
  videoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  avatarLarge: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  waitingWrap: { alignItems: 'center', gap: 12 },
  waitingLabel: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Host info overlay
  hostInfoOverlay: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' },
  hostNameBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
  },
  hostDot: { width: 8, height: 8, borderRadius: 4 },
  hostNameText: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: 100 },
  winnerSideBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
    backgroundColor: 'rgba(255,215,0,0.2)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.45)',
  },
  winnerSideText: { color: '#FFD700', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Selected overlay
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3, borderRadius: 0,
  },

  // VS
  vsContainer: {
    position: 'absolute', left: '50%', top: '40%', zIndex: 20,
    marginLeft: -28, marginTop: -28,
  },
  vsCircle: { width: 56, height: 56, borderRadius: 28 },
  vsGradient: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  vsText: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 1 },

  // Top HUD
  topHud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  topCenter: { alignItems: 'center', gap: 6 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,45,85,0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  liveText: { color: '#FF2D55', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  endBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,69,58,0.4)', justifyContent: 'center', alignItems: 'center',
  },

  // Timer
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  timerBadgeLow: { backgroundColor: 'rgba(255,45,85,0.3)' },
  timerText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  timerTextLow: { color: '#FF4466' },

  // Score bar
  scoreBarPosition: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 96,
    left: 16, right: 16, zIndex: 15,
  },
  scoreBarWrap: { gap: 4 },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  scoreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreNum: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  scoreBarTrack: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(48,209,88,0.4)', overflow: 'hidden',
  },
  scoreBarFillLeft: {
    height: '100%', backgroundColor: '#FF2D55', borderRadius: 3,
  },

  // Bottom gift panel
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  chatOverlay: {
    marginBottom: 8, maxHeight: 120,
  },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4,
    alignSelf: 'flex-start', maxWidth: '85%',
  },
  chatText: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  chatName: { color: '#FF2D55', fontWeight: '800', fontSize: 13 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  chatInputField: {
    flex: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18, justifyContent: 'center',
  },
  chatTextInput: {
    flex: 1, height: 36, paddingHorizontal: 14, color: '#FFF', fontSize: 13,
  },
  chatSendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  chatSendBtnActive: { backgroundColor: '#FF2D55' },
  chatToggleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  giftTargetText: { color: '#AAA', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  giftsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  giftBtn: { alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12 },
  giftBtnDisabled: { opacity: 0.4 },
  giftIconWrap: {
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
  },
  giftName: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  giftCoinRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  giftCoinText: { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  tapHint: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 6 },

  // Floating gift
  giftFloat: { position: 'absolute', bottom: 180, zIndex: 50 },
  giftFloatBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  giftFloatValue: { fontSize: 14, fontWeight: '800' },

  // Waiting overlay
  waitingOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    alignItems: 'center',
  },
  waitingCard: {
    backgroundColor: 'rgba(28,28,30,0.9)', borderRadius: 20, padding: 24,
    alignItems: 'center', gap: 8, width: '100%',
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.2)',
  },
  waitingCardTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  waitingCardSub: { color: '#888', fontSize: 13, textAlign: 'center' },
  waitingCardId: { color: '#555', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Winner modal
  winnerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  winnerCard: {
    backgroundColor: 'rgba(28,28,30,0.95)', borderRadius: 24, padding: 32,
    alignItems: 'center', marginHorizontal: 24, width: SW - 48,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  winnerIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,215,0,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  winnerTitle: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  winnerLabel: { color: '#FFD700', fontSize: 14, fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  winnerSub: { color: '#AAA', fontSize: 14, marginTop: 4 },
  winnerScores: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24, marginBottom: 24,
  },
  winnerScoreBox: { alignItems: 'center', gap: 4 },
  winnerScoreName: { color: '#999', fontSize: 12 },
  winnerScoreNum: { fontSize: 28, fontWeight: '800' },
  winnerVs: { color: '#555', fontSize: 16, fontWeight: '800' },
  winnerExitBtn: { width: '100%' },
  winnerExitGrad: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  winnerExitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});