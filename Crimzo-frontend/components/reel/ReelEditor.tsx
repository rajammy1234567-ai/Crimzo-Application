import React, { useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../../lib/apiClient';
import { resolveReelAudioUrl } from '../../lib/reelAudio';
import { playReelMusic, stopReelMusic } from '../../lib/reelMusicPlayer';
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
    p.volume = muted ? 0 : 1;
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  useEffect(() => {
    player.muted = muted;
    player.volume = muted ? 0 : 1;
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
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);

  const syncMusicPlayback = useCallback(async (sound: ReelSound | null) => {
    await stopReelMusic();
    if (!sound) return;

    try {
      const streamUrl = await resolveReelAudioUrl(
        sound.audio_url,
        sound.source,
        sound.external_id,
        token,
      );
      await playReelMusic({ url: streamUrl, loop: true, volume: 1 });
    } catch (e) {
      console.error('Editor music error:', e);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) {
      setCaption('');
      setSelectedSound(null);
      setMuteOriginalAudio(false);
      setShowMusicPicker(false);
      void stopReelMusic();
      return;
    }

    if (initialSound) {
      setSelectedSound(initialSound);
      setMuteOriginalAudio(true);
    }
  }, [visible, initialSound?.id]);

  useEffect(() => {
    if (!visible || showMusicPicker) {
      void stopReelMusic();
      return;
    }
    void syncMusicPlayback(selectedSound);
  }, [visible, showMusicPicker, selectedSound?.id, syncMusicPlayback]);

  useEffect(() => {
    return () => { void stopReelMusic(); };
  }, []);

  const handleSoundSelect = (sound: ReelSound | null) => {
    setSelectedSound(sound);
    if (sound) {
      setMuteOriginalAudio(true);
    }
  };

  const handleRemoveMusic = async () => {
    await stopReelMusic();
    setSelectedSound(null);
    setMuteOriginalAudio(false);
  };

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

  const durationLabel = formatMs(
    typeof asset.duration === 'number' ? asset.duration : null,
  );

  const buildAudioSelection = (): ReelAudioSelection | null => {
    if (!selectedSound) return null;
    return {
      sound: selectedSound,
      startMs: 0,
      muteOriginalAudio,
    };
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.videoStage}>
          <ReelVideoPreview
            key={`${asset.uri}-${muteOriginalAudio}`}
            uri={asset.uri}
            muted={muteOriginalAudio}
            playing={!uploading && !showMusicPicker}
          />

          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity onPress={handleClose} disabled={uploading} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={20} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.durationBadge}>
              <Ionicons name="time-outline" size={12} color="#FFF" />
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>
          </View>

          {/* Right tool rail */}
          <View style={[styles.toolRail, { top: insets.top + 52 }]}>
            <TouchableOpacity
              style={[styles.railBtn, !muteOriginalAudio && styles.railBtnActive]}
              onPress={() => setMuteOriginalAudio((v) => !v)}
              disabled={uploading}
              accessibilityLabel="Toggle original sound"
            >
              <Ionicons
                name={muteOriginalAudio ? 'volume-mute' : 'volume-high'}
                size={18}
                color="#FFF"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.railBtn, selectedSound && styles.railBtnActive]}
              onPress={() => setShowMusicPicker(true)}
              disabled={uploading}
              accessibilityLabel="Music"
            >
              <Ionicons name="musical-notes" size={18} color="#FFF" />
            </TouchableOpacity>

            {selectedSound && (
              <TouchableOpacity
                style={styles.railBtn}
                onPress={() => void handleRemoveMusic()}
                disabled={uploading}
                accessibilityLabel="Remove music"
              >
                <Ionicons name="trash-outline" size={17} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>

          {selectedSound && (
            <TouchableOpacity
              style={[styles.musicFloater, { top: insets.top + 52 }]}
              onPress={() => setShowMusicPicker(true)}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {selectedSound.cover_url ? (
                <Image
                  source={{ uri: resolveMediaUrl(selectedSound.cover_url) }}
                  style={styles.musicFloaterCover}
                />
              ) : (
                <View style={styles.musicFloaterFallback}>
                  <Ionicons name="musical-note" size={12} color="#FFF" />
                </View>
              )}
              <Text style={styles.musicFloaterText} numberOfLines={1}>
                {selectedSound.title}
              </Text>
            </TouchableOpacity>
          )}

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
            onPress={() => onPost(caption, buildAudioSelection())}
            disabled={uploading}
            activeOpacity={0.85}
            accessibilityLabel="Share reel"
          >
            <LinearGradient
              colors={['#FF2D55', '#FF6B8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.postBtnGradient}
            >
              <Ionicons name="paper-plane" size={17} color="#FFF" />
              <Text style={styles.postBtnText}>Share</Text>
            </LinearGradient>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>

      <MusicPicker
        visible={showMusicPicker}
        token={token}
        selectedId={selectedSound?.id}
        onClose={() => setShowMusicPicker(false)}
        onSelect={handleSoundSelect}
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  durationText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  toolRail: {
    position: 'absolute',
    right: 12,
    zIndex: 15,
    gap: 8,
    alignItems: 'center',
  },
  railBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBtnActive: {
    backgroundColor: 'rgba(255,45,85,0.55)',
  },
  musicFloater: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '58%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 5,
    paddingRight: 10,
    paddingLeft: 5,
    borderRadius: 18,
    zIndex: 14,
  },
  musicFloaterCover: { width: 22, height: 22, borderRadius: 6 },
  musicFloaterFallback: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicFloaterText: { color: '#FFF', fontSize: 11, fontWeight: '600', flexShrink: 1 },
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
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
  },
  captionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  captionLabel: { color: reelStudioColors.textMuted, fontSize: 11, fontWeight: '600' },
  captionCount: { color: reelStudioColors.textSubtle, fontSize: 10, fontWeight: '600' },
  captionInput: {
    color: '#FFF',
    fontSize: 14,
    minHeight: 56,
    maxHeight: 88,
    textAlignVertical: 'top',
    backgroundColor: reelStudioColors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  postBtn: { borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-end', minWidth: 108 },
  postBtnDisabled: { opacity: 0.55 },
  postBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  postBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});