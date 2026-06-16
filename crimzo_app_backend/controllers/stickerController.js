const Sticker = require('../models/Sticker');
const UserSticker = require('../models/UserSticker');
const User = require('../models/User');
const GiftHistory = require('../models/GiftHistory');

// Get sticker catalog
exports.getCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const stickers = await Sticker.find().sort({ category: 1, price: 1 }).lean();

    const owned = await UserSticker.find({ user_id: userId }).select('sticker_id').lean();
    const ownedSet = new Set(owned.map(o => String(o.sticker_id)));

    const enriched = stickers.map(s => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      icon_name: s.icon_name,
      icon_color: s.icon_color,
      bg_color: s.bg_color,
      category: s.category,
      price: s.price,
      is_animated: s.is_animated,
      owned: ownedSet.has(String(s._id))
    }));

    const user = await User.findById(userId).select('diamonds');
    res.json({ success: true, stickers: enriched, diamonds: user?.diamonds || 0 });
  } catch (error) {
    console.error('Get sticker catalog error:', error);
    res.status(500).json({ error: 'Failed to get sticker catalog' });
  }
};

// Buy sticker
exports.buySticker = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stickerId } = req.body;

    if (!stickerId) {
      return res.status(400).json({ error: 'Sticker ID required' });
    }

    const sticker = await Sticker.findById(stickerId);
    if (!sticker) {
      return res.status(404).json({ error: 'Sticker not found' });
    }

    const existing = await UserSticker.findOne({ user_id: userId, sticker_id: stickerId });
    if (existing) {
      return res.status(400).json({ error: 'You already own this sticker' });
    }

    const user = await User.findById(userId);
    const userDiamonds = user?.diamonds || 0;

    if (userDiamonds < sticker.price) {
      return res.status(400).json({ error: `Not enough diamonds. Need ${sticker.price}, have ${userDiamonds}` });
    }

    user.diamonds = userDiamonds - sticker.price;
    await user.save();

    await UserSticker.create({ user_id: userId, sticker_id: stickerId });

    console.log(`User ${userId} bought sticker ${sticker.name} for ${sticker.price} diamonds`);

    res.json({
      success: true,
      message: `Purchased ${sticker.name}!`,
      remainingDiamonds: user.diamonds,
      sticker: sticker.toJSON()
    });
  } catch (error) {
    console.error('Buy sticker error:', error);
    res.status(500).json({ error: 'Failed to buy sticker' });
  }
};

// Get owned stickers
exports.getOwned = async (req, res) => {
  try {
    const userId = req.user.id;
    const owned = await UserSticker.find({ user_id: userId })
      .sort({ purchased_at: -1 })
      .populate('sticker_id')
      .lean();

    const stickers = owned.map(o => o.sticker_id).filter(Boolean);
    res.json({ success: true, stickers });
  } catch (error) {
    console.error('Get owned stickers error:', error);
    res.status(500).json({ error: 'Failed to get owned stickers' });
  }
};

// Get collected stickers (received as gifts during live streams)
exports.getCollected = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const agg = await GiftHistory.aggregate([
      { $match: { receiver_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: {
        _id: '$sticker_id',
        receive_count: { $sum: 1 },
        total_beans: { $sum: '$beans_earned' }
      } },
      { $sort: { receive_count: -1 } }
    ]);

    const stickerIds = agg.map(a => a._id).filter(Boolean);
    const stickersDocs = await Sticker.find({ _id: { $in: stickerIds } }).lean();
    const stickerMap = {};
    stickersDocs.forEach(s => { stickerMap[String(s._id)] = s; });

    const stickers = agg.map(a => {
      const s = stickerMap[String(a._id)];
      if (!s) return null;
      return {
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        icon_name: s.icon_name,
        icon_color: s.icon_color,
        bg_color: s.bg_color,
        category: s.category,
        price: s.price,
        is_animated: s.is_animated,
        receive_count: a.receive_count,
        total_beans: a.total_beans || 0
      };
    }).filter(Boolean);

    const totals = await GiftHistory.aggregate([
      { $match: { receiver_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, total_gifts: { $sum: 1 }, total_beans: { $sum: '$beans_earned' } } }
    ]);

    res.json({
      success: true,
      stickers,
      totalGifts: totals[0]?.total_gifts || 0,
      totalBeans: totals[0]?.total_beans || 0
    });
  } catch (error) {
    console.error('Get collected stickers error:', error);
    res.status(500).json({ error: 'Failed to get collected stickers' });
  }
};

// Send sticker in live
exports.sendSticker = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { stickerId, receiverId, sessionId } = req.body;

    if (!stickerId) {
      return res.status(400).json({ error: 'Sticker ID required' });
    }

    const sticker = await Sticker.findById(stickerId);
    if (!sticker) {
      return res.status(404).json({ error: 'Sticker not found' });
    }

    const user = await User.findById(senderId);
    const userDiamonds = user?.diamonds || 0;

    if (userDiamonds < sticker.price) {
      return res.status(400).json({ 
        error: 'Not enough diamonds',
        required: sticker.price,
        current: userDiamonds
      });
    }

    user.diamonds = userDiamonds - sticker.price;
    await user.save();

    if (receiverId) {
      await User.findByIdAndUpdate(receiverId, { $inc: { diamonds: sticker.price } });
    }

    await GiftHistory.create({
      sender_id: senderId,
      receiver_id: receiverId || null,
      sticker_id: stickerId,
      diamonds_spent: sticker.price,
      beans_earned: 0,
      session_id: sessionId || null
    });

    console.log(`User ${senderId} sent sticker ${sticker.name} (${sticker.price} diamonds) to ${receiverId || 'stream'}`);

    res.json({
      success: true,
      remainingDiamonds: user.diamonds,
      sticker: sticker.toJSON(),
      diamondsCredited: receiverId ? sticker.price : 0,
    });
  } catch (error) {
    console.error('Send sticker error:', error);
    res.status(500).json({ error: 'Failed to send sticker' });
  }
};
