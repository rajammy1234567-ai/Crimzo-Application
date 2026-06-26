import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, Easing, StyleSheet } from 'react-native';

type PulsingAvatarProps = {
  name: string;
  avatar?: string | null;
  size?: number;
  pulse?: boolean;
  ringCount?: number;
  ringColor?: string;
};

function ExpandingRing({
  size,
  delayMs,
  color,
}: {
  size: number;
  delayMs: number;
  color: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delayMs]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

export default function PulsingAvatar({
  name,
  avatar,
  size = 140,
  pulse = true,
  ringCount = 3,
  ringColor = 'rgba(255, 45, 85, 0.55)',
}: PulsingAvatarProps) {
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <View style={[styles.wrap, { width: size * 1.9, height: size * 1.9 }]}>
      {pulse
        ? Array.from({ length: ringCount }, (_, index) => (
            <ExpandingRing
              key={index}
              size={size}
              delayMs={index * 520}
              color={ringColor}
            />
          ))
        : null}
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.initial, { fontSize: size * 0.34 }]}>{initial}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  avatar: {
    backgroundColor: 'rgba(255,45,85,0.18)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 2,
  },
  initial: {
    color: '#FFF',
    fontWeight: '800',
  },
});