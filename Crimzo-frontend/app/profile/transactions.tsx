import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet } from '../../lib/apiClient';
import { formatInr } from '../../lib/diamondPackages';

type TxCategory = 'deposit' | 'withdraw';
type TxFilter = 'all' | 'deposits' | 'withdrawals';

type Transaction = {
  id: string;
  category: TxCategory;
  type: string;
  direction: 'credit' | 'debit';
  amountInr: number;
  title: string;
  subtitle: string;
  status: string;
  diamonds?: number;
  beans?: number;
  payoutDisplay?: string | null;
  scheduledCreditDate?: string | null;
  utr?: string | null;
  failureReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

type Summary = {
  totalDeposited: number;
  totalPurchased: number;
  totalWithdrawn: number;
  pendingWithdrawn: number;
};

const FILTERS: { key: TxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'deposits', label: 'Deposits' },
  { key: 'withdrawals', label: 'Withdrawals' },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMonthKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function statusMeta(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: '#1B8A4A', bg: 'rgba(52,199,89,0.12)' };
    case 'pending':
      return { label: 'Pending', color: '#B86E00', bg: 'rgba(255,149,0,0.14)' };
    case 'processing':
      return { label: 'Processing', color: '#0077B6', bg: 'rgba(0,191,255,0.12)' };
    case 'failed':
      return { label: 'Failed', color: '#C41E3A', bg: 'rgba(255,45,85,0.12)' };
    default:
      return { label: status, color: '#666', bg: 'rgba(0,0,0,0.06)' };
  }
}

function txIcon(item: Transaction): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  if (item.category === 'withdraw') {
    return { name: 'arrow-up-circle', color: '#FF9500', bg: 'rgba(255,149,0,0.12)' };
  }
  if (item.type === 'wallet_topup') {
    return { name: 'wallet', color: '#4CD964', bg: 'rgba(76,217,100,0.12)' };
  }
  if (item.type === 'diamond_purchase') {
    return { name: 'diamond', color: '#00BFFF', bg: 'rgba(0,191,255,0.12)' };
  }
  return { name: 'cafe', color: '#FF9500', bg: 'rgba(255,149,0,0.12)' };
}

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const data = await apiGet<{
        success?: boolean;
        transactions?: Transaction[];
        summary?: Summary;
      }>('/api/payments/transactions', token);
      if (data.success) {
        setTransactions(data.transactions || []);
        setSummary(data.summary || null);
      }
    } catch {
      setTransactions([]);
      setSummary(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (filter === 'deposits') {
      return transactions.filter((t) => t.category === 'deposit');
    }
    if (filter === 'withdrawals') {
      return transactions.filter((t) => t.category === 'withdraw');
    }
    return transactions;
  }, [transactions, filter]);

  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    filtered.forEach((tx) => {
      const key = formatMonthKey(tx.createdAt);
      const list = map.get(key) || [];
      list.push(tx);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const renderItem = ({ item }: { item: Transaction }) => {
    const icon = txIcon(item);
    const status = statusMeta(item.status);
    const isCredit = item.direction === 'credit';
    const creditDate = item.scheduledCreditDate
      ? new Date(item.scheduledCreditDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      : null;

    return (
      <View style={s.card}>
        <View style={[s.iconWrap, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={22} color={icon.color} />
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={[s.cardAmount, isCredit ? s.amountCredit : s.amountDebit]}>
              {isCredit ? '+' : '−'}{formatInr(item.amountInr)}
            </Text>
          </View>
          <Text style={s.cardSub} numberOfLines={2}>{item.subtitle}</Text>
          <Text style={s.cardDate}>{formatDateTime(item.createdAt)}</Text>
          <View style={s.cardFooter}>
            <View style={[s.statusPill, { backgroundColor: status.bg }]}>
              <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            {item.category === 'withdraw' && creditDate && item.status === 'pending' ? (
              <Text style={s.creditHint}>Credit on {creditDate}</Text>
            ) : null}
            {item.utr ? (
              <Text style={s.utrText}>UTR: {item.utr}</Text>
            ) : null}
          </View>
          {item.failureReason ? (
            <Text style={s.failText}>{item.failureReason}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Transaction History</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && transactions.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#FF2D55" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={s.sectionLabel}>{title}</Text>
          )}
          ListHeaderComponent={(
            <View>
              {summary ? (
                <View style={s.summaryRow}>
                  <LinearGradient
                    colors={['rgba(76,217,100,0.18)', 'rgba(76,217,100,0.06)']}
                    style={s.summaryCard}
                  >
                    <Ionicons name="arrow-down-circle" size={20} color="#34C759" />
                    <Text style={s.summaryLabel}>Total Added</Text>
                    <Text style={s.summaryVal}>{formatInr(summary.totalDeposited + summary.totalPurchased)}</Text>
                    <Text style={s.summaryHint}>
                      Wallet {formatInr(summary.totalDeposited)} · Purchases {formatInr(summary.totalPurchased)}
                    </Text>
                  </LinearGradient>
                  <LinearGradient
                    colors={['rgba(255,149,0,0.18)', 'rgba(255,149,0,0.06)']}
                    style={s.summaryCard}
                  >
                    <Ionicons name="arrow-up-circle" size={20} color="#FF9500" />
                    <Text style={s.summaryLabel}>Withdrawn</Text>
                    <Text style={s.summaryVal}>{formatInr(summary.totalWithdrawn)}</Text>
                    {summary.pendingWithdrawn > 0 ? (
                      <Text style={s.summaryHint}>Pending {formatInr(summary.pendingWithdrawn)}</Text>
                    ) : (
                      <Text style={s.summaryHint}>Completed payouts</Text>
                    )}
                  </LinearGradient>
                </View>
              ) : null}

              <View style={s.filterRow}>
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[s.filterChip, active && s.filterChipOn]}
                      onPress={() => setFilter(f.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.filterText, active && s.filterTextOn]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={56} color="#CCC" />
              <Text style={s.emptyTitle}>No transactions yet</Text>
              <Text style={s.emptySub}>
                Wallet top-ups, purchases, and withdrawals will appear here.
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          stickySectionHeadersEnabled={false}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#FF2D55"
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#F5F5F7',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#1A1A1A', fontSize: 18, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 14 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    gap: 4,
  },
  summaryLabel: { color: '#666', fontSize: 11, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryVal: { color: '#1A1A1A', fontSize: 18, fontWeight: '900' },
  summaryHint: { color: '#888', fontSize: 10, fontWeight: '600', marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  filterChipOn: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  filterText: { color: '#666', fontSize: 13, fontWeight: '700' },
  filterTextOn: { color: '#FFF' },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', flex: 1 },
  cardAmount: { fontSize: 15, fontWeight: '900' },
  amountCredit: { color: '#34C759' },
  amountDebit: { color: '#FF9500' },
  cardSub: { color: '#666', fontSize: 12, marginTop: 4, lineHeight: 17 },
  cardDate: { color: '#999', fontSize: 11, marginTop: 6, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  creditHint: { color: '#B86E00', fontSize: 10, fontWeight: '700' },
  utrText: { color: '#888', fontSize: 10, fontWeight: '600' },
  failText: { color: '#C41E3A', fontSize: 11, marginTop: 6, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { color: '#1A1A1A', fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});