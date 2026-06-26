import React, { useState, useEffect, useRef } from 'react';
import { appAlert } from '../lib/appAlert';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, ActivityIndicator, ScrollView, Animated, Easing, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';

import { useRouter } from 'expo-router';
import { API_URL } from '../lib/apiClient';
import { subscribe, publish } from '../lib/realtimeSync';
import { publishStickerGiftSplash, formatDiamondPrice } from '../lib/giftSplash';
import { useAuth } from '../contexts/AuthContext';

const { width: SW } = Dimensions.get('window');

interface Sticker {
    id: string | number;
    name: string;
    emoji: string;
    icon_name?: string;
    icon_color?: string;
    bg_color?: string;
    category: string;
    price: number;
    is_animated: boolean;
    owned: boolean;
}

interface StickerPanelProps {
    visible: boolean;
    onClose: () => void;
    onSendSticker?: (sticker: Sticker) => void;
    token: string;
    receiverId?: number | string;
    receiverUsername?: string;
    sessionId?: number | string;
    talkSessionId?: string;
    channelName?: string;
}

const CATEGORIES = [
    { key: 'all', label: 'All', icon: 'sparkles', color: '#FFD700' },
    { key: 'love', label: 'Love', icon: 'heart', color: '#FF2D55' },
    { key: 'fun', label: 'Fun', icon: 'flash', color: '#FF9500' },
    { key: 'party', label: 'Party', icon: 'bonfire', color: '#AF52DE' },
    { key: 'vip', label: 'VIP', icon: 'diamond', color: '#00BFFF' },
];

// ── Animated Sticker Icon ──
function StickerIcon({ sticker, size = 56 }: { sticker: Sticker; size?: number }) {
    const pulse = useRef(new Animated.Value(1)).current;
    const glow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (sticker.is_animated) {
            Animated.loop(Animated.sequence([
                Animated.timing(pulse, { toValue: 1.1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])).start();
            Animated.loop(Animated.sequence([
                Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
                Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
            ])).start();
        }
    }, [sticker.is_animated]);

    const rawIcon = sticker.icon_name || 'gift';
    const iconName = (rawIcon in Ionicons.glyphMap ? rawIcon : 'gift') as keyof typeof Ionicons.glyphMap;
    const bg = sticker.bg_color || '#FF2D55';
    const ic = sticker.icon_color || '#FFF';

    return (
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={{ width: size + 12, height: size + 12, alignItems: 'center', justifyContent: 'center' }}>
                {sticker.is_animated && (
                    <Animated.View style={{
                        position: 'absolute', width: size + 20, height: size + 20,
                        borderRadius: (size + 20) / 2, backgroundColor: bg,
                        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.25] }),
                    }} />
                )}
                <View style={{
                    width: size + 4, height: size + 4, borderRadius: (size + 4) / 2,
                    backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
                    shadowColor: bg, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
                }}>
                    <Ionicons name={iconName} size={size * 0.5} color={ic} />
                </View>
                {sticker.category === 'vip' && (
                    <View style={{
                        position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderRadius: 8,
                        backgroundColor: '#0D0D14', alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1.5, borderColor: '#FFD700',
                    }}>
                        <Ionicons name="star" size={8} color="#FFD700" />
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

export default function StickerPanel({
    visible,
    onClose,
    onSendSticker,
    token,
    receiverId,
    receiverUsername,
    sessionId,
    talkSessionId,
    channelName,
}: StickerPanelProps) {
    const router = useRouter();
    const { updateUser, user } = useAuth();

    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [diamonds, setDiamonds] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState<string | number | null>(null);
    const [confirmSticker, setConfirmSticker] = useState<Sticker | null>(null);
    const slideAnim = useRef(new Animated.Value(400)).current;

    useEffect(() => {
        if (visible) {
            fetchStickers();
            Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
        } else {
            slideAnim.setValue(400);
        }
    }, [visible]);

    useEffect(() => {
        return subscribe('stickers_updated', () => {
            if (visible) fetchStickers();
        });
    }, [visible, token]);

    const fetchStickers = async () => {
        try {
            setLoading(true);
            const r = await axios.get(`${API_URL}/api/stickers/catalog`, { headers: { Authorization: `Bearer ${token}` } });
            setStickers(r.data.stickers);
            setDiamonds(r.data.diamonds);
        } catch (e) {
            console.error('Failed to fetch stickers:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleStickerPress = (sticker: Sticker) => setConfirmSticker(sticker);

    const sendInFlightRef = useRef(false);

    const confirmSend = async () => {
        if (!confirmSticker || sendInFlightRef.current) return;
        const sticker = confirmSticker;
        setConfirmSticker(null);
        if (diamonds < sticker.price) {
            appAlert(
                'Not Enough Diamonds',
                `You need ${sticker.price} diamonds but only have ${diamonds}. Buy diamonds from Wallet to send gifts.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go to Wallet', onPress: () => { onClose(); router.push('/profile/wallet'); } },
                ],
            );
            return;
        }
        if (!receiverId) {
            appAlert('Gift Failed', 'Could not find gift receiver. Please try again.');
            return;
        }
        try {
            sendInFlightRef.current = true;
            setSending(sticker.id);
            const stickerId = sticker.id != null ? String(sticker.id) : '';
            if (!stickerId) {
                appAlert('Error', 'Invalid gift. Please refresh and try again.');
                return;
            }
            const r = await axios.post(
                `${API_URL}/api/stickers/send`,
                {
                    stickerId,
                    receiverId: String(receiverId),
                    sessionId: sessionId != null ? String(sessionId) : undefined,
                    talkSessionId: talkSessionId || undefined,
                    channelName: channelName || undefined,
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (typeof r.data?.remainingDiamonds === 'number') {
                setDiamonds(r.data.remainingDiamonds);
                updateUser({ diamonds: r.data.remainingDiamonds });
            }
            if (talkSessionId && user?.id) {
                publish('private_talk_sticker_sent', {
                    talkSessionId,
                    userId: String(user.id),
                    username: user.username || 'User',
                    sticker,
                });
            }
            publishStickerGiftSplash(sticker, receiverUsername || 'Friend', {
                variant: 'sent',
                id: `send_${sticker.id}_${Date.now()}`,
            });
            onSendSticker?.(sticker);
            onClose();
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } };
            appAlert('Gift Failed', err.response?.data?.error || 'Failed to send gift');
        } finally {
            sendInFlightRef.current = false;
            setSending(null);
        }
    };

    const filtered = selectedCategory === 'all' ? stickers : stickers.filter(s => s.category === selectedCategory);

    const renderSticker = ({ item }: { item: Sticker }) => (
        <TouchableOpacity style={st.card} onPress={() => handleStickerPress(item)} disabled={sending === item.id} activeOpacity={0.7}>
            {sending === item.id ? (
                <ActivityIndicator size="small" color="#FFD700" />
            ) : (
                <>
                    <StickerIcon sticker={item} size={52} />
                    <Text style={st.cardName} numberOfLines={1}>{item.name}</Text>
                    <View style={st.pricePill}>
                        <Ionicons name="diamond" size={10} color="#00BFFF" />
                        <Text style={st.priceText}>{formatDiamondPrice(item.price)}</Text>
                    </View>
                </>
            )}
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={onClose} />

            <Animated.View style={[st.panel, { transform: [{ translateY: slideAnim }] }]}>
                {/* Handle */}
                <View style={st.handleWrap}>
                    <View style={st.handle} />
                </View>

                {/* Header */}
                <View style={st.header}>
                    <View style={st.headerLeft}>
                        <Ionicons name="gift" size={22} color="#FFD700" />
                        <Text style={st.headerTitle}>Send Gift</Text>
                    </View>
                    <View style={st.headerRight}>
                        <View style={st.balancePill}>
                            <Ionicons name="diamond" size={13} color="#00BFFF" />
                            <Text style={st.balanceVal}>{diamonds}</Text>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => { onClose(); router.push('/profile/wallet'); }}
                            >
                                <LinearGradient colors={['#FFD700', '#FFA500']} style={st.addBtn}>
                                    <Ionicons name="add" size={14} color="#0D0D14" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                            <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.35)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Category tabs */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.catScroll} contentContainerStyle={st.catContent}>
                    {CATEGORIES.map(cat => {
                        const active = selectedCategory === cat.key;
                        return (
                            <TouchableOpacity key={cat.key} onPress={() => setSelectedCategory(cat.key)} activeOpacity={0.7}>
                                {active ? (
                                    <LinearGradient colors={[cat.color + '20', cat.color + '08']} style={[st.catTab, { borderColor: cat.color + '50' }]}>
                                        <Ionicons name={cat.icon as any} size={14} color={cat.color} />
                                        <Text style={[st.catLabel, { color: cat.color }]}>{cat.label}</Text>
                                    </LinearGradient>
                                ) : (
                                    <View style={st.catTab}>
                                        <Ionicons name={cat.icon as any} size={14} color="rgba(255,255,255,0.3)" />
                                        <Text style={st.catLabel}>{cat.label}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Grid */}
                {loading ? (
                    <View style={st.loadWrap}>
                        <ActivityIndicator size="large" color="#FFD700" />
                        <Text style={st.loadText}>Loading gifts...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filtered}
                        renderItem={renderSticker}
                        keyExtractor={(item, index) => item?.id ? item.id.toString() : index.toString()}
                        numColumns={3}
                        contentContainerStyle={st.gridContent}
                        columnWrapperStyle={st.gridRow}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={st.emptyWrap}>
                                <Ionicons name={'gift-outline' as any} size={40} color="rgba(255,255,255,0.1)" />
                                <Text style={st.emptyText}>No gifts in this category</Text>
                            </View>
                        }
                    />
                )}
            </Animated.View>

            {/* ── Confirmation Modal ── */}
            <Modal visible={!!confirmSticker} transparent animationType="fade" onRequestClose={() => setConfirmSticker(null)}>
                <View style={st.confirmOverlay}>
                    <View style={st.confirmCard}>
                        {confirmSticker && (
                            <>
                                <StickerIcon sticker={confirmSticker} size={80} />
                                <Text style={st.confirmTitle}>Send {confirmSticker.name}?</Text>

                                <View style={st.confirmCostRow}>
                                    <Ionicons name="diamond" size={16} color="#00BFFF" />
                                    <Text style={st.confirmCostVal}>{confirmSticker.price}</Text>
                                    <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.2)" />
                                    <Text style={st.confirmCostLabel}>will be deducted</Text>
                                </View>

                                <Text style={st.confirmBalance}>Balance: {diamonds} diamonds</Text>

                                <View style={st.confirmBtns}>
                                    <TouchableOpacity style={st.cancelBtn} onPress={() => setConfirmSticker(null)} activeOpacity={0.7}>
                                        <Text style={st.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={confirmSend} disabled={diamonds < (confirmSticker?.price || 0)} activeOpacity={0.8} style={{ flex: 1 }}>
                                        <LinearGradient
                                            colors={diamonds >= (confirmSticker?.price || 0) ? ['#FF2D55', '#FF6B8A'] : ['#3A3A3E', '#3A3A3E']}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={st.sendConfirmBtn}
                                        >
                                            <Ionicons name="send" size={16} color="#FFF" />
                                            <Text style={st.sendConfirmText}>Send</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const st = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    panel: {
        height: '68%', backgroundColor: '#0D0D14',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        overflow: 'hidden',
    },
    handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    balancePill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(0,191,255,0.08)', paddingLeft: 10, paddingRight: 4, paddingVertical: 4,
        borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,191,255,0.15)',
    },
    balanceVal: { color: '#00BFFF', fontSize: 14, fontWeight: '800' },
    addBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

    // Category tabs
    catScroll: { maxHeight: 48, marginBottom: 4 },
    catContent: { paddingHorizontal: 16, gap: 8 },
    catTab: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1.5, borderColor: 'transparent',
    },
    catLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },

    // Grid
    loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },
    gridContent: { paddingHorizontal: 10, paddingBottom: 40, paddingTop: 8 },
    gridRow: { justifyContent: 'space-evenly', marginBottom: 8 },
    card: {
        width: '30%', aspectRatio: 0.78, backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 22, alignItems: 'center', justifyContent: 'center', padding: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    cardName: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 6 },
    pricePill: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: 'rgba(0,191,255,0.08)', paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,191,255,0.12)',
    },
    priceText: { color: '#00BFFF', fontSize: 10, fontWeight: '800' },
    emptyWrap: { padding: 48, alignItems: 'center', gap: 12 },
    emptyText: { color: 'rgba(255,255,255,0.25)', fontSize: 14 },

    // Confirmation
    confirmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
    confirmCard: {
        backgroundColor: 'rgba(20,20,28,0.97)', borderRadius: 24, padding: 28,
        alignItems: 'center', width: '82%', maxWidth: 340,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.6, shadowRadius: 32, elevation: 20,
    },
    confirmTitle: { color: '#FFF', fontSize: 19, fontWeight: '700', marginTop: 14, marginBottom: 16 },
    confirmCostRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%',
        backgroundColor: 'rgba(0,191,255,0.06)', paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(0,191,255,0.1)',
    },
    confirmCostVal: { color: '#00BFFF', fontSize: 18, fontWeight: '800' },
    confirmCostLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
    confirmBalance: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 22 },
    confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
    cancelBtn: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', paddingVertical: 14,
        borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    cancelText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
    sendConfirmBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    sendConfirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
