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
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { resolveMediaUrl } from '../../lib/apiClient';
import { KEYBOARD_BEHAVIOR } from '../KeyboardAware';
import MusicPicker from './MusicPicker';
import type { ReelAudioSelection, ReelSound, ReelVideoAsset } from '../../lib/reelTypes';

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
    if (playing) {
      player.play();
    } else {
      player.pause();
    }
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
    if (initialSound) {
      setSelectedSound(initialSound);
    }
  }, [visible, initialSound?.id]);

  useEffect(() => {
    if (!visible || !asset?.uri) return;

    void (async () => {
      await stopMusic();
      if (!selectedSound) return;
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: resolveMediaUrl(selectedSound.audio_url) },
          { shouldPlay: true, isLooping: true, volume: 1 },
        );
        musicRef.current = sound;
      } catch (e) {
        console.error('Editor music error:', e);
      }
    })();

    return () => {
      void stopMusic();
    };
  }, [visible, asset?.uri, selectedSound?.id]);

  if (!visible || !asset?.uri) return null;

  const hasMusic = !!selectedSound;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={uploading} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>New Reel</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowMusicPicker(true)}
            disabled={uploading}
          >
            <Ionicons name="musical-notes" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.videoWrapper}>
          <ReelVideoPreview
            key={asset.uri}
            uri={asset.uri}
            muted={hasMusic}
            playing={!uploading}
          />

          {selectedSound && (
            <TouchableOpacity
              style={styles.musicChip}
              onPress={() => setShowMusicPicker(true)}
              disabled={uploading}
            >
              <Ionicons name="musical-note" size={14} color="#FFF" />
              <Text style={styles.musicChipText} numberOfLines={1}>
                {selectedSound.title} · {selectedSound.artist}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedSound(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {!selectedSound && (
            <TouchableOpacity
              style={styles.addMusicBtn}
              onPress={() => setShowMusicPicker(true)}
              disabled={uploading}
            >
              <Ionicons name="musical-notes" size={18} color="#FFF" />
              <Text style={styles.addMusicText}>Add Music</Text>
            </TouchableOpacity>
          )}

          {uploading && (
            <View style={styles.uploadOverlay}>
              {uploadDone ? (
                <View style={styles.doneBox}>
                  <Ionicons name="checkmark-circle" size={70} color="#4CAF50" />
                  <Text style={styles.doneText}>Posted!</Text>
                </View>
              ) : (
                <View style={styles.progressBox}>
                  <ActivityIndicator size="large" color="#9333EA" />
                  <Text style={styles.progressPct}>{uploadProgress}%</Text>
                  <Text style={styles.progressLabel}>Uploading your reel...</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={styles.bottomBar}>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption...  #hashtag @mention"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
            editable={!uploading}
          />
          <TouchableOpacity
            style={[styles.postBtn, uploading && styles.postBtnDisabled]}
            onPress={() => onPost(caption, selectedSound ? { sound: selectedSound, startMs: 0 } : null)}
            disabled={uploading}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.postBtnText}>Share Reel</Text>
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
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  iconBtn: { width: 40, alignItems: 'center', padding: 4 },
  title: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  videoWrapper: { flex: 1, backgroundColor: '#111' },
  musicChip: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  musicChipText: { flex: 1, color: '#FFF', fontSize: 13, fontWeight: '600' },
  addMusicBtn: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(147,51,234,0.85)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  addMusicText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBox: { alignItems: 'center' },
  doneText: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: 12 },
  progressBox: { alignItems: 'center', gap: 12 },
  progressPct: { color: '#FFF', fontSize: 32, fontWeight: '800' },
  progressLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  bottomBar: {
    backgroundColor: '#0A0A0F',
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  captionInput: {
    color: '#FFF',
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    maxHeight: 96,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9333EA',
    borderRadius: 12,
    paddingVertical: 14,
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});