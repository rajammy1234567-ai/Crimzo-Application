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
    Dimensions,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io, { type Socket } from 'socket.io-client';

import { API_URL } from '../lib/apiClient';
import { publishGiftSplash } from '../lib/giftSplash';
import { playMessageReceivePop, playMessageSendPop } from '../lib/uiSounds';
import { KEYBOARD_BEHAVIOR } from './KeyboardAware';
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
    gift_diamonds?: number;
    timestamp: number;
}

interface LiveChatProps {
    sessionId: string | number;
    userId: string | number;
    username: string;
    token: string;
    isHost?: boolean;
    hostUserId?: string | number;
    canChat?: boolean;
    talkRatePerMin?: number;
    sharedSocket?: Socket | null;
    onStickerPress: () => void;
}

function normalizeSessionId(sessionId: string | number): string {
    return String(sessionId);
}

function appendChatMessage(prev: ChatMessage[], data: ChatMessage): ChatMessage[] {
    if (data.id && prev.some((m) => m.id === data.id)) return prev;
    if (data.type === 'text' && data.message) {
        const dupIdx = prev.findIndex((m) =>
            m.id.startsWith('local_')
            && String(m.userId) === String(data.userId)
            && m.message === data.message
            && Math.abs(m.timestamp - (data.timestamp || Date.now())) < 5000,
        );
        if (dupIdx >= 0) {
            const next = [...prev];
            next[dupIdx] = data;
            return next;
        }
    }
    return [...prev.slice(-60), data];
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

function triggerGiftSplash(data: ChatMessage, fromSelf: boolean) {
    publishGiftSplash({
        id: String(data.id),
        username: data.username || 'User',
        stickerName: data.stickerName || 'Gift',
        icon_name: data.icon_name,
        icon_color: data.icon_color,
        bg_color: data.bg_color,
        gift_diamonds: data.gift_diamonds,
        emoji: data.emoji,
        variant: fromSelf ? 'sent' : 'received',
    });
}

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
                        {item.emoji ? (
                            <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                        ) : (
                            <Ionicons name={iconName} size={16} color={item.icon_color || '#FFF'} />
                        )}
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
    giftIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
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
export default function LiveChat({
    sessionId, userId, username, token, isHost = false, hostUserId,
    canChat = true, talkRatePerMin = 1, sharedSocket, onStickerPress,
}: LiveChatProps) {
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState<any>(null);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Keyboard tracking
    useEffect(() => {
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { show.remove(); hide.remove(); };
    }, []);

    const joinLiveRoom = useCallback((s: Socket) => {
        s.emit('join_live', {
            sessionId: normalizeSessionId(sessionId),
            userId,
            username,
        });
    }, [sessionId, userId, username]);

    // Socket connection (reuse parent socket when provided — keeps room in sync)
    useEffect(() => {
        if (!sessionId || !token) return;

        const attachListeners = (s: Socket) => {
            const onChat = (data: ChatMessage) => {
                setMessages((prev) => appendChatMessage(prev, data));
                const fromSelf = String(data.userId) === String(userId);
                if (!fromSelf && data.type === 'text') {
                    playMessageReceivePop();
                }
                if (data.type === 'sticker') {
                    if (!fromSelf) triggerGiftSplash(data, false);
                }
            };
            const onSystem = (data: { message?: string; username?: string }) => {
                setMessages((prev) => appendChatMessage(prev, {
                    id: `sys_${Date.now()}`,
                    type: 'system',
                    message: data.message,
                    username: data.username,
                    timestamp: Date.now(),
                }));
            };
            const onError = (data?: { code?: string; message?: string }) => {
                if (data?.message) {
                    setMessages((prev) => appendChatMessage(prev, {
                        id: `err_${Date.now()}`,
                        type: 'system',
                        message: data.message,
                        username: 'System',
                        timestamp: Date.now(),
                    }));
                }
            };

            s.on('live_chat_message', onChat);
            s.on('live_system_message', onSystem);
            s.on('live_chat_error', onError);

            return () => {
                s.off('live_chat_message', onChat);
                s.off('live_system_message', onSystem);
                s.off('live_chat_error', onError);
            };
        };

        if (sharedSocket) {
            setSocket(sharedSocket);
            const detach = attachListeners(sharedSocket);
            const onConnect = () => joinLiveRoom(sharedSocket);
            if (sharedSocket.connected) onConnect();
            sharedSocket.on('connect', onConnect);
            return () => {
                sharedSocket.off('connect', onConnect);
                detach();
            };
        }

        if (!API_URL) return;
        const s = io(API_URL, { transports: ['websocket'], auth: { token } });
        const detach = attachListeners(s);
        s.on('connect', () => {
            console.log('[LiveChat] socket connected, joining live');
            joinLiveRoom(s);
        });
        s.on('connect_error', (err) => {
            console.error('[LiveChat] socket connect error:', err.message || err);
        });

        setSocket(s);
        return () => {
            detach();
            try { s.emit('leave_live', { sessionId: normalizeSessionId(sessionId) }); } catch {}
            s.disconnect();
        };
    }, [sessionId, token, sharedSocket, joinLiveRoom]);

    const sendMessage = useCallback(() => {
        const text = inputText.trim();
        if (!text || !socket || (!isHost && !canChat)) return;
        const optimisticId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const optimistic: ChatMessage = {
            id: optimisticId,
            type: 'text',
            userId,
            username,
            message: text,
            timestamp: Date.now(),
        };
        setMessages((prev) => appendChatMessage(prev, optimistic));
        playMessageSendPop();
        socket.emit('live_chat_message', {
            sessionId: normalizeSessionId(sessionId),
            userId,
            username,
            message: text,
        });
        setInputText('');
    }, [inputText, socket, sessionId, userId, username, isHost, canChat]);

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
            behavior={KEYBOARD_BEHAVIOR}
            style={cs.container}
            keyboardVerticalOffset={0}
        >
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
                            {isHost ? 'Welcome to your stream! 🎬' : 'Say hi in the chat! 👋'}
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
                            style={[cs.textInput, !isHost && !canChat && cs.textInputDisabled]}
                            placeholder={isHost || canChat ? 'Add comment...' : 'Login to comment'}
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={sendMessage}
                            returnKeyType="send"
                            maxLength={200}
                            editable={isHost || canChat}
                        />
                    </View>

                    {/* Send button */}
                    <TouchableOpacity onPress={sendMessage} disabled={!inputText.trim() || (!isHost && !canChat)} activeOpacity={0.7}>
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
    textInputDisabled: { opacity: 0.45 },
    sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    giftBtn: {
        width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#FFD700', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
});
