const mongoose = require('mongoose');
const User = require('../models/User');
const { emitBalanceUpdate, emitGiftReceived } = require('./socketEmitter');

async function transferGift(senderId, receiverId, amount) {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error('Invalid gift amount');
  }
  if (String(senderId) === String(receiverId)) {
    throw new Error('Cannot gift yourself');
  }

  const receiverExists = await User.findById(receiverId).select('_id');
  if (!receiverExists) throw new Error('Receiver not found');

  const sender = await User.findOneAndUpdate(
    { _id: senderId, diamonds: { $gte: value } },
    { $inc: { diamonds: -value } },
    { new: true },
  ).select('diamonds username');
  if (!sender) throw new Error('Insufficient diamonds');

  try {
    const receiver = await User.findByIdAndUpdate(
      receiverId,
      { $inc: { diamonds: value } },
      { new: true },
    ).select('diamonds');
    if (!receiver) {
      throw new Error('Receiver not found');
    }

    const { recordTaskAction } = require('./taskProgress');
    void recordTaskAction(senderId, 'spend_diamonds', value).catch(() => {});
    void recordTaskAction(senderId, 'send_gift', 1).catch(() => {});

    const senderDiamonds = sender.diamonds;
    const receiverDiamonds = receiver.diamonds || 0;

    emitBalanceUpdate(senderId, { diamonds: senderDiamonds });
    emitBalanceUpdate(receiverId, { diamonds: receiverDiamonds });
    emitGiftReceived(receiverId, {
      senderId: String(senderId),
      amount: value,
      diamondsSpent: value,
      diamondsEarned: value,
    });

    return {
      senderDiamonds,
      receiverBeans: receiverDiamonds, // Kept as receiverBeans to not break socket clients expecting this key
      beansEarned: value, // Kept as beansEarned for GiftHistory
      transferred: value,
    };
  } catch (err) {
    await User.findByIdAndUpdate(senderId, { $inc: { diamonds: value } }).catch(() => {});
    throw err;
  }
}

/** Undo a completed gift transfer (e.g. if message save fails after debit). */
async function rollbackGiftTransfer(senderId, receiverId, amount) {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value < 1) return;

  const receiver = await User.findOneAndUpdate(
    { _id: receiverId, diamonds: { $gte: value } },
    { $inc: { diamonds: -value } },
    { new: true },
  ).select('diamonds');
  if (!receiver) {
    throw new Error('Could not rollback gift — receiver balance changed');
  }

  const sender = await User.findByIdAndUpdate(
    senderId,
    { $inc: { diamonds: value } },
    { new: true },
  ).select('diamonds');

  if (sender) {
    emitBalanceUpdate(senderId, { diamonds: sender.diamonds });
  }
  emitBalanceUpdate(receiverId, { diamonds: receiver.diamonds });
}

/** @deprecated Use transferGift — credits beans to receiver for withdrawable earnings */
async function transferDiamonds(senderId, receiverId, amount) {
  return transferGift(senderId, receiverId, amount);
}

module.exports = { transferGift, transferDiamonds, rollbackGiftTransfer };