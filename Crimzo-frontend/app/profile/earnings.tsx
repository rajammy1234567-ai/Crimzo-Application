import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../contexts/AuthContext';
import { apiGet, resolveMediaUrl } from '../../lib/apiClient';


type CallRecord = {
  id: string;
  type: 'live_talk' | 'video_call' | 'gift';
  with_username: string;
  with_avatar: string | null;
  duration_mins: number | null;
  diamonds_earned: number;
  date: string;
  sticker_name?: string;
  icon_name?: string;
  icon_color?: string;
  bg_color?: string;
};

export default function EarningsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [dailyDiamonds, setDailyDiamonds] = useState(0);
  const [monthlyDiamonds, setMonthlyDiamonds] = useState(0);
  const [totalDiamonds, setTotalDiamonds] = useState(0);
  const [records, setRecords] = useState<CallRecord[]>([]);

  const fetchEarnings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGet<{
        success: boolean;
        daily_diamonds: number;
        monthly_diamonds: number;
        total_diamonds: number;
        call_records: CallRecord[];
      }>('/api/earnings/summary', token);

      if (data.success) {
        setDailyDiamonds(data.daily_diamonds || 0);
        setMonthlyDiamonds(data.monthly_diamonds || 0);
        setTotalDiamonds(data.total_diamonds || 0);
        setRecords(data.call_records || []);
      }
    } catch (e) {
      console.error('Fetch earnings error:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const renderRecord = ({ item }: { item: CallRecord }) => {
    const avatarUri = item.with_avatar ? resolveMediaUrl(item.with_avatar) : null;
    const isGift = item.type === 'gift';
    const d = new Date(item.date);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let title = '';
    let subtitle = '';

    if (isGift) {
      title = `Gift from ${item.with_username}`;
      subtitle = item.sticker_name || 'Gift';
    } else {
      title = `${item.type === 'video_call' ? 'Video' : 'Live'} Call with ${item.with_username}`;
      subtitle = `${item.duration_mins} min${item.duration_mins === 1 ? '' : 's'}`;
    }

    return (
      <View style={s.recordCard}>
        <View style={s.recordLeft}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarPlaceholder]}>
              <Ionicons name="person" size={18} color="#999" />
            </View>
          )}
          <View style={s.recordInfo}>
            <Text style={s.recordTitle}>{title}</Text>
            <View style={s.recordSubRow}>
              <Text style={s.recordSubText}>{subtitle}</Text>
              <Text style={s.recordDot}>•</Text>
              <Text style={s.recordDate}>{dateStr}</Text>
            </View>
          </View>
        </View>

        <View style={s.recordRight}>
          <Text style={s.earnAmount}>+{item.diamonds_earned}</Text>
          <Ionicons name="diamond" size={14} color="#00BFFF" />
        </View>
      </View>
    );
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.title}>Earning Session</Text>
        <View style={s.headerRight} />
      </View>

      {/* ── Summary Cards ── */}
      <View style={s.summaryContainer}>
        <LinearGradient colors={['rgba(255,45,85,0.15)', 'rgba(255,107,138,0.05)']} style={s.summaryCardLarge}>
          <Text style={s.summaryLabel}>Total Diamonds Balance</Text>
          <View style={s.summaryRow}>
            <Ionicons name="diamond" size={24} color="#00BFFF" />
            <Text style={s.summaryValueLarge}>{totalDiamonds.toLocaleString()}</Text>
          </View>
        </LinearGradient>

        <View style={s.summarySplit}>
          <View style={s.summaryCardSmall}>
            <Text style={s.summaryLabel}>Today's Earnings</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryValueSmall}>+{dailyDiamonds.toLocaleString()}</Text>
              <Ionicons name="diamond" size={14} color="#00BFFF" />
            </View>
          </View>
          <View style={s.summaryCardSmall}>
            <Text style={s.summaryLabel}>This Month</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryValueSmall}>+{monthlyDiamonds.toLocaleString()}</Text>
              <Ionicons name="diamond" size={14} color="#00BFFF" />
            </View>
          </View>
        </View>
      </View>

      {/* ── History List ── */}
      <View style={s.listContainer}>
        <Text style={s.sectionTitle}>Recent Sessions</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#FF2D55" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={renderRecord}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Ionicons name="receipt-outline" size={48} color="#555" />
                <Text style={s.emptyText}>No earnings recorded yet.</Text>
                <Text style={s.emptySub}>Calls and gifts you receive will appear here.</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backBtn: { padding: 8 },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: { width: 44 },
  
  summaryContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 12,
  },
  summaryCardLarge: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.2)',
    alignItems: 'center',
  },
  summarySplit: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCardSmall: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  summaryValueLarge: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '800',
  },
  summaryValueSmall: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },

  listContainer: {
    flex: 1,
    backgroundColor: '#12121f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  recordLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInfo: {
    flex: 1,
  },
  recordTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  recordSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordSubText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '600',
  },
  recordDot: {
    color: 'rgba(255,255,255,0.3)',
    marginHorizontal: 6,
  },
  recordDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  recordRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  earnAmount: {
    color: '#FF2D55',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginTop: 8,
  },
});
