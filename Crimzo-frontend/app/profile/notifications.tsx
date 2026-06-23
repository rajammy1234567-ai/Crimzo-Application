import React, { useCallback, useState } from 'react';
import { appAlert } from '../../lib/appAlert';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { apiPost } from '../../lib/apiClient';
import { useNotifications, type AppNotification } from '../../lib/useNotifications';
import { publish } from '../../lib/realtimeSync';

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { notifications, loading, refresh, markAllRead } = useNotifications();
  const [acting, setActing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
      markAllRead();
    }, [refresh, markAllRead]),
  );

  const acceptRequest = async (item: AppNotification) => {
    if (!token || !item.actor_id) return;
    setActing(item.id);
    try {
      const res = await apiPost<{
        followers_count?: number;
        friends_count?: number;
      }>('/api/user/follow/accept', { requesterId: item.actor_id }, token);
      appAlert('Accepted', `${item.actor_username || 'User'} is now following you`);
      publish('notifications_updated');
      publish('follow_updated', {
        followers_count: res.followers_count,
        friends_count: res.friends_count,
      });
      refresh();
    } catch {
      appAlert('Error', 'Could not accept request');
    } finally {
      setActing(null);
    }
  };

  const rejectRequest = async (item: AppNotification) => {
    if (!token || !item.actor_id) return;
    setActing(item.id);
    try {
      await apiPost('/api/user/follow/reject', { requesterId: item.actor_id }, token);
      refresh();
    } catch {
      appAlert('Error', 'Could not reject request');
    } finally {
      setActing(null);
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[s.item, !item.is_read && s.itemUnread]}
      onPress={() => {
        if (item.actor_id) router.push(`/user/${item.actor_id}` as any);
      }}
      activeOpacity={0.7}
    >
      {item.actor_avatar ? (
        <Image source={{ uri: item.actor_avatar }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarPh]}>
          <Ionicons name="person" size={20} color="#999" />
        </View>
      )}
      <View style={s.body}>
        <Text style={s.title}>{item.title}</Text>
        <Text style={s.sub}>{item.body}</Text>
        <Text style={s.time}>{timeAgo(item.created_at)}</Text>
        {item.type === 'follow_request' && item.actor_id ? (
          <View style={s.actions}>
            <TouchableOpacity
              style={s.acceptBtn}
              onPress={() => acceptRequest(item)}
              disabled={acting === item.id}
            >
              <Text style={s.acceptText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.rejectBtn}
              onPress={() => rejectRequest(item)}
              disabled={acting === item.id}
            >
              <Text style={s.rejectText}>Decline</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {item.type === 'follow_accepted' ? (
        <Ionicons name="checkmark-circle" size={22} color="#4CD964" />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && notifications.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color="#FF2D55" size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="notifications-off-outline" size={64} color="#333" />
          <Text style={s.emptyTitle}>No notifications</Text>
          <Text style={s.emptySub}>Follow requests and updates will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemUnread: { backgroundColor: 'rgba(255,45,85,0.06)' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  time: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: {
    backgroundColor: '#FF2D55', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  acceptText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  rejectBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  rejectText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
});