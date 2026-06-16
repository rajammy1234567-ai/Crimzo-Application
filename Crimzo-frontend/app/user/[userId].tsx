import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  StatusBar,
  Alert,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet, apiPost, resolveMediaUrl } from '../../lib/apiClient';
import FollowListModal, { FollowUser } from '../../components/profile/FollowListModal';
import { subscribe } from '../../lib/realtimeSync';

function formatNumber(n?: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: me, token } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const [listVisible, setListVisible] = useState(false);
  const [listType, setListType] = useState<'followers' | 'following'>('followers');
  const [listData, setListData] = useState<FollowUser[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const [profileRes, reelsRes] = await Promise.all([
        apiGet<{ profile?: any }>(`/api/user/profile/full?userId=${userId}`, token),
        apiGet<{ reels?: any[] }>(`/api/reels/user/${userId}`, token),
      ]);
      if (profileRes.profile) setProfile(profileRes.profile);
      setReels(
        (reelsRes.reels || []).map((r) => ({
          ...r,
          video_url: resolveMediaUrl(r.video_url),
          thumbnail_url: r.thumbnail_url ? resolveMediaUrl(r.thumbnail_url) : null,
        })),
      );
    } catch (e) {
      console.error('User profile error:', e);
      Alert.alert('Error', 'Could not load profile');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, userId, router]);

  useEffect(() => {
    return subscribe('reel_deleted', (reelId) => {
      if (typeof reelId !== 'string') return;
      setReels((prev) => prev.filter((r) => r.id !== reelId));
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (String(userId) === String(me?.id)) {
        router.replace('/(tabs)/profile');
        return;
      }
      fetchProfile();
    }, [fetchProfile, userId, me?.id, router]),
  );

  const toggleFollow = async () => {
    if (!token || !userId || followLoading) return;
    setFollowLoading(true);
    try {
      const res = await apiPost<{ action?: string }>('/api/user/follow', { userId }, token);
      const followed = res.action === 'followed';
      setProfile((p: any) => ({
        ...p,
        isFollowing: followed,
        followers_count: Math.max(
          0,
          (p?.followers_count || 0) + (followed ? 1 : -1),
        ),
      }));
    } catch (e) {
      console.error('Follow error:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const openFollowList = async (type: 'followers' | 'following') => {
    if (!token || !userId) return;
    setListType(type);
    setListVisible(true);
    setListLoading(true);
    try {
      const data = await apiGet<Record<string, FollowUser[]>>(
        `/api/user/${type}/${userId}`,
        token,
      );
      setListData(data[type] || []);
    } catch (e) {
      console.error('Follow list error:', e);
      setListData([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleFollowFromList = async (targetId: string, index: number) => {
    if (!token) return;
    try {
      const res = await apiPost<{ action?: string }>('/api/user/follow', { userId: targetId }, token);
      setListData((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], is_following: res.action === 'followed' };
        return next;
      });
      if (String(targetId) === String(userId)) {
        fetchProfile();
      }
    } catch (e) {
      console.error('Follow from list error:', e);
    }
  };

  const openUserProfile = (id: string) => {
    setListVisible(false);
    if (String(id) === String(me?.id)) {
      router.push('/(tabs)/profile');
      return;
    }
    if (String(id) === String(userId)) return;
    router.push(`/user/${id}` as any);
  };

  if (loading || !profile) {
    return (
      <View style={[s.container, s.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FF2D55" />
      </View>
    );
  }

  const initial = (profile.username || 'U').charAt(0).toUpperCase();

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingTop: insets.top }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.topTitle}>{profile.username}</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={s.avatarSection}>
          {profile.avatar ? (
            <Image
              source={{ uri: resolveMediaUrl(profile.avatar) }}
              style={s.avatar}
            />
          ) : (
            <LinearGradient colors={['#FF2D55', '#9333EA']} style={s.avatar}>
              <Text style={s.avatarText}>{initial}</Text>
            </LinearGradient>
          )}
          {profile.isLive && (
            <View style={s.liveBadge}>
              <Text style={s.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <Text style={s.username}>{profile.username}</Text>
        {profile.crimzo_id ? (
          <Text style={s.crimzoId}>ID: {profile.crimzo_id}</Text>
        ) : null}
        {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{reels.length}</Text>
            <Text style={s.statLabel}>Posts</Text>
          </View>
          <TouchableOpacity style={s.stat} onPress={() => openFollowList('followers')}>
            <Text style={s.statNum}>{formatNumber(profile.followers_count)}</Text>
            <Text style={s.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.stat} onPress={() => openFollowList('following')}>
            <Text style={s.statNum}>{formatNumber(profile.following_count)}</Text>
            <Text style={s.statLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.followMainBtn, profile.isFollowing && s.followingMainBtn]}
            onPress={toggleFollow}
            disabled={followLoading}
          >
            {followLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={[s.followMainText, profile.isFollowing && s.followingMainText]}>
                {profile.isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.messageBtn}
            onPress={() => router.push('/profile/messages' as any)}
          >
            <Text style={s.messageText}>Message</Text>
          </TouchableOpacity>
        </View>

        {profile.isLive && profile.liveSessionId && (
          <TouchableOpacity
            style={s.watchLiveBtn}
            onPress={() => router.push(`/live/watch?sessionId=${profile.liveSessionId}` as any)}
          >
            <Ionicons name="radio" size={16} color="#FFF" />
            <Text style={s.watchLiveText}>Watch Live</Text>
          </TouchableOpacity>
        )}

        <View style={s.gridHeader}>
          <Ionicons name="grid-outline" size={22} color="#FFF" />
        </View>

        {reels.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="camera-outline" size={40} color="#333" />
            <Text style={s.emptyText}>No posts yet</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {reels.map((reel) => (
              <View key={reel.id} style={s.thumb}>
                {reel.thumbnail_url ? (
                  <Image source={{ uri: reel.thumbnail_url }} style={s.thumbImg} />
                ) : (
                  <View style={[s.thumbImg, s.thumbPH]}>
                    <Ionicons name="play" size={20} color="#666" />
                  </View>
                )}
                <View style={s.thumbOverlay}>
                  <Ionicons name="heart" size={11} color="#FFF" />
                  <Text style={s.thumbLikes}>{formatNumber(reel.likes_count)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <FollowListModal
        visible={listVisible}
        type={listType}
        data={listData}
        loading={listLoading}
        currentUserId={me?.id}
        onClose={() => setListVisible(false)}
        onToggleFollow={handleFollowFromList}
        onOpenProfile={openUserProfile}
      />
    </View>
  );
}

const SW = Dimensions.get('window').width;
const THUMB = (SW - 4) / 3;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  avatarSection: { alignItems: 'center', marginTop: 8, marginBottom: 12 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarText: { color: '#FFF', fontSize: 36, fontWeight: '800' },
  liveBadge: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#FF2D55',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  liveText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  username: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  crimzoId: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 4 },
  bio: {
    color: '#CCC',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 20,
    marginBottom: 16,
  },
  stat: { alignItems: 'center' },
  statNum: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  followMainBtn: {
    flex: 1,
    backgroundColor: '#FF2D55',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  followingMainBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  followMainText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  followingMainText: { color: '#CCC' },
  messageBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  messageText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  watchLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(255,45,85,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.4)',
    paddingVertical: 10,
    borderRadius: 10,
  },
  watchLiveText: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },
  gridHeader: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    paddingVertical: 10,
  },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { color: '#666', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: THUMB, height: THUMB * 1.35, padding: 1, position: 'relative' },
  thumbImg: { width: '100%', height: '100%', backgroundColor: '#111' },
  thumbPH: { alignItems: 'center', justifyContent: 'center' },
  thumbOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  thumbLikes: { color: '#FFF', fontSize: 11, fontWeight: '700' },
});