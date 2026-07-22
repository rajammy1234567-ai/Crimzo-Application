/**
 * Referral rewards are credited as diamonds only (never wallet INR).
 * Free platform diamonds are OFF by default — balance only via purchase / real earn.
 * Set FREE_PLATFORM_GRANTS=true to re-enable referral free diamonds.
 */
const FREE_ON = process.env.FREE_PLATFORM_GRANTS === 'true';
const REFERRAL_REWARD_INR = FREE_ON ? 100 : 0;
const REFERRED_USER_REWARD_INR = FREE_ON ? 50 : 0;

/** Tier-1 diamond rate (₹272 → 13,800 diamonds) — same basis as PK unlock. */
const DIAMOND_RATE = 13800 / 272;
const REFERRAL_REWARD_DIAMONDS = Math.round(REFERRAL_REWARD_INR * DIAMOND_RATE);
const REFERRED_USER_REWARD_DIAMONDS = Math.round(REFERRED_USER_REWARD_INR * DIAMOND_RATE);

const REFERRAL_WEB_BASE_URL = process.env.REFERRAL_WEB_BASE_URL || 'https://www.crimzo.live';

/** App download page — used on invite landing when app is not on Play Store. */
const APP_DOWNLOAD_URL = process.env.APP_DOWNLOAD_URL || REFERRAL_WEB_BASE_URL;

const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.crimzolive';

module.exports = {
  REFERRAL_REWARD_INR,
  REFERRAL_REWARD_DIAMONDS,
  REFERRED_USER_REWARD_INR,
  REFERRED_USER_REWARD_DIAMONDS,
  REFERRAL_WEB_BASE_URL,
  APP_DOWNLOAD_URL,
  PLAY_STORE_URL,
};