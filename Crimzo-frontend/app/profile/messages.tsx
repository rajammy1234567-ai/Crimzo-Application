import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  StatusBar,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiGet, apiPost, ApiError } from '../../lib/apiClient';
import { useVideoCall } from '../../contexts/VideoCallContext';

type Message = {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  sender_username: string;
  sender_avatar: string | null;
  is_read: boolean;
  created_at: string;
  message_type?: 'text' | 'gift';
  gift_diamonds?: number;
};

const GIFT_PRESETS = [10, 50, 100, 500, 1000];

type Conversation = {
  user_id: number;
  username: string;
  avatar: string | null;
  last_message: string;
  last_time: string;
  unread_count: number;
  is_online: boolean;
};

export default function MessagesScreen() {
  const { user, token, updateUser } = useAuth();
  const { startCall } = useVideoCall();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [gifting, setGifting] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<{ success?: boolean; conversations?: Conversation[] }>(
        '/api/messages/conversations',
        token,
      );
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.error('Fetch conversations error:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, []);

  const openChat = async (conv: Conversation) => {
    setSelectedChat(conv);
    setChatLoading(true);
    try {
      const data = await apiGet<{ success?: boolean; messages?: Message[] }>(
        `/api/messages/${conv.user_id}`,
        token,
      );
      if (data.success) {
        setChatMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Fetch messages error:', e);
    } finally {
      setChatLoading(false);
    }
  };

  const sendGift = async (diamonds: number) => {
    if (!selectedChat || gifting) return;
    const myDiamonds = user?.diamonds ?? 0;
    if (myDiamonds < diamonds) {
      Alert.alert('Not Enough Diamonds', `You have ${myDiamonds} diamonds. Buy more from Wallet tab.`);
      return;
    }
    setGifting(true);
    try {
      const data = await apiPost<{
        success?: boolean;
        message?: Message;
        senderDiamonds?: number;
      }>('/api/messages/gift', {
        receiverId: selectedChat.user_id,
        diamonds,
      }, token);
      if (data.success && data.message) {
        setChatMessages(prev => [...prev, data.message!]);
        if (data.senderDiamonds != null) {
          updateUser({ diamonds: data.senderDiamonds });
        }
        setShowGift(false);
      }
    } catch (e: unknown) {
      Alert.alert('Gift Failed', e instanceof ApiError ? e.message : 'Could not send gift');
    } finally {
      setGifting(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || sending) return;
    setSending(true);
    const msgText = newMessage.trim();
    setNewMessage('');

    // Optimistic update
    const optimistic: Message = {
      id: Date.now(),
      sender_id: Number(user?.id || 0),
      receiver_id: selectedChat.user_id,
      content: msgText,
      sender_username: user?.username || '',
      sender_avatar: user?.avatar || null,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, optimistic]);

    try {
      const data = await apiPost<{ success?: boolean; message?: Message }>(
        '/api/messages/send',
        {
          receiverId: selectedChat.user_id,
          content: msgText,
        },
        token,
      );
      if (data.success && data.message) {
        const serverMsg = data.message;
        setChatMessages(prev =>
          prev.map(m => (m.id === optimistic.id ? serverMsg : m))
        );
      }
    } catch (e) {
      console.error('Send message error:', e);
    } finally {
      setSending(false);
    }
  };

  const getTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString();
  };

  // ── Chat Detail View ──
  if (selectedChat) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedChat(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{selectedChat.username}</Text>
            {selectedChat.is_online && (
              <Text style={styles.onlineText}>Online</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => startCall(selectedChat.user_id, selectedChat.username, selectedChat.avatar)}
            style={styles.giftHeaderBtn}
          >
            <Ionicons name="videocam" size={22} color="#4CD964" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowGift(true)} style={styles.giftHeaderBtn}>
            <Ionicons name="diamond" size={22} color="#FFD700" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          {chatLoading ? (
            <View style={styles.centerFull}>
              <ActivityIndicator size="large" color="#FF2D55" />
            </View>
          ) : chatMessages.length === 0 ? (
            <View style={styles.centerFull}>
              <Ionicons name="chatbubble-ellipses-outline" size={60} color="#333" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Say hi!</Text>
            </View>
          ) : (
            <FlatList
              data={chatMessages}
              keyExtractor={(item, index) => item?.id ? item.id.toString() : index.toString()}
              contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isMe = item.sender_id === user?.id;
                return (
                  <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {!isMe && (
                      item.sender_avatar ? (
                        <Image source={{ uri: item.sender_avatar }} style={styles.msgAvatar} />
                      ) : (
                        <View style={[styles.msgAvatar, styles.msgAvatarPlaceholder]}>
                          <Ionicons name="person" size={14} color="#999" />
                        </View>
                      )
                    )}
                    <View style={[
                      styles.msgBubble,
                      isMe ? styles.myBubble : styles.theirBubble,
                      item.message_type === 'gift' && styles.giftBubble,
                    ]}>
                      {item.message_type === 'gift' && (
                        <View style={styles.giftTag}>
                          <Ionicons name="diamond" size={14} color="#FFD700" />
                          <Text style={styles.giftTagText}>{item.gift_diamonds?.toLocaleString()} 💎</Text>
                        </View>
                      )}
                      <Text style={[styles.msgText, isMe && { color: '#FFF' }]}>{item.content}</Text>
                      <Text style={[styles.msgTime, isMe && { color: 'rgba(255,255,255,0.5)' }]}>
                        {getTimeAgo(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Input */}
          <View style={[styles.inputBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 34 }]}>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor="#666"
              maxLength={500}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!newMessage.trim() || sending}
              style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]}
            >
              <Ionicons
                name="send"
                size={20}
                color={newMessage.trim() ? '#FFF' : '#555'}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        <Modal visible={showGift} transparent animationType="slide" onRequestClose={() => setShowGift(false)}>
          <TouchableOpacity style={styles.giftOverlay} activeOpacity={1} onPress={() => setShowGift(false)}>
            <View style={styles.giftSheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.giftTitle}>Send Diamonds 🎁</Text>
              <Text style={styles.giftSub}>
                {selectedChat.username} ko diamonds transfer honge{'\n'}
                Your balance: {(user?.diamonds ?? 0).toLocaleString()} 💎
              </Text>
              <View style={styles.giftGrid}>
                {GIFT_PRESETS.map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={styles.giftBtn}
                    onPress={() => sendGift(amt)}
                    disabled={gifting || (user?.diamonds ?? 0) < amt}
                  >
                    <Ionicons name="diamond" size={16} color="#FFD700" />
                    <Text style={styles.giftBtnText}>{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {gifting && <ActivityIndicator color="#FF2D55" style={{ marginTop: 12 }} />}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // ── Conversations List ──
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color="#FF2D55" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.centerFull}>
          <Ionicons name="chatbubbles-outline" size={70} color="#222" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>
            Follow streamers and start chatting!
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item, index) => item?.user_id ? item.user_id.toString() : index.toString()}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convItem}
              onPress={() => openChat(item)}
              activeOpacity={0.6}
            >
              <View style={styles.convAvatarWrap}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.convAvatar} />
                ) : (
                  <View style={[styles.convAvatar, styles.convAvatarPlaceholder]}>
                    <Ionicons name="person" size={22} color="#999" />
                  </View>
                )}
                {item.is_online && (
                  <View style={styles.convOnline}>
                    <View style={styles.convOnlineDot} />
                  </View>
                )}
              </View>
              <View style={styles.convInfo}>
                <View style={styles.convTop}>
                  <Text style={styles.convName}>{item.username}</Text>
                  <Text style={styles.convTime}>{getTimeAgo(item.last_time)}</Text>
                </View>
                <View style={styles.convBottom}>
                  <Text style={styles.convMsg} numberOfLines={1}>{item.last_message}</Text>
                  {item.unread_count > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread_count}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* System Messages */}
      <View style={styles.systemSection}>
        <TouchableOpacity style={styles.systemItem}>
          <View style={[styles.systemIcon, { backgroundColor: 'rgba(255,45,85,0.15)' }]}>
            <Ionicons name="megaphone" size={20} color="#FF2D55" />
          </View>
          <View style={styles.systemInfo}>
            <Text style={styles.systemName}>Crimzo Team</Text>
            <Text style={styles.systemMsg}>Welcome to Crimzo! 🎉</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerCenter: {
    alignItems: 'center',
  },
  onlineText: {
    color: '#4CD964',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  centerFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },

  /* Conversation list */
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  convAvatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  convAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  convAvatarPlaceholder: {
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  convOnline: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  convOnlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CD964',
  },
  convInfo: {
    flex: 1,
  },
  convTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  convName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  convTime: {
    color: '#666',
    fontSize: 12,
  },
  convBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convMsg: {
    color: '#888',
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  unreadBadge: {
    backgroundColor: '#FF2D55',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },

  /* System messages */
  systemSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 30, // Can be overlaid by insets globally via container
  },
  systemItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  systemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  systemInfo: {
    flex: 1,
  },
  systemName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  systemMsg: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },

  /* Chat */
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    gap: 8,
  },
  msgRowMe: {
    flexDirection: 'row-reverse',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  msgAvatarPlaceholder: {
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  myBubble: {
    backgroundColor: '#FF2D55',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: '#1C1C1E',
    borderBottomLeftRadius: 4,
  },
  msgText: {
    color: '#EEE',
    fontSize: 15,
    lineHeight: 20,
  },
  msgTime: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    // paddingBottom is added dynamically inline!
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#FF2D55',
  },
  giftHeaderBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  giftBubble: { borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)' },
  giftTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  giftTagText: { color: '#FFD700', fontSize: 13, fontWeight: '800' },
  giftOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  giftSheet: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  giftTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  giftSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginVertical: 16, lineHeight: 18 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  giftBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  giftBtnText: { color: '#FFD700', fontSize: 16, fontWeight: '800' },
});
