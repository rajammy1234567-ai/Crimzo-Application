const UserAppTimeDaily = require('../models/UserAppTimeDaily');

const DAILY_REQUIRED_SECONDS = 3600;
const VALID_CATEGORIES = ['home', 'reels', 'live', 'messages', 'profile', 'pk', 'create', 'other'];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCategory(category) {
  return VALID_CATEGORIES.includes(category) ? category : 'other';
}

async function recordAppTime(userId, seconds, category = 'other') {
  if (!userId || !Number.isFinite(seconds) || seconds <= 0) return null;
  const capped = Math.min(Math.floor(seconds), 120);
  const date = todayKey();
  const cat = normalizeCategory(category);
  const inc = { total_seconds: capped, [`breakdown.${cat}`]: capped };
  return UserAppTimeDaily.findOneAndUpdate(
    { user_id: userId, date },
    { $inc: inc, $setOnInsert: { user_id: userId, date } },
    { upsert: true, new: true },
  ).lean();
}

async function getTodayAppTime(userId) {
  const doc = await UserAppTimeDaily.findOne({ user_id: userId, date: todayKey() }).lean();
  const total = doc?.total_seconds || 0;
  const breakdown = doc?.breakdown || {};
  return {
    total_seconds: total,
    total_minutes: Math.floor(total / 60),
    required_seconds: DAILY_REQUIRED_SECONDS,
    required_minutes: DAILY_REQUIRED_SECONDS / 60,
    requirement_met: total >= DAILY_REQUIRED_SECONDS,
    remaining_seconds: Math.max(0, DAILY_REQUIRED_SECONDS - total),
    remaining_minutes: Math.ceil(Math.max(0, DAILY_REQUIRED_SECONDS - total) / 60),
    progress_percent: Math.min(100, Math.round((total / DAILY_REQUIRED_SECONDS) * 100)),
    breakdown,
    date: todayKey(),
  };
}

async function assertDailyAppTimeRequirement(userId) {
  const stats = await getTodayAppTime(userId);
  if (stats.requirement_met) return stats;
  const err = new Error(
    `Spend at least 1 hour on the app today to go live. Progress: ${stats.total_minutes}/60 min.`,
  );
  err.code = 'DAILY_TIME_REQUIRED';
  err.statusCode = 403;
  err.stats = stats;
  throw err;
}

module.exports = {
  DAILY_REQUIRED_SECONDS,
  todayKey,
  recordAppTime,
  getTodayAppTime,
  assertDailyAppTimeRequirement,
};