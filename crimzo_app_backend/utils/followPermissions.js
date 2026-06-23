const Follow = require('../models/Follow');
const BlockedUser = require('../models/BlockedUser');

/** Viewer follows target (follow request was accepted) */
async function isFollowingUser(viewerId, targetId) {
  if (!viewerId || !targetId || String(viewerId) === String(targetId)) return false;
  const row = await Follow.findOne({
    follower_id: viewerId,
    following_id: targetId,
  }).select('_id');
  return !!row;
}

/** Target follows viewer */
async function isFollowedByUser(viewerId, targetId) {
  return isFollowingUser(targetId, viewerId);
}

async function isMutualFollow(viewerId, targetId) {
  const [a, b] = await Promise.all([
    isFollowingUser(viewerId, targetId),
    isFollowedByUser(viewerId, targetId),
  ]);
  return a && b;
}

/**
 * Instagram-style: call / DM only after the other user accepts your follow request.
 */
async function getInteractionPermission(viewerId, targetId) {
  if (!viewerId || !targetId) {
    return {
      canInteract: false,
      isFollowing: false,
      followsYou: false,
      isMutualFriend: false,
      reason: 'Invalid user',
    };
  }
  if (String(viewerId) === String(targetId)) {
    return {
      canInteract: false,
      isFollowing: false,
      followsYou: false,
      isMutualFriend: false,
      reason: 'Cannot message yourself',
    };
  }

  const blocked = await BlockedUser.findOne({
    $or: [
      { blocker_id: viewerId, blocked_id: targetId },
      { blocker_id: targetId, blocked_id: viewerId },
    ],
  }).select('_id').lean();

  if (blocked) {
    return {
      canInteract: false,
      isFollowing: false,
      followsYou: false,
      isMutualFriend: false,
      reason: 'You cannot interact with this user.',
      isBlocked: true,
    };
  }

  const [isFollowing, followsYou] = await Promise.all([
    isFollowingUser(viewerId, targetId),
    isFollowedByUser(viewerId, targetId),
  ]);
  const isMutualFriend = isFollowing && followsYou;

  let canInteract = isFollowing;
  let reason = null;
  if (!isFollowing) {
    reason = 'Follow this user and wait until they accept your follow request.';
  }

  return {
    canInteract,
    isFollowing,
    followsYou,
    isMutualFriend,
    reason,
  };
}

async function assertCanInteract(viewerId, targetId) {
  const perm = await getInteractionPermission(viewerId, targetId);
  if (!perm.canInteract) {
    const err = new Error(perm.reason || 'Follow each other to message or call');
    err.code = 'FOLLOW_REQUIRED';
    err.statusCode = 403;
    err.permission = perm;
    throw err;
  }
  return perm;
}

module.exports = {
  isFollowingUser,
  isFollowedByUser,
  isMutualFollow,
  getInteractionPermission,
  assertCanInteract,
};