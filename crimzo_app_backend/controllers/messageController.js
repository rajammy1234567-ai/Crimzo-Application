const Message = require('../models/Message');
const User = require('../models/User');
const GiftHistory = require('../models/GiftHistory');
const mongoose = require('mongoose');
const { transferDiamonds } = require('../utils/diamondTransfer');
const { CHAT_GIFT_PRESETS } = require('../config/walletConfig');

// Get conversations list (simplified Mongo version)
exports.getConversations = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Find latest message per conversation partner
    const latest = await Message.aggregate([
      {
        $match: {
          $or: [{ sender_id: userId }, { receiver_id: userId }]
        }
      },
      {
        $sort: { created_at: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender_id', userId] },
              '$receiver_id',
              '$sender_id'
            ]
          },
          last_message: { $first: '$content' },
          last_time: { $first: '$created_at' },
          messageId: { $first: '$_id' }
        }
      },
      { $sort: { last_time: -1 } },
      { $limit: 50 }
    ]);

    const conversations = await Promise.all(
      latest.map(async (conv) => {
        const otherUser = await User.findById(conv._id).select('username avatar is_online').lean();
        const unread = await Message.countDocuments({
          sender_id: conv._id,
          receiver_id: userId,
          is_read: false
        });
        return {
          user_id: conv._id.toString(),
          username: otherUser?.username || 'Unknown',
          avatar: otherUser?.avatar,
          is_online: otherUser?.is_online,
          last_message: conv.last_message,
          last_time: conv.last_time,
          unread_count: unread
        };
      })
    );

    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};

// Get messages with a specific user
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender_id: userId, receiver_id: otherUserId },
        { sender_id: otherUserId, receiver_id: userId }
      ]
    })
      .sort({ created_at: 1 })
      .limit(100)
      .populate('sender_id', 'username avatar')
      .lean();

    // Mark as read
    await Message.updateMany(
      { sender_id: otherUserId, receiver_id: userId, is_read: false },
      { is_read: true }
    );

    const formatted = messages.map(m => ({
      ...m,
      sender_username: m.sender_id?.username,
      sender_avatar: m.sender_id?.avatar,
      message_type: m.message_type || 'text',
      gift_diamonds: m.gift_diamonds || 0,
    }));

    res.json({ success: true, messages: formatted });
  } catch (error) {
    console.error('Get messages error:', error);
    res.json({ success: true, messages: [] });
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ error: 'Receiver and content are required' });
    }

    // Check receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    const msg = await Message.create({
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim()
    });

    const populated = await Message.findById(msg._id)
      .populate('sender_id', 'username avatar')
      .lean();

    const newMsg = {
      ...populated,
      sender_username: populated.sender_id?.username,
      sender_avatar: populated.sender_id?.avatar
    };

    res.json({ success: true, message: newMsg });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

exports.getGiftPresets = (_req, res) => {
  res.json({ success: true, presets: CHAT_GIFT_PRESETS });
};

/** Send diamonds as gift in chat — sender loses, receiver gains */
exports.sendDiamondGift = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, diamonds } = req.body;
    const amount = Math.floor(Number(diamonds));

    if (!receiverId || !Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({ error: 'Receiver and valid diamond amount required' });
    }
    if (!CHAT_GIFT_PRESETS.includes(amount) && amount < 1) {
      return res.status(400).json({ error: 'Invalid gift amount', presets: CHAT_GIFT_PRESETS });
    }

    const transfer = await transferDiamonds(senderId, receiverId, amount);

    const sender = await User.findById(senderId).select('username');
    const content = `🎁 Sent ${amount.toLocaleString()} diamonds`;

    const msg = await Message.create({
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      message_type: 'gift',
      gift_diamonds: amount,
    });

    await GiftHistory.create({
      sender_id: senderId,
      receiver_id: receiverId,
      diamonds_spent: amount,
      beans_earned: 0,
      session_id: `chat_${msg._id}`,
    });

    const populated = await Message.findById(msg._id)
      .populate('sender_id', 'username avatar')
      .lean();

    res.json({
      success: true,
      message: {
        ...populated,
        sender_username: populated.sender_id?.username,
        sender_avatar: populated.sender_id?.avatar,
        message_type: 'gift',
        gift_diamonds: amount,
      },
      senderDiamonds: transfer.senderDiamonds,
      receiverDiamonds: transfer.receiverDiamonds,
      transferred: amount,
    });
  } catch (error) {
    console.error('Send diamond gift error:', error);
    const msg = error.message || 'Gift failed';
    const status = msg.includes('Insufficient') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await Message.countDocuments({
      receiver_id: userId,
      is_read: false
    });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.json({ success: true, count: 0 });
  }
};
