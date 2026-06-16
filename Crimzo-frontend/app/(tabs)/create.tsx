import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Easing,
  StatusBar,
  Platform,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, apiUpload } from '../../lib/apiClient';
import { useTabFocus } from '../../lib/useTabFocus';

import {
  GoLiveCard,
  StoryCard,
  SecondaryActions,
  CreatorTips,
  UploadOverlay,
} from '../../components/create';



export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  const resetOverlays = useCallback(() => {
    setUploading(false);
    setUploadDone(false);
    setShowReelPreview(false);
    setShowStoryPreview(false);
  }, []);

  const { pointerEvents } = useTabFocus(resetOverlays);

  // ── Reel preview state ──
  const [showReelPreview, setShowReelPreview] = useState(false);

  // ── Story preview state ──
  const [showStoryPreview, setShowStoryPreview] = useState(false);
  const [selectedStoryAsset, setSelectedStoryAsset] = useState<any>(null);
  const [storyMediaType, setStoryMediaType] = useState<'photo' | 'video'>('photo');

  // Stagger animations
  const fadeAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const slideAnims = useRef([
    new Animated.Value(30),
    new Animated.Value(30),
    new Animated.Value(30),
    new Animated.Value(30),
  ]).current;

  useEffect(() => {
    const animations = fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim, {
          toValue: 1, duration: 400, delay: i * 100,
          easing: Easing.out(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(slideAnims[i], {
          toValue: 0, duration: 400, delay: i * 100,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ])
    );
    Animated.parallel(animations).start();
  }, []);

  // ── Handlers ──
  const handleGoLive = () => {
    if (!token || isGuest) {
      Alert.alert('Login Required', 'Please log in with your account to go live.');
      return;
    }
    router.push('/live/broadcast');
  };
  const handlePKBattle = () => router.push('/pk/lobby');

  const handleUploadReel = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant access to your media library to upload reels.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 60,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Show Instagram-style preview modal
      setSelectedReelAsset(result.assets[0]);
      setReelCaption('');
      setShowReelPreview(true);
    } catch (error: any) {
      console.error('Reel picker error:', error);
      Alert.alert('Error', 'Failed to pick video');
    }
  };

  const [reelCaption, setReelCaption] = useState('');
  const [selectedReelAsset, setSelectedReelAsset] = useState<any>(null);

  const uploadReelFile = async (asset: any, caption: string) => {
    setUploading(true);
    setUploadProgress(10);
    setUploadDone(false);
    try {
      const formData = new FormData();

      // Cross-platform file append (native RN uses {uri,type,name} object; web needs real File/Blob)
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const file = new File([blob], asset.fileName || 'reel.mp4', {
          type: asset.mimeType || 'video/mp4',
        });
        formData.append('video', file);
      } else {
        const filename = asset.fileName || asset.uri.split('/').pop() || `reel_${Date.now()}.mp4`;
        formData.append('video', {
          uri: asset.uri,
          type: asset.mimeType || 'video/mp4',
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
          setShowReelPreview(false);
          Alert.alert('🎬 Reel Uploaded!', 'Your reel is now live for everyone to see.');
        }, 1200);
      } else {
        throw new Error('Failed to save reel');
      }
    } catch (error: any) {
      console.error('Reel upload error:', error?.message || error);
      setUploading(false);
      Alert.alert('Upload Failed', error?.message || 'Something went wrong. Please try again.');
    }
  };

  // Step 1: Just pick the media and show preview
  const pickAndUploadStory = async (mediaType: 'photo' | 'video') => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant access to your media library to upload stories.');
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        allowsEditing: mediaType === 'photo',
        quality: 0.65,
      };

      if (mediaType === 'video') {
        pickerOptions.mediaTypes = ['videos'];
        pickerOptions.videoMaxDuration = 30;
        pickerOptions.allowsEditing = false;
      } else {
        pickerOptions.mediaTypes = ['images'];
      }

      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Show preview modal with Upload/Done button
      setSelectedStoryAsset(result.assets[0]);
      setStoryMediaType(mediaType);
      setShowStoryPreview(true);
    } catch (error: any) {
      console.error('Story picker error:', error);
      Alert.alert('Error', 'Failed to pick media');
    }
  };

  // Step 2: Actually upload after user taps Upload Story
  const doUploadStory = async () => {
    if (!selectedStoryAsset) return;
    setShowStoryPreview(false);
    const asset = selectedStoryAsset;
    const mediaType = storyMediaType;
    try {
      setUploading(true);
      setUploadProgress(10);
      setUploadDone(false);

      const isVideo = mediaType === 'video';
      const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
      const ext = isVideo ? 'mp4' : 'jpg';

      const formData = new FormData();

      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        const file = new File([blob], asset.fileName || `story.${ext}`, {
          type: asset.mimeType || contentType,
        });
        formData.append('media', file);
      } else {
        const uri = asset.uri;
        formData.append('media', {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          type: asset.mimeType || contentType,
          name: asset.fileName || `story.${ext}`,
        } as any);
      }

      setUploadProgress(30);
      const response = await apiUpload<{ success?: boolean; error?: string }>(
        '/api/stories/upload',
        formData,
        token,
      );

      if (response.success) {
        setUploadProgress(100);
        setUploadDone(true);
        setTimeout(() => {
          setUploading(false);
          setUploadDone(false);
          Alert.alert('✨ Story Uploaded!', 'Your story is now visible to everyone for 24 hours.');
        }, 1200);
      } else {
        throw new Error('Failed to save story');
      }
    } catch (error: any) {
      console.error('Story upload error:', error?.message || error);
      setUploading(false);
      Alert.alert('Upload Failed', error?.message || 'Something went wrong. Please try again.');
    }
  };

  const dismissUploadOverlay = useCallback(() => {
    setUploading(false);
    setUploadDone(false);
  }, []);

  return (
    <View style={styles.container} pointerEvents={pointerEvents}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 80,
        }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create</Text>
          <Text style={styles.headerSubtitle}>Share your world</Text>
        </View>

        {/* Go Live Hero */}
        <GoLiveCard
          onPress={handleGoLive}
          fadeAnim={fadeAnims[0]}
          slideAnim={slideAnims[0]}
        />

        {/* Upload Story */}
        <StoryCard
          onUploadPhoto={() => pickAndUploadStory('photo')}
          onUploadVideo={() => pickAndUploadStory('video')}
          fadeAnim={fadeAnims[1]}
          slideAnim={slideAnims[1]}
        />

        {/* PK Battle & Upload Reel */}
        <SecondaryActions
          onPKBattle={handlePKBattle}
          onUploadReel={handleUploadReel}
          fadeAnims={[fadeAnims[2], fadeAnims[3]]}
          slideAnims={[slideAnims[2], slideAnims[3]]}
        />

        {/* Creator Tips */}
        <CreatorTips />
      </ScrollView>

      {/* Upload Overlay (story/reel progress) */}
      <UploadOverlay
        visible={uploading}
        progress={uploadProgress}
        done={uploadDone}
        onDismiss={dismissUploadOverlay}
      />

      {/* Story Preview Modal */}
      <StoryPreviewModal
        visible={showStoryPreview}
        asset={selectedStoryAsset}
        mediaType={storyMediaType}
        onClose={() => setShowStoryPreview(false)}
        onUpload={doUploadStory}
      />

      {/* Reel Preview Modal (Instagram-style) */}
      <ReelPreviewModal
        visible={showReelPreview}
        asset={selectedReelAsset}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadDone={uploadDone}
        onClose={() => { if (!uploading) setShowReelPreview(false); }}
        onPost={(caption) => {
          if (selectedReelAsset) uploadReelFile(selectedReelAsset, caption);
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Story Preview Modal
// ─────────────────────────────────────────────────────────
function StoryPreviewModal({
  visible,
  asset,
  mediaType,
  onClose,
  onUpload,
}: {
  visible: boolean;
  asset: any;
  mediaType: 'photo' | 'video';
  onClose: () => void;
  onUpload: () => void;
}) {
  if (!visible || !asset) return null;
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={spmStyles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={spmStyles.header}>
          <TouchableOpacity onPress={onClose} style={spmStyles.closeBtn}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={spmStyles.title}>New Story</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Preview */}
        <View style={spmStyles.preview}>
          {mediaType === 'photo' ? (
            <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <ReelVideoPreview key={asset.uri} uri={asset.uri} />
          )}
          {/* Vignette */}
          <View style={[spmStyles.vignette, { pointerEvents: 'none' }]} />
        </View>

        {/* Upload button */}
        <View style={spmStyles.footer}>
          <View style={spmStyles.actionRow}>
            <TouchableOpacity style={spmStyles.recropBtn} onPress={() => { onClose(); }}>
              <Ionicons name="crop" size={20} color="#9333EA" />
              <Text style={spmStyles.recropBtnText}>Re-crop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={spmStyles.uploadBtn} onPress={onUpload}>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={spmStyles.uploadBtnText}>Done & Upload</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const spmStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeBtn: { padding: 4 },
  title: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  preview: { flex: 1, backgroundColor: '#111' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoPlaceholderText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  videoPlaceholderSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6 },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0,
  },
  footer: {
    paddingVertical: 24, paddingHorizontal: 24, paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  actionRow: {
    flexDirection: 'row', gap: 12,
  },
  recropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    flex: 1, paddingVertical: 15, borderRadius: 14,
    backgroundColor: 'rgba(147,51,234,0.12)',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.2)',
  },
  recropBtnText: { color: '#9333EA', fontSize: 15, fontWeight: '700' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    flex: 1.5, backgroundColor: '#9333EA',
    paddingVertical: 15, borderRadius: 14,
  },
  uploadBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

function ReelVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// ─────────────────────────────────────────────────────────
// Reel Preview Modal (Instagram-style full-screen)
// ─────────────────────────────────────────────────────────
function ReelPreviewModal({
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

  useEffect(() => {
    if (!visible) setCaption('');
  }, [visible]);

  if (!visible || !asset?.uri) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={rpmStyles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={rpmStyles.header}>
          <TouchableOpacity onPress={onClose} style={rpmStyles.closeBtn} disabled={uploading}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={rpmStyles.title}>New Reel</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Video preview fills the screen */}
        <View style={rpmStyles.videoWrapper}>
          <ReelVideoPreview key={asset.uri} uri={asset.uri} />

          {/* Upload progress overlay */}
          {uploading && (
            <View style={rpmStyles.uploadOverlay}>
              {uploadDone ? (
                <View style={rpmStyles.doneContainer}>
                  <Ionicons name="checkmark-circle" size={70} color="#4CAF50" />
                  <Text style={rpmStyles.doneText}>Posted!</Text>
                </View>
              ) : (
                <View style={rpmStyles.progressContainer}>
                  <ActivityIndicator size="large" color="#9333EA" />
                  <Text style={rpmStyles.progressPct}>{uploadProgress}%</Text>
                  <Text style={rpmStyles.progressLabel}>Uploading your reel...</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Caption + Post button at bottom (Instagram style) */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={rpmStyles.bottomBar}
        >
          <TextInput
            style={rpmStyles.captionInput}
            placeholder="Write a caption...  #hashtag @mention"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            style={[rpmStyles.postBtn, uploading && rpmStyles.postBtnDisabled]}
            onPress={() => onPost(caption)}
            disabled={uploading}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={rpmStyles.postBtnText}>Done & Post Reel</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const rpmStyles = StyleSheet.create({
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneContainer: { alignItems: 'center' },
  doneText: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: 12 },
  progressContainer: { alignItems: 'center', gap: 12 },
  progressPct: { color: '#FFF', fontSize: 32, fontWeight: '800' },
  progressLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  bottomBar: {
    backgroundColor: '#0A0A0F',
    padding: 16, paddingBottom: 36,
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
    backgroundColor: '#9333EA', borderRadius: 12,
    paddingVertical: 14,
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: { marginBottom: 24, paddingHorizontal: 4 },
  headerTitle: { color: '#FFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  headerSubtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 15, fontWeight: '500', marginTop: 4 },
});
