const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const LiveTalkRequest = require('../models/LiveTalkRequest');
const LiveTalkSession = require('../models/LiveTalkSession');
const {
  getBillingSettings,
  buildLiveTalkBalancePayload,
} = require('../utils/billingSettings');
const { getIo, userRoom } = require('../utils/socketEmitter');

exports.checkTalkEligibility = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const user = await User.findById(req.user.id).select('wallet_balance');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const payload = buildLiveTalkBalancePayload(user.wallet_balance, settings);
    if (!payload.canTalk) {
      return res.status(400).json({
        error: `Pehle wallet recharge karo. Live baat ₹${payload.ratePerMin}/min hai.`,
        code: 'INSUFFICIENT_BALANCE',
        ...payload,
      });
    }
    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Live talk eligibility error:', error);
    res.status(500).json({ error: 'Failed to check talk eligibility' });
  }
};

exports.requestTalk = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { sessionId } = req.body;
    const requesterId = req.user.id;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await LiveSession.findById(sessionId).populate('user_id', 'username');
    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'Ye live stream ab active nahi hai' });
    }

    const hostDoc = session.user_id;
    const hostId = hostDoc?._id || hostDoc?.id || session.user_id;
    if (String(hostId) === String(requesterId)) {
      return res.status(400).json({ error: 'Host apne live se request nahi kar sakta' });
    }

    const requester = await User.findById(requesterId).select('wallet_balance username avatar');
    const balance = requester?.wallet_balance || 0;
    const talkPayload = buildLiveTalkBalancePayload(balance, settings);
    if (!talkPayload.canTalk) {
      return res.status(400).json({
        error: `Pehle wallet recharge karo. Live baat ₹${talkPayload.ratePerMin}/min hai.`,
        code: 'INSUFFICIENT_BALANCE',
        ...talkPayload,
      });
    }

    const activeTalk = await LiveTalkSession.findOne({
      session_id: sessionId,
      talker_id: requesterId,
      status: 'active',
    });
    if (activeTalk) {
      return res.json({
        success: true,
        alreadyActive: true,
        talkSessionId: activeTalk._id.toString(),
        status: 'active',
        ...talkPayload,
      });
    }

    let request = await LiveTalkRequest.findOne({
      session_id: sessionId,
      requester_id: requesterId,
      status: 'pending',
    });

    if (!request) {
      request = await LiveTalkRequest.create({
        session_id: sessionId,
        requester_id: requesterId,
        host_id: hostId,
        status: 'pending',
      });
    }

    const io = getIo();
    if (io) {
      io.to(userRoom(hostId)).emit('live_talk_incoming', {
        requestId: request._id.toString(),
        sessionId: String(sessionId),
        requesterId: String(requesterId),
        requesterName: requester?.username || 'Viewer',
        requesterAvatar: requester?.avatar || null,
        ratePerMin: settings.liveTalkRatePerMin,
        billingEnabled: settings.liveTalkBillingEnabled,
      });
    }

    res.json({
      success: true,
      requestId: request._id.toString(),
      status: 'pending',
      ...talkPayload,
    });
  } catch (error) {
    console.error('Live talk request error:', error);
    res.status(500).json({ error: 'Failed to send talk request' });
  }
};

exports.respondTalk = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { requestId, action } = req.body;
    const hostId = req.user.id;
    if (!requestId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'requestId and action (accept/reject) required' });
    }

    const request = await LiveTalkRequest.findById(requestId);
    if (!request || String(request.host_id) !== String(hostId)) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already handled', status: request.status });
    }

    request.status = action === 'accept' ? 'accepted' : 'rejected';
    request.responded_at = new Date();
    await request.save();

    const io = getIo();
    const payload = {
      requestId: request._id.toString(),
      sessionId: String(request.session_id),
      hostId: String(hostId),
      ratePerMin: settings.liveTalkRatePerMin,
      billingEnabled: settings.liveTalkBillingEnabled,
    };

    if (io) {
      const liveRoom = `live_${request.session_id}`;
      if (action === 'accept') {
        io.to(userRoom(request.requester_id)).emit('live_talk_accepted', payload);
        io.to(liveRoom).emit('live_talk_accepted', payload);
        io.to(liveRoom).emit('live_system_message', {
          type: 'talk_accepted',
          username: 'System',
          message: 'Viewer ko baat karne ki permission mil gayi',
        });
      } else {
        io.to(userRoom(request.requester_id)).emit('live_talk_rejected', payload);
        io.to(liveRoom).emit('live_talk_rejected', payload);
      }
    }

    res.json({ success: true, status: request.status, ...payload });
  } catch (error) {
    console.error('Live talk respond error:', error);
    res.status(500).json({ error: 'Failed to respond to talk request' });
  }
};

exports.getTalkStatus = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await LiveSession.findById(sessionId).select('user_id status');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isHost = String(session.user_id) === String(userId);
    const user = await User.findById(userId).select('wallet_balance');
    const talkPayload = buildLiveTalkBalancePayload(user?.wallet_balance, settings);

    const pending = await LiveTalkRequest.findOne({
      session_id: sessionId,
      requester_id: userId,
      status: 'pending',
    }).select('_id status created_at');

    const active = await LiveTalkSession.findOne({
      session_id: sessionId,
      talker_id: userId,
      status: 'active',
    });

    const pendingForHost = isHost
      ? await LiveTalkRequest.find({ session_id: sessionId, status: 'pending' })
        .populate('requester_id', 'username avatar')
        .sort({ created_at: -1 })
        .limit(20)
        .lean()
      : [];

    res.json({
      success: true,
      isHost,
      ...talkPayload,
      pendingRequest: pending ? {
        id: pending._id.toString(),
        status: pending.status,
        created_at: pending.created_at,
      } : null,
      activeTalk: active ? {
        id: active._id.toString(),
        minutesCharged: active.minutes_charged,
        totalCharged: active.total_charged,
        canChat: true,
      } : null,
      canChat: isHost || !!active,
      pendingRequests: pendingForHost.map((r) => ({
        id: r._id.toString(),
        requesterId: r.requester_id?._id?.toString(),
        requesterName: r.requester_id?.username,
        requesterAvatar: r.requester_id?.avatar,
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Live talk status error:', error);
    res.status(500).json({ error: 'Failed to get talk status' });
  }
};

exports.startTalkBilling = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const rate = settings.liveTalkRatePerMin;
    const { sessionId, requestId } = req.body;
    const talkerId = req.user.id;
    if (!sessionId || !requestId) {
      return res.status(400).json({ error: 'sessionId and requestId required' });
    }

    const request = await LiveTalkRequest.findById(requestId);
    if (!request || String(request.requester_id) !== String(talkerId)) {
      return res.status(404).json({ error: 'Talk request not found' });
    }
    if (request.status !== 'accepted') {
      return res.status(400).json({ error: 'Request not accepted yet', status: request.status });
    }

    const existing = await LiveTalkSession.findOne({
      session_id: sessionId,
      talker_id: talkerId,
      status: 'active',
    });
    if (existing) {
      const user = await User.findById(talkerId).select('wallet_balance');
      return res.json({
        success: true,
        talkSessionId: existing._id.toString(),
        wallet_balance: user?.wallet_balance || 0,
        minutesCharged: existing.minutes_charged,
        totalCharged: existing.total_charged,
        ratePerMin: rate,
        billingEnabled: settings.liveTalkBillingEnabled,
        canContinue: !settings.liveTalkBillingEnabled || (user?.wallet_balance || 0) >= rate,
      });
    }

    if (!settings.liveTalkBillingEnabled || rate <= 0) {
      const talkSession = await LiveTalkSession.create({
        session_id: sessionId,
        talker_id: talkerId,
        host_id: request.host_id,
        request_id: requestId,
        rate_per_min: 0,
        minutes_charged: 0,
        total_charged: 0,
        status: 'active',
      });
      const user = await User.findById(talkerId).select('wallet_balance');
      return res.json({
        success: true,
        talkSessionId: talkSession._id.toString(),
        wallet_balance: user?.wallet_balance || 0,
        minutesCharged: 0,
        totalCharged: 0,
        ratePerMin: 0,
        billingEnabled: false,
        canContinue: true,
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: talkerId, wallet_balance: { $gte: rate } },
      { $inc: { wallet_balance: -rate } },
      { new: true },
    ).select('wallet_balance');

    if (!updated) {
      const current = await User.findById(talkerId).select('wallet_balance');
      return res.status(400).json({
        error: 'Insufficient wallet balance',
        code: 'INSUFFICIENT_BALANCE',
        ...buildLiveTalkBalancePayload(current?.wallet_balance, settings),
      });
    }

    const talkSession = await LiveTalkSession.create({
      session_id: sessionId,
      talker_id: talkerId,
      host_id: request.host_id,
      request_id: requestId,
      rate_per_min: rate,
      minutes_charged: 1,
      total_charged: rate,
      status: 'active',
    });

    res.json({
      success: true,
      talkSessionId: talkSession._id.toString(),
      wallet_balance: updated.wallet_balance,
      minutesCharged: 1,
      totalCharged: rate,
      ratePerMin: rate,
      billingEnabled: true,
      canContinue: updated.wallet_balance >= rate,
    });
  } catch (error) {
    console.error('Live talk start billing error:', error);
    res.status(500).json({ error: 'Failed to start talk billing' });
  }
};

exports.tickTalkBilling = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const rate = settings.liveTalkRatePerMin;
    const { sessionId, talkSessionId } = req.body;
    if (!sessionId || !talkSessionId) {
      return res.status(400).json({ error: 'sessionId and talkSessionId required' });
    }

    const talkSession = await LiveTalkSession.findOne({
      _id: talkSessionId,
      session_id: sessionId,
      talker_id: req.user.id,
      status: 'active',
    });
    if (!talkSession) {
      return res.status(404).json({ error: 'Active talk session not found' });
    }

    if (!settings.liveTalkBillingEnabled || rate <= 0) {
      return res.json({
        success: true,
        wallet_balance: (await User.findById(req.user.id).select('wallet_balance'))?.wallet_balance || 0,
        minutesCharged: talkSession.minutes_charged,
        totalCharged: talkSession.total_charged,
        ratePerMin: 0,
        canContinue: true,
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: req.user.id, wallet_balance: { $gte: rate } },
      { $inc: { wallet_balance: -rate } },
      { new: true },
    ).select('wallet_balance');

    if (!updated) {
      talkSession.status = 'ended_insufficient';
      talkSession.ended_at = new Date();
      await talkSession.save();
      return res.status(400).json({
        error: 'Wallet balance khatam — baat band ho rahi hai',
        code: 'BALANCE_EXHAUSTED',
        shouldEndTalk: true,
        minutesCharged: talkSession.minutes_charged,
        totalCharged: talkSession.total_charged,
      });
    }

    talkSession.minutes_charged += 1;
    talkSession.total_charged += rate;
    talkSession.last_tick_at = new Date();
    await talkSession.save();

    res.json({
      success: true,
      wallet_balance: updated.wallet_balance,
      minutesCharged: talkSession.minutes_charged,
      totalCharged: talkSession.total_charged,
      ratePerMin: rate,
      canContinue: updated.wallet_balance >= rate,
    });
  } catch (error) {
    console.error('Live talk tick billing error:', error);
    res.status(500).json({ error: 'Failed to bill talk minute' });
  }
};

exports.endTalkBilling = async (req, res) => {
  try {
    const { sessionId, talkSessionId } = req.body;
    const query = { talker_id: req.user.id, status: 'active' };
    if (talkSessionId) query._id = talkSessionId;
    if (sessionId) query.session_id = sessionId;

    const talkSession = await LiveTalkSession.findOneAndUpdate(
      query,
      { status: 'ended', ended_at: new Date() },
      { new: true },
    );

    res.json({
      success: true,
      ended: !!talkSession,
      minutesCharged: talkSession?.minutes_charged || 0,
      totalCharged: talkSession?.total_charged || 0,
    });
  } catch (error) {
    console.error('Live talk end billing error:', error);
    res.status(500).json({ error: 'Failed to end talk session' });
  }
};

/** Used by socket handler to verify chat permission */
exports.userCanChatOnLive = async (sessionId, userId) => {
  const settings = await getBillingSettings();
  const session = await LiveSession.findById(sessionId).select('user_id status');
  if (!session || session.status !== 'active') return false;
  if (String(session.user_id) === String(userId)) return true;

  const accepted = await LiveTalkRequest.findOne({
    session_id: sessionId,
    requester_id: userId,
    status: 'accepted',
  }).select('_id');
  if (!accepted) return false;

  if (!settings.liveTalkBillingEnabled) return true;

  const active = await LiveTalkSession.findOne({
    session_id: sessionId,
    talker_id: userId,
    status: 'active',
  }).select('_id');
  return !!active;
};