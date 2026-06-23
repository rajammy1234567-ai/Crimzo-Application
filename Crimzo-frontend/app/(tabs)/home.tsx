import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../../lib/theme';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTabFocus } from '../../lib/useTabFocus';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet, ApiError, apiDelete, apiUpload } from '../../lib/apiClient';

const TRANSIENT_HTTP = new Set([502, 503, 504]);

async function fetchLiveActiveStreams(token: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await apiGet<{ streams?: unknown[] }>('/api/live/active', token, 15000);
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && TRANSIENT_HTTP.has(err.status) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StoryViewer from '../../components/StoryViewer';
import { UploadOverlay } from '../../components/create';
import {
  HomeHeader,
  StoriesRow,
  HomeTabs,
  LiveStreamGrid,
  GamingSection,
} from '../../components/home';
import { subscribe } from '../../lib/realtimeSync';
import { useNotifications } from '../../lib/useNotifications';
import { normalizeStoryUserId } from '../../lib/storyUtils';

export default function HomeScreen() {
  const { user, token, isGuest } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('for-you');
  const [liveStreams, setLiveStreams] = useState<any[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stories state
  const [storyGroups, setStoryGroups] = useState<any[]>([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [uploadingStory, setUploadingStory] = useState(false);
  const [viewedUserIds, setViewedUserIds] = useState<Set<string>>(new Set());
  const { unreadCount, refreshUnreadCount } = useNotifications();

  const resetOverlays = useCallback(() => {
    setUploadingStory(false);
    setShowStoryViewer(false);
  }, []);

  const { pointerEvents } = useTabFocus(resetOverlays);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchData();
    const interval = setInterval(() => {
      if (token) fetchActiveStreams();
    }, 10000);
    const unsubStreams = subscribe('live_streams_updated', () => {
      fetchActiveStreams();
    });
    const unsubOnline = subscribe('online_count_update', (count) => {
      if (typeof count === 'number') setOnlineCount(count);
    });
    return () => {
      clearInterval(interval);
      unsubStreams();
      unsubOnline();
    };
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      fetchActiveStreams();
      fetchOnlineCount();
      fetchStories();
      loadViewedStories();
      refreshUnreadCount();
    }, [token, refreshUnreadCount])
  );

  // ── Viewed stories tracking ──
  const loadViewedStories = async () => {
    try {
      const stored = await AsyncStorage.getItem('viewed_story_users');
      if (stored) {
        const parsed = JSON.parse(stored) as unknown[];
        const cleaned = parsed
          .map((id) => normalizeStoryUserId(id))
          .filter((id): id is string => !!id);
        setViewedUserIds(new Set(cleaned));
        if (cleaned.length !== parsed.length) {
          AsyncStorage.setItem('viewed_story_users', JSON.stringify(cleaned));
        }
      }
    } catch (e) { }
  };

  const markStoryViewed = useCallback((userId: unknown) => {
    const key = normalizeStoryUserId(userId);
    if (!key) return;
    setViewedUserIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      AsyncStorage.setItem('viewed_story_users', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── Data fetching ──
  const fetchActiveStreams = async () => {
    if (!token) return;
    try {
      const res = await fetchLiveActiveStreams(token);
      setLiveStreams(res.streams || []);
    } catch (error) {
      if (error instanceof ApiError && TRANSIENT_HTTP.has(error.status)) {
        console.warn('Live streams temporarily unavailable (server waking up)');
        return;
      }
      console.error('Fetch active streams error:', error);
    }
  };

  const fetchOnlineCount = async () => {
    if (!token) return;
    try {
      const res = await apiGet<{ count?: number }>('/api/users/online-count', token);
      if (typeof res.count === 'number') setOnlineCount(res.count);
    } catch (error) {
      console.error('Fetch online count error:', error);
    }
  };

  const fetchStories = async () => {
    if (!token) return;
    try {
      const res = await apiGet<{ storyGroups?: { user_id: string | number }[] }>('/api/stories', token);
      const groups = res.storyGroups || [];
      setStoryGroups(groups);
      setViewedUserIds((prev) => {
        const active = new Set(
          groups.map((g) => normalizeStoryUserId(g.user_id)).filter((id): id is string => !!id),
        );
        const next = new Set([...prev].filter((id) => active.has(id)));
        if (next.size !== prev.size) {
          AsyncStorage.setItem('viewed_story_users', JSON.stringify([...next]));
        }
        return next;
      });
    } catch (error) {
      console.error('Fetch stories error:', error);
    }
  };

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [streamsRes, countRes, storiesRes] = await Promise.all([
        fetchLiveActiveStreams(token),
        apiGet<{ count?: number }>('/api/users/online-count', token),
        apiGet<{ storyGroups?: unknown[] }>('/api/stories', token),
      ]);

      setLiveStreams(streamsRes.streams || []);
      setOnlineCount(countRes.count || 0);
      setStoryGroups(storiesRes.storyGroups || []);
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openBroadcast = () => {
    if (!token || isGuest) {
      Alert.alert('Login Required', 'Please log in with your account to go live.');
      return;
    }
    router.push('/live/broadcast');
  };

  // ── Story actions ──
  const handleAddStory = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant access to your media library to upload stories.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.65,
        videoMaxDuration: 30,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';

      setUploadingStory(true);

      const formData = new FormData();
      const uri = asset.uri;
      const filename = uri.split('/').pop() || `story_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;

      if (Platform.OS === 'web') {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const file = new File([blob], filename, {
          type: isVideo ? 'video/mp4' : 'image/jpeg',
        });
        formData.append('media', file);
      } else {
        formData.append('media', {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: filename,
          type: isVideo ? 'video/mp4' : 'image/jpeg',
        } as any);
      }

      const response = await apiUpload<{ success?: boolean; error?: string }>(
        '/api/stories/upload',
        formData,
        token,
      );

      if (response.success) {
        fetchStories();
        Alert.alert('✨ Story Uploaded!', 'Your story is now visible to your followers for 24 hours.');
      }
    } catch (error: any) {
      console.error('Story upload error:', error);
      Alert.alert('Upload Failed', error?.message || 'Something went wrong.');
    } finally {
      setUploadingStory(false);
    }
  };

  const handleDeleteStory = async (storyId: number) => {
    try {
      await apiDelete(`/api/stories/${storyId}`, token);
      fetchStories();
    } catch (error) {
      console.error('Delete story error:', error);
    }
  };

  const openStoryViewer = (index: number) => {
    setStoryViewerIndex(index);
    setShowStoryViewer(true);
  };

  const currentUserKey = normalizeStoryUserId(user?.id);
  const hasOwnStory = storyGroups.length > 0
    && normalizeStoryUserId(storyGroups[0]?.user_id) === currentUserKey;

  const dismissUploadOverlay = useCallback(() => {
    setUploadingStory(false);
  }, []);

  return (
    <LinearGradient colors={[...gradients.screen]} style={styles.gradient}>
    <SafeAreaView style={styles.container} pointerEvents={pointerEvents}>
      <HomeHeader
        username={user?.username || ''}
        onlineCount={onlineCount}
        notificationCount={unreadCount}
        onSearch={() => router.push('/search' as any)}
        onNotification={() => router.push('/profile/notifications' as any)}
      />

      <StoriesRow
        storyGroups={storyGroups}
        currentUserId={currentUserKey || ''}
        currentUserAvatar={user?.avatar || null}
        hasOwnStory={hasOwnStory}
        onAddStory={handleAddStory}
        onOpenStoryViewer={openStoryViewer}
        viewedUserIds={viewedUserIds}
      />

      <HomeTabs activeTab={activeTab} onChangeTab={setActiveTab} />

      {activeTab === 'gaming' ? (
        <GamingSection
          token={token || ''}
          currentUserId={user?.id}
          onWatchBattle={(battleId) => router.push(`/pk/watch?battleId=${battleId}`)}
          onJoinBattle={(battleId) => router.push(`/pk/battle?mode=join&battleId=${battleId}`)}
          onResumeBattle={(battleId) => router.push(`/pk/battle?mode=host&battleId=${battleId}`)}
          onCreateBattle={() => router.push('/pk/battle?mode=create')}
          onWatchStream={(id) => router.push(`/live/watch?sessionId=${id}&talk=1`)}
          onStartBroadcast={openBroadcast}
          liveStreams={[]}
          refreshing={refreshing}
          onRefresh={onRefresh}
          pkOnly={true}
        />
      ) : (
        <LiveStreamGrid
          streams={[...liveStreams].sort((a: any, b: any) => (b.viewers_count || 0) - (a.viewers_count || 0))}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onWatchStream={(id) => router.push(`/live/watch?sessionId=${id}&talk=1`)}
          onStartBroadcast={openBroadcast}
        />
      )}

      <StoryViewer
        key={showStoryViewer ? `story-viewer-${storyViewerIndex}` : 'story-viewer-closed'}
        visible={showStoryViewer}
        storyGroups={storyGroups}
        initialGroupIndex={storyViewerIndex}
        currentUserId={currentUserKey || ''}
        onClose={() => setShowStoryViewer(false)}
        onDeleteStory={handleDeleteStory}
        onGroupChange={markStoryViewed}
      />

      <UploadOverlay
        visible={uploadingStory}
        onDismiss={dismissUploadOverlay}
      />
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
});