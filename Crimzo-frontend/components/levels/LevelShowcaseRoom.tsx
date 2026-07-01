import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { resolveShowcaseModelAsset, resolveShowcaseModelLabel } from '../../lib/levelShowcaseModels';
import CarShowroomViewer from './CarShowroomViewer';

const { width: SW } = Dimensions.get('window');
const SHOWROOM_HEIGHT = 280;
const STAGE_WIDTH = SW - 56;

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
        <Text style={s.emptyText}>Garage empty — Level 1 free hai, unlock karo</Text>
      </View>
    );
  }

  const active = owned[activeIndex] || owned[0];
  const modelAsset = resolveShowcaseModelAsset(active);
  const modelLabel = resolveShowcaseModelLabel(active);

  return (
    <View style={s.room}>
      <LinearGradient colors={['#0a0a12', '#151525', '#0d0d18']} style={s.roomBg}>
        <Text style={s.roomTitle}>LEVEL GARAGE</Text>
        <Text style={s.roomSub}>{modelLabel} 3D · drag karke rotate karo</Text>

        <View style={s.stageOuter} collapsable={false}>
          {modelAsset != null ? (
            <CarShowroomViewer
              key={`garage-${active.level_number}`}
              modelAsset={modelAsset}
              width={STAGE_WIDTH}
              height={SHOWROOM_HEIGHT}
              autoRotate
            />
          ) : (
            <View style={s.fallbackBox}>
              <Text style={s.fallbackEmoji}>{active.showcase_emoji}</Text>
            </View>
          )}
        </View>

        <View style={s.activeMeta}>
          <Text style={[s.activeName, { color: active.badge_color }]}>{active.name}</Text>
          <Text style={s.activeType}>{modelLabel.toUpperCase()}</Text>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbRow}>
          {owned.map((item, index) => (
            <TouchableOpacity
              key={item.level_number}
              style={[s.thumb, index === activeIndex && s.thumbActive, { borderColor: item.badge_color }]}
              onPress={() => setActiveIndex(index)}
              activeOpacity={0.8}
            >
              <Ionicons name="car-sport" size={18} color={item.badge_color} />
              <Text style={s.thumbLabel}>L{item.level_number}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  room: { marginHorizontal: 14, marginBottom: 16, borderRadius: 20, overflow: 'hidden' },
  roomBg: {
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  roomTitle: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  roomSub: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, marginBottom: 12 },
  stageOuter: {
    width: STAGE_WIDTH,
    height: SHOWROOM_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.25)',
    backgroundColor: '#14141c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 72 },
  activeMeta: { alignItems: 'center', marginTop: 12 },
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
  thumbLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '800', marginTop: 1 },
  empty: { marginHorizontal: 14, padding: 20, alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)' },
  emptyText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center' },
});