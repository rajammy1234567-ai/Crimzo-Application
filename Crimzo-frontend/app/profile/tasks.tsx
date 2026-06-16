import React, { useState, useEffect } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Task {
  id: number;
  title: string;
  reward: number;
  maxCount: number;
  currentCount: number;
}

const NEWBIE_TASKS: Task[] = [
  { id: 1, title: 'Enter your nickname', reward: 50, maxCount: 1, currentCount: 0 },
  { id: 2, title: 'Upload Avatar', reward: 50, maxCount: 1, currentCount: 0 },
  { id: 3, title: 'Bind phone number', reward: 100, maxCount: 1, currentCount: 0 },
];

const DAILY_TASKS: Task[] = [
  { id: 1, title: 'Send a message in 1 Live room(s)', reward: 10, maxCount: 5, currentCount: 0 },
  { id: 2, title: 'Like 2 moment(s) of others', reward: 10, maxCount: 5, currentCount: 0 },
  { id: 3, title: 'Random Match for 1 time(s)', reward: 25, maxCount: 2, currentCount: 0 },
  { id: 4, title: 'Watch Live in Live room for 2 min(s)', reward: 10, maxCount: 5, currentCount: 0 },
  { id: 5, title: 'Send gift(s) in message', reward: 50, maxCount: 1, currentCount: 0 },
  { id: 6, title: 'Win 1 time(s) in Top Wheel in Party room (win>spend)', reward: 25, maxCount: 2, currentCount: 0 },
];

const MONTHLY_TASKS: Task[] = [
  { id: 1, title: 'Be followed by 1 girl(s) ≥ level 5', reward: 100, maxCount: 5, currentCount: 0 },
  { id: 2, title: 'Top up for 1 time(s)', reward: 200, maxCount: 5, currentCount: 0 },
  { id: 3, title: 'Invite 1 new user(s) successfully', reward: 200, maxCount: 5, currentCount: 0 },
  { id: 4, title: 'Send 17 Lucky Win', reward: 200, maxCount: 5, currentCount: 0 },
];

export default function TasksScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'tasks' | 'rewards'>('tasks');
  const [countdown, setCountdown] = useState({ days: 29, hours: 6, minutes: 15, seconds: 38 });
  const [dailyCountdown, setDailyCountdown] = useState({ hours: 6, minutes: 15, seconds: 38 });
  const [pendingReward, setPendingReward] = useState(50);
  const [checkedIn, setCheckedIn] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setDailyCountdown(prev => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else if (minutes > 0) {
          minutes--;
          seconds = 59;
        } else if (hours > 0) {
          hours--;
          minutes = 59;
          seconds = 59;
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (h: number, m: number, s: number) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleCheckIn = () => {
    if (!checkedIn) {
      setCheckedIn(true);
      Alert.alert('Check In', 'You earned 50 coins!');
    }
  };

  const handleGetReward = () => {
    if (pendingReward > 0) {
      Alert.alert('Reward Claimed!', `You received ${pendingReward} coins!`);
      setPendingReward(0);
    }
  };

  const handleTaskGo = (task: Task) => {
    Alert.alert('Task', `Complete: ${task.title}\nReward: ${task.reward} × ${task.maxCount}`);
  };

  const getTotalPossibleReward = (tasks: Task[]) => {
    return tasks.reduce((sum, task) => sum + task.reward * task.maxCount, 0);
  };

  const getTotalCurrentReward = (tasks: Task[]) => {
    return tasks.reduce((sum, task) => sum + task.reward * task.currentCount, 0);
  };

  const renderTaskItem = (task: Task, showMultiplier: boolean = true) => (
    <View key={task.id} style={styles.taskItem}>
      <View style={styles.taskInfo}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <View style={styles.taskRewardRow}>
          <Text style={styles.coinIcon}>🪙</Text>
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
            <Text style={styles.rewardCount}>{pendingReward}</Text>
          </View>
          <TouchableOpacity style={styles.getRewardBtn} onPress={handleGetReward}>
            <Text style={styles.getRewardText}>Get Reward</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

          <TouchableOpacity style={styles.quickActionItem}>
            <Text style={styles.quickActionLabel}>Invitation</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.coinIconSmall}>🪙</Text>
              <Text style={styles.quickActionValue}>200</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem}>
            <Text style={styles.quickActionLabel}>Video</Text>
            <View style={styles.quickActionReward}>
              <Text style={styles.diamondIcon}>💎</Text>
              <Text style={styles.quickActionValue}>Free</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionItem}>
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
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(NEWBIE_TASKS)}/{getTotalPossibleReward(NEWBIE_TASKS)})
            </Text>
          </View>
          {NEWBIE_TASKS.map(task => renderTaskItem(task))}
        </View>

        {/* Daily Tasks */}
        <View style={styles.taskSection}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.taskSectionTitle}>Daily Tasks</Text>
            <Text style={styles.taskSectionProgress}>
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(DAILY_TASKS)}/{getTotalPossibleReward(DAILY_TASKS)})
            </Text>
          </View>
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={14} color="#999" />
            <Text style={styles.timerText}>
              {formatCountdown(dailyCountdown.hours, dailyCountdown.minutes, dailyCountdown.seconds)}
            </Text>
          </View>
          {DAILY_TASKS.map(task => renderTaskItem(task))}
        </View>

        {/* Monthly Tasks */}
        <View style={styles.taskSection}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.taskSectionTitle}>Monthly Tasks</Text>
            <Text style={styles.taskSectionProgress}>
              (<Text style={styles.coinIconSmall}>🪙</Text>{getTotalCurrentReward(MONTHLY_TASKS)}/{getTotalPossibleReward(MONTHLY_TASKS)})
            </Text>
          </View>
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={14} color="#999" />
            <Text style={styles.timerText}>
              {countdown.days}Day(s) {formatCountdown(countdown.hours, countdown.minutes, countdown.seconds)}
            </Text>
          </View>
          {MONTHLY_TASKS.map(task => renderTaskItem(task))}
        </View>

        <View style={{ height: 40 }} />
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
});
