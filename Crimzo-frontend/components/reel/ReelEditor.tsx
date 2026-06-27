import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
  StatusBar,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../../lib/apiClient';
import { resolveReelAudioUrl } from '../../lib/reelAudio';
import { appAlert } from '../../lib/appAlert';
import { KEYBOARD_BEHAVIOR } from '../KeyboardAware';
import MusicPicker from './MusicPicker';
import { formatMs, reelStudioColors } from './reelStudioTheme';
import type { ReelAudioSelection, ReelSound, ReelVideoAsset } from '../../lib/reelTypes';

const CAPTION_MAX = 300;

type Props = {
  visible: boolean;
  asset: ReelVideoAsset | null;
  token?: string | null;
  initialSound?: ReelSound | null;
  uploading: boolean;
  uploadProgress: number;
  uploadDone: boolean;
  onClose: () => void;
  onPost: (caption: string, audio: ReelAudioSelection | null) => void;
};

function ReelVideoPreview({
  uri,
  muted,
  playing,
}: {
  uri: string;
  muted: boolean;
  playing: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export default function ReelEditor({
  visible,
  asset,
  token,
  initialSound,
  uploading,
  uploadProgress,
  uploadDone,
  onClose,
  onPost,
}: Props) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [selectedSound, setSelectedSound] = useState<ReelSound | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const musicRef = useRef<Audio.Sound | null>(null);

  const stopMusic = async () => {
    if (musicRef.current) {
      try {
        await musicRef.current.stopAsync();
        await musicRef.current.unloadAsync();
      } catch {
        // ignore
      }
      musicRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible) {
      setCaption('');
      setSelectedSound(null);
      setShowMusicPicker(false);
      void stopMusic();
      return;
    }
    if (initialSound) setSelectedSound(initialSound);
  }, [visible, initialSound?.id]);

  useEffect(() => {
    if (!visible || !asset?.uri) return;

    void (async () => {
      await stopMusic();
      if (!selectedSound) return;
      try {
        const streamUrl = await resolveReelAudioUrl(
          selectedSound.audio_url,
          selectedSound.source,
          selectedSound.external_id,
          token,
        );
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: streamUrl },
          { shouldPlay: true, isLooping: true, volume: 1 },
        );
        musicRef.current = sound;
      } catch (e) {
        console.error('Editor music error:', e);
      }
    })();

    return () => { void stopMusic(); };
  }, [visible, asset?.uri, selectedSound?.id, token]);

  const handleClose = () => {
    if (uploading) return;
    if (caption.trim() || selectedSound) {
      appAlert('Discard reel?', 'Your edits will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  if (!visible || !asset?.uri) return null;

  const hasMusic = !!selectedSound;
  const durationLabel = formatMs(
    typeof asset.duration === 'number' ? asset.duration : null,
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.videoStage}>
          <ReelVideoPreview
            key={asset.uri}
            uri={asset.uri}
            muted={hasMusic}
            playing={!uploading}
          />

          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={handleClose} disabled={uploading} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Preview & Share</Text>
              <Text style={styles.headerStep}>Step 2 of 2</Text>
            </View>
            <View style={styles.durationBadge}>
              <Ionicons name="time-outline" size={13} color="#FFF" />
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>
          </View>

          {/* Music strip */}
          <View style={[styles.musicStrip, { top: insets.top + 64 }]}>
            {selectedSound ? (
              <TouchableOpacity
                style={styles.musicChip}
                onPress={() => setShowMusicPicker(true)}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {selectedSound.cover_url ? (
                  <Image
                    source={{ uri: resolveMediaUrl(selectedSound.cover_url) }}
                    style={styles.musicCover}
                  />
                ) : (
                  <View style={styles.musicCoverFallback}>
                    <Ionicons name="musical-note" size={14} color="#FFF" />
                  </View>
                )}
                <View style={styles.musicMeta}>
                  <Text style={styles.musicTitle} numberOfLines={1}>{selectedSound.title}</Text>
                  <Text style={styles.musicArtist} numberOfLines={1}>{selectedSound.artist}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedSound(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={uploading}
                >
                  <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.65)" />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addMusicBtn}
                onPress={() => setShowMusicPicker(true)}
                disabled={uploading}
                activeOpacity={0.85}
              >
                <Ionicons name="musical-notes" size={18} color="#FFF" />
                <Text style={styles.addMusicText}>Add Music</Text>
              </TouchableOpacity>
            )}
          </View>

          {uploading && (
            <View style={styles.uploadOverlay}>
              {uploadDone ? (
                <View style={styles.doneBox}>
                  <View style={styles.doneIconWrap}>
                    <Ionicons name="checkmark" size={42} color="#FFF" />
                  </View>
                  <Text style={styles.doneTitle}>Reel Posted</Text>
                  <Text style={styles.doneSub}>Taking you to your feed...</Text>
                </View>
              ) : (
                <View style={styles.progressCard}>
                  <ActivityIndicator size="large" color={reelStudioColors.primary} />
                  <Text style={styles.progressPct}>{uploadProgress}%</Text>
                  <Text style={styles.progressLabel}>Uploading your reel</Text>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <KeyboardAvoidingView
          behavior={KEYBOARD_BEHAVIOR}
          style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={styles.captionHeader}>
            <Text style={styles.captionLabel}>Caption</Text>
            <Text style={styles.captionCount}>{caption.length}/{CAPTION_MAX}</Text>
          </View>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption... #hashtags @mentions"
            placeholderTextColor={reelStudioColors.textSubtle}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={CAPTION_MAX}
            editable={!uploading}
          />

          <TouchableOpacity
            style={[styles.postBtn, uploading && styles.postBtnDisabled]}
            onPress={() => onPost(caption, selectedSound ? { sound: selectedSound, startMs: 0 } : null)}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FF2D55', '#FF6B8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.postBtnGradient}
            >
              <Ionicons name="paper-plane" size={18} color="#FFF" />
              <Text style={styles.postBtnText}>Share Reel</Text>
            </LinearGradient>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>

      <MusicPicker
        visible={showMusicPicker}
        token={token}
        selectedId={selectedSound?.id}
        onClose={() => setShowMusicPicker(false)}
        onSelect={setSelectedSound}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoStage: { flex: 1, backgroundColor: '#0A0A0F' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  headerStep: { color: reelStudioColors.textMuted, fontSize: 11, marginTop: 2, fontWeight: '500' },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: reelStudioColors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  durationText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  musicStrip: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 15,
  },
  musicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    borderRadius: 16,
    padding: 10,
  },
  musicCover: { width: 40, height: 40, borderRadius: 8 },
  musicCoverFallback: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicMeta: { flex: 1 },
  musicTitle: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  musicArtist: { color: reelStudioColors.textMuted, fontSize: 12, marginTop: 2 },
  addMusicBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: reelStudioColors.primary,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  addMusicText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  doneBox: { alignItems: 'center' },
  doneIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: reelStudioColors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 16 },
  doneSub: { color: reelStudioColors.textMuted, fontSize: 14, marginTop: 6 },
  progressCard: {
    width: '78%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  progressPct: { color: '#FFF', fontSize: 34, fontWeight: '800', marginTop: 12 },
  progressLabel: { color: reelStudioColors.textMuted, fontSize: 14, marginTop: 4 },
  progressBarTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: reelStudioColors.primary,
    borderRadius: 2,
  },
  bottomPanel: {
    backgroundColor: '#0A0A0F',
    borderTopWidth: 1,
    borderTopColor: reelStudioColors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  captionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  captionLabel: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  captionCount: { color: reelStudioColors.textMuted, fontSize: 12, fontWeight: '600' },
  captionInput: {
    color: '#FFF',
    fontSize: 15,
    minHeight: 72,
    maxHeight: 110,
    textAlignVertical: 'top',
    backgroundColor: reelStudioColors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  postBtn: { borderRadius: 14, overflow: 'hidden' },
  postBtnDisabled: { opacity: 0.55 },
  postBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  postBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});