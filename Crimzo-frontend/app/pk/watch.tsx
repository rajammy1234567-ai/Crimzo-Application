import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  Platform,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { KEYBOARD_BEHAVIOR } from '../../components/KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../../components/agoraImports';

import { API_URL, apiGet, ApiError, resolveMediaUrl } from '../../lib/apiClient';
import { toAgoraUid, sameUserId } from '../../lib/agoraUid';
import { PK_GIFTS, findPkGiftByValue } from '../../lib/pkGifts';

const { width: SW, height: SH } = Dimensions.get('window');

const GIFTS = PK_GIFTS;

// ── Pulsing VS Badge ──
const PulsingVS = React.memo(() => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[s.vsCircle, { transform: [{ scale }] }]}>
      <LinearGradient colors={['#FF9500', '#FF2D55']} style={s.vsGrad}>
        <Text style={s.vsText}>VS</Text>
      </LinearGradient>
    </Animated.View>
  );
});

// ── Score Bar ──
const ScoreBar = React.memo(({ host1Score, host2Score }: { host1Score: number; host2Score: number }) => {
  const total = host1Score + host2Score || 1;
  const pct = (host1Score / total) * 100;
  const w = useRef(new Animated.Value(50)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: pct || 50, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={s.scoreWrap}>
      <View style={s.scoreLabels}>
        <View style={s.scoreLR}>
          <Ionicons name="flame" size={14} color="#FF2D55" />
          <Text style={s.scoreNum}>{host1Score}</Text>
        </View>
        <View style={s.scoreLR}>
          <Text style={s.scoreNum}>{host2Score}</Text>
          <Ionicons name="flame" size={14} color="#30D158" />
        </View>
      </View>
      <View style={s.scoreTrack}>
        <Animated.View style={[s.scoreFill, { width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
});

// ── Gift Float ──
const GiftFloat = ({ gift, side, onDone }: { gift: any; side: 'left' | 'right'; onDone: () => void }) => {
  const ty = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  const sc = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(ty, { toValue: -120, duration: 1500, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 1500, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(sc, { toValue: 1.3, duration: 300, useNativeDriver: true }),
        Animated.timing(sc, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);
  return (
    <Animated.View style={[s.giftFloat, side === 'left' ? { left: 20 } : { right: 20 }, { transform: [{ translateY: ty }, { scale: sc }], opacity: op }]}>
      <View style={[s.giftFloatBubble, { backgroundColor: gift.color + '30' }]}>
        <Ionicons name={gift.icon as any} size={22} color={gift.color} />
        <Text style={[s.giftFloatVal, { color: gift.color }]}>+{gift.value}</Text>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════
// ── PK Watch Screen (Viewer) ──
// ══════════════════════════════════════════
export default function PKWatchScreen() {
  const { battleId: paramBattleId } = useLocalSearchParams();
  const { user, token, updateUser } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [battleData, setBattleData] = useState<any>(null);
  const [host1Info, setHost1Info] = useState<any>(null);
  const [host2Info, setHost2Info] = useState<any>(null);
  const [host1Score, setHost1Score] = useState(0);
  const [host2Score, setHost2Score] = useState(0);
  const [selectedHost, setSelectedHost] = useState<'host1' | 'host2' | null>(null);
  const [floatingGifts, setFloatingGifts] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [ended, setEnded] = useState(false);
  const [winnerData, setWinnerData] = useState<any>(null);

  const [viewerCount, setViewerCount] = useState(0);

  // Agora
  const engineRef = useRef<IRtcEngine | null>(null);
  const [remoteUids, setRemoteUids] = useState<number[]>([]);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (paramBattleId) fetchBattle();
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (engineRef.current) {
      try { engineRef.current.leaveChannel(); engineRef.current.release(); } catch {}
      engineRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const fetchBattle = async () => {
    try {
      const data = await apiGet<{
        battleId: string;
        channelName: string;
        token?: string;
        appId?: string;
        uid?: number;
        host1_score?: number;
        host2_score?: number;
        host1?: { id: string; username?: string; avatar?: string; agoraUid?: number };
        host2?: { id: string; username?: string; avatar?: string; agoraUid?: number } | null;
      }>(`/api/pk/watch/${paramBattleId}`, token);
      setBattleData(data);
      setHost1Info(data.host1);
      setHost2Info(data.host2);
      setHost1Score(data.host1_score || 0);
      setHost2Score(data.host2_score || 0);

      if (isAgoraNativeLinked && data.appId && data.token) {
        const agoraUid = data.uid ?? toAgoraUid(user?.id);
        await initAgora(data.appId, data.channelName, data.token, agoraUid);
      }

      initSocket(data.battleId);
    } catch (error: unknown) {
      console.error('Fetch battle error:', error);
      const msg = error instanceof ApiError ? error.message : 'Failed to join battle';
      Alert.alert('Error', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setLoading(false);
    }
  };

  const initAgora = async (appId: string, channelName: string, agoraToken: string, agoraUid: number) => {
    try {
      const engine = createAgoraRtcEngine();
      engine.initialize({ appId, channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting });
      engine.registerEventHandler({
        onJoinChannelSuccess: () => console.log('[PK Watch] Joined channel'),
        onUserJoined: (_conn: any, uid: any) => {
          console.log('[PK Watch] Remote user:', uid);
          setRemoteUids(prev => prev.includes(uid) ? prev : [...prev, uid]);
        },
        onUserOffline: (_conn: any, uid: any) => {
          setRemoteUids(prev => prev.filter(u => u !== uid));
        },
        onError: (err: any, msg: any) => console.error('[PK Watch] Agora error:', err, msg),
      });
      engine.setClientRole(ClientRoleType.ClientRoleAudience);
      engine.enableVideo();
      engine.enableAudio();
      engine.joinChannel(agoraToken, channelName, agoraUid, {
        clientRoleType: ClientRoleType.ClientRoleAudience,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      engineRef.current = engine;
    } catch (e: any) {
      console.error('[PK Watch] Agora init failed:', e);
    }
  };

  const initSocket = (battleId: string) => {
    if (!API_URL) return;
    const sock = io(API_URL, { transports: ['websocket'], auth: { token } });
    sock.on('connect', () => {
      sock.emit('join_battle', { battleId });
    });
    sock.on('score_update', (data: any) => {
      if (data?.host1_score != null) setHost1Score(data.host1_score);
      if (data?.host2_score != null) setHost2Score(data.host2_score);
    });
    sock.on('gift_sent', (data: any) => {
      if (data?.host1_score != null) setHost1Score(data.host1_score);
      if (data?.host2_score != null) setHost2Score(data.host2_score);
      const gift = findPkGiftByValue(data?.giftValue) || {
        id: 0, name: 'Gift', value: data?.giftValue || 0, icon: 'gift', color: '#FFD700',
      };
      const floatId = Date.now() + Math.random();
      setFloatingGifts((prev) => [...prev, {
        id: floatId,
        gift,
        side: data?.side === 'host1' ? 'left' : 'right',
      }]);
    });
    sock.on('pk_opponent_joined', (data: any) => {
      setHost2Info(data.user);
    });
    sock.on('pk_battle_ended', (data: any) => {
      setEnded(true);
      setHost1Score(data.host1Score);
      setHost2Score(data.host2Score);
      setWinnerData(data);
    });
    sock.on('pk_chat_message', (data: any) => {
      setChatMessages(prev => [...prev.slice(-40), data]);
    });
    sock.on('pk_viewer_count', (data: any) => {
      setViewerCount(data.count || 0);
    });
    sock.on('gift_error', (data: any) => {
      Alert.alert('Gift Failed', data?.message || 'Could not send gift');
    });
    sock.on('diamond_update', (data: { diamonds?: number }) => {
      if (typeof data?.diamonds === 'number') updateUser({ diamonds: data.diamonds });
    });
    socketRef.current = sock;
  };

  const sendGift = (gift: typeof GIFTS[0], targetHost: 'host1' | 'host2') => {
    if (!battleData?.battleId) return;
    const hostId = targetHost === 'host1' ? host1Info?.id : host2Info?.id;
    if (!hostId) return;
    socketRef.current?.emit('send_gift', {
      battleId: battleData.battleId,
      hostId,
      giftValue: gift.value,
      senderId: user?.id,
    });
  };

  const removeFloat = useCallback((id: number) => {
    setFloatingGifts(prev => prev.filter(g => g.id !== id));
  }, []);

  const sendChat = useCallback(() => {
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

  const handleExit = () => {
    cleanup();
    router.back();
  };

  const host1AgoraUid = host1Info?.agoraUid ?? toAgoraUid(host1Info?.id);
  const host2AgoraUid = host2Info?.agoraUid ?? toAgoraUid(host2Info?.id);

  if (loading) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <LinearGradient colors={['#1a0a1e', '#0d0d1a', '#000']} style={StyleSheet.absoluteFill} />
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={s.loadText}>Joining PK Battle...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Split Video Arena ── */}
      <View style={s.arena}>
        {/* Host 1 */}
        <TouchableOpacity style={s.hostPanel} activeOpacity={0.8} onPress={() => setSelectedHost('host1')}>
          <LinearGradient colors={['rgba(255,45,85,0.15)', 'rgba(255,45,85,0.05)', 'transparent']} style={StyleSheet.absoluteFill} />
          {isAgoraNativeLinked && remoteUids.includes(host1AgoraUid) ? (
            <RtcSurfaceView style={s.video} canvas={{ uid: host1AgoraUid }} />
          ) : (
            <View style={s.placeholder}>
              {host1Info?.avatar ? (
                <Image source={{ uri: resolveMediaUrl(host1Info.avatar) }} style={s.avatarLg} />
              ) : (
                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.avatarFallback}>
                  <Text style={s.avatarTxt}>{(host1Info?.username || 'H').charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              )}
            </View>
          )}
          <View style={s.hostLabel}>
            <View style={[s.hostDot, { backgroundColor: '#FF2D55' }]} />
            <Text style={s.hostName} numberOfLines={1}>{host1Info?.username || 'Host 1'}</Text>
            {ended && winnerData?.winner && sameUserId(winnerData.winner, host1Info?.id) && (
              <View style={s.winnerBadge}>
                <Ionicons name="trophy" size={10} color="#FFD700" />
                <Text style={s.winnerBadgeText}>WINNER</Text>
              </View>
            )}
          </View>
          {selectedHost === 'host1' && <View style={[s.selectedBorder, { borderColor: '#FF2D55' }]} />}
        </TouchableOpacity>

        {/* VS */}
        <View style={s.vsPos}>
          <PulsingVS />
        </View>

        {/* Host 2 */}
        <TouchableOpacity style={s.hostPanel} activeOpacity={0.8} onPress={() => setSelectedHost('host2')}>
          <LinearGradient colors={['rgba(48,209,88,0.15)', 'rgba(48,209,88,0.05)', 'transparent']} style={StyleSheet.absoluteFill} />
          {host2Info && isAgoraNativeLinked && remoteUids.includes(host2AgoraUid) ? (
            <RtcSurfaceView style={s.video} canvas={{ uid: host2AgoraUid }} />
          ) : host2Info ? (
            <View style={s.placeholder}>
              {host2Info?.avatar ? (
                <Image source={{ uri: resolveMediaUrl(host2Info.avatar) }} style={s.avatarLg} />
              ) : (
                <LinearGradient colors={['#30D158', '#4ADE80']} style={s.avatarFallback}>
                  <Text style={s.avatarTxt}>{(host2Info?.username || 'H').charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              )}
            </View>
          ) : (
            <View style={s.placeholder}>
              <ActivityIndicator size="small" color="#666" />
              <Text style={s.waitText}>Waiting...</Text>
            </View>
          )}
          <View style={s.hostLabel}>
            <View style={[s.hostDot, { backgroundColor: '#30D158' }]} />
            <Text style={s.hostName} numberOfLines={1}>{host2Info?.username || 'Waiting...'}</Text>
            {ended && winnerData?.winner && sameUserId(winnerData.winner, host2Info?.id) && (
              <View style={s.winnerBadge}>
                <Ionicons name="trophy" size={10} color="#FFD700" />
                <Text style={s.winnerBadgeText}>WINNER</Text>
              </View>
            )}
          </View>
          {selectedHost === 'host2' && <View style={[s.selectedBorder, { borderColor: '#30D158' }]} />}
        </TouchableOpacity>
      </View>

      {/* Floating gifts */}
      {floatingGifts.map(fg => (
        <GiftFloat key={fg.id} gift={fg.gift} side={fg.side} onDone={() => removeFloat(fg.id)} />
      ))}

      {/* ── Top HUD ── */}
      <View style={s.topHud}>
        <TouchableOpacity style={s.closeBtn} onPress={handleExit}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>PK BATTLE</Text>
          </View>
          <View style={s.viewerBadge}>
            <Ionicons name="eye" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={s.viewerText}>{viewerCount} watching</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Score Bar ── */}
      <View style={s.scorePos}>
        <ScoreBar host1Score={host1Score} host2Score={host2Score} />
      </View>

      {/* ── Bottom Panel: Chat + Gifts ── */}
      <KeyboardAvoidingView
        behavior={KEYBOARD_BEHAVIOR}
        style={s.bottomPanel}
        keyboardVerticalOffset={0}
      >
        {/* Chat messages */}
        {chatMessages.length > 0 && (
          <View style={s.chatArea}>
            {chatMessages.slice(-5).map(msg => (
              <View key={msg.id} style={s.chatBubble}>
                <Text style={s.chatMsg}>
                  <Text style={s.chatUser}>{msg.username} </Text>
                  {msg.type === 'sticker' ? `sent ${msg.stickerName}` : msg.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Chat input */}
        <View style={s.chatRow}>
          <View style={s.chatField}>
            <TextInput
              style={s.chatInput}
              placeholder="Say something..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={sendChat}
              returnKeyType="send"
              maxLength={150}
            />
          </View>
          <TouchableOpacity onPress={sendChat} disabled={!chatInput.trim()}>
            <View style={[s.sendBtn, chatInput.trim() && s.sendBtnActive]}>
              <Ionicons name="send" size={16} color={chatInput.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Gift selector + host target */}
        {selectedHost && (
          <Text style={s.giftTarget}>
            Sending to: <Text style={{ color: selectedHost === 'host1' ? '#FF2D55' : '#30D158', fontWeight: '700' }}>
              {selectedHost === 'host1' ? host1Info?.username : host2Info?.username}
            </Text>
          </Text>
        )}
        <View style={s.giftsRow}>
          {GIFTS.map(gift => (
            <TouchableOpacity
              key={gift.id}
              style={[s.giftBtn, !selectedHost && s.giftBtnOff]}
              onPress={() => selectedHost && sendGift(gift, selectedHost)}
              activeOpacity={selectedHost ? 0.7 : 1}
            >
              <View style={[s.giftIcon, { backgroundColor: gift.color + '20' }]}>
                <Ionicons name={gift.icon as any} size={20} color={gift.color} />
              </View>
              <Text style={s.giftLabel}>{gift.name}</Text>
              <View style={s.giftCost}>
                <Ionicons name="diamond" size={10} color="#FFD700" />
                <Text style={s.giftCostText}>{gift.value}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        {!selectedHost && <Text style={s.tapHint}>Tap a host to send them gifts</Text>}
      </KeyboardAvoidingView>

      {/* ── Ended Overlay ── */}
      {ended && (
        <View style={s.endedOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.9)', 'rgba(26,10,30,0.95)']} style={StyleSheet.absoluteFill} />
          <View style={s.endedCard}>
            <Ionicons name="trophy" size={48} color="#FFD700" />
            <Text style={s.endedTitle}>
              {winnerData?.winner
                ? `${sameUserId(winnerData.winner, host1Info?.id) ? host1Info?.username : host2Info?.username} Wins!`
                : 'Battle Ended — Draw!'}
            </Text>
            <View style={s.endedScores}>
              <View style={s.endedScoreBox}>
                <Text style={s.endedName}>{host1Info?.username || 'Host 1'}</Text>
                <Text style={[s.endedNum, { color: '#FF2D55' }]}>{host1Score}</Text>
              </View>
              <Text style={s.endedVs}>vs</Text>
              <View style={s.endedScoreBox}>
                <Text style={s.endedName}>{host2Info?.username || 'Host 2'}</Text>
                <Text style={[s.endedNum, { color: '#30D158' }]}>{host2Score}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.endedBtn} onPress={handleExit}>
              <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.endedBtnGrad}>
                <Text style={s.endedBtnText}>Back to Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadText: { color: '#AAA', fontSize: 15 },

  // Arena
  arena: { flex: 1, flexDirection: 'row' },
  hostPanel: { flex: 1, overflow: 'hidden' },
  video: { flex: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  avatarLg: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  waitText: { color: '#666', fontSize: 13, marginTop: 8 },
  hostLabel: {
    position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center',
  },
  hostDot: { width: 8, height: 8, borderRadius: 4 },
  hostName: {
    color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: 100,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    overflow: 'hidden', marginTop: 4,
  },
  winnerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4,
    backgroundColor: 'rgba(255,215,0,0.2)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)',
  },
  winnerBadgeText: { color: '#FFD700', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  selectedBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 3 },

  // VS
  vsPos: {
    position: 'absolute', left: '50%', top: '40%', zIndex: 20, marginLeft: -24, marginTop: -24,
  },
  vsCircle: { width: 48, height: 48, borderRadius: 24 },
  vsGrad: {
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  vsText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },

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
  topCenter: { alignItems: 'center', gap: 4 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,45,85,0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  liveText: { color: '#FF2D55', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  viewerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  viewerText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },

  // Score
  scorePos: {
    position: 'absolute', top: Platform.OS === 'ios' ? 110 : 96,
    left: 16, right: 16, zIndex: 15,
  },
  scoreWrap: { gap: 4 },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  scoreLR: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreNum: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  scoreTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(48,209,88,0.4)', overflow: 'hidden' },
  scoreFill: { height: '100%', backgroundColor: '#FF2D55', borderRadius: 3 },

  // Bottom panel
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  chatArea: { marginBottom: 8, maxHeight: 100 },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4,
    alignSelf: 'flex-start', maxWidth: '85%',
  },
  chatMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  chatUser: { color: '#FF2D55', fontWeight: '800', fontSize: 13 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chatField: {
    flex: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18, justifyContent: 'center',
  },
  chatInput: { flex: 1, height: 36, paddingHorizontal: 14, color: '#FFF', fontSize: 13 },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: '#FF2D55' },
  giftTarget: { color: '#AAA', fontSize: 12, textAlign: 'center', marginBottom: 6 },
  giftsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  giftBtn: { alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10 },
  giftBtnOff: { opacity: 0.4 },
  giftIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  giftLabel: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  giftCost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  giftCostText: { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  tapHint: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 4 },

  // Floating gift
  giftFloat: { position: 'absolute', bottom: 200, zIndex: 50 },
  giftFloatBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  giftFloatVal: { fontSize: 14, fontWeight: '800' },

  // Ended overlay
  endedOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  endedCard: {
    backgroundColor: 'rgba(28,28,30,0.95)', borderRadius: 24, padding: 32,
    alignItems: 'center', marginHorizontal: 24, width: SW - 48,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  endedTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 12 },
  endedScores: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20, marginBottom: 20 },
  endedScoreBox: { alignItems: 'center', gap: 4 },
  endedName: { color: '#999', fontSize: 12 },
  endedNum: { fontSize: 28, fontWeight: '800' },
  endedVs: { color: '#555', fontSize: 16, fontWeight: '800' },
  endedBtn: { width: '100%' },
  endedBtnGrad: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  endedBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
