const User = require('../models/User');
const UserTaskState = require('../models/UserTaskState');
const {
  diamondsToBeans,
  beansToInr,
  totalWithdrawableBeans,
} = require('./beanConversion');

async function getBeanBalanceSummary(userOrId) {
  const user = userOrId?.beans != null && userOrId?.diamonds != null
    ? userOrId
    : await User.findById(userOrId).select('beans diamonds').lean();
  if (!user) {
    return {
      walletBeans: 0,
      pendingTaskBeans: 0,
      earnedBeans: 0,
      diamonds: 0,
      diamondsAsBeans: 0,
      totalBeans: 0,
      totalWithdrawableBeans: 0,
      withdrawableInr: 0,
    };
  }

  const state = await UserTaskState.findOne({ user_id: user._id || userOrId })
    .select('pending_reward')
    .lean();

  const walletBeans = user.beans || 0;
  const pendingTaskBeans = state?.pending_reward || 0;
  const diamonds = user.diamonds || 0;
  const diamondsAsBeans = diamondsToBeans(diamonds);
  const earnedBeans = walletBeans + pendingTaskBeans;
  const withdrawableBeans = totalWithdrawableBeans(diamonds, earnedBeans);

  return {
    walletBeans,
    pendingTaskBeans,
    earnedBeans,
    diamonds,
    diamondsAsBeans,
    totalBeans: earnedBeans,
    totalWithdrawableBeans: withdrawableBeans,
    withdrawableInr: beansToInr(withdrawableBeans),
  };
}

/** Deduct pending task beans first, then wallet beans, then diamonds */
function deductBeansForWithdrawFull(diamonds, walletBeans, pendingTaskBeans, beansNeeded) {
  const d = Math.max(0, Number(diamonds) || 0);
  const b = Math.max(0, Number(walletBeans) || 0);
  const pending = Math.max(0, Number(pendingTaskBeans) || 0);
  let need = Math.max(0, Number(beansNeeded) || 0);

  const fromPending = Math.min(pending, need);
  need -= fromPending;

  const fromWallet = Math.min(b, need);
  need -= fromWallet;

  return {
    diamonds: d - need,
    beans: b - fromWallet,
    pendingTaskBeans: pending - fromPending,
  };
}

module.exports = {
  getBeanBalanceSummary,
  deductBeansForWithdrawFull,
};