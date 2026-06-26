import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  giftSplashTier,
  subscribeGiftSplash,
  type GiftSplashPayload,
} from '../lib/giftSplash';
import { playGiftSplashSound } from '../lib/uiSounds';

const { width: SW, height: SH } = Dimensions.get('window');

const CONFETTI_COLORS = ['#FFD700', '#FF2D55', '#00BFFF', '#AF52DE', '#4ADE80', '#FF9500'];

function resolveIcon(name?: string): keyof typeof Ionicons.glyphMap {
  const raw = name || 'gift';
  return (raw in Ionicons.glyphMap ? raw : 'gift') as keyof typeof Ionicons.glyphMap;
}

function ConfettiBurst({ active, accent }: { active: boolean; accent: string }) {
  const particles = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      id: i,
      color: i % 3 === 0 ? accent : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      angle: (i / 28) * Math.PI * 2,
      dist: 80 + (i % 5) * 28,
      size: 5 + (i % 4) * 2,
      delay: (i % 6) * 30,
    })),
    [accent],
  );

  if (!active) return null;

  return (
    <View style={styles.confettiLayer} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} {...p} />
      ))}
    </View>
  );
}

function ConfettiParticle({
  color,
  angle,
  dist,
  size,
  delay,
}: {
  color: string;
  angle: number;
  dist: number;
  size: number;
  delay: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] });
  const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist - 40] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1.2, 0.4] });

  return (
    <Animated.View
      style={[
        styles.confettiDot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateX: tx }, { translateY: ty }, { scale }],
        },
      ]}
    />
  );
}

function SplashCard({ gift, onDone }: { gift: GiftSplashPayload; onDone: () => void }) {
  const tier = giftSplashTier(gift.gift_diamonds);
  const isSent = gift.variant === 'sent';
  const iconSize = tier === 'legend' ? 220 : tier === 'mega' ? 180 : tier === 'premium' ? 140 : 110;
  const holdMs = tier === 'legend' ? 4500 : tier === 'mega' ? 4000 : tier === 'premium' ? 3200 : 2800;

  const scrim = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.05)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.4)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(60)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  const bg = gift.bg_color || '#FF2D55';
  const iconColor = gift.icon_color || '#FFF';
  const iconName = resolveIcon(gift.icon_name);

  useEffect(() => {
    playGiftSplashSound(isSent ? 'sent' : 'received', gift.gift_diamonds);

    Animated.parallel([
      Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(flash, { toValue: tier === 'legend' || tier === 'mega' ? 0.65 : 0.4, duration: 100, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, tension: 55, friction: 6, useNativeDriver: true }),
        Animated.delay(holdMs),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.5, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
          Animated.timing(slideY, { toValue: -100, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(scrim, { toValue: 0, duration: 420, useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.45, duration: 850, useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 0.8, duration: 850, useNativeDriver: true }),
        ]),
        { iterations: Math.ceil(holdMs / 850) + 1 },
      ),
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 0.7, duration: 220, useNativeDriver: true }),
        Animated.delay(holdMs),
        Animated.timing(ringOpacity, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
        { iterations: Math.ceil(holdMs / 700) + 1 },
      ),
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [gift.id, holdMs, tier, isSent, gift.gift_diamonds, scrim, flash, scale, opacity, ringScale, ringOpacity, slideY, shake, glowPulse, onDone]);

  const shakeX = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  const kicker = isSent ? 'GIFT SENT' : 'GIFT RECEIVED';
  const actionLine = isSent
    ? `to @${gift.username}`
    : `from @${gift.username}`;

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[styles.scrim, { opacity: scrim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.72] }) }]} />
      <Animated.View style={[styles.flash, { opacity: flash }]} />
      <ConfettiBurst active accent={bg} />

      <Animated.View
        style={[
          styles.cardWrap,
          {
            opacity,
            transform: [{ scale }, { translateY: slideY }, { translateX: shakeX }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.ring,
            { borderColor: bg + '66', transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.ringOuter,
            { borderColor: bg + '35', transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />

        <View style={[styles.card, tier === 'legend' && styles.cardLegend]}>
          <LinearGradient
            colors={[bg + '35', 'transparent']}
            style={styles.cardGlow}
          />

          <Text style={[styles.kicker, { color: isSent ? '#7DD3FC' : '#FFD700' }]}>{kicker}</Text>

          <Animated.View style={{ transform: [{ scale: glowScale }] }}>
            <LinearGradient
              colors={[bg, bg + 'CC', bg + '88']}
              style={[styles.iconOrb, {
                width: iconSize + (tier === 'legend' ? 60 : 48),
                height: iconSize + (tier === 'legend' ? 60 : 48),
                borderRadius: (iconSize + (tier === 'legend' ? 60 : 48)) / 2,
              }]}
            >
              {gift.emoji ? (
                <Text style={{ fontSize: iconSize * 0.55 }}>{gift.emoji}</Text>
              ) : (
                <Ionicons name={iconName} size={iconSize * 0.5} color={iconColor} />
              )}
            </LinearGradient>
          </Animated.View>

          <Text style={[styles.giftName, tier === 'legend' && styles.giftNameLegend]} numberOfLines={2}>{gift.stickerName}</Text>

          <View style={styles.senderRow}>
            <Ionicons name={isSent ? 'paper-plane' : 'heart'} size={14} color={isSent ? '#7DD3FC' : '#FF6B8A'} />
            <Text style={styles.senderName} numberOfLines={1}>{actionLine}</Text>
          </View>

          {gift.gift_diamonds ? (
            <View style={styles.diamondPill}>
              <Ionicons name="diamond" size={16} color="#00BFFF" />
              <Text style={styles.diamondText}>{gift.gift_diamonds.toLocaleString('en-IN')} diamonds</Text>
            </View>
          ) : null}

          {tier === 'legend' ? (
            <View style={styles.legendBadge}>
              <Ionicons name="diamond" size={14} color="#FFD700" />
              <Text style={styles.legendText}>LEGENDARY GIFT</Text>
            </View>
          ) : tier === 'mega' ? (
            <View style={styles.megaBadge}>
              <Ionicons name="flash" size={12} color="#FFD700" />
              <Text style={styles.megaText}>MEGA GIFT</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export default function GiftSplashOverlay() {
  const queueRef = useRef<GiftSplashPayload[]>([]);
  const playingRef = useRef(false);
  const [current, setCurrent] = useState<GiftSplashPayload | null>(null);

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

  const recentIdsRef = useRef<Set<string>>(new Set());

  const enqueue = useCallback((payload: GiftSplashPayload) => {
    if (recentIdsRef.current.has(payload.id)) return;
    recentIdsRef.current.add(payload.id);
    setTimeout(() => recentIdsRef.current.delete(payload.id), 5000);

    queueRef.current.push(payload);
    if (!playingRef.current) playNext();
  }, [playNext]);

  useEffect(() => subscribeGiftSplash(enqueue), [enqueue]);

  if (!current) return null;

  return (
    <SplashCard
      key={current.id}
      gift={current}
      onDone={playNext}
    />
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    opacity: 0.82,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD700',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiDot: {
    position: 'absolute',
  },
  cardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: SW,
    paddingHorizontal: 24,
  },
  ring: {
    position: 'absolute',
    width: Math.min(SW * 0.85, 320),
    height: Math.min(SW * 0.85, 320),
    borderRadius: Math.min(SW * 0.85, 320) / 2,
    borderWidth: 3,
  },
  ringOuter: {
    position: 'absolute',
    width: Math.min(SW * 0.98, 360),
    height: Math.min(SW * 0.98, 360),
    borderRadius: Math.min(SW * 0.98, 360) / 2,
    borderWidth: 2,
  },
  card: {
    width: '100%',
    maxWidth: SW * 0.92,
    borderRadius: 36,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  cardLegend: {
    maxWidth: SW,
  },
  cardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SH * 0.18,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 18,
  },
  iconOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  giftName: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  giftNameLegend: {
    fontSize: 38,
    lineHeight: 44,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    maxWidth: '100%',
  },
  senderName: {
    color: '#FF6B8A',
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  diamondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,191,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,191,255,0.3)',
  },
  diamondText: {
    color: '#7DD3FC',
    fontSize: 15,
    fontWeight: '800',
  },
  megaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  megaText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: 'rgba(255,45,85,0.2)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.5)',
  },
  legendText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
});