import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useFocusEffect } from 'expo-router';
import { apiGet, apiPost } from '../../lib/apiClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Task {
  key: string;
  title: string;
  reward: number;
  rewardType?: 'beans' | 'diamonds';
  maxCount: number;
  currentCount: number;
  actionType?: string;
  deepLink?: string;
}

type AppTimeStats = {
  total_minutes?: number;
  required_minutes?: number;
  progress_percent?: number;
  requirement_met?: boolean;
  remaining_minutes?: number;
  breakdown?: Record<string, number>;
};

export default function TasksScreen() {
  const { user, token, updateUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'tasks' | 'rewards'>('tasks');
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [dailyCountdown, setDailyCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [pendingReward, setPendingReward] = useState(0);
  const [pendingDiamonds, setPendingDiamonds] = useState(0);
  const [appTime, setAppTime] = useState<AppTimeStats | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [newbieTasks, setNewbieTasks] = useState<Task[]>([]);
  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [monthlyTasks, setMonthlyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const updateCountdowns = () => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(24, 0, 0, 0);
    const dayDiff = endOfDay.getTime() - now.getTime();
    const dayH = Math.floor(dayDiff / 3600000);
    const dayM = Math.floor((dayDiff % 3600000) / 60000);
    const dayS = Math.floor((dayDiff % 60000) / 1000);
    setDailyCountdown({ hours: dayH, minutes: dayM, seconds: dayS });

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthDiff = endOfMonth.getTime() - now.getTime();
    const days = Math.floor(monthDiff / 86400000);
    const monthH = Math.floor((monthDiff % 86400000) / 3600000);
    const monthM = Math.floor((monthDiff % 3600000) / 60000);
    const monthS = Math.floor((monthDiff % 60000) / 1000);
    setCountdown({ days, hours: monthH, minutes: monthM, seconds: monthS });
  };

  const fetchTasks = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [data, timeData] = await Promise.all([
        apiGet<{
          success?: boolean;
          pendingReward?: number;
          pendingDiamonds?: number;
          checkedInToday?: boolean;
          sections?: { newbie?: Task[]; daily?: Task[]; monthly?: Task[] };
        }>('/api/tasks', token),
        apiGet<AppTimeStats & { success?: boolean }>('/api/user/app-time/today', token).catch(() => null),
      ]);
      if (data.success) {
        setPendingReward(data.pendingReward || 0);
        setPendingDiamonds(data.pendingDiamonds || 0);
        setCheckedIn(!!data.checkedInToday);
        setNewbieTasks(data.sections?.newbie || []);
        setDailyTasks(data.sections?.daily || []);
        setMonthlyTasks(data.sections?.monthly || []);
      }
      if (timeData && (timeData as { success?: boolean }).success) {
        setAppTime(timeData);
      }
    } catch (e) {
      console.error('Fetch tasks error:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
      updateCountdowns();
    }, [fetchTasks]),
  );

  useEffect(() => {
    const timer = setInterval(updateCountdowns, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (h: number, m: number, s: number) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleCheckIn = async () => {
    if (!token || checkedIn) return;
    try {
      const res = await apiPost<{ success?: boolean; added?: number; pendingReward?: number }>(
        '/api/tasks/checkin',
        {},
        token,
      );
      if (res.success) {
        setCheckedIn(true);
        setPendingReward(res.pendingReward || pendingReward + 50);
        Alert.alert('Check In', `You earned ${res.added || 50} beans!`);
      }
    } catch (e) {
      Alert.alert('Error', 'Check-in failed');
    }
  };

  const handleGetReward = async () => {
    if (!token || pendingReward <= 0) return;
    try {
      const res = await apiPost<{
        success?: boolean;
        claimed?: number;
        claimedDiamonds?: number;
        beans?: number;
        diamonds?: number;
      }>(
        '/api/tasks/claim',
        {},
        token,
      );
      if (res.success) {
        const parts = [];
        if (res.claimed) parts.push(`${res.claimed} beans`);
        if (res.claimedDiamonds) parts.push(`${res.claimedDiamonds} diamonds`);
        Alert.alert('Reward Claimed!', parts.length ? `You received ${parts.join(' + ')}!` : 'Nothing to claim');
        setPendingReward(0);
        setPendingDiamonds(0);
        if (res.beans != null || res.diamonds != null) {
          updateUser({
            ...user,
            beans: res.beans ?? user?.beans,
            diamonds: res.diamonds ?? user?.diamonds,
          } as any);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not claim reward');
    }
  };

  const handleTaskGo = async (task: Task) => {
    const route = task.deepLink;
    if (route) {
      router.push(route as any);
      return;
    }
    if (task.actionType === 'manual') {
      try {
        await apiPost('/api/tasks/complete', { taskKey: task.key }, token);
        fetchTasks();
      } catch (e: any) {
        Alert.alert('Task', e?.message || 'Complete the required action first');
      }
    } else {
      Alert.alert('Task', 'Complete this task by doing the action in the app.');
    }
  };

  const getTotalPossibleReward = (tasks: Task[]) => {
    return tasks.reduce((sum, task) => sum + task.reward * task.maxCount, 0);
  };

  const getTotalCurrentReward = (tasks: Task[]) => {
    return tasks.reduce((sum, task) => sum + task.reward * task.currentCount, 0);
  };

  const renderTaskItem = (task: Task, showMultiplier: boolean = true) => (
    <View key={task.key} style={styles.taskItem}>
      <View style={styles.taskInfo}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <View style={styles.taskRewardRow}>
          <Text style={styles.coinIcon}>{task.rewardType === 'diamonds' ? '💎' : '🪙'}</Text>
          <Text style={styles.taskReward}>{task.reward}</Text>
          {showMultiplier && <Text style={styles.taskMultiplier}>x{task.maxCount}</Text>}
        </View>
      </View>
      <View style={styles.taskRight}>
        <TouchableOpacity style={styles.goBtn} onPress={() => handleTaskGo(task)}>
          <Text style={styles.goBtnText}>Go</Text>
        </TouchableOpacity>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(task.currentCount / task.maxCount) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{task.currentCount}/{task.maxCount}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Header with Gradient */}
      <LinearGradient
        colors={['#FFB6C1', '#FFD1DC', '#FFEEF2']}
        style={styles.headerGradient}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'tasks' && styles.activeTab]}
              onPress={() => setActiveTab('tasks')}
            >
              <Text style={[styles.tabText, activeTab === 'tasks' && styles.activeTabText]}>Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'rewards' && styles.activeTab]}
              onPress={() => setActiveTab('rewards')}
            >
              <Text style={[styles.tabText, activeTab === 'rewards' && styles.activeTabText]}>Rewards</Text>
            </TouchableOpacity>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.giftBox}>
            <Text style={styles.giftEmoji}>🎁</Text>
          </View>
          <View style={styles.mascot}>
            <Text style={styles.mascotEmoji}>👾</Text>
          </View>
        </View>

        {/* Countdown */}
        <Text style={styles.countdownLabel}>Monthly End Countdown</Text>
        <Text style={styles.countdownValue}>{countdown.days}Day(s) {formatCountdown(countdown.hours, countdown.minutes, countdown.seconds)}</Text>

        {/* Reward Bar */}
        <View style={styles.rewardBar}>
          <View style={styles.rewardLeft}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.rewardCount}>
              🪙{pendingReward}{pendingDiamonds > 0 ? ` · 💎${pendingDiamonds}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.getRewardBtn} onPress={handleGetReward}>
            <Text style={styles.getRewardText}>Get Reward</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'rewards' ? (
          <View style={styles.rewardsPanel}>
            <Text style={styles.rewardsTitle}>Pending Rewards</Text>
            <Text style={styles.rewardsAmount}>
              {pendingReward > 0 ? `🪙 ${pendingReward}` : ''}
              {pendingReward > 0 && pendingDiamonds > 0 ? '  ' : ''}
              {pendingDiamonds > 0 ? `💎 ${pendingDiamonds}` : ''}
              {pendingReward <= 0 && pendingDiamonds <= 0 ? '—' : ''}
            </Text>
            <Text style={styles.rewardsHint}>Complete tasks to earn beans and diamonds.</Text>
            <TouchableOpacity
              style={[styles.getRewardBtn, pendingReward <= 0 && pendingDiamonds <= 0 && { opacity: 0.5 }]}
              onPress={handleGetReward}
              disabled={pendingReward <= 0 && pendingDiamonds <= 0}
            >
              <Text style={styles.getRewardText}>Claim to Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.walletLinkBtn} onPress={() => router.push('/profile/wallet' as any)}>
              <Text style={styles.walletLinkText}>Open Wallet</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activeTab === 'tasks' && (
        <>
        {appTime && (
          <View style={styles.appTimeCard}>
            <View style={styles.appTimeHeader}>
              <Ionicons name="time-outline" size={18} color="#9333EA" />
              <Text style={styles.appTimeTitle}>Daily Stream Requirement</Text>
            </View>
            <Text style={styles.appTimeSub}>
              Spend 1 hour/day on the app to go live · {appTime.total_minutes || 0}/60 min
            </Text>
            <View style={styles.appTimeTrack}>
              <View style={[styles.appTimeFill, { width: `${appTime.progress_percent || 0}%` }]} />
            </View>
            {appTime.requirement_met ? (
              <Text style={styles.appTimeDone}>✓ Requirement met — you can go live today</Text>
            ) : (
              <Text style={styles.appTimePending}>
                {appTime.remaining_minutes || 60} min left · use Home, Reels, Live, Messages, PK
              </Text>
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionItem, checkedIn && styles.quickActionCompleted]}
            onPress={handleCheckIn}
          >
            {checkedIn && <Ionicons name="checkmark-circle" size={16} color="#9333EA" style={styles.checkIcon} />}
            <Text style={[styles.quickActionLabel, checkedIn && styles.quickActionLabelCompleted]}>Check in</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.coinIconSmall}>🪙</Text>
              <Text style={styles.quickActionValue}>+50</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/profile' as any)}>
            <Text style={styles.quickActionLabel}>Invitation</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.coinIconSmall}>🪙</Text>
              <Text style={styles.quickActionValue}>200</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/reels' as any)}>
            <Text style={styles.quickActionLabel}>Video</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.diamondIcon}>💎</Text>
              <Text style={styles.quickActionValue}>Free</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/profile/wallet' as any)}>
            <Text style={styles.quickActionLabel}>Diamonds</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.diamondIcon}>💎</Text>
              <Text style={styles.quickActionValue}>Free</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Newbie Tasks */}
        <View style={styles.taskSection}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.taskSectionTitle}>Newbie Tasks</Text>
            <Text style={styles.taskSectionProgress}>
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(newbieTasks)}/{getTotalPossibleReward(newbieTasks)})
            </Text>
          </View>
          {newbieTasks.map(task => renderTaskItem(task))}
        </View>

        {/* Daily Tasks */}
        <View style={styles.taskSection}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.taskSectionTitle}>Daily Tasks</Text>
            <Text style={styles.taskSectionProgress}>
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(dailyTasks)}/{getTotalPossibleReward(dailyTasks)})
            </Text>
          </View>
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={14} color="#999" />
            <Text style={styles.timerText}>
              {formatCountdown(dailyCountdown.hours, dailyCountdown.minutes, dailyCountdown.seconds)}
            </Text>
          </View>
          {dailyTasks.map(task => renderTaskItem(task))}
        </View>

        {/* Monthly Tasks */}
        <View style={styles.taskSection}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.taskSectionTitle}>Monthly Tasks</Text>
            <Text style={styles.taskSectionProgress}>
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(monthlyTasks)}/{getTotalPossibleReward(monthlyTasks)})
            </Text>
          </View>
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={14} color="#999" />
            <Text style={styles.timerText}>
              {countdown.days}Day(s) {formatCountdown(countdown.hours, countdown.minutes, countdown.seconds)}
            </Text>
          </View>
          {monthlyTasks.map(task => renderTaskItem(task))}
        </View>

        <View style={{ height: 40 }} />
        </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerGradient: {
    paddingTop: 44,
    paddingBottom: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20,
    padding: 4,
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 16,
  },
  activeTab: {
    backgroundColor: '#9333EA',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFF',
  },
  heroBanner: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  giftBox: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255,200,100,0.8)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftEmoji: {
    fontSize: 40,
  },
  mascot: {
    position: 'absolute',
    right: 60,
    top: 10,
  },
  mascotEmoji: {
    fontSize: 50,
  },
  countdownLabel: {
    textAlign: 'center',
    color: '#9333EA',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  countdownValue: {
    textAlign: 'center',
    color: '#9333EA',
    fontSize: 13,
    opacity: 0.8,
  },
  rewardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  rewardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coinIcon: {
    fontSize: 20,
  },
  rewardCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  getRewardBtn: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
  getRewardText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  appTimeCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.2)',
  },
  appTimeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  appTimeTitle: { color: '#333', fontSize: 15, fontWeight: '700' },
  appTimeSub: { color: '#666', fontSize: 13, marginBottom: 10 },
  appTimeTrack: {
    height: 8,
    backgroundColor: '#F0E6FF',
    borderRadius: 4,
    overflow: 'hidden',
  },
  appTimeFill: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 4,
  },
  appTimeDone: { color: '#30D158', fontSize: 12, fontWeight: '600', marginTop: 8 },
  appTimePending: { color: '#888', fontSize: 12, marginTop: 8 },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 16,
    gap: 8,
  },
  quickActionItem: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.1)',
  },
  quickActionCompleted: {
    backgroundColor: 'rgba(147,51,234,0.05)',
    borderColor: 'rgba(147,51,234,0.3)',
  },
  checkIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  quickActionLabel: {
    color: '#9333EA',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  quickActionLabelCompleted: {
    color: '#999',
  },
  quickActionReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  coinIconSmall: {
    fontSize: 14,
  },
  diamondIcon: {
    fontSize: 14,
  },
  quickActionValue: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '700',
  },
  taskSection: {
    backgroundColor: '#FFF',
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.1)',
  },
  taskSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskSectionTitle: {
    color: '#9333EA',
    fontSize: 18,
    fontWeight: '700',
  },
  taskSectionProgress: {
    color: '#999',
    fontSize: 14,
    marginLeft: 8,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  timerText: {
    color: '#999',
    fontSize: 13,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    color: '#1A1A1A',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  taskRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  taskReward: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '600',
  },
  taskMultiplier: {
    color: '#999',
    fontSize: 12,
  },
  taskRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  goBtn: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 16,
  },
  goBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBar: {
    width: 60,
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 2,
  },
  progressText: {
    color: '#999',
    fontSize: 11,
  },
  rewardsPanel: {
    margin: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  rewardsTitle: { color: '#9333EA', fontSize: 18, fontWeight: '700' },
  rewardsAmount: { color: '#1A1A1A', fontSize: 36, fontWeight: '800' },
  rewardsHint: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  walletLinkBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  walletLinkText: { color: '#9333EA', fontSize: 14, fontWeight: '600' },
});
