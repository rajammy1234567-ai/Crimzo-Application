import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  levelNumber: number;
  name: string;
  badgeColor?: string;
  compact?: boolean;
};

export default function LevelBadge({
  levelNumber,
  name,
  badgeColor = '#FF2D55',
  compact = false,
}: Props) {
  return (
    <View style={[s.badge, compact && s.badgeCompact, { borderColor: `${badgeColor}55`, backgroundColor: `${badgeColor}22` }]}>
      <Ionicons name="shield" size={compact ? 10 : 12} color={badgeColor} />
      <Text style={[s.text, compact && s.textCompact, { color: badgeColor }]}>
        L{levelNumber} · {name}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  textCompact: {
    fontSize: 9,
  },
});