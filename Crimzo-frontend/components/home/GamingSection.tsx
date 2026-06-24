import React, { useEffect, useState, useRef } from 'react';
import {
    View, Text, TouchableOpacity, Image,
    ScrollView, ActivityIndicator, RefreshControl, StyleSheet,
    Animated, Easing, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 22) / 2;
import io from 'socket.io-client';
import { API_URL, apiGet } from '../../lib/apiClient';
import { sameUserId } from '../../lib/agoraUid';
import { isPkBattleWinner } from '../../lib/pkBattleCard';

interface PKBattle {
    battle_id: string;
    host1_id: string;
    host2_id: string | null;
    host1_username: string;
    host1_avatar: string | null;
    host2_username: string | null;
    host2_avatar: string | null;
    host1_score: number;
    host2_score: number;
    status: string;
    winner_id?: string | null;
    winner_username?: string | null;
}



interface Props {
    token: string;
    currentUserId?: string | number | null;
    onWatchBattle: (battleId: string) => void;
    onJoinBattle: (battleId: string) => void;
    onResumeBattle: (battleId: string) => void;
    onCreateBattle: () => void;
    onWatchStream: (sessionId: number) => void;
    onStartBroadcast: () => void;
    liveStreams: any[];
    refreshing: boolean;
    onRefresh: () => void;
    pkOnly?: boolean;
}

function formatViewers(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function PulsingDot() {
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.8, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ])).start();
    }, []);
    return (
        <View style={{ width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55', transform: [{ scale: pulse }], opacity: 0.4 }} />
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FF2D55' }} />
        </View>
    );
}

// ── PK Battle Card ──
const PKBattleCard: React.FC<{
    battle: PKBattle;
    isOwnBattle: boolean;
    onWatch: () => void;
    onJoin: () => void;
    onResume: () => void;
}> = ({ battle, isOwnBattle, onWatch, onJoin, onResume }) => {
    const h1Initial = (battle.host1_username || 'H').charAt(0).toUpperCase();
    const isWaiting = battle.status === 'waiting';
    const isActive = battle.status === 'active';
    const isEnded = battle.status === 'ended';
    const host1Won = isPkBattleWinner(battle, 'host1');
    const host2Won = isPkBattleWinner(battle, 'host2');

    return (
        <View style={st.pkCard}>
            <LinearGradient colors={['#1C1C2E', '#111118']} style={st.pkCardInner}>
                {/* Header badge */}
                <View style={st.pkBadgeRow}>
                    <LinearGradient
                        colors={isEnded ? ['#FFD700', '#FF9500'] : isWaiting ? ['#FF9500', '#FF6B00'] : ['#FF2D55', '#FF6B8A']}
                        style={st.pkBadge}
                    >
                        {!isEnded && <PulsingDot />}
                        <Text style={st.pkBadgeText}>
                            {isEnded ? 'BATTLE ENDED' : isWaiting ? 'WAITING' : isActive ? 'LIVE BATTLE' : 'PK'}
                        </Text>
                    </LinearGradient>
                    {!isWaiting && (
                        <View style={st.pkScoreMini}>
                            <Text style={[st.pkScoreText, { color: '#FF2D55' }]}>{battle.host1_score || 0}</Text>
                            <Text style={st.pkScoreVs}>:</Text>
                            <Text style={[st.pkScoreText, { color: '#30D158' }]}>{battle.host2_score || 0}</Text>
                        </View>
                    )}
                </View>

                {/* Avatars */}
                <View style={st.pkAvatarRow}>
                    <View style={st.pkAvatarWrap}>
                        <View style={st.pkAvatarFrame}>
                            {battle.host1_avatar ? (
                                <Image source={{ uri: battle.host1_avatar }} style={st.pkAvatar} />
                            ) : (
                                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.pkAvatar}>
                                    <Text style={st.pkAvatarText}>{h1Initial}</Text>
                                </LinearGradient>
                            )}
                            {isEnded && host1Won && (
                                <View style={st.pkCrownBadge}>
                                    <MaterialCommunityIcons name="crown" size={12} color="#FFD700" />
                                </View>
                            )}
                        </View>
                        <View style={st.pkNameRow}>
                            <Text style={[st.pkAvatarName, host1Won && st.pkWinnerName]} numberOfLines={1}>
                                {battle.host1_username}
                            </Text>
                            {host1Won && (
                                <View style={st.pkWinnerNameTag}>
                                    <Text style={st.pkWinnerNameTagText}>WINNER</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={st.pkVsWrap}>
                        <LinearGradient colors={['#FF9500', '#FF2D55']} style={st.pkVsBadge}>
                            <Text style={st.pkVsText}>VS</Text>
                        </LinearGradient>
                    </View>

                    <View style={st.pkAvatarWrap}>
                        <View style={st.pkAvatarFrame}>
                            {battle.host2_avatar ? (
                                <Image source={{ uri: battle.host2_avatar }} style={st.pkAvatar} />
                            ) : battle.host2_username ? (
                                <LinearGradient colors={['#30D158', '#4ADE80']} style={st.pkAvatar}>
                                    <Text style={st.pkAvatarText}>{(battle.host2_username || 'H').charAt(0).toUpperCase()}</Text>
                                </LinearGradient>
                            ) : (
                                <View style={[st.pkAvatar, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
                                    <Ionicons name="help" size={20} color="#555" />
                                </View>
                            )}
                            {isEnded && host2Won && (
                                <View style={st.pkCrownBadge}>
                                    <MaterialCommunityIcons name="crown" size={12} color="#FFD700" />
                                </View>
                            )}
                        </View>
                        <View style={st.pkNameRow}>
                            <Text style={[st.pkAvatarName, host2Won && st.pkWinnerName]} numberOfLines={1}>
                                {battle.host2_username || 'Open Slot'}
                            </Text>
                            {host2Won && (
                                <View style={st.pkWinnerNameTag}>
                                    <Text style={st.pkWinnerNameTagText}>WINNER</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Action button */}
                {isWaiting ? (
                    <TouchableOpacity onPress={isOwnBattle ? onResume : onJoin} activeOpacity={0.8}>
                        <LinearGradient
                            colors={isOwnBattle ? ['#9333EA', '#6D28D9'] : ['#FF9500', '#FF6B00']}
                            style={st.pkActionBtn}
                        >
                            <Ionicons name={isOwnBattle ? 'enter-outline' : 'flash'} size={16} color="#FFF" />
                            <Text style={st.pkActionText}>{isOwnBattle ? 'Resume Battle' : 'Join Battle'}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                ) : isEnded ? (
                    <View style={st.pkEndedRow}>
                        <Ionicons name="trophy" size={14} color="#FFD700" />
                        <Text style={st.pkEndedText}>
                            {battle.winner_username
                                ? `${battle.winner_username} won`
                                : 'Draw'}
                        </Text>
                    </View>
                ) : (
                    <TouchableOpacity onPress={onWatch} activeOpacity={0.8}>
                        <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.pkActionBtn}>
                            <Ionicons name="eye" size={16} color="#FFF" />
                            <Text style={st.pkActionText}>Watch</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </LinearGradient>
        </View>
    );
};

// ── Mini Live Stream Card ──
const MiniStreamCard: React.FC<{ stream: any; onPress: () => void }> = ({ stream, onPress }) => {
    const initial = (stream.username || 'U').charAt(0).toUpperCase();
    return (
        <TouchableOpacity style={st.miniCard} onPress={onPress} activeOpacity={0.85}>
            <View style={st.miniImgWrap}>
                {stream.avatar ? (
                    <Image source={{ uri: stream.avatar }} style={st.miniImg} />
                ) : (
                    <LinearGradient colors={['#1a0a2e', '#15151f']} style={[st.miniImg, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: '#FF6B8A', fontSize: 18, fontWeight: '900' }}>{initial}</Text>
                    </LinearGradient>
                )}
                <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']} style={st.miniGrad} />
                <View style={st.miniLive}>
                    <Text style={st.miniLiveText}>LIVE</Text>
                </View>
                <View style={st.miniInfo}>
                    <Text style={st.miniName} numberOfLines={1}>{stream.username}</Text>
                    <View style={st.miniViewers}>
                        <Ionicons name="eye" size={10} color="rgba(255,255,255,0.6)" />
                        <Text style={st.miniViewerText}>{formatViewers(stream.viewers_count || 0)}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
};

// ══════════════════════════════════════════
// ── Main Gaming Section Component ──
// ══════════════════════════════════════════
const GamingSection: React.FC<Props> = ({
    token, currentUserId, onWatchBattle, onJoinBattle, onResumeBattle, onCreateBattle,
    onWatchStream, onStartBroadcast, liveStreams, refreshing, onRefresh, pkOnly,
}) => {
    const insets = useSafeAreaInsets();
    const [pkBattles, setPkBattles] = useState<PKBattle[]>([]);
    const [loadingPK, setLoadingPK] = useState(true);

    const TAB_BAR_HEIGHT = 60 + (Platform.OS === 'android'
        ? (insets.bottom > 0 ? insets.bottom + 26 : 38)
        : (insets.bottom > 0 ? insets.bottom + 18 : 46));

    useEffect(() => { fetchPKBattles(); }, []);

    useEffect(() => {
        if (!token || !API_URL) return;
        const sock = io(API_URL, { transports: ['websocket'], auth: { token } });
        sock.on('pk_battles_updated', () => { void fetchPKBattles(); });
        return () => { sock.disconnect(); };
    }, [token]);

    useEffect(() => {
        const hasLive = pkBattles.some((b) => b.status === 'active');
        if (!hasLive) return;
        const interval = setInterval(() => { void fetchPKBattles(); }, 4000);
        return () => clearInterval(interval);
    }, [pkBattles]);

    const fetchPKBattles = async () => {
        try {
            const res = await apiGet<{ battles?: PKBattle[] }>('/api/pk/active', token);
            setPkBattles(res.battles || []);
        } catch (e) {
            console.error('Fetch PK battles error:', e);
        } finally {
            setLoadingPK(false);
        }
    };

    const handleRefresh = () => {
        fetchPKBattles();
        onRefresh();
    };

    return (
        <ScrollView
            style={st.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF2D55" />}
        >
            {/* ── PK Battles Section ── */}
            <View style={st.section}>
                <View style={st.sectionHeader}>
                    <View style={st.sectionTitleRow}>
                        <Ionicons name="flash" size={20} color="#FF9500" />
                        <Text style={st.sectionTitle}>PK Battles</Text>
                    </View>
                    <TouchableOpacity onPress={onCreateBattle} activeOpacity={0.8}>
                        <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={st.createBtn}>
                            <Ionicons name="add" size={16} color="#FFF" />
                            <Text style={st.createBtnText}>Create</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {loadingPK ? (
                    <View style={st.loadingWrap}>
                        <ActivityIndicator size="small" color="#FF2D55" />
                    </View>
                ) : pkBattles.length > 0 ? (
                    <View style={st.pkGrid}>
                        {pkBattles.map(battle => {
                            const isOwnBattle = sameUserId(battle.host1_id, currentUserId);
                            return (
                                <PKBattleCard
                                    key={battle.battle_id}
                                    battle={battle}
                                    isOwnBattle={isOwnBattle}
                                    onWatch={() => onWatchBattle(battle.battle_id)}
                                    onJoin={() => onJoinBattle(battle.battle_id)}
                                    onResume={() => onResumeBattle(battle.battle_id)}
                                />
                            );
                        })}
                    </View>
                ) : (
                    <View style={st.emptyPK}>
                        <LinearGradient colors={['rgba(255,149,0,0.1)', 'rgba(255,45,85,0.05)']} style={st.emptyPKInner}>
                            <Ionicons name="flash-outline" size={32} color="rgba(255,149,0,0.5)" />
                            <Text style={st.emptyPKTitle}>No Active Battles</Text>
                            <Text style={st.emptyPKSub}>Be the first to start a PK battle!</Text>
                        </LinearGradient>
                    </View>
                )}
            </View>

            {/* ── Live Streams Section ── */}
            {!pkOnly && (
            <View style={st.section}>
                <View style={st.sectionHeader}>
                    <View style={st.sectionTitleRow}>
                        <Ionicons name="radio" size={20} color="#FF2D55" />
                        <Text style={st.sectionTitle}>Live Streams</Text>
                    </View>
                    <TouchableOpacity onPress={onStartBroadcast} activeOpacity={0.8}>
                        <LinearGradient colors={['#30D158', '#4ADE80']} style={st.createBtn}>
                            <Ionicons name="radio" size={14} color="#FFF" />
                            <Text style={st.createBtnText}>Go Live</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {liveStreams.length > 0 ? (
                    <View style={st.streamGrid}>
                        {liveStreams.map(stream => (
                            <MiniStreamCard
                                key={stream.id}
                                stream={stream}
                                onPress={() => onWatchStream(stream.id)}
                            />
                        ))}
                    </View>
                ) : (
                    <View style={st.emptyPK}>
                        <LinearGradient colors={['rgba(255,45,85,0.1)', 'rgba(255,45,85,0.03)']} style={st.emptyPKInner}>
                            <Ionicons name="radio-outline" size={32} color="rgba(255,45,85,0.5)" />
                            <Text style={st.emptyPKTitle}>No Live Streams</Text>
                            <Text style={st.emptyPKSub}>Start broadcasting to be the first!</Text>
                        </LinearGradient>
                    </View>
                )}
            </View>
            )}

            <View style={{ height: TAB_BAR_HEIGHT + 20 }} />
        </ScrollView>
    );
};

const st = StyleSheet.create({
    scroll: { flex: 1 },
    section: { marginBottom: 24 },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, marginBottom: 12, marginTop: 8,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    createBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    },
    createBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    loadingWrap: { padding: 40, alignItems: 'center' },

    // PK Grid
    pkGrid: { paddingHorizontal: 12, gap: 10 },
    pkCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 4 },
    pkCardInner: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    pkBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    pkBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    },
    pkBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    pkScoreMini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pkScoreText: { fontSize: 16, fontWeight: '900' },
    pkScoreVs: { color: '#555', fontSize: 14, fontWeight: '700' },

    // Avatars
    pkAvatarRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 16 },
    pkAvatarWrap: { alignItems: 'center', gap: 6, flex: 1 },
    pkAvatarFrame: { position: 'relative', alignItems: 'center' },
    pkAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
    pkAvatarText: { color: '#FFF', fontSize: 20, fontWeight: '900' },
    pkNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 100, flexWrap: 'wrap', justifyContent: 'center' },
    pkAvatarName: { color: '#CCC', fontSize: 12, fontWeight: '600', maxWidth: 80 },
    pkWinnerName: { color: '#FFD700' },
    pkWinnerNameTag: {
        backgroundColor: 'rgba(255,215,0,0.12)', paddingHorizontal: 5, paddingVertical: 1,
        borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
    },
    pkWinnerNameTagText: { color: '#FFD700', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
    pkCrownBadge: {
        position: 'absolute', top: -6, alignSelf: 'center',
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.9)', borderWidth: 1.5, borderColor: '#FFD700',
        alignItems: 'center', justifyContent: 'center', zIndex: 2,
    },
    pkWinnerTag: {
        position: 'absolute', bottom: -4, flexDirection: 'row', alignItems: 'center', gap: 2,
        backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.45)',
    },
    pkWinnerTagText: { color: '#FFD700', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
    pkEndedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
    pkEndedText: { color: '#FFD700', fontSize: 13, fontWeight: '700' },
    pkVsWrap: { marginHorizontal: 8 },
    pkVsBadge: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    pkVsText: { color: '#FFF', fontSize: 12, fontWeight: '900' },

    // Action buttons
    pkActionBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12,
    },
    pkActionText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

    // Empty
    emptyPK: { paddingHorizontal: 16 },
    emptyPKInner: {
        borderRadius: 16, padding: 30, alignItems: 'center', gap: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    },
    emptyPKTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    emptyPKSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },

    // Stream grid
    streamGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 6 },
    miniCard: { width: CARD_W, borderRadius: 14, overflow: 'hidden', marginBottom: 2 },
    miniImgWrap: {
        width: '100%', aspectRatio: 0.85, position: 'relative',
        backgroundColor: '#111118', borderRadius: 14, overflow: 'hidden',
    },
    miniImg: { width: '100%', height: '100%' },
    miniGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
    miniLive: {
        position: 'absolute', top: 8, left: 8,
        backgroundColor: '#FF2D55', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    miniLiveText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    miniInfo: {
        position: 'absolute', bottom: 8, left: 8, right: 8,
    },
    miniName: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    miniViewers: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    miniViewerText: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
});

export default GamingSection;
