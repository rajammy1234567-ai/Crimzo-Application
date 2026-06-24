const mongoose = require('mongoose');
const Sticker = require('../models/Sticker');
const User = require('../models/User');
const UserSticker = require('../models/UserSticker');
const GiftHistory = require('../models/GiftHistory');
const { transferGift } = require('../utils/diamondTransfer');
const { getIo } = require('../utils/socketEmitter');
const { verifyPrivateTalkAccess, emitPrivateTalkMessage } = require('./liveTalkController');
const { userRoom } = require('../utils/socketEmitter');

function stickerPublicId(doc) {
  if (!doc) return null;
  return doc._id ? doc._id.toString() : String(doc.id || '');
}

function mapSticker(doc, owned = false) {
  return {
    id: stickerPublicId(doc),
    name: doc.name,
    emoji: doc.emoji,
    icon_name: doc.icon_name,
    icon_color: doc.icon_color,
    bg_color: doc.bg_color,
    category: doc.category,
    price: doc.price,
    is_animated: !!doc.is_animated,
    owned,
  };
}

exports.getCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const [stickers, user, ownedRows] = await Promise.all([
      Sticker.find().sort({ price: 1 }).lean(),
      User.findById(userId).select('diamonds'),
      UserSticker.find({ user_id: userId }).select('sticker_id').lean(),
    ]);

    const ownedSet = new Set(ownedRows.map((r) => String(r.sticker_id)));
    res.json({
      success: true,
      stickers: stickers.map((s) => mapSticker(s, ownedSet.has(String(s._id)))),
      diamonds: user?.diamonds || 0,
    });
  } catch (error) {
    console.error('Get sticker catalog error:', error);
    res.status(500).json({ error: 'Failed to load stickers' });
  }
};

exports.buySticker = async (req, res) => {
  try {
    const userId = req.user.id;
    const stickerId = req.body.stickerId || req.body.sticker_id;
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

    const user = await User.findById(userId).select('diamonds');
    const balance = user?.diamonds || 0;
    if (balance < sticker.price) {
      return res.status(400).json({
        error: 'Not enough diamonds',
        required: sticker.price,
        current: balance,
      });
    }

    user.diamonds = balance - sticker.price;
    await user.save();
    await UserSticker.create({ user_id: userId, sticker_id: stickerId });

    res.json({
      success: true,
      message: `Purchased ${sticker.name}!`,
      remainingDiamonds: user.diamonds,
      sticker: mapSticker(sticker.toObject(), true),
    });
  } catch (error) {
    console.error('Buy sticker error:', error);
    res.status(500).json({ error: 'Purchase failed' });
  }
};

exports.getOwned = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await UserSticker.find({ user_id: userId })
      .populate('sticker_id')
      .lean();

    const stickers = rows
      .filter((r) => r.sticker_id)
      .map((r) => mapSticker(r.sticker_id, true));

    res.json({ success: true, stickers });
  } catch (error) {
    console.error('Get owned stickers error:', error);
    res.status(500).json({ error: 'Failed to load owned stickers' });
  }
};

exports.getCollected = async (req, res) => {
  try {
    const targetId = req.params.userId || req.user.id;
    const uid = new mongoose.Types.ObjectId(targetId);

    const agg = await GiftHistory.aggregate([
      { $match: { receiver_id: uid, sticker_id: { $ne: null } } },
      {
        $group: {
          _id: '$sticker_id',
          receive_count: { $sum: 1 },
          total_beans: { $sum: '$beans_earned' },
        },
      },
    ]);

    const stickerIds = agg.map((a) => a._id);
    const stickerDocs = await Sticker.find({ _id: { $in: stickerIds } }).lean();
    const stickerMap = new Map(stickerDocs.map((s) => [String(s._id), s]));

    const stickers = agg
      .map((a) => {
        const doc = stickerMap.get(String(a._id));
        if (!doc) return null;
        return {
          ...mapSticker(doc),
          receive_count: a.receive_count,
          total_beans: a.total_beans || 0,
        };
      })
      .filter(Boolean);

    const totals = await GiftHistory.aggregate([
      { $match: { receiver_id: uid } },
      { $group: { _id: null, total_gifts: { $sum: 1 }, gift_beans_earned: { $sum: '$beans_earned' } } },
    ]);

    const { getBeanBalanceSummary } = require('../utils/beanBalance');
    const balance = await getBeanBalanceSummary(targetId);

    res.json({
      success: true,
      stickers,
      totalGifts: totals[0]?.total_gifts || 0,
      giftBeansEarned: totals[0]?.gift_beans_earned || 0,
      totalBeans: balance.totalBeans,
      walletBeans: balance.walletBeans,
      pendingTaskBeans: balance.pendingTaskBeans,
    });
  } catch (error) {
    console.error('Get collected stickers error:', error);
    res.status(500).json({ error: 'Failed to get collected stickers' });
  }
};

async function broadcastStickerGift({
  senderId,
  senderUsername,
  receiverId,
  sticker,
  stickerId,
  sessionId,
  talkSessionId,
  channelName,
}) {
  const io = getIo();
  if (!io) return;

  const base = {
    id: `stk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'sticker',
    userId: String(senderId),
    username: senderUsername || 'User',
    stickerId: String(stickerId),
    emoji: sticker.emoji,
    stickerName: sticker.name,
    icon_name: sticker.icon_name || 'gift',
    icon_color: sticker.icon_color || '#FFF',
    bg_color: sticker.bg_color || '#FF2D55',
    gift_diamonds: sticker.price,
    timestamp: Date.now(),
  };

  if (talkSessionId) {
    const talk = await verifyPrivateTalkAccess(talkSessionId, senderId);
    if (!talk) {
      throw new Error('Private chat session is not active');
    }
    emitPrivateTalkMessage(io, talkSessionId, talk, base);
    return;
  }

  if (channelName) {
    const payload = { ...base, channelName: String(channelName) };
    io.to(userRoom(senderId)).emit('call_gift_received', payload);
    if (receiverId) {
      io.to(userRoom(receiverId)).emit('call_gift_received', payload);
    }
    return;
  }

  if (sessionId) {
    io.to(`live_${String(sessionId)}`).emit('live_chat_message', base);
  }
}

exports.sendSticker = async (req, res) => {
  try {
    const senderId = req.user.id;
    const stickerId = req.body.stickerId || req.body.sticker_id;
    const { receiverId, sessionId, talkSessionId, channelName } = req.body;

    if (!stickerId) {
      return res.status(400).json({ error: 'Sticker ID required' });
    }
    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver required to send gift' });
    }

    const sticker = await Sticker.findById(stickerId);
    if (!sticker) {
      return res.status(404).json({ error: 'Sticker not found' });
    }

    if (talkSessionId) {
      const talk = await verifyPrivateTalkAccess(talkSessionId, senderId);
      if (!talk) {
        return res.status(403).json({
          error: 'Private chat is not active. Reopen private chat and try again.',
          code: 'TALK_NOT_ACTIVE',
        });
      }
    }

    const transfer = await transferGift(senderId, receiverId, sticker.price);
    const senderDiamonds = transfer.senderDiamonds;
    const receiverBeans = transfer.receiverBeans;
    const beansEarned = transfer.beansEarned;

    const sender = await User.findById(senderId).select('username').lean();

    await GiftHistory.create({
      sender_id: senderId,
      receiver_id: receiverId,
      sticker_id: stickerId,
      diamonds_spent: sticker.price,
      beans_earned: beansEarned,
      session_id: talkSessionId
        ? `talk_${talkSessionId}`
        : (channelName ? `call_${channelName}` : (sessionId || null)),
    });

    try {
      await broadcastStickerGift({
        senderId,
        senderUsername: sender?.username,
        receiverId,
        sticker,
        stickerId,
        sessionId,
        talkSessionId,
        channelName,
      });
    } catch (broadcastErr) {
      console.error('Gift broadcast error (transfer ok):', broadcastErr.message);
    }

    res.json({
      success: true,
      remainingDiamonds: senderDiamonds,
      receiverBeans,
      beansEarned,
      sticker: mapSticker(sticker.toObject()),
    });
  } catch (error) {
    console.error('Send sticker error:', error);
    const msg = error.message || 'Failed to send sticker';
    if (msg.includes('Insufficient diamonds') || msg.includes('Not enough')) {
      return res.status(400).json({ error: 'Not enough diamonds' });
    }
    res.status(500).json({ error: msg });
  }
};