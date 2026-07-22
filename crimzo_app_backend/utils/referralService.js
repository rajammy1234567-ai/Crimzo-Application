const User = require('../models/User');
const Referral = require('../models/Referral');
const {
  REFERRAL_REWARD_INR,
  REFERRAL_REWARD_DIAMONDS,
  REFERRED_USER_REWARD_INR,
  REFERRED_USER_REWARD_DIAMONDS,
  REFERRAL_WEB_BASE_URL,
} = require('../config/referralConfig');
const { emitDiamondUpdate } = require('./socketEmitter');
const { pushNotification } = require('./notificationHelper');
const { recordTaskAction } = require('./taskProgress');

function normalizeReferralCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let code = raw.trim().toUpperCase();
  if (!code) return null;
  if (code.startsWith('CRIMZO-')) code = code.slice('CRIMZO-'.length);
  if (code.startsWith('CRIMZO')) code = code.slice('CRIMZO'.length);
  code = code.replace(/^-+/, '').trim();
  return code || null;
}

function buildReferralLink(crimzoId) {
  const code = normalizeReferralCode(crimzoId);
  if (!code) return null;
  const base = String(REFERRAL_WEB_BASE_URL || 'https://www.crimzo.live').replace(/\/+$/, '');
  return `${base}`;
}

async function findReferrerByCode(referralCode) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return null;
  return User.findOne({ crimzo_id: code }).select('id crimzo_id username avatar is_banned');
}

function extractReferralCodeFromBody(body = {}) {
  return normalizeReferralCode(
    body.referralCode || body.referral_code || body.inviteCode || body.invite_code || '',
  );
}

/**
 * Award referrer when a brand-new user signs up with a valid referral code.
 * Failures are non-fatal — signup must still succeed.
 */
async function processReferralSignup(newUser, referralCode) {
  const code = normalizeReferralCode(referralCode);
  if (!code || !newUser?.id) {
    return { applied: false, reason: 'missing_code_or_user' };
  }

  const referrer = await findReferrerByCode(code);
  if (!referrer) {
    return { applied: false, reason: 'invalid_code' };
  }

  if (referrer.is_banned) {
    return { applied: false, reason: 'referrer_banned' };
  }

  if (String(referrer.id) === String(newUser.id)) {
    return { applied: false, reason: 'self_referral' };
  }

  const existingReferral = await Referral.findOne({ referred_user_id: newUser.id }).lean();
  if (existingReferral) {
    return { applied: false, reason: 'already_referred' };
  }

  // Track referral even when free diamond grants are off (0 diamonds)
  const referrerInc = { referral_count: 1 };
  if (REFERRAL_REWARD_DIAMONDS > 0) referrerInc.diamonds = REFERRAL_REWARD_DIAMONDS;

  const updatedReferrer = await User.findByIdAndUpdate(
    referrer.id,
    { $inc: referrerInc },
    { new: true },
  ).select('diamonds referral_count username');

  if (!updatedReferrer) {
    return { applied: false, reason: 'referrer_update_failed' };
  }

  const referredUpdate = { referred_by: referrer.id };
  if (REFERRED_USER_REWARD_DIAMONDS > 0) {
    referredUpdate.$inc = { diamonds: REFERRED_USER_REWARD_DIAMONDS };
  }

  const updatedReferredUser = await User.findByIdAndUpdate(
    newUser.id,
    referredUpdate,
    { new: true },
  ).select('diamonds username');

  if (!updatedReferredUser) {
    return { applied: false, reason: 'referred_user_update_failed' };
  }

  await Referral.create({
    referrer_id: referrer.id,
    referred_user_id: newUser.id,
    referral_code: code,
    reward_inr: REFERRAL_REWARD_INR,
    reward_diamonds: REFERRAL_REWARD_DIAMONDS,
    status: 'completed',
  });

  if (REFERRAL_REWARD_DIAMONDS > 0) {
    emitDiamondUpdate(referrer.id, updatedReferrer.diamonds);
  }
  if (REFERRED_USER_REWARD_DIAMONDS > 0) {
    emitDiamondUpdate(newUser.id, updatedReferredUser.diamonds);
  }

  if (REFERRAL_REWARD_DIAMONDS > 0) {
    void pushNotification({
      userId: referrer.id,
      type: 'referral_reward',
      title: 'Referral reward!',
      body: `${newUser.username || 'A friend'} joined with your link. You earned ${REFERRAL_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds.`,
      actor: { id: newUser.id, username: newUser.username, avatar: newUser.avatar },
      referenceId: newUser.id,
    }).catch(() => {});
  }

  if (REFERRED_USER_REWARD_DIAMONDS > 0) {
    void pushNotification({
      userId: newUser.id,
      type: 'referral_welcome',
      title: 'Welcome bonus!',
      body: `You joined with a referral link and earned ${REFERRED_USER_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds.`,
      actor: { id: referrer.id, username: referrer.username, avatar: referrer.avatar },
      referenceId: referrer.id,
    }).catch(() => {});
  }

  void recordTaskAction(referrer.id, 'invite', 1).catch(() => {});

  return {
    applied: true,
    referrerId: referrer.id,
    rewardDiamonds: REFERRAL_REWARD_DIAMONDS,
    rewardInr: REFERRAL_REWARD_INR,
    referredUserRewardDiamonds: REFERRED_USER_REWARD_DIAMONDS,
    referredUserRewardInr: REFERRED_USER_REWARD_INR,
    referredUserDiamonds: updatedReferredUser.diamonds,
    referrerDiamonds: updatedReferrer.diamonds,
    referrerReferralCount: updatedReferrer.referral_count,
  };
}

async function getReferralStatsForUser(userId) {
  const user = await User.findById(userId).select('crimzo_id referral_count diamonds').lean();
  if (!user) return null;

  const referrals = await Referral.find({ referrer_id: userId, status: 'completed' })
    .sort({ created_at: -1 })
    .limit(50)
    .populate('referred_user_id', 'username avatar created_at')
    .lean();

  const totalEarnedDiamonds = referrals.reduce((sum, row) => sum + (row.reward_diamonds || 0), 0);

  return {
    referralCode: user.crimzo_id,
    referralLink: buildReferralLink(user.crimzo_id),
    referralCount: user.referral_count || referrals.length,
    totalEarnedDiamonds,
    rewardPerReferralInr: REFERRAL_REWARD_INR,
    rewardPerReferralDiamonds: REFERRAL_REWARD_DIAMONDS,
    referredUserRewardInr: REFERRED_USER_REWARD_INR,
    referredUserRewardDiamonds: REFERRED_USER_REWARD_DIAMONDS,
    referrals: referrals.map((row) => {
      const referred = row.referred_user_id;
      return {
        id: row.id || row._id?.toString(),
        username: referred?.username || 'User',
        avatar: referred?.avatar || null,
        rewardDiamonds: row.reward_diamonds,
        joinedAt: referred?.created_at || row.created_at,
      };
    }),
  };
}

module.exports = {
  normalizeReferralCode,
  buildReferralLink,
  findReferrerByCode,
  extractReferralCodeFromBody,
  processReferralSignup,
  getReferralStatsForUser,
  REFERRAL_REWARD_INR,
  REFERRAL_REWARD_DIAMONDS,
  REFERRED_USER_REWARD_INR,
  REFERRED_USER_REWARD_DIAMONDS,
};