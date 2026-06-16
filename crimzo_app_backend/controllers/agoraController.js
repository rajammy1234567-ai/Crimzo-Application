const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

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
