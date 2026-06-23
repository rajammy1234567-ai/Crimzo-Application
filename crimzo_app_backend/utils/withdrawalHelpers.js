const User = require('../models/User');

async function refundWithdrawalBalance(withdrawal) {
  if (!withdrawal || withdrawal.balance_refunded) return false;
  const diamondsBack = Number(withdrawal.diamonds_deducted) || 0;
  const beansBack = Number(withdrawal.beans_deducted) || Number(withdrawal.beans_used) || 0;
  if (diamondsBack <= 0 && beansBack <= 0) return false;

  const user = await User.findById(withdrawal.user_id).select('diamonds beans');
  if (!user) return false;
  user.diamonds = (user.diamonds || 0) + diamondsBack;
  user.beans = (user.beans || 0) + beansBack;
  await user.save();
  withdrawal.balance_refunded = true;
  withdrawal.beans_refunded = true;
  await withdrawal.save();
  return true;
}

function buildPayoutSnapshot(linkedBank) {
  if (!linkedBank) return null;
  return {
    type: linkedBank.type,
    account_holder_name: linkedBank.account_holder_name || null,
    account_number: linkedBank.account_number || null,
    account_last4: linkedBank.account_last4 || null,
    ifsc: linkedBank.ifsc || null,
    bank_name: linkedBank.bank_name || null,
    upi_id: linkedBank.upi_id || null,
    linked_phone: linkedBank.linked_phone || null,
  };
}

function isManualWithdrawalMode() {
  if (process.env.WITHDRAWAL_MODE === 'manual') return true;
  if (process.env.WITHDRAWAL_MODE === 'razorpay') return false;
  const { isPayoutConfigured } = require('./razorpayPayout');
  return !isPayoutConfigured();
}

const WITHDRAW_DAY_OF_MONTH = 7;

function isWithdrawalDayAllowed(date = new Date()) {
  return date.getDate() === WITHDRAW_DAY_OF_MONTH;
}

function getNextWithdrawalDate(from = new Date()) {
  const year = from.getFullYear();
  const month = from.getMonth();
  if (from.getDate() < WITHDRAW_DAY_OF_MONTH) {
    return new Date(year, month, WITHDRAW_DAY_OF_MONTH);
  }
  return new Date(year, month + 1, WITHDRAW_DAY_OF_MONTH);
}

module.exports = {
  refundWithdrawalBalance,
  buildPayoutSnapshot,
  isManualWithdrawalMode,
  isWithdrawalDayAllowed,
  getNextWithdrawalDate,
  WITHDRAW_DAY_OF_MONTH,
};