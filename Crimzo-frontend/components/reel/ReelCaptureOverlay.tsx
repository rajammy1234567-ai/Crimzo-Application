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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Create Reel</Text>
          {recording ? (
            <View style={styles.recordingPill}>
              <View style={styles.recDot} />
              <Text style={styles.recordingText}>REC {formatReelTime(recordSeconds)}</Text>
            </View>
          ) : (
            <Text style={styles.headerSub}>
              {musicFirst
                ? (selectedSound ? 'Step 2 · Record to song' : 'Step 1 · Pick a song')
                : `Up to ${REEL_MAX_DURATION_SEC}s · 9:16`}
            </Text>
          )}
        </View>

        <View style={styles.headerActions}>
          {canUseTorch && (
            <TouchableOpacity style={styles.headerBtn} onPress={onToggleTorch} activeOpacity={0.8}>
              <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={22} color="#FFF" />
            </TouchableOpacity>
          )}
          {canFlipCamera && (
            <TouchableOpacity style={styles.headerBtn} onPress={onFlipCamera} activeOpacity={0.8}>
              <Ionicons name="camera-reverse" size={22} color="#FFF" />
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

      {/* Mode switch */}
      <View style={[styles.modeBarWrap, { top: insets.top + 68 }]}>
        <ReelCreateModeBar
          mode={creationMode}
          disabled={recording}
          onChange={onModeChange}
        />
      </View>

      {/* Music-first CTA or selected song */}
      {needsMusicFirst ? (
        <TouchableOpacity
          style={[styles.musicFirstCard, { top: insets.top + 118 }]}
          onPress={onOpenMusic}
          activeOpacity={0.9}
        >
          <View style={styles.musicFirstIcon}>
            <Ionicons name="musical-notes" size={28} color="#FFF" />
          </View>
          <Text style={styles.musicFirstTitle}>Choose Music First</Text>
          <Text style={styles.musicFirstSub}>
            Pick a song, then record your reel to the beat
          </Text>
          <View style={styles.musicFirstBtn}>
            <Text style={styles.musicFirstBtnText}>Browse Songs</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.musicPill,
            { top: insets.top + 118 },
            musicReady && styles.musicPillActive,
          ]}
          onPress={onOpenMusic}
          activeOpacity={0.85}
        >
          <View style={[styles.musicIconWrap, musicPlaying && styles.musicIconPlaying]}>
            <Ionicons name={musicPlaying ? 'volume-high' : 'musical-notes'} size={15} color="#FFF" />
          </View>
          <View style={styles.musicPillMeta}>
            <Text style={styles.musicPillLabel}>
              {musicReady ? 'Recording to' : 'Music'}
            </Text>
            <Text style={styles.musicPillText} numberOfLines={1}>
              {selectedSound
                ? `${selectedSound.title} · ${selectedSound.artist}`
                : 'Add music (optional)'}
            </Text>
          </View>
          {selectedSound ? (
            <TouchableOpacity onPress={onClearMusic} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
          )}
        </TouchableOpacity>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.sideAction}
          onPress={onOpenGallery}
          disabled={galleryDisabled}
          activeOpacity={0.8}
        >
          <View style={[styles.sideIcon, galleryDisabled && styles.sideIconDisabled]}>
            <Ionicons name="images" size={24} color="#FFF" />
          </View>
          <Text style={styles.sideLabel}>Gallery</Text>
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
          <Text style={styles.recordHint}>
            {recording
              ? `Tap to stop · ${formatReelTime(remaining)} left`
              : needsMusicFirst
                ? 'Pick music first'
                : musicReady
                  ? 'Record to this song'
                  : 'Tap to record'}
          </Text>
        </View>

        <View style={styles.sideAction}>
          <View style={styles.sideIcon}>
            <Ionicons name="time-outline" size={22} color="#FFF" />
          </View>
          <Text style={styles.sideLabel}>{REEL_MAX_DURATION_SEC}s max</Text>
        </View>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 20,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerCenter: { flex: 1, alignItems: 'center', paddingTop: 4 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { color: reelStudioColors.textMuted, fontSize: 12, marginTop: 3, fontWeight: '500' },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: reelStudioColors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.35)',
  },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: reelStudioColors.primary },
  recordingText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
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
  modeBarWrap: {
    position: 'absolute',
    alignSelf: 'center',
    width: '88%',
    zIndex: 15,
  },
  musicFirstCard: {
    position: 'absolute',
    alignSelf: 'center',
    width: '84%',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: reelStudioColors.primary,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    zIndex: 15,
  },
  musicFirstIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  musicFirstTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  musicFirstSub: {
    color: reelStudioColors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  musicFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: reelStudioColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  musicFirstBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  musicPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: '88%',
    zIndex: 15,
  },
  musicPillActive: {
    borderColor: reelStudioColors.primary,
    backgroundColor: 'rgba(255,45,85,0.12)',
  },
  musicIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicIconPlaying: {
    backgroundColor: reelStudioColors.primary,
  },
  musicPillMeta: { flex: 1 },
  musicPillLabel: {
    color: reelStudioColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  musicPillText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 1 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    zIndex: 20,
  },
  sideAction: { alignItems: 'center', width: 76 },
  sideIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideIconDisabled: { opacity: 0.4 },
  sideLabel: { color: reelStudioColors.textMuted, fontSize: 11, marginTop: 6, fontWeight: '600' },
  recordWrap: { alignItems: 'center', marginBottom: 2 },
  recordOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordOuterActive: { borderColor: reelStudioColors.primary },
  recordOuterDisabled: { opacity: 0.45 },
  recordInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: reelStudioColors.primary,
  },
  recordStop: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: reelStudioColors.primary,
  },
  recordHint: {
    color: reelStudioColors.textMuted,
    fontSize: 11,
    marginTop: 10,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 140,
  },
});