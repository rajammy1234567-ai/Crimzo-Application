const ReelSound = require('../models/ReelSound');
const { uploadToCloudinary } = require('../config/cloudinary');

function normalizeMediaUrl(url) {
  if (!url) return url;
  const publicBase = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, publicBase);
}

function mapSound(doc) {
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    title: doc.title,
    artist: doc.artist || 'Unknown',
    audio_url: normalizeMediaUrl(doc.audio_url),
    cover_url: doc.cover_url ? normalizeMediaUrl(doc.cover_url) : null,
    duration_ms: doc.duration_ms || 0,
    category: doc.category || 'trending',
    usage_count: doc.usage_count || 0,
  };
}

exports.listSounds = async (req, res) => {
  try {
    const { q, category, limit = 30 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 30, 60);

    const filter = { is_active: true };
    if (category && category !== 'all') {
      filter.category = String(category).trim().toLowerCase();
    }
    if (q && String(q).trim()) {
      const term = String(q).trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { artist: { $regex: term, $options: 'i' } },
      ];
    }

    const sounds = await ReelSound.find(filter)
      .sort({ usage_count: -1, created_at: -1 })
      .limit(parsedLimit)
      .lean();

    res.json({ success: true, sounds: sounds.map(mapSound) });
  } catch (error) {
    console.error('List sounds error:', error);
    res.status(500).json({ error: 'Failed to load sounds' });
  }
};

exports.getTrendingSounds = async (req, res) => {
  try {
    const sounds = await ReelSound.find({ is_active: true })
      .sort({ usage_count: -1, created_at: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, sounds: sounds.map(mapSound) });
  } catch (error) {
    console.error('Trending sounds error:', error);
    res.status(500).json({ error: 'Failed to load trending sounds' });
  }
};

exports.adminUploadSound = async (req, res) => {
  try {
    const { title, artist, category, duration_ms } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file required (field: audio)' });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'sounds', 'video');
    const audioUrl = normalizeMediaUrl(uploadResult.secure_url);

    const sound = await ReelSound.create({
      title: String(title).trim().slice(0, 120),
      artist: (artist && String(artist).trim()) || 'Unknown',
      category: (category && String(category).trim().toLowerCase()) || 'trending',
      duration_ms: parseInt(duration_ms, 10) || 0,
      audio_url: audioUrl,
    });

    res.json({ success: true, sound: mapSound(sound) });
  } catch (error) {
    console.error('Admin upload sound error:', error);
    res.status(500).json({ error: 'Failed to upload sound' });
  }
};