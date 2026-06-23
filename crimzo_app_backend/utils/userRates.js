const { inrToBeans } = require('./beanConversion');
const { receiverBeansFromInr, platformBeansFromInr } = require('./callCommission');

const MIN_RATE_INR = 1;
const MAX_RATE_INR = 10000;

function clampRate(value, fallback) {
  const fb = Math.max(0, Number(fallback) || 0);
  if (value == null || value === '') return fb;
  const n = Number(value);
  if (!Number.isFinite(n)) return fb;
  return Math.min(MAX_RATE_INR, Math.max(MIN_RATE_INR, n));
}

/** Resolve per-user voice (call) and chat (live talk) rates; null user fields fall back to app defaults. */
function resolveUserRates(user, billingSettings) {
  const voiceRatePerMin = clampRate(
    user?.voice_rate_per_min_inr,
    billingSettings?.videoCallRatePerMin ?? 1,
  );
  const chatRatePerMin = clampRate(
    user?.chat_rate_per_min_inr,
    billingSettings?.liveTalkRatePerMin ?? 1,
  );
  const voiceGrossBeansPerMin = inrToBeans(voiceRatePerMin);
  const voiceBeansPerMin = receiverBeansFromInr(voiceRatePerMin);
  const voicePlatformBeansPerMin = platformBeansFromInr(voiceRatePerMin);
  const chatBeansPerMin = inrToBeans(chatRatePerMin);

  return {
    voiceRatePerMin,
    chatRatePerMin,
    voiceGrossBeansPerMin,
    voiceBeansPerMin,
    voicePlatformBeansPerMin,
    chatBeansPerMin,
    voice_rate_per_min_inr: voiceRatePerMin,
    chat_rate_per_min_inr: chatRatePerMin,
  };
}

function buildRatesPayload(user, billingSettings) {
  const rates = resolveUserRates(user, billingSettings);
  return {
    ...rates,
    billingEnabled: {
      voice: billingSettings?.videoCallBillingEnabled !== false,
      chat: billingSettings?.liveTalkBillingEnabled !== false,
    },
    minRateInr: MIN_RATE_INR,
    maxRateInr: MAX_RATE_INR,
  };
}

function parseRateUpdate(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_RATE_INR, Math.max(MIN_RATE_INR, Math.round(n * 100) / 100));
}

module.exports = {
  MIN_RATE_INR,
  MAX_RATE_INR,
  resolveUserRates,
  buildRatesPayload,
  parseRateUpdate,
};