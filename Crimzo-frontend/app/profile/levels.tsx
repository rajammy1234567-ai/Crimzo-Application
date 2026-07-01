import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet, apiPost } from '../../lib/apiClient';
import { appAlert } from '../../lib/appAlert';
import { DiamondIcon } from '../../lib/currencyIcons';
import LevelShowcaseRoom, { type ShowcaseLevel } from '../../components/levels/LevelShowcaseRoom';
import LevelBadge from '../../components/levels/LevelBadge';
import { hasShowcaseModel, resolveShowcaseModelAsset } from '../../lib/levelShowcaseModels';
import CarShowroomViewer from '../../components/levels/CarShowroomViewer';

type LevelRow = ShowcaseLevel & {
  description: string;
  price_diamonds: number;
  showcase_model_key?: string | null;
  can_purchase: boolean;
  is_next: boolean;
  locked: boolean;
  is_default: boolean;
};

export default function LevelsScreen() {
  const { token, user, updateUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [equippedLevel, setEquippedLevel] = useState(1);
  const [userLevel, setUserLevel] = useState(1);
  const [diamonds, setDiamonds] = useState(0);
  const [nextLevel, setNextLevel] = useState(2);

  const nextLevelData = levels.find((l) => l.is_next);
  const nextModelAsset = nextLevelData ? resolveShowcaseModelAsset(nextLevelData) : null;

  const fetchLevels = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiGet<{
        success?: boolean;
        levels?: LevelRow[];
        equipped_level?: number;
        user_level?: number;
        diamonds?: number;
        next_level?: number;
      }>('/api/user/levels', token);
      if (res.success) {
        setLevels(res.levels || []);
        setEquippedLevel(res.equipped_level || 1);
        setUserLevel(res.user_level || 1);
        setDiamonds(res.diamonds ?? user?.diamonds ?? 0);
        setNextLevel(res.next_level || (res.user_level || 1) + 1);
      }
    } catch (e) {
      console.error('Fetch levels error:', e);
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) {
        appAlert(
          'Levels API not found',
          'Backend par levels route deploy nahi hai. Local test: .env mein PC LAN IP (http://192.168.1.x:5001) set karo, backend restart karo (npm start), phir expo start --clear.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user?.diamonds]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchLevels();
    }, [fetchLevels]),
  );

  const handlePurchase = async (level: LevelRow) => {
    if (!token || purchasing) return;
    if (!level.can_purchase) {
      appAlert('Locked', `Pehle Level ${nextLevel} unlock karo.`);
      return;
    }
    if (diamonds < level.price_diamonds) {
      appAlert(
        'Insufficient Diamonds',
        `Level ${level.level_number} ke liye ${level.price_diamonds.toLocaleString('en-IN')} diamonds chahiye.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Diamonds', onPress: () => router.push('/(tabs)/gifts' as any) },
        ],
      );
      return;
    }

    setPurchasing(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        error?: string;
        diamonds?: number;
        user_level?: number;
        equipped_level?: number;
        message?: string;
      }>(`/api/user/levels/${level.level_number}/purchase`, {}, token);
      if (res.success) {
        if (typeof res.diamonds === 'number') {
          setDiamonds(res.diamonds);
          updateUser({ diamonds: res.diamonds, user_level: res.user_level, equipped_level: res.equipped_level });
        }
        appAlert('Level Unlocked! 🎉', res.message || `${level.name} unlocked!`);
        await fetchLevels();
      } else {
        appAlert('Failed', res.error || 'Purchase failed');
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Purchase failed';
      appAlert('Failed', msg);
    } finally {
      setPurchasing(false);
    }
  };

  const handleEquip = async (levelNumber: number) => {
    if (!token) return;
    try {
      const res = await apiPost<{ success?: boolean; equipped_level?: number }>(
        '/api/user/levels/equip',
        { level_number: levelNumber },
        token,
      );
      if (res.success) {
        setEquippedLevel(res.equipped_level || levelNumber);
        updateUser({ equipped_level: res.equipped_level || levelNumber });
        await fetchLevels();
      }
    } catch (e) {
      console.error('Equip level error:', e);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Levels & Garage</Text>
        <View style={s.diamondPill}>
          <DiamondIcon size={12} />
          <Text style={s.diamondText}>{diamonds.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color="#FF2D55" />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchLevels(); }} tintColor="#FF2D55" />}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View style={s.heroMeta}>
            <LevelBadge levelNumber={userLevel} name={levels.find((l) => l.level_number === userLevel)?.name || 'Rookie'} badgeColor={levels.find((l) => l.level_number === equippedLevel)?.badge_color} />
            <Text style={s.heroSub}>Next unlock: Level {nextLevel}</Text>
          </View>

          {nextLevelData && nextModelAsset && !nextLevelData.owned ? (
            <View style={s.previewBlock}>
              <Text style={s.previewTitle}>Next unlock preview · L{nextLevelData.level_number}</Text>
              <Text style={s.previewSub}>{nextLevelData.name} — buy to add to your garage</Text>
              <View style={s.previewFrame}>
                <CarShowroomViewer
                  key={`preview-${nextLevelData.level_number}`}
                  modelAsset={nextModelAsset}
                  height={220}
                  autoRotate
                />
              </View>
            </View>
          ) : null}

          <LevelShowcaseRoom
            items={levels}
            equippedLevel={equippedLevel}
            onEquip={handleEquip}
          />

          <Text style={s.sectionTitle}>Level Ladder</Text>
          <Text style={s.sectionSub}>Sequential unlock · diamonds se kharido</Text>

          {levels.map((level) => {
            const status = level.owned
              ? 'owned'
              : level.can_purchase
                ? 'buy'
                : level.locked
                  ? 'locked'
                  : 'default';

            return (
              <View key={level.level_number} style={[s.levelCard, status === 'owned' && s.levelCardOwned]}>
                <View style={s.levelLeft}>
                  <View style={[s.levelIcon, { backgroundColor: `${level.badge_color}22`, borderColor: `${level.badge_color}44` }]}>
                    <Text style={s.levelEmoji}>{level.showcase_emoji}</Text>
                  </View>
                  <View style={s.levelInfo}>
                    <View style={s.levelNameRow}>
                      <Text style={s.levelName}>L{level.level_number} · {level.name}</Text>
                      {hasShowcaseModel(level) ? (
                        <View style={s.modelPill}><Text style={s.modelPillText}>3D</Text></View>
                      ) : null}
                      {level.owned ? (
                        <View style={s.ownedPill}><Text style={s.ownedText}>OWNED</Text></View>
                      ) : null}
                    </View>
                    <Text style={s.levelDesc} numberOfLines={2}>{level.description}</Text>
                    <View style={s.priceRow}>
                      <DiamondIcon size={11} />
                      <Text style={s.priceText}>
                        {level.is_default ? 'Free' : level.price_diamonds.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </View>

                {status === 'buy' ? (
                  <TouchableOpacity
                    style={s.buyBtn}
                    onPress={() => void handlePurchase(level)}
                    disabled={purchasing}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#FF2D55', '#FF6B8A']} style={s.buyGrad}>
                      <Text style={s.buyText}>{purchasing ? '...' : 'Buy'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : status === 'locked' ? (
                  <View style={s.lockPill}>
                    <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.35)" />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  diamondPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,191,255,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,191,255,0.25)',
  },
  diamondText: { color: '#00BFFF', fontSize: 12, fontWeight: '800' },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroMeta: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  heroSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' },
  previewBlock: { marginHorizontal: 14, marginBottom: 12 },
  previewTitle: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  previewSub: { color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2, marginBottom: 8 },
  previewFrame: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', paddingHorizontal: 16, marginTop: 8 },
  sectionSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, paddingHorizontal: 16, marginBottom: 10 },
  levelCard: {
    marginHorizontal: 14, marginBottom: 10, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  levelCardOwned: { borderColor: 'rgba(255,215,0,0.2)', backgroundColor: 'rgba(255,215,0,0.04)' },
  levelLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  levelIcon: {
    width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  levelEmoji: { fontSize: 26 },
  levelInfo: { flex: 1 },
  levelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelName: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  modelPill: { backgroundColor: 'rgba(0,191,255,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modelPillText: { color: '#00BFFF', fontSize: 8, fontWeight: '900' },
  ownedPill: { backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  ownedText: { color: '#FFD700', fontSize: 8, fontWeight: '900' },
  levelDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  priceText: { color: '#00BFFF', fontSize: 11, fontWeight: '700' },
  buyBtn: { marginLeft: 8 },
  buyGrad: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  buyText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  lockPill: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});