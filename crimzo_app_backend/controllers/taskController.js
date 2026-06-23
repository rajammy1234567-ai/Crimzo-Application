const User = require('../models/User');
const Task = require('../models/Task');
const {
  getOrCreateState,
  getProgressEntry,
  setProgressEntry,
  recordTaskAction,
  todayKey,
  monthKey,
  getStreakSnapshot,
  applyCheckinStreak,
} = require('../utils/taskProgress');

function computeNewbieProgress(user) {
  const nicknameDone = !!(user.username && !/^User\d+$/i.test(user.username));
  const avatarDone = !!user.avatar;
  const phoneDone = !!(user.linked_bank?.linked_phone || user.linked_bank?.status === 'verified');
  return {
    newbie_nickname: nicknameDone ? 1 : 0,
    newbie_avatar: avatarDone ? 1 : 0,
    newbie_phone: phoneDone ? 1 : 0,
  };
}

async function loadActiveTasks() {
  const tasks = await Task.find({ is_active: true }).sort({ sort_order: 1, section: 1 }).lean();
  return tasks;
}

async function syncNewbieTaskRewards(state, user, taskDefs) {
  const newbieDefs = taskDefs.filter((t) => t.section === 'newbie');
  const auto = computeNewbieProgress(user);
  let changed = false;

  for (const def of newbieDefs) {
    if ((auto[def.key] || 0) < 1) continue;
    const entry = getProgressEntry(state, def.key, 'once');
    if (entry.current >= def.max_count) continue;
    entry.current = def.max_count;
    entry.last_reset = 'once';
    setProgressEntry(state, def.key, entry);
    if (def.reward_type === 'diamonds') {
      state.pending_diamonds = (state.pending_diamonds || 0) + def.reward_amount;
    } else {
      state.pending_reward = (state.pending_reward || 0) + def.reward_amount;
    }
    changed = true;
  }

  if (changed) {
    state.updated_at = new Date();
    await state.save();
  }
}

function buildTaskList(state, user, taskDefs) {
  const newbieAuto = computeNewbieProgress(user);
  const sections = { newbie: [], daily: [], monthly: [] };

  taskDefs.forEach((def) => {
    let current = 0;
    if (def.section === 'newbie') {
      current = newbieAuto[def.key] || 0;
    } else {
      const reset = def.section === 'daily' ? 'daily' : 'monthly';
      const entry = getProgressEntry(state, def.key, reset);
      current = Math.min(entry.current, def.max_count);
    }
    sections[def.section].push({
      key: def.key,
      title: def.title,
      reward: def.reward_amount,
      rewardType: def.reward_type || 'beans',
      maxCount: def.max_count,
      currentCount: current,
      actionType: def.action_type,
      actionTarget: def.action_target || 1,
      deepLink: def.deep_link || '',
    });
  });

  return sections;
}

exports.getTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const [user, state, taskDefs] = await Promise.all([
      User.findById(userId).lean(),
      getOrCreateState(userId),
      loadActiveTasks(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await syncNewbieTaskRewards(state, user, taskDefs);
    const sections = buildTaskList(state, user, taskDefs);
    const totalPossible = taskDefs.reduce((s, t) => s + t.reward_amount * t.max_count, 0);
    const totalEarned = [...sections.newbie, ...sections.daily, ...sections.monthly]
      .reduce((s, t) => s + t.reward * t.currentCount, 0);

    const streak = getStreakSnapshot(state);

    res.json({
      success: true,
      pendingReward: state.pending_reward || 0,
      pendingDiamonds: state.pending_diamonds || 0,
      checkedInToday: streak.checkedInToday,
      streak,
      sections,
      totalPossible,
      totalEarned,
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

exports.getStreak = async (req, res) => {
  try {
    const state = await getOrCreateState(req.user.id);
    res.json({ success: true, streak: getStreakSnapshot(state) });
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Failed to get streak' });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { getTodayAppTime } = require('../utils/appTimeService');
    const appTime = await getTodayAppTime(req.user.id);
    if (!appTime.requirement_met) {
      return res.status(400).json({
        error: 'Spend at least 1 hour in the app today before check-in',
        code: 'STREAK_TIME_REQUIRED',
        appTime,
      });
    }

    const state = await getOrCreateState(req.user.id);
    const today = todayKey();
    const streakUpdate = applyCheckinStreak(state, today);

    if (streakUpdate.alreadyCheckedIn) {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        pendingReward: state.pending_reward,
        pendingDiamonds: state.pending_diamonds || 0,
        streak: getStreakSnapshot(state),
      });
    }

    state.last_checkin = today;
    state.checkin_streak = streakUpdate.streak;
    state.longest_streak = streakUpdate.longest;
    state.pending_reward = (state.pending_reward || 0) + 50;
    state.updated_at = new Date();
    await state.save();

    res.json({
      success: true,
      added: 50,
      pendingReward: state.pending_reward,
      pendingDiamonds: state.pending_diamonds || 0,
      streak: getStreakSnapshot(state),
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
};

exports.claimReward = async (req, res) => {
  try {
    const state = await getOrCreateState(req.user.id);
    const beansAmount = state.pending_reward || 0;
    const diamondsAmount = state.pending_diamonds || 0;
    if (beansAmount <= 0 && diamondsAmount <= 0) {
      const user = await User.findById(req.user.id).select('beans diamonds').lean();
      return res.json({
        success: true,
        claimed: 0,
        claimedDiamonds: 0,
        beans: user?.beans || 0,
        diamonds: user?.diamonds || 0,
      });
    }

    state.pending_reward = 0;
    state.pending_diamonds = 0;
    state.updated_at = new Date();
    await state.save();

    const inc = {};
    if (beansAmount > 0) inc.beans = beansAmount;
    if (diamondsAmount > 0) inc.diamonds = diamondsAmount;

    const user = await User.findByIdAndUpdate(req.user.id, { $inc: inc }, { new: true })
      .select('beans diamonds');

    res.json({
      success: true,
      claimed: beansAmount,
      claimedDiamonds: diamondsAmount,
      beans: user?.beans || 0,
      diamonds: user?.diamonds || 0,
    });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { taskKey } = req.body;
    const def = await Task.findOne({ key: taskKey, is_active: true }).lean();
    if (!def) return res.status(400).json({ error: 'Invalid task' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const state = await getOrCreateState(req.user.id);

    if (def.action_type !== 'manual') {
      const reset = def.section === 'daily' ? 'daily' : def.section === 'monthly' ? 'monthly' : 'once';
      const entry = getProgressEntry(state, def.key, reset);
      return res.status(400).json({
        error: 'Complete this task by doing the required action in the app.',
        needsAction: true,
        currentCount: Math.min(entry.current, def.max_count),
        maxCount: def.max_count,
        deepLink: def.deep_link || '',
      });
    }

    if (def.section === 'newbie') {
      const auto = computeNewbieProgress(user);
      if ((auto[taskKey] || 0) < 1) {
        return res.status(400).json({ error: 'Complete the task first', needsAction: true });
      }
      const entry = getProgressEntry(state, taskKey, 'once');
      if (entry.current >= def.max_count) {
        return res.json({
          success: true,
          taskKey,
          currentCount: entry.current,
          maxCount: def.max_count,
          alreadyClaimed: true,
          pendingReward: state.pending_reward,
          pendingDiamonds: state.pending_diamonds || 0,
        });
      }
      entry.current = def.max_count;
      entry.last_reset = 'once';
      setProgressEntry(state, taskKey, entry);
      if (def.reward_type === 'diamonds') {
        state.pending_diamonds = (state.pending_diamonds || 0) + def.reward_amount;
      } else {
        state.pending_reward = (state.pending_reward || 0) + def.reward_amount;
      }
      state.updated_at = new Date();
      await state.save();
      return res.json({
        success: true,
        taskKey,
        currentCount: entry.current,
        maxCount: def.max_count,
        rewardAdded: def.reward_amount,
        rewardType: def.reward_type,
        pendingReward: state.pending_reward,
        pendingDiamonds: state.pending_diamonds || 0,
      });
    }

    const reset = def.section === 'daily' ? 'daily' : 'monthly';
    const entry = getProgressEntry(state, taskKey, reset);
    if (entry.current >= def.max_count) {
      return res.json({ success: true, taskKey, currentCount: entry.current, maxCount: def.max_count });
    }
    entry.current += 1;
    entry.last_reset = reset === 'daily' ? todayKey() : monthKey();
    setProgressEntry(state, taskKey, entry);

    if (def.reward_type === 'diamonds') {
      state.pending_diamonds = (state.pending_diamonds || 0) + def.reward_amount;
    } else {
      state.pending_reward = (state.pending_reward || 0) + def.reward_amount;
    }
    state.updated_at = new Date();
    await state.save();

    res.json({
      success: true,
      taskKey,
      currentCount: entry.current,
      maxCount: def.max_count,
      rewardAdded: def.reward_amount,
      rewardType: def.reward_type,
      pendingReward: state.pending_reward,
      pendingDiamonds: state.pending_diamonds || 0,
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

exports.recordTaskAction = recordTaskAction;