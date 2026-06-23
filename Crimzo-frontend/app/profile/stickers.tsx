import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiGet } from '../../lib/apiClient';
import { BEAN_COLOR } from '../../lib/currencyIcons';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 60) / 3;

interface CollectedSticker {
    id: number;
    name: string;
    emoji: string;
    icon_name: string;
    icon_color: string;
    bg_color: string;
    category: string;
    price: number;
    is_animated: boolean;
    receive_count: number;
    total_beans: number;
}

export default function CollectedStickersScreen() {
    const { user, token } = useAuth();
    const router = useRouter();
    const [stickers, setStickers] = useState<CollectedSticker[]>([]);
    const [totalGifts, setTotalGifts] = useState(0);
    const [totalBeans, setTotalBeans] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCollected();
    }, []);

    const fetchCollected = async () => {
        if (!token) {
            setLoading(false);
            return;
        }
        try {
            const res = await apiGet<{
                success?: boolean;
                stickers?: CollectedSticker[];
                totalGifts?: number;
                totalBeans?: number;
            }>('/api/stickers/collected', token);
            if (res.success) {
                setStickers(res.stickers || []);
                setTotalGifts(res.totalGifts || 0);
                setTotalBeans(res.totalBeans || 0);
            }
        } catch (error) {
            console.error('Fetch collected stickers error:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderSticker = ({ item }: { item: CollectedSticker }) => {
        const iconName = (item.icon_name || 'gift') as keyof typeof Ionicons.glyphMap;
        return (
            <View style={styles.stickerCard}>
                <View style={[styles.stickerIconWrap, { backgroundColor: item.bg_color || '#FF2D55' }]}>
                    <Ionicons name={iconName} size={28} color={item.icon_color || '#FFF'} />
                </View>
                <Text style={styles.stickerName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.countBadge}>
                    <Text style={styles.countText}>×{item.receive_count}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={28} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Collected Stickers</Text>
                <View style={{ width: 28 }} />
            </View>

            {/* Stats */}
            {!loading && stickers.length > 0 && (
                <View style={styles.statsRow}>
                    <LinearGradient colors={['rgba(255,45,85,0.15)', 'rgba(255,45,85,0.05)']} style={styles.statCard}>
                        <Ionicons name="gift" size={20} color="#FF2D55" />
                        <Text style={styles.statValue}>{totalGifts}</Text>
                        <Text style={styles.statLabel}>Total Gifts</Text>
                    </LinearGradient>
                    <LinearGradient colors={['rgba(255,215,0,0.15)', 'rgba(255,215,0,0.05)']} style={styles.statCard}>
                        <Ionicons name="cafe" size={20} color={BEAN_COLOR} />
                        <Text style={styles.statValue}>{totalBeans}</Text>
                        <Text style={styles.statLabel}>Total Beans</Text>
                    </LinearGradient>
                    <LinearGradient colors={['rgba(48,209,88,0.15)', 'rgba(48,209,88,0.05)']} style={styles.statCard}>
                        <Ionicons name="sparkles" size={20} color="#30D158" />
                        <Text style={styles.statValue}>{stickers.length}</Text>
                        <Text style={styles.statLabel}>Unique</Text>
                    </LinearGradient>
                </View>
            )}

            {/* Content */}
            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#FF2D55" />
                </View>
            ) : stickers.length === 0 ? (
                <View style={styles.emptyWrap}>
                    <View style={styles.emptyIconBox}>
                        <Ionicons name="star-outline" size={60} color="rgba(255,45,85,0.8)" />
                    </View>
                    <Text style={styles.emptyTitle}>No Stickers Yet</Text>
                    <Text style={styles.emptySubtext}>
                        You haven't received any stickers from live streams. Start streaming and collect them!
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={stickers}
                    renderItem={renderSticker}
                    keyExtractor={(item) => String(item.id)}
                    numColumns={3}
                    contentContainerStyle={styles.gridContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 20,
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: '800',
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 10,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 4,
    },
    statValue: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '900',
    },
    statLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontWeight: '600',
    },
    loadingWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    stickerCard: {
        width: CARD_SIZE,
        alignItems: 'center',
        marginBottom: 20,
        marginHorizontal: 4,
    },
    stickerIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowColor: '#FF2D55',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    stickerName: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
        maxWidth: CARD_SIZE - 8,
    },
    countBadge: {
        marginTop: 4,
        backgroundColor: 'rgba(255,45,85,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    countText: {
        color: '#FF2D55',
        fontSize: 12,
        fontWeight: '800',
    },
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyIconBox: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,45,85,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 12,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 20,
    }
});
