import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
        style={[styles.chip, mode === 'music_first' && styles.chipActive]}
        onPress={() => onChange('music_first')}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Ionicons
          name="musical-notes"
          size={15}
          color={mode === 'music_first' ? '#FFF' : reelStudioColors.textMuted}
        />
        <Text style={[styles.chipText, mode === 'music_first' && styles.chipTextActive]}>
          Music First
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chip, mode === 'video_first' && styles.chipActive]}
        onPress={() => onChange('video_first')}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Ionicons
          name="videocam"
          size={15}
          color={mode === 'video_first' ? '#FFF' : reelStudioColors.textMuted}
        />
        <Text style={[styles.chipText, mode === 'video_first' && styles.chipTextActive]}>
          Video First
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  chipActive: {
    backgroundColor: reelStudioColors.primary,
  },
  chipText: {
    color: reelStudioColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#FFF',
  },
});