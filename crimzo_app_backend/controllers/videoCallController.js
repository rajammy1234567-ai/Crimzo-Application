const User = require('../models/User');
const VideoCallSession = require('../models/VideoCallSession');
const {
  getBillingSettings,
  buildVideoCallBalancePayload,
} = require('../utils/billingSettings');
const { resolveUserRates } = require('../utils/userRates');
const { chargeCallMinute, InsufficientWalletError } = require('../utils/liveTalkCharge');
const { getIo, userRoom } = require('../utils/socketEmitter');

async function getPeerVoiceRate(peerId, settings) {
  if (!peerId) return settings.videoCallRatePerMin;
  const peer = await User.findById(peerId).select('voice_rate_per_min_inr chat_rate_per_min_inr');
  if (!peer) return settings.videoCallRatePerMin;
  return resolveUserRates(peer, settings).voiceRatePerMin;
}

exports.getRateInfo = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const peerId = req.query.peerId;
    const rate = peerId ? await getPeerVoiceRate(peerId, settings) : settings.videoCallRatePerMin;
    const user = await User.findById(req.user.id).select('wallet_balance');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const payload = buildVideoCallBalancePayload(user.wallet_balance, settings, rate);
    if (peerId) {
      const peer = await User.findById(peerId).select('voice_rate_per_min_inr chat_rate_per_min_inr');
      const peerRates = resolveUserRates(peer, settings);
      payload.beansPerMin = peerRates.voiceBeansPerMin;
    }
    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Video call rate info error:', error);
    res.status(500).json({ error: 'Failed to get call rate info' });
  }
};

exports.checkEligibility = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const peerId = req.query.peerId || req.body?.peerId;
    const rate = peerId ? await getPeerVoiceRate(peerId, settings) : settings.videoCallRatePerMin;
    const user = await User.findById(req.user.id).select('wallet_balance');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const payload = buildVideoCallBalancePayload(user.wallet_balance, settings, rate);
    if (peerId) {
      const peer = await User.findById(peerId).select('voice_rate_per_min_inr chat_rate_per_min_inr');
      payload.beansPerMin = resolveUserRates(peer, settings).voiceBeansPerMin;
    }
    if (!payload.canCall) {
      return res.status(400).json({
        error: 'Please recharge your wallet first. Video call costs ₹' + payload.ratePerMin + '/min.',
        code: 'INSUFFICIENT_BALANCE',
        ...payload,
      });
    }
    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Video call eligibility error:', error);
    res.status(500).json({ error: 'Failed to check call eligibility' });
  }
};

exports.startSession = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { channelName, peerId, role } = req.body;
    if (!channelName || !String(channelName).startsWith('vc_')) {
      return res.status(400).json({ error: 'Valid call channel required' });
    }

    if (role !== 'caller') {
      return res.json({
        success: true,
        billing: false,
        message: 'Incoming call — no charge to you',
        ratePerMin: settings.videoCallRatePerMin,
        billingEnabled: settings.videoCallBillingEnabled,
      });
    }

    const rate = await getPeerVoiceRate(peerId, settings);

    if (!settings.videoCallBillingEnabled || rate <= 0) {
      return res.json({
        success: true,
        billing: false,
        ratePerMin: 0,
        billingEnabled: false,
      });
    }

    const existing = await VideoCallSession.findOne({
      channelName,
      payerId: req.user.id,
      status: 'active',
    });
    if (existing) {
      const user = await User.findById(req.user.id).select('wallet_balance');
      return res.json({
        success: true,
        billing: true,
        sessionId: existing._id.toString(),
        wallet_balance: user?.wallet_balance || 0,
        minutesCharged: existing.minutesCharged,
        totalCharged: existing.totalCharged,
        ratePerMin: rate,
        billingEnabled: true,
      });
    }

    let chargeResult;
    try {
      chargeResult = await chargeCallMinute({
        talkerId: req.user.id,
        hostId: peerId,
        rateInr: rate,
      });
    } catch (e) {
      if (e instanceof InsufficientWalletError) {
        const current = await User.findById(req.user.id).select('wallet_balance');
        const bal = current?.wallet_balance || 0;
        return res.status(400).json({
          error: 'Insufficient wallet balance for video call',
          code: 'INSUFFICIENT_BALANCE',
          ...buildVideoCallBalancePayload(bal, settings, rate),
        });
      }
      throw e;
    }

    const session = await VideoCallSession.create({
      channelName,
      payerId: req.user.id,
      peerId: peerId ? String(peerId) : null,
      ratePerMin: rate,
      minutesCharged: 1,
      totalCharged: rate,
      peer_beans_earned: chargeResult.beansEarned,
      platform_beans_earned: chargeResult.platformBeans,
      status: 'active',
      startedAt: new Date(),
      lastTickAt: new Date(),
    });

    const io = getIo();
    if (io && chargeResult.beansEarned > 0 && peerId) {
      io.to(userRoom(peerId)).emit('voice_call_peer_earning', {
        peerId: String(peerId),
        beansEarned: chargeResult.beansEarned,
        beansPerMinute: chargeResult.beansEarned,
        channelName,
      });
    }

    res.json({
      success: true,
      billing: true,
      sessionId: session._id.toString(),
      wallet_balance: chargeResult.wallet_balance,
      peerBeansEarned: chargeResult.beansEarned,
      minutesCharged: 1,
      totalCharged: rate,
      ratePerMin: rate,
      billingEnabled: true,
      canContinue: chargeResult.wallet_balance >= rate,
    });
  } catch (error) {
    console.error('Video call start session error:', error);
    res.status(500).json({ error: 'Failed to start call billing' });
  }
};

exports.tickBilling = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { channelName, sessionId } = req.body;
    if (!channelName || !sessionId) {
      return res.status(400).json({ error: 'channelName and sessionId required' });
    }

    const session = await VideoCallSession.findOne({
      _id: sessionId,
      channelName,
      payerId: req.user.id,
      status: 'active',
    });
    if (!session) {
      return res.status(404).json({ error: 'Active call session not found' });
    }

    const rate = session.ratePerMin || await getPeerVoiceRate(session.peerId, settings);

    if (!settings.videoCallBillingEnabled || rate <= 0) {
      return res.json({
        success: true,
        wallet_balance: (await User.findById(req.user.id).select('wallet_balance'))?.wallet_balance || 0,
        minutesCharged: session.minutesCharged,
        totalCharged: session.totalCharged,
        ratePerMin: 0,
        canContinue: true,
      });
    }

    let chargeResult;
    try {
      chargeResult = await chargeCallMinute({
        talkerId: req.user.id,
        hostId: session.peerId,
        rateInr: rate,
      });
    } catch (e) {
      if (e instanceof InsufficientWalletError) {
        session.status = 'ended_insufficient';
        session.endedAt = new Date();
        await session.save();
        return res.status(400).json({
          error: 'Wallet balance exhausted — ending the call.',
          code: 'BALANCE_EXHAUSTED',
          shouldEndCall: true,
          minutesCharged: session.minutesCharged,
          totalCharged: session.totalCharged,
        });
      }
      throw e;
    }

    session.minutesCharged += 1;
    session.totalCharged += rate;
    session.peer_beans_earned = (session.peer_beans_earned || 0) + chargeResult.beansEarned;
    session.platform_beans_earned = (session.platform_beans_earned || 0) + (chargeResult.platformBeans || 0);
    session.lastTickAt = new Date();
    await session.save();

    const io = getIo();
    if (io && chargeResult.beansEarned > 0 && session.peerId) {
      io.to(userRoom(session.peerId)).emit('voice_call_peer_earning', {
        peerId: String(session.peerId),
        beansEarned: chargeResult.beansEarned,
        beansPerMinute: chargeResult.beansEarned,
        channelName,
        sessionBeansEarned: session.peer_beans_earned,
      });
    }

    res.json({
      success: true,
      wallet_balance: chargeResult.wallet_balance,
      peerBeansEarned: chargeResult.beansEarned,
      minutesCharged: session.minutesCharged,
      totalCharged: session.totalCharged,
      ratePerMin: rate,
      canContinue: chargeResult.wallet_balance >= rate,
    });
  } catch (error) {
    console.error('Video call tick billing error:', error);
    res.status(500).json({ error: 'Failed to bill call minute' });
  }
};

exports.endSession = async (req, res) => {
  try {
    const { channelName, sessionId } = req.body;
    const query = { payerId: req.user.id, status: 'active' };
    if (sessionId) query._id = sessionId;
    if (channelName) query.channelName = channelName;

    const session = await VideoCallSession.findOneAndUpdate(
      query,
      { status: 'ended', endedAt: new Date() },
      { new: true },
    );

    res.json({
      success: true,
      sessionEnded: !!session,
      minutesCharged: session?.minutesCharged || 0,
      totalCharged: session?.totalCharged || 0,
    });
  } catch (error) {
    console.error('Video call end session error:', error);
    res.status(500).json({ error: 'Failed to end call session' });
  }
};