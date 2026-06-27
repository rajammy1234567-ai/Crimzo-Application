import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  reelStudioColors,
  reelFrameWidth,
  reelFrameHeight,
  reelFrameTop,
  REEL_MAX_DURATION_SEC,
  formatReelTime,
} from './reelStudioTheme';
import ReelCreateModeBar, { type ReelCreateMode } from './ReelCreateModeBar';
import type { ReelSound } from '../../lib/reelTypes';

type Props = {
  insets: { top: number; bottom: number };
  creationMode: ReelCreateMode;
  recording: boolean;
  recordSeconds: number;
  recordProgress: Animated.Value;
  selectedSound: ReelSound | null;
  musicPlaying: boolean;
  torchOn: boolean;
  canUseTorch: boolean;
  canFlipCamera: boolean;
  onClose: () => void;
  onModeChange: (mode: ReelCreateMode) => void;
  onFlipCamera: () => void;
  onToggleTorch: () => void;
  onOpenMusic: () => void;
  onClearMusic: () => void;
  onOpenGallery: () => void;
  onRecordPress: () => void;
  galleryDisabled?: boolean;
  recordDisabled?: boolean;
};

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />;
}

export default function ReelCaptureOverlay({
  insets,
  creationMode,
  recording,
  recordSeconds,
  recordProgress,
  selectedSound,
  musicPlaying,
  torchOn,
  canUseTorch,
  canFlipCamera,
  onClose,
  onModeChange,
  onFlipCamera,
  onToggleTorch,
  onOpenMusic,
  onClearMusic,
  onOpenGallery,
  onRecordPress,
  galleryDisabled,
  recordDisabled,
}: Props) {
  const remaining = Math.max(0, REEL_MAX_DURATION_SEC - recordSeconds);
  const musicFirst = creationMode === 'music_first';
  const needsMusicFirst = musicFirst && !selectedSound;
  const musicReady = musicFirst && !!selectedSound;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.72)', 'transparent']}
        style={[styles.topGradient, { height: insets.top + 120 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.bottomGradient, { height: insets.bottom + 200 }]}
        pointerEvents="none"
      />

      {/* 9:16 frame guide */}
      <View
        style={[
          styles.frameGuide,
          {
            top: reelFrameTop,
            width: reelFrameWidth,
            height: reelFrameHeight,
          },
        ]}
        pointerEvents="none"
      >
        <Corner style={styles.cornerTL} />
        <Corner style={styles.cornerTR} />
        <Corner style={styles.cornerBL} />
        <Corner style={styles.cornerBR} />
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>

        {recording ? (
          <View style={styles.recordingPill}>
            <View style={styles.recDot} />
            <Text style={styles.recordingText}>{formatReelTime(recordSeconds)}</Text>
          </View>
        ) : (
          <ReelCreateModeBar
            mode={creationMode}
            disabled={recording}
            onChange={onModeChange}
          />
        )}

        <View style={styles.headerActions}>
          {canUseTorch && (
            <TouchableOpacity style={styles.iconBtn} onPress={onToggleTorch} activeOpacity={0.8}>
              <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={18} color="#FFF" />
            </TouchableOpacity>
          )}
          {canFlipCamera && (
            <TouchableOpacity style={styles.iconBtn} onPress={onFlipCamera} activeOpacity={0.8}>
              <Ionicons name="camera-reverse" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Recording progress */}
      {recording && (
        <View style={[styles.progressTrack, { top: insets.top + 4 }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: recordProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      )}

      {/* Music chip */}
      <TouchableOpacity
        style={[
          styles.musicChip,
          { top: insets.top + 52 },
          needsMusicFirst && styles.musicChipPrompt,
          musicReady && styles.musicChipActive,
        ]}
        onPress={onOpenMusic}
        activeOpacity={0.85}
      >
        <View style={[styles.musicChipIcon, musicPlaying && styles.musicChipIconLive]}>
          <Ionicons
            name={needsMusicFirst ? 'add' : musicPlaying ? 'volume-high' : 'musical-notes'}
            size={14}
            color="#FFF"
          />
        </View>
        <Text style={styles.musicChipText} numberOfLines={1}>
          {needsMusicFirst
            ? 'Add song'
            : selectedSound
              ? selectedSound.title
              : 'Music'}
        </Text>
        {selectedSound ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onClearMusic();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={14} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity
          style={[styles.toolBtn, galleryDisabled && styles.toolBtnDisabled]}
          onPress={onOpenGallery}
          disabled={galleryDisabled}
          activeOpacity={0.8}
          accessibilityLabel="Gallery"
        >
          <Ionicons name="images-outline" size={22} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.recordWrap}>
          <TouchableOpacity
            style={[
              styles.recordOuter,
              recording && styles.recordOuterActive,
              recordDisabled && styles.recordOuterDisabled,
            ]}
            onPress={onRecordPress}
            disabled={recordDisabled}
            activeOpacity={0.9}
          >
            {recording ? (
              <View style={styles.recordStop} />
            ) : (
              <View style={styles.recordInner} />
            )}
          </TouchableOpacity>
          {recording && (
            <Text style={styles.recordTimer}>{formatReelTime(remaining)}</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.toolBtn}
          onPress={onOpenMusic}
          activeOpacity={0.8}
          accessibilityLabel="Music"
        >
          <Ionicons name="musical-notes-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CORNER = 22;
const STROKE = 3;

const styles = StyleSheet.create({
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  frameGuide: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: STROKE,
    borderLeftWidth: STROKE,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: STROKE,
    borderLeftWidth: STROKE,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: STROKE,
    borderRightWidth: STROKE,
    borderBottomRightRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 20,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 6 },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,45,85,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  recordingText: { color: '#FFF', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    zIndex: 30,
  },
  progressFill: {
    height: '100%',
    backgroundColor: reelStudioColors.primary,
    borderRadius: 2,
  },
  musicChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '72%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 15,
  },
  musicChipPrompt: {
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.5)',
    borderStyle: 'dashed',
  },
  musicChipActive: {
    backgroundColor: 'rgba(255,45,85,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.4)',
  },
  musicChipIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicChipIconLive: { backgroundColor: reelStudioColors.primary },
  musicChipText: { color: '#FFF', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    paddingHorizontal: 24,
    zIndex: 20,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnDisabled: { opacity: 0.35 },
  recordWrap: { alignItems: 'center' },
  recordOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordOuterActive: { borderColor: reelStudioColors.primary },
  recordOuterDisabled: { opacity: 0.4 },
  recordInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: reelStudioColors.primary,
  },
  recordStop: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: reelStudioColors.primary,
  },
  recordTimer: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
});