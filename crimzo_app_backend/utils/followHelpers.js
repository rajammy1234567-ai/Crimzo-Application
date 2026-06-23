const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const FollowRequest = require('../models/FollowRequest');
const User = require('../models/User');

function toObjectId(id) {
  if (!id) return null;
  const str = String(id);
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

async function countMutualFriendsFor(userId) {
  const oid = toObjectId(userId);
  if (!oid) return 0;

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

/** Reconcile stored counters with actual Follow rows */
async function syncUserFollowCounts(userId) {
  const oid = toObjectId(userId);
  if (!oid) return null;

  const [followers, following, friends] = await Promise.all([
    Follow.countDocuments({ following_id: oid }),
    Follow.countDocuments({ follower_id: oid }),
    countMutualFriendsFor(userId),
  ]);

  const updated = await User.findByIdAndUpdate(
    userId,
    { followers_count: followers, following_count: following, friends_count: friends },
    { new: true },
  ).select('followers_count following_count friends_count');

  return {
    followers_count: updated?.followers_count ?? followers,
    following_count: updated?.following_count ?? following,
    friends_count: updated?.friends_count ?? friends,
  };
}

/** Create pending request or reset rejected/accepted row after unfollow */
async function upsertPendingFollowRequest(requesterId, targetId) {
  const existing = await FollowRequest.findOne({
    requester_id: requesterId,
    target_id: targetId,
  });

  if (existing) {
    existing.status = 'pending';
    existing.created_at = new Date();
    await existing.save();
    return existing;
  }

  return FollowRequest.create({
    requester_id: requesterId,
    target_id: targetId,
    status: 'pending',
  });
}

async function clearFollowRequestBetween(requesterId, targetId) {
  await FollowRequest.deleteOne({ requester_id: requesterId, target_id: targetId });
}

module.exports = {
  toObjectId,
  countMutualFriendsFor,
  syncUserFollowCounts,
  upsertPendingFollowRequest,
  clearFollowRequestBetween,
};