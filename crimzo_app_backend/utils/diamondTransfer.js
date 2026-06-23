const mongoose = require('mongoose');
const User = require('../models/User');

async function transferGift(senderId, receiverId, amount) {
  const value = Math.floor(Number(amount));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error('Invalid gift amount');
  }
  if (String(senderId) === String(receiverId)) {
    throw new Error('Cannot gift yourself');
  }

  const receiver = await User.findById(receiverId).select('_id username');
  if (!receiver) throw new Error('Receiver not found');

  const session = await mongoose.startSession();
  try {
    let senderAfter;
    await session.withTransaction(async () => {
      const sender = await User.findOneAndUpdate(
        { _id: senderId, diamonds: { $gte: value } },
        { $inc: { diamonds: -value } },
        { new: true, session },
      ).select('diamonds username');
      if (!sender) throw new Error('Insufficient diamonds');

      await User.findByIdAndUpdate(
        receiverId,
        { $inc: { beans: value } },
        { session },
      );

      senderAfter = sender;
    });

    const receiverAfter = await User.findById(receiverId).select('beans diamonds');

    const { recordTaskAction } = require('./taskProgress');
    void recordTaskAction(senderId, 'spend_diamonds', value).catch(() => {});
    void recordTaskAction(senderId, 'send_gift', 1).catch(() => {});

    return {
      senderDiamonds: senderAfter.diamonds,
      receiverBeans: receiverAfter?.beans || 0,
      beansEarned: value,
      transferred: value,
    };
  } finally {
    session.endSession();
  }
}

/** @deprecated Use transferGift — credits beans to receiver for withdrawable earnings */
async function transferDiamonds(senderId, receiverId, amount) {
  return transferGift(senderId, receiverId, amount);
}

module.exports = { transferGift, transferDiamonds };