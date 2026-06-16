const { v4: uuidv4 } = require('uuid');
const Story = require('../models/Story');
const User = require('../models/User');
const Follow = require('../models/Follow');
const { uploadToCloudinary } = require('../config/cloudinary');

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function storyExpiresAt() {
  return new Date(Date.now() + STORY_TTL_MS);
}

async function purgeExpiredStories() {
  try {
    const result = await Story.deleteMany({ expires_at: { $lte: new Date() } });
    if (result.deletedCount > 0) {
      console.log(`🧹 Purged ${result.deletedCount} expired story/stories`);
    }
    return result.deletedCount;
  } catch (err) {
    console.error('Purge expired stories error:', err.message);
    return 0;
  }
}

exports.purgeExpiredStories = purgeExpiredStories;

// Generate presigned URL - LEGACY (deprecated post-AWS removal)
exports.getPresignedUrl = async (req, res) => {
  res.json({
    success: false,
    message: 'Direct presigned deprecated. Use POST /api/stories/upload multipart (field: media)',
    useUploadEndpoint: '/api/stories/upload'
  });
};

// Confirm story upload (accepts any public media URL)
exports.confirmUpload = async (req, res) => {
  try {
    const userId = req.user.id;
    const { publicUrl, mediaType = 'photo', caption } = req.body;

    if (!publicUrl) {
      return res.status(400).json({ error: 'publicUrl is required' });
    }

    const expiresAt = storyExpiresAt();

    const story = await Story.create({
      user_id: userId,
      media_url: publicUrl,
      media_type: mediaType,
      caption: caption || '',
      expires_at: expiresAt
    });

    res.json({
      success: true,
      storyId: story.id,
      mediaUrl: publicUrl,
      mediaType,
      expiresAt
    });
  } catch (error) {
    console.error('Confirm story upload error:', error);
    res.status(500).json({ error: 'Failed to save story' });
  }
};

// Upload story (legacy - keep for compatibility)
exports.uploadStory = async (req, res) => {
  const started = Date.now();
  try {
    const userId = req.user.id;
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Media file required' });
    }

    console.log(
      `[Story] Upload start user=${userId} type=${req.file.mimetype} size=${req.file.size} bytes`,
    );

    const isVideo = req.file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'video' : 'photo';
    const ext = isVideo ? 'mp4' : 'jpg';
    const contentType = isVideo ? 'video/mp4' : 'image/jpeg';

    const fileName = `stories/${userId}/${uuidv4()}.${ext}`;

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'stories', isVideo ? 'video' : 'image');

    const expiresAt = storyExpiresAt();

    const story = await Story.create({
      user_id: userId,
      media_url: uploadResult.secure_url,
      media_type: mediaType,
      caption: caption || '',
      expires_at: expiresAt
    });

    console.log(`[Story] Upload ok id=${story.id} in ${Date.now() - started}ms`);

    res.json({
      success: true,
      storyId: story.id,
      mediaUrl: uploadResult.secure_url,
      mediaType,
      expiresAt
    });
  } catch (error) {
    console.error(`[Story] Upload failed after ${Date.now() - started}ms:`, error);
    res.status(500).json({ error: 'Failed to upload story', details: error.message });
  }
};

// Get all active stories grouped by user
exports.getAllStories = async (req, res) => {
  try {
    await purgeExpiredStories();
    const now = new Date();
    const stories = await Story.find({ expires_at: { $gt: now } })
      .sort({ created_at: -1 })
      .populate('user_id', 'username avatar')
      .lean();

    const grouped = {};
    for (const s of stories) {
      const uid = s.user_id?._id || s.user_id;
      const key = String(uid);
      if (!grouped[key]) {
        grouped[key] = {
          user_id: s.user_id?.id || uid,
          username: s.user_id?.username,
          avatar: s.user_id?.avatar,
          stories: []
        };
      }
      grouped[key].stories.push({
        id: s.id,
        media_url: s.media_url,
        media_type: s.media_type,
        caption: s.caption,
        created_at: s.created_at,
        expires_at: s.expires_at
      });
    }

    const userId = req.user.id;
    const userKey = String(userId);

    const followingRows = await Follow.find({ follower_id: userId })
      .select('following_id')
      .lean();
    const followingIds = new Set(followingRows.map((f) => String(f.following_id)));

    const result = [];
    if (grouped[userKey]) result.push(grouped[userKey]);
    for (const key of Object.keys(grouped)) {
      if (key !== userKey && followingIds.has(key)) {
        result.push(grouped[key]);
      }
    }

    res.json({ success: true, storyGroups: result });
  } catch (error) {
    console.error('Fetch stories error:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
};

// Get specific user's active stories
exports.getUserStories = async (req, res) => {
  try {
    await purgeExpiredStories();
    const { userId } = req.params;
    const now = new Date();
    const stories = await Story.find({ user_id: userId, expires_at: { $gt: now } })
      .sort({ created_at: 1 })
      .populate('user_id', 'username avatar')
      .lean();

    res.json({ success: true, stories });
  } catch (error) {
    console.error('Fetch user stories error:', error);
    res.status(500).json({ error: 'Failed to fetch user stories' });
  }
};

// Delete own story
exports.deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    const result = await Story.deleteOne({ _id: storyId, user_id: userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Story not found or unauthorized' });
    }

    res.json({ success: true, message: 'Story deleted' });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
};
