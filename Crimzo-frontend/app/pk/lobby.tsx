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
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiGet, apiPost, resolveMediaUrl, ApiError } from '../../lib/apiClient';
import { subscribe } from '../../lib/realtimeSync';
import { appAlert } from '../../lib/appAlert';
import { sameUserId } from '../../lib/agoraUid';
import {
  getPkBattleDisplayStatus,
  getPkBattleWinnerLabel,
  isPkBattleWinner,
} from '../../lib/pkBattleCard';
const { width: SW, height: SH } = Dimensions.get('window');

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string | null;
  wins: number;
  total_score: number;
};

type RankingData = {
  monthLabel?: string;
  rewardDiamonds?: number;
  nextAnnouncementLabel?: string;
  rankingNote?: string;
  lastWinner?: {
    username?: string;
    monthLabel?: string;
    wins?: number;
    total_score?: number;
    diamonds?: number;
  } | null;
  myRank?: { rank: number | null; wins: number; total_score: number };
  leaderboard?: LeaderboardEntry[];
  leaderboardUnlocked?: boolean;
  unlockCostDiamonds?: number;
  unlockCostInr?: number;
  hiddenCount?: number;
  totalLeaderboardCount?: number;
  previewCount?: number;
};

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

function LeaderboardRankRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const medal = entry.rank === 1 ? '#FFD700' : entry.rank === 2 ? '#C0C0C0' : entry.rank === 3 ? '#CD7F32' : '#666';
  return (
    <View style={[lobbyStyles.rankRow, isMe && lobbyStyles.rankRowMe]}>
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
}

function BlurredLeaderboardRow({ rank }: { rank: number }) {
  return (
    <View style={[lobbyStyles.rankRow, lobbyStyles.rankRowBlurred]}>
      <Text style={[lobbyStyles.rankNum, { color: '#444' }]}>#{rank}</Text>
      <View style={lobbyStyles.rankAvatarBlur} />
      <View style={lobbyStyles.rankInfo}>
        <View style={lobbyStyles.rankNameBlur} />
        <View style={lobbyStyles.rankStatsBlur} />
      </View>
    </View>
  );
}

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
  const displayStatus = getPkBattleDisplayStatus(battle);
  const isWaiting = displayStatus === 'waiting';
  const isActive = displayStatus === 'active';
  const isEnded = displayStatus === 'ended';
  const host1Won = isPkBattleWinner(battle, 'host1');
  const host2Won = isPkBattleWinner(battle, 'host2');
  const winnerLabel = getPkBattleWinnerLabel(battle);
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

        {isEnded && (
          <LinearGradient
            colors={winnerLabel ? ['rgba(255,215,0,0.28)', 'rgba(255,149,0,0.12)'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={lobbyStyles.winnerBanner}
          >
            <MaterialCommunityIcons name="trophy" size={16} color="#FFD700" />
            <Text style={lobbyStyles.winnerBannerText} numberOfLines={1}>
              {winnerLabel ? `${winnerLabel} is the WINNER` : 'Battle ended in a draw'}
            </Text>
          </LinearGradient>
        )}

        {/* Hosts row */}
        <View style={lobbyStyles.hostsRow}>
          {/* Host 1 */}
          <View style={[lobbyStyles.hostCol, isEnded && !host1Won && host2Won && lobbyStyles.hostColLoser]}>
            <View style={{ position: 'relative' }}>
              <View style={host1Won ? lobbyStyles.winnerAvatarRing : undefined}>
                <UserAvatar
                  uri={battle.host1_avatar}
                  name={battle.host1_username || 'Host'}
                  size={52}
                  colors={['#FF2D55', '#FF6B8A']}
                />
              </View>
              {isEnded && host1Won && <WinnerCrown />}
              {isEnded && host1Won && (
                <View style={lobbyStyles.winnerTag}>
                  <Text style={lobbyStyles.winnerTagText}>WINNER</Text>
                </View>
              )}
            </View>
            <View style={lobbyStyles.hostNameRow}>
              <Text style={[lobbyStyles.hostName, host1Won && lobbyStyles.hostNameWinner]} numberOfLines={1}>
                {battle.host1_username || 'Host 1'}
              </Text>
              {isEnded && host1Won && (
                <View style={lobbyStyles.winnerNameTag}>
                  <Text style={lobbyStyles.winnerNameTagText}>WINNER</Text>
                </View>
              )}
            </View>
            <View style={[lobbyStyles.hostScorePill, host1Won && lobbyStyles.hostScorePillWinner]}>
              <Ionicons name="flame" size={10} color={host1Won ? '#FFD700' : '#FF2D55'} />
              <Text style={[lobbyStyles.hostScoreText, host1Won && lobbyStyles.hostScoreTextWinner]}>
                {battle.host1_score || 0}
              </Text>
            </View>
          </View>

          {/* VS */}
          <View style={lobbyStyles.vsCol}>
            <LinearGradient colors={['#FF9500', '#FF2D55']} style={lobbyStyles.vsSmall}>
              <Text style={lobbyStyles.vsSmallText}>VS</Text>
            </LinearGradient>
          </View>

          {/* Host 2 */}
          <View style={[lobbyStyles.hostCol, isEnded && !host2Won && host1Won && lobbyStyles.hostColLoser]}>
            {battle.host2_id ? (
              <>
                <View style={{ position: 'relative' }}>
                  <View style={host2Won ? lobbyStyles.winnerAvatarRing : undefined}>
                    <UserAvatar
                      uri={battle.host2_avatar}
                      name={battle.host2_username || 'Host'}
                      size={52}
                      colors={['#30D158', '#4ADE80']}
                    />
                  </View>
                  {isEnded && host2Won && <WinnerCrown />}
                  {isEnded && host2Won && (
                    <View style={lobbyStyles.winnerTag}>
                      <Text style={lobbyStyles.winnerTagText}>WINNER</Text>
                    </View>
                  )}
                </View>
                <View style={lobbyStyles.hostNameRow}>
                  <Text style={[lobbyStyles.hostName, host2Won && lobbyStyles.hostNameWinner]} numberOfLines={1}>
                    {battle.host2_username || 'Host 2'}
                  </Text>
                  {isEnded && host2Won && (
                    <View style={lobbyStyles.winnerNameTag}>
                      <Text style={lobbyStyles.winnerNameTagText}>WINNER</Text>
                    </View>
                  )}
                </View>
                <View style={[lobbyStyles.hostScorePill, { borderColor: 'rgba(48,209,88,0.3)' }, host2Won && lobbyStyles.hostScorePillWinner]}>
                  <Ionicons name="flame" size={10} color={host2Won ? '#FFD700' : '#30D158'} />
                  <Text style={[lobbyStyles.hostScoreText, host2Won && lobbyStyles.hostScoreTextWinner]}>
                    {battle.host2_score || 0}
                  </Text>
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
            <View style={lobbyStyles.endedResultRow}>
              <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
              <Text style={lobbyStyles.endedResult}>
                {winnerLabel ? `${winnerLabel} won with most points` : 'Draw — equal points'}
              </Text>
            </View>
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
  const { token, user, updateUser } = useAuth();
  const router = useRouter();
  const [battles, setBattles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [durationModalVisible, setDurationModalVisible] = useState(false);
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false);
  const [unlockingLeaderboard, setUnlockingLeaderboard] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('5');
  const [ranking, setRanking] = useState<RankingData | null>(null);

  // Entrance animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const btnFade = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(0.9)).current;

  const fetchRanking = async () => {
    try {
      const data = await apiGet<RankingData & { success?: boolean }>('/api/pk/leaderboard', token);
      setRanking(data);
    } catch {
      setRanking({
        monthLabel: 'This Month',
        rewardDiamonds: 10000,
        nextAnnouncementLabel: '3rd of every month',
        myRank: { rank: null, wins: 0, total_score: 0 },
        leaderboard: [],
        leaderboardUnlocked: false,
        unlockCostDiamonds: 1979,
        unlockCostInr: 39,
        hiddenCount: 0,
        totalLeaderboardCount: 0,
        previewCount: 3,
      });
    }
  };

  const openLeaderboard = () => {
    setLeaderboardModalVisible(true);
    void fetchRanking();
  };

  const handleUnlockLeaderboard = async () => {
    if (unlockingLeaderboard) return;
    const cost = ranking?.unlockCostDiamonds ?? 1979;
    const inr = ranking?.unlockCostInr ?? 39;

    if ((user?.diamonds ?? 0) < cost) {
      appAlert(
        'Not enough diamonds',
        `Full leaderboard unlock costs ${cost.toLocaleString('en-IN')} diamonds (≈ ₹${inr}).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Diamonds', onPress: () => router.push('/profile/wallet?tab=diamonds' as any) },
        ],
      );
      return;
    }

    setUnlockingLeaderboard(true);
    try {
      const data = await apiPost<RankingData & { success?: boolean; diamonds?: number }>(
        '/api/pk/leaderboard/unlock',
        {},
        token,
      );
      setRanking(data);
      if (typeof data.diamonds === 'number') updateUser({ diamonds: data.diamonds });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 402) {
        appAlert(
          'Not enough diamonds',
          error instanceof ApiError ? error.message : `Need ${cost.toLocaleString('en-IN')} diamonds`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Diamonds', onPress: () => router.push('/profile/wallet?tab=diamonds' as any) },
          ],
        );
      } else {
        appAlert('Unlock failed', error instanceof ApiError ? error.message : 'Could not unlock leaderboard');
      }
    } finally {
      setUnlockingLeaderboard(false);
    }
  };

  const battlesRef = useRef(battles);
  battlesRef.current = battles;

  useEffect(() => {
    void fetchBattles();
    void fetchRanking();
  }, [token]);

  useEffect(() => {
    const unsubBattles = subscribe('pk_battles_updated', () => { void fetchBattles(); });
    const unsubLb = subscribe('pk_leaderboard_updated', () => { void fetchRanking(); });
    const unsubWinner = subscribe('pk_monthly_winner', () => { void fetchRanking(); });
    return () => {
      unsubBattles();
      unsubLb();
      unsubWinner();
    };
  }, [token]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const syncPolling = () => {
      const foreground = AppState.currentState === 'active';
      const hasLive = battlesRef.current.some((b) => getPkBattleDisplayStatus(b) === 'active');

      if (!foreground || !hasLive) {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        return;
      }

      if (!pollInterval) {
        pollInterval = setInterval(() => {
          if (AppState.currentState === 'active') void fetchBattles();
        }, 15000);
      }
    };

    syncPolling();
    const appSub = AppState.addEventListener('change', syncPolling);
    const watchdog = setInterval(syncPolling, 10000);

    return () => {
      appSub.remove();
      clearInterval(watchdog);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [token]);

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
      setFetchError(null);
    } catch (error) {
      console.error('Fetch battles error:', error);
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 502 || status === 503 || status === 504) {
        setFetchError('Server is waking up. Pull down to refresh in a few seconds.');
      } else {
        const message = error instanceof ApiError ? error.message : 'Could not load battles';
        setFetchError(message);
      }
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
          <View style={lobbyStyles.headerActions}>
            <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={openLeaderboard}>
              <Ionicons name="trophy" size={20} color="#FFD700" />
            </TouchableOpacity>
            <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={onRefresh}>
              <Ionicons name="refresh" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
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
          <View style={lobbyStyles.headerActions}>
            <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={openLeaderboard}>
              <Ionicons name="trophy" size={20} color="#FFD700" />
            </TouchableOpacity>
            <TouchableOpacity style={lobbyStyles.refreshBtn} onPress={onRefresh}>
              <Ionicons name="refresh" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
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

      {/* ── Section Header ── */}
      <View style={lobbyStyles.sectionHeader}>
        <View style={lobbyStyles.sectionLeft}>
          <View style={lobbyStyles.sectionDot} />
          <Text style={lobbyStyles.sectionTitle}>Active Battles</Text>
        </View>
        <Text style={lobbyStyles.sectionCount}>{battles.length}</Text>
      </View>

      {fetchError && battles.length > 0 ? (
        <View style={lobbyStyles.fetchErrorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#FF9F0A" />
          <Text style={lobbyStyles.fetchErrorBannerText}>{fetchError}</Text>
        </View>
      ) : null}

      {/* ── Battle List ── */}
      {loading ? (
        <View style={lobbyStyles.loaderInline}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={lobbyStyles.loaderText}>Loading battles...</Text>
        </View>
      ) : fetchError && battles.length === 0 ? (
        <View style={lobbyStyles.emptyState}>
          <View style={lobbyStyles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color="#FF9F0A" />
          </View>
          <Text style={lobbyStyles.emptyTitle}>Could Not Load Battles</Text>
          <Text style={lobbyStyles.emptySub}>{fetchError}</Text>
          <TouchableOpacity style={lobbyStyles.emptyBtn} onPress={() => { setLoading(true); fetchBattles(); }}>
            <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={lobbyStyles.emptyBtnGrad}>
              <Ionicons name="refresh" size={18} color="#FFF" />
              <Text style={lobbyStyles.emptyBtnText}>Try Again</Text>
            </LinearGradient>
          </TouchableOpacity>
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
        visible={leaderboardModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLeaderboardModalVisible(false)}
      >
        <View style={lobbyStyles.lbModalOverlay}>
          <View style={lobbyStyles.lbModalCard}>
            <View style={lobbyStyles.lbModalHeader}>
              <View style={lobbyStyles.lbModalHeaderLeft}>
                <Ionicons name="trophy" size={22} color="#FFD700" />
                <View>
                  <Text style={lobbyStyles.lbModalTitle}>PK Leaderboard</Text>
                  <Text style={lobbyStyles.lbModalSub}>{ranking?.monthLabel || 'This Month'} · Live rankings</Text>
                </View>
              </View>
              <TouchableOpacity style={lobbyStyles.lbCloseBtn} onPress={() => setLeaderboardModalVisible(false)}>
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>

            <Text style={lobbyStyles.lbRewardNote}>
              Top player on 3rd of every month wins {(ranking?.rewardDiamonds || 10000).toLocaleString('en-IN')} diamonds
            </Text>

            {ranking?.myRank?.rank ? (
              <View style={lobbyStyles.lbMyRankBanner}>
                <Text style={lobbyStyles.lbMyRankText}>
                  Your rank: #{ranking.myRank.rank} · {ranking.myRank.wins} wins · {ranking.myRank.total_score} score
                </Text>
              </View>
            ) : null}

            <ScrollView style={lobbyStyles.lbScroll} showsVerticalScrollIndicator={false}>
              {(ranking?.leaderboard?.length || 0) > 0 ? (
                ranking!.leaderboard!.map((entry) => (
                  <LeaderboardRankRow
                    key={`${entry.user_id}-${entry.rank}`}
                    entry={entry}
                    isMe={sameUserId(entry.user_id, user?.id)}
                  />
                ))
              ) : (
                <Text style={lobbyStyles.rankEmpty}>Win PK battles to appear on the leaderboard</Text>
              )}

              {!ranking?.leaderboardUnlocked && (ranking?.hiddenCount || 0) > 0 ? (
                <View style={lobbyStyles.lbLockedSection}>
                  {Array.from({ length: Math.min(ranking?.hiddenCount || 0, 5) }).map((_, i) => {
                    const rank = (ranking?.previewCount || 3) + i + 1;
                    return <BlurredLeaderboardRow key={`blur-${rank}`} rank={rank} />;
                  })}
                  <View style={lobbyStyles.lbBlurOverlay}>
                    <MaterialCommunityIcons name="lock" size={28} color="#FFD700" />
                    <Text style={lobbyStyles.lbLockTitle}>See Complete Leaderboard</Text>
                    <Text style={lobbyStyles.lbLockSub}>
                      Unlock with {(ranking?.unlockCostDiamonds || 1979).toLocaleString('en-IN')} diamonds
                      {' '}(≈ ₹{ranking?.unlockCostInr || 39})
                    </Text>
                    <Text style={lobbyStyles.lbLockHint}>
                      +{(ranking?.hiddenCount || 0)} more players hidden
                    </Text>
                    <TouchableOpacity
                      style={lobbyStyles.lbUnlockBtn}
                      onPress={handleUnlockLeaderboard}
                      disabled={unlockingLeaderboard}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={['#FFD700', '#FF9500']} style={lobbyStyles.lbUnlockBtnGrad}>
                        {unlockingLeaderboard ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <>
                            <Ionicons name="diamond" size={16} color="#000" />
                            <Text style={lobbyStyles.lbUnlockBtnText}>Unlock Full Board</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {ranking?.leaderboardUnlocked && (ranking?.lastWinner?.username || ranking?.nextAnnouncementLabel) ? (
                <View style={lobbyStyles.lbFooterMeta}>
                  {ranking?.lastWinner?.username ? (
                    <Text style={lobbyStyles.lbFooterText}>
                      Last crown: {ranking.lastWinner.username} ({ranking.lastWinner.monthLabel})
                    </Text>
                  ) : null}
                  {ranking?.nextAnnouncementLabel ? (
                    <Text style={lobbyStyles.lbFooterText}>Next announcement: {ranking.nextAnnouncementLabel}</Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10, marginBottom: 8,
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
  rankRowBlurred: { opacity: 0.35 },
  rankAvatarBlur: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rankNameBlur: {
    height: 12, width: '70%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 6,
  },
  rankStatsBlur: {
    height: 9, width: '50%', borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)',
  },

  lbModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end',
  },
  lbModalCard: {
    backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SH * 0.82, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 28,
  },
  lbModalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10,
  },
  lbModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  lbModalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  lbModalSub: { color: '#888', fontSize: 12, marginTop: 2 },
  lbCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  lbRewardNote: { color: '#AAA', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  lbMyRankBanner: {
    backgroundColor: 'rgba(255,45,85,0.15)', borderRadius: 12, padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)',
  },
  lbMyRankText: { color: '#FF6B8A', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  lbScroll: { maxHeight: SH * 0.58 },
  lbLockedSection: { position: 'relative', marginTop: 4, minHeight: 180 },
  lbBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, borderRadius: 16,
    overflow: 'hidden', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  lbLockTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', marginTop: 4 },
  lbLockSub: { color: '#FFD700', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  lbLockHint: { color: '#888', fontSize: 11, marginBottom: 8 },
  lbUnlockBtn: { marginTop: 4, width: '100%' },
  lbUnlockBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  lbUnlockBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
  lbFooterMeta: { marginTop: 16, gap: 4, paddingBottom: 8 },
  lbFooterText: { color: '#888', fontSize: 11, textAlign: 'center' },

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
  fetchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,159,10,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.25)',
  },
  fetchErrorBannerText: { color: '#FFCC80', fontSize: 13, flex: 1, lineHeight: 18 },

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
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  winnerBannerText: { color: '#FFD700', fontSize: 13, fontWeight: '800', flex: 1 },
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
  hostColLoser: { opacity: 0.55 },
  winnerAvatarRing: {
    borderWidth: 2.5,
    borderColor: '#FFD700',
    borderRadius: 30,
    padding: 2,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },

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
  hostScorePillWinner: { borderColor: 'rgba(255,215,0,0.55)', backgroundColor: 'rgba(255,215,0,0.1)' },
  hostScoreTextWinner: { color: '#FFD700', fontWeight: '800' },

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
  endedResultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flex: 1 },
  endedResult: { color: '#FFD700', fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },

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
