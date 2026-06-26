const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const LiveSession = require('../models/LiveSession');
const LiveSessionView = require('../models/LiveSessionView');
const LiveTalkRequest = require('../models/LiveTalkRequest');
const LiveTalkSession = require('../models/LiveTalkSession');
const LiveCallRequest = require('../models/LiveCallRequest');
const User = require('../models/User');
const { getBillingSettings } = require('../utils/billingSettings');
const { resolveUserRates } = require('../utils/userRates');
const { emitLiveStreamsUpdated } = require('../utils/socketEmitter');
const { getHostBusyState } = require('../utils/liveHostBusy');
const { deriveAgoraUid } = require('../utils/agoraUid');
const { APP_DOWNLOAD_URL, REFERRAL_WEB_BASE_URL } = require('../config/referralConfig');
const { ANDROID_PACKAGE_NAME } = require('../config/deepLinkConfig');

const STALE_LIVE_MS = 6 * 60 * 60 * 1000; // 6 hours max live session
const LIVE_JOIN_GRACE_MS = 30 * 1000; // allow brief window after go-live before socket joins

async function finalizeLiveSessionEnd(sessionId, io, options = {}) {
  const {
    message = 'The host has ended the live stream.',
    notifyViewers = true,
  } = options;

  const session = await LiveSession.findOne({ _id: sessionId, status: 'active' }).select('user_id');
  if (!session) return false;

  await LiveSession.updateOne(
    { _id: sessionId },
    { status: 'ended', ended_at: new Date() },
  );

  await LiveTalkRequest.updateMany(
    { session_id: sessionId, status: 'pending' },
    { status: 'cancelled', responded_at: new Date() },
  );
  await LiveCallRequest.updateMany(
    { session_id: sessionId, status: 'pending' },
    { status: 'cancelled', responded_at: new Date() },
  );
  await LiveTalkSession.updateMany(
    { session_id: sessionId, status: 'active' },
    { status: 'ended', ended_at: new Date() },
  );

  await User.findByIdAndUpdate(session.user_id, { status: 'online' });

  if (notifyViewers && io) {
    io.to(`live_${sessionId}`).emit('stream_ended', { sessionId, message });
  }
  emitLiveStreamsUpdated();
  return true;
}

exports.finalizeLiveSessionEnd = finalizeLiveSessionEnd;

const LIVE_ROOM_GRACE_MS = 3 * 60 * 1000;

/** End sessions only when truly abandoned (max duration or host gone from room). */
exports.cleanupStaleLiveSessions = async (io) => {
  if (!io) return 0;

  const cutoff = new Date(Date.now() - STALE_LIVE_MS);
  const activeSessions = await LiveSession.find({ status: 'active' })
    .select('_id user_id started_at')
    .lean();

  if (!activeSessions.length) return 0;

  let ended = 0;
  for (const session of activeSessions) {
    const sessionId = String(session._id);
    const hostId = String(session.user_id);
    const isOld = session.started_at && new Date(session.started_at) < cutoff;

    if (isOld) {
      const ok = await finalizeLiveSessionEnd(session._id, io, {
        message: 'This live stream has ended.',
        notifyViewers: true,
      });
      if (ok) ended += 1;
      continue;
    }

    const clients = await io.in(`live_${sessionId}`).fetchSockets();
    const hostInRoom = clients.some((c) => String(c.crimzoUserId) === hostId);
    if (hostInRoom) continue;

    const startedMs = session.started_at ? new Date(session.started_at).getTime() : 0;
    if (Date.now() - startedMs < LIVE_ROOM_GRACE_MS) continue;

    const ok = await finalizeLiveSessionEnd(session._id, io, {
      message: 'This live stream has ended.',
      notifyViewers: true,
    });
    if (ok) ended += 1;
  }
  return ended;
};

function mapActiveSession(ls, billingSettings) {
  const u = ls.user_id || {};
  const rates = resolveUserRates(u, billingSettings);
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
    bio: u.bio,
    followers_count: u.followers_count || 0,
    talk_rate_per_min: rates.chatRatePerMin,
    voice_rate_per_min: rates.voiceRatePerMin,
    chat_rate_per_min: rates.chatRatePerMin,
    voice_beans_per_min: rates.voiceBeansPerMin,
    chat_beans_per_min: rates.chatBeansPerMin,
    talk_billing_enabled: billingSettings.liveTalkBillingEnabled,
    voice_billing_enabled: billingSettings.videoCallBillingEnabled,
  };
}

function filterCurrentlyLiveSessions(sessions) {
  const now = Date.now();
  return sessions.filter((ls) => {
    const host = ls.user_id;
    if (!host) return false;
    if (host.status === 'live') return true;
    const startedAt = ls.started_at ? new Date(ls.started_at).getTime() : 0;
    return now - startedAt < LIVE_JOIN_GRACE_MS;
  });
}

async function loadActiveLiveSessions() {
  return LiveSession.find({ status: 'active' })
    .sort({ viewers_count: -1, started_at: -1 })
    .populate(
      'user_id',
      'username avatar country bio followers_count status voice_rate_per_min_inr chat_rate_per_min_inr',
    )
    .lean();
}

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

    const uid = deriveAgoraUid(userId);

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
    emitLiveStreamsUpdated();
    const billingSettings = await getBillingSettings();

    res.json({
      success: true,
      sessionId: session.id,
      channelName,
      token,
      appId,
      uid,
      talkRatePerMin: billingSettings.liveTalkRatePerMin,
      talkBillingEnabled: billingSettings.liveTalkBillingEnabled,
    });
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

    const owned = await LiveSession.findOne({ _id: sessionId, user_id: userId, status: 'active' }).select('_id');
    if (!owned) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const ended = await finalizeLiveSessionEnd(sessionId, io);
    if (!ended) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    res.json({ success: true, message: 'Live stream ended' });
  } catch (error) {
    console.error('End live error:', error);
    res.status(500).json({ error: 'Failed to end live stream' });
  }
};

// Get active live streams
exports.getActiveStreams = async (req, res) => {
  try {
    const [billingSettings, sessions] = await Promise.all([
      getBillingSettings(),
      loadActiveLiveSessions(),
    ]);
    const liveNow = filterCurrentlyLiveSessions(sessions);
    const streams = liveNow.map((ls) => mapActiveSession(ls, billingSettings));

    res.json({ success: true, streams, billing: billingSettings });
  } catch (error) {
    console.error('Get active streams error:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
};

// Get live users for home page
exports.getLiveUsers = async (req, res) => {
  try {
    const [billingSettings, sessions] = await Promise.all([
      getBillingSettings(),
      LiveSession.find({ status: 'active' })
        .sort({ viewers_count: -1, started_at: -1 })
        .populate('user_id', 'id username avatar country status voice_rate_per_min_inr chat_rate_per_min_inr')
        .lean(),
    ]);

    const liveNow = filterCurrentlyLiveSessions(sessions);
    const liveUsers = liveNow.map((ls) => {
        const u = ls.user_id || {};
        const rates = resolveUserRates(u, billingSettings);
        return {
          session_id: ls._id ? ls._id.toString() : null,
          viewers_count: ls.viewers_count,
          started_at: ls.started_at,
          user_id: u._id ? u._id.toString() : u.id,
          username: u.username,
          avatar: u.avatar,
          country: u.country,
          talk_rate_per_min: rates.chatRatePerMin,
          voice_rate_per_min: rates.voiceRatePerMin,
          chat_rate_per_min: rates.chatRatePerMin,
          voice_beans_per_min: rates.voiceBeansPerMin,
          chat_beans_per_min: rates.chatBeansPerMin,
          talk_billing_enabled: billingSettings.liveTalkBillingEnabled,
          voice_billing_enabled: billingSettings.videoCallBillingEnabled,
        };
      });

    res.json({ success: true, liveUsers, billing: billingSettings });
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

    const session = await LiveSession.findById(sessionId).populate(
      'user_id',
      'username avatar followers_count voice_rate_per_min_inr chat_rate_per_min_inr',
    );
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

    const uid = deriveAgoraUid(userId);
    const hostId = session.user_id?._id || session.user_id;
    const hostUid = deriveAgoraUid(hostId);

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, uid, RtcRole.SUBSCRIBER, privilegeExpiredTs
    );
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
    const hostIdStr = String(host._id || hostId || '');
    const billingSettings = await getBillingSettings();
    const hostRates = resolveUserRates(host, billingSettings);
    const hostBusyState = await getHostBusyState(sessionId, hostIdStr);
    res.json({
      success: true, channelName, token, appId, uid, hostUid,
      sessionId: session.id, hostId: hostIdStr, hostUsername: host.username,
      hostAvatar: host.avatar || null, hostFollowers: host.followers_count || 0,
      hostVoiceRatePerMin: hostRates.voiceRatePerMin,
      hostChatRatePerMin: hostRates.chatRatePerMin,
      hostVoiceBeansPerMin: hostRates.voiceBeansPerMin,
      hostChatBeansPerMin: hostRates.chatBeansPerMin,
      talkBillingEnabled: billingSettings.liveTalkBillingEnabled,
      voiceBillingEnabled: billingSettings.videoCallBillingEnabled,
      hostBusy: hostBusyState.busy,
      hostBusyType: hostBusyState.type,
    });
  } catch (error) {
    console.error('Join live error:', error);
    res.status(500).json({ error: 'Failed to join live stream' });
  }
};

exports.renderLiveLandingPage = async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const session = sessionId
      ? await LiveSession.findById(sessionId).populate('user_id', 'username avatar').lean()
      : null;
    const active = !!(session && session.status === 'active');
    const host = session?.user_id;
    const displayName = host?.username || 'Crimzo Host';
    const avatar = host?.avatar || `${REFERRAL_WEB_BASE_URL}/favicon.ico`;
    const appDeepLink = `crimzo://live/watch?sessionId=${encodeURIComponent(sessionId)}`;
    const webUrl = `${REFERRAL_WEB_BASE_URL}/live/${encodeURIComponent(sessionId)}`;
    const intentUrl = `intent://www.crimzo.live/live/${encodeURIComponent(sessionId)}#Intent;scheme=https;package=${ANDROID_PACKAGE_NAME};S.browser_fallback_url=${encodeURIComponent(APP_DOWNLOAD_URL)};end`;

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${displayName} is live on Crimzo</title>
  <meta property="og:title" content="${displayName} is live on Crimzo" />
  <meta property="og:description" content="Join the live stream on Crimzo now." />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; background: linear-gradient(160deg, #06060f 0%, #141428 100%); color: #eee; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,45,85,0.25); border-radius: 20px; padding: 28px; text-align: center; }
    .avatar { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid #ff2d55; margin-bottom: 16px; }
    h1 { color: #fff; font-size: 1.35rem; margin: 0 0 8px; }
    p { color: #aaa; line-height: 1.55; margin: 0 0 16px; }
    .live-pill { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,45,85,0.2); color: #ff6b8a; padding: 8px 14px; border-radius: 999px; font-weight: 700; margin-bottom: 16px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #ff2d55; }
    .btn { display: block; width: 100%; text-decoration: none; border-radius: 14px; padding: 14px 18px; font-weight: 700; margin-bottom: 12px; }
    .btn-primary { background: linear-gradient(90deg, #ff2d55, #ff6b35); color: #fff; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.12); }
    .invalid { color: #ff8a8a; }
  </style>
</head>
<body>
  <div class="card">
    ${active ? `<img class="avatar" src="${avatar}" alt="${displayName}" onerror="this.style.display='none'" />` : ''}
    <h1>${active ? `${displayName} is live!` : 'Live stream unavailable'}</h1>
    ${active
      ? `<div class="live-pill"><span class="dot"></span> LIVE NOW</div><p>Open Crimzo and join the live stream.</p>`
      : `<p class="invalid">This live stream has ended or does not exist. Download Crimzo to watch other live streams.</p>`}
    <a class="btn btn-primary" href="${appDeepLink}" id="openApp">Join Live in App</a>
    <a class="btn btn-secondary" href="${APP_DOWNLOAD_URL}">Download from crimzo.live</a>
  </div>
  <script>
    (function () {
      var deep = ${JSON.stringify(appDeepLink)};
      var intent = ${JSON.stringify(intentUrl)};
      var web = ${JSON.stringify(webUrl)};
      var download = ${JSON.stringify(APP_DOWNLOAD_URL)};
      var isAndroid = /Android/i.test(navigator.userAgent);
      var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

      function openApp() {
        if (isAndroid && intent) {
          window.location.href = intent;
          setTimeout(function () { window.location.href = deep; }, 600);
        } else if (isIOS) {
          window.location.href = deep;
        } else {
          window.location.href = deep;
        }
      }

      if (isAndroid || isIOS) {
        setTimeout(openApp, 350);
      }

      document.getElementById('openApp').addEventListener('click', function (e) {
        e.preventDefault();
        openApp();
        setTimeout(function () {
          if (isAndroid) window.location.href = download;
        }, 1800);
      });
    })();
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Live landing page error:', error);
    res.status(500).send('Unable to load live page');
  }
};
