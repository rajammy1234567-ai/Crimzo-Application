const User = require('../models/User');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { refundWithdrawalBalance } = require('../utils/withdrawalHelpers');
const LiveSession = require('../models/LiveSession');
const LiveTalkRequest = require('../models/LiveTalkRequest');
const LiveTalkSession = require('../models/LiveTalkSession');
const VideoCallSession = require('../models/VideoCallSession');
const Reel = require('../models/Reel');
const Sticker = require('../models/Sticker');
const {
  getBillingSettings,
  updateBillingSettings,
} = require('../utils/billingSettings');
const mongoose = require('mongoose');
const { fetchUserTransactionHistory } = require('../utils/transactionHistory');

async function aggregateUserEarnings() {
  const [videoByPeer, liveByHost] = await Promise.all([
    VideoCallSession.aggregate([
      { $match: { peerId: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$peerId',
          videoCallBeans: { $sum: '$peer_beans_earned' },
          videoCallSessions: { $sum: 1 },
          videoCallRevenue: { $sum: '$totalCharged' },
        },
      },
    ]),
    LiveTalkSession.aggregate([
      {
        $group: {
          _id: '$host_id',
          liveTalkBeans: { $sum: '$host_beans_earned' },
          liveTalkSessions: { $sum: 1 },
          liveTalkRevenue: { $sum: '$total_charged' },
        },
      },
    ]),
  ]);

  const merged = new Map();

  for (const row of videoByPeer) {
    const id = String(row._id);
    merged.set(id, {
      userId: id,
      videoCallBeans: row.videoCallBeans || 0,
      liveTalkBeans: 0,
      videoCallSessions: row.videoCallSessions || 0,
      liveTalkSessions: 0,
      videoCallRevenue: row.videoCallRevenue || 0,
      liveTalkRevenue: 0,
    });
  }

  for (const row of liveByHost) {
    const id = String(row._id);
    const existing = merged.get(id) || {
      userId: id,
      videoCallBeans: 0,
      liveTalkBeans: 0,
      videoCallSessions: 0,
      liveTalkSessions: 0,
      videoCallRevenue: 0,
      liveTalkRevenue: 0,
    };
    existing.liveTalkBeans = row.liveTalkBeans || 0;
    existing.liveTalkSessions = row.liveTalkSessions || 0;
    existing.liveTalkRevenue = row.liveTalkRevenue || 0;
    merged.set(id, existing);
  }

  const userIds = [...merged.keys()]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('username crimzo_id').lean()
    : [];
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return [...merged.values()]
    .map((row) => {
      const user = userMap.get(row.userId);
      const totalBeans = (row.videoCallBeans || 0) + (row.liveTalkBeans || 0);
      const totalSessions = (row.videoCallSessions || 0) + (row.liveTalkSessions || 0);
      const totalRevenue = (row.videoCallRevenue || 0) + (row.liveTalkRevenue || 0);
      return {
        userId: row.userId,
        username: user?.username || null,
        crimzoId: user?.crimzo_id || null,
        videoCallBeans: row.videoCallBeans || 0,
        liveTalkBeans: row.liveTalkBeans || 0,
        totalBeans,
        videoCallSessions: row.videoCallSessions || 0,
        liveTalkSessions: row.liveTalkSessions || 0,
        totalSessions,
        videoCallRevenue: row.videoCallRevenue || 0,
        liveTalkRevenue: row.liveTalkRevenue || 0,
        totalRevenue,
      };
    })
    .filter((row) => row.totalBeans > 0 || row.totalRevenue > 0)
    .sort((a, b) => b.totalBeans - a.totalBeans);
}
const jwt = require('jsonwebtoken');
const {
  emitStreamEnded,
  emitUserBanned,
  emitDiamondUpdate,
  emitReelDeleted,
  emitStickersUpdated,
  emitLiveStreamsUpdated,
} = require('../utils/socketEmitter');

exports.adminLogin = async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminPassword || !jwtSecret) {
    return res.status(503).json({ error: 'Admin login not configured on server' });
  }

  if (password === adminPassword) {
    const token = jwt.sign(
      { is_admin: true, identifier: 'superadmin' },
      jwtSecret,
      { expiresIn: '7d' },
    );
    res.json({ token, message: 'Admin authentication successful' });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
  }
};

// ====================== DASHBOARD ======================
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeStreams = await LiveSession.countDocuments({ status: 'active' });
    const totalReels = await Reel.countDocuments();
    const diamondsAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$diamonds' } } }
    ]);
    const totalDiamonds = diamondsAgg[0]?.total || 0;
    const walletAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$wallet_balance' } } },
    ]);
    const totalWalletBalance = walletAgg[0]?.total || 0;

    const videoCallRevenueAgg = await VideoCallSession.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$totalCharged' },
          sessions: { $sum: 1 },
          peerBeans: { $sum: '$peer_beans_earned' },
          platformBeans: { $sum: '$platform_beans_earned' },
        },
      },
    ]);
    const liveTalkRevenueAgg = await LiveTalkSession.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$total_charged' },
          sessions: { $sum: 1 },
          hostBeans: { $sum: '$host_beans_earned' },
          platformBeans: { $sum: '$platform_beans_earned' },
        },
      },
    ]);
    const billingSettings = await getBillingSettings();
    const videoPeerBeans = videoCallRevenueAgg[0]?.peerBeans || 0;
    const videoPlatformBeans = videoCallRevenueAgg[0]?.platformBeans || 0;
    const liveHostBeans = liveTalkRevenueAgg[0]?.hostBeans || 0;
    const livePlatformBeans = liveTalkRevenueAgg[0]?.platformBeans || 0;
    const ownerPlatformBeans = billingSettings.platformBeansEarned || 0;

    // Chart Data (Last 7 Days User Registration) - Mongo version
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const chartData = await User.aggregate([
      { $match: { created_at: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, _id: 0 } }
    ]);

    res.json({
      stats: {
        totalUsers,
        activeStreams,
        totalReels,
        totalDiamondsInCirculation: totalDiamonds,
        totalWalletBalance,
        videoCallRevenue: videoCallRevenueAgg[0]?.total || 0,
        videoCallSessions: videoCallRevenueAgg[0]?.sessions || 0,
        videoCallPeerBeans: videoPeerBeans,
        videoCallPlatformBeans: videoPlatformBeans,
        liveTalkHostBeans: liveHostBeans,
        liveTalkPlatformBeans: livePlatformBeans,
        platformBeansEarned: ownerPlatformBeans,
        totalUserBeansEarned: videoPeerBeans + liveHostBeans,
        totalOwnerBeans: ownerPlatformBeans,
        receiverShare: billingSettings.callReceiverShare ?? 0.7,
        platformShare: billingSettings.callPlatformShare ?? 0.3,
        liveTalkRevenue: liveTalkRevenueAgg[0]?.total || 0,
        liveTalkSessions: liveTalkRevenueAgg[0]?.sessions || 0,
        pendingTalkRequests: await LiveTalkRequest.countDocuments({ status: 'pending' }),
        pendingWithdrawals: await WithdrawalRequest.countDocuments({ status: 'pending' }),
        videoCallRatePerMin: billingSettings.videoCallRatePerMin,
        liveTalkRatePerMin: billingSettings.liveTalkRatePerMin,
      },
      chartData,
      billingSettings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== USERS ======================
exports.getUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20, filter: statusFilter = 'all' } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const searchRegex = search ? new RegExp(search, 'i') : null;

    const filter = {};
    if (searchRegex) {
      filter.$or = [
        { username: searchRegex },
        { email: searchRegex },
        { crimzo_id: searchRegex },
      ];
    }
    if (statusFilter === 'banned') filter.is_banned = true;
    else if (statusFilter === 'active') filter.is_banned = { $ne: true };

    const users = await User.find(filter)
      .select('id crimzo_id username email country diamonds beans status is_banned created_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments(filter);

    res.json({
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(userId)
      .select('username email crimzo_id diamonds beans wallet_balance created_at')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const { transactions, summary } = await fetchUserTransactionHistory(userId, limit);

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        crimzoId: user.crimzo_id,
        diamonds: user.diamonds || 0,
        beans: user.beans || 0,
        walletBalance: user.wallet_balance || 0,
        joinedAt: user.created_at,
      },
      transactions,
      summary,
    });
  } catch (err) {
    console.error('Admin user transactions error:', err);
    res.status(500).json({ error: err.message || 'Failed to load user transactions' });
  }
};

exports.toggleBanUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_banned } = req.body;

    if (typeof is_banned !== 'boolean') {
      return res.status(400).json({ error: 'is_banned must be a boolean' });
    }

    const updates = { is_banned };
    if (is_banned) {
      updates.status = 'offline';
      updates.is_online = false;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (is_banned) {
      const activeSessions = await LiveSession.find({ user_id: userId, status: 'active' }).select('_id');

      await LiveSession.updateMany(
        { user_id: userId, status: 'active' },
        { status: 'ended', ended_at: new Date() }
      );

      activeSessions.forEach((session) => {
        emitStreamEnded(
          session._id,
          'This stream was ended because the host account was suspended.',
          'admin_ban'
        );
      });

      if (activeSessions.length > 0) {
        emitLiveStreamsUpdated();
      }

      emitUserBanned(userId);
    }

    res.json({ success: true, is_banned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateDiamonds = async (req, res) => {
  try {
    const userId = req.params.id;
    const { amount, action } = req.body; // action: 'add' or 'deduct'
    const value = Number(amount);

    if (isNaN(value)) return res.status(400).json({ error: 'Invalid amount' });

    let update = {};
    if (action === 'add') {
      update = { $inc: { diamonds: value } };
    } else if (action === 'deduct') {
      update = { $inc: { diamonds: -value } };
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, select: 'diamonds' }
    );

    // Ensure diamonds >= 0 for deduct
    if (user && user.diamonds < 0) {
      user.diamonds = 0;
      await user.save();
    }

    if (user) {
      emitDiamondUpdate(userId, user.diamonds);
    }

    res.json({ success: true, diamonds: user ? user.diamonds : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== BILLING SETTINGS ======================
exports.getBillingSettings = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const [videoStats, talkStats, pendingRequests, userEarnings] = await Promise.all([
      VideoCallSession.aggregate([
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalCharged' },
            minutes: { $sum: '$minutesCharged' },
            count: { $sum: 1 },
            peerBeans: { $sum: '$peer_beans_earned' },
            platformBeans: { $sum: '$platform_beans_earned' },
          },
        },
      ]),
      LiveTalkSession.aggregate([
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total_charged' },
            minutes: { $sum: '$minutes_charged' },
            count: { $sum: 1 },
            hostBeans: { $sum: '$host_beans_earned' },
            platformBeans: { $sum: '$platform_beans_earned' },
          },
        },
      ]),
      LiveTalkRequest.countDocuments({ status: 'pending' }),
      aggregateUserEarnings(),
    ]);

    const videoPeerBeans = videoStats[0]?.peerBeans || 0;
    const videoPlatformBeans = videoStats[0]?.platformBeans || 0;
    const liveHostBeans = talkStats[0]?.hostBeans || 0;
    const livePlatformBeans = talkStats[0]?.platformBeans || 0;

    res.json({
      settings: {
        video_call_rate_per_min_inr: settings.videoCallRatePerMin,
        live_talk_rate_per_min_inr: settings.liveTalkRatePerMin,
        video_call_billing_enabled: settings.videoCallBillingEnabled,
        live_talk_billing_enabled: settings.liveTalkBillingEnabled,
        updated_at: settings.updated_at,
        receiver_share: settings.callReceiverShare ?? 0.7,
        platform_share: settings.callPlatformShare ?? 0.3,
      },
      stats: {
        videoCallRevenue: videoStats[0]?.revenue || 0,
        videoCallMinutes: videoStats[0]?.minutes || 0,
        videoCallSessions: videoStats[0]?.count || 0,
        videoCallPeerBeans: videoPeerBeans,
        videoCallPlatformBeans: videoPlatformBeans,
        liveTalkRevenue: talkStats[0]?.revenue || 0,
        liveTalkMinutes: talkStats[0]?.minutes || 0,
        liveTalkSessions: talkStats[0]?.count || 0,
        liveTalkHostBeans: liveHostBeans,
        liveTalkPlatformBeans: livePlatformBeans,
        totalUserBeansEarned: videoPeerBeans + liveHostBeans,
        totalOwnerBeans: settings.platformBeansEarned || 0,
        pendingTalkRequests: pendingRequests,
      },
      userEarnings,
      ownerEarnings: {
        totalPlatformBeans: settings.platformBeansEarned || 0,
        videoCallPlatformBeans: videoPlatformBeans,
        liveTalkPlatformBeans: livePlatformBeans,
        receiverShare: settings.callReceiverShare ?? 0.7,
        platformShare: settings.callPlatformShare ?? 0.3,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBillingSettings = async (req, res) => {
  try {
    const {
      video_call_rate_per_min_inr,
      live_talk_rate_per_min_inr,
      video_call_billing_enabled,
      live_talk_billing_enabled,
    } = req.body;

    const settings = await updateBillingSettings({
      video_call_rate_per_min_inr,
      live_talk_rate_per_min_inr,
      video_call_billing_enabled,
      live_talk_billing_enabled,
    });

    res.json({
      success: true,
      settings: {
        video_call_rate_per_min_inr: settings.videoCallRatePerMin,
        live_talk_rate_per_min_inr: settings.liveTalkRatePerMin,
        video_call_billing_enabled: settings.videoCallBillingEnabled,
        live_talk_billing_enabled: settings.liveTalkBillingEnabled,
        updated_at: settings.updated_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBillingSessions = async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 50);
    const skip = (pageNum - 1) * limitNum;

    let videoCalls = [];
    let liveTalks = [];

    if (type === 'all' || type === 'video') {
      videoCalls = await VideoCallSession.find()
        .sort({ createdAt: -1 })
        .skip(type === 'video' ? skip : 0)
        .limit(type === 'video' ? limitNum : 10)
        .populate('payerId', 'username crimzo_id')
        .lean();

      const peerIds = [...new Set(
        videoCalls.map((s) => s.peerId).filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
      )];
      if (peerIds.length) {
        const peers = await User.find({ _id: { $in: peerIds } }).select('username crimzo_id').lean();
        const peerMap = new Map(peers.map((u) => [u._id.toString(), u]));
        videoCalls = videoCalls.map((s) => ({
          ...s,
          peerUser: s.peerId ? peerMap.get(String(s.peerId)) : null,
        }));
      }
    }

    if (type === 'all' || type === 'talk') {
      liveTalks = await LiveTalkSession.find()
        .sort({ createdAt: -1 })
        .skip(type === 'talk' ? skip : 0)
        .limit(type === 'talk' ? limitNum : 10)
        .populate('talker_id', 'username crimzo_id')
        .populate('host_id', 'username crimzo_id')
        .populate('session_id', 'channel_name status')
        .lean();
    }

    res.json({
      videoCalls: videoCalls.map((s) => ({
        id: s._id.toString(),
        type: 'video_call',
        payer: s.payerId?.username,
        payerCrimzoId: s.payerId?.crimzo_id,
        peer: s.peerUser?.username || null,
        peerCrimzoId: s.peerUser?.crimzo_id || null,
        crimzo_id: s.payerId?.crimzo_id,
        channelName: s.channelName,
        minutesCharged: s.minutesCharged,
        totalCharged: s.totalCharged,
        receiverBeans: s.peer_beans_earned || 0,
        platformBeans: s.platform_beans_earned || 0,
        ratePerMin: s.ratePerMin,
        status: s.status,
        startedAt: s.startedAt,
      })),
      liveTalks: liveTalks.map((s) => ({
        id: s._id.toString(),
        type: 'live_talk',
        talker: s.talker_id?.username,
        host: s.host_id?.username,
        hostCrimzoId: s.host_id?.crimzo_id,
        crimzo_id: s.talker_id?.crimzo_id,
        sessionStatus: s.session_id?.status,
        minutesCharged: s.minutes_charged,
        totalCharged: s.total_charged,
        receiverBeans: s.host_beans_earned || 0,
        platformBeans: s.platform_beans_earned || 0,
        ratePerMin: s.rate_per_min,
        status: s.status,
        startedAt: s.started_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBillingEarnings = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const [videoPlatformAgg, livePlatformAgg, userEarnings] = await Promise.all([
      VideoCallSession.aggregate([
        { $group: { _id: null, platformBeans: { $sum: '$platform_beans_earned' } } },
      ]),
      LiveTalkSession.aggregate([
        { $group: { _id: null, platformBeans: { $sum: '$platform_beans_earned' } } },
      ]),
      aggregateUserEarnings(),
    ]);

    res.json({
      ownerEarnings: {
        totalPlatformBeans: settings.platformBeansEarned || 0,
        videoCallPlatformBeans: videoPlatformAgg[0]?.platformBeans || 0,
        liveTalkPlatformBeans: livePlatformAgg[0]?.platformBeans || 0,
        receiverShare: settings.callReceiverShare ?? 0.7,
        platformShare: settings.callPlatformShare ?? 0.3,
      },
      userEarnings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== WITHDRAWALS ======================
function formatAdminWithdrawal(row) {
  const user = row.user_id || {};
  const snap = row.payout_snapshot || {};
  return {
    id: row._id.toString(),
    userId: user._id?.toString() || row.user_id?.toString(),
    username: user.username || null,
    crimzoId: user.crimzo_id || null,
    email: user.email || null,
    amountInr: row.amount_inr,
    beansUsed: row.beans_used,
    status: row.status,
    payoutMode: row.payout_mode,
    payoutMethod: row.payout_method,
    payoutDisplay: row.payout_display,
    payoutSnapshot: snap,
    utr: row.utr || null,
    adminNote: row.admin_note || null,
    failureReason: row.failure_reason || null,
    balanceRefunded: row.balance_refunded || false,
    scheduledCreditDate: row.scheduled_credit_date || null,
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
    processedBy: row.processed_by || null,
  };
}

exports.getWithdrawals = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 50);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const [rows, total, pendingCount, processingCount] = await Promise.all([
      WithdrawalRequest.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user_id', 'username crimzo_id email')
        .lean(),
      WithdrawalRequest.countDocuments(filter),
      WithdrawalRequest.countDocuments({ status: 'pending' }),
      WithdrawalRequest.countDocuments({ status: 'processing' }),
    ]);

    res.json({
      withdrawals: rows.map(formatAdminWithdrawal),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      counts: { pending: pendingCount, processing: processingCount },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.completeWithdrawal = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const utr = String(req.body.utr || '').trim();
    const adminNote = String(req.body.admin_note || '').trim();

    if (!utr) {
      return res.status(400).json({ error: 'UTR / transaction reference is required' });
    }

    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

    if (!['pending', 'processing'].includes(withdrawal.status)) {
      return res.status(400).json({ error: `Cannot complete withdrawal with status: ${withdrawal.status}` });
    }

    withdrawal.status = 'completed';
    withdrawal.utr = utr;
    withdrawal.admin_note = adminNote || undefined;
    withdrawal.processed_by = req.admin?.identifier || 'admin';
    withdrawal.completed_at = new Date();
    await withdrawal.save();

    res.json({
      success: true,
      withdrawal: formatAdminWithdrawal(
        await WithdrawalRequest.findById(withdrawalId).populate('user_id', 'username crimzo_id email').lean(),
      ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const reason = String(req.body.reason || '').trim() || 'Rejected by admin';

    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

    if (!['pending', 'processing'].includes(withdrawal.status)) {
      return res.status(400).json({ error: `Cannot reject withdrawal with status: ${withdrawal.status}` });
    }

    withdrawal.status = 'failed';
    withdrawal.failure_reason = reason;
    withdrawal.admin_note = reason;
    withdrawal.processed_by = req.admin?.identifier || 'admin';
    await withdrawal.save();
    await refundWithdrawalBalance(withdrawal);

    res.json({
      success: true,
      refunded: true,
      withdrawal: formatAdminWithdrawal(
        await WithdrawalRequest.findById(withdrawalId).populate('user_id', 'username crimzo_id email').lean(),
      ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== STREAMS ======================
exports.getStreams = async (req, res) => {
  try {
    const { status = 'active' } = req.query; // active or ended
    const billingSettings = await getBillingSettings();

    const streams = await LiveSession.find({ status })
      .sort({ started_at: -1 })
      .limit(50)
      .populate('user_id', 'username crimzo_id avatar')
      .lean();

    // flatten for frontend compatibility
    const formatted = streams.map(s => ({
      ...s,
      username: s.user_id?.username,
      crimzo_id: s.user_id?.crimzo_id,
      avatar: s.user_id?.avatar,
      user_id: s.user_id?._id || s.user_id,
      talk_rate_per_min: billingSettings.liveTalkRatePerMin,
      talk_billing_enabled: billingSettings.liveTalkBillingEnabled,
    }));

    res.json({ streams: formatted, billing: billingSettings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.terminateStream = async (req, res) => {
  try {
    const streamId = req.params.id;
    
    // Terminate stream
    const session = await LiveSession.findByIdAndUpdate(
      streamId,
      { status: 'ended', ended_at: new Date() },
      { new: true }
    );

    await LiveTalkRequest.updateMany(
      { session_id: streamId, status: 'pending' },
      { status: 'cancelled', responded_at: new Date() },
    );
    await LiveTalkSession.updateMany(
      { session_id: streamId, status: 'active' },
      { status: 'ended', ended_at: new Date() },
    );
    
    // Update host status
    if (session && session.user_id) {
      await User.findByIdAndUpdate(session.user_id, { status: 'online' });
    }

    emitStreamEnded(
      streamId,
      'This stream was ended by a moderator.',
      'admin'
    );
    emitLiveStreamsUpdated();

    res.json({ success: true, message: 'Stream force terminated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== REELS ======================
exports.getReels = async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = 30;
    const skip = (Number(page) - 1) * limit;

    const reels = await Reel.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user_id', 'username crimzo_id avatar')
      .lean();

    const formatted = reels.map(r => ({
      ...r,
      username: r.user_id?.username,
      crimzo_id: r.user_id?.crimzo_id,
      user_id: r.user_id // Keep the full user object so avatar is accessible
    }));

    res.json({ reels: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteReel = async (req, res) => {
  try {
    const reelId = req.params.id;
    await Reel.findByIdAndDelete(reelId);
    // also clean likes/comments if needed
    const ReelLike = require('../models/ReelLike');
    const ReelComment = require('../models/ReelComment');
    await ReelLike.deleteMany({ reel_id: reelId });
    await ReelComment.deleteMany({ reel_id: reelId });

    emitReelDeleted(reelId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== STICKERS ======================
exports.getStickers = async (req, res) => {
  try {
    const stickers = await Sticker.find().sort({ price: 1 }).lean();
    res.json({ stickers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSticker = async (req, res) => {
  try {
    const { name, emoji, icon_name, icon_color, bg_color, category, price, is_animated } = req.body;
    await Sticker.create({ name, emoji, icon_name, icon_color, bg_color, category, price, is_animated });
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSticker = async (req, res) => {
  try {
    const stickerId = req.params.id;
    const updates = req.body;
    await Sticker.findByIdAndUpdate(stickerId, updates);
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSticker = async (req, res) => {
  try {
    const stickerId = req.params.id;
    await Sticker.findByIdAndDelete(stickerId);
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== TASKS ======================
const Task = require('../models/Task');

exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.find().sort({ sort_order: 1, section: 1 }).lean();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.key || !body.title || !body.section) {
      return res.status(400).json({ error: 'key, title, and section are required' });
    }
    const exists = await Task.findOne({ key: body.key });
    if (exists) return res.status(400).json({ error: 'Task key already exists' });
    const task = await Task.create(body);
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
