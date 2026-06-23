const User = require('../models/User');
const Follow = require('../models/Follow');
const FollowRequest = require('../models/FollowRequest');
const BlockedUser = require('../models/BlockedUser');
const LiveSession = require('../models/LiveSession');
const Reel = require('../models/Reel');
const GiftHistory = require('../models/GiftHistory');
const { pushNotification } = require('../utils/notificationHelper');
const { emitFollowUpdated, emitFollowStatusChanged } = require('../utils/socketEmitter');
const {
  getInteractionPermission,
  canViewProfileContent,
  canViewPrivateProfileDetails,
} = require('../utils/followPermissions');
const {
  toObjectId,
  syncUserFollowCounts,
  upsertPendingFollowRequest,
  clearFollowRequestBetween,
} = require('../utils/followHelpers');
const { uploadToCloudinary } = require('../config/cloudinary');
const { getBillingSettings } = require('../utils/billingSettings');
const { buildRatesPayload, parseRateUpdate } = require('../utils/userRates');

function resolveUserIdParam(param, fallbackId) {
  if (!param || param === 'me') return String(fallbackId);
  return String(param);
}

function formatUserRef(u) {
  if (!u) return null;
  return {
    id: u._id?.toString() || u.id,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    is_online: !!u.is_online,
  };
}

async function isMutualFollow(userA, userB) {
  const [ab, ba] = await Promise.all([
    Follow.exists({ follower_id: userA, following_id: userB }),
    Follow.exists({ follower_id: userB, following_id: userA }),
  ]);
  return !!(ab && ba);
}

async function adjustMutualFriends(userA, userB, delta) {
  if (!delta) return;
  const mutual = await isMutualFollow(userA, userB);
  if (mutual) {
    await User.updateMany(
      { _id: { $in: [userA, userB] } },
      { $inc: { friends_count: delta } },
    );
  }
}

async function countMutualFriends(userId) {
  const mongoose = require('mongoose');
  const oid = new mongoose.Types.ObjectId(userId);
  const agg = await Follow.aggregate([
    { $match: { follower_id: oid } },
    {
      $lookup: {
        from: 'follows',
        let: { target: '$following_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$follower_id', '$$target'] },
                  { $eq: ['$following_id', oid] },
                ],
              },
            },
          },
        ],
        as: 'reverse',
      },
    },
    { $match: { 'reverse.0': { $exists: true } } },
    { $count: 'total' },
  ]);
  return agg[0]?.total || 0;
}

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

exports.checkInteraction = async (req, res) => {
  try {
    const userId = req.query.userId || req.params.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const [interaction, followState] = await Promise.all([
      getInteractionPermission(req.user.id, userId),
      followStatusFor(req.user.id, userId),
    ]);
    res.json({
      success: true,
      ...interaction,
      isRequested: followState.isRequested,
      hasIncomingRequest: followState.hasIncomingRequest,
      incomingRequestId: followState.incomingRequestId,
    });
  } catch (error) {
    console.error('Interaction check error:', error);
    res.status(500).json({ error: 'Failed to check interaction' });
  }
};

// Get full profile
exports.getFullProfile = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    if (!toObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const u = await User.findById(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const totalStreams = await LiveSession.countDocuments({ user_id: userId });
    const reelAgg = await Reel.aggregate([
      { $match: { user_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, totalViews: { $sum: '$views_count' }, totalLikes: { $sum: '$likes_count' } } }
    ]);
    const reelViews = reelAgg[0]?.totalViews || 0;
    const reelLikes = reelAgg[0]?.totalLikes || 0;
    const postsCount = await Reel.countDocuments({ user_id: userId });

    const sentAgg = await GiftHistory.aggregate([
      { $match: { sender_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$diamonds_spent' } } }
    ]).catch(() => []);
    const receivedAgg = await GiftHistory.aggregate([
      { $match: { receiver_id: new (require('mongoose')).Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$beans_earned' } } }
    ]).catch(() => []);

    let followState = { isFollowing: false, isRequested: false, hasIncomingRequest: false, incomingRequestId: null };
    let interaction = {
      canInteract: false,
      followsYou: false,
      isMutualFriend: false,
      interactionBlockedReason: null,
    };
    if (String(req.user.id) !== String(userId)) {
      followState = await followStatusFor(req.user.id, userId);
      interaction = await getInteractionPermission(req.user.id, userId);
    }

    const liveCheck = await LiveSession.findOne({ user_id: userId, status: 'active' });
    const counts = await syncUserFollowCounts(userId);
    const billingSettings = await getBillingSettings();
    const userRates = buildRatesPayload(u, billingSettings);
    const canViewContent = canViewProfileContent(req.user.id, userId, {
      isPrivate: !!u.is_private,
      isFollowing: followState.isFollowing,
      isMutualFriend: interaction.isMutualFriend,
    });

    res.json({
      success: true,
      profile: {
        id: u.id, crimzo_id: u.crimzo_id, username: u.username, email: u.email,
        avatar: u.avatar, bio: u.bio, country: u.country,
        gender: u.gender || '',
        age: u.age || '',
        language: u.language || 'English',
        second_language: u.second_language || '',
        tags: u.tags || '',
        show_location: !!u.show_location,
        push_notifications_enabled: u.push_notifications_enabled !== false,
        is_private: !!u.is_private,
        diamonds: u.diamonds, beans: u.beans,
        wallet_balance: u.wallet_balance || 0,
        followers_count: counts?.followers_count ?? u.followers_count,
        following_count: counts?.following_count ?? u.following_count,
        friends_count: counts?.friends_count ?? u.friends_count,
        is_online: u.is_online, status: u.status,
        created_at: u.created_at,
        totalStreams,
        totalViews: reelViews,
        totalLikes: reelLikes,
        posts_count: postsCount,
        totalDiamondsSpent: sentAgg[0]?.total || 0,
        totalBeansEarned: receivedAgg[0]?.total || 0,
        isFollowing: followState.isFollowing,
        isRequested: followState.isRequested,
        hasIncomingRequest: followState.hasIncomingRequest,
        incomingRequestId: followState.incomingRequestId,
        followsYou: interaction.followsYou,
        isMutualFriend: interaction.isMutualFriend,
        canInteract: interaction.canInteract,
        canViewContent,
        interactionBlockedReason: interaction.reason,
        isLive: !!liveCheck,
        liveSessionId: liveCheck ? liveCheck.id : null,
        voice_rate_per_min_inr: userRates.voice_rate_per_min_inr,
        chat_rate_per_min_inr: userRates.chat_rate_per_min_inr,
        voiceRatePerMin: userRates.voiceRatePerMin,
        chatRatePerMin: userRates.chatRatePerMin,
        voiceBeansPerMin: userRates.voiceBeansPerMin,
        chatBeansPerMin: userRates.chatBeansPerMin,
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
      const wasMutual = await isMutualFollow(followerId, userId);
      await Follow.deleteOne({ _id: existingFollow._id });
      await clearFollowRequestBetween(followerId, userId);
      const [viewerCounts, targetCounts] = await Promise.all([
        syncUserFollowCounts(followerId),
        syncUserFollowCounts(userId),
      ]);
      emitFollowUpdated(followerId, viewerCounts);
      emitFollowUpdated(userId, targetCounts);
      emitFollowStatusChanged(followerId, {
        userId: String(userId),
        isFollowing: false,
        isRequested: false,
      });

      return res.json({
        success: true,
        action: 'unfollowed',
        isFollowing: false,
        isRequested: false,
        wasMutual,
        followers_count: targetCounts?.followers_count,
        following_count: viewerCounts?.following_count,
        friends_count: viewerCounts?.friends_count,
      });
    }

    const pending = await FollowRequest.findOne({
      requester_id: followerId,
      target_id: userId,
      status: 'pending',
    });
    if (pending) {
      await FollowRequest.deleteOne({ _id: pending._id });
      emitFollowStatusChanged(followerId, {
        userId: String(userId),
        isFollowing: false,
        isRequested: false,
      });
      return res.json({
        success: true,
        action: 'request_cancelled',
        isFollowing: false,
        isRequested: false,
      });
    }

    const target = await User.findById(userId).select('username is_private');
    if (!target) return res.status(404).json({ error: 'User not found' });

    const requester = await User.findById(followerId).select('username avatar').lean();

    // Public account — instant follow (Instagram public profile)
    if (!target.is_private) {
      await Follow.create({ follower_id: followerId, following_id: userId });
      await clearFollowRequestBetween(followerId, userId);
      await adjustMutualFriends(followerId, userId, 1);
      const [viewerCounts, targetCounts] = await Promise.all([
        syncUserFollowCounts(followerId),
        syncUserFollowCounts(userId),
      ]);

      await pushNotification({
        userId,
        type: 'follow_accepted',
        title: 'New follower',
        body: `${requester?.username || 'Someone'} started following you`,
        actor: requester,
        referenceId: followerId,
      });

      emitFollowUpdated(followerId, viewerCounts);
      emitFollowUpdated(userId, targetCounts);
      emitFollowStatusChanged(followerId, {
        userId: String(userId),
        isFollowing: true,
        isRequested: false,
      });

      return res.json({
        success: true,
        action: 'followed',
        isFollowing: true,
        isRequested: false,
        followers_count: targetCounts?.followers_count,
        following_count: viewerCounts?.following_count,
        friends_count: viewerCounts?.friends_count,
      });
    }

    // Private account — follow request
    const reqDoc = await upsertPendingFollowRequest(followerId, userId);

    await pushNotification({
      userId,
      type: 'follow_request',
      title: 'New follow request',
      body: `${requester?.username || 'Someone'} wants to follow you`,
      actor: requester,
      referenceId: reqDoc.id,
    });

    emitFollowStatusChanged(followerId, {
      userId: String(userId),
      isFollowing: false,
      isRequested: true,
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
      await adjustMutualFriends(request.requester_id, userId, 1);
    }

    request.status = 'accepted';
    await request.save();

    const [requesterCounts, myCounts] = await Promise.all([
      syncUserFollowCounts(request.requester_id),
      syncUserFollowCounts(userId),
    ]);

    const me = await User.findById(userId).select('username avatar').lean();
    await pushNotification({
      userId: request.requester_id,
      type: 'follow_accepted',
      title: 'Follow request accepted',
      body: `${me?.username || 'User'} accepted your follow request`,
      actor: me,
      referenceId: userId,
    });

    emitFollowUpdated(request.requester_id, requesterCounts);
    emitFollowUpdated(userId, myCounts);
    emitFollowStatusChanged(request.requester_id, {
      userId: String(userId),
      isFollowing: true,
      isRequested: false,
    });

    res.json({
      success: true,
      action: 'accepted',
      isFollowing: true,
      isRequested: false,
      requesterId: request.requester_id.toString(),
      followers_count: myCounts?.followers_count,
      following_count: requesterCounts?.following_count,
      friends_count: myCounts?.friends_count,
    });
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

    emitFollowStatusChanged(request.requester_id, {
      userId: String(userId),
      isFollowing: false,
      isRequested: false,
    });

    res.json({
      success: true,
      action: 'rejected',
      isFollowing: false,
      isRequested: false,
    });
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
    const [viewerCounts, targetCounts] = await Promise.all([
      syncUserFollowCounts(blockerId),
      syncUserFollowCounts(userId),
    ]);
    emitFollowUpdated(blockerId, viewerCounts);
    emitFollowUpdated(userId, targetCounts);
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
    const {
      username, bio, country, avatar, gender, age, language,
      second_language, tags, show_location, push_notifications_enabled,
      voice_rate_per_min_inr, chat_rate_per_min_inr, is_private,
    } = req.body;
    const userId = req.user.id;

    const update = {};
    if (username) update.username = username;
    if (bio !== undefined) update.bio = bio;
    if (country) update.country = country;
    if (avatar) update.avatar = avatar;
    if (gender !== undefined) update.gender = gender;
    if (age !== undefined) update.age = String(age);
    if (language !== undefined) update.language = language;
    if (second_language !== undefined) update.second_language = second_language;
    if (tags !== undefined) update.tags = tags;
    if (show_location !== undefined) update.show_location = !!show_location;
    if (push_notifications_enabled !== undefined) {
      update.push_notifications_enabled = !!push_notifications_enabled;
    }
    if (is_private !== undefined) {
      update.is_private = !!is_private;
    }
    if (voice_rate_per_min_inr !== undefined) {
      const parsed = parseRateUpdate(voice_rate_per_min_inr);
      if (parsed == null) {
        return res.status(400).json({ error: 'Invalid voice rate per minute' });
      }
      update.voice_rate_per_min_inr = parsed;
    }
    if (chat_rate_per_min_inr !== undefined) {
      const parsed = parseRateUpdate(chat_rate_per_min_inr);
      if (parsed == null) {
        return res.status(400).json({ error: 'Invalid chat rate per minute' });
      }
      update.chat_rate_per_min_inr = parsed;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updated = await User.findByIdAndUpdate(userId, update, { new: true });
    const billingSettings = await getBillingSettings();
    const rates = buildRatesPayload(updated, billingSettings);
    res.json({
      success: true,
      message: 'Profile updated',
      profile: {
        username: updated.username,
        bio: updated.bio,
        country: updated.country,
        avatar: updated.avatar,
        gender: updated.gender,
        age: updated.age,
        language: updated.language,
        second_language: updated.second_language,
        tags: updated.tags,
        show_location: updated.show_location,
        push_notifications_enabled: updated.push_notifications_enabled !== false,
        is_private: !!updated.is_private,
        voice_rate_per_min_inr: rates.voice_rate_per_min_inr,
        chat_rate_per_min_inr: rates.chat_rate_per_min_inr,
        voiceRatePerMin: rates.voiceRatePerMin,
        chatRatePerMin: rates.chatRatePerMin,
        voiceBeansPerMin: rates.voiceBeansPerMin,
        chatBeansPerMin: rates.chatBeansPerMin,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Image file required' });
    }
    const uploadResult = await uploadToCloudinary(file.buffer, 'avatars', 'image');
    const avatarUrl = uploadResult.secure_url;
    await User.findByIdAndUpdate(req.user.id, { avatar: avatarUrl });
    res.json({ success: true, avatar: avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
};

// Get online users count (active socket connections — real-time app presence)
exports.getOnlineCount = async (req, res) => {
  try {
    const { getActiveCount } = require('../utils/presenceTracker');
    const count = getActiveCount();
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

async function formatFollowListUser(currentUserId, profileUserId, u) {
  if (!u) return null;
  const targetId = u._id?.toString() || u.id;
  const status = await followStatusFor(currentUserId, targetId);
  const followsYou = await Follow.exists({
    follower_id: targetId,
    following_id: profileUserId,
  });
  return {
    ...formatUserRef(u),
    is_following: status.isFollowing,
    is_requested: status.isRequested,
    follows_you: !!followsYou,
  };
}

async function canViewerSeePrivateProfileDetails(viewerId, profileUserId) {
  if (String(viewerId) === String(profileUserId)) return true;
  const target = await User.findById(profileUserId).select('is_private').lean();
  if (!target) return false;
  if (!target.is_private) return true;
  const perm = await getInteractionPermission(viewerId, profileUserId);
  return canViewPrivateProfileDetails(viewerId, profileUserId, {
    isPrivate: true,
    isFollowing: perm.isFollowing,
    isMutualFriend: perm.isMutualFriend,
  });
}

// Get followers list
exports.getFollowers = async (req, res) => {
  try {
    const userId = resolveUserIdParam(req.params.userId, req.user.id);
    const currentUserId = req.user.id;
    const oid = toObjectId(userId);
    if (!oid) return res.json({ success: true, followers: [] });

    const allowed = await canViewerSeePrivateProfileDetails(currentUserId, userId);
    if (!allowed) {
      return res.json({ success: true, followers: [], isPrivate: true, canViewList: false });
    }

    const follows = await Follow.find({ following_id: oid })
      .sort({ created_at: -1 })
      .populate('follower_id', 'username avatar bio is_online');

    const formatted = await Promise.all(
      follows.map((f) => formatFollowListUser(currentUserId, userId, f.follower_id)),
    );

    res.json({ success: true, followers: formatted.filter(Boolean) });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to get followers' });
  }
};

// Get following list
exports.getFollowing = async (req, res) => {
  try {
    const userId = resolveUserIdParam(req.params.userId, req.user.id);
    const currentUserId = req.user.id;
    const oid = toObjectId(userId);
    if (!oid) return res.json({ success: true, following: [] });

    const allowed = await canViewerSeePrivateProfileDetails(currentUserId, userId);
    if (!allowed) {
      return res.json({ success: true, following: [], isPrivate: true, canViewList: false });
    }

    const follows = await Follow.find({ follower_id: oid })
      .sort({ created_at: -1 })
      .populate('following_id', 'username avatar bio is_online');

    const formatted = await Promise.all(
      follows.map((f) => formatFollowListUser(currentUserId, userId, f.following_id)),
    );

    res.json({ success: true, following: formatted.filter(Boolean) });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to get following' });
  }
};

// Mutual follows (friends) — both users follow each other
exports.getFriends = async (req, res) => {
  try {
    const userId = resolveUserIdParam(req.params.userId, req.user.id);
    const currentUserId = req.user.id;
    const oid = toObjectId(userId);
    if (!oid) return res.json({ success: true, friends: [] });

    const allowed = await canViewerSeePrivateProfileDetails(currentUserId, userId);
    if (!allowed) {
      return res.json({ success: true, friends: [], isPrivate: true, canViewList: false });
    }

    const following = await Follow.find({ follower_id: oid }).select('following_id').lean();
    const followingIds = following.map((f) => f.following_id).filter(Boolean);
    if (!followingIds.length) {
      return res.json({ success: true, friends: [] });
    }

    const mutual = await Follow.find({
      follower_id: { $in: followingIds },
      following_id: oid,
    })
      .sort({ created_at: -1 })
      .populate('follower_id', 'username avatar bio is_online');

    const friends = await Promise.all(
      mutual.map((row) => formatFollowListUser(currentUserId, userId, row.follower_id)),
    );

    res.json({
      success: true,
      friends: friends.filter(Boolean).map((u) => ({
        ...u,
        is_following: true,
        follows_you: true,
      })),
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
};

exports.getAppTimeToday = async (req, res) => {
  try {
    const { getTodayAppTime } = require('../utils/appTimeService');
    const stats = await getTodayAppTime(req.user.id);
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('Get app time error:', error);
    res.status(500).json({ error: 'Failed to get app time' });
  }
};
