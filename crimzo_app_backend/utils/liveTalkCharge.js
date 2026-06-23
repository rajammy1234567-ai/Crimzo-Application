const mongoose = require('mongoose');
const User = require('../models/User');
const { inrToBeans } = require('./beanConversion');
const { emitBalanceUpdate } = require('./socketEmitter');

class InsufficientWalletError extends Error {
  constructor() {
    super('Insufficient wallet balance');
    this.code = 'INSUFFICIENT_BALANCE';
  }
}

/**
 * Debit viewer wallet and credit host beans for one live-talk minute.
 * ₹1/min → 50 beans for host (5000 beans = ₹100).
 */
async function chargeLiveTalkMinute({ talkerId, hostId, rateInr }) {
  const rate = Math.max(0, Number(rateInr) || 0);
  if (rate <= 0) {
    return { wallet_balance: 0, hostBeans: 0, beansEarned: 0 };
  }

  const beansEarned = inrToBeans(rate);
  const dbSession = await mongoose.startSession();

  try {
    let talkerWallet;
    let hostBeans;

    await dbSession.withTransaction(async () => {
      const talker = await User.findOneAndUpdate(
        { _id: talkerId, wallet_balance: { $gte: rate } },
        { $inc: { wallet_balance: -rate } },
        { new: true, session: dbSession },
      ).select('wallet_balance');
      if (!talker) throw new InsufficientWalletError();

      const host = await User.findByIdAndUpdate(
        hostId,
        { $inc: { beans: beansEarned } },
        { new: true, session: dbSession },
      ).select('beans');
      if (!host) throw new Error('Host not found');

      talkerWallet = talker.wallet_balance;
      hostBeans = host.beans;
    });

    emitBalanceUpdate(hostId, { beans: hostBeans });

    return {
      wallet_balance: talkerWallet,
      hostBeans,
      beansEarned,
    };
  } finally {
    dbSession.endSession();
  }
}

module.exports = {
  chargeLiveTalkMinute,
  InsufficientWalletError,
};