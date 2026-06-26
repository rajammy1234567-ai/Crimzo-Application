import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  type ViewToken,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet } from '../../lib/apiClient';
import { subscribe } from '../../lib/realtimeSync';
import LiveWatchRoom from '../../components/LiveWatchRoom';
import {
  findLiveStreamIndex,
  sortLiveStreams,
  type LiveFeedStream,
} from '../../lib/liveFeed';

const { height: SH } = Dimensions.get('window');

export default function LiveFeedScreen() {
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const initialSessionId = String(Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId || '').trim();
  const { token } = useAuth();
  const router = useRouter();

  const listRef = useRef<FlatList<LiveFeedStream>>(null);
  const [streams, setStreams] = useState<LiveFeedStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  const fetchStreams = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiGet<{ streams?: LiveFeedStream[] }>('/api/live/active', token, 15000);
      const sorted = sortLiveStreams(
        (res.streams || []).map((s) => ({
          ...s,
          id: s.id,
          username: s.username || 'Host',
          avatar: s.avatar ?? null,
          viewers_count: s.viewers_count || 0,
        })),
      );
      setStreams(sorted);
      if (initialSessionId && sorted.length > 0) {
        const idx = findLiveStreamIndex(sorted, initialSessionId);
        setActiveIndex(idx);
        activeIndexRef.current = idx;
      }
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, [token, initialSessionId]);

  useEffect(() => {
    void fetchStreams();
  }, [fetchStreams]);

  useEffect(() => {
    return subscribe('live_streams_updated', () => { void fetchStreams(); });
  }, [fetchStreams]);

  const initialScrollIndex = useMemo(() => {
    if (!initialSessionId || streams.length === 0) return 0;
    return findLiveStreamIndex(streams, initialSessionId);
  }, [streams, initialSessionId]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null && first.index !== activeIndexRef.current) {
      activeIndexRef.current = first.index;
      setActiveIndex(first.index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const handleStreamEnded = useCallback((index: number) => {
    setStreams((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        router.replace('/(tabs)/home');
        return next;
      }
      const nextIndex = Math.min(index, next.length - 1);
      requestAnimationFrame(() => {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      });
      return next;
    });
  }, [router]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FF2D55" />
      </View>
    );
  }

  if (streams.length === 0) {
    router.replace('/(tabs)/home');
    return null;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <FlatList
        ref={listRef}
        data={streams}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => (
          <View style={styles.page}>
            <LiveWatchRoom
              sessionId={String(item.id)}
              isActive={index === activeIndex}
              feedMode
              preview={item}
              onClose={handleClose}
              onStreamEnded={() => handleStreamEnded(index)}
            />
          </View>
        )}
        pagingEnabled
        snapToInterval={SH}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        bounces={streams.length > 1}
        getItemLayout={(_, index) => ({ length: SH, offset: SH * index, index })}
        initialScrollIndex={Math.min(initialScrollIndex, streams.length - 1)}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { height: SH, width: '100%' },
  loading: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});