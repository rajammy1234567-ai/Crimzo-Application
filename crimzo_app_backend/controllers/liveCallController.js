const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const LiveCallRequest = require('../models/LiveCallRequest');
const {
  getBillingSettings,
  buildVideoCallBalancePayload,
} = require('../utils/billingSettings');
const { resolveUserRates } = require('../utils/userRates');
const { getIo, userRoom } = require('../utils/socketEmitter');
const { syncHostBusyToLiveRoom } = require('../utils/liveHostBusy');

async function getHostVoiceRate(hostId, settings) {
  const host = await User.findById(hostId).select('voice_rate_per_min_inr chat_rate_per_min_inr');
  if (!host) return settings.videoCallRatePerMin;
  return resolveUserRates(host, settings).voiceRatePerMin;
}

function normalizeCallType(raw) {
  return raw === 'video' ? 'video' : 'voice';
}

function rateForCallType(hostRates, callType) {
  return callType === 'video' ? hostRates.videoRatePerMin : hostRates.voiceRatePerMin;
}

function beansForCallType(hostRates, callType) {
  return callType === 'video' ? hostRates.videoBeansPerMin : hostRates.voiceBeansPerMin;
}

exports.requestCall = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { sessionId, callType: rawCallType } = req.body;
    const callType = normalizeCallType(rawCallType);
    const requesterId = req.user.id;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await LiveSession.findById(sessionId).populate(
      'user_id',
      'username avatar voice_rate_per_min_inr chat_rate_per_min_inr',
    );
    if (!session || session.status !== 'active') {
      return res.status(400).json({ error: 'This live stream is no longer active' });
    }

    const hostDoc = session.user_id;
    const hostId = hostDoc?._id || hostDoc?.id || session.user_id;
    const hostRates = resolveUserRates(hostDoc, settings);
    const callRate = rateForCallType(hostRates, callType);
    const callBeans = beansForCallType(hostRates, callType);
    if (String(hostId) === String(requesterId)) {
      return res.status(400).json({ error: 'Hosts cannot request a call on their own stream' });
    }

    const requester = await User.findById(requesterId).select('wallet_balance username avatar');
    const balance = requester?.wallet_balance || 0;
    const callPayload = buildVideoCallBalancePayload(balance, settings, callRate);
    callPayload.beansPerMin = callBeans;
    callPayload.callType = callType;
    if (!callPayload.canCall) {
      const label = callType === 'video' ? 'Video call' : 'Voice call';
      return res.status(400).json({
        error: `Please recharge your wallet first. ${label} costs ₹${callPayload.ratePerMin}/min.`,
        code: 'INSUFFICIENT_BALANCE',
        ...callPayload,
      });
    }

    const accepted = await LiveCallRequest.findOne({
      session_id: sessionId,
      requester_id: requesterId,
      status: 'accepted',
      call_type: callType,
    }).sort({ responded_at: -1 });
    if (accepted) {
      return res.json({
        success: true,
        alreadyAccepted: true,
        requestId: accepted._id.toString(),
        channelName: accepted.channel_name,
        status: 'accepted',
        ...callPayload,
      });
    }

    let request = await LiveCallRequest.findOne({
      session_id: sessionId,
      requester_id: requesterId,
      status: 'pending',
      call_type: callType,
    });

    const channelPrefix = callType === 'video' ? 'vc_live_vid_' : 'vc_live_';
    const channelName = request?.channel_name
      || `${channelPrefix}${sessionId}_${requesterId}_${Date.now()}`;

    if (!request) {
      request = await LiveCallRequest.create({
        session_id: sessionId,
        requester_id: requesterId,
        host_id: hostId,
        channel_name: channelName,
        call_type: callType,
        status: 'pending',
      });
    }

    const io = getIo();
    if (io) {
      io.to(userRoom(hostId)).emit('live_call_incoming', {
        requestId: request._id.toString(),
        sessionId: String(sessionId),
        requesterId: String(requesterId),
        requesterName: requester?.username || 'Viewer',
        requesterAvatar: requester?.avatar || null,
        channelName,
        callType,
        ratePerMin: callRate,
        beansPerMin: callBeans,
        billingEnabled: settings.videoCallBillingEnabled,
      });
    }

    res.json({
      success: true,
      requestId: request._id.toString(),
      channelName,
      callType,
      status: 'pending',
      ...callPayload,
    });
  } catch (error) {
    console.error('Live call request error:', error);
    res.status(500).json({ error: 'Failed to send call request' });
  }
};

exports.respondCall = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { requestId, action } = req.body;
    const hostId = req.user.id;
    const hostUser = await User.findById(hostId).select('username avatar voice_rate_per_min_inr chat_rate_per_min_inr');
    const hostRates = resolveUserRates(hostUser, settings);
    if (!requestId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'requestId and action (accept/reject) required' });
    }

    const request = await LiveCallRequest.findById(requestId);
    if (!request || String(request.host_id) !== String(hostId)) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already handled', status: request.status });
    }

    request.status = action === 'accept' ? 'accepted' : 'rejected';
    request.responded_at = new Date();
    await request.save();

    const callType = request.call_type || 'voice';
    const callRate = rateForCallType(hostRates, callType);
    const callBeans = beansForCallType(hostRates, callType);
    const requester = await User.findById(request.requester_id).select('username avatar').lean();
    const payload = {
      requestId: request._id.toString(),
      sessionId: String(request.session_id),
      hostId: String(hostId),
      requesterId: String(request.requester_id),
      requesterName: requester?.username || 'Viewer',
      requesterAvatar: requester?.avatar || null,
      hostName: hostUser?.username || 'Host',
      hostAvatar: hostUser?.avatar || null,
      channelName: request.channel_name,
      callType,
      ratePerMin: callRate,
      beansPerMin: callBeans,
      billingEnabled: settings.videoCallBillingEnabled,
    };

    const io = getIo();
    if (io) {
      if (action === 'accept') {
        io.to(userRoom(request.requester_id)).emit('live_call_accepted', payload);
        io.to(userRoom(hostId)).emit('live_call_accepted', {
          ...payload,
          role: 'callee',
        });
        await syncHostBusyToLiveRoom(request.session_id, hostId);
      } else {
        io.to(userRoom(request.requester_id)).emit('live_call_rejected', { ...payload, callType });
      }
    }

    res.json({ success: true, status: request.status, ...payload });
  } catch (error) {
    console.error('Live call respond error:', error);
    res.status(500).json({ error: 'Failed to respond to call request' });
  }
};

exports.getCallStatus = async (req, res) => {
  try {
    const settings = await getBillingSettings();
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await LiveSession.findById(sessionId)
      .populate('user_id', 'voice_rate_per_min_inr chat_rate_per_min_inr')
      .select('user_id status');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isHost = String(session.user_id?._id || session.user_id) === String(userId);
    const hostDoc = session.user_id;
    const hostRates = resolveUserRates(hostDoc, settings);
    const user = await User.findById(userId).select('wallet_balance');
    const callPayload = buildVideoCallBalancePayload(user?.wallet_balance, settings, hostRates.voiceRatePerMin);
    callPayload.beansPerMin = hostRates.voiceBeansPerMin;
    callPayload.videoRatePerMin = hostRates.videoRatePerMin;
    callPayload.videoBeansPerMin = hostRates.videoBeansPerMin;

    const pending = await LiveCallRequest.find({
      session_id: sessionId,
      requester_id: userId,
      status: 'pending',
    }).select('_id status channel_name call_type created_at').lean();

    const accepted = await LiveCallRequest.find({
      session_id: sessionId,
      requester_id: userId,
      status: 'accepted',
    }).sort({ responded_at: -1 }).select('_id status channel_name call_type responded_at').lean();

    const pendingForHost = isHost
      ? await LiveCallRequest.find({ session_id: sessionId, status: 'pending' })
        .populate('requester_id', 'username avatar')
        .sort({ created_at: -1 })
        .limit(20)
        .lean()
      : [];

    res.json({
      success: true,
      isHost,
      ...callPayload,
      pendingRequest: pending[0] ? {
        id: pending[0]._id.toString(),
        status: pending[0].status,
        channelName: pending[0].channel_name,
        callType: pending[0].call_type || 'voice',
        created_at: pending[0].created_at,
      } : null,
      pendingRequests_all: pending.map((p) => ({
        id: p._id.toString(),
        status: p.status,
        channelName: p.channel_name,
        callType: p.call_type || 'voice',
        created_at: p.created_at,
      })),
      acceptedCall: accepted[0] ? {
        id: accepted[0]._id.toString(),
        channelName: accepted[0].channel_name,
        status: accepted[0].status,
        callType: accepted[0].call_type || 'voice',
      } : null,
      pendingRequests: pendingForHost.map((r) => ({
        id: r._id.toString(),
        requesterId: r.requester_id?._id?.toString(),
        requesterName: r.requester_id?.username,
        requesterAvatar: r.requester_id?.avatar,
        channelName: r.channel_name,
        callType: r.call_type || 'voice',
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Live call status error:', error);
    res.status(500).json({ error: 'Failed to get call status' });
  }
};