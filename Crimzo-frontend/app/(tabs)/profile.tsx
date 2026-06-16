import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  RefreshControl,
  Alert,
  StatusBar,
  Animated,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  TextInput,
  Share,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { apiGet, apiPost, apiDelete, apiFetch, resolveMediaUrl } from '../../lib/apiClient';
import FollowListModal from '../../components/profile/FollowListModal';
import { useTabFocus } from '../../lib/useTabFocus';
import { subscribe } from '../../lib/realtimeSync';

const { width: SW, height: SH } = Dimensions.get('window');
const REEL_THUMB_W = (SW - 6) / 3;

// ══════════════════════════════════════════════════════════════
//  PROFILE SCREEN  (Instagram-style)
// ══════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const { user, token, logout, updateUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const bottomNavPadding = Platform.OS === 'android'
    ? (insets.bottom > 0 ? insets.bottom + 26 : 38)
    : (insets.bottom > 0 ? insets.bottom + 18 : 46);
  const TAB_BAR_HEIGHT = 60 + bottomNavPadding;

  // Follow list
  const [listModalVisible, setListModalVisible] = useState(false);
  const [listType, setListType] = useState<'followers' | 'following' | 'friends'>('followers');
  const scrollRef = useRef<ScrollView>(null);
  const reelsSectionY = useRef(0);
  const [listData, setListData] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Reels
  const [myReels, setMyReels] = useState<any[]>([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [reelViewerVisible, setReelViewerVisible] = useState(false);
  const [reelViewerIndex, setReelViewerIndex] = useState(0);

  // Edit reel in profile
  const [profileEditVisible, setProfileEditVisible] = useState(false);
  const [profileEditingId, setProfileEditingId] = useState<string | null>(null);
  const [profileEditingCaption, setProfileEditingCaption] = useState('');

  // Hamburger menu
  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useRef(new Animated.Value(SW)).current;

  const resetOverlays = useCallback(() => {
    setMenuVisible(false);
    menuSlide.setValue(SW);
    setListModalVisible(false);
    setReelViewerVisible(false);
    setProfileEditVisible(false);
  }, [menuSlide]);

  const { pointerEvents } = useTabFocus(resetOverlays);

  // ── Fetch profile ──
  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      // For own profile, don't pass userId - let backend use the authenticated req.user.id
      // This prevents 404 if the id in local user state doesn't match DB (e.g. after DB reset/migration)
      const data = await apiGet<{
        success?: boolean;
        profile?: {
          crimzo_id?: string;
          diamonds?: number;
          beans?: number;
          wallet_balance?: number;
          followers_count?: number;
          following_count?: number;
          friends_count?: number;
          totalViews?: number;
          totalLikes?: number;
          avatar?: string;
          bio?: string;
          country?: string;
          username?: string;
        };
      }>(
        '/api/user/profile/full',
        token,
      );
      if (data.success && data.profile) {
        const p = data.profile;
        updateUser({
          ...user,
          crimzo_id: p.crimzo_id,
          diamonds: p.diamonds,
          beans: p.beans,
          wallet_balance: p.wallet_balance,
          followers_count: p.followers_count,
          following_count: p.following_count,
          friends_count: p.friends_count,
          totalViews: p.totalViews,
          totalLikes: p.totalLikes,
          avatar: p.avatar,
          bio: p.bio,
          country: p.country,
          username: p.username,
        });
      }
    } catch (e) {
      console.error('Fetch profile error:', e);
    }
  }, [token]);

  // ── Fetch my reels ──
  const fetchMyReels = useCallback(async () => {
    if (!token) return;
    setReelsLoading(true);
    try {
      const data = await apiGet<{ success?: boolean; reels?: any[] }>('/api/reels/me', token);
      if (data.success && Array.isArray(data.reels)) {
        setMyReels(
          data.reels.map((reel) => ({
            ...reel,
            video_url: resolveMediaUrl(reel.video_url),
            thumbnail_url: reel.thumbnail_url ? resolveMediaUrl(reel.thumbnail_url) : null,
          })),
        );
      } else {
        setMyReels([]);
      }
    } catch (e) {
      console.error('Fetch my reels error:', e);
      setMyReels([]);
    } finally {
      setReelsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    return subscribe('reel_deleted', (reelId) => {
      if (typeof reelId !== 'string') return;
      setMyReels((prev) => prev.filter((r) => r.id !== reelId));
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchMyReels();
    }, [fetchProfile, fetchMyReels])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfile(), fetchMyReels()]);
    setRefreshing(false);
  };

  // ── Follow list ──
  const openFollowList = async (type: 'followers' | 'following' | 'friends') => {
    setListType(type);
    setListModalVisible(true);
    setListLoading(true);
    try {
      const data = await apiGet<Record<string, any[]>>(
        `/api/user/${type}/me`,
        token,
      );
      setListData(data[type] || []);
    } catch (e) {
      console.error(`Fetch ${type} error:`, e);
      setListData([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleFollowFromList = async (targetUserId: string, index: number) => {
    if (!token) return;
    try {
      const data = await apiPost<{
        action?: string;
        isFollowing?: boolean;
        isRequested?: boolean;
      }>(
        '/api/user/follow',
        { userId: targetUserId },
        token,
      );
      setListData((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          is_following: data.isFollowing ?? data.action === 'followed',
          is_requested: data.isRequested ?? data.action === 'requested',
        };
        return updated;
      });
      fetchProfile();
    } catch (e) {
      console.error('Follow from list error:', e);
    }
  };

  const shareInvite = async () => {
    const code = user?.crimzo_id || String(user?.id || '');
    try {
      await Share.share({
        message: `Join me on Crimzo! Use my invite code: CRIMZO-${code}\nhttps://crimzo.app/invite/${code}`,
      });
    } catch (e) {
      console.error('Share invite error:', e);
    }
  };

  const scrollToReels = () => {
    scrollRef.current?.scrollTo({ y: reelsSectionY.current, animated: true });
  };

  const openUserFromList = (targetId: string) => {
    setListModalVisible(false);
    if (String(targetId) === String(user?.id)) return;
    router.push(`/user/${targetId}` as any);
  };

  // ── Delete reel ──
  const handleDeleteReel = (reelId: string) => {
    Alert.alert('Delete Reel', 'Are you sure you want to delete this reel?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const data = await apiDelete<{ success?: boolean; error?: string }>(
              `/api/reels/${reelId}`,
              token,
            );
            if (data.success) {
              setMyReels(prev => prev.filter(r => r.id !== reelId));
            } else {
              Alert.alert('Error', data.error || 'Failed to delete reel');
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to delete reel');
          }
        }
      },
    ]);
  };

  // ── Edit reel caption (profile grid) ──
  const handleEditReelProfile = (reelId: string, currentCaption: string) => {
    setProfileEditingId(reelId);
    setProfileEditingCaption(currentCaption || '');
    setProfileEditVisible(true);
  };

  const openReelViewer = (index: number) => {
    setReelViewerIndex(index);
    setReelViewerVisible(true);
  };

  const submitProfileEdit = async () => {
    if (!profileEditingId || !token) return;
    try {
      const data = await apiFetch<{ success?: boolean; error?: string }>(
        `/api/reels/${profileEditingId}`,
        {
          method: 'PATCH',
          token,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: profileEditingCaption }),
        },
      );
      if (data.success) {
        setMyReels(prev => prev.map(r =>
          r.id === profileEditingId ? { ...r, caption: profileEditingCaption } : r
        ));
        setProfileEditVisible(false);
        setProfileEditingId(null);
        setProfileEditingCaption('');
      } else {
        Alert.alert('Error', data.error || 'Failed to update');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update reel');
    }
  };

  // ── Hamburger menu ──
  const openMenu = () => {
    setMenuVisible(true);
    Animated.spring(menuSlide, { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }).start();
  };

  const closeMenu = () => {
    Animated.timing(menuSlide, { toValue: SW, duration: 250, useNativeDriver: true }).start(() => {
      setMenuVisible(false);
    });
  };

  const handleMenuPress = (label: string) => {
    closeMenu();
    setTimeout(() => {
      switch (label) {
        case 'My Profile': router.push('/profile/edit' as any); break;
        case 'Messages': router.push('/profile/messages' as any); break;
        case 'Notifications': router.push('/profile/notifications' as any); break;
        case 'Wallet': router.push('/profile/wallet' as any); break;
        case 'My Tasks': router.push('/profile/tasks' as any); break;
        case 'Collected Stickers': router.push('/profile/stickers' as any); break;
        case 'My Invitation':
          shareInvite();
          break;
        case 'Settings': router.push('/profile/settings' as any); break;
        case 'Help & Support':
          Alert.alert('Help & Support', 'Email: support@crimzo.app\nVersion: 4.0.1');
          break;
        default: break;
      }
    }, 300);
  };

  const handleLogout = () => {
    closeMenu();
    setTimeout(() => {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
      ]);
    }, 300);
  };

  const formatNumber = (n: number | undefined) => {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
  };

  const initial = (user?.username || 'U').charAt(0).toUpperCase();

  // ══════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════
  return (
    <View style={s.container} pointerEvents={pointerEvents}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF2D55" />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 20 }}
      >
        {/* ── Cover gradient + top bar ── */}
        <LinearGradient
          colors={['#1a0015', '#2d0a3e', '#1a0a2e', '#0a0a14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.coverGradient}
        >
          {/* Top bar */}
          <View style={s.topBar}>
            <Text style={s.topUsername}>{user?.username || 'User'}</Text>
            <TouchableOpacity style={s.hamburgerBtn} onPress={openMenu}>
              <Ionicons name="menu-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* ── Centered Avatar ── */}
          <View style={s.avatarSection}>
            <TouchableOpacity style={s.avatarWrap} onPress={() => router.push('/profile/edit' as any)} activeOpacity={0.8}>
              <LinearGradient colors={['#FF2D55', '#FF6B8A', '#FFB347']} style={s.avatarRing}>
                <View style={s.avatarInner}>
                  {user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarPlaceholder]}>
                      <Text style={s.avatarInitial}>{initial}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
              {/* Camera badge */}
              <View style={s.cameraBadge}>
                <Ionicons name="camera" size={12} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Name, ID & Bio ── */}
          <View style={s.nameSection}>
            <Text style={s.displayName}>{user?.username || 'User'}</Text>
            <View style={s.crimzoIdRow}>
              <TouchableOpacity
                onPress={() => {
                  const id = user?.crimzo_id || String(user?.id || '');
                  if (id) {
                    Clipboard.setString(id);
                    Alert.alert('Copied', 'Crimzo ID copied!');
                  }
                }}
                activeOpacity={0.8}
              >
                <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.crimzoIdBadge}>
                  <Text style={s.crimzoIdText}>ID: {user?.crimzo_id || 'Generating...'}</Text>
                </LinearGradient>
              </TouchableOpacity>
              {user?.country ? (
                <View style={s.countryBadge}>
                  <Text style={s.countryText}>📍 {user.country}</Text>
                </View>
              ) : null}
            </View>
            {user?.bio ? <Text style={s.bioText}>{user.bio}</Text> : null}
          </View>
        </LinearGradient>

        {/* ── Stats Cards ── */}
        <View style={s.statsContainer}>
          <View style={s.statsGrid}>
            <TouchableOpacity style={s.statCard} onPress={scrollToReels} activeOpacity={0.7}>
              <Text style={s.statValue}>{myReels.length}</Text>
              <Text style={s.statLabel}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.statCard} onPress={() => openFollowList('followers')} activeOpacity={0.7}>
              <Text style={s.statValue}>{formatNumber(user?.followers_count)}</Text>
              <Text style={s.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.statCard} onPress={() => openFollowList('following')} activeOpacity={0.7}>
              <Text style={s.statValue}>{formatNumber(user?.following_count)}</Text>
              <Text style={s.statLabel}>Following</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.statCard} onPress={() => openFollowList('friends')} activeOpacity={0.7}>
              <Text style={s.statValue}>{formatNumber(user?.friends_count)}</Text>
              <Text style={s.statLabel}>Friends</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Engagement & Wallet Row ── */}
        <View style={s.engagementRow}>
          <View style={s.engagementCard}>
            <View style={s.engagementInner}>
              <TouchableOpacity style={s.engagementItem} onPress={scrollToReels} activeOpacity={0.7}>
                <Ionicons name="heart" size={14} color="#FF2D55" />
                <Text style={s.engagementValue}>{formatNumber(user?.totalLikes)}</Text>
                <Text style={s.engagementLabel}>Likes</Text>
              </TouchableOpacity>
              <View style={s.engagementDivider} />
              <TouchableOpacity style={s.engagementItem} onPress={scrollToReels} activeOpacity={0.7}>
                <Ionicons name="eye" size={14} color="#9333EA" />
                <Text style={s.engagementValue}>{formatNumber(user?.totalViews)}</Text>
                <Text style={s.engagementLabel}>Views</Text>
              </TouchableOpacity>
              <View style={s.engagementDivider} />
              <TouchableOpacity
                style={s.engagementItem}
                onPress={() => router.push('/profile/wallet' as any)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13 }}>💎</Text>
                <Text style={s.engagementValue}>{formatNumber(user?.diamonds)}</Text>
                <Text style={s.engagementLabel}>Diamonds</Text>
              </TouchableOpacity>
              <View style={s.engagementDivider} />
              <TouchableOpacity
                style={s.engagementItem}
                onPress={() => router.push('/profile/wallet' as any)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13 }}>🟡</Text>
                <Text style={s.engagementValue}>{formatNumber(user?.beans)}</Text>
                <Text style={s.engagementLabel}>Beans</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.editBtn} onPress={() => router.push('/profile/edit' as any)} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={s.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.walletBtn} onPress={() => router.push('/profile/wallet' as any)} activeOpacity={0.7}>
            <Ionicons name="wallet-outline" size={16} color="#FFB347" style={{ marginRight: 6 }} />
            <Text style={s.walletBtnText}>Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.msgBtn} onPress={() => router.push('/profile/messages' as any)} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={16} color="#9333EA" style={{ marginRight: 6 }} />
            <Text style={s.msgBtnText}>Messages</Text>
          </TouchableOpacity>
        </View>

        {/* ── Reels Grid ── */}
        <View
          style={s.reelsHeader}
          onLayout={(e) => { reelsSectionY.current = e.nativeEvent.layout.y; }}
        >
          <View style={s.reelsTabActive}>
            <Ionicons name="grid-outline" size={22} color="#FFF" />
          </View>
        </View>

        {reelsLoading ? (
          <View style={s.reelsLoading}>
            <ActivityIndicator size="small" color="#FF2D55" />
          </View>
        ) : myReels.length === 0 ? (
          <View style={s.reelsEmpty}>
            <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={s.reelsEmptyTitle}>No Posts Yet</Text>
            <Text style={s.reelsEmptySub}>Upload your first reel!</Text>
            <TouchableOpacity
              style={s.uploadReelBtn}
              onPress={() => router.push('/(tabs)/reels' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={s.uploadReelBtnText}>Create Reel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.reelsGrid}>
            {myReels.map((reel: any, index: number) => (
              <View key={reel.id} style={s.reelThumb}>
                <ReelGridThumb
                  videoUrl={reel.video_url}
                  thumbnailUrl={reel.thumbnail_url}
                  onPress={() => openReelViewer(index)}
                />
                <View style={s.reelOverlay} pointerEvents="none">
                  <View style={s.reelStatRow}>
                    <Ionicons name="heart" size={11} color="#FFF" />
                    <Text style={s.reelStatText}>{formatNumber(reel.likes_count || 0)}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.reelMenuBtn}
                  onPress={() => {
                    Alert.alert(
                      'Reel Options',
                      '',
                      [
                        { text: 'Edit Caption', onPress: () => handleEditReelProfile(reel.id, reel.caption) },
                        { text: 'Delete Reel', style: 'destructive', onPress: () => handleDeleteReel(reel.id) },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ProfileReelViewer
        visible={reelViewerVisible}
        reels={myReels}
        initialIndex={reelViewerIndex}
        token={token}
        onClose={() => setReelViewerVisible(false)}
      />

      {/* ══════════════════════════════════════════════════ */}
      {/*  HAMBURGER MENU (slide-in from right)            */}
      {/* ══════════════════════════════════════════════════ */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={s.menuBackdrop} onPress={closeMenu} activeOpacity={1} />
          <Animated.View style={[s.menuPanel, { transform: [{ translateX: menuSlide }] }]}>
            {/* Menu header */}
            <View style={s.menuHeader}>
              <Text style={s.menuTitle}>Settings</Text>
              <TouchableOpacity onPress={closeMenu}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { icon: 'person-circle-outline', label: 'My Profile', color: '#9333EA' },
                { icon: 'chatbubbles-outline', label: 'Messages', color: '#9333EA' },
                { icon: 'notifications-outline', label: 'Notifications', color: '#FF2D55' },
                { icon: 'wallet-outline', label: 'Wallet', color: '#4CD964' },
                { icon: 'checkmark-circle-outline', label: 'My Tasks', color: '#9333EA' },
                { icon: 'star-outline', label: 'Collected Stickers', color: '#FFB347' },
                { icon: 'people-outline', label: 'My Invitation', color: '#9333EA' },
                { icon: 'settings-outline', label: 'Settings', color: '#9333EA' },
                { icon: 'help-circle-outline', label: 'Help & Support', color: '#9333EA' },
              ].map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.menuItem}
                  onPress={() => handleMenuPress(item.label)}
                  activeOpacity={0.6}
                >
                  <View style={[s.menuIconWrap, { backgroundColor: item.color + '18' }]}>
                    <Ionicons name={item.icon as any} size={22} color={item.color} />
                  </View>
                  <Text style={s.menuLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#999" />
                </TouchableOpacity>
              ))}

              {/* Logout */}
              <TouchableOpacity style={s.logoutItem} onPress={handleLogout} activeOpacity={0.6}>
                <View style={[s.menuIconWrap, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                  <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
                </View>
                <Text style={s.logoutText}>Logout</Text>
              </TouchableOpacity>

              <Text style={s.versionText}>Crimzo v1.0.0</Text>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <FollowListModal
        visible={listModalVisible}
        type={listType}
        data={listData}
        loading={listLoading}
        currentUserId={user?.id}
        onClose={() => setListModalVisible(false)}
        onToggleFollow={handleFollowFromList}
        onOpenProfile={openUserFromList}
      />

      {/* Profile Edit Caption Modal */}
      <Modal
        visible={profileEditVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileEditVisible(false)}
      >
        <View style={m.editModalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={m.editModalCard}
          >
            <Text style={m.editModalTitle}>Edit Caption</Text>
            <TextInput
              style={m.editCaptionInput}
              value={profileEditingCaption}
              onChangeText={setProfileEditingCaption}
              placeholder="Write a new caption..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              maxLength={300}
              autoFocus
            />
            <View style={m.editModalActions}>
              <TouchableOpacity
                style={m.editBtn}
                onPress={() => {
                  setProfileEditVisible(false);
                  setProfileEditingId(null);
                }}
              >
                <Text style={m.editBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.editBtn, m.editSaveBtn]}
                onPress={submitProfileEdit}
              >
                <Text style={[m.editBtnText, m.editSaveBtnText]}>Save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function ReelGridThumb({
  videoUrl,
  thumbnailUrl,
  onPress,
}: {
  videoUrl: string;
  thumbnailUrl?: string | null;
  onPress: () => void;
}) {
  const resolved = resolveMediaUrl(videoUrl);
  const player = useVideoPlayer(resolved, (p) => {
    p.loop = false;
    p.muted = true;
  });

  return (
    <TouchableOpacity style={s.reelThumbInner} onPress={onPress} activeOpacity={0.85}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={s.reelThumbImg} />
      ) : resolved ? (
        <VideoView
          player={player}
          style={s.reelThumbImg}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[s.reelThumbImg, s.reelThumbPlaceholder]}>
          <Ionicons name="play" size={24} color="rgba(255,255,255,0.6)" />
        </View>
      )}
      <View style={s.reelPlayBadge}>
        <Ionicons name="play" size={12} color="#FFF" />
      </View>
    </TouchableOpacity>
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
  reels: any[];
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

function ProfileReelViewerSlide({
  reel,
  activeIndex,
  total,
  onClose,
  onPrev,
  onNext,
  token,
}: {
  reel: any;
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

const rv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
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
  navLeft: {
    position: 'absolute',
    left: 8,
    top: '45%',
    zIndex: 10,
    padding: 12,
  },
  navRight: {
    position: 'absolute',
    right: 8,
    top: '45%',
    zIndex: 10,
    padding: 12,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  caption: { color: '#FFF', fontSize: 15, marginBottom: 8, lineHeight: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statsText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  counter: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 'auto' },
});

// ══════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ── Cover gradient ──
  coverGradient: {
    paddingBottom: 24,
  },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 6,
  },
  topUsername: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  hamburgerBtn: { padding: 4 },

  // ── Avatar section (centered) ──
  avatarSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  avatarWrap: { position: 'relative' },
  avatarRing: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 92, height: 92, borderRadius: 46, overflow: 'hidden', backgroundColor: '#1C1C1E' },
  avatar: { width: 92, height: 92, borderRadius: 46 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A2E' },
  avatarInitial: { color: '#FF6B8A', fontSize: 36, fontWeight: '900' },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FF2D55',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0a0a14',
  },

  // ── Name section ──
  nameSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  displayName: { color: '#FFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 8 },
  crimzoIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  crimzoIdBadge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  crimzoIdText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  countryBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  countryText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  bioText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 4, maxWidth: SW * 0.8 },

  // ── Stats Cards ──
  statsContainer: {
    paddingHorizontal: 16,
    marginTop: -8,
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28,28,30,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Engagement Row ──
  engagementRow: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  engagementCard: {
    backgroundColor: 'rgba(28,28,30,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  engagementInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  engagementItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  engagementValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  engagementLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600' },
  engagementDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // ── Action buttons ──
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginTop: 14, marginBottom: 14 },
  editBtn: {
    flex: 1, minWidth: '30%', flexDirection: 'row', backgroundColor: 'rgba(255,45,85,0.12)', paddingVertical: 11, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)',
  },
  editBtnText: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },
  walletBtn: {
    flex: 1, minWidth: '30%', flexDirection: 'row', backgroundColor: 'rgba(255,179,71,0.1)', paddingVertical: 11, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,179,71,0.2)',
  },
  walletBtnText: { color: '#FFB347', fontSize: 14, fontWeight: '700' },
  msgBtn: {
    flex: 1, minWidth: '30%', flexDirection: 'row', backgroundColor: 'rgba(147,51,234,0.1)', paddingVertical: 11, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.2)',
  },
  msgBtnText: { color: '#9333EA', fontSize: 14, fontWeight: '700' },

  // ── Reels tab header ──
  reelsHeader: {
    flexDirection: 'row', justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reelsTabActive: { paddingVertical: 10, paddingHorizontal: 32, borderBottomWidth: 2, borderBottomColor: '#FFF' },

  // ── Reels grid ──
  reelsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reelThumb: {
    width: REEL_THUMB_W, height: REEL_THUMB_W * 1.4,
    margin: 1, backgroundColor: '#111', position: 'relative', overflow: 'hidden',
  },
  reelThumbInner: { width: '100%', height: '100%' },
  reelThumbImg: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111',
  },
  reelThumbPlaceholder: { backgroundColor: '#1a1a1e' },
  reelPlayBadge: {
    position: 'absolute', bottom: 8, left: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  reelOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 6, paddingBottom: 6, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reelStatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reelStatText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // 3-dot menu on reel
  reelMenuBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
  },

  // ── Reels empty ──
  reelsLoading: { paddingVertical: 48, alignItems: 'center' },
  reelsEmpty: { alignItems: 'center', paddingVertical: 48 },
  reelsEmptyTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', marginTop: 12 },
  reelsEmptySub: { color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 4 },
  uploadReelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: '#FF2D55',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  uploadReelBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // ── Hamburger menu ──
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuPanel: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: SW * 0.78, backgroundColor: '#0F0F14',
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.06)',
    paddingTop: 52,
  },
  menuHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 20,
  },
  menuTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
  },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: '#EEE', fontSize: 15, fontWeight: '500', flex: 1 },
  logoutItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 14,
    marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  logoutText: { color: '#FF3B30', fontSize: 15, fontWeight: '600', flex: 1 },
  versionText: { color: '#333', fontSize: 11, textAlign: 'center', marginTop: 20, marginBottom: 20 },
});

// ── Follow Modal styles ──
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  container: {
    flex: 1, backgroundColor: '#0A0A0A', marginTop: 50,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginTop: 16 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  userLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPH: { backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  userName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  userBio: { color: '#888', fontSize: 12, marginTop: 2, maxWidth: 180 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CD964' },
  followBtn: { backgroundColor: '#FF2D55', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  followBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  followingText: { color: 'rgba(255,255,255,0.5)' },

  // ── Edit modal (profile) ──
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