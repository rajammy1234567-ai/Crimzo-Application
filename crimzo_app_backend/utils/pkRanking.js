const User = require('../models/User');
const PKBattle = require('../models/PKBattle');
const PkMonthlyStats = require('../models/PkMonthlyStats');
const PkMonthlyReward = require('../models/PkMonthlyReward');
const {
  monthKey,
  previousMonthKey,
  dayOfMonthIST,
  formatMonthLabel,
  dateKeyInTimezone,
} = require('./dateKeys');
const {
  PK_MONTHLY_REWARD_DAY,
  PK_MONTHLY_REWARD_DIAMONDS,
  PK_LEADERBOARD_LIMIT,
} = require('../config/walletConfig');
const { getIo, emitDiamondUpdate } = require('./socketEmitter');

function monthFromBattle(battle) {
  const when = battle.ended_at || new Date();
  return monthKey(when);
}

async function upsertParticipantStats(userId, month, score, won) {
  if (!userId) return;
  const inc = {
    total_score: Math.max(0, Math.floor(Number(score) || 0)),
    battles_played: 1,
  };
  if (won) inc.wins = 1;

  await PkMonthlyStats.findOneAndUpdate(
    { user_id: userId, month },
    {
      $inc: inc,
      $set: { updated_at: new Date() },
      $setOnInsert: { user_id: userId, month },
    },
    { upsert: true },
  );
}

/** Record wins + scores when a PK battle ends (idempotent per battle) */
async function recordBattleStats(battle) {
  if (!battle || battle.status !== 'ended' || battle.stats_applied) return;

  const month = monthFromBattle(battle);
  const winnerId = battle.winner_id ? String(battle.winner_id) : null;

  if (battle.host1_id) {
    await upsertParticipantStats(
      battle.host1_id,
      month,
      battle.host1_score || 0,
      winnerId && String(battle.host1_id) === winnerId,
    );
  }
  if (battle.host2_id) {
    await upsertParticipantStats(
      battle.host2_id,
      month,
      battle.host2_score || 0,
      winnerId && String(battle.host2_id) === winnerId,
    );
  }

  await PKBattle.updateOne(
    { _id: battle._id },
    { $set: { stats_applied: true } },
  );
}

/** One-time style backfill for battles ended before stats tracking shipped */
async function backfillPkBattleStats() {
  const pending = await PKBattle.find({
    status: 'ended',
    ended_at: { $ne: null },
    stats_applied: { $ne: true },
  })
    .sort({ ended_at: 1 })
    .limit(200)
    .lean();

  for (const battle of pending) {
    try {
      await recordBattleStats(battle);
    } catch (err) {
      console.error('PK stats backfill error:', battle.battle_id, err.message);
    }
  }
  if (pending.length) {
    console.log(`[PK Ranking] Backfilled stats for ${pending.length} battle(s)`);
  }
}

async function fetchLeaderboardRows(month, limit = PK_LEADERBOARD_LIMIT) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), PK_LEADERBOARD_LIMIT);
  const rows = await PkMonthlyStats.find({
    month,
    $or: [{ wins: { $gt: 0 } }, { total_score: { $gt: 0 } }],
  })
    .sort({ wins: -1, total_score: -1, battles_played: -1, updated_at: 1 })
    .limit(safeLimit)
    .populate('user_id', 'username avatar crimzo_id')
    .lean();

  return rows.map((row, index) => {
    const user = row.user_id;
    const userId = user?._id || user || row.user_id;
    return {
      rank: index + 1,
      user_id: userId ? String(userId) : null,
      username: user?.username || 'Unknown',
      avatar: user?.avatar || null,
      crimzo_id: user?.crimzo_id || null,
      wins: row.wins || 0,
      total_score: row.total_score || 0,
      battles_played: row.battles_played || 0,
    };
  });
}

async function getUserMonthlyRank(userId, month) {
  if (!userId) return null;
  const stats = await PkMonthlyStats.findOne({ user_id: userId, month }).lean();
  if (!stats || (stats.wins <= 0 && stats.total_score <= 0)) {
    return { rank: null, wins: 0, total_score: 0, battles_played: 0 };
  }

  const ahead = await PkMonthlyStats.countDocuments({
    month,
    $or: [
      { wins: { $gt: stats.wins } },
      { wins: stats.wins, total_score: { $gt: stats.total_score } },
      {
        wins: stats.wins,
        total_score: stats.total_score,
        battles_played: { $lt: stats.battles_played },
      },
    ],
  });

  return {
    rank: ahead + 1,
    wins: stats.wins || 0,
    total_score: stats.total_score || 0,
    battles_played: stats.battles_played || 0,
  };
}

function nextAnnouncementDate(from = new Date()) {
  const today = dateKeyInTimezone(from);
  const day = dayOfMonthIST(from);
  let target = today;
  if (day >= PK_MONTHLY_REWARD_DAY) {
    const { y, m } = today.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    target = `${nextMonth}-${String(PK_MONTHLY_REWARD_DAY).padStart(2, '0')}`;
  } else {
    target = `${today.slice(0, 8)}${String(PK_MONTHLY_REWARD_DAY).padStart(2, '0')}`;
  }
  const [y, m, d] = target.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function getRankingInfo(userId, requestedMonth) {
  const month = requestedMonth || monthKey();
  const [leaderboard, myRank, lastReward] = await Promise.all([
    fetchLeaderboardRows(month, 20),
    getUserMonthlyRank(userId, month),
    PkMonthlyReward.findOne().sort({ announced_at: -1 }).lean(),
  ]);

  let lastWinner = null;
  if (lastReward?.winner_user_id) {
    lastWinner = {
      month: lastReward.month,
      monthLabel: formatMonthLabel(lastReward.month),
      username: lastReward.winner_username,
      wins: lastReward.wins,
      total_score: lastReward.total_score,
      diamonds: lastReward.diamonds_awarded,
      announced_at: lastReward.announced_at,
    };
  }

  const nextDate = nextAnnouncementDate();
  return {
    month,
    monthLabel: formatMonthLabel(month),
    rewardDiamonds: PK_MONTHLY_REWARD_DIAMONDS,
    rewardDay: PK_MONTHLY_REWARD_DAY,
    nextAnnouncement: nextDate.toISOString(),
    nextAnnouncementLabel: nextDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    rankingNote: 'Ranked by wins, then total PK score',
    lastWinner,
    myRank,
    leaderboard,
  };
}

async function awardMonthlyTopPlayer(periodMonth) {
  const existing = await PkMonthlyReward.findOne({ month: periodMonth }).lean();
  if (existing) return existing;

  const top = await PkMonthlyStats.findOne({
    month: periodMonth,
    $or: [{ wins: { $gt: 0 } }, { total_score: { $gt: 0 } }],
  })
    .sort({ wins: -1, total_score: -1, battles_played: -1, updated_at: 1 })
    .populate('user_id', 'username')
    .lean();

  if (!top?.user_id) {
    return PkMonthlyReward.create({
      month: periodMonth,
      winner_user_id: null,
      winner_username: null,
      wins: 0,
      total_score: 0,
      diamonds_awarded: 0,
    });
  }

  const winnerUser = top.user_id;
  const winnerId = winnerUser._id || winnerUser;
  const diamonds = PK_MONTHLY_REWARD_DIAMONDS;

  const updatedUser = await User.findByIdAndUpdate(
    winnerId,
    { $inc: { diamonds } },
    { new: true },
  ).select('diamonds username').lean();

  const reward = await PkMonthlyReward.create({
    month: periodMonth,
    winner_user_id: winnerId,
    winner_username: winnerUser.username || 'Unknown',
    wins: top.wins || 0,
    total_score: top.total_score || 0,
    diamonds_awarded: diamonds,
  });

  const io = getIo();
  if (io) {
    const payload = {
      month: periodMonth,
      monthLabel: formatMonthLabel(periodMonth),
      winnerId: String(winnerId),
      username: winnerUser.username || 'Unknown',
      wins: top.wins || 0,
      totalScore: top.total_score || 0,
      diamonds,
    };
    io.emit('pk_monthly_winner', payload);
    emitDiamondUpdate(winnerId, updatedUser?.diamonds ?? diamonds);
  }

  console.log(
    `[PK Ranking] ${formatMonthLabel(periodMonth)} winner: ${winnerUser.username} `
    + `(${top.wins} wins, ${top.total_score} score) → ${diamonds} diamonds`,
  );

  return reward;
}

/** Run on 3rd of each month (IST) — rewards previous month's #1 */
async function processMonthlyPkRewardIfDue(now = new Date()) {
  if (dayOfMonthIST(now) !== PK_MONTHLY_REWARD_DAY) return null;
  const periodMonth = previousMonthKey(now);
  return awardMonthlyTopPlayer(periodMonth);
}

module.exports = {
  recordBattleStats,
  backfillPkBattleStats,
  fetchLeaderboardRows,
  getUserMonthlyRank,
  getRankingInfo,
  awardMonthlyTopPlayer,
  processMonthlyPkRewardIfDue,
  nextAnnouncementDate,
};