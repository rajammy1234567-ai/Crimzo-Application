import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { subscribe, publish } from '../lib/realtimeSync';

const { width: SW } = Dimensions.get('window');

const JOIN_EVENT = 'live_user_joined_splash';

export interface JoinPayload {
  id: string;
  username: string;
  avatar?: string | null;
}

export function publishJoinNotification(username: string, avatar?: string | null) {
  publish(JOIN_EVENT, {
    id: `join_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username,
    avatar,
  });
}

function JoinCard({ payload, onDone }: { payload: JoinPayload; onDone: () => void }) {
  const slideX = useRef(new Animated.Value(-SW)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 600, easing: Easing.out(Easing.elastic(1.2)), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true })
      ]),
      Animated.delay(2000),
      Animated.parallel([
        Animated.timing(slideX, { toValue: SW, duration: 500, easing: Easing.in(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true })
      ])
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [slideX, opacity, scale, onDone]);

  const initial = (payload.username || 'U').charAt(0).toUpperCase();

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View style={[styles.card, { opacity, transform: [{ translateX: slideX }, { scale }] }]}>
        <LinearGradient
          colors={['rgba(255,45,85,0.95)', 'rgba(175,82,222,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {payload.avatar ? (
            <Image source={{ uri: payload.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.textWrap}>
            <Text style={styles.username} numberOfLines={1}>{payload.username}</Text>
            <Text style={styles.action}>joined the live</Text>
          </View>
          <View style={styles.waveWrap}>
            <Text style={styles.waveEmoji}>👋</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default function JoinNotificationOverlay() {
  const queueRef = useRef<JoinPayload[]>([]);
  const playingRef = useRef(false);
  const [current, setCurrent] = useState<JoinPayload | null>(null);

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

  useEffect(() => {
    return subscribe(JOIN_EVENT, (raw) => {
      const data = raw as JoinPayload;
      if (!data?.username) return;
      queueRef.current.push(data);
      if (!playingRef.current) playNext();
    });
  }, [playNext]);

  if (!current) return null;

  return (
    <JoinCard key={current.id} payload={current} onDone={playNext} />
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    zIndex: 9998,
    elevation: 9998,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: SW * 0.85,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#AF52DE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingRight: 24,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarFallback: {
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.8)',
  },
  avatarText: {
    color: '#0D0D14',
    fontSize: 22,
    fontWeight: '900',
  },
  textWrap: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  action: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  waveWrap: {
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveEmoji: {
    fontSize: 18,
  },
});
