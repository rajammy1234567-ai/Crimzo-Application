import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions,
  TouchableOpacity, FlatList, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../../lib/apiClient';
import { hasShowcaseModel, resolveShowcaseModelAsset } from '../../lib/levelShowcaseModels';
import CarShowroomViewer from './CarShowroomViewer';

const { width: SW } = Dimensions.get('window');
const SHOWROOM_HEIGHT = 260;

export type ShowcaseLevel = {
  level_number: number;
  name: string;
  showcase_emoji: string;
  showcase_image_url?: string | null;
  showcase_model_key?: string | null;
  showcase_type: string;
  badge_color: string;
  owned: boolean;
  equipped: boolean;
};

type Props = {
  items: ShowcaseLevel[];
  equippedLevel: number;
  onEquip?: (levelNumber: number) => void;
};

function EmojiShowcase({ item }: { item: ShowcaseLevel }) {
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    floatLoop.start();
    return () => {
      spinLoop.stop();
      floatLoop.stop();
    };
  }, [spin, float]);

  const rotateY = spin.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '18deg', '0deg', '-18deg', '0deg'],
  });
  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const imageUri = item.showcase_image_url ? resolveMediaUrl(item.showcase_image_url) : null;

  return (
    <View style={s.pedestalWrap}>
      <Animated.View style={[s.itemStage, { transform: [{ perspective: 800 }, { rotateY }, { translateY }] }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.showcaseImage} resizeMode="contain" />
        ) : (
          <Text style={s.showcaseEmoji}>{item.showcase_emoji}</Text>
        )}
      </Animated.View>
      <LinearGradient
        colors={[`${item.badge_color}55`, `${item.badge_color}00`]}
        style={s.pedestalGlow}
      />
      <View style={s.pedestal}>
        <LinearGradient colors={['#2a2a38', '#14141c']} style={s.pedestalTop} />
      </View>
    </View>
  );
}

function LevelShowcaseStage({ item }: { item: ShowcaseLevel }) {
  const modelAsset = resolveShowcaseModelAsset(item);
  if (modelAsset != null) {
    return (
      <View style={s.showroomFrame}>
        <CarShowroomViewer
          key={`${item.level_number}-${item.showcase_model_key || item.showcase_type}`}
          modelAsset={modelAsset}
          height={SHOWROOM_HEIGHT}
          autoRotate
        />
      </View>
    );
  }
  return <EmojiShowcase item={item} />;
}

export default function LevelShowcaseRoom({ items, equippedLevel, onEquip }: Props) {
  const owned = items.filter((i) => i.owned);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const idx = owned.findIndex((i) => i.level_number === equippedLevel);
    if (idx >= 0) setActiveIndex(idx);
  }, [equippedLevel, owned.length]);

  if (!owned.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>No showcase items yet</Text>
      </View>
    );
  }

  const active = owned[activeIndex] || owned[0];
  const has3d = hasShowcaseModel(active);

  return (
    <View style={s.room}>
      <LinearGradient colors={['#0a0a12', '#151525', '#0d0d18']} style={s.roomBg}>
        <View style={s.spotlight} />
        <Text style={s.roomTitle}>LEVEL SHOWROOM</Text>
        <Text style={s.roomSub}>
          {has3d ? 'Drag to rotate · auto-spin when idle' : 'Your collection · tap Equip for profile'}
        </Text>

        <LevelShowcaseStage item={active} />

        <View style={s.activeMeta}>
          <Text style={[s.activeName, { color: active.badge_color }]}>{active.name}</Text>
          <Text style={s.activeType}>
            {active.showcase_model_key ? active.showcase_model_key.replace(/_/g, ' ').toUpperCase() : active.showcase_type.toUpperCase()}
          </Text>
        </View>

        {!active.equipped && onEquip ? (
          <TouchableOpacity style={s.equipBtn} onPress={() => onEquip(active.level_number)} activeOpacity={0.85}>
            <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.equipGrad}>
              <Ionicons name="checkmark-circle" size={16} color="#FFF" />
              <Text style={s.equipText}>Equip on Profile</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={s.equippedPill}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={s.equippedText}>Equipped on profile</Text>
          </View>
        )}

        <FlatList
          horizontal
          data={owned}
          keyExtractor={(i) => String(i.level_number)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.thumbRow}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[s.thumb, index === activeIndex && s.thumbActive, { borderColor: item.badge_color }]}
              onPress={() => setActiveIndex(index)}
              activeOpacity={0.8}
            >
              {hasShowcaseModel(item) ? (
                <Ionicons name="car-sport" size={18} color={item.badge_color} />
              ) : (
                <Text style={s.thumbEmoji}>{item.showcase_emoji}</Text>
              )}
              <Text style={s.thumbLabel}>L{item.level_number}</Text>
            </TouchableOpacity>
          )}
        />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  room: { marginHorizontal: 14, marginBottom: 16, borderRadius: 20, overflow: 'hidden' },
  roomBg: { paddingTop: 18, paddingBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  spotlight: {
    position: 'absolute', top: -40, width: SW * 0.7, height: 160, borderRadius: 999,
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  roomTitle: { color: '#FFF', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  roomSub: { color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 4, marginBottom: 10, textAlign: 'center', paddingHorizontal: 20 },
  showroomFrame: {
    width: SW - 56,
    marginHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pedestalWrap: { alignItems: 'center', height: 170, justifyContent: 'flex-end' },
  itemStage: { alignItems: 'center', justifyContent: 'center', height: 120, width: 160 },
  showcaseEmoji: { fontSize: 72, textShadowColor: 'rgba(255,149,0,0.5)', textShadowRadius: 16 },
  showcaseImage: { width: 140, height: 100 },
  pedestalGlow: { width: 120, height: 24, borderRadius: 60, marginTop: -8 },
  pedestal: { alignItems: 'center' },
  pedestalTop: { width: 100, height: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  activeMeta: { alignItems: 'center', marginTop: 10 },
  activeName: { fontSize: 18, fontWeight: '900' },
  activeType: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  equipBtn: { marginTop: 10 },
  equipGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  equipText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  equippedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10,
    backgroundColor: 'rgba(255,215,0,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)',
  },
  equippedText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
  thumbRow: { paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  thumb: {
    width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  thumbActive: { backgroundColor: 'rgba(255,45,85,0.15)' },
  thumbEmoji: { fontSize: 22 },
  thumbLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '800', marginTop: 1 },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },
});