const mongoose = require('mongoose');
const GiftHistory = require('../models/GiftHistory');
const LiveTalkSession = require('../models/LiveTalkSession');
const VideoCallSession = require('../models/VideoCallSession');
const User = require('../models/User');

function istDayRange(dateKey) {
  return {
    start: new Date(`${dateKey}T00:00:00+05:30`),
    end:   new Date(`${dateKey}T23:59:59.999+05:30`),
  };
}

function todayKey() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // IST
  return now.toISOString().slice(0, 10);
}

function monthStart(monthKey) {
  return new Date(`${monthKey}-01T00:00:00+05:30`);
}
function monthEnd(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return new Date(`${nextMonth}-01T00:00:00+05:30`);
}

/**
 * GET /api/earnings/summary
 * Returns: daily_diamonds, monthly_diamonds, call_records[]
 */
exports.getEarnings = async (req, res) => {
  try {
    const userId = req.user.id;
    const oid = new mongoose.Types.ObjectId(userId);

    const today = todayKey();
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const monthKey = nowIst.toISOString().slice(0, 7); // YYYY-MM

    const { start: dayStart, end: dayEnd } = istDayRange(today);
    const mStart = monthStart(monthKey);
    const mEnd   = monthEnd(monthKey);

    // ── Daily earnings ──
    const [dayGift, dayTalk, dayCall] = await Promise.all([
      GiftHistory.aggregate([
        { $match: { receiver_id: oid, created_at: { $gte: dayStart, $lte: dayEnd } } },
        { $group: { _id: null, total: { $sum: '$diamonds_spent' } } },
      ]),
      LiveTalkSession.aggregate([
        { $match: { host_id: oid, started_at: { $gte: dayStart, $lte: dayEnd } } },
        { $group: { _id: null, total: { $sum: '$host_beans_earned' } } },
      ]),
      VideoCallSession.aggregate([
        { $match: { peerId: userId, startedAt: { $gte: dayStart, $lte: dayEnd } } },
        { $group: { _id: null, total: { $sum: '$peer_beans_earned' } } },
      ]),
    ]);

    // ── Monthly earnings ──
    const [moGift, moTalk, moCall] = await Promise.all([
      GiftHistory.aggregate([
        { $match: { receiver_id: oid, created_at: { $gte: mStart, $lt: mEnd } } },
        { $group: { _id: null, total: { $sum: '$diamonds_spent' } } },
      ]),
      LiveTalkSession.aggregate([
        { $match: { host_id: oid, started_at: { $gte: mStart, $lt: mEnd } } },
        { $group: { _id: null, total: { $sum: '$host_beans_earned' } } },
      ]),
      VideoCallSession.aggregate([
        { $match: { peerId: userId, startedAt: { $gte: mStart, $lt: mEnd } } },
        { $group: { _id: null, total: { $sum: '$peer_beans_earned' } } },
      ]),
    ]);

    // ── Call / talk records (last 50) ──
    const [talkSessions, callSessions, giftHistory] = await Promise.all([
      LiveTalkSession.find({ host_id: oid, status: { $in: ['ended', 'ended_insufficient'] } })
        .sort({ ended_at: -1 })
        .limit(30)
        .populate('talker_id', 'username avatar')
        .lean(),
      VideoCallSession.find({ peerId: userId, status: { $in: ['ended', 'ended_insufficient'] } })
        .sort({ endedAt: -1 })
        .limit(30)
        .populate('payerId', 'username avatar')
        .lean(),
      GiftHistory.find({ receiver_id: oid })
        .sort({ created_at: -1 })
        .limit(30)
        .populate('sender_id', 'username avatar')
        .populate('sticker_id', 'name icon_name bg_color icon_color')
        .lean(),
    ]);

    const callRecords = [
      ...talkSessions.map((t) => ({
        id: t._id.toString(),
        type: 'live_talk',
        with_username: t.talker_id?.username || 'User',
        with_avatar:   t.talker_id?.avatar || null,
        duration_mins: t.minutes_charged || 0,
        diamonds_earned: t.host_beans_earned || 0,
        date: t.ended_at || t.started_at,
      })),
      ...callSessions.map((c) => ({
        id: c._id.toString(),
        type: 'video_call',
        with_username: c.payerId?.username || 'User',
        with_avatar:   c.payerId?.avatar || null,
        duration_mins: c.minutesCharged || 0,
        diamonds_earned: c.peer_beans_earned || 0,
        date: c.endedAt || c.startedAt,
      })),
      ...giftHistory.map((g) => ({
        id: g._id.toString(),
        type: 'gift',
        with_username: g.sender_id?.username || 'User',
        with_avatar:   g.sender_id?.avatar || null,
        sticker_name:  g.sticker_id?.name || 'Gift',
        icon_name:     g.sticker_id?.icon_name,
        bg_color:      g.sticker_id?.bg_color,
        icon_color:    g.sticker_id?.icon_color,
        diamonds_earned: g.diamonds_spent || 0,
        duration_mins: null,
        date: g.created_at,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

    const daily_diamonds =
      (dayGift[0]?.total || 0) +
      (dayTalk[0]?.total || 0) +
      (dayCall[0]?.total || 0);

    const monthly_diamonds =
      (moGift[0]?.total || 0) +
      (moTalk[0]?.total || 0) +
      (moCall[0]?.total || 0);

    // Current user diamonds balance
    const userDoc = await User.findById(userId).select('diamonds').lean();

    res.json({
      success: true,
      daily_diamonds,
      monthly_diamonds,
      total_diamonds: userDoc?.diamonds || 0,
      month: monthKey,
      today,
      call_records: callRecords,
    });
  } catch (error) {
    console.error('Earnings error:', error);
    res.status(500).json({ error: 'Failed to get earnings' });
  }
};
