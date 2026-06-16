import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet, apiPost } from '../../lib/apiClient';

type BlockedUser = { id: string; username: string; avatar: string | null };

export default function BlacklistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [list, setList] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGet<{ blocked?: BlockedUser[] }>('/api/user/blocked', token);
      setList(data.blocked || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unblock = (user: BlockedUser) => {
    Alert.alert('Unblock', `Unblock ${user.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await apiPost('/api/user/unblock', { userId: user.id }, token);
            setList((prev) => prev.filter((u) => u.id !== user.id));
          } catch {
            Alert.alert('Error', 'Could not unblock user');
          }
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={s.title}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#FF2D55" />
      ) : list.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="ban-outline" size={56} color="#CCC" />
          <Text style={s.emptyText}>No blocked users</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <View style={s.row}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarPh]}>
                  <Ionicons name="person" size={18} color="#999" />
                </View>
              )}
              <Text style={s.name}>{item.username}</Text>
              <TouchableOpacity style={s.unblockBtn} onPress={() => unblock(item)}>
                <Text style={s.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFF',
    borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#999', marginTop: 12, fontSize: 15 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 10,
    padding: 14, borderRadius: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPh: { backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,45,85,0.1)',
  },
  unblockText: { color: '#FF2D55', fontSize: 13, fontWeight: '700' },
});