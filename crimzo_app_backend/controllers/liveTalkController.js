const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const LiveTalkRequest = require('../models/LiveTalkRequest');
const LiveTalkSession = require('../models/LiveTalkSession');
const {
  getBillingSettings,
  buildLiveTalkBalancePayload,
} = require('../utils/billingSettings');
const { inrToBeans } = require('../utils/beanConversion');
const { chargeLiveTalkMinute, InsufficientWalletError } = require('../utils/liveTalkCharge');
const { getIo, userRoom } = require('../utils/socketEmitter');
const { resolveUserRates } = require('../utils/userRates');

function privateTalkRoom(talkSessionId) {
  return `talk_private_${String(talkSessionId)}`;
}

async function getHostChatRate(hostId, settings) {
  const host = await User.findById(hostId).select('chat_rate_per_min_inr voice_rate_per_min_inr');
  if (!host) return settings.liveTalkRatePerMin;
  return resolveUserRates(host, settings).chatRatePerMin;
}

async function emitTalkPrivateReady(io, talkSession) {
  if (!io || !talkSession) return;
  const talker = await User.findById(talkSession.talker_id).select('username avatar').lean();
  const host = await User.findById(talkSession.host_id).select('username avatar').lean();
  const payload = {
    talkSessionId: talkSession._id.toString(),
    sessionId: String(talkSession.session_id),
    talkerId: String(talkSession.talker_id),
    talkerName: talker?.username || 'Viewer',
    talkerAvatar: talker?.avatar || null,
    hostId: String(talkSession.host_id),
    hostName: host?.username || 'Host',
    hostAvatar: host?.avatar || null,
  };
  io.to(userRoom(talkSession.talker_id)).emit('talk_private_ready', payload);
  io.to(userRoom(talkSession.host_id)).emit('talk_private_ready', payload);
}

exports.privateTalkRoom = privateTalkRoom;

exports.verifyPrivateTalkAccess = async (talkSessionId, userId) => {
  if (!talkSessionId || !userId) return null;
  const talk = await LiveTalkSession.findOne({
    _id: talkSessionId,
    status: 'active',
  }).select('host_id talker_id session_id');
  if (!talk) return null;
  const uid = String(userId);
  if (String(talk.host_id) !== uid && String(talk.talker_id) !== uid) return null;
  return talk;
};

exports.checkTalkEligibility = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const user = await User.findById(req.user.id).select('wallet_balance');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const payload = buildLiveTalkBalancePayload(user.wallet_balance, settings);
    if (!payload.canTalk) {
      return res.status(400).json({
        error: `Please recharge your wallet first. Live talk costs ₹${payload.ratePerMin}/min.`,
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

    const session = await LiveSession.findById(sessionId).populate(
      'user_id',
      'username chat_rate_per_min_inr voice_rate_per_min_inr',
    );
    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'This live stream is no longer active' });
    }

    const hostDoc = session.user_id;
    const hostId = hostDoc?._id || hostDoc?.id || session.user_id;
    const hostRates = resolveUserRates(hostDoc, settings);
    const chatRate = hostRates.chatRatePerMin;
    if (String(hostId) === String(requesterId)) {
      return res.status(400).json({ error: 'Hosts cannot request talk on their own stream' });
    }

    const requester = await User.findById(requesterId).select('wallet_balance username avatar');
    const balance = requester?.wallet_balance || 0;
    const talkPayload = buildLiveTalkBalancePayload(balance, settings, chatRate);
    talkPayload.beansPerMin = hostRates.chatBeansPerMin;
    if (!talkPayload.canTalk) {
      return res.status(400).json({
        error: `Please recharge your wallet first. Live chat costs ₹${talkPayload.ratePerMin}/min.`,
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
      const incomingPayload = {
        requestId: request._id.toString(),
        sessionId: String(sessionId),
        requesterId: String(requesterId),
        requesterName: requester?.username || 'Viewer',
        requesterAvatar: requester?.avatar || null,
        ratePerMin: chatRate,
        beansPerMin: hostRates.chatBeansPerMin,
        billingEnabled: settings.liveTalkBillingEnabled,
      };
      io.to(userRoom(hostId)).emit('live_talk_incoming', incomingPayload);
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
    const hostUser = await User.findById(hostId).select('chat_rate_per_min_inr voice_rate_per_min_inr');
    const hostRates = resolveUserRates(hostUser, settings);
    const chatRate = hostRates.chatRatePerMin;
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
      ratePerMin: chatRate,
      beansPerMin: hostRates.chatBeansPerMin,
      billingEnabled: settings.liveTalkBillingEnabled,
    };

    if (io) {
      if (action === 'accept') {
        io.to(userRoom(request.requester_id)).emit('live_talk_accepted', payload);
        io.to(userRoom(hostId)).emit('live_talk_accepted', {
          ...payload,
          requesterId: String(request.requester_id),
        });
      } else {
        io.to(userRoom(request.requester_id)).emit('live_talk_rejected', payload);
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

    const session = await LiveSession.findById(sessionId)
      .populate('user_id', 'chat_rate_per_min_inr voice_rate_per_min_inr')
      .select('user_id status');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isHost = String(session.user_id?._id || session.user_id) === String(userId);
    const hostDoc = session.user_id;
    const hostRates = resolveUserRates(hostDoc, settings);
    const chatRate = hostRates.chatRatePerMin;
    const user = await User.findById(userId).select('wallet_balance');
    const talkPayload = buildLiveTalkBalancePayload(user?.wallet_balance, settings, chatRate);
    talkPayload.beansPerMin = hostRates.chatBeansPerMin;
    talkPayload.hostVoiceRatePerMin = hostRates.voiceRatePerMin;
    talkPayload.hostVoiceBeansPerMin = hostRates.voiceBeansPerMin;

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

    let hostChatEarnings = null;
    if (isHost) {
      const activeTalks = await LiveTalkSession.find({
        session_id: sessionId,
        host_id: userId,
        status: 'active',
      })
        .populate('talker_id', 'username avatar')
        .select('talker_id minutes_charged host_beans_earned total_charged')
        .lean();

      const sessionBeansEarned = activeTalks.reduce((sum, t) => sum + (t.host_beans_earned || 0), 0);
      hostChatEarnings = {
        beansPerMinute: hostRates.chatBeansPerMin,
        ratePerMin: chatRate,
        sessionBeansEarned,
        activeChats: activeTalks.length,
        activeViewers: activeTalks.map((t) => ({
          talkSessionId: t._id.toString(),
          talkerId: t.talker_id?._id?.toString() || String(t.talker_id),
          requesterName: t.talker_id?.username || 'Viewer',
          minutesCharged: t.minutes_charged,
          beansEarned: t.host_beans_earned || 0,
        })),
      };
    }

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
      hostChatEarnings,
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

    const rate = await getHostChatRate(request.host_id, settings);

    const existing = await LiveTalkSession.findOne({
      session_id: sessionId,
      talker_id: talkerId,
      status: 'active',
    });
    if (existing) {
      const user = await User.findById(talkerId).select('wallet_balance');
      const io = getIo();
      await emitTalkPrivateReady(io, existing);
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
      const io = getIo();
      await emitTalkPrivateReady(io, talkSession);
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

    let chargeResult;
    try {
      chargeResult = await chargeLiveTalkMinute({
        talkerId,
        hostId: request.host_id,
        rateInr: rate,
      });
    } catch (e) {
      if (e instanceof InsufficientWalletError) {
        const current = await User.findById(talkerId).select('wallet_balance');
        return res.status(400).json({
          error: 'Insufficient wallet balance',
          code: 'INSUFFICIENT_BALANCE',
          ...buildLiveTalkBalancePayload(current?.wallet_balance, settings),
        });
      }
      throw e;
    }

    const talkSession = await LiveTalkSession.create({
      session_id: sessionId,
      talker_id: talkerId,
      host_id: request.host_id,
      request_id: requestId,
      rate_per_min: rate,
      minutes_charged: 1,
      total_charged: rate,
      host_beans_earned: chargeResult.beansEarned,
      platform_beans_earned: chargeResult.platformBeans || 0,
      status: 'active',
    });

    const io = getIo();
    await emitTalkPrivateReady(io, talkSession);
    if (io && chargeResult.beansEarned > 0) {
      io.to(userRoom(request.host_id)).emit('live_talk_host_earning', {
        sessionId: String(sessionId),
        hostId: String(request.host_id),
        beansEarned: chargeResult.beansEarned,
        beansPerMinute: chargeResult.beansEarned,
        talkSessionId: talkSession._id.toString(),
      });
    }

    res.json({
      success: true,
      talkSessionId: talkSession._id.toString(),
      wallet_balance: chargeResult.wallet_balance,
      hostBeansEarned: chargeResult.beansEarned,
      minutesCharged: 1,
      totalCharged: rate,
      ratePerMin: rate,
      billingEnabled: true,
      canContinue: chargeResult.wallet_balance >= rate,
    });
  } catch (error) {
    console.error('Live talk start billing error:', error);
    res.status(500).json({ error: 'Failed to start talk billing' });
  }
};

exports.tickTalkBilling = async (req, res) => {
  try {
    const settings = await getBillingSettings();
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

    const rate = talkSession.rate_per_min || await getHostChatRate(talkSession.host_id, settings);

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

    let chargeResult;
    try {
      chargeResult = await chargeLiveTalkMinute({
        talkerId: req.user.id,
        hostId: talkSession.host_id,
        rateInr: rate,
      });
    } catch (e) {
      if (e instanceof InsufficientWalletError) {
        talkSession.status = 'ended_insufficient';
        talkSession.ended_at = new Date();
        await talkSession.save();
        return res.status(400).json({
          error: 'Wallet balance exhausted — ending the chat.',
          code: 'BALANCE_EXHAUSTED',
          shouldEndTalk: true,
          minutesCharged: talkSession.minutes_charged,
          totalCharged: talkSession.total_charged,
        });
      }
      throw e;
    }

    talkSession.minutes_charged += 1;
    talkSession.total_charged += rate;
    talkSession.host_beans_earned = (talkSession.host_beans_earned || 0) + chargeResult.beansEarned;
    talkSession.platform_beans_earned = (talkSession.platform_beans_earned || 0) + (chargeResult.platformBeans || 0);
    talkSession.last_tick_at = new Date();
    await talkSession.save();

    const io = getIo();
    if (io && chargeResult.beansEarned > 0) {
      io.to(userRoom(talkSession.host_id)).emit('live_talk_host_earning', {
        sessionId: String(sessionId),
        hostId: String(talkSession.host_id),
        beansEarned: chargeResult.beansEarned,
        beansPerMinute: chargeResult.beansEarned,
        talkSessionId: talkSession._id.toString(),
        sessionBeansEarned: talkSession.host_beans_earned,
      });
    }

    res.json({
      success: true,
      wallet_balance: chargeResult.wallet_balance,
      hostBeansEarned: chargeResult.beansEarned,
      minutesCharged: talkSession.minutes_charged,
      totalCharged: talkSession.total_charged,
      ratePerMin: rate,
      canContinue: chargeResult.wallet_balance >= rate,
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

    if (talkSession) {
      const io = getIo();
      if (io) {
        const payload = {
          talkSessionId: talkSession._id.toString(),
          sessionId: String(talkSession.session_id),
        };
        io.to(userRoom(talkSession.talker_id)).emit('talk_private_ended', payload);
        io.to(userRoom(talkSession.host_id)).emit('talk_private_ended', payload);
        io.to(privateTalkRoom(talkSession._id)).emit('talk_private_ended', payload);
      }
    }

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

/** Public live chat: host broadcast only. Paid viewers use private talk room. */
exports.userCanChatOnLive = async (sessionId, userId) => {
  const session = await LiveSession.findById(sessionId).select('user_id status');
  if (!session || session.status !== 'active') return false;
  return String(session.user_id) === String(userId);
};