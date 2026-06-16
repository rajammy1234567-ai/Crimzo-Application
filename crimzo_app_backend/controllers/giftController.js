const GiftHistory = require('../models/GiftHistory');
const User = require('../models/User');
const Sticker = require('../models/Sticker');

// Get gift history (Mongo version)
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const mongoose = require('mongoose');
    const uid = new mongoose.Types.ObjectId(userId);

    // Sent
    const sent = await GiftHistory.find({ sender_id: uid })
      .sort({ created_at: -1 })
      .limit(50)
      .populate('sticker_id', 'name icon_name bg_color icon_color')
      .populate('receiver_id', 'username')
      .lean();

    const formattedSent = sent.map(g => ({
      ...g,
      sticker_name: g.sticker_id?.name,
      icon_name: g.sticker_id?.icon_name,
      bg_color: g.sticker_id?.bg_color,
      icon_color: g.sticker_id?.icon_color,
      receiver_name: g.receiver_id?.username
    }));

    // Received
    const received = await GiftHistory.find({ receiver_id: uid })
      .sort({ created_at: -1 })
      .limit(50)
      .populate('sticker_id', 'name icon_name bg_color icon_color')
      .populate('sender_id', 'username')
      .lean();

    const formattedReceived = received.map(g => ({
      ...g,
      sticker_name: g.sticker_id?.name,
      icon_name: g.sticker_id?.icon_name,
      bg_color: g.sticker_id?.bg_color,
      icon_color: g.sticker_id?.icon_color,
      sender_name: g.sender_id?.username
    }));

    // Totals
    const totalSentAgg = await GiftHistory.aggregate([
      { $match: { sender_id: uid } },
      { $group: { _id: null, total: { $sum: '$diamonds_spent' } } }
    ]);
    const totalReceivedAgg = await GiftHistory.aggregate([
      { $match: { receiver_id: uid } },
      { $group: { _id: null, total: { $sum: '$beans_earned' } } }
    ]);

    res.json({
      success: true,
      sent: formattedSent,
      received: formattedReceived,
      totalDiamondsSpent: totalSentAgg[0]?.total || 0,
      totalBeansEarned: totalReceivedAgg[0]?.total || 0
    });
  } catch (error) {
    console.error('Gift history error:', error);
    res.status(500).json({ error: 'Failed to get gift history' });
  }
};
