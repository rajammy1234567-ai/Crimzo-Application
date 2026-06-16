const User = require('../models/User');
const Follow = require('../models/Follow');
const FollowRequest = require('../models/FollowRequest');
const BlockedUser = require('../models/BlockedUser');
const LiveSession = require('../models/LiveSession');
const Reel = require('../models/Reel');
const GiftHistory = require('../models/GiftHistory');
const { pushNotification } = require('../utils/notificationHelper');

async function followStatusFor(viewerId, targetId) {
  const [following, outgoing, incoming] = await Promise.all([
    Follow.findOne({ follower_id: viewerId, following_id: targetId }),
    FollowRequest.findOne({ requester_id: viewerId, target_id: targetId, status: 'pending' }),
    FollowRequest.findOne({ requester_id: targetId, target_id: viewerId, status: 'pending' }),
  ]);
  return {
    isFollowing: !!following,
    isRequested: !!outgoing,
    hasIncomingRequest: !!incoming,
    incomingRequestId: incoming?._id?.toString() || null,
    outgoingRequestId: outgoing?._id?.toString() || null,
  };
}

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

    let followState = { isFollowing: false, isRequested: false, hasIncomingRequest: false, incomingRequestId: null };
    if (String(req.user.id) !== String(userId)) {
      followState = await followStatusFor(req.user.id, userId);
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
        isFollowing: followState.isFollowing,
        isRequested: followState.isRequested,
        hasIncomingRequest: followState.hasIncomingRequest,
        incomingRequestId: followState.incomingRequestId,
        isLive: !!liveCheck,
        liveSessionId: liveCheck ? liveCheck.id : null
      }
    });
  } catch (error) {
    console.error('Get full profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

/** Instagram-style: follow sends request → target accepts/rejects */
exports.followUser = async (req, res) => {
  try {
    const followerId = req.user.id;
    const { userId } = req.body;
    if (!userId || String(followerId) === String(userId)) {
      return res.status(400).json({ error: 'Invalid user' });
    }

    const blocked = await BlockedUser.findOne({
      $or: [
        { blocker_id: followerId, blocked_id: userId },
        { blocker_id: userId, blocked_id: followerId },
      ],
    });
    if (blocked) {
      return res.status(403).json({ error: 'Cannot follow this user' });
    }

    const existingFollow = await Follow.findOne({ follower_id: followerId, following_id: userId });
    if (existingFollow) {
      await Follow.deleteOne({ _id: existingFollow._id });
      await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
      await User.findByIdAndUpdate(userId, { $inc: { followers_count: -1 } });
      return res.json({ success: true, action: 'unfollowed', isFollowing: false, isRequested: false });
    }

    const pending = await FollowRequest.findOne({
      requester_id: followerId,
      target_id: userId,
      status: 'pending',
    });
    if (pending) {
      await FollowRequest.deleteOne({ _id: pending._id });
      return res.json({ success: true, action: 'request_cancelled', isFollowing: false, isRequested: false });
    }

    const requester = await User.findById(followerId).select('username avatar').lean();
    const reqDoc = await FollowRequest.create({
      requester_id: followerId,
      target_id: userId,
      status: 'pending',
    });

    await pushNotification({
      userId,
      type: 'follow_request',
      title: 'New follow request',
      body: `${requester?.username || 'Someone'} wants to follow you`,
      actor: requester,
      referenceId: reqDoc.id,
    });

    res.json({
      success: true,
      action: 'requested',
      isFollowing: false,
      isRequested: true,
      requestId: reqDoc.id,
    });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow/unfollow' });
  }
};

exports.acceptFollowRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId, requesterId } = req.body;

    const query = requestId
      ? { _id: requestId, target_id: userId, status: 'pending' }
      : { requester_id: requesterId, target_id: userId, status: 'pending' };

    const request = await FollowRequest.findOne(query);
    if (!request) return res.status(404).json({ error: 'Follow request not found' });

    const already = await Follow.findOne({
      follower_id: request.requester_id,
      following_id: userId,
    });
    if (!already) {
      await Follow.create({ follower_id: request.requester_id, following_id: userId });
      await User.findByIdAndUpdate(request.requester_id, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(userId, { $inc: { followers_count: 1 } });
    }

    request.status = 'accepted';
    await request.save();

    const me = await User.findById(userId).select('username avatar').lean();
    await pushNotification({
      userId: request.requester_id,
      type: 'follow_accepted',
      title: 'Follow request accepted',
      body: `${me?.username || 'User'} accepted your follow request`,
      actor: me,
      referenceId: userId,
    });

    res.json({ success: true, action: 'accepted' });
  } catch (error) {
    console.error('Accept follow error:', error);
    res.status(500).json({ error: 'Failed to accept request' });
  }
};

exports.rejectFollowRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId, requesterId } = req.body;

    const query = requestId
      ? { _id: requestId, target_id: userId, status: 'pending' }
      : { requester_id: requesterId, target_id: userId, status: 'pending' };

    const request = await FollowRequest.findOne(query);
    if (!request) return res.status(404).json({ error: 'Follow request not found' });

    request.status = 'rejected';
    await request.save();

    res.json({ success: true, action: 'rejected' });
  } catch (error) {
    console.error('Reject follow error:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
};

exports.getFollowRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await FollowRequest.find({ target_id: userId, status: 'pending' })
      .sort({ created_at: -1 })
      .populate('requester_id', 'id username avatar bio')
      .lean();

    res.json({
      success: true,
      requests: requests.map((r) => ({
        id: r._id.toString(),
        requester: r.requester_id ? {
          id: r.requester_id._id?.toString() || r.requester_id.id,
          username: r.requester_id.username,
          avatar: r.requester_id.avatar,
          bio: r.requester_id.bio,
        } : null,
        created_at: r.created_at,
      })).filter((r) => r.requester),
    });
  } catch (error) {
    console.error('Get follow requests error:', error);
    res.status(500).json({ error: 'Failed to get follow requests' });
  }
};

exports.getBlockedUsers = async (req, res) => {
  try {
    const rows = await BlockedUser.find({ blocker_id: req.user.id })
      .populate('blocked_id', 'id username avatar')
      .sort({ created_at: -1 })
      .lean();
    res.json({
      success: true,
      blocked: rows.map((r) => ({
        id: r.blocked_id?._id?.toString(),
        username: r.blocked_id?.username,
        avatar: r.blocked_id?.avatar,
      })).filter((b) => b.id),
    });
  } catch (error) {
    console.error('Get blocked error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { userId } = req.body;
    if (!userId || String(blockerId) === String(userId)) {
      return res.status(400).json({ error: 'Invalid user' });
    }
    await BlockedUser.findOneAndUpdate(
      { blocker_id: blockerId, blocked_id: userId },
      { blocker_id: blockerId, blocked_id: userId, created_at: new Date() },
      { upsert: true },
    );
    await Follow.deleteMany({
      $or: [
        { follower_id: blockerId, following_id: userId },
        { follower_id: userId, following_id: blockerId },
      ],
    });
    await FollowRequest.deleteMany({
      $or: [
        { requester_id: blockerId, target_id: userId },
        { requester_id: userId, target_id: blockerId },
      ],
    });
    res.json({ success: true, message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    await BlockedUser.deleteOne({ blocker_id: req.user.id, blocked_id: req.body.userId });
    res.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    console.error('Unblock error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
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
      const status = await followStatusFor(currentUserId, u._id);
      return {
        id: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        bio: u.bio || '',
        crimzo_id: u.crimzo_id,
        followers_count: u.followers_count || 0,
        is_online: !!u.is_online,
        is_following: status.isFollowing,
        is_requested: status.isRequested,
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
