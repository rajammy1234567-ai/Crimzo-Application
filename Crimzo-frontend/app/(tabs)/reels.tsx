import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  Share,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, apiGet, apiPost, apiDelete, resolveMediaUrl } from '../../lib/apiClient';
import { subscribe } from '../../lib/realtimeSync';
import { parseFollowResponse } from '../../lib/followHelpers';
import { getTabBarHeight } from '../../lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type FeedMode = 'foryou' | 'following';

type Reel = {
  id: string;
  user_id: string;
  video_url: string;
  caption: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  username: string;
  avatar: string | null;
  is_liked: boolean;
  is_following: boolean;
  is_requested?: boolean;
  created_at: string;
};

function normalizeReelFromApi(raw: any): Reel {
  const userId = raw?.user_id != null ? String(raw.user_id) : '';
  return {
    id: String(raw?.id ?? raw?._id ?? ''),
    user_id: userId,
    video_url: resolveMediaUrl(raw?.video_url ?? ''),
    caption: raw?.caption ?? '',
    likes_count: raw?.likes_count ?? 0,
    comments_count: raw?.comments_count ?? 0,
    views_count: raw?.views_count ?? 0,
    username: (raw?.username && String(raw.username).trim()) || 'User',
    avatar: raw?.avatar ? resolveMediaUrl(raw.avatar) : null,
    is_liked: !!raw?.is_liked,
    is_following: !!raw?.is_following,
    is_requested: !!raw?.is_requested,
    created_at: raw?.created_at ?? '',
  };
}

type Comment = {
  id: string;
  user_id: string;
  text: string;
  username: string;
  avatar: string | null;
  created_at: string;
};

// ── Single Reel Item Component ──
function ReelItem({
  item,
  isActive,
  reelHeight,
  tabBarHeight,
  currentUserId,
  onLike,
  onFollow,
  onOpenComments,
  onOpenProfile,
  onDeleteReel,
  onEditReel,
}: {
  item: Reel;
  isActive: boolean;
  reelHeight: number;
  tabBarHeight: number;
  currentUserId: string | undefined;
  onLike: (reelId: string) => void;
  onFollow: (userId: string) => Promise<void>;
  onOpenComments: (reelId: string) => void;
  onOpenProfile: (userId: string) => void;
  onDeleteReel?: (reelId: string) => void;
  onEditReel?: (reelId: string, currentCaption: string) => void;
}) {
  const contentBottom = tabBarHeight + 10;
  const avatarUri = item.avatar ? resolveMediaUrl(item.avatar) : null;

  const [liked, setLiked] = useState(item.is_liked);
  const [likesCount, setLikesCount] = useState(item.likes_count);
  const [following, setFollowing] = useState(item.is_following);
  const [requested, setRequested] = useState(!!item.is_requested);
  const [followBusy, setFollowBusy] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bigHeartOpacity = useRef(new Animated.Value(0)).current;
  const bigHeartScale = useRef(new Animated.Value(0.5)).current;

  const videoSource = resolveMediaUrl(item.video_url);
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.volume = 1;
  });

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive]);

  useEffect(() => {
    setLiked(item.is_liked);
    setLikesCount(item.likes_count);
    setFollowing(item.is_following);
    setRequested(!!item.is_requested);
  }, [item.is_liked, item.likes_count, item.is_following, item.is_requested]);

  const animateHeart = () => {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const showBigHeart = () => {
    bigHeartOpacity.setValue(1);
    bigHeartScale.setValue(0.5);
    Animated.parallel([
      Animated.spring(bigHeartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(bigHeartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const handleLike = () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount(prev => newLiked ? prev + 1 : Math.max(prev - 1, 0));
    animateHeart();
    onLike(item.id);
  };

  const handleDoubleTap = () => {
    if (doubleTapRef.current) {
      clearTimeout(doubleTapRef.current);
      doubleTapRef.current = null;
      // Double tap - like
      if (!liked) {
        setLiked(true);
        setLikesCount(prev => prev + 1);
        animateHeart();
        onLike(item.id);
      }
      showBigHeart();
    } else {
      doubleTapRef.current = setTimeout(() => {
        doubleTapRef.current = null;
        // Single tap - toggle play/pause
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
      }, 300);
    }
  };

  const handleFollow = async () => {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      await onFollow(item.user_id);
    } finally {
      setFollowBusy(false);
    }
  };

  const followLabel = following ? 'Following' : requested ? 'Requested' : 'Follow';

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this reel by @${item.username} on Crimzo!`,
        url: item.video_url,
      });
    } catch (e) { }
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const isOwnReel = String(currentUserId) === String(item.user_id);
  const displayUsername = item.username || 'User';

  return (
    <View style={[styles.reelContainer, { height: reelHeight }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleDoubleTap}
        style={styles.videoTouchable}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      </TouchableOpacity>

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
        style={[styles.bottomGradient, { pointerEvents: 'none' }]}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        style={[styles.topGradient, { pointerEvents: 'none' }]}
      />

      {/* Big heart animation (double tap) */}
      <Animated.View style={[styles.bigHeart, { opacity: bigHeartOpacity, transform: [{ scale: bigHeartScale }], pointerEvents: 'none' }]}>
        <Ionicons name="heart" size={100} color="#FF2D55" />
      </Animated.View>

      {/* ── Right side actions (Instagram order) ── */}
      <View style={[styles.rightActions, { bottom: contentBottom }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={34}
              color={liked ? '#FF2D55' : '#FFF'}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(likesCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onOpenComments(item.id)}>
          <Ionicons name="chatbubble-outline" size={32} color="#FFF" />
          <Text style={styles.actionCount}>{formatCount(item.comments_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="paper-plane-outline" size={32} color="#FFF" />
        </TouchableOpacity>

        {isOwnReel && onDeleteReel && onEditReel ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              Alert.alert(
                'Reel Options',
                '',
                [
                  {
                    text: 'Edit Caption',
                    onPress: () => onEditReel(item.id, item.caption),
                  },
                  {
                    text: 'Delete Reel',
                    style: 'destructive',
                    onPress: () => onDeleteReel(item.id),
                  },
                  { text: 'Cancel', style: 'cancel' },
                ],
              );
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={28} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="ellipsis-horizontal" size={28} color="#FFF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.profileDiscWrap}
          onPress={() => item.user_id && onOpenProfile(item.user_id)}
          activeOpacity={0.85}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.profileDisc} />
          ) : (
            <View style={[styles.profileDisc, styles.profileDiscPlaceholder]}>
              <Ionicons name="person" size={18} color="#999" />
            </View>
          )}
          {!isOwnReel && !following && !requested && (
            <View style={styles.profileFollowBadge}>
              <Ionicons name="add" size={11} color="#FFF" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Bottom info (username + caption) ── */}
      <View style={[styles.bottomInfo, { bottom: contentBottom }]}>
        <View style={styles.userRow}>
          <TouchableOpacity
            onPress={() => item.user_id && onOpenProfile(item.user_id)}
            activeOpacity={0.7}
          >
            <Text style={styles.usernameText}>{displayUsername}</Text>
          </TouchableOpacity>
          {!isOwnReel && (
            <TouchableOpacity
              style={[
                styles.followBtn,
                (following || requested) && styles.followingBtn,
                requested && !following && styles.requestedBtn,
              ]}
              onPress={handleFollow}
              activeOpacity={0.7}
              disabled={followBusy}
            >
              <Text
                style={[
                  styles.followBtnText,
                  (following || requested) && styles.followingBtnText,
                  requested && !following && styles.requestedBtnText,
                ]}
              >
                {followLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {item.caption ? (
          <Text style={styles.captionText} numberOfLines={2}>
            <Text style={styles.captionUsername}>{displayUsername} </Text>
            {item.caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Comments Bottom Sheet ──
function CommentsSheet({
  visible,
  reelId,
  token,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  reelId: string | null;
  token: string | null;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible && reelId) {
      Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 150, useNativeDriver: true }).start();
      fetchComments();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, reelId]);

  const fetchComments = async () => {
    if (!reelId || !token) return;
    setLoading(true);
    try {
      const data = await apiGet<{ success?: boolean; comments?: any[] }>(
        `/api/reels/${reelId}/comments`,
        token,
      );
      if (data.success) {
        setComments(
          (data.comments || []).map((c: Comment) => ({
            ...c,
            avatar: c.avatar ? resolveMediaUrl(c.avatar) : c.avatar,
          })),
        );
      }
    } catch (e) {
      console.error('Fetch comments error:', e);
    } finally {
      setLoading(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim() || !reelId || !token || posting) return;
    setPosting(true);
    try {
      const data = await apiPost<{ success?: boolean; comment?: any }>(
        `/api/reels/${reelId}/comment`,
        { text: newComment.trim() },
        token,
      );
      if (data.success) {
        setComments(prev => [data.comment, ...prev]);
        setNewComment('');
      }
    } catch (e) {
      console.error('Post comment error:', e);
    } finally {
      setPosting(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.commentsOverlay, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.commentsBackdrop} onPress={onClose} activeOpacity={1} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.commentsSheet}
      >
        {/* Handle */}
        <View style={styles.sheetHandle}>
          <View style={styles.sheetHandleBar} />
        </View>

        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>Comments</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.commentsLoading}>
            <ActivityIndicator size="small" color="#FF2D55" />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.noComments}>
            <Ionicons name="chatbubble-outline" size={40} color="#555" />
            <Text style={styles.noCommentsText}>No comments yet</Text>
            <Text style={styles.noCommentsSubtext}>Be the first to comment!</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => (c?.id ?? 'comment').toString()}
            style={styles.commentsList}
            renderItem={({ item: c }) => (
              <View style={styles.commentItem}>
                <TouchableOpacity
                  onPress={() => {
                    if (c.user_id) {
                      onClose();
                      onOpenProfile(c.user_id);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {c.avatar ? (
                    <Image source={{ uri: c.avatar }} style={styles.commentAvatar} />
                  ) : (
                    <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                      <Ionicons name="person" size={14} color="#999" />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.commentBody}>
                  <View style={styles.commentNameRow}>
                    <TouchableOpacity
                      onPress={() => {
                        if (c.user_id) {
                          onClose();
                          onOpenProfile(c.user_id);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.commentUsername}>{c.username}</Text>
                    </TouchableOpacity>
                    <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                  </View>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            )}
          />
        )}

        {/* Input */}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor="#666"
            value={newComment}
            onChangeText={setNewComment}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !newComment.trim() && styles.sendBtnDisabled]}
            onPress={postComment}
            disabled={!newComment.trim() || posting}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color={newComment.trim() ? '#FFF' : '#666'} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── Main Reels Screen ──
export default function ReelsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(insets.bottom);
  const [viewportHeight, setViewportHeight] = useState(SCREEN_HEIGHT);
  const reelHeight = viewportHeight;

  const [feedMode, setFeedMode] = useState<FeedMode>('foryou');
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentReelId, setCommentReelId] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);

  // ── Reel upload state ──
  const [showReelUpload, setShowReelUpload] = useState(false);
  const [uploadAsset, setUploadAsset] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  // ── Edit own reel state ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReelId, setEditingReelId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState('');
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const fetchReels = useCallback(async (mode: FeedMode) => {
    if (!token) { setLoading(false); setRefreshing(false); return; }
    try {
      const data = await apiGet<{ success?: boolean; reels?: Reel[] }>(
        `/api/reels/feed?limit=50&mode=${mode}`,
        token,
      );
      if (data.success && Array.isArray(data.reels)) {
        setReels(data.reels.map(normalizeReelFromApi));
        setActiveIndex(0);
      }
    } catch (e) {
      console.error('Fetch reels error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchReels(feedMode);
  }, [token, feedMode, fetchReels]);

  useEffect(() => {
    return subscribe('reel_deleted', (reelId) => {
      if (typeof reelId !== 'string') return;
      setReels((prev) => prev.filter((r) => r.id !== reelId));
    });
  }, []);

  useEffect(() => {
    return subscribe('follow_status_changed', (payload) => {
      const data = payload as { userId?: string; isFollowing?: boolean; isRequested?: boolean };
      if (!data?.userId) return;
      setReels((prev) =>
        prev.map((r) =>
          String(r.user_id) === String(data.userId)
            ? {
              ...r,
              is_following: data.isFollowing ?? r.is_following,
              is_requested: data.isRequested ?? r.is_requested,
            }
            : r,
        ),
      );
    });
  }, []);

  // Refetch when screen comes back into focus (picks up newly uploaded reels)
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      fetchReels(feedMode);
      return () => {
        setScreenFocused(false);
        setCommentsVisible(false);
        setCommentReelId(null);
        setShowReelUpload(false);
        setShowEditModal(false);
        setUploading(false);
        setUploadAsset(null);
      };
    }, [fetchReels, feedMode])
  );

  const handleLike = async (reelId: string) => {
    if (!token) return;
    try {
      await apiPost(`/api/reels/${reelId}/like`, {}, token);
    } catch (e) {
      console.error('Like error:', e);
    }
  };

  const handleFollow = async (userId: string) => {
    if (!token) return;
    try {
      const res = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
      }>('/api/user/follow', { userId }, token);
      const { isFollowing, isRequested } = parseFollowResponse(res);
      setReels((prev) =>
        prev.map((r) =>
          String(r.user_id) === String(userId)
            ? { ...r, is_following: isFollowing, is_requested: isRequested }
            : r,
        ),
      );
    } catch (e) {
      console.error('Follow error:', e);
    }
  };

  const switchFeedMode = (mode: FeedMode) => {
    if (mode === feedMode) return;
    setReels([]);
    setActiveIndex(0);
    setFeedMode(mode);
  };

  const handleViewReel = async (reelId: string) => {
    if (!token || recordedViewsRef.current.has(reelId)) return;
    recordedViewsRef.current.add(reelId);
    try {
      const res = await apiPost<{ counted?: boolean; views_count?: number }>(
        `/api/reels/${reelId}/view`,
        {},
        token,
      );
      if (res.counted && res.views_count != null) {
        setReels((prev) =>
          prev.map((r) => (r.id === reelId ? { ...r, views_count: res.views_count! } : r)),
        );
      }
    } catch (e) {
      recordedViewsRef.current.delete(reelId);
    }
  };

  const onOpenComments = (reelId: string) => {
    setCommentReelId(reelId);
    setCommentsVisible(true);
  };

  const handleOpenProfile = useCallback((userId: string) => {
    if (!userId) return;
    if (String(userId) === String(user?.id)) {
      router.push('/(tabs)/profile');
      return;
    }
    router.push(`/user/${userId}` as any);
  }, [router, user?.id]);

  // ── Delete own reel from feed ──
  const handleDeleteReel = (reelId: string) => {
    Alert.alert('Delete Reel', 'Are you sure you want to delete this reel?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const data = await apiDelete<{ success?: boolean; error?: string }>(
              `/api/reels/${reelId}`,
              token,
            );
            if (data.success) {
              setReels(prev => prev.filter(r => r.id !== reelId));
            } else {
              Alert.alert('Error', data.error || 'Failed to delete reel');
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to delete reel');
          }
        },
      },
    ]);
  };

  // ── Edit caption for own reel ──
  const handleEditReel = (reelId: string, currentCaption: string) => {
    setEditingReelId(reelId);
    setEditingCaption(currentCaption || '');
    setShowEditModal(true);
  };

  const submitEditReel = async () => {
    if (!editingReelId || !token) return;
    try {
      const data = await apiFetch<{ success?: boolean; error?: string }>(
        `/api/reels/${editingReelId}`,
        {
          method: 'PATCH',
          token,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: editingCaption }),
        },
      );
      if (data.success) {
        setReels(prev =>
          prev.map(r => (r.id === editingReelId ? { ...r, caption: editingCaption } : r))
        );
        setShowEditModal(false);
        setEditingReelId(null);
        setEditingCaption('');
      } else {
        Alert.alert('Error', data.error || 'Failed to update reel');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update reel');
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      setActiveIndex(newIndex);
      // Record view
      const viewedReel = viewableItems[0].item;
      if (viewedReel) {
        handleViewReel(viewedReel.id);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const onRefresh = () => {
    setRefreshing(true);
    fetchReels(feedMode);
  };

  // ── Reel upload from reels tab ──
  const handlePickReel = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploadAsset(result.assets[0]);
      setShowReelUpload(true);
    } catch (e) {
      console.error('Pick reel error:', e);
    }
  };

  const uploadReelFile = async (caption: string) => {
    if (!uploadAsset || !token) return;
    setUploading(true);
    setUploadProgress(10);
    setUploadDone(false);
    try {
      const formData = new FormData();

      // Cross-platform file append (native RN uses {uri,type,name} object; web needs real File/Blob)
      if (Platform.OS === 'web') {
        const resp = await fetch(uploadAsset.uri);
        const blob = await resp.blob();
        const file = new File([blob], uploadAsset.fileName || 'reel.mp4', {
          type: uploadAsset.mimeType || 'video/mp4',
        });
        formData.append('video', file);
      } else {
        const filename = uploadAsset.fileName || uploadAsset.uri.split('/').pop() || `reel_${Date.now()}.mp4`;
        formData.append('video', {
          uri: uploadAsset.uri,
          type: uploadAsset.mimeType || 'video/mp4',
          name: filename,
        } as any);
      }

      formData.append('caption', caption || '');
      setUploadProgress(30);

      const response = await apiFetch<{ success?: boolean; error?: string }>('/api/reels/upload', {
        method: 'POST',
        token,
        body: formData,
        timeoutMs: 5 * 60 * 1000,
      });

      if (response.success) {
        setUploadProgress(100);
        setUploadDone(true);
        setTimeout(() => {
          setUploading(false);
          setUploadDone(false);
          setShowReelUpload(false);
          setUploadAsset(null);
          fetchReels(feedMode);
        }, 1200);
      } else {
        throw new Error('Failed to save reel');
      }
    } catch (error: any) {
      console.error('Reel upload error:', error?.message || error);
      setUploading(false);
      alert(error.response?.data?.error || error.message || 'Upload failed');
    }
  };

  const tabPointerEvents = screenFocused ? 'auto' : 'none';

  if (loading) {
    return (
      <View style={styles.loadingContainer} pointerEvents={tabPointerEvents}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FF2D55" />
        <Text style={styles.loadingText}>Loading Reels...</Text>
      </View>
    );
  }

  const FeedTabs = () => (
    <View style={styles.feedTabs}>
      <TouchableOpacity onPress={() => switchFeedMode('following')} activeOpacity={0.8}>
        <Text style={[styles.feedTabText, feedMode === 'following' && styles.feedTabActive]}>
          Following
        </Text>
        {feedMode === 'following' && <View style={styles.feedTabIndicator} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => switchFeedMode('foryou')} activeOpacity={0.8}>
        <Text style={[styles.feedTabText, feedMode === 'foryou' && styles.feedTabActive]}>
          For You
        </Text>
        {feedMode === 'foryou' && <View style={styles.feedTabIndicator} />}
      </TouchableOpacity>
    </View>
  );

  if (reels.length === 0) {
    return (
      <View style={styles.emptyContainer} pointerEvents={tabPointerEvents}>
        <StatusBar barStyle="light-content" />
        <View style={styles.emptyHeader}>
          <FeedTabs />
          <TouchableOpacity style={styles.uploadHeaderBtn} onPress={handlePickReel}>
            <Ionicons name="add-circle-outline" size={26} color="#FF2D55" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContent}>
          <Ionicons name="film-outline" size={64} color="#555" />
          <Text style={styles.emptyTitle}>
            {feedMode === 'following' ? 'No reels from people you follow' : 'No Reels Yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {feedMode === 'following'
              ? 'Follow creators to see their reels here, or switch to For You.'
              : 'Be the first to share a reel!'}
          </Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: '#FF2D55', marginBottom: 12 }]} onPress={handlePickReel}>
            <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
            <Text style={styles.emptyBtnText}>Upload Reel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.emptyBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <ReelUploadModal
          visible={showReelUpload}
          asset={uploadAsset}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadDone={uploadDone}
          onClose={() => { if (!uploading) { setShowReelUpload(false); setUploadAsset(null); } }}
          onPost={uploadReelFile}
        />
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      pointerEvents={tabPointerEvents}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - viewportHeight) > 1) {
          setViewportHeight(h);
        }
      }}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Header overlay */}
      <View style={styles.headerOverlay}>
        <FeedTabs />
        <TouchableOpacity style={styles.uploadHeaderBtn} onPress={handlePickReel}>
          <Ionicons name="add-circle-outline" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={reels}
        keyExtractor={(item, index) => (item?.id ?? index).toString()}
        renderItem={({ item, index }) => (
          <ReelItem
            item={item}
            isActive={index === activeIndex && screenFocused && !commentsVisible}
            reelHeight={reelHeight}
            tabBarHeight={tabBarHeight}
            currentUserId={user?.id != null ? String(user.id) : undefined}
            onLike={handleLike}
            onFollow={handleFollow}
            onOpenComments={onOpenComments}
            onOpenProfile={handleOpenProfile}
            onDeleteReel={handleDeleteReel}
            onEditReel={handleEditReel}
          />
        )}
        pagingEnabled={Platform.OS === 'ios'}
        snapToInterval={Platform.OS === 'android' ? reelHeight : undefined}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: reelHeight,
          offset: reelHeight * index,
          index,
        })}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2D55" progressViewOffset={60} />
        }
        removeClippedSubviews={false}
        maxToRenderPerBatch={2}
        windowSize={3}
        initialNumToRender={1}
        extraData={`${activeIndex}-${reelHeight}`}
      />

      {/* Comments Sheet */}
      <CommentsSheet
        visible={commentsVisible}
        reelId={commentReelId}
        token={token}
        onOpenProfile={handleOpenProfile}
        onClose={() => {
          setCommentsVisible(false);
          setCommentReelId(null);
        }}
      />

      {/* Edit Caption Modal for own reels */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editModalCard}
          >
            <Text style={styles.editModalTitle}>Edit Caption</Text>
            <TextInput
              style={styles.editCaptionInput}
              value={editingCaption}
              onChangeText={setEditingCaption}
              placeholder="Write a new caption..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              maxLength={300}
              autoFocus
            />
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingReelId(null);
                  setEditingCaption('');
                }}
              >
                <Text style={styles.editBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, styles.editSaveBtn]}
                onPress={submitEditReel}
              >
                <Text style={[styles.editBtnText, styles.editSaveBtnText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Reel Upload Modal */}
      <ReelUploadModal
        visible={showReelUpload}
        asset={uploadAsset}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadDone={uploadDone}
        onClose={() => { if (!uploading) { setShowReelUpload(false); setUploadAsset(null); } }}
        onPost={uploadReelFile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
  },

  // ── Empty ──
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  emptyHeader: {
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF2D55',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
  },
  emptyBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Header ──
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  feedTabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: '700',
    paddingBottom: 6,
  },
  feedTabActive: {
    color: '#FFF',
  },
  feedTabIndicator: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#FFF',
    marginTop: -4,
  },
  uploadHeaderBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  reelsTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // ── Reel Item ──
  reelContainer: {
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoTouchable: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bigHeart: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -50,
    marginLeft: -50,
  },

  // ── Right Actions ──
  rightActions: {
    position: 'absolute',
    right: 8,
    alignItems: 'center',
    gap: 18,
    zIndex: 5,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 3,
  },
  actionCount: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Bottom Info (Instagram-style) ──
  bottomInfo: {
    position: 'absolute',
    left: 12,
    right: 72,
    zIndex: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  profileDiscWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#FFF',
    overflow: 'visible',
    marginTop: 4,
  },
  profileDisc: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
  },
  profileDiscPlaceholder: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFollowBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  usernameText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  followBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 2,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  followingBtnText: {
    color: 'rgba(255,255,255,0.45)',
  },
  requestedBtn: {
    borderColor: 'rgba(255,255,255,0.35)',
  },
  requestedBtnText: {
    color: 'rgba(255,255,255,0.65)',
  },
  captionText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  captionUsername: {
    fontWeight: '800',
    color: '#FFF',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statsText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  statsDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 3,
  },

  // ── Comments Sheet ──
  commentsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  commentsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  commentsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.55,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  commentsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  commentsLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noComments: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  noCommentsText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  noCommentsSubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentAvatarPlaceholder: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBody: {
    flex: 1,
  },
  commentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentUsername: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  commentTime: {
    color: '#888',
    fontSize: 11,
  },
  commentText: {
    color: '#DDD',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#2C2C2E',
  },

  // ── Edit Caption Modal styles ──
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  editModalCard: {
    width: '100%',
    backgroundColor: '#1A1A1E',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  editModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  editCaptionInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  editSaveBtn: {
    backgroundColor: '#FF2D55',
  },
  editBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  editSaveBtnText: {
    color: '#FFF',
  },
});

// ─────────────────────────────────────────────────────────
// Reel Upload Modal (Instagram-style)
// ─────────────────────────────────────────────────────────
function ReelUploadModal({
  visible,
  asset,
  uploading,
  uploadProgress,
  uploadDone,
  onClose,
  onPost,
}: {
  visible: boolean;
  asset: any;
  uploading: boolean;
  uploadProgress: number;
  uploadDone: boolean;
  onClose: () => void;
  onPost: (caption: string) => void;
}) {
  const [caption, setCaption] = useState('');
  const player = useVideoPlayer(asset?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (visible && asset?.uri) {
      try { player.play(); } catch (_) { }
    } else {
      try { player.pause(); } catch (_) { }
    }
  }, [visible, asset?.uri]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={rumStyles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={rumStyles.header}>
          <TouchableOpacity onPress={onClose} disabled={uploading} style={rumStyles.closeBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={rumStyles.title}>New Reel</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Video preview */}
        <View style={rumStyles.videoWrapper}>
          {asset?.uri ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          ) : null}

          {/* Upload overlay */}
          {uploading && (
            <View style={rumStyles.uploadOverlay}>
              {uploadDone ? (
                <View style={rumStyles.doneBox}>
                  <Ionicons name="checkmark-circle" size={70} color="#4CAF50" />
                  <Text style={rumStyles.doneText}>Posted!</Text>
                </View>
              ) : (
                <View style={rumStyles.progressBox}>
                  <ActivityIndicator size="large" color="#FF2D55" />
                  <Text style={rumStyles.progressPct}>{uploadProgress}%</Text>
                  <Text style={rumStyles.progressLabel}>Uploading your reel...</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Caption + Post button */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={rumStyles.bottomBar}
        >
          <TextInput
            style={rumStyles.captionInput}
            placeholder="Write a caption...  #hashtag @mention"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            style={[rumStyles.postBtn, uploading && { opacity: 0.5 }]}
            onPress={() => onPost(caption)}
            disabled={uploading}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={rumStyles.postBtnText}>Done & Post Reel</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const rumStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeBtn: { padding: 4 },
  title: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  videoWrapper: { flex: 1, backgroundColor: '#111' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneBox: { alignItems: 'center' },
  doneText: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: 12 },
  progressBox: { alignItems: 'center', gap: 12 },
  progressPct: { color: '#FFF', fontSize: 36, fontWeight: '800' },
  progressLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  bottomBar: {
    backgroundColor: '#0A0A0F',
    padding: 16, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  captionInput: {
    color: '#FFF', fontSize: 15,
    paddingVertical: 8, paddingHorizontal: 4,
    minHeight: 44, maxHeight: 96,
    textAlignVertical: 'top',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF2D55', borderRadius: 12, paddingVertical: 14,
  },
  postBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});