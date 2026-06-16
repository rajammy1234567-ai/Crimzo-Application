const mongoose = require('mongoose');
const User = require('../models/User');

async function transferDiamonds(senderId, receiverId, amount) {
  const diamonds = Math.floor(Number(amount));
  if (!Number.isFinite(diamonds) || diamonds < 1) {
    throw new Error('Invalid diamond amount');
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
        { _id: senderId, diamonds: { $gte: diamonds } },
        { $inc: { diamonds: -diamonds } },
        { new: true, session },
      ).select('diamonds username');
      if (!sender) throw new Error('Insufficient diamonds');

      await User.findByIdAndUpdate(
        receiverId,
        { $inc: { diamonds } },
        { session },
      );

      senderAfter = sender;
    });

    const receiverAfter = await User.findById(receiverId).select('diamonds');
    return {
      senderDiamonds: senderAfter.diamonds,
      receiverDiamonds: receiverAfter?.diamonds || 0,
      transferred: diamonds,
    };
  } finally {
    session.endSession();
  }
}

module.exports = { transferDiamonds };