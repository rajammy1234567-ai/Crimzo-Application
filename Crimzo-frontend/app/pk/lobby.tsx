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
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';
import { API_URL, apiGet, resolveMediaUrl } from '../../lib/apiClient';
import { sameUserId } from '../../lib/agoraUid';
import { isPkBattleWinner } from '../../lib/pkBattleCard';
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

const WinnerCrown = () => (
  <View style={lobbyStyles.crownBadge}>
    <MaterialCommunityIcons name="crown" size={15} color="#FFD700" />
  </View>
);

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
  const isActive = battle.status === 'active';
  const isEnded = battle.status === 'ended';
  const host1Won = isPkBattleWinner(battle, 'host1');
  const host2Won = isPkBattleWinner(battle, 'host2');
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
        {isActive && (
          <View style={[lobbyStyles.statusBadge, lobbyStyles.statusBadgeLive]}>
            <View style={lobbyStyles.livePulseDot} />
            <Text style={[lobbyStyles.statusText, lobbyStyles.statusTextLive]}>LIVE BATTLE</Text>
          </View>
        )}
        {isEnded && (
          <View style={[lobbyStyles.statusBadge, lobbyStyles.statusBadgeEnded]}>
            <Ionicons name="flag" size={10} color="#FFD700" />
            <Text style={[lobbyStyles.statusText, lobbyStyles.statusTextEnded]}>BATTLE ENDED</Text>
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
              {isEnded && host1Won && <WinnerCrown />}
            </View>
            <View style={lobbyStyles.hostNameRow}>
              <Text style={[lobbyStyles.hostName, host1Won && lobbyStyles.hostNameWinner]} numberOfLines={1}>
                {battle.host1_username || 'Host 1'}
              </Text>
            </View>
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
                  {isEnded && host2Won && <WinnerCrown />}
                </View>
                <View style={lobbyStyles.hostNameRow}>
                  <Text style={[lobbyStyles.hostName, host2Won && lobbyStyles.hostNameWinner]} numberOfLines={1}>
                    {battle.host2_username || 'Host 2'}
                  </Text>
                </View>
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
          {isActive && (
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
              {battle.winner_username
                ? `${battle.winner_username} won`
                : host1Won
                  ? `${battle.host1_username || 'Host 1'} won`
                  : host2Won
                    ? `${battle.host2_username || 'Host 2'} won`
                    : 'Draw'}
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
type PKLobbyProps = { embedded?: boolean };

export function PKLobbyContent({ embedded = false }: PKLobbyProps) {
  const { token, user } = useAuth();
  const router = useRouter();
  const [battles, setBattles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [durationModalVisible, setDurationModalVisible] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('5');
  const [ranking, setRanking] = useState<{
    monthLabel?: string;
    rewardDiamonds?: number;
    nextAnnouncementLabel?: string;
    rankingNote?: string;
    lastWinner?: { username?: string; monthLabel?: string; wins?: number; total_score?: number; diamonds?: number } | null;
    myRank?: { rank: number | null; wins: number; total_score: number };
    leaderboard?: Array<{
      rank: number;
      user_id: string;
      username: string;
      avatar?: string | null;
      wins: number;
      total_score: number;
    }>;
  } | null>(null);

  // Entrance animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const btnFade = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.9)).current;

  const fetchRanking = async () => {
    try {
      const data = await apiGet<typeof ranking & { success?: boolean }>('/api/pk/leaderboard', token);
      setRanking(data);
    } catch {
      setRanking({
        monthLabel: 'This Month',
        rewardDiamonds: 10000,
        nextAnnouncementLabel: '3rd of every month',
        myRank: { rank: null, wins: 0, total_score: 0 },
        leaderboard: [],
      });
    }
  };

  useEffect(() => {
    fetchBattles();
    fetchRanking();
    if (token && API_URL) {
      const sock = io(API_URL, { transports: ['websocket'], auth: { token } });
      sock.on('pk_battles_updated', () => { void fetchBattles(); });
      sock.on('pk_monthly_winner', () => { void fetchRanking(); });
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
    fetchRanking();
  };

  const handleCreateBattle = () => {
    setDurationModalVisible(true);
  };

  const startBattleWithDuration = (duration: number) => {
    setDurationModalVisible(false);
    router.push(`/pk/battle?mode=create&duration=${duration}` as any);
  };

  const startCustomBattle = () => {
    const mins = Math.floor(Number(customMinutes));
    if (!Number.isFinite(mins) || mins < 1 || mins > 60) return;
    startBattleWithDuration(mins * 60);
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
    <View style={[lobbyStyles.container, embedded && lobbyStyles.containerEmbedded]}>
      {!embedded && (
        <>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          <LinearGradient colors={['#1a0a1e', '#0d0d1a', '#000']} style={StyleSheet.absoluteFill} />
        </>
      )}

      {/* ── Header ── */}
      {embedded ? (
        <View style={lobbyStyles.embeddedHeader}>
          <View>
            <Text style={lobbyStyles.embeddedTitle}>PK Battle</Text>
            <Text style={lobbyStyles.embeddedSub}>Compete live · vote with gifts</Text>
          </View>
          <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : (
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
      )}

      <ScrollView
        style={lobbyStyles.mainScroll}
        contentContainerStyle={[
          lobbyStyles.mainScrollContent,
          embedded && lobbyStyles.mainScrollContentEmbedded,
        ]}
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

      {/* ── Monthly Ranking ── */}
      <View style={lobbyStyles.rankCard}>
        <View style={lobbyStyles.rankHeader}>
          <View style={lobbyStyles.rankHeaderLeft}>
            <Ionicons name="trophy" size={18} color="#FFD700" />
            <Text style={lobbyStyles.rankTitle}>PK Ranking — {ranking?.monthLabel || 'This Month'}</Text>
          </View>
          {ranking?.myRank?.rank ? (
            <View style={lobbyStyles.myRankPill}>
              <Text style={lobbyStyles.myRankText}>#{ranking.myRank.rank}</Text>
            </View>
          ) : null}
        </View>
        <Text style={lobbyStyles.rankSub}>
          Top player announced on 3rd of every month · {(ranking?.rewardDiamonds || 10000).toLocaleString('en-IN')} diamonds reward
        </Text>
        {ranking?.nextAnnouncementLabel ? (
          <Text style={lobbyStyles.rankMeta}>Next announcement: {ranking.nextAnnouncementLabel}</Text>
        ) : null}
        {ranking?.lastWinner?.username ? (
          <View style={lobbyStyles.lastWinnerRow}>
            <Ionicons name="ribbon" size={14} color="#FFD700" />
            <Text style={lobbyStyles.lastWinnerText}>
              Last winner: {ranking.lastWinner.username} ({ranking.lastWinner.monthLabel})
            </Text>
          </View>
        ) : null}
        {(ranking?.leaderboard?.length || 0) > 0 ? (
          <View style={lobbyStyles.rankList}>
            {ranking!.leaderboard!.slice(0, 5).map((entry) => {
              const isMe = sameUserId(entry.user_id, user?.id);
              const medal = entry.rank === 1 ? '#FFD700' : entry.rank === 2 ? '#C0C0C0' : entry.rank === 3 ? '#CD7F32' : '#666';
              return (
                <View key={entry.user_id} style={[lobbyStyles.rankRow, isMe && lobbyStyles.rankRowMe]}>
                  <Text style={[lobbyStyles.rankNum, { color: medal }]}>#{entry.rank}</Text>
                  {entry.avatar ? (
                    <Image source={{ uri: resolveMediaUrl(entry.avatar) }} style={lobbyStyles.rankAvatar} />
                  ) : (
                    <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={lobbyStyles.rankAvatar}>
                      <Text style={lobbyStyles.rankAvatarText}>{(entry.username || '?').charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  )}
                  <View style={lobbyStyles.rankInfo}>
                    <Text style={lobbyStyles.rankName} numberOfLines={1}>{entry.username}</Text>
                    <Text style={lobbyStyles.rankStats}>{entry.wins} wins · {entry.total_score} score</Text>
                  </View>
                  {entry.rank === 1 ? (
                    <View style={lobbyStyles.rankTopBadge}>
                      <Text style={lobbyStyles.rankTopBadgeText}>TOP</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={lobbyStyles.rankEmpty}>Win PK battles to climb the leaderboard</Text>
        )}
        {ranking?.myRank && (ranking.myRank.wins > 0 || ranking.myRank.total_score > 0) ? (
          <Text style={lobbyStyles.rankYou}>
            You: {ranking.myRank.wins} wins · {ranking.myRank.total_score} score
            {ranking.myRank.rank ? ` · Rank #${ranking.myRank.rank}` : ''}
          </Text>
        ) : null}
      </View>

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
        <View style={lobbyStyles.loaderInline}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={lobbyStyles.loaderText}>Loading battles...</Text>
        </View>
      ) : battles.length > 0 ? (
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
            <View style={lobbyStyles.customDurationBox}>
              <Text style={lobbyStyles.customDurationLabel}>Custom duration (1–60 min)</Text>
              <View style={lobbyStyles.customDurationRow}>
                <TextInput
                  style={lobbyStyles.customDurationInput}
                  value={customMinutes}
                  onChangeText={(t) => setCustomMinutes(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="5"
                  placeholderTextColor="#666"
                  maxLength={2}
                />
                <Text style={lobbyStyles.customDurationUnit}>min</Text>
                <TouchableOpacity style={lobbyStyles.customDurationBtn} onPress={startCustomBattle}>
                  <Text style={lobbyStyles.customDurationBtnText}>Start</Text>
                </TouchableOpacity>
              </View>
              <Text style={lobbyStyles.customDurationHint}>Timer starts when opponent joins · viewers vote with gifts</Text>
            </View>
            <TouchableOpacity style={lobbyStyles.modalCancel} onPress={() => setDurationModalVisible(false)}>
              <Text style={lobbyStyles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function PKLobbyScreen() {
  return <PKLobbyContent />;
}

const lobbyStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  containerEmbedded: { flex: 1, backgroundColor: 'transparent' },
  embeddedHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  embeddedTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  embeddedSub: { color: '#888', fontSize: 12, marginTop: 2 },

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
  mainScroll: { flex: 1 },
  mainScrollContent: { paddingBottom: 40 },
  mainScrollContentEmbedded: { paddingBottom: 24 },
  createHero: { marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
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

  rankCard: {
    marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 18,
    backgroundColor: 'rgba(28,28,30,0.85)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)',
  },
  rankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rankHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  rankTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  myRankPill: {
    backgroundColor: 'rgba(255,45,85,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)',
  },
  myRankText: { color: '#FF6B8A', fontSize: 12, fontWeight: '800' },
  rankSub: { color: '#AAA', fontSize: 12, lineHeight: 17 },
  rankMeta: { color: '#888', fontSize: 11, marginTop: 6 },
  lastWinnerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  lastWinnerText: { color: '#FFD700', fontSize: 12, fontWeight: '600', flex: 1 },
  rankList: { marginTop: 12, gap: 8 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10,
  },
  rankRowMe: { borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)' },
  rankNum: { width: 28, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  rankAvatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  rankAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  rankInfo: { flex: 1 },
  rankName: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  rankStats: { color: '#888', fontSize: 11, marginTop: 2 },
  rankTopBadge: {
    backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
  },
  rankTopBadgeText: { color: '#FFD700', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  rankEmpty: { color: '#666', fontSize: 12, marginTop: 12, textAlign: 'center' },
  rankYou: { color: '#CCC', fontSize: 11, marginTop: 10, textAlign: 'center', fontWeight: '600' },

  // Section
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 8,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 4, height: 16, borderRadius: 2, backgroundColor: '#FF2D55' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  sectionCount: { color: '#888', fontSize: 14, fontWeight: '600' },

  loaderInline: { paddingVertical: 48, alignItems: 'center', gap: 12 },

  // Card
  cardWrap: { marginBottom: 12, marginHorizontal: 16 },
  card: {
    backgroundColor: 'rgba(28,28,30,0.8)', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 14,
  },
  statusText: { color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusBadgeLive: { backgroundColor: 'rgba(48,209,88,0.22)', borderWidth: 1, borderColor: 'rgba(48,209,88,0.45)' },
  statusTextLive: { color: '#30D158' },
  livePulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#30D158' },
  statusBadgeEnded: { backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)' },
  statusTextEnded: { color: '#FFD700' },
  crownBadge: {
    position: 'absolute', top: -8, alignSelf: 'center',
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderWidth: 1.5, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 3,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45, shadowRadius: 4, elevation: 6,
  },
  hostNameWinner: { color: '#FFD700', fontWeight: '800' },

  hostsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hostCol: { flex: 1, alignItems: 'center', gap: 6 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110, flexWrap: 'wrap', justifyContent: 'center' },
  hostName: { color: '#FFF', fontSize: 13, fontWeight: '600', maxWidth: 90 },
  winnerNameTag: {
    backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)',
  },
  winnerNameTagText: { color: '#FFD700', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
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
  customDurationBox: {
    marginTop: 8, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  customDurationLabel: { color: '#CCC', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  customDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customDurationInput: {
    width: 56, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center',
  },
  customDurationUnit: { color: '#888', fontSize: 14, fontWeight: '600' },
  customDurationBtn: {
    marginLeft: 'auto', backgroundColor: '#FF2D55', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
  },
  customDurationBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  customDurationHint: { color: '#666', fontSize: 11, marginTop: 10, lineHeight: 16 },
});
