import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PulsingLiveDot from './PulsingLiveDot';

interface LiveUser {
    session_id: number;
    user_id: number;
    username: string;
    avatar: string | null;
    viewers_count: number;
}

interface Props {
    liveUsers: LiveUser[];
    onWatchStream: (sessionId: number) => void;
}

const LiveUsersRow: React.FC<Props> = ({ liveUsers, onWatchStream }) => {
    if (liveUsers.length === 0) return null;

    return (
        <View>
            <View style={s.header}>
                <View style={s.headerDot} />
                <Text style={s.headerText}>Live Now</Text>
                <View style={s.countPill}>
                    <Text style={s.countText}>{liveUsers.length}</Text>
                </View>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.row}
            >
                {liveUsers.map((u) => (
                    <TouchableOpacity
                        key={u.session_id}
                        style={s.item}
                        onPress={() => onWatchStream(u.session_id)}
                        activeOpacity={0.7}
                    >
                        <View style={s.ringWrap}>
                            <LinearGradient
                                colors={['#FF2D55', '#FF416C', '#FF4B2B']}
                                style={s.ring}
                            >
                                <View style={s.avatarInner}>
                                    {u.avatar ? (
                                        <Image source={{ uri: u.avatar }} style={s.avatar} />
                                    ) : (
                                        <View style={[s.avatar, s.avatarPH]}>
                                            <Ionicons name="person" size={24} color="#999" />
                                        </View>
                                    )}
                                </View>
                            </LinearGradient>
                            <PulsingLiveDot />
                        </View>
                        {/* LIVE tag */}
                        <View style={s.liveTag}>
                            <Text style={s.liveText}>LIVE</Text>
                        </View>
                        <Text style={s.name} numberOfLines={1}>{u.username}</Text>
                        <View style={s.viewerRow}>
                            <Ionicons name="eye" size={9} color="rgba(255,255,255,0.35)" />
                            <Text style={s.viewerCount}>{u.viewers_count || 0}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const LIVE_SIZE = 66;
const LIVE_AVATAR = 58;

const s = StyleSheet.create({
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4, gap: 5,
        borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    headerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
    headerText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
    countPill: {
        backgroundColor: 'rgba(255,45,85,0.15)', paddingHorizontal: 7, paddingVertical: 1.5,
        borderRadius: 8,
    },
    countText: { color: '#FF2D55', fontSize: 10, fontWeight: '700' },
    row: { paddingHorizontal: 8, paddingBottom: 4, gap: 2 },
    item: { alignItems: 'center', width: 68 },
    ringWrap: { position: 'relative' },
    ring: {
        width: LIVE_SIZE, height: LIVE_SIZE, borderRadius: LIVE_SIZE / 2,
        alignItems: 'center', justifyContent: 'center', padding: 2,
    },
    avatarInner: {
        width: LIVE_AVATAR, height: LIVE_AVATAR, borderRadius: LIVE_AVATAR / 2, overflow: 'hidden',
        backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#000',
    },
    avatar: { width: LIVE_AVATAR - 4, height: LIVE_AVATAR - 4, borderRadius: (LIVE_AVATAR - 4) / 2 },
    avatarPH: { backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
    liveTag: {
        backgroundColor: '#FF2D55', paddingHorizontal: 5, paddingVertical: 1,
        borderRadius: 3, marginTop: 1, borderWidth: 1.5, borderColor: '#000',
    },
    liveText: { color: '#FFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
    name: { color: '#F5F5F5', fontSize: 10, fontWeight: '500', marginTop: 1 },
    viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
    viewerCount: { color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '600' },
});

export default LiveUsersRow;
