const Task = require('../models/Task');
const UserTaskState = require('../models/UserTaskState');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6 (matches profile week row) */
function weekdayIndexMon0(dateKey) {
  const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function weekStartKey(dateKey) {
  const idx = weekdayIndexMon0(dateKey);
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - idx);
  return d.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function buildWeekDots(currentStreak, anchorDay, today) {
  const weekDots = Array(7).fill(false);
  if (!anchorDay || currentStreak <= 0) {
    return weekDots;
  }

  const currentWeekStart = weekStartKey(today);
  for (let i = 0; i < currentStreak; i += 1) {
    const dayKey = shiftDateKey(anchorDay, -i);
    if (weekStartKey(dayKey) !== currentWeekStart) continue;
    weekDots[weekdayIndexMon0(dayKey)] = true;
  }
  return weekDots;
}

function getStreakSnapshot(state) {
  const today = todayKey();
  const yesterday = yesterdayKey();
  const last = state?.last_checkin || null;
  const stored = state?.checkin_streak || 0;
  const active = last === today || last === yesterday;
  const currentStreak = active ? stored : 0;
  const checkedInToday = last === today;
  const anchorDay = checkedInToday ? today : (last === yesterday ? yesterday : null);
  const weekDots = buildWeekDots(currentStreak, anchorDay, today);
  const todayWeekday = weekdayIndexMon0(today);

  return {
    currentStreak,
    longestStreak: state?.longest_streak || 0,
    checkedInToday,
    lastCheckin: last,
    weekDots,
    todayWeekday,
    atRisk: !checkedInToday && last === yesterday && currentStreak > 0,
  };
}

function applyCheckinStreak(state, today) {
  const yesterday = yesterdayKey();
  let streak = state.checkin_streak || 0;

  if (state.last_checkin === today) {
    return { streak, longest: state.longest_streak || streak, alreadyCheckedIn: true };
  }

  if (state.last_checkin === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }

  const longest = Math.max(state.longest_streak || 0, streak);
  return { streak, longest, alreadyCheckedIn: false };
}

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreateState(userId) {
  let state = await UserTaskState.findOne({ user_id: userId });
  if (!state) {
    state = await UserTaskState.create({ user_id: userId, progress: {} });
  }
  return state;
}

function getProgressEntry(state, key, resetPeriod) {
  const raw = state.progress?.get?.(key) || state.progress?.[key];
  const entry = raw || { current: 0, claimed: 0, partial: 0, last_reset: null };
  const period = resetPeriod === 'daily' ? todayKey() : resetPeriod === 'monthly' ? monthKey() : 'once';
  if (entry.last_reset !== period && resetPeriod !== 'once') {
    return { current: 0, claimed: 0, partial: 0, last_reset: period };
  }
  return { ...entry, partial: entry.partial || 0, last_reset: entry.last_reset || period };
}

function setProgressEntry(state, key, entry) {
  if (!state.progress) state.progress = new Map();
  if (state.progress.set) {
    state.progress.set(key, entry);
  } else {
    state.progress[key] = entry;
  }
}

function addPendingReward(state, task, count) {
  const amount = count * (task.reward_amount || 0);
  if (amount <= 0) return;
  if (task.reward_type === 'diamonds') {
    state.pending_diamonds = (state.pending_diamonds || 0) + amount;
  } else {
    state.pending_reward = (state.pending_reward || 0) + amount;
  }
}

async function recordTaskAction(userId, actionType, value = 1) {
  if (!userId || !actionType) return;
  const tasks = await Task.find({ is_active: true, action_type: actionType }).lean();
  if (!tasks.length) return;

  const state = await getOrCreateState(userId);
  let changed = false;

  for (const task of tasks) {
    const reset = task.section === 'daily' ? 'daily' : task.section === 'monthly' ? 'monthly' : 'once';
    const entry = getProgressEntry(state, task.key, reset);
    if (entry.current >= task.max_count) continue;

    const target = Math.max(1, task.action_target || 1);
    const newPartial = (entry.partial || 0) + value;
    const completions = Math.floor(newPartial / target);
    if (completions > 0) {
      const canAdd = Math.min(completions, task.max_count - entry.current);
      entry.current += canAdd;
      entry.partial = newPartial - canAdd * target;
      addPendingReward(state, task, canAdd);
      changed = true;
    } else {
      entry.partial = newPartial;
      changed = true;
    }
    entry.last_reset = reset === 'daily' ? todayKey() : reset === 'monthly' ? monthKey() : 'once';
    setProgressEntry(state, task.key, entry);
  }

  if (changed) {
    state.updated_at = new Date();
    await state.save();
  }
}

module.exports = {
  getOrCreateState,
  getProgressEntry,
  setProgressEntry,
  recordTaskAction,
  todayKey,
  monthKey,
  getStreakSnapshot,
  applyCheckinStreak,
};