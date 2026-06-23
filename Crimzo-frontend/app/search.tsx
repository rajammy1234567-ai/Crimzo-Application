import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, resolveMediaUrl } from '../lib/apiClient';
import { parseFollowResponse } from '../lib/followHelpers';

type SearchUser = {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string;
  crimzo_id?: string;
  followers_count?: number;
  is_online?: boolean;
  is_following?: boolean;
  is_requested?: boolean;
};

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!token || !q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await apiGet<{ users?: SearchUser[] }>(
        `/api/user/search?q=${encodeURIComponent(q.trim())}`,
        token,
      );
      setResults(data.users || []);
    } catch (e) {
      console.error('Search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const toggleFollow = async (userId: string, index: number) => {
    if (!token) return;
    try {
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
      }>('/api/user/follow', { userId }, token);
      const { isFollowing, isRequested } = parseFollowResponse(res);
      setResults((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          is_following: isFollowing,
          is_requested: isRequested,
        };
        return next;
      });
    } catch (e) {
      console.error('Follow error:', e);
    }
  };

  const openProfile = (userId: string) => {
    if (String(userId) === String(user?.id)) {
      router.replace('/(tabs)/profile');
      return;
    }
    router.push(`/user/${userId}` as any);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search users..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#FF2D55" />
        </View>
      ) : !searched || !query.trim() ? (
        <View style={s.center}>
          <Ionicons name="search-outline" size={56} color="rgba(255,255,255,0.12)" />
          <Text style={s.hintTitle}>Search Crimzo</Text>
          <Text style={s.hintSub}>Find people by username or ID</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="person-outline" size={48} color="rgba(255,255,255,0.15)" />
          <Text style={s.hintSub}>No users found for "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.75}
              onPress={() => openProfile(item.id)}
            >
              {item.avatar ? (
                <Image
                  source={{ uri: resolveMediaUrl(item.avatar) }}
                  style={s.avatar}
                />
              ) : (
                <View style={[s.avatar, s.avatarPH]}>
                  <Text style={s.avatarLetter}>
                    {(item.username || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={s.info}>
                <View style={s.nameRow}>
                  <Text style={s.username}>{item.username}</Text>
                  {item.is_online && <View style={s.onlineDot} />}
                </View>
                {item.crimzo_id ? (
                  <Text style={s.sub}>@{item.crimzo_id}</Text>
                ) : null}
                {item.bio ? (
                  <Text style={s.bio} numberOfLines={1}>{item.bio}</Text>
                ) : (
                  <Text style={s.sub}>
                    {item.followers_count || 0} followers
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[s.followBtn, (item.is_following || item.is_requested) && s.followingBtn]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  toggleFollow(item.id, index);
                }}
              >
                <Text style={[s.followText, (item.is_following || item.is_requested) && s.followingText]}>
                  {item.is_following ? 'Following' : item.is_requested ? 'Requested' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  hintTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 8 },
  hintSub: { color: '#888', fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPH: {
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158' },
  sub: { color: '#888', fontSize: 13, marginTop: 2 },
  bio: { color: '#AAA', fontSize: 13, marginTop: 2 },
  followBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  followText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  followingText: { color: '#CCC' },
});