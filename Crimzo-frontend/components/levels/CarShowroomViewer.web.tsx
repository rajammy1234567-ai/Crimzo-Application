import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

type Props = {
  emoji?: string;
  label?: string;
  height?: number;
};

/** Web fallback — 3D GL is native-only; emoji pedestal preview on web. */
export default function CarShowroomViewer({ emoji = '🚗', label, height = 220 }: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotateY = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[s.container, { height }]}>
      <Text style={s.hint}>3D showroom · mobile app</Text>
      <Animated.View style={[s.stage, { transform: [{ perspective: 900 }, { rotateY }] }]}>
        <Text style={s.emoji}>{emoji}</Text>
      </Animated.View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.floor} />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    top: 8,
    color: 'rgba(255,255,255,0.25)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  stage: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 72 },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 8, fontWeight: '700' },
  floor: {
    position: 'absolute',
    bottom: 24,
    width: 140,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});