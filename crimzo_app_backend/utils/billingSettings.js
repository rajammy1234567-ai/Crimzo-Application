const AppSettings = require('../models/AppSettings');
const {
  VIDEO_CALL_RATE_PER_MIN_INR,
  LIVE_TALK_RATE_PER_MIN_INR,
} = require('../config/walletConfig');

const BILLING_KEY = 'billing';
let cache = null;

function normalizeSettings(doc) {
  return {
    videoCallRatePerMin: Math.max(0, doc?.video_call_rate_per_min_inr ?? VIDEO_CALL_RATE_PER_MIN_INR),
    liveTalkRatePerMin: Math.max(0, doc?.live_talk_rate_per_min_inr ?? LIVE_TALK_RATE_PER_MIN_INR),
    videoCallBillingEnabled: doc?.video_call_billing_enabled !== false,
    liveTalkBillingEnabled: doc?.live_talk_billing_enabled !== false,
    updated_at: doc?.updated_at || null,
  };
}

async function getBillingSettings(force = false) {
  if (cache && !force) return cache;
  let doc = await AppSettings.findOne({ key: BILLING_KEY });
  if (!doc) {
    doc = await AppSettings.create({
      key: BILLING_KEY,
      video_call_rate_per_min_inr: VIDEO_CALL_RATE_PER_MIN_INR,
      live_talk_rate_per_min_inr: LIVE_TALK_RATE_PER_MIN_INR,
    });
  }
  cache = normalizeSettings(doc);
  return cache;
}

function clearBillingSettingsCache() {
  cache = null;
}

async function updateBillingSettings(updates) {
  const payload = {};
  if (updates.video_call_rate_per_min_inr != null) {
    payload.video_call_rate_per_min_inr = Math.min(10000, Math.max(0, Number(updates.video_call_rate_per_min_inr)));
  }
  if (updates.live_talk_rate_per_min_inr != null) {
    payload.live_talk_rate_per_min_inr = Math.min(10000, Math.max(0, Number(updates.live_talk_rate_per_min_inr)));
  }
  if (updates.video_call_billing_enabled != null) {
    payload.video_call_billing_enabled = !!updates.video_call_billing_enabled;
  }
  if (updates.live_talk_billing_enabled != null) {
    payload.live_talk_billing_enabled = !!updates.live_talk_billing_enabled;
  }

  const doc = await AppSettings.findOneAndUpdate(
    { key: BILLING_KEY },
    { $set: payload },
    { upsert: true, new: true },
  );
  cache = normalizeSettings(doc);
  return cache;
}

async function getVideoCallRatePerMin() {
  const s = await getBillingSettings();
  return s.videoCallRatePerMin;
}

async function getLiveTalkRatePerMin() {
  const s = await getBillingSettings();
  return s.liveTalkRatePerMin;
}

async function isVideoCallBillingEnabled() {
  const s = await getBillingSettings();
  return s.videoCallBillingEnabled;
}

async function isLiveTalkBillingEnabled() {
  const s = await getBillingSettings();
  return s.liveTalkBillingEnabled;
}

function buildVideoCallBalancePayload(balance, settings) {
  const enabled = settings.videoCallBillingEnabled;
  const rate = enabled ? settings.videoCallRatePerMin : 0;
  const bal = balance || 0;
  return {
    billingEnabled: enabled,
    ratePerMin: rate,
    wallet_balance: bal,
    canCall: !enabled || bal >= rate,
    minRequired: rate,
    maxMinutes: rate > 0 ? Math.floor(bal / rate) : 9999,
    shortfall: rate > bal ? rate - bal : 0,
  };
}

function buildLiveTalkBalancePayload(balance, settings) {
  const enabled = settings.liveTalkBillingEnabled;
  const rate = enabled ? settings.liveTalkRatePerMin : 0;
  const bal = balance || 0;
  return {
    billingEnabled: enabled,
    ratePerMin: rate,
    wallet_balance: bal,
    canTalk: !enabled || bal >= rate,
    minRequired: rate,
    maxMinutes: rate > 0 ? Math.floor(bal / rate) : 9999,
    shortfall: rate > bal ? rate - bal : 0,
  };
}

module.exports = {
  getBillingSettings,
  clearBillingSettingsCache,
  updateBillingSettings,
  getVideoCallRatePerMin,
  getLiveTalkRatePerMin,
  isVideoCallBillingEnabled,
  isLiveTalkBillingEnabled,
  buildVideoCallBalancePayload,
  buildLiveTalkBalancePayload,
};