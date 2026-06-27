import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reelStudioColors } from './reelStudioTheme';

export type ReelCreateMode = 'music_first' | 'video_first';

type Props = {
  mode: ReelCreateMode;
  disabled?: boolean;
  onChange: (mode: ReelCreateMode) => void;
};

export default function ReelCreateModeBar({ mode, disabled, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.seg, mode === 'music_first' && styles.segActive]}
        onPress={() => onChange('music_first')}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityLabel="Music first"
      >
        <Ionicons
          name="musical-notes"
          size={16}
          color={mode === 'music_first' ? '#FFF' : reelStudioColors.textMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.seg, mode === 'video_first' && styles.segActive]}
        onPress={() => onChange('video_first')}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityLabel="Video first"
      >
        <Ionicons
          name="videocam"
          size={16}
          color={mode === 'video_first' ? '#FFF' : reelStudioColors.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  seg: {
    width: 34,
    height: 30,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    backgroundColor: reelStudioColors.primary,
  },
});