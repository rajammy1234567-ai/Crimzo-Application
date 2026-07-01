import React, { useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Image,
    ScrollView, ActivityIndicator, RefreshControl, StyleSheet,
    Animated, Easing, Dimensions, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BeanIcon } from '../../lib/currencyIcons';

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 22) / 2;

interface LiveStream {
    id: string | number;
    user_id?: string | number;
    username: string;
    avatar: string | null;
    viewers_count: number;
    followers_count?: number;
    location?: string;
    country?: string;
    talk_rate_per_min?: number;
    voice_rate_per_min?: number;
    chat_rate_per_min?: number;
    daily_beans_earned?: number;
}

interface Props {
    streams: LiveStream[];
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    onWatchStream: (sessionId: string | number) => void;
    onStartBroadcast: () => void;
}

// ── Pulsing LIVE dot ──
function PulsingDot() {
    const pulse = useRef(new Animated.Value(1)).current;
    const opac = useRef(new Animated.Value(0.7)).current;
    useEffect(() => {
        Animated.loop(Animated.parallel([
            Animated.sequence([
                Animated.timing(pulse, { toValue: 2, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(opac, { toValue: 0, duration: 800, useNativeDriver: true }),
                Animated.timing(opac, { toValue: 0.7, duration: 800, useNativeDriver: true }),
            ]),
        ])).start();
    }, []);
    return (
        <View style={{ width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', transform: [{ scale: pulse }], opacity: opac }} />
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF' }} />
        </View>
    );
}

function formatViewers(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

// ── Premium Live Card with profile avatar ──
const LiveStreamCard: React.FC<{ stream: LiveStream; onPress: () => void }> = ({ stream, onPress }) => {
    const initial = (stream.username || 'U').charAt(0).toUpperCase();

    return (
        <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
            <View style={s.cardImageWrap}>
                {stream.avatar ? (
                    <Image source={{ uri: stream.avatar }} style={s.cardImage} />
                ) : (
                    <LinearGradient colors={['#1a0a2e', '#15151f', '#0e0e18']} style={s.cardImage}>
                        <View style={s.placeholderCircle}>
                            <Text style={s.placeholderText}>{initial}</Text>
                        </View>
                    </LinearGradient>
                )}

                {/* Gradient overlay */}
                <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
                    style={s.cardGrad}
                />

                {/* LIVE badge */}
                <LinearGradient
                    colors={['#FF2D55', '#FF6B8A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.liveBadge}
                >
                    <PulsingDot />
                    <Text style={s.liveBadgeText}>LIVE</Text>
                </LinearGradient>

                {/* Viewer count */}
                <View style={s.viewerBadge}>
                    <Ionicons name="eye" size={10} color="rgba(255,255,255,0.7)" />
                    <Text style={s.viewerText}>{formatViewers(stream.viewers_count || 0)}</Text>
                </View>

                {/* Daily earnings */}
                <View style={s.dailyEarningBox}>
                    <Text style={s.dailyEarningLabel}>Today</Text>
                    <View style={s.dailyEarningRow}>
                        <BeanIcon size={11} />
                        <Text style={s.dailyEarningValue}>
                            {(stream.daily_beans_earned || 0).toLocaleString('en-IN')}
                        </Text>
                    </View>
                </View>

                {/* Bottom: profile avatar + name + followers */}
                <View style={s.cardBottom}>
                    <View style={s.bottomRow}>
                        <View style={s.bottomAvatarRing}>
                            {stream.avatar ? (
                                <Image source={{ uri: stream.avatar }} style={s.bottomAvatar} />
                            ) : (
                                <View style={[s.bottomAvatar, s.bottomAvatarPH]}>
                                    <Text style={s.bottomAvatarInitial}>{initial}</Text>
                                </View>
                            )}
                        </View>
                        <View style={s.bottomInfo}>
                            <Text style={s.cardUsername} numberOfLines={1}>{stream.username}</Text>
                            <View style={s.followersRow}>
                                <Ionicons name="people" size={10} color="rgba(255,255,255,0.35)" />
                                <Text style={s.followersText}>{formatViewers(stream.followers_count || stream.viewers_count || 0)} watching</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
};

// ── Go Live Button ──
function GoLiveGlow() {
    const sc = useRef(new Animated.Value(1)).current;
    const op = useRef(new Animated.Value(0.2)).current;
    useEffect(() => {
        Animated.loop(Animated.parallel([
            Animated.sequence([
                Animated.timing(sc, { toValue: 1.4, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(sc, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(op, { toValue: 0, duration: 1600, useNativeDriver: true }),
                Animated.timing(op, { toValue: 0.2, duration: 1600, useNativeDriver: true }),
            ]),
        ])).start();
    }, []);
    return (
        <Animated.View style={{
            position: 'absolute', width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#FF2D55', transform: [{ scale: sc }], opacity: op,
        }} />
    );
}

const LiveStreamGrid: React.FC<Props> = ({
    streams, loading, refreshing, onRefresh, onWatchStream, onStartBroadcast,
}) => {
    const insets = useSafeAreaInsets();
    const bottomNavPadding = Platform.OS === 'android'
        ? (insets.bottom > 0 ? insets.bottom + 26 : 38)
        : (insets.bottom > 0 ? insets.bottom + 18 : 46);
    const TAB_BAR_HEIGHT = 60 + bottomNavPadding;

    return (
        <ScrollView
            style={s.content}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2D55" />
            }
        >
            {loading ? (
                <View style={s.loadWrap}>
                    <ActivityIndicator size="large" color="#FF2D55" />
                    <Text style={s.loadText}>Finding live streams...</Text>
                </View>
            ) : streams.length > 0 ? (
                <View style={s.grid}>
                    {streams.map((stream) => (
                        <LiveStreamCard
                            key={stream.id}
                            stream={stream}
                            onPress={() => onWatchStream(stream.id)}
                        />
                    ))}
                </View>
            ) : (
                <View style={s.emptyWrap}>
                    <View style={s.emptyIconWrap}>
                        <GoLiveGlow />
                        <LinearGradient
                            colors={['rgba(255,45,85,0.15)', 'rgba(255,45,85,0.05)']}
                            style={s.emptyIconCircle}
                        >
                            <Ionicons name="radio-outline" size={36} color="rgba(255,45,85,0.6)" />
                        </LinearGradient>
                    </View>
                    <Text style={s.emptyTitle}>No Live Streams</Text>
                    <Text style={s.emptySub}>Be the first to go live and connect{'\n'}with your audience!</Text>
                    <TouchableOpacity onPress={onStartBroadcast} activeOpacity={0.85}>
                        <LinearGradient
                            colors={['#FF2D55', '#FF6B8A']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={s.goLiveBtn}
                        >
                            <Ionicons name="radio" size={18} color="#FFF" />
                            <Text style={s.goLiveText}>Start Broadcasting</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            )}
            <View style={{ height: TAB_BAR_HEIGHT + 20 }} />
        </ScrollView>
    );
};

const s = StyleSheet.create({
    content: { flex: 1 },

    // Grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, paddingTop: 4 },

    // Card
    card: {
        width: CARD_W, borderRadius: 18, overflow: 'hidden', marginBottom: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
    },
    cardImageWrap: {
        width: '100%', aspectRatio: 0.74, position: 'relative',
        backgroundColor: '#111118', borderRadius: 18, overflow: 'hidden',
    },
    cardImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    cardGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },

    placeholderCircle: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(255,45,85,0.2)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'rgba(255,45,85,0.3)',
    },
    placeholderText: { color: '#FF6B8A', fontSize: 22, fontWeight: '900' },

    // LIVE badge
    liveBadge: {
        position: 'absolute', top: 10, left: 10,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
        shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5, shadowRadius: 6, elevation: 6,
    },
    liveBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },

    // Viewer badge
    viewerBadge: {
        position: 'absolute', top: 10, right: 10,
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    viewerText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },

    dailyEarningBox: {
        position: 'absolute',
        left: 10,
        right: 10,
        top: '42%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,149,0,0.18)',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,149,0,0.35)',
    },
    dailyEarningLabel: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    dailyEarningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dailyEarningValue: {
        color: '#FF9500',
        fontSize: 12,
        fontWeight: '800',
    },

    // Card bottom – profile avatar + name
    cardBottom: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 10, paddingBottom: 10, paddingTop: 8,
    },
    bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bottomAvatarRing: {
        width: 36, height: 36, borderRadius: 18,
        borderWidth: 2, borderColor: '#FF2D55', overflow: 'hidden',
    },
    bottomAvatar: { width: '100%', height: '100%', borderRadius: 18 },
    bottomAvatarPH: {
        backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center',
    },
    bottomAvatarInitial: { color: '#FF6B8A', fontSize: 14, fontWeight: '800' },
    bottomInfo: { flex: 1 },
    cardUsername: { color: '#FFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
    followersRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    followersText: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600' },

    // Loading
    loadWrap: { paddingVertical: 48, alignItems: 'center', gap: 10 },
    loadText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '500' },

    // Empty state
    emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
    emptyIconWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyIconCircle: {
        width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,45,85,0.15)',
    },
    emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
    emptySub: {
        color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '500',
        textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 24,
    },
    goLiveBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 28, paddingVertical: 14, borderRadius: 26,
        shadowColor: '#FF2D55', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
    },
    goLiveText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});

export default LiveStreamGrid;
