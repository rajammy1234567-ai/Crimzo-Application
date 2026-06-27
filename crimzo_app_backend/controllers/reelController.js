const { v4: uuidv4 } = require('uuid');
const Reel = require('../models/Reel');
const ReelSound = require('../models/ReelSound');
const ReelLike = require('../models/ReelLike');
const ReelView = require('../models/ReelView');
const ReelComment = require('../models/ReelComment');
const User = require('../models/User');
const Follow = require('../models/Follow');
const FollowRequest = require('../models/FollowRequest');
const BlockedUser = require('../models/BlockedUser');
const { getInteractionPermission, canViewProfileContent } = require('../utils/followPermissions');
const { uploadToCloudinary } = require('../config/cloudinary');
const mongoose = require('mongoose');

const FORYOU_CANDIDATE_POOL = 400;

function normalizeMediaUrl(url) {
  if (!url) return url;
  const publicBase = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, publicBase);
}

function mapReelAudioFields(r) {
  if (!r?.audio_url && !r?.audio_id) return {};
  return {
    audio_id: r.audio_id ? String(r.audio_id) : null,
    audio_title: r.audio_title || null,
    audio_artist: r.audio_artist || null,
    audio_url: r.audio_url ? normalizeMediaUrl(r.audio_url) : null,
    audio_start_ms: r.audio_start_ms || 0,
  };
}

async function resolveReelAudioPayload(body) {
  const audioId = body.audio_id || body.audioId;
  const audioStartMs = parseInt(body.audio_start_ms ?? body.audioStartMs ?? 0, 10) || 0;

  if (!audioId || !mongoose.Types.ObjectId.isValid(audioId)) {
    return { audioFields: {}, soundId: null };
  }

  const sound = await ReelSound.findOne({ _id: audioId, is_active: true }).lean();
  if (!sound) {
    return { audioFields: {}, soundId: null };
  }

  return {
    soundId: sound._id,
    audioFields: {
      audio_id: sound._id,
      audio_title: sound.title,
      audio_artist: sound.artist,
      audio_url: sound.audio_url,
      audio_start_ms: Math.max(0, audioStartMs),
    },
  };
}

function reelCreatorId(reel) {
  const u = reel.user_id || {};
  const uid = u._id || u || reel.user_id;
  return uid ? String(uid) : null;
}

/** Instagram-style ranking: engagement + recency + follow boost + light shuffle */
function computeReelScore(reel, { isFollowing, hoursOld }) {
  const likes = reel.likes_count || 0;
  const comments = reel.comments_count || 0;
  const views = reel.views_count || 0;
  const engagement = likes * 3 + comments * 5 + Math.sqrt(views) * 2;
  const recency = Math.exp(-hoursOld / 36) * 120;
  let score = engagement + recency;
  if (isFollowing) score *= 2;
  score += Math.random() * 8;
  return score;
}

async function getSocialContext(currentUserId) {
  const currentOid = new mongoose.Types.ObjectId(currentUserId);

  const [followingRows, pendingRows, blockedRows, bannedRows] = await Promise.all([
    Follow.find({ follower_id: currentOid }).select('following_id').lean(),
    FollowRequest.find({ requester_id: currentOid, status: 'pending' }).select('target_id').lean(),
    BlockedUser.find({
      $or: [{ blocker_id: currentOid }, { blocked_id: currentOid }],
    }).lean(),
    User.find({ is_banned: true }).select('_id').lean(),
  ]);

  const followingIdSet = new Set(followingRows.map((f) => String(f.following_id)));
  const requestedIdSet = new Set(pendingRows.map((r) => String(r.target_id)));
  const blockedIdSet = new Set();
  blockedRows.forEach((b) => {
    if (String(b.blocker_id) === String(currentUserId)) {
      blockedIdSet.add(String(b.blocked_id));
    } else {
      blockedIdSet.add(String(b.blocker_id));
    }
  });
  bannedRows.forEach((u) => blockedIdSet.add(String(u._id)));

  const allowedFollowingIds = [...followingIdSet]
    .filter((id) => !blockedIdSet.has(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  allowedFollowingIds.push(currentOid);

  return {
    currentOid,
    followingIdSet,
    requestedIdSet,
    blockedIdSet,
    allowedFollowingIds,
    blockedObjectIds: [...blockedIdSet].map((id) => new mongoose.Types.ObjectId(id)),
  };
}

async function enrichReels(reels, ctx) {
  const { currentOid, followingIdSet, requestedIdSet } = ctx;

  const missingUserIds = [];
  for (const reel of reels) {
    const rawUser = reel.user_id;
    const hasProfile = rawUser && typeof rawUser === 'object' && rawUser.username;
    if (!hasProfile) {
      const creatorId = reelCreatorId(reel);
      if (creatorId) missingUserIds.push(creatorId);
    }
  }

  const uniqueMissingIds = [...new Set(missingUserIds)];
  const fetchedUsers = uniqueMissingIds.length
    ? await User.find({
        _id: { $in: uniqueMissingIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('username avatar')
        .lean()
    : [];
  const userById = new Map(fetchedUsers.map((u) => [String(u._id), u]));

  return Promise.all(reels.map(async (r) => {
    const creatorId = reelCreatorId(r);
    const rawUser = r.user_id;
    let u = rawUser && typeof rawUser === 'object' && rawUser.username ? rawUser : null;
    if (!u && creatorId) {
      u = userById.get(creatorId) || null;
    }
    const followingId = u?._id || rawUser?._id || rawUser || r.user_id;

    const [likeCount, commentCount, isLiked, isFollowing] = await Promise.all([
      ReelLike.countDocuments({ reel_id: r._id }),
      ReelComment.countDocuments({ reel_id: r._id }),
      ReelLike.exists({ reel_id: r._id, user_id: currentOid }),
      creatorId ? Promise.resolve(followingIdSet.has(creatorId)) : Follow.exists({ follower_id: currentOid, following_id: followingId }),
    ]);

    const uid = u?._id || rawUser?._id || rawUser || r.user_id;
    const isRequested = creatorId ? requestedIdSet.has(creatorId) : false;

    return {
      id: r._id ? r._id.toString() : null,
      user_id: uid ? (uid.toString ? uid.toString() : String(uid)) : null,
      video_url: normalizeMediaUrl(r.video_url),
      thumbnail_url: normalizeMediaUrl(r.thumbnail_url),
      caption: r.caption || '',
      likes_count: likeCount || r.likes_count || 0,
      views_count: r.views_count || 0,
      comments_count: commentCount || r.comments_count || 0,
      created_at: r.created_at,
      username: u?.username || 'User',
      avatar: u?.avatar ? normalizeMediaUrl(u.avatar) : null,
      is_liked: !!isLiked,
      is_following: !!isFollowing,
      is_requested: isRequested,
      ...mapReelAudioFields(r),
    };
  }));
}

// Generate presigned URL - LEGACY (was S3). For simplicity now recommend using /upload multipart.
// We keep endpoint to avoid breaking clients; returns guidance + upload endpoint info.
exports.getPresignedUrl = async (req, res) => {
  try {
    res.json({
      success: false,
      message: 'Direct presigned upload deprecated after AWS removal. Use POST /api/reels/upload with multipart form (field: video).',
      useUploadEndpoint: '/api/reels/upload'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

// Confirm reel upload after direct/cloud upload (accepts any public video URL)
exports.confirmUpload = async (req, res) => {
  try {
    const userId = req.user.id;
    const { publicUrl, caption } = req.body;

    if (!publicUrl) {
      return res.status(400).json({ error: 'publicUrl is required' });
    }

    const { audioFields, soundId } = await resolveReelAudioPayload(req.body);
    const reel = await Reel.create({
      user_id: userId,
      video_url: publicUrl,
      caption: caption || '',
      ...audioFields,
    });
    if (soundId) {
      await ReelSound.findByIdAndUpdate(soundId, { $inc: { usage_count: 1 } });
    }

    const populated = await Reel.findById(reel._id).populate('user_id', 'username avatar').lean();
    const reelWithUser = {
      id: populated._id ? populated._id.toString() : undefined,
      ...populated,
      username: populated.user_id?.username,
      avatar: populated.user_id?.avatar
    };

    res.json({ success: true, reel: reelWithUser, reelId: reel._id.toString() });
  } catch (error) {
    console.error('Confirm reel upload error:', error);
    res.status(500).json({ error: 'Failed to save reel' });
  }
};

// Upload reel (legacy multipart - primary method now via Cloudinary)
exports.uploadReel = async (req, res) => {
  try {
    const { caption } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      const receivedFields = Array.isArray(req.files)
        ? req.files.map((f) => f.fieldname)
        : req.files
          ? Object.keys(req.files)
          : [];
      return res.status(400).json({
        error: 'Video file required (multipart field: video)',
        receivedFields,
      });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'reels', 'video');
    const videoUrl = normalizeMediaUrl(uploadResult.secure_url);

    const { audioFields, soundId } = await resolveReelAudioPayload(req.body);

    const reel = await Reel.create({
      user_id: new mongoose.Types.ObjectId(String(userId)),
      video_url: videoUrl,
      caption: caption || '',
      ...audioFields,
    });

    if (soundId) {
      await ReelSound.findByIdAndUpdate(soundId, { $inc: { usage_count: 1 } });
    }

    // Fetch with user info
    const populated = await Reel.findById(reel._id).populate('user_id', 'username avatar').lean();
    const newReel = {
      id: populated._id ? populated._id.toString() : undefined,
      ...populated,
      username: populated.user_id?.username,
      avatar: populated.user_id?.avatar
    };

    res.json({
      success: true,
      reel: newReel,
      reelId: reel._id.toString(),
      videoUrl
    });
  } catch (error) {
    console.error('Upload reel error:', error);
    res.status(500).json({ error: 'Failed to upload reel' });
  }
};

// Get reels feed — Instagram-style: mode=following | mode=foryou (default)
exports.getFeed = async (req, res) => {
  try {
    const { limit = 20, offset = 0, mode = 'foryou' } = req.query;
    const currentUserId = req.user.id;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const parsedOffset = parseInt(offset, 10) || 0;
    const feedMode = mode === 'following' ? 'following' : 'foryou';

    const ctx = await getSocialContext(currentUserId);
    let reels = [];

    if (feedMode === 'following') {
      reels = await Reel.find({ user_id: { $in: ctx.allowedFollowingIds } })
        .sort({ created_at: -1 })
        .skip(parsedOffset)
        .limit(parsedLimit)
        .populate('user_id', 'username avatar')
        .lean();
    } else {
      const blockedFilter = ctx.blockedObjectIds.length
        ? { user_id: { $nin: ctx.blockedObjectIds } }
        : {};

      const candidates = await Reel.find(blockedFilter)
        .sort({ created_at: -1 })
        .limit(FORYOU_CANDIDATE_POOL)
        .populate('user_id', 'username avatar')
        .lean();

      const now = Date.now();
      const ranked = candidates
        .map((r) => {
          const creatorId = reelCreatorId(r);
          const hoursOld = (now - new Date(r.created_at).getTime()) / 3600000;
          const isFollowing = creatorId ? ctx.followingIdSet.has(creatorId) : false;
          return {
            reel: r,
            score: computeReelScore(r, { isFollowing, hoursOld }),
          };
        })
        .sort((a, b) => b.score - a.score);

      reels = ranked.slice(parsedOffset, parsedOffset + parsedLimit).map((entry) => entry.reel);
    }

    const formattedReels = await enrichReels(reels, ctx);

    res.json({ success: true, mode: feedMode, reels: formattedReels });
  } catch (error) {
    console.error('Get reels error:', error);
    res.status(500).json({ error: 'Failed to get reels' });
  }
};

// Like / Unlike reel
exports.likeReel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reelId } = req.params;

    const existing = await ReelLike.findOne({ reel_id: reelId, user_id: userId });

    if (existing) {
      await ReelLike.deleteOne({ _id: existing._id });
      await Reel.findByIdAndUpdate(reelId, { $inc: { likes_count: -1 } });
      const likes_count = await ReelLike.countDocuments({ reel_id: reelId });
      res.json({ success: true, action: 'unliked', likes_count });
    } else {
      await ReelLike.create({ reel_id: reelId, user_id: userId });
      await Reel.findByIdAndUpdate(reelId, { $inc: { likes_count: 1 } });
      const likes_count = await ReelLike.countDocuments({ reel_id: reelId });
      try {
        const { recordTaskAction } = require('../utils/taskProgress');
        void recordTaskAction(userId, 'like_moment', 1).catch(() => {});
      } catch (_) { /* ignore */ }
      res.json({ success: true, action: 'liked', likes_count });
    }
  } catch (error) {
    console.error('Like reel error:', error);
    res.status(500).json({ error: 'Failed to like reel' });
  }
};

// Add comment
exports.addComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reelId } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reelId)) {
      return res.status(400).json({ error: 'Invalid reel id' });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text required' });
    }

    const reel = await Reel.findById(reelId).select('_id');
    if (!reel) {
      return res.status(404).json({ error: 'Reel not found' });
    }

    const comment = await ReelComment.create({
      reel_id: reelId,
      user_id: userId,
      text: text.trim().slice(0, 500),
    });
    await Reel.findByIdAndUpdate(reelId, { $inc: { comments_count: 1 } });

    const populated = await ReelComment.findById(comment._id).populate('user_id', 'username avatar').lean();
    const author = populated?.user_id && typeof populated.user_id === 'object' ? populated.user_id : null;
    const comments_count = await ReelComment.countDocuments({ reel_id: reelId });
    res.json({
      success: true,
      comments_count,
      comment: {
        id: populated._id ? populated._id.toString() : undefined,
        user_id: author?._id ? author._id.toString() : String(userId),
        text: populated.text,
        username: author?.username || 'User',
        avatar: author?.avatar ? normalizeMediaUrl(author.avatar) : null,
        created_at: populated.created_at,
      },
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

// Get comments for a reel
exports.getComments = async (req, res) => {
  try {
    const { reelId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(reelId)) {
      return res.status(400).json({ error: 'Invalid reel id' });
    }

    const comments = await ReelComment.find({ reel_id: reelId })
      .sort({ created_at: 1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('user_id', 'username avatar')
      .lean();

    const total = await ReelComment.countDocuments({ reel_id: reelId });

    const formatted = comments.map((c) => {
      const author = c.user_id && typeof c.user_id === 'object' ? c.user_id : null;
      const authorId = author?._id
        ? author._id.toString()
        : (c.user_id ? String(c.user_id) : null);
      return {
        id: c._id ? c._id.toString() : undefined,
        user_id: authorId,
        text: c.text,
        username: author?.username || 'User',
        avatar: author?.avatar ? normalizeMediaUrl(author.avatar) : null,
        created_at: c.created_at,
      };
    });

    res.json({ success: true, comments: formatted, total });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
};

// Get logged-in user's reels (preferred — avoids stale/wrong client user id)
exports.getMyReels = async (req, res) => {
  req.params.userId = String(req.user.id);
  return exports.getUserReels(req, res);
};

// Get user's reels
exports.getUserReels = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Guard against invalid ObjectId from client state (prevents cast errors/500)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.json({ success: true, reels: [], canViewContent: false });
    }

    const isOwn = String(currentUserId) === String(userId);
    if (!isOwn) {
      const [target, interaction] = await Promise.all([
        User.findById(userId).select('is_private').lean(),
        getInteractionPermission(currentUserId, userId),
      ]);
      if (!target) {
        return res.json({ success: true, reels: [], canViewContent: false });
      }
      const allowed = canViewProfileContent(currentUserId, userId, {
        isPrivate: !!target.is_private,
        isFollowing: interaction.isFollowing,
        isMutualFriend: interaction.isMutualFriend,
      });
      if (!allowed) {
        return res.json({ success: true, reels: [], canViewContent: false });
      }
    }

    const reels = await Reel.find({ user_id: new mongoose.Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .populate('user_id', 'username avatar')
      .lean();

    const currentOid = new mongoose.Types.ObjectId(currentUserId);
    const formattedReels = await Promise.all(reels.map(async (r) => {
      const likeCount = await ReelLike.countDocuments({ reel_id: r._id });
      const commentCount = await ReelComment.countDocuments({ reel_id: r._id });
      const isLiked = await ReelLike.exists({ reel_id: r._id, user_id: currentOid });
      const u = r.user_id || {};
      const uid = u._id || u || r.user_id;
      return {
        id: r._id ? r._id.toString() : null,
        user_id: uid ? (uid.toString ? uid.toString() : uid) : null,
        video_url: normalizeMediaUrl(r.video_url),
        thumbnail_url: normalizeMediaUrl(r.thumbnail_url),
        caption: r.caption,
        likes_count: likeCount || r.likes_count,
        views_count: r.views_count,
        comments_count: commentCount || r.comments_count,
        created_at: r.created_at,
        username: u.username,
        avatar: u.avatar,
        is_liked: !!isLiked,
        ...mapReelAudioFields(r),
      };
    }));

    res.json({ success: true, reels: formattedReels, canViewContent: true });
  } catch (error) {
    console.error('Get user reels error:', error);
    res.status(500).json({ error: 'Failed to get user reels' });
  }
};

// Delete reel
exports.deleteReel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reelId } = req.params;

    const reel = await Reel.findOne({ _id: reelId, user_id: userId });
    if (!reel) {
      return res.status(404).json({ error: 'Reel not found or not yours' });
    }

    await Reel.deleteOne({ _id: reelId });
    // optionally delete likes/comments too
    await ReelLike.deleteMany({ reel_id: reelId });
    await ReelComment.deleteMany({ reel_id: reelId });
    await ReelView.deleteMany({ reel_id: reelId });

    res.json({ success: true, message: 'Reel deleted' });
  } catch (error) {
    console.error('Delete reel error:', error);
    res.status(500).json({ error: 'Failed to delete reel' });
  }
};

// Update reel (owner only, e.g. caption)
exports.updateReel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reelId } = req.params;
    const { caption } = req.body;

    if (typeof caption !== 'string') {
      return res.status(400).json({ error: 'Caption is required' });
    }

    const reel = await Reel.findOne({ _id: reelId, user_id: userId });
    if (!reel) {
      return res.status(404).json({ error: 'Reel not found or not yours' });
    }

    reel.caption = caption.trim();
    await reel.save();

    res.json({ success: true, message: 'Reel updated' });
  } catch (error) {
    console.error('Update reel error:', error);
    res.status(500).json({ error: 'Failed to update reel' });
  }
};

// Record a unique view (one count per user per reel)
exports.viewReel = async (req, res) => {
  try {
    const { reelId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(reelId)) {
      return res.status(400).json({ error: 'Invalid reel id' });
    }

    const reel = await Reel.findById(reelId).select('views_count user_id');
    if (!reel) {
      return res.status(404).json({ error: 'Reel not found' });
    }

    const viewsCount = reel.views_count || 0;

    // Owner re-watching their own reel should not inflate views
    if (String(reel.user_id) === String(userId)) {
      return res.json({ success: true, counted: false, views_count: viewsCount });
    }

    const existing = await ReelView.findOne({ reel_id: reelId, user_id: userId }).select('_id');
    if (existing) {
      return res.json({ success: true, counted: false, views_count: viewsCount });
    }

    try {
      await ReelView.create({ reel_id: reelId, user_id: userId });
    } catch (err) {
      if (err.code === 11000) {
        return res.json({ success: true, counted: false, views_count: viewsCount });
      }
      throw err;
    }

    const updated = await Reel.findByIdAndUpdate(
      reelId,
      { $inc: { views_count: 1 } },
      { new: true },
    ).select('views_count');

    res.json({
      success: true,
      counted: true,
      views_count: updated?.views_count ?? viewsCount + 1,
    });
  } catch (error) {
    console.error('View reel error:', error);
    res.status(500).json({ error: 'Failed to record view' });
  }
};
