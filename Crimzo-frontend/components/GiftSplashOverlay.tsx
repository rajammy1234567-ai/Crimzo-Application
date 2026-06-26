import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { playGiftPop } from '../lib/uiSounds';

const { width: SW } = Dimensions.get('window');

function resolveIcon(name?: string): keyof typeof Ionicons.glyphMap {
  const raw = name || 'gift';
  return (raw in Ionicons.glyphMap ? raw : 'gift') as keyof typeof Ionicons.glyphMap;
}

function SplashCard({ gift, onDone }: { gift: GiftSplashPayload; onDone: () => void }) {
  const tier = giftSplashTier(gift.gift_diamonds);
  const iconSize = tier === 'mega' ? 96 : tier === 'premium' ? 80 : 68;
  const holdMs = tier === 'mega' ? 3200 : tier === 'premium' ? 2800 : 2400;

  const flash = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(40)).current;

  const bg = gift.bg_color || '#FF2D55';
  const iconColor = gift.icon_color || '#FFF';
  const iconName = resolveIcon(gift.icon_name);

  useEffect(() => {
    playGiftPop();

    Animated.parallel([
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.35, duration: 120, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
        Animated.delay(holdMs),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.35, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
          Animated.timing(slideY, { toValue: -80, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 0, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.35, duration: 900, useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        ]),
        { iterations: Math.ceil(holdMs / 900) + 1 },
      ),
      Animated.sequence([
        Animated.timing(ringOpacity, { toValue: 0.55, duration: 200, useNativeDriver: true }),
        Animated.delay(holdMs),
        Animated.timing(ringOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [gift.id, holdMs, flash, scale, opacity, ringScale, ringOpacity, slideY, onDone]);

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[styles.flash, { opacity: flash }]} />

      <Animated.View
        style={[
          styles.cardWrap,
          {
            opacity,
            transform: [{ scale }, { translateY: slideY }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.ring,
            { borderColor: bg + '55', transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.ringOuter,
            { borderColor: bg + '30', transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />

        <LinearGradient
          colors={['rgba(8,8,16,0.92)', 'rgba(20,12,28,0.96)']}
          style={styles.card}
        >
          <Text style={styles.kicker}>GIFT RECEIVED</Text>

          <LinearGradient
            colors={[bg, bg + 'CC']}
            style={[styles.iconOrb, { width: iconSize + 28, height: iconSize + 28, borderRadius: (iconSize + 28) / 2 }]}
          >
            {gift.emoji ? (
              <Text style={{ fontSize: iconSize * 0.55 }}>{gift.emoji}</Text>
            ) : (
              <Ionicons name={iconName} size={iconSize * 0.45} color={iconColor} />
            )}
          </LinearGradient>

          <Text style={styles.giftName} numberOfLines={1}>{gift.stickerName}</Text>

          <View style={styles.senderRow}>
            <Text style={styles.senderLabel}>from</Text>
            <Text style={styles.senderName} numberOfLines={1}>@{gift.username}</Text>
          </View>

          {gift.gift_diamonds ? (
            <View style={styles.diamondPill}>
              <Ionicons name="diamond" size={14} color="#00BFFF" />
              <Text style={styles.diamondText}>{gift.gift_diamonds.toLocaleString('en-IN')} diamonds</Text>
            </View>
          ) : null}
        </LinearGradient>
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
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD700',
  },
  cardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: SW,
    paddingHorizontal: 28,
  },
  ring: {
    position: 'absolute',
    width: Math.min(SW * 0.78, 300),
    height: Math.min(SW * 0.78, 300),
    borderRadius: Math.min(SW * 0.78, 300) / 2,
    borderWidth: 3,
  },
  ringOuter: {
    position: 'absolute',
    width: Math.min(SW * 0.92, 340),
    height: Math.min(SW * 0.92, 340),
    borderRadius: Math.min(SW * 0.92, 340) / 2,
    borderWidth: 2,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 20,
  },
  kicker: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 16,
  },
  iconOrb: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  giftName: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    maxWidth: '100%',
  },
  senderLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '600',
  },
  senderName: {
    color: '#FF6B8A',
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  diamondPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,191,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,191,255,0.25)',
  },
  diamondText: {
    color: '#7DD3FC',
    fontSize: 13,
    fontWeight: '800',
  },
});