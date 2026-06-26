import React, { useState, useEffect, useCallback } from 'react';
import { appAlert } from '../../lib/appAlert';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { apiGet, apiPost, ApiError } from '../../lib/apiClient';
import { BeanIcon, DiamondIcon, BeanAmount, DiamondAmount } from '../../lib/currencyIcons';
import { buildReferralShareMessage, getReferralSharePayload, shareReferralInvite } from '../../lib/referral';

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
};

type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  checkedInToday: boolean;
  weekDots?: boolean[];
  weekLabels?: string[];
  todaySlot?: number;
  atRisk?: boolean;
  milestoneDays?: number;
  milestoneDiamonds?: number;
  nextMilestoneAt?: number;
  daysToNextMilestone?: number;
  progressInBlock?: number;
};

export default function TasksScreen() {
  const { user, token, updateUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'tasks' | 'rewards'>('tasks');
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [dailyCountdown, setDailyCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [pendingReward, setPendingReward] = useState(0);
  const [pendingDiamonds, setPendingDiamonds] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPossible, setTotalPossible] = useState(0);
  const [appTime, setAppTime] = useState<AppTimeStats | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [newbieTasks, setNewbieTasks] = useState<Task[]>([]);
  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [monthlyTasks, setMonthlyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const hasPending = pendingReward > 0 || pendingDiamonds > 0;

  const updateCountdowns = () => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(24, 0, 0, 0);
    const dayDiff = endOfDay.getTime() - now.getTime();
    setDailyCountdown({
      hours: Math.floor(dayDiff / 3600000),
      minutes: Math.floor((dayDiff % 3600000) / 60000),
      seconds: Math.floor((dayDiff % 60000) / 1000),
    });

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthDiff = endOfMonth.getTime() - now.getTime();
    setCountdown({
      days: Math.floor(monthDiff / 86400000),
      hours: Math.floor((monthDiff % 86400000) / 3600000),
      minutes: Math.floor((monthDiff % 3600000) / 60000),
      seconds: Math.floor((monthDiff % 60000) / 1000),
    });
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
          totalEarned?: number;
          totalPossible?: number;
          streak?: StreakInfo;
          sections?: { newbie?: Task[]; daily?: Task[]; monthly?: Task[] };
        }>('/api/tasks', token),
        apiGet<AppTimeStats & { success?: boolean }>('/api/user/app-time/today', token).catch(() => null),
      ]);

      if (data.success) {
        setPendingReward(data.pendingReward || 0);
        setPendingDiamonds(data.pendingDiamonds || 0);
        setCheckedIn(!!data.checkedInToday);
        setTotalEarned(data.totalEarned || 0);
        setTotalPossible(data.totalPossible || 0);
        setStreak(data.streak || null);
        setNewbieTasks(data.sections?.newbie || []);
        setDailyTasks(data.sections?.daily || []);
        setMonthlyTasks(data.sections?.monthly || []);
      }

      if (timeData && (timeData as { success?: boolean }).success !== false) {
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
      setLoading(true);
      fetchTasks();
      updateCountdowns();
    }, [fetchTasks]),
  );

  useEffect(() => {
    const timer = setInterval(updateCountdowns, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (h: number, m: number, s: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const handleCheckIn = async () => {
    if (!token || checkedIn || checkingIn) return;
    if (appTime && !appTime.requirement_met) {
      appAlert(
        '1 Hour Required',
        `Spend ${appTime.remaining_minutes || 60} more minutes in the app today, then check in to keep your streak.`,
      );
      return;
    }
    setCheckingIn(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        added?: number;
        pendingReward?: number;
        pendingDiamonds?: number;
        streakMilestoneReward?: number;
        alreadyCheckedIn?: boolean;
        streak?: StreakInfo;
      }>('/api/tasks/checkin', {}, token);

      if (res.success) {
        setCheckedIn(true);
        setPendingReward(res.pendingReward ?? pendingReward + (res.added || 50));
        if (typeof res.pendingDiamonds === 'number') {
          setPendingDiamonds(res.pendingDiamonds);
        }
        if (res.streak) {
          setStreak(res.streak);
        } else if (!res.alreadyCheckedIn) {
          setStreak((prev) => {
            if (!prev) return prev;
            const nextStreak = prev.atRisk || prev.currentStreak > 0
              ? prev.currentStreak + 1
              : 1;
            const nextSlot = prev.todaySlot ?? 6;
            const nextDots = [...(prev.weekDots || Array(7).fill(false))];
            nextDots[nextSlot] = true;
            return {
              ...prev,
              currentStreak: nextStreak,
              longestStreak: Math.max(prev.longestStreak, nextStreak),
              checkedInToday: true,
              atRisk: false,
              weekDots: nextDots,
              progressInBlock: nextStreak % (prev.milestoneDays || 30) || (prev.milestoneDays || 30),
            };
          });
        }
        if (!res.alreadyCheckedIn) {
          const milestone = res.streakMilestoneReward || 0;
          if (milestone > 0) {
            appAlert(
              '🎉 30-Day Streak!',
              `+${res.added || 50} beans and ${milestone.toLocaleString()} diamonds from Crimzo! Claim from Rewards.`,
            );
          } else {
            appAlert('Check In', `+${res.added || 50} beans added to pending rewards!`);
          }
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.data?.code === 'STREAK_TIME_REQUIRED') {
        const mins = e.data?.appTime?.remaining_minutes ?? 60;
        appAlert('1 Hour Required', `Spend ${mins} more minutes in the app today before check-in.`);
      } else {
        appAlert('Error', e instanceof ApiError ? e.message : 'Check-in failed');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleGetReward = async () => {
    if (!token || !hasPending || claiming) return;
    setClaiming(true);
    try {
      const res = await apiPost<{
        success?: boolean;
        claimed?: number;
        claimedDiamonds?: number;
        beans?: number;
        diamonds?: number;
      }>('/api/tasks/claim', {}, token);

      if (res.success) {
        const parts: string[] = [];
        if (res.claimed) parts.push(`${res.claimed} beans`);
        if (res.claimedDiamonds) parts.push(`${res.claimedDiamonds} diamonds`);
        appAlert('Reward Claimed!', parts.length ? `You received ${parts.join(' + ')}!` : 'Nothing to claim');
        setPendingReward(0);
        setPendingDiamonds(0);
        if (res.beans != null || res.diamonds != null) {
          updateUser({
            beans: res.beans ?? user?.beans,
            diamonds: res.diamonds ?? user?.diamonds,
            pendingTaskBeans: 0,
          } as Parameters<typeof updateUser>[0]);
        }
      }
    } catch (e) {
      appAlert('Error', e instanceof ApiError ? e.message : 'Could not claim reward');
    } finally {
      setClaiming(false);
    }
  };

  const handleInviteShare = async () => {
    try {
      const shared = await shareReferralInvite(token, user?.crimzo_id);
      if (!shared) {
        appAlert('Invite', 'Your referral ID is loading. Try again in a moment.');
      }
    } catch {
      const payload = await getReferralSharePayload(token, user?.crimzo_id);
      if (payload) {
        appAlert('Invitation', buildReferralShareMessage(payload.code, payload.link));
      } else {
        appAlert('Invite', 'Your referral ID is loading. Try again in a moment.');
      }
    }
  };

  const handleTaskGo = async (task: Task) => {
    const isComplete = task.currentCount >= task.maxCount;
    if (isComplete) return;

    if (task.deepLink) {
      router.push(task.deepLink as never);
      if (task.actionType === 'manual' || task.key.startsWith('newbie_')) {
        try {
          await apiPost('/api/tasks/complete', { taskKey: task.key }, token);
          await fetchTasks();
        } catch (e: unknown) {
          const msg = e instanceof ApiError ? e.message : 'Complete the required action first';
          if (!msg.toLowerCase().includes('complete')) {
            appAlert('Task', msg);
          }
        }
      }
      return;
    }

    if (task.actionType === 'manual') {
      try {
        await apiPost('/api/tasks/complete', { taskKey: task.key }, token);
        await fetchTasks();
      } catch (e: unknown) {
        appAlert('Task', e instanceof ApiError ? e.message : 'Complete the required action first');
      }
    } else {
      appAlert('Task', 'Do the action in the app — progress updates automatically.');
    }
  };

  const sectionReward = (tasks: Task[]) => ({
    earned: tasks.reduce((s, t) => s + t.reward * t.currentCount, 0),
    possible: tasks.reduce((s, t) => s + t.reward * t.maxCount, 0),
  });

  const renderTaskItem = (task: Task) => {
    const isComplete = task.currentCount >= task.maxCount;
    const progress = task.maxCount > 0 ? (task.currentCount / task.maxCount) * 100 : 0;

    return (
      <View key={task.key} style={[styles.taskItem, isComplete && styles.taskItemDone]}>
        <View style={styles.taskInfo}>
          <Text style={[styles.taskTitle, isComplete && styles.taskTitleDone]}>{task.title}</Text>
          <View style={styles.taskRewardRow}>
            {task.rewardType === 'diamonds' ? (
              <DiamondIcon size={14} style={{ marginRight: 2 }} />
            ) : (
              <BeanIcon size={14} style={{ marginRight: 2 }} />
            )}
            <Text style={styles.taskReward}>{task.reward}</Text>
            <Text style={styles.taskMultiplier}>x{task.maxCount}</Text>
          </View>
        </View>
        <View style={styles.taskRight}>
          <TouchableOpacity
            style={[styles.goBtn, isComplete && styles.goBtnDone]}
            onPress={() => handleTaskGo(task)}
            disabled={isComplete}
            activeOpacity={0.85}
          >
            {isComplete ? (
              <Ionicons name="checkmark" size={16} color="#30D158" />
            ) : (
              <Text style={styles.goBtnText}>Go</Text>
            )}
          </TouchableOpacity>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {task.currentCount}/{task.maxCount}
          </Text>
        </View>
      </View>
    );
  };

  const renderTaskSection = (
    title: string,
    tasks: Task[],
    timer?: React.ReactNode,
  ) => {
    const { earned, possible } = sectionReward(tasks);
    return (
      <View style={styles.taskSection}>
        <View style={styles.taskSectionHeader}>
          <Text style={styles.taskSectionTitle}>{title}</Text>
          <View style={[styles.taskSectionProgress, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Text style={styles.taskSectionProgress}>(</Text>
            <BeanIcon size={12} />
            <Text style={styles.taskSectionProgress}>{earned}/{possible})</Text>
          </View>
        </View>
        {timer}
        {tasks.length === 0 ? (
          <Text style={styles.emptySection}>No tasks in this section yet.</Text>
        ) : (
          tasks.map((task) => renderTaskItem(task))
        )}
      </View>
    );
  };

  if (loading && newbieTasks.length === 0 && dailyTasks.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#9333EA" />
        <Text style={styles.loadingText}>Loading tasks…</Text>
      </View>
    );
  }

  const newbieStats = sectionReward(newbieTasks);
  const dailyStats = sectionReward(dailyTasks);
  const monthlyStats = sectionReward(monthlyTasks);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <LinearGradient colors={['#FFB6C1', '#FFD1DC', '#FFEEF2']} style={styles.headerGradient}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

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

        <View style={styles.heroBanner}>
          <View style={styles.giftBox}>
            <Text style={styles.giftEmoji}>🎁</Text>
          </View>
          <View style={styles.mascot}>
            <Text style={styles.mascotEmoji}>👾</Text>
          </View>
        </View>

        <Text style={styles.countdownLabel}>Monthly End Countdown</Text>
        <Text style={styles.countdownValue}>
          {countdown.days}Day(s) {formatCountdown(countdown.hours, countdown.minutes, countdown.seconds)}
        </Text>

        <View style={styles.rewardBar}>
          <View style={[styles.rewardLeft, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            {pendingReward > 0 ? <BeanAmount amount={pendingReward} size={14} textStyle={styles.rewardCount} /> : null}
            {pendingReward > 0 && pendingDiamonds > 0 ? <Text style={styles.rewardCount}>·</Text> : null}
            {pendingDiamonds > 0 ? <DiamondAmount amount={pendingDiamonds} size={14} textStyle={styles.rewardCount} /> : null}
            {!hasPending ? <Text style={styles.rewardCount}>—</Text> : null}
          </View>
          <TouchableOpacity
            style={[styles.getRewardBtn, (!hasPending || claiming) && styles.getRewardBtnDisabled]}
            onPress={handleGetReward}
            disabled={!hasPending || claiming}
          >
            {claiming ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.getRewardText}>Get Reward</Text>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'rewards' ? (
          <View style={styles.rewardsPanel}>
            <Text style={styles.rewardsTitle}>Pending Rewards</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              {pendingReward > 0 ? <BeanAmount amount={pendingReward} size={22} textStyle={styles.rewardsAmount} /> : null}
              {pendingDiamonds > 0 ? <DiamondAmount amount={pendingDiamonds} size={22} textStyle={styles.rewardsAmount} /> : null}
              {!hasPending ? <Text style={styles.rewardsAmount}>—</Text> : null}
            </View>
            <Text style={styles.rewardsHint}>
              Claim beans & diamonds to your wallet. Total progress: {totalEarned}/{totalPossible}
            </Text>

            <View style={styles.rewardsBreakdown}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Newbie</Text>
                <Text style={styles.breakdownValue}>
                  {newbieStats.earned}/{newbieStats.possible}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Daily</Text>
                <Text style={styles.breakdownValue}>
                  {dailyStats.earned}/{dailyStats.possible}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Monthly</Text>
                <Text style={styles.breakdownValue}>
                  {monthlyStats.earned}/{monthlyStats.possible}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.claimBtn, !hasPending && styles.claimBtnDisabled]}
              onPress={handleGetReward}
              disabled={!hasPending || claiming}
            >
              <Text style={styles.claimBtnText}>Claim to Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.walletLinkBtn} onPress={() => router.push('/profile/wallet' as any)}>
              <Text style={styles.walletLinkText}>Open Wallet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {streak && (
              <View style={styles.streakCard}>
                <View style={styles.streakTop}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <View>
                    <Text style={styles.streakCount}>{streak.currentStreak} day streak</Text>
                    <Text style={styles.streakBest}>Best: {streak.longestStreak} days</Text>
                  </View>
                  {streak.checkedInToday ? (
                    <Text style={styles.streakBadgeDone}>✓ Checked in</Text>
                  ) : streak.atRisk ? (
                    <Text style={styles.streakBadgeWarn}>Check in!</Text>
                  ) : null}
                </View>
                <View style={styles.streakWeekRow}>
                  {(streak.weekLabels || ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((label, i) => {
                    const filled = !!streak.weekDots?.[i];
                    const isToday = (streak.todaySlot ?? 6) === i;
                    return (
                      <View key={`streak-day-${i}`} style={styles.streakDayCol}>
                        <View
                          style={[
                            styles.streakDot,
                            filled && styles.streakDotOn,
                            isToday && !filled && styles.streakDotToday,
                          ]}
                        >
                          {filled ? <Text style={styles.streakDotEmoji}>🔥</Text> : null}
                        </View>
                        <Text style={[styles.streakDayLabel, isToday && styles.streakDayLabelToday]}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                {streak.milestoneDays && streak.milestoneDiamonds ? (
                  <View style={styles.streakMilestoneBox}>
                    <View style={styles.streakMilestoneTop}>
                      <Ionicons name="diamond" size={14} color="#00BFFF" />
                      <Text style={styles.streakMilestoneTitle}>
                        {streak.milestoneDays}-day streak → {streak.milestoneDiamonds.toLocaleString()} diamonds from Crimzo
                      </Text>
                    </View>
                    <View style={styles.streakMilestoneBarBg}>
                      <View
                        style={[
                          styles.streakMilestoneBarFill,
                          {
                            width: `${Math.min(
                              100,
                              ((streak.progressInBlock || 0) / streak.milestoneDays) * 100,
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.streakMilestoneHint}>
                      {streak.currentStreak > 0
                        ? `${streak.progressInBlock || 0}/${streak.milestoneDays} days · ${streak.daysToNextMilestone ?? streak.milestoneDays} left to reward`
                        : `Check in daily for ${streak.milestoneDays} days to unlock`}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {appTime && (
              <View style={styles.appTimeCard}>
                <View style={styles.appTimeHeader}>
                  <Ionicons name="time-outline" size={18} color="#9333EA" />
                  <Text style={styles.appTimeTitle}>Day Streak Progress</Text>
                </View>
                <Text style={styles.appTimeSub}>
                  Spend 1 hour/day in the app · {appTime.total_minutes || 0}/{appTime.required_minutes || 60} min
                </Text>
                <View style={styles.appTimeTrack}>
                  <View style={[styles.appTimeFill, { width: `${appTime.progress_percent || 0}%` }]} />
                </View>
                {appTime.requirement_met ? (
                  <Text style={styles.appTimeDone}>✓ 1 hour done — tap Check in below</Text>
                ) : (
                  <Text style={styles.appTimePending}>
                    {appTime.remaining_minutes || 60} min left · Home, Reels, Live, Messages, PK
                  </Text>
                )}
              </View>
            )}

            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[
                  styles.quickActionItem,
                  checkedIn && styles.quickActionCompleted,
                  (!appTime?.requirement_met && !checkedIn) && styles.quickActionDisabled,
                ]}
                onPress={handleCheckIn}
                disabled={checkedIn || checkingIn}
              >
                {checkedIn && (
                  <Ionicons name="checkmark-circle" size={16} color="#9333EA" style={styles.checkIcon} />
                )}
                <Text style={[styles.quickActionLabel, checkedIn && styles.quickActionLabelCompleted]}>
                  {checkingIn ? 'Checking…' : 'Check in'}
                </Text>
                <View style={styles.quickActionReward}>
                  <BeanIcon size={14} />
                  <Text style={styles.quickActionValue}>+50</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionItem} onPress={handleInviteShare}>
                <Text style={styles.quickActionLabel}>Invitation</Text>
                <View style={styles.quickActionReward}>
                  <BeanIcon size={14} />
                  <Text style={styles.quickActionValue}>200</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/reels' as any)}>
                <Text style={styles.quickActionLabel}>Video</Text>
                <View style={styles.quickActionReward}>
                  <DiamondIcon size={14} />
                  <Text style={styles.quickActionValue}>Free</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/profile/wallet' as any)}>
                <Text style={styles.quickActionLabel}>Wallet</Text>
                <View style={styles.quickActionReward}>
                  <BeanIcon size={14} />
                  <Text style={styles.quickActionValue}>Top up</Text>
                </View>
              </TouchableOpacity>
            </View>

            {renderTaskSection('Newbie Tasks', newbieTasks)}
            {renderTaskSection(
              'Daily Tasks',
              dailyTasks,
              <View style={styles.timerRow}>
                <Ionicons name="time-outline" size={14} color="#999" />
                <Text style={styles.timerText}>
                  Resets in {formatCountdown(dailyCountdown.hours, dailyCountdown.minutes, dailyCountdown.seconds)}
                </Text>
              </View>,
            )}
            {renderTaskSection(
              'Monthly Tasks',
              monthlyTasks,
              <View style={styles.timerRow}>
                <Ionicons name="time-outline" size={14} color="#999" />
                <Text style={styles.timerText}>
                  {countdown.days}Day(s) {formatCountdown(countdown.hours, countdown.minutes, countdown.seconds)}
                </Text>
              </View>,
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14 },
  headerGradient: { paddingTop: 44, paddingBottom: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20,
    padding: 4,
  },
  tab: { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 16 },
  activeTab: { backgroundColor: '#9333EA' },
  tabText: { color: '#666', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#FFF' },
  heroBanner: { height: 100, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  giftBox: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255,200,100,0.8)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftEmoji: { fontSize: 40 },
  mascot: { position: 'absolute', right: 60, top: 10 },
  mascotEmoji: { fontSize: 50 },
  countdownLabel: {
    textAlign: 'center',
    color: '#9333EA',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  countdownValue: { textAlign: 'center', color: '#9333EA', fontSize: 13, opacity: 0.8 },
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
  rewardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardCount: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  getRewardBtn: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 110,
    alignItems: 'center',
  },
  getRewardBtnDisabled: { opacity: 0.45 },
  getRewardText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  scrollContent: { flex: 1 },
  streakCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.25)',
  },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  streakEmoji: { fontSize: 28 },
  streakCount: { color: '#1A1A1A', fontSize: 16, fontWeight: '800' },
  streakBest: { color: '#888', fontSize: 12, marginTop: 2 },
  streakBadgeDone: { marginLeft: 'auto', color: '#30D158', fontSize: 11, fontWeight: '700' },
  streakBadgeWarn: { marginLeft: 'auto', color: '#FF9500', fontSize: 11, fontWeight: '700' },
  streakWeekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  streakDayCol: { alignItems: 'center', gap: 4 },
  streakDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  streakDotOn: { backgroundColor: 'rgba(255,149,0,0.2)', borderColor: 'rgba(255,149,0,0.5)' },
  streakDotToday: { borderColor: 'rgba(147,51,234,0.6)', backgroundColor: 'rgba(147,51,234,0.08)' },
  streakDotEmoji: { fontSize: 12 },
  streakDayLabel: { color: '#999', fontSize: 9, fontWeight: '600' },
  streakDayLabelToday: { color: '#9333EA', fontWeight: '800' },
  streakMilestoneBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 8,
  },
  streakMilestoneTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakMilestoneTitle: { color: '#555', fontSize: 12, fontWeight: '700', flex: 1 },
  streakMilestoneBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(147,51,234,0.12)',
    overflow: 'hidden',
  },
  streakMilestoneBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#9333EA',
  },
  streakMilestoneHint: { color: '#888', fontSize: 11, fontWeight: '600' },
  appTimeCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.2)',
  },
  appTimeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  appTimeTitle: { color: '#333', fontSize: 15, fontWeight: '700' },
  appTimeSub: { color: '#666', fontSize: 13, marginBottom: 10 },
  appTimeTrack: { height: 8, backgroundColor: '#F0E6FF', borderRadius: 4, overflow: 'hidden' },
  appTimeFill: { height: '100%', backgroundColor: '#9333EA', borderRadius: 4 },
  appTimeDone: { color: '#30D158', fontSize: 12, fontWeight: '600', marginTop: 8 },
  appTimePending: { color: '#888', fontSize: 12, marginTop: 8 },
  quickActions: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 16, gap: 8 },
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
  quickActionCompleted: { backgroundColor: 'rgba(147,51,234,0.05)', borderColor: 'rgba(147,51,234,0.3)' },
  quickActionDisabled: { opacity: 0.55 },
  checkIcon: { position: 'absolute', top: 4, right: 4 },
  quickActionLabel: { color: '#9333EA', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  quickActionLabelCompleted: { color: '#999' },
  quickActionReward: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coinIconSmall: { fontSize: 14 },
  diamondIcon: { fontSize: 14 },
  quickActionValue: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  taskSection: {
    backgroundColor: '#FFF',
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.1)',
  },
  taskSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  taskSectionTitle: { color: '#9333EA', fontSize: 18, fontWeight: '700' },
  taskSectionProgress: { color: '#999', fontSize: 14, marginLeft: 8 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  timerText: { color: '#999', fontSize: 13 },
  emptySection: { color: '#999', fontSize: 13, paddingVertical: 8 },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  taskItemDone: { opacity: 0.75 },
  taskInfo: { flex: 1, paddingRight: 8 },
  taskTitle: { color: '#1A1A1A', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#888' },
  taskRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coinIcon: { fontSize: 14 },
  taskReward: { color: '#FF9500', fontSize: 14, fontWeight: '600' },
  taskMultiplier: { color: '#999', fontSize: 12 },
  taskRight: { alignItems: 'flex-end', gap: 6 },
  goBtn: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 56,
    alignItems: 'center',
  },
  goBtnDone: { backgroundColor: 'rgba(48,209,88,0.15)', borderWidth: 1, borderColor: 'rgba(48,209,88,0.35)' },
  goBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  progressBar: {
    width: 72,
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#9333EA', borderRadius: 2 },
  progressText: { color: '#999', fontSize: 11 },
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
  rewardsBreakdown: {
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { color: '#666', fontSize: 14 },
  breakdownValue: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  claimBtn: {
    backgroundColor: '#9333EA',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  claimBtnDisabled: { opacity: 0.45 },
  claimBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  walletLinkBtn: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 20 },
  walletLinkText: { color: '#9333EA', fontSize: 14, fontWeight: '600' },
});