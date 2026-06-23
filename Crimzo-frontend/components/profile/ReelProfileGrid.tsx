import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { apiPost, resolveMediaUrl } from '../../lib/apiClient';

export type ProfileReel = {
  id: string;
  video_url: string;
  thumbnail_url?: string | null;
  caption?: string;
  likes_count?: number;
};

function formatNumber(n?: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ReelGridThumb({
  videoUrl,
  thumbnailUrl,
  onPress,
  thumbStyle,
}: {
  videoUrl: string;
  thumbnailUrl?: string | null;
  onPress: () => void;
  thumbStyle: { width: number; height: number };
}) {
  const resolved = resolveMediaUrl(videoUrl);
  const player = useVideoPlayer(resolved, (p) => {
    p.loop = false;
    p.muted = true;
  });

  return (
    <TouchableOpacity style={[s.thumbInner, thumbStyle]} onPress={onPress} activeOpacity={0.85}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={s.thumbImg} />
      ) : resolved ? (
        <VideoView
          player={player}
          style={s.thumbImg}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[s.thumbImg, s.thumbPlaceholder]}>
          <Ionicons name="play" size={20} color="rgba(255,255,255,0.6)" />
        </View>
      )}
      <View style={s.playBadge}>
        <Ionicons name="play" size={11} color="#FFF" />
      </View>
    </TouchableOpacity>
  );
}

function ProfileReelViewerSlide({
  reel,
  activeIndex,
  total,
  onClose,
  onPrev,
  onNext,
  token,
}: {
  reel: ProfileReel;
  activeIndex: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  token?: string | null;
}) {
  const viewRecordedRef = useRef(false);

  useEffect(() => {
    viewRecordedRef.current = false;
  }, [reel.id]);

  useEffect(() => {
    if (!token || viewRecordedRef.current) return;
    viewRecordedRef.current = true;
    apiPost(`/api/reels/${reel.id}/view`, {}, token).catch(() => {
      viewRecordedRef.current = false;
    });
  }, [reel.id, token]);

  const player = useVideoPlayer(resolveMediaUrl(reel.video_url), (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={rv.container}>
        <StatusBar barStyle="light-content" />
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
          style={rv.gradient}
          pointerEvents="none"
        />
        <TouchableOpacity style={rv.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        {activeIndex > 0 && (
          <TouchableOpacity style={rv.navLeft} onPress={onPrev}>
            <Ionicons name="chevron-back" size={32} color="#FFF" />
          </TouchableOpacity>
        )}
        {activeIndex < total - 1 && (
          <TouchableOpacity style={rv.navRight} onPress={onNext}>
            <Ionicons name="chevron-forward" size={32} color="#FFF" />
          </TouchableOpacity>
        )}
        <View style={rv.bottomInfo}>
          {reel.caption ? (
            <Text style={rv.caption} numberOfLines={3}>{reel.caption}</Text>
          ) : null}
          <View style={rv.statsRow}>
            <Ionicons name="heart" size={14} color="#FF2D55" />
            <Text style={rv.statsText}>{reel.likes_count || 0} likes</Text>
            <Text style={rv.counter}>{activeIndex + 1} / {total}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ProfileReelViewer({
  visible,
  reels,
  initialIndex,
  onClose,
  token,
}: {
  visible: boolean;
  reels: ProfileReel[];
  initialIndex: number;
  onClose: () => void;
  token?: string | null;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const reel = reels[activeIndex];

  useEffect(() => {
    if (visible) setActiveIndex(initialIndex);
  }, [visible, initialIndex]);

  if (!visible || !reel) return null;

  return (
    <ProfileReelViewerSlide
      key={`${reel.id}-${activeIndex}`}
      reel={reel}
      activeIndex={activeIndex}
      total={reels.length}
      onClose={onClose}
      token={token}
      onPrev={() => setActiveIndex((i) => Math.max(0, i - 1))}
      onNext={() => setActiveIndex((i) => Math.min(reels.length - 1, i + 1))}
    />
  );
}

type ReelProfileGridProps = {
  reels: ProfileReel[];
  token?: string | null;
  canView?: boolean;
  lockedMessage?: string;
  emptyMessage?: string;
  thumbWidth?: number;
};

export default function ReelProfileGrid({
  reels,
  token,
  canView = true,
  lockedMessage = 'Follow each other to see posts',
  emptyMessage = 'No posts yet',
  thumbWidth,
}: ReelProfileGridProps) {
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const sw = Dimensions.get('window').width;
  const thumb = thumbWidth ?? (sw - 4) / 3;
  const thumbH = thumb * 1.35;

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  if (!canView) {
    return (
      <View style={s.locked}>
        <Ionicons name="lock-closed-outline" size={36} color="#444" />
        <Text style={s.lockedText}>{lockedMessage}</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="camera-outline" size={40} color="#333" />
        <Text style={s.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <>
      <View style={s.grid}>
        {reels.map((reel, index) => (
          <View key={reel.id} style={[s.thumb, { width: thumb, height: thumbH }]}>
            <ReelGridThumb
              videoUrl={reel.video_url}
              thumbnailUrl={reel.thumbnail_url}
              onPress={() => openViewer(index)}
              thumbStyle={{ width: thumb - 2, height: thumbH - 2 }}
            />
            <View style={s.thumbOverlay} pointerEvents="none">
              <Ionicons name="heart" size={11} color="#FFF" />
              <Text style={s.thumbLikes}>{formatNumber(reel.likes_count)}</Text>
            </View>
          </View>
        ))}
      </View>
      <ProfileReelViewer
        visible={viewerVisible}
        reels={reels}
        initialIndex={viewerIndex}
        token={token}
        onClose={() => setViewerVisible(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { padding: 1, position: 'relative' },
  thumbInner: { borderRadius: 2, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%', backgroundColor: '#111' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  thumbLikes: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { color: '#666', fontSize: 14 },
  locked: { alignItems: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 32 },
  lockedText: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

const rv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060F' },
  gradient: { ...StyleSheet.absoluteFillObject },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { position: 'absolute', left: 8, top: '45%', zIndex: 10, padding: 12 },
  navRight: { position: 'absolute', right: 8, top: '45%', zIndex: 10, padding: 12 },
  bottomInfo: { position: 'absolute', bottom: 40, left: 16, right: 16, zIndex: 10 },
  caption: { color: '#FFF', fontSize: 15, marginBottom: 8, lineHeight: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statsText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  counter: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 'auto' },
});