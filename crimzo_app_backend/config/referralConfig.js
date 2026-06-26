/**
 * Referral rewards are credited as diamonds only (never wallet INR).
 * INR values below are used only to compute the diamond equivalent at tier-1 rate.
 */
const REFERRAL_REWARD_INR = 100;
const REFERRED_USER_REWARD_INR = 50;

/** Tier-1 diamond rate (₹272 → 13,800 diamonds) — same basis as PK unlock. */
const DIAMOND_RATE = 13800 / 272;
const REFERRAL_REWARD_DIAMONDS = Math.round(REFERRAL_REWARD_INR * DIAMOND_RATE);
const REFERRED_USER_REWARD_DIAMONDS = Math.round(REFERRED_USER_REWARD_INR * DIAMOND_RATE);

const REFERRAL_WEB_BASE_URL = process.env.REFERRAL_WEB_BASE_URL || 'https://www.crimzo.live';

/** App download page — used on invite landing when app is not on Play Store. */
const APP_DOWNLOAD_URL = process.env.APP_DOWNLOAD_URL || REFERRAL_WEB_BASE_URL;

const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.livestreamhub';

module.exports = {
  REFERRAL_REWARD_INR,
  REFERRAL_REWARD_DIAMONDS,
  REFERRED_USER_REWARD_INR,
  REFERRED_USER_REWARD_DIAMONDS,
  REFERRAL_WEB_BASE_URL,
  APP_DOWNLOAD_URL,
  PLAY_STORE_URL,
};