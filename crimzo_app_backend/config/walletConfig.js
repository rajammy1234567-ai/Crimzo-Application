/** Preset amounts (INR) for "Add Money" to app wallet — like trading apps. */
const TOPUP_PRESETS = [100, 500, 1000, 2000, 5000, 10000];

const MIN_TOPUP_INR = 50;
const MAX_TOPUP_INR = 200000;
const MIN_WITHDRAW_INR = 500;
const MAX_WITHDRAW_INR = 200000;

/** Preset diamond gift amounts in chat */
const CHAT_GIFT_PRESETS = [10, 50, 100, 500, 1000];

module.exports = {
  TOPUP_PRESETS,
  MIN_TOPUP_INR,
  MAX_TOPUP_INR,
  MIN_WITHDRAW_INR,
  MAX_WITHDRAW_INR,
  CHAT_GIFT_PRESETS,
};