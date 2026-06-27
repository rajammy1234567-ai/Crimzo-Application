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
import type { ReelSound } from '../../lib/reelTypes';

type Props = {
  insets: { top: number; bottom: number };
  recording: boolean;
  recordSeconds: number;
  recordProgress: Animated.Value;
  selectedSound: ReelSound | null;
  torchOn: boolean;
  canUseTorch: boolean;
  canFlipCamera: boolean;
  onClose: () => void;
  onFlipCamera: () => void;
  onToggleTorch: () => void;
  onOpenMusic: () => void;
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
  recording,
  recordSeconds,
  recordProgress,
  selectedSound,
  torchOn,
  canUseTorch,
  canFlipCamera,
  onClose,
  onFlipCamera,
  onToggleTorch,
  onOpenMusic,
  onOpenGallery,
  onRecordPress,
  galleryDisabled,
  recordDisabled,
}: Props) {
  const remaining = Math.max(0, REEL_MAX_DURATION_SEC - recordSeconds);

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
            <Text style={styles.headerSub}>Up to {REEL_MAX_DURATION_SEC}s · 9:16</Text>
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

      {/* Music selector */}
      <TouchableOpacity
        style={[styles.musicPill, { top: insets.top + 72 }]}
        onPress={onOpenMusic}
        activeOpacity={0.85}
      >
        <View style={styles.musicIconWrap}>
          <Ionicons name="musical-notes" size={15} color="#FFF" />
        </View>
        <Text style={styles.musicPillText} numberOfLines={1}>
          {selectedSound ? `${selectedSound.title} · ${selectedSound.artist}` : 'Add music'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>

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
            style={[styles.recordOuter, recording && styles.recordOuterActive]}
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
            {recording ? `Tap to stop · ${formatReelTime(remaining)} left` : 'Tap to record'}
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
    borderRadius: 26,
    maxWidth: '88%',
    zIndex: 15,
  },
  musicIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicPillText: { flex: 1, color: '#FFF', fontSize: 13, fontWeight: '600' },
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