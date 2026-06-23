import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import { API_URL, apiGet, resolveMediaUrl } from '../../lib/apiClient';
import { sameUserId } from '../../lib/agoraUid';

function isPkWinner(battle: any, side: 'host1' | 'host2'): boolean {
  if (battle.status !== 'ended' || !battle.winner_id) return false;
  const hostId = side === 'host1' ? battle.host1_id : battle.host2_id;
  return !!hostId && sameUserId(battle.winner_id, hostId);
}
const { width: SW } = Dimensions.get('window');

const DURATION_OPTIONS = [
  { label: '3 Minutes', value: 180, sub: 'Quick battle' },
  { label: '5 Minutes', value: 300, sub: 'Standard PK' },
  { label: '10 Minutes', value: 600, sub: 'Extended fight' },
];

function formatDuration(seconds?: number) {
  const s = seconds || 300;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${m}:00`;
}

// ── Animated PK Logo ──
const PKLogo = React.memo(() => {
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <View style={lobbyStyles.pkLogoWrap}>
        <Animated.View style={[lobbyStyles.pkLogoGlow, { opacity: glow }]} />
        <LinearGradient colors={['#FF2D55', '#FF9500']} style={lobbyStyles.pkLogoInner}>
          <Ionicons name="flash" size={28} color="#FFF" />
        </LinearGradient>
      </View>
    </Animated.View>
  );
});

// ── Avatar Component ──
const UserAvatar = ({ uri, name, size = 44, colors }: { uri?: string; name: string; size?: number; colors: string[] }) => {
  if (uri) {
    return <Image source={{ uri: resolveMediaUrl(uri) }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <LinearGradient colors={colors as [string, string, ...string[]]} style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#FFF', fontSize: size * 0.4, fontWeight: 'bold' }}>{(name || '?').charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );
};

// ── Battle Card ──
const BattleCard = ({
  battle,
  isOwnBattle,
  onJoin,
  onResume,
  onWatch,
  index,
}: {
  battle: any;
  isOwnBattle: boolean;
  onJoin: (id: string) => void;
  onResume: (id: string) => void;
  onWatch: (id: string) => void;
  index: number;
}) => {
  const isWaiting = battle.status === 'waiting';
  const isEnded = battle.status === 'ended';
  const host1Won = isPkWinner(battle, 'host1');
  const host2Won = isPkWinner(battle, 'host2');
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 400, delay: index * 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[lobbyStyles.cardWrap, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
      <View style={lobbyStyles.card}>
        {/* Status indicator */}
        {isWaiting && (
          <LinearGradient colors={['#FF9500', '#FF2D55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={lobbyStyles.statusBadge}>
            <Ionicons name="hourglass-outline" size={10} color="#FFF" />
            <Text style={lobbyStyles.statusText}>LOOKING FOR OPPONENT</Text>
          </LinearGradient>
        )}
        {isEnded && (
          <View style={[lobbyStyles.statusBadge, { backgroundColor: 'rgba(255,215,0,0.15)' }]}>
            <Ionicons name="trophy" size={10} color="#FFD700" />
            <Text style={[lobbyStyles.statusText, { color: '#FFD700' }]}>BATTLE ENDED</Text>
          </View>
        )}
        {!isWaiting && !isEnded && (
          <View style={[lobbyStyles.statusBadge, { backgroundColor: 'rgba(48,209,88,0.2)' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#30D158' }} />
            <Text style={[lobbyStyles.statusText, { color: '#30D158' }]}>LIVE BATTLE</Text>
          </View>
        )}

        {/* Hosts row */}
        <View style={lobbyStyles.hostsRow}>
          {/* Host 1 */}
          <View style={lobbyStyles.hostCol}>
            <View style={{ position: 'relative' }}>
              <UserAvatar
                uri={battle.host1_avatar}
                name={battle.host1_username || 'Host'}
                size={52}
                colors={['#FF2D55', '#FF6B8A']}
              />
              {host1Won && (
                <View style={lobbyStyles.winnerTag}>
                  <Text style={lobbyStyles.winnerTagText}>WINNER</Text>
                </View>
              )}
            </View>
            <Text style={[lobbyStyles.hostName, host1Won && { color: '#FFD700' }]} numberOfLines={1}>
              {battle.host1_username || 'Host 1'}
            </Text>
            <View style={lobbyStyles.hostScorePill}>
              <Ionicons name="flame" size={10} color="#FF2D55" />
              <Text style={lobbyStyles.hostScoreText}>{battle.host1_score || 0}</Text>
            </View>
          </View>

          {/* VS */}
          <View style={lobbyStyles.vsCol}>
            <LinearGradient colors={['#FF9500', '#FF2D55']} style={lobbyStyles.vsSmall}>
              <Text style={lobbyStyles.vsSmallText}>VS</Text>
            </LinearGradient>
          </View>

          {/* Host 2 */}
          <View style={lobbyStyles.hostCol}>
            {battle.host2_id ? (
              <>
                <View style={{ position: 'relative' }}>
                  <UserAvatar
                    uri={battle.host2_avatar}
                    name={battle.host2_username || 'Host'}
                    size={52}
                    colors={['#30D158', '#4ADE80']}
                  />
                  {host2Won && (
                    <View style={lobbyStyles.winnerTag}>
                      <Text style={lobbyStyles.winnerTagText}>WINNER</Text>
                    </View>
                  )}
                </View>
                <Text style={[lobbyStyles.hostName, host2Won && { color: '#FFD700' }]} numberOfLines={1}>
                  {battle.host2_username || 'Host 2'}
                </Text>
                <View style={[lobbyStyles.hostScorePill, { borderColor: 'rgba(48,209,88,0.3)' }]}>
                  <Ionicons name="flame" size={10} color="#30D158" />
                  <Text style={lobbyStyles.hostScoreText}>{battle.host2_score || 0}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={lobbyStyles.emptyAvatar}>
                  <Ionicons name="help" size={24} color="#555" />
                </View>
                <Text style={lobbyStyles.emptyHostText}>Waiting...</Text>
              </>
            )}
          </View>
        </View>

        {/* Bottom row */}
        <View style={lobbyStyles.cardBottom}>
          <View style={lobbyStyles.cardMeta}>
            <View style={lobbyStyles.metaItem}>
              <Ionicons name="people-outline" size={13} color="#888" />
              <Text style={lobbyStyles.metaText}>{battle.host2_id ? '2' : '1'}/2</Text>
            </View>
            <View style={lobbyStyles.metaItem}>
              <Ionicons name="timer-outline" size={13} color="#888" />
              <Text style={lobbyStyles.metaText}>{formatDuration(battle.duration)}</Text>
            </View>
          </View>

          {isWaiting && (
            <TouchableOpacity
              style={lobbyStyles.joinBtn}
              onPress={() => (isOwnBattle ? onResume(battle.battle_id) : onJoin(battle.battle_id))}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isOwnBattle ? ['#9333EA', '#6D28D9'] : ['#FF2D55', '#FF6B8A']}
                style={lobbyStyles.joinBtnGrad}
              >
                <Ionicons name={isOwnBattle ? 'enter-outline' : 'flash'} size={14} color="#FFF" />
                <Text style={lobbyStyles.joinBtnText}>{isOwnBattle ? 'Resume' : 'Join Battle'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {!isWaiting && !isEnded && (
            <TouchableOpacity
              style={lobbyStyles.joinBtn}
              onPress={() => onWatch(battle.battle_id)}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#30D158', '#4ADE80']} style={lobbyStyles.joinBtnGrad}>
                <Ionicons name="eye" size={14} color="#FFF" />
                <Text style={lobbyStyles.joinBtnText}>Watch</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {isEnded && (
            <Text style={lobbyStyles.endedResult}>
              {battle.winner_username ? `${battle.winner_username} won` : 'Draw'}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════
// ── Main Lobby Screen ──
// ══════════════════════════════════════════════════
export default function PKLobbyScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [battles, setBattles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [durationModalVisible, setDurationModalVisible] = useState(false);

  // Entrance animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const btnFade = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    fetchBattles();
    if (token && API_URL) {
      const sock = io(API_URL, { transports: ['websocket'], auth: { token } });
      sock.on('pk_battles_updated', () => { void fetchBattles(); });
      return () => { sock.disconnect(); };
    }
  }, [token]);

  useEffect(() => {
    const hasLive = battles.some((b) => b.status === 'active');
    if (!hasLive) return;
    const interval = setInterval(() => { void fetchBattles(); }, 4000);
    return () => clearInterval(interval);
  }, [battles]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(btnFade, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 600, delay: 200, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
    ]).start();
  }, []);

  const fetchBattles = async () => {
    try {
      const response = await apiGet<{ battles?: any[] }>('/api/pk/active', token);
      setBattles(response.battles || []);
    } catch (error) {
      console.error('Fetch battles error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBattles();
  };

  const handleCreateBattle = () => {
    setDurationModalVisible(true);
  };

  const startBattleWithDuration = (duration: number) => {
    setDurationModalVisible(false);
    router.push(`/pk/battle?mode=create&duration=${duration}` as any);
  };

  const handleJoinBattle = (battleId: string) => {
    router.push(`/pk/battle?mode=join&battleId=${battleId}`);
  };

  const handleResumeBattle = (battleId: string) => {
    router.push(`/pk/battle?mode=host&battleId=${battleId}`);
  };

  const handleWatchBattle = (battleId: string) => {
    router.push(`/pk/watch?battleId=${battleId}`);
  };

  return (
    <View style={lobbyStyles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#1a0a1e', '#0d0d1a', '#000']} style={StyleSheet.absoluteFill} />

      {/* ── Header ── */}
      <Animated.View style={[lobbyStyles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <TouchableOpacity style={lobbyStyles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={lobbyStyles.headerCenter}>
          <Text style={lobbyStyles.headerTitle}>PK Battle</Text>
          <Text style={lobbyStyles.headerSub}>Compete live with others</Text>
        </View>
        <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Create Battle Hero ── */}
      <Animated.View style={{ opacity: btnFade, transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          style={lobbyStyles.createHero}
          onPress={handleCreateBattle}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#FF2D55', '#FF6B8A', '#FF9500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={lobbyStyles.createHeroGrad}
          >
            <View style={lobbyStyles.createHeroContent}>
              <PKLogo />
              <View style={lobbyStyles.createHeroText}>
                <Text style={lobbyStyles.createTitle}>Start PK Battle</Text>
                <Text style={lobbyStyles.createSub}>Challenge someone to a live battle</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={32} color="rgba(255,255,255,0.8)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Section Header ── */}
      <View style={lobbyStyles.sectionHeader}>
        <View style={lobbyStyles.sectionLeft}>
          <View style={lobbyStyles.sectionDot} />
          <Text style={lobbyStyles.sectionTitle}>Active Battles</Text>
        </View>
        <Text style={lobbyStyles.sectionCount}>{battles.length}</Text>
      </View>

      {/* ── Battle List ── */}
      {loading ? (
        <View style={lobbyStyles.loaderWrap}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={lobbyStyles.loaderText}>Loading battles...</Text>
        </View>
      ) : (
        <ScrollView
          style={lobbyStyles.list}
          contentContainerStyle={lobbyStyles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF2D55"
              colors={['#FF2D55']}
            />
          }
        >
          {battles.length > 0 ? (
            battles.map((battle, index) => (
              <BattleCard
                key={battle.id || battle.battle_id}
                battle={battle}
                isOwnBattle={sameUserId(battle.host1_id, user?.id)}
                onJoin={handleJoinBattle}
                onResume={handleResumeBattle}
                onWatch={handleWatchBattle}
                index={index}
              />
            ))
          ) : (
            <View style={lobbyStyles.emptyState}>
              <View style={lobbyStyles.emptyIconWrap}>
                <Ionicons name="flash-off-outline" size={48} color="#444" />
              </View>
              <Text style={lobbyStyles.emptyTitle}>No Active Battles</Text>
              <Text style={lobbyStyles.emptySub}>Be the first to create a PK Battle and challenge other streamers!</Text>
              <TouchableOpacity style={lobbyStyles.emptyBtn} onPress={handleCreateBattle}>
                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={lobbyStyles.emptyBtnGrad}>
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={lobbyStyles.emptyBtnText}>Create Battle</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
      <Modal
        visible={durationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDurationModalVisible(false)}
      >
        <View style={lobbyStyles.modalOverlay}>
          <View style={lobbyStyles.modalCard}>
            <Text style={lobbyStyles.modalTitle}>Choose Battle Duration</Text>
            <Text style={lobbyStyles.modalSub}>Timer starts when opponent joins</Text>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={lobbyStyles.durationBtn}
                onPress={() => startBattleWithDuration(opt.value)}
              >
                <View>
                  <Text style={lobbyStyles.durationLabel}>{opt.label}</Text>
                  <Text style={lobbyStyles.durationSub}>{opt.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#FF2D55" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={lobbyStyles.modalCancel} onPress={() => setDurationModalVisible(false)}>
              <Text style={lobbyStyles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const lobbyStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 42,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#888', fontSize: 12, marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
  },

  // Create Hero
  createHero: { marginHorizontal: 16, marginTop: 12, marginBottom: 16 },
  createHeroGrad: { borderRadius: 20, padding: 20 },
  createHeroContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pkLogoWrap: { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  pkLogoGlow: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF2D55',
  },
  pkLogoInner: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  createHeroText: { flex: 1 },
  createTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  createSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },

  // Section
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 8,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 4, height: 16, borderRadius: 2, backgroundColor: '#FF2D55' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  sectionCount: { color: '#888', fontSize: 14, fontWeight: '600' },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // Card
  cardWrap: { marginBottom: 12 },
  card: {
    backgroundColor: 'rgba(28,28,30,0.8)', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 14,
  },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  hostsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hostCol: { flex: 1, alignItems: 'center', gap: 6 },
  hostName: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: 90 },
  hostScorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  hostScoreText: { color: '#CCC', fontSize: 11, fontWeight: '600' },

  vsCol: { paddingHorizontal: 12 },
  vsSmall: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
  },
  vsSmallText: { color: '#FFF', fontSize: 12, fontWeight: '900' },

  emptyAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed',
  },
  emptyHostText: { color: '#666', fontSize: 12 },

  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 12,
  },
  cardMeta: { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#888', fontSize: 12 },

  joinBtn: {},
  joinBtnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14,
  },
  joinBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  winnerTag: {
    position: 'absolute', bottom: -6, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.45)',
  },
  winnerTagText: { color: '#FFD700', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  endedResult: { color: '#FFD700', fontSize: 12, fontWeight: '700', textAlign: 'center', flex: 1 },

  activeBadge: {
    backgroundColor: 'rgba(48,209,88,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
  },
  activeText: { color: '#30D158', fontSize: 12, fontWeight: '600' },

  // Loader
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loaderText: { color: '#888', fontSize: 14 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {},
  emptyBtnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
  },
  emptyBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  modalSub: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  durationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)',
  },
  durationLabel: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  durationSub: { color: '#888', fontSize: 12, marginTop: 2 },
  modalCancel: { alignItems: 'center', marginTop: 8, paddingVertical: 12 },
  modalCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
});
