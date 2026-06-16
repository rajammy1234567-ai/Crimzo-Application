const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const LiveSession = require('../models/LiveSession');
const LiveSessionView = require('../models/LiveSessionView');
const User = require('../models/User');

// Start live stream
exports.startLive = async (req, res) => {
  try {
    const { location } = req.body;
    const userId = req.user.id;

    // End any stuck active sessions for this host (app crash / force close)
    const stale = await LiveSession.updateMany(
      { user_id: userId, status: 'active' },
      { status: 'ended', ended_at: new Date() },
    );
    if (stale.modifiedCount > 0) {
      console.log(`🧹 Ended ${stale.modifiedCount} stale live session(s) for user ${userId}`);
    }

    const channelName = `live_${userId}_${Date.now()}`;

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Agora requires numeric UIDs (uint32). Derive stable number from mongo id string.
    const uidStr = String(userId).replace(/[^0-9]/g, '');
    let uid = parseInt(uidStr.slice(-9) || '0', 10) || (Date.now() % 1000000 + 10000);

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, uid, RtcRole.PUBLISHER, privilegeExpiredTs
    );

    const session = await LiveSession.create({
      user_id: userId,
      channel_name: channelName,
      agora_token: token,
      session_type: 'single',
      location: location || 'Unknown'
    });

    await User.findByIdAndUpdate(userId, { status: 'live' });

    res.json({ success: true, sessionId: session.id, channelName, token, appId, uid });
  } catch (error) {
    console.error('Start live error:', error);
    res.status(500).json({ error: 'Failed to start live stream', detail: error.message });
  }
};

// End live stream (needs io passed in)
exports.createEndLive = (io) => async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    await LiveSession.updateOne(
      { _id: sessionId, user_id: userId },
      { status: 'ended', ended_at: new Date() }
    );

    await User.findByIdAndUpdate(userId, { status: 'online' });

    io.to(`live_${sessionId}`).emit('stream_ended', {
      sessionId,
      message: 'The host has ended the live stream.'
    });

    res.json({ success: true, message: 'Live stream ended' });
  } catch (error) {
    console.error('End live error:', error);
    res.status(500).json({ error: 'Failed to end live stream' });
  }
};

// Get active live streams
exports.getActiveStreams = async (req, res) => {
  try {
    const sessions = await LiveSession.find({ status: 'active' })
      .sort({ viewers_count: -1, started_at: -1 })
      .limit(50)
      .populate('user_id', 'username avatar country bio')
      .lean();

    const streams = sessions.map(ls => {
      const u = ls.user_id || {};
      return {
        id: ls._id ? ls._id.toString() : null,
        user_id: u._id ? u._id.toString() : (u.id || ls.user_id),
        channel_name: ls.channel_name,
        session_type: ls.session_type,
        status: ls.status,
        viewers_count: ls.viewers_count,
        location: ls.location,
        started_at: ls.started_at,
        username: u.username,
        avatar: u.avatar,
        country: u.country,
        bio: u.bio
      };
    });

    res.json({ success: true, streams });
  } catch (error) {
    console.error('Get active streams error:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
};

// Get live users for home page
exports.getLiveUsers = async (req, res) => {
  try {
    const sessions = await LiveSession.find({ status: 'active' })
      .sort({ viewers_count: -1 })
      .limit(20)
      .populate('user_id', 'id username avatar country')
      .lean();

    const liveUsers = sessions.map(ls => {
      const u = ls.user_id || {};
      return {
        session_id: ls._id ? ls._id.toString() : null,
        viewers_count: ls.viewers_count,
        started_at: ls.started_at,
        user_id: u._id ? u._id.toString() : u.id,
        username: u.username,
        avatar: u.avatar,
        country: u.country
      };
    });

    res.json({ success: true, liveUsers });
  } catch (error) {
    console.error('Get live users error:', error);
    res.status(500).json({ error: 'Failed to get live users' });
  }
};

// Join live stream
exports.joinLive = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await LiveSession.findById(sessionId).populate('user_id', 'username avatar followers_count');
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'This stream has ended' });
    }
    const channelName = session.channel_name;

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Numeric UID for Agora
    const uidStr = String(userId).replace(/[^0-9]/g, '');
    let uid = parseInt(uidStr.slice(-9) || '0', 10) || (Date.now() % 1000000 + 10000);

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, uid, RtcRole.SUBSCRIBER, privilegeExpiredTs
    );

    const hostId = session.user_id?._id || session.user_id;
    let viewersCount = session.viewers_count || 0;

    // Unique viewer per user per stream (re-joining should not inflate count)
    if (String(hostId) !== String(userId)) {
      const alreadyViewed = await LiveSessionView.findOne({ session_id: sessionId, user_id: userId }).select('_id');
      if (!alreadyViewed) {
        try {
          await LiveSessionView.create({ session_id: sessionId, user_id: userId });
          const updated = await LiveSession.findByIdAndUpdate(
            sessionId,
            { $inc: { viewers_count: 1 } },
            { new: true },
          ).select('viewers_count');
          viewersCount = updated?.viewers_count ?? viewersCount + 1;
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
    }

    const host = session.user_id || {};
    res.json({
      success: true, channelName, token, appId, uid,
      sessionId: session.id, hostId: host.id || session.user_id, hostUsername: host.username,
      hostAvatar: host.avatar || null, hostFollowers: host.followers_count || 0
    });
  } catch (error) {
    console.error('Join live error:', error);
    res.status(500).json({ error: 'Failed to join live stream' });
  }
};
