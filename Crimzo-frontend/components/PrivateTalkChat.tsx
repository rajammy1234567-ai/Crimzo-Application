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
  Keyboard,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Socket } from 'socket.io-client';

import { KEYBOARD_BEHAVIOR } from './KeyboardAware';

const { width: SW } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  type: 'text' | 'system';
  userId?: string | number;
  username?: string;
  message?: string;
  timestamp: number;
}

interface PrivateTalkChatProps {
  talkSessionId: string;
  sessionId: string;
  userId: string | number;
  username: string;
  peerUserId: string | number;
  peerUsername: string;
  isHost?: boolean;
  sharedSocket?: Socket | null;
  onEnd?: () => void;
  bottomOffset?: number;
}

function appendMessage(prev: ChatMessage[], data: ChatMessage): ChatMessage[] {
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
  return [...prev.slice(-80), data];
}

export default function PrivateTalkChat({
  talkSessionId,
  sessionId,
  userId,
  username,
  peerUserId,
  peerUsername,
  isHost = false,
  sharedSocket,
  onEnd,
  bottomOffset = 0,
}: PrivateTalkChatProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const joinPrivateRoom = useCallback((s: Socket) => {
    if (!talkSessionId || joinedRef.current) return;
    s.emit('join_talk_private', { talkSessionId, sessionId });
    joinedRef.current = true;
  }, [talkSessionId, sessionId]);

  useEffect(() => {
    if (!sharedSocket || !talkSessionId) return;

    const onJoined = () => {
      setMessages((prev) => appendMessage(prev, {
        id: `sys_join_${talkSessionId}`,
        type: 'system',
        message: `Private room opened — only you and @${peerUsername} can see this chat.`,
        timestamp: Date.now(),
      }));
    };

    const onMessage = (data: ChatMessage) => {
      setMessages((prev) => appendMessage(prev, data));
    };

    const onError = (data?: { message?: string }) => {
      if (data?.message) {
        setMessages((prev) => appendMessage(prev, {
          id: `err_${Date.now()}`,
          type: 'system',
          message: data.message,
          timestamp: Date.now(),
        }));
      }
    };

    const onEnded = () => {
      setMessages((prev) => appendMessage(prev, {
        id: `end_${Date.now()}`,
        type: 'system',
        message: 'Private chat ended.',
        timestamp: Date.now(),
      }));
      onEnd?.();
    };

    sharedSocket.on('talk_private_joined', onJoined);
    sharedSocket.on('private_talk_message', onMessage);
    sharedSocket.on('private_talk_error', onError);
    sharedSocket.on('talk_private_ended', onEnded);

    setSocket(sharedSocket);
    if (sharedSocket.connected) joinPrivateRoom(sharedSocket);
    const onConnect = () => joinPrivateRoom(sharedSocket);
    sharedSocket.on('connect', onConnect);

    return () => {
      sharedSocket.off('talk_private_joined', onJoined);
      sharedSocket.off('private_talk_message', onMessage);
      sharedSocket.off('private_talk_error', onError);
      sharedSocket.off('talk_private_ended', onEnded);
      sharedSocket.off('connect', onConnect);
      try {
        sharedSocket.emit('leave_talk_private', { talkSessionId });
      } catch { /* ignore */ }
      joinedRef.current = false;
    };
  }, [sharedSocket, talkSessionId, sessionId, peerUsername, joinPrivateRoom, onEnd]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socket) return;
    const optimisticId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      type: 'text',
      userId,
      username,
      message: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => appendMessage(prev, optimistic));
    socket.emit('private_talk_message', {
      talkSessionId,
      sessionId,
      userId,
      username,
      message: text,
    });
    setInputText('');
  }, [inputText, socket, talkSessionId, sessionId, userId, username]);

  const visibleMessages = useMemo(() => messages.slice(-12), [messages]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    if (item.type === 'system') {
      return (
        <View style={ps.systemRow}>
          <Text style={ps.systemText}>{item.message}</Text>
        </View>
      );
    }
    const isSelf = String(item.userId) === String(userId);
    const isPeer = String(item.userId) === String(peerUserId);
    return (
      <View style={[ps.msgRow, isSelf && ps.msgRowSelf]}>
        <View style={[ps.bubble, isSelf ? ps.bubbleSelf : ps.bubblePeer]}>
          <Text style={ps.name}>{isSelf ? 'You' : (isPeer ? peerUsername : item.username || 'User')}</Text>
          <Text style={ps.text}>{item.message}</Text>
        </View>
      </View>
    );
  }, [userId, peerUserId, peerUsername]);

  const bottomPad = keyboardVisible ? 0 : Math.max(insets.bottom, 8);

  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_BEHAVIOR}
      style={[ps.container, bottomOffset > 0 && { bottom: bottomOffset }]}
      keyboardVerticalOffset={0}
    >
      <View style={ps.header}>
        <View style={ps.headerLeft}>
          <Ionicons name="lock-closed" size={14} color="#A78BFA" />
          <Text style={ps.headerTitle}>Private with @{peerUsername}</Text>
        </View>
        <Text style={ps.headerSub}>{isHost ? 'Only you & this viewer' : 'Only you & host'}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={visibleMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={ps.list}
        contentContainerStyle={ps.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={ps.empty}>Private 1-on-1 chat — invisible to other viewers.</Text>
        }
      />

      <View style={[ps.inputWrap, { paddingBottom: bottomPad }]}>
        <View style={ps.inputRow}>
          <View style={ps.inputField}>
            <TextInput
              style={ps.textInput}
              placeholder={`Message @${peerUsername}...`}
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              maxLength={200}
            />
          </View>
          <TouchableOpacity onPress={sendMessage} disabled={!inputText.trim()} activeOpacity={0.7}>
            <LinearGradient
              colors={inputText.trim() ? ['#8B5CF6', '#6D28D9'] : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)']}
              style={ps.sendBtn}
            >
              <Ionicons name="send" size={16} color={inputText.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const ps = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '48%',
    zIndex: 15,
    backgroundColor: 'rgba(10,8,20,0.92)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.12)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: '#E9D5FF', fontSize: 13, fontWeight: '800' },
  headerSub: { color: 'rgba(167,139,250,0.65)', fontSize: 10, marginTop: 2, marginLeft: 20 },
  list: { flex: 1, maxHeight: 180 },
  listContent: { paddingVertical: 8, paddingHorizontal: 10 },
  empty: { color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 12 },
  systemRow: { alignItems: 'center', marginBottom: 8 },
  systemText: { color: 'rgba(167,139,250,0.8)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
  msgRow: { marginBottom: 6, alignItems: 'flex-start' },
  msgRowSelf: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: SW * 0.72,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleSelf: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: 'rgba(167,139,250,0.3)',
  },
  bubblePeer: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  name: { color: 'rgba(167,139,250,0.9)', fontSize: 10, fontWeight: '800', marginBottom: 2 },
  text: { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18 },
  inputWrap: { paddingTop: 6, paddingHorizontal: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputField: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
    justifyContent: 'center',
  },
  textInput: { flex: 1, height: 40, paddingHorizontal: 14, color: '#FFF', fontSize: 14 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});