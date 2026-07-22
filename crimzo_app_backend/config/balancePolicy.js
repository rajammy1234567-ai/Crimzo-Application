/**
 * Crimzo balance rules:
 * Money (wallet INR / diamonds / beans) must NOT increase by itself.
 *
 * Allowed credits only:
 *  - purchase: Razorpay/wallet top-up or package buy (user paid)
 *  - earn: peer paid (gifts, live talk, video call host share)
 *  - refund: failed withdrawal / failed gift rollback
 *  - admin: explicit admin panel adjust
 *  - competition: PK monthly winner (optional platform prize)
 *
 * Free platform grants (guest welcome, daily check-in beans, streak
 * milestones, task freebies, referral welcome) are OFF by default.
 */
const FREE_PLATFORM_GRANTS_ENABLED = process.env.FREE_PLATFORM_GRANTS === 'true';

/** New guest / signup balances — always start at zero unless free grants re-enabled. */
const GUEST_STARTING_DIAMONDS = FREE_PLATFORM_GRANTS_ENABLED ? 100 : 0;
const GUEST_STARTING_BEANS = 0;
const REGISTER_STARTING_DIAMONDS = 0;
const REGISTER_STARTING_BEANS = 0;

/** Daily check-in free beans (was 50). Earn only via paid activity. */
const DAILY_CHECKIN_BEANS = FREE_PLATFORM_GRANTS_ENABLED ? 50 : 0;

module.exports = {
  FREE_PLATFORM_GRANTS_ENABLED,
  GUEST_STARTING_DIAMONDS,
  GUEST_STARTING_BEANS,
  REGISTER_STARTING_DIAMONDS,
  REGISTER_STARTING_BEANS,
  DAILY_CHECKIN_BEANS,
};
