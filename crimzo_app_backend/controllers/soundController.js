const ReelSound = require('../models/ReelSound');
const { uploadToCloudinary } = require('../config/cloudinary');
const { SOUND_LANGUAGES } = require('../config/soundLanguages');
const { getAppTrendingSounds, getLocalSounds, mapLocalSound, dedupeSounds } = require('../utils/soundTrending');
const { extractAudioFromVideo, hasFfmpeg } = require('../utils/extractAudioFromVideo');
const licensedMusic = require('../utils/licensedMusicClient');

function normalizeMediaUrl(url) {
  if (!url) return url;
  const publicBase = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, publicBase);
}

function mapSound(doc, extra = {}) {
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    source: doc.source || 'crimzo',
    external_id: doc.external_id || null,
    title: doc.title,
    artist: doc.artist || 'Unknown',
    audio_url: normalizeMediaUrl(doc.audio_url),
    cover_url: doc.cover_url ? normalizeMediaUrl(doc.cover_url) : null,
    duration_ms: doc.duration_ms || 0,
    category: doc.category || 'trending',
    language: doc.language || 'all',
    usage_count: doc.usage_count || 0,
    reels_count: extra.reels_count || 0,
    is_trending: !!extra.is_trending,
  };
}

/** Instagram-style browse: trending + languages + live search */
exports.browseSounds = async (req, res) => {
  try {
    const {
      tab = 'trending',
      language = 'all',
      q,
      limit = 40,
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 40, 60);
    const lang = String(language).trim().toLowerCase();
    const search = q && String(q).trim() ? String(q).trim() : '';

    const userId = req.user?.id || null;

    const [appTrending, localSounds, licensedCatalog] = await Promise.all([
      tab === 'trending' && !search
        ? getAppTrendingSounds(Math.min(parsedLimit, 12), lang)
        : Promise.resolve([]),
      getLocalSounds({ language: lang, q: search, limit: Math.ceil(parsedLimit / 2) }),
      licensedMusic.fetchCatalog({
        tab,
        language: lang,
        q: search,
        limit: parsedLimit,
        userId,
      }),
    ]);

    const licensedSounds = licensedCatalog.sounds || [];
    const musicProvider = licensedCatalog.provider;

    let merged = [];

    if (search) {
      merged = dedupeSounds([...licensedSounds, ...localSounds]);
    } else if (tab === 'trending') {
      merged = dedupeSounds([...appTrending, ...licensedSounds, ...localSounds]);
    } else {
      merged = dedupeSounds([...licensedSounds, ...localSounds]);
    }

    merged = merged.slice(0, parsedLimit);

    res.json({
      success: true,
      tab,
      language: lang,
      source: musicProvider ? `licensed:${musicProvider}` : 'local',
      music_provider: musicProvider,
      sounds: merged,
      languages: SOUND_LANGUAGES,
    });
  } catch (error) {
    console.error('Browse sounds error:', error);
    res.status(500).json({ error: 'Failed to browse sounds' });
  }
};

exports.getLanguages = async (_req, res) => {
  res.json({ success: true, languages: SOUND_LANGUAGES });
};

exports.listSounds = async (req, res) => {
  try {
    return exports.browseSounds(req, res);
  } catch (error) {
    console.error('List sounds error:', error);
    res.status(500).json({ error: 'Failed to load sounds' });
  }
};

exports.getTrendingSounds = async (req, res) => {
  req.query.tab = 'trending';
  return exports.browseSounds(req, res);
};

/** Refresh expired stream URLs (licensed + Audius URLs expire) */
exports.resolveStream = async (req, res) => {
  try {
    const { source, id } = req.params;
    const userId = req.user?.id || null;

    if (!source || !id) {
      return res.status(400).json({ error: 'Source and track id required' });
    }

    const stream = await licensedMusic.resolveStream(source, id, userId);
    if (!stream?.audio_url) {
      return res.status(404).json({ error: 'Stream not available' });
    }

    return res.json({ success: true, ...stream, source, external_id: String(id) });
  } catch (error) {
    console.error('Resolve stream error:', error);
    res.status(500).json({ error: 'Failed to resolve stream' });
  }
};

/** Pick a gallery video → extract audio → save as reusable sound */
exports.importFromVideo = async (req, res) => {
  try {
    if (!hasFfmpeg) {
      return res.status(503).json({ error: 'Audio extraction is not available on this server' });
    }

    const fileSize = req.file?.buffer?.length || 0;
    if (!fileSize) {
      return res.status(400).json({
        error: 'Video file required (field: video)',
        hint: 'Gallery upload may have failed — try a shorter video or re-open the app.',
      });
    }
    if (fileSize < 1024) {
      return res.status(400).json({
        error: 'Uploaded video file is empty or corrupted',
        hint: 'Re-pick the video from gallery. If it keeps failing, update the app and try a shorter clip.',
      });
    }

    const mime = (req.file.mimetype || '').toLowerCase();
    const allowedMime =
      mime.startsWith('video/')
      || mime === 'application/octet-stream'
      || mime === 'application/mp4'
      || mime === '';
    if (!allowedMime) {
      return res.status(400).json({ error: 'Please upload a video file' });
    }

    console.log(
      `[Import sound] user=${req.user?.id} size=${req.file.buffer.length} mime=${mime} name=${req.file.originalname || 'n/a'}`,
    );

    const titleRaw = req.body.title || req.body.name;
    const title = titleRaw && String(titleRaw).trim()
      ? String(titleRaw).trim().slice(0, 120)
      : 'Imported Sound';

    const durationMs = Math.max(0, parseInt(req.body.duration_ms ?? req.body.durationMs ?? 0, 10) || 0);
    const username = req.user?.username || 'You';

    let audioBuffer;
    try {
      audioBuffer = await extractAudioFromVideo(req.file.buffer, {
        mimeType: mime,
        originalName: req.file.originalname,
      });
    } catch (err) {
      const msg = String(err.message || '');
      if (/no audio|does not contain|invalid data|no stream/i.test(msg)) {
        return res.status(400).json({ error: 'This video has no audio track to extract' });
      }
      console.error('Extract audio error:', err);
      return res.status(500).json({
        error: 'Could not extract audio from video',
        hint: 'Try another video with clear audio, or a shorter clip from gallery.',
      });
    }

    const isMp3 = audioBuffer.length >= 3
      && audioBuffer[0] === 0x49
      && audioBuffer[1] === 0x44
      && audioBuffer[2] === 0x33;
    const uploadResult = await uploadToCloudinary(
      audioBuffer,
      'sounds',
      isMp3 ? 'raw' : 'video',
      null,
      isMp3 ? '.mp3' : '.m4a',
    );
    const audioUrl = normalizeMediaUrl(uploadResult.secure_url);

    const sound = await ReelSound.create({
      title,
      artist: username,
      category: 'imported',
      language: 'all',
      duration_ms: durationMs,
      audio_url: audioUrl,
      source: 'imported',
    });

    res.json({ success: true, sound: mapSound(sound) });
  } catch (error) {
    console.error('Import sound from video error:', error);
    res.status(500).json({ error: 'Failed to import sound from video' });
  }
};

exports.adminUploadSound = async (req, res) => {
  try {
    const { title, artist, category, language, duration_ms } = req.body;

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
      language: (language && String(language).trim().toLowerCase()) || 'all',
      duration_ms: parseInt(duration_ms, 10) || 0,
      audio_url: audioUrl,
      source: 'crimzo',
    });

    res.json({ success: true, sound: mapSound(sound) });
  } catch (error) {
    console.error('Admin upload sound error:', error);
    res.status(500).json({ error: 'Failed to upload sound' });
  }
};

module.exports.mapSound = mapSound;
module.exports.mapLocalSound = mapLocalSound;