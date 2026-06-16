import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Animated,
    Easing,
    Dimensions,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io from 'socket.io-client';

import { API_URL } from '../lib/apiClient';
const { width: SW } = Dimensions.get('window');
const MAX_VISIBLE = 8;

interface ChatMessage {
    id: string;
    type: 'text' | 'sticker' | 'system';
    userId?: string | number;
    username?: string;
    message?: string;
    emoji?: string;
    stickerName?: string;
    icon_name?: string;
    icon_color?: string;
    bg_color?: string;
    timestamp: number;
}

interface FloatingGift {
    id: string;
    icon_name: string;
    icon_color: string;
    bg_color: string;
    stickerName: string;
    username: string;
    animY: Animated.Value;
    animX: Animated.Value;
    animOpacity: Animated.Value;
    animScale: Animated.Value;
}

interface LiveChatProps {
    sessionId: string | number;
    userId: string | number;
    username: string;
    token: string;
    isHost?: boolean;
    hostUserId?: string | number;
    onStickerPress: () => void;
}

// ── Username Colors ──
const NAME_COLORS = [
    '#00BFFF', '#A78BFA', '#34D399', '#FBBF24',
    '#F472B6', '#60A5FA', '#FB923C', '#22D3EE',
    '#C084FC', '#4ADE80',
];
const HOST_COLOR = '#FFD700';

function getColor(uid?: string | number, isHost?: boolean): string {
    if (isHost) return HOST_COLOR;
    if (!uid) return NAME_COLORS[0];
    const num = typeof uid === 'string' ? parseInt(uid.replace(/\D/g, '').slice(-3) || '0', 10) : uid;
    return NAME_COLORS[num % NAME_COLORS.length];
}

// ── Floating Gift Animation ──
function FloatingGiftView({ gift }: { gift: FloatingGift }) {
    const iconName = (gift.icon_name || 'gift') as keyof typeof Ionicons.glyphMap;
    return (
        <Animated.View style={[floatS.wrap, {
            transform: [{ translateY: gift.animY }, { translateX: gift.animX }, { scale: gift.animScale }],
            opacity: gift.animOpacity,
        }]}>
            <View style={[floatS.pill, { borderColor: gift.bg_color + '40' }]}>
                <View style={[floatS.iconCircle, { backgroundColor: gift.bg_color }]}>
                    <Ionicons name={iconName} size={20} color={gift.icon_color || '#FFF'} />
                </View>
                <View>
                    <Text style={floatS.giftName}>{gift.stickerName}</Text>
                    <Text style={floatS.giftFrom}>from {gift.username}</Text>
                </View>
            </View>
        </Animated.View>
    );
}

const floatS = StyleSheet.create({
    wrap: { position: 'absolute', right: 16, bottom: 200, alignItems: 'flex-end' },
    pill: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 28,
        paddingVertical: 8, paddingLeft: 8, paddingRight: 16,
        borderWidth: 1, shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
    },
    iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    giftName: { color: '#FFD700', fontSize: 13, fontWeight: '800' },
    giftFrom: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '500', marginTop: 1 },
});

// ── Single Chat Message ──
const ChatBubble = React.memo(function ChatBubble({
    item, opacity, isHostMsg,
}: { item: ChatMessage; opacity: number; isHostMsg: boolean }) {
    // System - "joined"
    if (item.type === 'system') {
        return (
            <View style={[msgS.row, { opacity }]}>
                <View style={msgS.systemPill}>
                    <Text style={msgS.systemUser}>{item.username || 'Someone'}</Text>
                    <Text style={msgS.systemAction}> joined</Text>
                    <Text style={msgS.systemDot}> 👋</Text>
                </View>
            </View>
        );
    }

    // Gift / Sticker message - "sent a present"
    if (item.type === 'sticker') {
        const iconName = (item.icon_name || 'gift') as keyof typeof Ionicons.glyphMap;
        const bgColor = item.bg_color || '#FF2D55';
        return (
            <View style={[msgS.row, { opacity }]}>
                <View style={[msgS.giftPill, { borderColor: bgColor + '25' }]}>
                    <View style={[msgS.giftIcon, { backgroundColor: bgColor }]}>
                        <Ionicons name={iconName} size={12} color={item.icon_color || '#FFF'} />
                    </View>
                    <Text style={[msgS.giftUser, { color: bgColor }]}>{item.username || 'User'}</Text>
                    <Text style={msgS.giftAction}> sent a present</Text>
                </View>
            </View>
        );
    }

    // Regular chat - inline "username message"
    const nameColor = getColor(item.userId, isHostMsg);
    return (
        <View style={[msgS.row, { opacity }]}>
            <View style={[msgS.chatPill, isHostMsg && { backgroundColor: 'rgba(255,215,0,0.08)', borderColor: 'rgba(255,215,0,0.12)' }]}>
                <Text style={msgS.chatInner}>
                    <Text style={[msgS.chatName, { color: nameColor }]}>{item.username || 'User'}</Text>
                    {isHostMsg && <Text style={msgS.hostTag}> 👑</Text>}
                    <Text style={msgS.chatText}>  {item.message || ''}</Text>
                </Text>
            </View>
        </View>
    );
});

const msgS = StyleSheet.create({
    row: { paddingHorizontal: 10, marginBottom: 5 },
    // System
    systemPill: {
        flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16,
        paddingHorizontal: 12, paddingVertical: 6,
    },
    systemUser: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
    systemAction: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600' },
    systemDot: { fontSize: 11 },
    // Gift
    giftPill: {
        flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 16,
        paddingHorizontal: 10, paddingVertical: 6, gap: 6,
        borderWidth: 1,
    },
    giftIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    giftUser: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
    giftAction: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
    // Chat
    chatPill: {
        alignSelf: 'flex-start', maxWidth: SW * 0.78,
        backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16,
        paddingHorizontal: 12, paddingVertical: 7,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
    },
    chatInner: { flexDirection: 'row', flexWrap: 'wrap' },
    chatName: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
    hostTag: { fontSize: 11 },
    chatText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '400', lineHeight: 19 },
});

// ═══════════════════════════════════════════════════
// ── Main LiveChat Component ──
// ═══════════════════════════════════════════════════
export default function LiveChat({ sessionId, userId, username, token, isHost = false, hostUserId, onStickerPress }: LiveChatProps) {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState<any>(null);
    const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Keyboard tracking
    useEffect(() => {
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    // Floating gift animation
    const addFloatingGift = useCallback((data: ChatMessage) => {
        const id = `fg_${Date.now()}_${Math.random()}`;
        const animY = new Animated.Value(0);
        const animX = new Animated.Value(0);
        const animOpacity = new Animated.Value(0);
        const animScale = new Animated.Value(0.3);

        const gift: FloatingGift = {
            id,
            icon_name: data.icon_name || 'gift',
            icon_color: data.icon_color || '#FFF',
            bg_color: data.bg_color || '#FF2D55',
            stickerName: data.stickerName || 'Gift',
            username: data.username || 'User',
            animY, animX, animOpacity, animScale,
        };

        setFloatingGifts(prev => [...prev, gift]);

        Animated.parallel([
            Animated.sequence([
                Animated.timing(animOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.delay(2200),
                Animated.timing(animOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
            ]),
            Animated.timing(animY, { toValue: -260, duration: 3000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(animX, { toValue: (Math.random() - 0.5) * 60, duration: 3000, useNativeDriver: true }),
            Animated.sequence([
                Animated.spring(animScale, { toValue: 1.1, tension: 80, friction: 5, useNativeDriver: true }),
                Animated.timing(animScale, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
            ]),
        ]).start(() => {
            setFloatingGifts(prev => prev.filter(g => g.id !== id));
        });
    }, []);

    // Socket connection
    useEffect(() => {
        if (!sessionId || !API_URL || !token) return;
        const s = io(API_URL, { transports: ['websocket'], auth: { token } });
        s.on('connect', () => {
            console.log('[LiveChat] socket connected, joining live');
            s.emit('join_live', { sessionId, userId, username });
        });
        s.on('connect_error', (err) => {
            console.error('[LiveChat] socket connect error:', err.message || err);
        });

        s.on('live_chat_message', (data: ChatMessage) => {
            setMessages(prev => [...prev.slice(-60), data]);
            if (data.type === 'sticker') addFloatingGift(data);
        });

        s.on('live_system_message', (data: any) => {
            setMessages(prev => [...prev.slice(-60), {
                id: `sys_${Date.now()}`, type: 'system',
                message: data.message, username: data.username, timestamp: Date.now(),
            }]);
        });

        setSocket(s);
        return () => { 
            try { s.emit('leave_live', { sessionId }); } catch {}
            s.disconnect(); 
        };
    }, [sessionId, token, userId, username]);

    const sendMessage = useCallback(() => {
        if (!inputText.trim() || !socket) return;
        socket.emit('live_chat_message', { sessionId, userId, username, message: inputText.trim() });
        setInputText('');
    }, [inputText, socket, sessionId, userId, username]);

    // Visible messages with fade
    const visibleMessages = useMemo(() => {
        const total = messages.length;
        if (total <= MAX_VISIBLE) {
            return messages.map((msg, i) => ({ msg, opacity: total <= 3 ? 1 : i < 1 ? 0.25 : i < 2 ? 0.5 : 1 }));
        }
        const slice = messages.slice(total - MAX_VISIBLE);
        return slice.map((msg, i) => ({
            msg,
            opacity: i === 0 ? 0.1 : i === 1 ? 0.2 : i === 2 ? 0.35 : i === 3 ? 0.5 : i === 4 ? 0.7 : i === 5 ? 0.85 : 1,
        }));
    }, [messages]);

    const renderMessage = useCallback(({ item }: { item: { msg: ChatMessage; opacity: number } }) => {
        const isHostMsg = isHost ? (String(item.msg.userId) === String(userId)) : (String(item.msg.userId) === String(hostUserId));
        return <ChatBubble item={item.msg} opacity={item.opacity} isHostMsg={isHostMsg} />;
    }, [userId, isHost, hostUserId]);

    const keyExtractor = useCallback((item: { msg: ChatMessage; opacity: number }) => item.msg.id, []);
    const bottomPad = keyboardVisible ? 0 : Math.max(insets.bottom, 12);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={cs.container}
            keyboardVerticalOffset={0}
        >
            {/* Floating gifts */}
            {floatingGifts.map(g => <FloatingGiftView key={g.id} gift={g} />)}

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={visibleMessages}
                renderItem={renderMessage}
                keyExtractor={keyExtractor}
                style={cs.msgList}
                contentContainerStyle={cs.msgListContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                ListEmptyComponent={
                    <View style={cs.empty}>
                        <Text style={cs.emptyText}>
                            {isHost ? 'Welcome to your stream! 🎬' : 'Say hi to the streamer! 👋'}
                        </Text>
                    </View>
                }
            />

            {/* ── Bottom Input Bar ── */}
            <View style={[cs.inputWrap, { paddingBottom: bottomPad }]}>
                <View style={cs.inputRow}>
                    {/* Comment input */}
                    <View style={cs.inputField}>
                        <TextInput
                            style={cs.textInput}
                            placeholder="Add comment..."
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={sendMessage}
                            returnKeyType="send"
                            maxLength={200}
                        />
                    </View>

                    {/* Send button */}
                    <TouchableOpacity onPress={sendMessage} disabled={!inputText.trim()} activeOpacity={0.7}>
                        <LinearGradient
                            colors={inputText.trim() ? ['#34D399', '#10B981'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)']}
                            style={cs.sendBtn}
                        >
                            <Ionicons name="play" size={18} color={inputText.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} />
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Gift button - only for viewers */}
                    {!isHost && (
                        <TouchableOpacity onPress={onStickerPress} activeOpacity={0.7}>
                            <LinearGradient colors={['#FFD700', '#FF9500']} style={cs.giftBtn}>
                                <Ionicons name="gift" size={20} color="#FFF" />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const cs = StyleSheet.create({
    container: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '55%', zIndex: 10 },
    msgList: { flex: 1, paddingHorizontal: 4 },
    msgListContent: { paddingTop: 8, paddingBottom: 4 },
    empty: { padding: 20, paddingLeft: 14 },
    emptyText: { color: 'rgba(255,255,255,0.25)', fontSize: 13, fontWeight: '500' },

    // Input
    inputWrap: { paddingTop: 6, paddingHorizontal: 10 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inputField: {
        flex: 1, height: 42, backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 24, justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    textInput: { flex: 1, height: 42, paddingHorizontal: 16, color: '#FFF', fontSize: 14 },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    giftBtn: {
        width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#FFD700', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
});
