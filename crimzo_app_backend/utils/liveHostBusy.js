const LiveTalkSession = require('../models/LiveTalkSession');
const LiveCallRequest = require('../models/LiveCallRequest');
const VideoCallSession = require('../models/VideoCallSession');
const { getIo, liveRoom } = require('./socketEmitter');

async function getHostBusyState(sessionId, hostId = null) {
  if (!sessionId) {
    return { busy: false, type: null, activeTalks: 0, onCall: false };
  }

  const talkQuery = { session_id: sessionId, status: 'active' };
  if (hostId) talkQuery.host_id = hostId;

  const activeTalks = await LiveTalkSession.countDocuments(talkQuery);

  const callQuery = { session_id: sessionId, status: 'accepted' };
  if (hostId) callQuery.host_id = hostId;
  const acceptedCall = await LiveCallRequest.findOne(callQuery).select('channel_name').lean();

  let onCall = false;
  if (acceptedCall?.channel_name) {
    const activeVoice = await VideoCallSession.findOne({
      channelName: acceptedCall.channel_name,
      status: 'active',
    }).select('_id');
    if (activeVoice) {
      onCall = true;
    } else {
      const latestVoice = await VideoCallSession.findOne({
        channelName: acceptedCall.channel_name,
      })
        .select('status')
        .sort({ createdAt: -1 });
      // Accepted call but billing session not created yet — host is still busy.
      onCall = !latestVoice;
    }
  }

  const busy = activeTalks > 0 || onCall;
  let type = null;
  if (busy) {
    type = onCall ? 'call' : 'talk';
  }

  return { busy, type, activeTalks, onCall };
}

async function syncHostBusyToLiveRoom(sessionId, hostId = null) {
  const io = getIo();
  if (!io || !sessionId) {
    return getHostBusyState(sessionId, hostId);
  }

  const state = await getHostBusyState(sessionId, hostId);
  io.to(liveRoom(sessionId)).emit('live_host_busy', {
    sessionId: String(sessionId),
    busy: state.busy,
    type: state.type,
  });
  return state;
}

async function syncHostBusyFromCallChannel(channelName) {
  if (!channelName) return { busy: false, type: null };
  const callReq = await LiveCallRequest.findOne({
    channel_name: channelName,
    status: 'accepted',
  }).select('session_id host_id').lean();
  if (!callReq?.session_id) {
    return { busy: false, type: null };
  }
  return syncHostBusyToLiveRoom(callReq.session_id, callReq.host_id);
}

module.exports = {
  getHostBusyState,
  syncHostBusyToLiveRoom,
  syncHostBusyFromCallChannel,
};