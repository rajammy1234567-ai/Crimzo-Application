const { v4: uuidv4 } = require('uuid');
const Reel = require('../models/Reel');
const ReelLike = require('../models/ReelLike');
const ReelView = require('../models/ReelView');
const ReelComment = require('../models/ReelComment');
const User = require('../models/User');
const { uploadToCloudinary } = require('../config/cloudinary');
const mongoose = require('mongoose');

function normalizeMediaUrl(url) {
  if (!url) return url;
  const publicBase = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, publicBase);
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

    const reel = await Reel.create({ user_id: userId, video_url: publicUrl, caption: caption || '' });

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

    const reel = await Reel.create({
      user_id: new mongoose.Types.ObjectId(String(userId)),
      video_url: videoUrl,
      caption: caption || '',
    });

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

// Get reels feed
exports.getFeed = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const currentUserId = req.user.id;

    const reels = await Reel.find()
      .sort({ created_at: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('user_id', 'username avatar')
      .lean();

    // Enrich with counts and flags (use parallel for perf but simple loop ok)
    const currentOid = new mongoose.Types.ObjectId(currentUserId);

    const Follow = require('../models/Follow');
    const formattedReels = await Promise.all(reels.map(async (r) => {
      const populatedUser = r.user_id || {};
      const followingId = populatedUser._id || populatedUser || r.user_id;
      const [likeCount, commentCount, isLiked, isFollowing] = await Promise.all([
        ReelLike.countDocuments({ reel_id: r._id }),
        ReelComment.countDocuments({ reel_id: r._id }),
        ReelLike.exists({ reel_id: r._id, user_id: currentOid }),
        Follow.exists({ follower_id: currentOid, following_id: followingId })
      ]);
      const u = populatedUser;
      const uid = u._id || u || r.user_id;
      return {
        id: r._id ? r._id.toString() : null,
        user_id: uid ? (uid.toString ? uid.toString() : uid) : null,
        video_url: normalizeMediaUrl(r.video_url),
        thumbnail_url: normalizeMediaUrl(r.thumbnail_url),
        caption: r.caption,
        likes_count: likeCount || r.likes_count || 0,
        views_count: r.views_count || 0,
        comments_count: commentCount || r.comments_count || 0,
        created_at: r.created_at,
        username: u.username || u.username,
        avatar: u.avatar,
        is_liked: !!isLiked,
        is_following: !!isFollowing
      };
    }));

    res.json({ success: true, reels: formattedReels });
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

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text required' });
    }

    const comment = await ReelComment.create({ reel_id: reelId, user_id: userId, text: text.trim() });
    await Reel.findByIdAndUpdate(reelId, { $inc: { comments_count: 1 } });

    const populated = await ReelComment.findById(comment._id).populate('user_id', 'username avatar').lean();
    const c = populated;
    res.json({ success: true, comment: { 
      ...c, 
      id: populated._id ? populated._id.toString() : undefined,
      username: c.user_id?.username, 
      avatar: c.user_id?.avatar 
    } });
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

    const comments = await ReelComment.find({ reel_id: reelId })
      .sort({ created_at: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('user_id', 'username avatar')
      .lean();

    const total = await ReelComment.countDocuments({ reel_id: reelId });

    const formatted = comments.map(c => ({
      ...c,
      id: c._id ? c._id.toString() : undefined,
      username: c.user_id?.username,
      avatar: c.user_id?.avatar
    }));

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
      return res.json({ success: true, reels: [] });
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
        is_liked: !!isLiked
      };
    }));

    res.json({ success: true, reels: formattedReels });
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
