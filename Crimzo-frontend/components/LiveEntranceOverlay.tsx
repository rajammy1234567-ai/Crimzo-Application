import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { subscribe, publish } from '../lib/realtimeSync';
import { playGiftSplashSound } from '../lib/uiSounds';

const { width: SW, height: SH } = Dimensions.get('window');

export type LiveEntrancePayload = {
  id: string;
  username: string;
  level: number;
  name: string; // level name e.g. Driver
  emoji: string;
  badge_color: string;
  showcase_type?: string;
};

const ENTRANCE_EVENT = 'live_entrance_effect';

export function publishLiveEntrance(payload: Omit<LiveEntrancePayload, 'id'> & { id?: string }) {
  publish(ENTRANCE_EVENT, {
    id: payload.id || `entrance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: payload.username || 'Viewer',
    level: payload.level || 3,
    name: payload.name || 'Driver',
    emoji: payload.emoji || '🚗',
    badge_color: payload.badge_color || '#3B82F6',
    showcase_type: payload.showcase_type,
  } satisfies LiveEntrancePayload);
}

export function subscribeLiveEntrance(cb: (p: LiveEntrancePayload) => void) {
  return subscribe(ENTRANCE_EVENT, (raw: any) => {
    if (raw && raw.username && raw.emoji) cb(raw as LiveEntrancePayload);
  });
}

/** Fast horizontal flying car entrance — like Chamet style, full speed zoom across live screen */
function FlyingCar({ data, onDone }: { data: LiveEntrancePayload; onDone: () => void }) {
  const isCar = (data.showcase_type || '').includes('car') || data.level >= 3;
  const emoji = data.emoji || (isCar ? '🚗' : '🏍️');
  const accent = data.badge_color || '#3B82F6';

  // Main car translate (left to right at insane speed)
  const carX = useRef(new Animated.Value(-SW * 1.2)).current;
  // Slight bob and scale pulse for "speed"
  const carScale = useRef(new Animated.Value(0.6)).current;
  const carRot = useRef(new Animated.Value(-8)).current; // slight tilt

  // Trail ghosts (faster fade behind)
  const trail1X = useRef(new Animated.Value(-SW * 1.4)).current;
  const trail2X = useRef(new Animated.Value(-SW * 1.6)).current;
  const trail3X = useRef(new Animated.Value(-SW * 1.8)).current;

  // Speed lines (horizontal dashes rushing)
  const linesOpacity = useRef(new Animated.Value(0)).current;
  const linesShift = useRef(new Animated.Value(0)).current;

  // Label pop + fade
  const labelY = useRef(new Animated.Value(40)).current;
  const labelOp = useRef(new Animated.Value(0)).current;

  // Screen flash on entry
  const flash = useRef(new Animated.Value(0)).current;

  const duration = 720; // super fast like "ek dm speed"

  useEffect(() => {
    // Rev engine / whoosh feel via gift sound (high value)
    try { playGiftSplashSound('received', 500); } catch {}

    const carAnim = Animated.parallel([
      // Flash entry
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.55, duration: 80, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),

      // Main car — enters fast from left, exits right
      Animated.timing(carX, {
        toValue: SW * 1.35,
        duration,
        easing: Easing.out(Easing.cubic), // accelerates then eases a bit
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(carScale, { toValue: 1.18, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(carScale, { toValue: 0.92, duration: duration - 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(carRot, { toValue: 4, duration: 220, useNativeDriver: true }),
        Animated.timing(carRot, { toValue: -2, duration: duration - 300, useNativeDriver: true }),
      ]),

      // Trails lag behind
      Animated.timing(trail1X, { toValue: SW * 1.1, duration: duration + 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(trail2X, { toValue: SW * 0.95, duration: duration + 140, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(trail3X, { toValue: SW * 0.7, duration: duration + 210, easing: Easing.out(Easing.cubic), useNativeDriver: true }),

      // Speed lines rush
      Animated.sequence([
        Animated.timing(linesOpacity, { toValue: 0.85, duration: 90, useNativeDriver: true }),
        Animated.timing(linesShift, { toValue: 1, duration: duration - 40, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(linesOpacity, { toValue: 0, duration: 110, useNativeDriver: true }),
      ]),

      // Bottom label slides up then fades
      Animated.sequence([
        Animated.parallel([
          Animated.timing(labelOp, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.spring(labelY, { toValue: 0, tension: 80, friction: 7, useNativeDriver: true }),
        ]),
        Animated.delay(420),
        Animated.timing(labelOp, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
    ]);

    carAnim.start(({ finished }) => {
      if (finished) onDone();
    });

    // Safety timeout
    const safety = setTimeout(onDone, duration + 650);
    return () => clearTimeout(safety);
  }, [carX, carScale, carRot, trail1X, trail2X, trail3X, linesOpacity, linesShift, labelY, labelOp, flash, onDone, duration]);

  const rot = carRot.interpolate({ inputRange: [-12, 12], outputRange: ['-12deg', '12deg'] });
  const trailRot = '-3deg';

  const lineItems = Array.from({ length: 7 }).map((_, i) => i);

  return (
    <View style={styles.layer} pointerEvents="none">
      {/* Bright entry flash */}
      <Animated.View
        style={[
          styles.flash,
          { opacity: flash, backgroundColor: accent },
        ]}
      />

      {/* Speed lines layer */}
      <Animated.View style={[styles.linesLayer, { opacity: linesOpacity }]}> 
        {lineItems.map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.speedLine,
              {
                top: 80 + i * 52,
                width: 120 + (i % 3) * 70,
                transform: [
                  {
                    translateX: linesShift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SW * 0.6 + i * 30, SW * 0.9],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Trail 3 (farthest back) */}
      <Animated.View
        style={[
          styles.trail,
          {
            transform: [
              { translateX: trail3X },
              { translateY: 12 },
              { rotate: trailRot },
              { scale: 0.72 },
            ],
            opacity: 0.18,
          },
        ]}
      >
        <Text style={[styles.carEmoji, { fontSize: 92, color: '#fff' }]}>{emoji}</Text>
      </Animated.View>

      {/* Trail 2 */}
      <Animated.View
        style={[
          styles.trail,
          {
            transform: [
              { translateX: trail2X },
              { translateY: -4 },
              { rotate: trailRot },
              { scale: 0.82 },
            ],
            opacity: 0.28,
          },
        ]}
      >
        <Text style={[styles.carEmoji, { fontSize: 104 }]}>{emoji}</Text>
      </Animated.View>

      {/* Trail 1 */}
      <Animated.View
        style={[
          styles.trail,
          {
            transform: [
              { translateX: trail1X },
              { translateY: 6 },
              { rotate: trailRot },
              { scale: 0.94 },
            ],
            opacity: 0.42,
          },
        ]}
      >
        <Text style={[styles.carEmoji, { fontSize: 116 }]}>{emoji}</Text>
      </Animated.View>

      {/* MAIN CAR — super prominent and fast */}
      <Animated.View
        style={[
          styles.carWrap,
          {
            transform: [
              { translateX: carX },
              { translateY: -10 },
              { scale: carScale },
              { rotate: rot },
            ],
          },
        ]}
      >
        {/* Glow ring behind car */}
        <LinearGradient
          colors={[accent + '55', 'transparent', accent + '22']}
          style={styles.glow}
          start={{ x: 0.2, y: 0.3 }}
          end={{ x: 0.8, y: 0.7 }}
        />
        <Text style={[styles.carEmoji, { fontSize: 138, textShadowColor: accent + '88' }]}>{emoji}</Text>
        {/* Afterburner flames */}
        <View style={[styles.flame, { backgroundColor: accent }]} />
        <View style={[styles.flame, { backgroundColor: '#fff', width: 18, left: -34 }]} />
      </Animated.View>

      {/* Bottom status label — "L3 DRIVER • @username entered" */}
      <Animated.View
        style={[
          styles.labelWrap,
          {
            opacity: labelOp,
            transform: [{ translateY: labelY }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.55)']}
          style={styles.labelBg}
        >
          <View style={[styles.levelDot, { backgroundColor: accent }]} />
          <Text style={styles.levelNum}>L{data.level}</Text>
          <Text style={[styles.levelName, { color: accent }]}>{data.name.toUpperCase()}</Text>
          <Text style={styles.labelSep}>•</Text>
          <Ionicons name="car-sport" size={14} color="#fff" />
          <Text style={styles.username}>@{data.username}</Text>
          <Text style={styles.entered}> entered</Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default function LiveEntranceOverlay() {
  const queueRef = useRef<LiveEntrancePayload[]>([]);
  const playingRef = useRef(false);
  const [current, setCurrent] = useState<LiveEntrancePayload | null>(null);

  const playNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      playingRef.current = false;
      setCurrent(null);
      return;
    }
    playingRef.current = true;
    setCurrent(next);
  }, []);

  const enqueue = useCallback((payload: LiveEntrancePayload) => {
    // dedupe rapid same user entrances
    if (queueRef.current.some((p) => p.username === payload.username && Math.abs(Date.now() - Number(payload.id?.split('_')[1] || 0)) < 4000)) return;

    queueRef.current.push(payload);
    if (!playingRef.current) playNext();
  }, [playNext]);

  useEffect(() => subscribeLiveEntrance(enqueue), [enqueue]);

  if (!current) return null;

  return (
    <FlyingCar
      key={current.id}
      data={current}
      onDone={playNext}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
  },
  linesLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  speedLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  trail: {
    position: 'absolute',
    top: SH * 0.38,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carWrap: {
    position: 'absolute',
    top: SH * 0.34,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // give it breathing room
  },
  carEmoji: {
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 18,
    textShadowColor: 'rgba(0,0,0,0.65)',
  },
  glow: {
    position: 'absolute',
    width: 210,
    height: 110,
    borderRadius: 80,
  },
  flame: {
    position: 'absolute',
    left: -48,
    top: 52,
    width: 34,
    height: 9,
    borderRadius: 20,
    opacity: 0.9,
  },
  labelWrap: {
    position: 'absolute',
    bottom: 92,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 380,
    alignItems: 'center',
  },
  labelBg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  levelNum: { color: '#fff', fontSize: 13, fontWeight: '900' },
  levelName: { fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  labelSep: { color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  username: { color: '#fff', fontSize: 13, fontWeight: '800' },
  entered: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
});
