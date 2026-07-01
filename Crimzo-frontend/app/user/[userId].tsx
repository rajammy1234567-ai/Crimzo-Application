import React, { useState, useCallback, useEffect } from 'react';
import { appAlert } from '../../lib/appAlert';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, StatusBar, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';

import { apiGet, apiPost, resolveMediaUrl } from '../../lib/apiClient';
import FollowListModal, { FollowUser } from '../../components/profile/FollowListModal';
import ReelProfileGrid from '../../components/profile/ReelProfileGrid';
import { subscribe, publish } from '../../lib/realtimeSync';
import { parseFollowResponse } from '../../lib/followHelpers';
import LevelBadge from '../../components/levels/LevelBadge';

function formatNumber(n?: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type FollowListResponse = Record<string, FollowUser[]> & { canViewList?: boolean };

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
  const [listType, setListType] = useState<'followers' | 'following' | 'friends'>('followers');
  const [listData, setListData] = useState<FollowUser[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const profileRes = await apiGet<{ profile?: any }>(
        `/api/user/profile/full?userId=${userId}`,
        token,
      );
      if (profileRes.profile) setProfile(profileRes.profile);

      const canView = profileRes.profile?.canViewContent !== false;
      if (canView) {
        const reelsRes = await apiGet<{ reels?: any[]; canViewContent?: boolean }>(
          `/api/reels/user/${userId}`,
          token,
        );
        setReels(
          (reelsRes.reels || []).map((r) => ({
            ...r,
            video_url: resolveMediaUrl(r.video_url),
            thumbnail_url: r.thumbnail_url ? resolveMediaUrl(r.thumbnail_url) : null,
          })),
        );
      } else {
        setReels([]);
      }
    } catch (e) {
      console.error('User profile error:', e);
      appAlert('Error', 'Could not load profile');
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

  useEffect(() => {
    return subscribe('follow_status_changed', (payload) => {
      const data = payload as { userId?: string; isFollowing?: boolean; isRequested?: boolean };
      if (!data?.userId || String(data.userId) !== String(userId)) return;
      setProfile((p: any) => {
        if (!p) return p;
        const isFollowing = data.isFollowing ?? p.isFollowing;
        const isRequested = data.isRequested ?? p.isRequested;
        const followsYou = !!p?.followsYou;
        const isMutualFriend = isFollowing && followsYou;
        const canInteract = isFollowing || followsYou;
        const canViewContent = p?.is_private
          ? isFollowing || isMutualFriend
          : true;
        return {
          ...p,
          isFollowing,
          isRequested,
          isMutualFriend,
          canInteract,
          canViewContent,
          interactionBlockedReason: canInteract
            ? null
            : isRequested
              ? 'Wait until they accept your follow request.'
              : 'Follow each other to unlock messaging.',
        };
      });
      if (data.isFollowing) fetchProfile();
    });
  }, [userId, fetchProfile]);

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
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
        followers_count?: number;
        following_count?: number;
        friends_count?: number;
      }>('/api/user/follow', { userId }, token);
      const { isFollowing, isRequested } = parseFollowResponse(res);
      setProfile((p: any) => {
        const followsYou = !!p?.followsYou;
        const isMutualFriend = isFollowing && followsYou;
        const canInteract = isFollowing || followsYou;
        const canViewContent = p?.is_private ? isFollowing || isMutualFriend : true;
        return {
          ...p,
          isFollowing,
          isRequested,
          isMutualFriend,
          canInteract,
          canViewContent,
          interactionBlockedReason: canInteract
            ? null
            : isRequested
              ? 'Wait until they accept your follow request.'
              : 'Follow each other to unlock messaging.',
          followers_count: res.followers_count ?? (
            res.action === 'unfollowed'
              ? Math.max(0, (p?.followers_count || 0) - 1)
              : res.action === 'followed'
                ? (p?.followers_count || 0) + 1
                : p?.followers_count
          ),
          friends_count: res.friends_count ?? p?.friends_count,
        };
      });
      if (res.following_count != null || res.friends_count != null) {
        publish('follow_updated', {
          following_count: res.following_count,
          friends_count: res.friends_count,
        });
      }
      if (res.action === 'followed' || res.action === 'unfollowed') {
        fetchProfile();
      }
    } catch (e) {
      console.error('Follow error:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const acceptIncoming = async () => {
    if (!token || !userId || followLoading) return;
    setFollowLoading(true);
    try {
      const res = await apiPost<{
        followers_count?: number;
        friends_count?: number;
      }>('/api/user/follow/accept', { requesterId: userId }, token);
      setProfile((p: any) => ({
        ...p,
        hasIncomingRequest: false,
        followsYou: true,
        isMutualFriend: !!p?.isFollowing,
        canInteract: true,
        canViewContent: true,
        interactionBlockedReason: null,
        followers_count: res.followers_count ?? (p?.followers_count || 0) + 1,
        friends_count: res.friends_count ?? p?.friends_count,
      }));
      publish('follow_updated', {
        followers_count: res.followers_count,
        friends_count: res.friends_count,
      });
      fetchProfile();
      appAlert('Accepted', `${profile?.username} is now following you`);
    } catch (e) {
      appAlert('Error', 'Could not accept request');
    } finally {
      setFollowLoading(false);
    }
  };

  const rejectIncoming = async () => {
    if (!token || !userId || followLoading) return;
    setFollowLoading(true);
    try {
      await apiPost('/api/user/follow/reject', { requesterId: userId }, token);
      setProfile((p: any) => ({ ...p, hasIncomingRequest: false }));
    } catch (e) {
      appAlert('Error', 'Could not decline request');
    } finally {
      setFollowLoading(false);
    }
  };

  const openFollowList = async (type: 'followers' | 'following' | 'friends') => {
    if (!token || !userId) return;
    if (profile?.is_private && !profile?.canViewContent) {
      appAlert(
        'Private Account',
        'Follow this account to see their followers, following, and posts.',
      );
      return;
    }
    setListType(type);
    setListVisible(true);
    setListLoading(true);
    try {
      const data = await apiGet<FollowListResponse>(
        `/api/user/${type}/${userId}`,
        token,
      );
      if (data.canViewList === false) {
        setListVisible(false);
        appAlert('Private Account', 'Follow this account to see this list.');
        return;
      }
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
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
      }>('/api/user/follow', { userId: targetId }, token);
      const { isFollowing, isRequested } = parseFollowResponse(res);

      if (listType === 'following' && res.action === 'unfollowed') {
        setListData((prev) => prev.filter((_, i) => i !== index));
      } else {
        setListData((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            is_following: isFollowing,
            is_requested: isRequested,
          };
          return next;
        });
      }
      if (String(targetId) === String(userId)) {
        fetchProfile();
      }
    } catch (e) {
      console.error('Follow from list error:', e);
    }
  };

  const guardInteraction = () => {
    if (profile?.canInteract) return true;
    appAlert(
      'Follow Required',
      profile?.interactionBlockedReason
        || 'Follow this user and wait until they accept your follow request.',
    );
    return false;
  };

  const handleMessage = () => {
    if (!guardInteraction()) return;
    router.push(`/profile/messages?userId=${profile.id}&username=${encodeURIComponent(profile.username || '')}` as any);
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
  const postsCount = profile.canViewContent
    ? reels.length
    : (profile.posts_count ?? 0);

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

        <View style={s.usernameRow}>
          <Text style={s.username}>{profile.username}</Text>
          {profile.is_private ? (
            <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.55)" />
          ) : null}
        </View>
        {profile.level_name ? (
          <View style={s.levelBadgeWrap}>
            <LevelBadge
              levelNumber={profile.equipped_level || profile.user_level || 1}
              name={profile.level_name}
              badgeColor={profile.level_badge_color || '#6B7280'}
              compact
            />
          </View>
        ) : null}
        {profile.crimzo_id ? (
          <Text style={s.crimzoId}>ID: {profile.crimzo_id}</Text>
        ) : null}
        {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}

        {profile.isMutualFriend ? (
          <View style={s.friendsPill}>
            <Ionicons name="people" size={14} color="#4CD964" />
            <Text style={s.friendsPillText}>Friends · posts unlocked</Text>
          </View>
        ) : null}

        {profile.is_private && !profile.canViewContent ? (
          <View style={s.privateBanner}>
            <Ionicons name="lock-closed-outline" size={28} color="#FFF" />
            <Text style={s.privateTitle}>This account is private</Text>
            <Text style={s.privateSub}>
              {profile.isRequested
                ? 'Your follow request is pending. Posts unlock when they accept.'
                : 'Follow this account to see their photos and videos.'}
            </Text>
          </View>
        ) : null}

        {!profile.canInteract && !(profile.is_private && !profile.canViewContent) && (
          <Text style={s.interactionHint}>
            {profile.isRequested
              ? 'Follow request sent — messages unlock when they accept.'
              : 'Follow each other to unlock messaging.'}
          </Text>
        )}

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{postsCount}</Text>
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
          <TouchableOpacity style={s.stat} onPress={() => openFollowList('friends')}>
            <Text style={s.statNum}>{formatNumber(profile.friends_count)}</Text>
            <Text style={s.statLabel}>Friends</Text>
          </TouchableOpacity>
        </View>

        <View style={s.actionRow}>
          {profile.hasIncomingRequest ? (
            <>
              <TouchableOpacity style={s.followMainBtn} onPress={acceptIncoming} disabled={followLoading}>
                <Text style={s.followMainText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.followMainBtn, s.followingMainBtn]} onPress={rejectIncoming} disabled={followLoading}>
                <Text style={[s.followMainText, s.followingMainText]}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[
                s.followMainBtn,
                (profile.isFollowing || profile.isRequested) && s.followingMainBtn,
              ]}
              onPress={toggleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={[s.followMainText, (profile.isFollowing || profile.isRequested) && s.followingMainText]}>
                  {profile.isFollowing ? 'Following' : profile.isRequested ? 'Requested' : 'Follow'}
                </Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.messageBtn, !profile.canInteract && s.actionDisabled]}
            onPress={handleMessage}
          >
            <Text style={[s.messageText, !profile.canInteract && s.actionDisabledText]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.moreBtn}
            onPress={() => {
              appAlert(profile.username, undefined, [
                {
                  text: 'Block User',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiPost('/api/user/block', { userId: profile.id }, token);
                      appAlert('Blocked', `${profile.username} has been blocked`);
                      router.back();
                    } catch {
                      appAlert('Error', 'Could not block user');
                    }
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#999" />
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

        <ReelProfileGrid
          reels={reels}
          token={token}
          canView={profile.canViewContent !== false}
          lockedMessage={
            profile.is_private
              ? profile.isRequested
                ? 'Follow request pending — posts unlock when they accept'
                : 'Follow this private account to see posts'
              : profile.isRequested
                ? 'Posts unlock when they accept your follow request'
                : profile.followsYou && !profile.isFollowing
                  ? 'Follow back to see their posts'
                  : 'Follow each other to see posts and play reels'
          }
          emptyMessage="No posts yet"
        />
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
        onMessage={(id, username) => {
          setListVisible(false);
          router.push(`/profile/messages?userId=${id}&username=${encodeURIComponent(username)}` as any);
        }}
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
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  username: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  levelBadgeWrap: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  privateBanner: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 6,
  },
  privateTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  privateSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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
  interactionHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 28,
    marginTop: 10,
    lineHeight: 17,
  },
  friendsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(76,217,100,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76,217,100,0.25)',
  },
  friendsPillText: { color: '#4CD964', fontSize: 12, fontWeight: '700' },
  actionDisabled: { opacity: 0.45 },
  actionDisabledText: { color: '#888' },
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
  moreBtn: {
    width: 36,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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