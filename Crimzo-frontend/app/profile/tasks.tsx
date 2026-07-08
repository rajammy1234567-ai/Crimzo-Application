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
  const { token } = useAuth();
  const router = useRouter();
  
  const [appTime, setAppTime] = useState<AppTimeStats | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiGet<{
        success?: boolean;
        checkedInToday?: boolean;
        streak?: StreakInfo;
        autoCheckin?: {
          added?: number;
          streak?: StreakInfo;
          streakMilestoneReward?: number;
        } | null;
      }>('/api/tasks', token);

      const timeData = await apiGet<
        AppTimeStats & {
          success?: boolean;
          autoCheckin?: {
            added?: number;
            streak?: StreakInfo;
            streakMilestoneReward?: number;
          } | null;
        }
      >('/api/user/app-time/today', token).catch(() => null);

      const autoCheckin = data.autoCheckin || timeData?.autoCheckin || null;

      if (data.success) {
        setCheckedIn(!!data.checkedInToday || !!autoCheckin);
        setStreak(autoCheckin?.streak || data.streak || null);
      }

      if (timeData && (timeData as { success?: boolean }).success !== false) {
        setAppTime(timeData);
      }

      if (autoCheckin?.added && autoCheckin.streakMilestoneReward) {
        appAlert(
          '🎉 30-Day Streak!',
          `Day streak updated! ${autoCheckin.streakMilestoneReward.toLocaleString()} diamonds from Crimzo.`,
        );
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
    }, [fetchTasks]),
  );

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
        streakMilestoneReward?: number;
        alreadyCheckedIn?: boolean;
        streak?: StreakInfo;
      }>('/api/tasks/checkin', {}, token);

      if (res.success) {
        setCheckedIn(true);
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
              `${milestone.toLocaleString()} diamonds from Crimzo!`,
            );
          } else {
            appAlert('Check In', `Daily Streak Maintained!`);
          }
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.data && typeof e.data === 'object') {
        const errData = e.data as { code?: string; appTime?: { remaining_minutes?: number } };
        if (errData.code === 'STREAK_TIME_REQUIRED') {
          const mins = errData.appTime?.remaining_minutes ?? 60;
          appAlert('1 Hour Required', `Spend ${mins} more minutes in the app today before check-in.`);
          return;
        }
      }
      appAlert('Error', e instanceof ApiError ? e.message : 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading && !streak) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#9333EA" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <LinearGradient colors={['#FFB6C1', '#FFD1DC', '#FFEEF2']} style={styles.headerGradient}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Daily Streak</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.heroBanner}>
          <View style={styles.giftBox}>
            <Text style={styles.giftEmoji}>📅</Text>
          </View>
          <View style={styles.mascot}>
            <Text style={styles.mascotEmoji}>🔥</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
                    {streak.milestoneDays}-day streak → {streak.milestoneDiamonds.toLocaleString()} diamonds
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
              <Text style={styles.appTimeDone}>
                {checkedIn
                  ? '✓ 1 hour done — streak counted for today'
                  : '✓ 1 hour done — checking in automatically…'}
              </Text>
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
            disabled={checkedIn || checkingIn || !appTime?.requirement_met}
          >
            {checkedIn && (
              <Ionicons name="checkmark-circle" size={16} color="#9333EA" style={styles.checkIcon} />
            )}
            <Text style={[styles.quickActionLabel, checkedIn && styles.quickActionLabelCompleted]}>
              {checkingIn ? 'Checking…' : 'Check in'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
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
  headerTitle: { color: '#333', fontSize: 18, fontWeight: '700' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
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
  streakDotEmoji: { fontSize: 14 },
  streakDayLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  streakDayLabelToday: { color: '#9333EA' },
  streakMilestoneBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  streakMilestoneTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  streakMilestoneTitle: { color: '#1A1A1A', fontSize: 13, fontWeight: '700' },
  streakMilestoneBarBg: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  streakMilestoneBarFill: { height: '100%', backgroundColor: '#00BFFF' },
  streakMilestoneHint: { color: '#6B7280', fontSize: 11, marginTop: 6, textAlign: 'center' },
  appTimeCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
  },
  appTimeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  appTimeTitle: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },
  appTimeSub: { color: '#666', fontSize: 12, marginBottom: 12 },
  appTimeTrack: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  appTimeFill: { height: '100%', backgroundColor: '#9333EA', borderRadius: 4 },
  appTimeDone: { color: '#30D158', fontSize: 12, fontWeight: '600' },
  appTimePending: { color: '#FF9500', fontSize: 12, fontWeight: '600' },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
  },
  quickActionItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickActionCompleted: { backgroundColor: 'rgba(147,51,234,0.05)', borderWidth: 1, borderColor: 'rgba(147,51,234,0.2)' },
  quickActionDisabled: { opacity: 0.5 },
  checkIcon: { position: 'absolute', right: 8, top: 8 },
  quickActionLabel: { color: '#333', fontSize: 14, fontWeight: '600' },
  quickActionLabelCompleted: { color: '#9333EA' },
});