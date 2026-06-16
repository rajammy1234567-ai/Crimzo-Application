const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const Reel = require('../models/Reel');
const Sticker = require('../models/Sticker');
const jwt = require('jsonwebtoken');
const {
  emitStreamEnded,
  emitUserBanned,
  emitDiamondUpdate,
  emitReelDeleted,
  emitStickersUpdated,
  emitLiveStreamsUpdated,
} = require('../utils/socketEmitter');

exports.adminLogin = async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'CrimzoAdmin123!';
  
  if (password === adminPassword) {
    const token = jwt.sign(
      { is_admin: true, identifier: 'superadmin' }, 
      process.env.JWT_SECRET || 'jwt_secret_fallback', 
      { expiresIn: '7d' }
    );
    res.json({ token, message: 'Admin authentication successful' });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
  }
};

// ====================== DASHBOARD ======================
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeStreams = await LiveSession.countDocuments({ status: 'active' });
    const totalReels = await Reel.countDocuments();
    const diamondsAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$diamonds' } } }
    ]);
    const totalDiamonds = diamondsAgg[0]?.total || 0;

    // Chart Data (Last 7 Days User Registration) - Mongo version
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const chartData = await User.aggregate([
      { $match: { created_at: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, _id: 0 } }
    ]);

    res.json({
      stats: {
        totalUsers,
        activeStreams,
        totalReels,
        totalDiamondsInCirculation: totalDiamonds,
      },
      chartData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== USERS ======================
exports.getUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const searchRegex = search ? new RegExp(search, 'i') : null;

    const filter = searchRegex ? {
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { crimzo_id: searchRegex }
      ]
    } : {};

    const users = await User.find(filter)
      .select('id crimzo_id username email country diamonds beans status is_banned created_at')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments(filter);

    res.json({
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.toggleBanUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_banned } = req.body;

    const updates = { is_banned };
    if (is_banned) updates.status = 'online';

    await User.findByIdAndUpdate(userId, updates);

    if (is_banned) {
      const activeSessions = await LiveSession.find({ user_id: userId, status: 'active' }).select('_id');

      await LiveSession.updateMany(
        { user_id: userId, status: 'active' },
        { status: 'ended', ended_at: new Date() }
      );

      activeSessions.forEach((session) => {
        emitStreamEnded(
          session._id,
          'This stream was ended because the host account was suspended.',
          'admin_ban'
        );
      });

      if (activeSessions.length > 0) {
        emitLiveStreamsUpdated();
      }

      emitUserBanned(userId);
    }

    res.json({ success: true, is_banned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateDiamonds = async (req, res) => {
  try {
    const userId = req.params.id;
    const { amount, action } = req.body; // action: 'add' or 'deduct'
    const value = Number(amount);

    if (isNaN(value)) return res.status(400).json({ error: 'Invalid amount' });

    let update = {};
    if (action === 'add') {
      update = { $inc: { diamonds: value } };
    } else if (action === 'deduct') {
      update = { $inc: { diamonds: -value } };
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, select: 'diamonds' }
    );

    // Ensure diamonds >= 0 for deduct
    if (user && user.diamonds < 0) {
      user.diamonds = 0;
      await user.save();
    }

    if (user) {
      emitDiamondUpdate(userId, user.diamonds);
    }

    res.json({ success: true, diamonds: user ? user.diamonds : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== STREAMS ======================
exports.getStreams = async (req, res) => {
  try {
    const { status = 'active' } = req.query; // active or ended
    
    const streams = await LiveSession.find({ status })
      .sort({ started_at: -1 })
      .limit(50)
      .populate('user_id', 'username crimzo_id avatar')
      .lean();

    // flatten for frontend compatibility
    const formatted = streams.map(s => ({
      ...s,
      username: s.user_id?.username,
      crimzo_id: s.user_id?.crimzo_id,
      avatar: s.user_id?.avatar,
      user_id: s.user_id?._id || s.user_id
    }));

    res.json({ streams: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.terminateStream = async (req, res) => {
  try {
    const streamId = req.params.id;
    
    // Terminate stream
    const session = await LiveSession.findByIdAndUpdate(
      streamId,
      { status: 'ended', ended_at: new Date() },
      { new: true }
    );
    
    // Update host status
    if (session && session.user_id) {
      await User.findByIdAndUpdate(session.user_id, { status: 'online' });
    }

    emitStreamEnded(
      streamId,
      'This stream was ended by a moderator.',
      'admin'
    );
    emitLiveStreamsUpdated();

    res.json({ success: true, message: 'Stream force terminated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== REELS ======================
exports.getReels = async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = 30;
    const skip = (Number(page) - 1) * limit;

    const reels = await Reel.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user_id', 'username crimzo_id avatar')
      .lean();

    const formatted = reels.map(r => ({
      ...r,
      username: r.user_id?.username,
      crimzo_id: r.user_id?.crimzo_id,
      user_id: r.user_id // Keep the full user object so avatar is accessible
    }));

    res.json({ reels: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteReel = async (req, res) => {
  try {
    const reelId = req.params.id;
    await Reel.findByIdAndDelete(reelId);
    // also clean likes/comments if needed
    const ReelLike = require('../models/ReelLike');
    const ReelComment = require('../models/ReelComment');
    await ReelLike.deleteMany({ reel_id: reelId });
    await ReelComment.deleteMany({ reel_id: reelId });

    emitReelDeleted(reelId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ====================== STICKERS ======================
exports.getStickers = async (req, res) => {
  try {
    const stickers = await Sticker.find().sort({ price: 1 }).lean();
    res.json({ stickers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSticker = async (req, res) => {
  try {
    const { name, emoji, icon_name, icon_color, bg_color, category, price, is_animated } = req.body;
    await Sticker.create({ name, emoji, icon_name, icon_color, bg_color, category, price, is_animated });
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSticker = async (req, res) => {
  try {
    const stickerId = req.params.id;
    const updates = req.body;
    await Sticker.findByIdAndUpdate(stickerId, updates);
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSticker = async (req, res) => {
  try {
    const stickerId = req.params.id;
    await Sticker.findByIdAndDelete(stickerId);
    emitStickersUpdated();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
