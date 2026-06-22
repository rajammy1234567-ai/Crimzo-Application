const { getBillingSettings } = require('../utils/billingSettings');

/** Public billing rates for mobile app */
exports.getPublicBillingSettings = async (_req, res) => {
  try {
    const settings = await getBillingSettings();
    res.json({
      success: true,
      videoCallRatePerMin: settings.videoCallRatePerMin,
      liveTalkRatePerMin: settings.liveTalkRatePerMin,
      videoCallBillingEnabled: settings.videoCallBillingEnabled,
      liveTalkBillingEnabled: settings.liveTalkBillingEnabled,
    });
  } catch (error) {
    console.error('Public billing settings error:', error);
    res.status(500).json({ error: 'Failed to load billing settings' });
  }
};