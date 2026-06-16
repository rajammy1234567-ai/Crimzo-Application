const User = require('../models/User');
const Follow = require('../models/Follow');
const LiveSession = require('../models/LiveSession');
const Reel = require('../models/Reel');
const GiftHistory = require('../models/GiftHistory');

// Get full profile
exports.getFullProfile = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    const u = await User.findById(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const totalStreams = await LiveSession.countDocuments({ user_id: userId });
    const liveAgg = await LiveSession.aggregate([
      { $match: { user_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, totalViews: { $sum: '$viewers_count' } } }
    ]);
    const streamViews = liveAgg[0]?.totalViews || 0;

    const reelAgg = await Reel.aggregate([
      { $match: { user_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, totalViews: { $sum: '$views_count' }, totalLikes: { $sum: '$likes_count' } } }
    ]);
    const reelViews = reelAgg[0]?.totalViews || 0;
    const reelLikes = reelAgg[0]?.totalLikes || 0;

    const sentAgg = await GiftHistory.aggregate([
      { $match: { sender_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$diamonds_spent' } } }
    ]).catch(() => []);
    const receivedAgg = await GiftHistory.aggregate([
      { $match: { receiver_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$beans_earned' } } }
    ]).catch(() => []);

    let isFollowing = false;
    if (String(req.user.id) !== String(userId)) {
      const followCheck = await Follow.findOne({ follower_id: req.user.id, following_id: userId });
      isFollowing = !!followCheck;
    }

    const liveCheck = await LiveSession.findOne({ user_id: userId, status: 'active' });

    res.json({
      success: true,
      profile: {
        id: u.id, crimzo_id: u.crimzo_id, username: u.username, email: u.email,
        avatar: u.avatar, bio: u.bio, country: u.country,
        diamonds: u.diamonds, beans: u.beans,
        wallet_balance: u.wallet_balance || 0,
        followers_count: u.followers_count,
        following_count: u.following_count,
        friends_count: u.friends_count,
        is_online: u.is_online, status: u.status,
        created_at: u.created_at,
        totalStreams,
        totalViews: streamViews + reelViews,
        totalLikes: reelLikes,
        totalDiamondsSpent: sentAgg[0]?.total || 0,
        totalBeansEarned: receivedAgg[0]?.total || 0,
        isFollowing,
        isLive: !!liveCheck,
        liveSessionId: liveCheck ? liveCheck.id : null
      }
    });
  } catch (error) {
    console.error('Get full profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Follow/Unfollow
exports.followUser = async (req, res) => {
  try {
    const followerId = req.user.id;
    const { userId } = req.body;
    if (!userId || String(followerId) === String(userId)) {
      return res.status(400).json({ error: 'Invalid user' });
    }

    const existing = await Follow.findOne({ follower_id: followerId, following_id: userId });

    if (existing) {
      await Follow.deleteOne({ _id: existing._id });
      await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
      await User.findByIdAndUpdate(userId, { $inc: { followers_count: -1 } });
      res.json({ success: true, action: 'unfollowed' });
    } else {
      await Follow.create({ follower_id: followerId, following_id: userId });
      await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(userId, { $inc: { followers_count: 1 } });
      res.json({ success: true, action: 'followed' });
    }
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow/unfollow' });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { username, bio, country, avatar } = req.body;
    const userId = req.user.id;

    const update = {};
    if (username) update.username = username;
    if (bio !== undefined) update.bio = bio;
    if (country) update.country = country;
    if (avatar) update.avatar = avatar;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await User.findByIdAndUpdate(userId, update);
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Get online users count
exports.getOnlineCount = async (req, res) => {
  try {
    const count = await User.countDocuments({ is_online: true });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Get online count error:', error);
    res.status(500).json({ error: 'Failed to get online count' });
  }
};

// Search users by username or Crimzo ID (Instagram-style)
exports.searchUsers = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const currentUserId = req.user.id;

    if (!q) {
      return res.json({ success: true, users: [] });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mongoose = require('mongoose');
    const currentOid = new mongoose.Types.ObjectId(currentUserId);

    const users = await User.find({
      _id: { $ne: currentOid },
      is_banned: { $ne: true },
      $or: [
        { username: { $regex: escaped, $options: 'i' } },
        { crimzo_id: { $regex: escaped, $options: 'i' } },
      ],
    })
      .select('username avatar bio followers_count crimzo_id is_online')
      .sort({ followers_count: -1, username: 1 })
      .limit(30)
      .lean();

    const formatted = await Promise.all(users.map(async (u) => {
      const isFollowing = !!(await Follow.findOne({
        follower_id: currentUserId,
        following_id: u._id,
      }));
      return {
        id: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        bio: u.bio || '',
        crimzo_id: u.crimzo_id,
        followers_count: u.followers_count || 0,
        is_online: !!u.is_online,
        is_following: isFollowing,
      };
    }));

    res.json({ success: true, users: formatted });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};

// Get followers list
exports.getFollowers = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const currentUserId = req.user.id;

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.json({ success: true, followers: [] });
    }

    const follows = await Follow.find({ following_id: userId })
      .sort({ created_at: -1 })
      .populate('follower_id', 'id username avatar bio is_online');

    const formatted = await Promise.all(follows.map(async (f) => {
      const follower = f.follower_id;
      if (!follower) return null;
      const isFollowingBack = !!(await Follow.findOne({ follower_id: currentUserId, following_id: follower._id }));
      return {
        id: follower.id,
        username: follower.username,
        avatar: follower.avatar,
        bio: follower.bio,
        is_online: follower.is_online,
        is_following: isFollowingBack
      };
    }));

    res.json({ success: true, followers: formatted.filter(Boolean) });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to get followers' });
  }
};

// Get following list
exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.json({ success: true, following: [] });
    }

    const follows = await Follow.find({ follower_id: userId })
      .sort({ created_at: -1 })
      .populate('following_id', 'id username avatar bio is_online');

    const formatted = follows.map(f => {
      const u = f.following_id;
      if (!u) return null;
      return {
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio,
        is_online: u.is_online,
        is_following: true
      };
    }).filter(Boolean);

    res.json({ success: true, following: formatted });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to get following' });
  }
};
