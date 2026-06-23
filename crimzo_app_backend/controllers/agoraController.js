const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const User = require('../models/User');
const { getBillingSettings } = require('../utils/billingSettings');
const { assertCanInteract } = require('../utils/followPermissions');

function buildAgoraUid(userId) {
  const uidStr = String(userId).replace(/[^0-9]/g, '');
  const parsed = parseInt(uidStr.slice(-9) || '0', 10);
  if (parsed > 0) return parsed;
  return (Date.now() % 1000000) + 10000;
}

function requireAgoraCreds(res) {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCertificate) {
    res.status(503).json({ error: 'Agora not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env' });
    return null;
  }
  return { appId, appCertificate };
}

/** 1-on-1 video call token (Communication channel — both users publish) */
exports.generateCallToken = async (req, res) => {
  try {
    const { channelName, role, peerId } = req.body;
    if (!channelName || !String(channelName).startsWith('vc_')) {
      return res.status(400).json({ error: 'Valid call channel name required' });
    }

    if (peerId) {
      try {
        await assertCanInteract(req.user.id, peerId);
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: permErr.message,
          code: permErr.code || 'FOLLOW_REQUIRED',
        });
      }
    }

    const billingSettings = await getBillingSettings();
    if (role === 'caller' && billingSettings.videoCallBillingEnabled && billingSettings.videoCallRatePerMin > 0) {
      const caller = await User.findById(req.user.id).select('wallet_balance');
      const balance = caller?.wallet_balance || 0;
      const rate = billingSettings.videoCallRatePerMin;
      if (balance < rate) {
        return res.status(400).json({
          error: `Please recharge your wallet first. Video call costs ₹${rate}/min.`,
          code: 'INSUFFICIENT_BALANCE',
          ratePerMin: rate,
          wallet_balance: balance,
          minRequired: rate,
          shortfall: rate - balance,
        });
      }
    }

    const creds = requireAgoraCreds(res);
    if (!creds) return;

    const uid = buildAgoraUid(req.user.id);
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      creds.appId,
      creds.appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
    );

    res.json({
      success: true,
      token,
      channelName,
      uid,
      appId: creds.appId,
      mode: 'communication',
      ratePerMin: billingSettings.videoCallRatePerMin,
      billingEnabled: billingSettings.videoCallBillingEnabled,
    });
  } catch (error) {
    console.error('Call token generation error:', error);
    res.status(500).json({ error: 'Failed to generate call token' });
  }
};

// Generate Agora token
exports.generateToken = async (req, res) => {
  try {
    const { channelName, role } = req.body;
    const uid = req.user.id;

    if (!channelName) {
      return res.status(400).json({ error: 'Channel name required' });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const roleType = role === 'host' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId, appCertificate, channelName, uid, roleType, privilegeExpiredTs
    );

    res.json({ success: true, token, channelName, uid, appId });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
};
