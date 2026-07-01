const mongoose = require('mongoose');
const GiftHistory = require('../models/GiftHistory');
const LiveTalkSession = require('../models/LiveTalkSession');
const VideoCallSession = require('../models/VideoCallSession');
const { todayKey } = require('./dateKeys');

function istDayUtcRange(dateKey = todayKey()) {
  return {
    start: new Date(`${dateKey}T00:00:00+05:30`),
    end: new Date(`${dateKey}T23:59:59.999+05:30`),
  };
}

/** Sum today's beans earned (gifts + live talk + calls) per user, keyed by user id string. */
async function getDailyBeansEarnedMap(userIds, dateKey = todayKey()) {
  if (!userIds?.length) return new Map();

  const uniqueIds = [...new Set(
    userIds.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)),
  )];
  if (!uniqueIds.length) return new Map();

  const objectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
  const { start, end } = istDayUtcRange(dateKey);
  const totals = new Map(uniqueIds.map((id) => [id, 0]));

  const [giftRows, talkRows, callRows] = await Promise.all([
    GiftHistory.aggregate([
      {
        $match: {
          receiver_id: { $in: objectIds },
          created_at: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$receiver_id', total: { $sum: '$beans_earned' } } },
    ]),
    LiveTalkSession.aggregate([
      {
        $match: {
          host_id: { $in: objectIds },
          started_at: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$host_id', total: { $sum: '$host_beans_earned' } } },
    ]),
    VideoCallSession.aggregate([
      {
        $match: {
          peerId: { $in: uniqueIds },
          startedAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: '$peerId', total: { $sum: '$peer_beans_earned' } } },
    ]),
  ]);

  for (const rows of [giftRows, talkRows, callRows]) {
    for (const row of rows) {
      const id = String(row._id);
      totals.set(id, (totals.get(id) || 0) + (row.total || 0));
    }
  }

  return totals;
}

module.exports = {
  istDayUtcRange,
  getDailyBeansEarnedMap,
};