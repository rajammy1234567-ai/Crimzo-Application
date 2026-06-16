const User = require('../models/User');
const UserTaskState = require('../models/UserTaskState');

const TASK_DEFS = {
  newbie_nickname: { section: 'newbie', title: 'Enter your nickname', reward: 50, max: 1 },
  newbie_avatar: { section: 'newbie', title: 'Upload Avatar', reward: 50, max: 1 },
  newbie_phone: { section: 'newbie', title: 'Bind phone number', reward: 100, max: 1 },
  daily_live_message: { section: 'daily', title: 'Send a message in 1 Live room(s)', reward: 10, max: 5 },
  daily_like_moment: { section: 'daily', title: 'Like 2 moment(s) of others', reward: 10, max: 5 },
  daily_random_match: { section: 'daily', title: 'Random Match for 1 time(s)', reward: 25, max: 2 },
  daily_watch_live: { section: 'daily', title: 'Watch Live in Live room for 2 min(s)', reward: 10, max: 5 },
  daily_gift_message: { section: 'daily', title: 'Send gift(s) in message', reward: 50, max: 1 },
  daily_top_wheel: { section: 'daily', title: 'Win 1 time(s) in Top Wheel in Party room (win>spend)', reward: 25, max: 2 },
  monthly_follow: { section: 'monthly', title: 'Be followed by 1 user(s)', reward: 100, max: 5 },
  monthly_topup: { section: 'monthly', title: 'Top up for 1 time(s)', reward: 200, max: 5 },
  monthly_invite: { section: 'monthly', title: 'Invite 1 new user(s) successfully', reward: 200, max: 5 },
  monthly_lucky_win: { section: 'monthly', title: 'Send 17 Lucky Win', reward: 200, max: 5 },
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
  const entry = raw || { current: 0, claimed: 0, last_reset: null };
  const period = resetPeriod === 'daily' ? todayKey() : resetPeriod === 'monthly' ? monthKey() : 'once';
  if (entry.last_reset !== period && resetPeriod !== 'once') {
    return { current: 0, claimed: 0, last_reset: period };
  }
  return { ...entry, last_reset: entry.last_reset || period };
}

function setProgressEntry(state, key, entry) {
  if (!state.progress) state.progress = new Map();
  if (state.progress.set) {
    state.progress.set(key, entry);
  } else {
    state.progress[key] = entry;
  }
}

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

function buildTaskList(state, user) {
  const newbieAuto = computeNewbieProgress(user);
  const sections = { newbie: [], daily: [], monthly: [] };

  Object.entries(TASK_DEFS).forEach(([key, def]) => {
    let current = 0;
    if (def.section === 'newbie') {
      current = newbieAuto[key] || 0;
    } else {
      const reset = def.section === 'daily' ? 'daily' : 'monthly';
      const entry = getProgressEntry(state, key, reset);
      current = Math.min(entry.current, def.max);
    }
    sections[def.section].push({
      key,
      title: def.title,
      reward: def.reward,
      maxCount: def.max,
      currentCount: current,
    });
  });

  return sections;
}

exports.getTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const [user, state] = await Promise.all([
      User.findById(userId).lean(),
      getOrCreateState(userId),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sections = buildTaskList(state, user);
    const totalPossible = Object.values(TASK_DEFS).reduce((s, t) => s + t.reward * t.max, 0);
    const totalEarned = [...sections.newbie, ...sections.daily, ...sections.monthly]
      .reduce((s, t) => s + t.reward * t.currentCount, 0);

    res.json({
      success: true,
      pendingReward: state.pending_reward || 0,
      checkedInToday: state.last_checkin === todayKey(),
      sections,
      totalPossible,
      totalEarned,
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const state = await getOrCreateState(req.user.id);
    const today = todayKey();
    if (state.last_checkin === today) {
      return res.json({ success: true, alreadyCheckedIn: true, pendingReward: state.pending_reward });
    }
    state.last_checkin = today;
    state.pending_reward = (state.pending_reward || 0) + 50;
    state.updated_at = new Date();
    await state.save();
    res.json({ success: true, added: 50, pendingReward: state.pending_reward });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
};

exports.claimReward = async (req, res) => {
  try {
    const state = await getOrCreateState(req.user.id);
    const amount = state.pending_reward || 0;
    if (amount <= 0) {
      return res.json({ success: true, claimed: 0, beans: (await User.findById(req.user.id))?.beans || 0 });
    }
    state.pending_reward = 0;
    state.updated_at = new Date();
    await state.save();
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { beans: amount } },
      { new: true },
    ).select('beans');
    res.json({ success: true, claimed: amount, beans: user?.beans || 0 });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const { taskKey } = req.body;
    const def = TASK_DEFS[taskKey];
    if (!def) return res.status(400).json({ error: 'Invalid task' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const state = await getOrCreateState(req.user.id);

    if (def.section === 'newbie') {
      const auto = computeNewbieProgress(user);
      if ((auto[taskKey] || 0) < 1) {
        return res.status(400).json({ error: 'Complete the task first', needsAction: true });
      }
      return res.json({ success: true, taskKey, currentCount: 1 });
    }

    const reset = def.section === 'daily' ? 'daily' : 'monthly';
    const entry = getProgressEntry(state, taskKey, reset);
    if (entry.current >= def.max) {
      return res.json({ success: true, taskKey, currentCount: entry.current, maxCount: def.max });
    }
    entry.current += 1;
    entry.last_reset = reset === 'daily' ? todayKey() : monthKey();
    setProgressEntry(state, taskKey, entry);
    state.pending_reward = (state.pending_reward || 0) + def.reward;
    state.updated_at = new Date();
    await state.save();

    res.json({
      success: true,
      taskKey,
      currentCount: entry.current,
      maxCount: def.max,
      rewardAdded: def.reward,
      pendingReward: state.pending_reward,
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

exports.TASK_DEFS = TASK_DEFS;