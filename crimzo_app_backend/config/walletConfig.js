/** Preset amounts (INR) for "Add Money" to app wallet — like trading apps. */
const TOPUP_PRESETS = [100, 500, 1000, 2000, 5000, 10000];

const MIN_TOPUP_INR = 50;
const MAX_TOPUP_INR = 200000;
const MIN_WITHDRAW_INR = 500;
const MAX_WITHDRAW_INR = 200000;

/** 5000 beans = ₹100 (tier-1 package rate) */
const BEANS_PER_INR = 50;
const MIN_WITHDRAW_BEANS = MIN_WITHDRAW_INR * BEANS_PER_INR;

/** Preset diamond gift amounts in chat */
const CHAT_GIFT_PRESETS = [10, 50, 100, 500, 1000];

/** 1-on-1 video call — caller pays from wallet (INR per minute) */
const VIDEO_CALL_RATE_PER_MIN_INR = 1;

/** Live talk with host — viewer pays from wallet (INR per minute) */
const LIVE_TALK_RATE_PER_MIN_INR = 1;

module.exports = {
  TOPUP_PRESETS,
  MIN_TOPUP_INR,
  MAX_TOPUP_INR,
  MIN_WITHDRAW_INR,
  MAX_WITHDRAW_INR,
  BEANS_PER_INR,
  MIN_WITHDRAW_BEANS,
  CHAT_GIFT_PRESETS,
  VIDEO_CALL_RATE_PER_MIN_INR,
  LIVE_TALK_RATE_PER_MIN_INR,
};