import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Socket } from 'socket.io-client';

import { playMessageReceivePop, playMessageSendPop } from '../lib/uiSounds';
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
  visible: boolean;
  talkSessionId: string;
  sessionId: string;
  userId: string | number;
  username: string;
  peerUserId: string | number;
  peerUsername: string;
  isHost?: boolean;
  sharedSocket?: Socket | null;
  onClose: () => void;
  onEnd?: () => void;
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
  return [...prev.slice(-200), data];
}

export default function PrivateTalkChat({
  visible,
  talkSessionId,
  sessionId,
  userId,
  username,
  peerUserId,
  peerUsername,
  isHost = false,
  sharedSocket,
  onClose,
  onEnd,
}: PrivateTalkChatProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const joinedRef = useRef(false);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
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
      scrollToEnd();
    };

    const onMessage = (data: ChatMessage) => {
      setMessages((prev) => appendMessage(prev, data));
      if (data.type === 'text' && String(data.userId) !== String(userId)) {
        playMessageReceivePop();
      }
      scrollToEnd();
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
  }, [sharedSocket, talkSessionId, sessionId, peerUsername, joinPrivateRoom, onEnd, scrollToEnd]);

  useEffect(() => {
    if (visible) scrollToEnd();
  }, [visible, scrollToEnd]);

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
    playMessageSendPop();
    socket.emit('private_talk_message', {
      talkSessionId,
      sessionId,
      userId,
      username,
      message: text,
    });
    setInputText('');
    scrollToEnd();
  }, [inputText, socket, talkSessionId, sessionId, userId, username, scrollToEnd]);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#0a0814" />
      <SafeAreaView style={ps.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={ps.flex}
          behavior={KEYBOARD_BEHAVIOR}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={ps.header}>
            <TouchableOpacity onPress={onClose} style={ps.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-down" size={22} color="#E9D5FF" />
            </TouchableOpacity>
            <View style={ps.headerCenter}>
              <View style={ps.headerTitleRow}>
                <Ionicons name="lock-closed" size={14} color="#A78BFA" />
                <Text style={ps.headerTitle}>@{peerUsername}</Text>
              </View>
              <Text style={ps.headerSub}>
                {isHost ? 'Private chat · only you & this viewer' : 'Private chat · only you & host'}
              </Text>
            </View>
            <View style={ps.closeBtn} />
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={ps.list}
            contentContainerStyle={[
              ps.listContent,
              messages.length === 0 && ps.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              <View style={ps.emptyWrap}>
                <Ionicons name="lock-closed" size={36} color="rgba(167,139,250,0.35)" />
                <Text style={ps.emptyTitle}>Private 1-on-1 room</Text>
                <Text style={ps.empty}>Messages here are invisible to other viewers.</Text>
              </View>
            }
          />

          <View style={[ps.inputWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
                  multiline={false}
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
      </SafeAreaView>
    </Modal>
  );
}

const ps = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0814',
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.15)',
    backgroundColor: 'rgba(15,12,28,0.98)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: '#E9D5FF', fontSize: 16, fontWeight: '800' },
  headerSub: { color: 'rgba(167,139,250,0.65)', fontSize: 11, marginTop: 3, textAlign: 'center' },
  list: { flex: 1 },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingHorizontal: 24, gap: 8 },
  emptyTitle: { color: 'rgba(233,213,255,0.9)', fontSize: 16, fontWeight: '800', marginTop: 4 },
  empty: { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  systemRow: { alignItems: 'center', marginBottom: 12 },
  systemText: { color: 'rgba(167,139,250,0.8)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  msgRow: { marginBottom: 10, alignItems: 'flex-start' },
  msgRowSelf: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: SW * 0.78,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleSelf: {
    backgroundColor: 'rgba(139,92,246,0.22)',
    borderColor: 'rgba(167,139,250,0.35)',
  },
  bubblePeer: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  name: { color: 'rgba(167,139,250,0.9)', fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { color: 'rgba(255,255,255,0.92)', fontSize: 15, lineHeight: 21 },
  inputWrap: {
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,139,250,0.12)',
    backgroundColor: 'rgba(15,12,28,0.98)',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputField: {
    flex: 1,
    minHeight: 44,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    justifyContent: 'center',
  },
  textInput: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#FFF',
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});