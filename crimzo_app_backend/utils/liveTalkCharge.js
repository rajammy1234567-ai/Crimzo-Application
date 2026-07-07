const mongoose = require('mongoose');
const User = require('../models/User');
const AppSettings = require('../models/AppSettings');
const { inrToBeans } = require('./beanConversion');
const { splitCallBeans } = require('./callCommission');
const { emitBalanceUpdate } = require('./socketEmitter');

const BILLING_KEY = 'billing';

class InsufficientWalletError extends Error {
  constructor() {
    super('Insufficient wallet balance');
    this.code = 'INSUFFICIENT_BALANCE';
  }
}

/**
 * Debit viewer wallet; credit host 70% diamonds and platform (owner) 30% beans.
 * Viewer still pays full rate INR/min from wallet.
 */
async function chargeLiveTalkMinute({ talkerId, hostId, rateInr }) {
  const rate = Math.max(0, Number(rateInr) || 0);
  if (rate <= 0) {
    return {
      wallet_balance: 0,
      hostDiamonds: 0,
      diamondsEarned: 0,
      platformBeans: 0,
      grossBeans: 0,
    };
  }

  const { grossBeans, receiverBeans, platformBeans } = splitCallBeans(inrToBeans(rate));
  const dbSession = await mongoose.startSession();

  try {
    let talkerWallet;
    let hostDiamonds;

    await dbSession.withTransaction(async () => {
      const talker = await User.findOneAndUpdate(
        { _id: talkerId, wallet_balance: { $gte: rate } },
        { $inc: { wallet_balance: -rate } },
        { new: true, session: dbSession },
      ).select('wallet_balance');
      if (!talker) throw new InsufficientWalletError();

      const host = await User.findByIdAndUpdate(
        hostId,
        { $inc: { diamonds: receiverBeans } },
        { new: true, session: dbSession },
      ).select('diamonds');
      if (!host) throw new Error('Host not found');

      if (platformBeans > 0) {
        await AppSettings.findOneAndUpdate(
          { key: BILLING_KEY },
          { $inc: { platform_beans_earned: platformBeans } },
          { upsert: true, session: dbSession },
        );
      }

      talkerWallet = talker.wallet_balance;
      hostDiamonds = host.diamonds;
    });

    emitBalanceUpdate(hostId, { diamonds: hostDiamonds });

    return {
      wallet_balance: talkerWallet,
      hostDiamonds,
      diamondsEarned: receiverBeans,
      platformBeans,
      grossBeans,
    };
  } finally {
    dbSession.endSession();
  }
}

/**
 * Debit caller wallet; credit callee 70% diamonds and platform (owner) 30% beans.
 * Caller still pays full rate INR/min from wallet.
 */
async function chargeCallMinute({ talkerId, hostId, rateInr }) {
  const rate = Math.max(0, Number(rateInr) || 0);
  if (rate <= 0) {
    return {
      wallet_balance: 0,
      hostDiamonds: 0,
      diamondsEarned: 0,
      platformBeans: 0,
      grossBeans: 0,
    };
  }

  const { grossBeans, receiverBeans, platformBeans } = splitCallBeans(inrToBeans(rate));
  const dbSession = await mongoose.startSession();

  try {
    let talkerWallet;
    let hostDiamonds;

    await dbSession.withTransaction(async () => {
      const talker = await User.findOneAndUpdate(
        { _id: talkerId, wallet_balance: { $gte: rate } },
        { $inc: { wallet_balance: -rate } },
        { new: true, session: dbSession },
      ).select('wallet_balance');
      if (!talker) throw new InsufficientWalletError();

      const host = await User.findByIdAndUpdate(
        hostId,
        { $inc: { diamonds: receiverBeans } },
        { new: true, session: dbSession },
      ).select('diamonds');
      if (!host) throw new Error('Callee not found');

      if (platformBeans > 0) {
        await AppSettings.findOneAndUpdate(
          { key: BILLING_KEY },
          { $inc: { platform_beans_earned: platformBeans } },
          { upsert: true, session: dbSession },
        );
      }

      talkerWallet = talker.wallet_balance;
      hostDiamonds = host.diamonds;
    });

    emitBalanceUpdate(hostId, { diamonds: hostDiamonds });

    return {
      wallet_balance: talkerWallet,
      hostDiamonds,
      diamondsEarned: receiverBeans,
      platformBeans,
      grossBeans,
    };
  } finally {
    dbSession.endSession();
  }
}

module.exports = {
  chargeLiveTalkMinute,
  chargeCallMinute,
  InsufficientWalletError,
};