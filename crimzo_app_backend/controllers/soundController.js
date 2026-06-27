const ReelSound = require('../models/ReelSound');
const { uploadToCloudinary } = require('../config/cloudinary');
const { SOUND_LANGUAGES } = require('../config/soundLanguages');
const { getTrendingTracks, searchTracks, getTrackStreamUrl } = require('../utils/audiusClient');
const { getAppTrendingSounds, getLocalSounds, mapLocalSound, dedupeSounds } = require('../utils/soundTrending');

const AUDIUS_ENABLED = process.env.AUDIUS_ENABLED !== 'false';

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

async function fetchAudiusCatalog({ tab, language, q, limit }) {
  if (!AUDIUS_ENABLED) return [];

  try {
    if (q && String(q).trim()) {
      const { getLanguageConfig } = require('../config/soundLanguages');
      const lang = getLanguageConfig(language);
      const query = lang.code !== 'all' && !String(q).toLowerCase().includes(lang.code)
        ? `${q} ${lang.searchQuery || lang.label}`
        : q;
      return await searchTracks(query, limit, lang.code);
    }

    if (tab === 'trending') {
      return await getTrendingTracks(limit, language);
    }

    const { getLanguageConfig } = require('../config/soundLanguages');
    const lang = getLanguageConfig(language);
    if (lang.code !== 'all' && lang.searchQuery) {
      return await searchTracks(lang.searchQuery, limit, lang.code);
    }

    return await getTrendingTracks(limit, 'all');
  } catch (error) {
    console.warn('Audius catalog fetch failed:', error.message);
    return [];
  }
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

    const [appTrending, localSounds, audiusSounds] = await Promise.all([
      tab === 'trending' && !search
        ? getAppTrendingSounds(Math.min(parsedLimit, 12), lang)
        : Promise.resolve([]),
      getLocalSounds({ language: lang, q: search, limit: Math.ceil(parsedLimit / 2) }),
      fetchAudiusCatalog({ tab, language: lang, q: search, limit: parsedLimit }),
    ]);

    let merged = [];

    if (search) {
      merged = dedupeSounds([...localSounds, ...audiusSounds]);
    } else if (tab === 'trending') {
      merged = dedupeSounds([...appTrending, ...localSounds, ...audiusSounds]);
    } else {
      merged = dedupeSounds([...localSounds, ...audiusSounds]);
    }

    merged = merged.slice(0, parsedLimit);

    res.json({
      success: true,
      tab,
      language: lang,
      source: AUDIUS_ENABLED ? 'hybrid' : 'local',
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

/** Refresh expired stream URLs (Audius signatures expire) */
exports.resolveStream = async (req, res) => {
  try {
    const { source, id } = req.params;

    if (source === 'audius' && id) {
      const stream = await getTrackStreamUrl(id);
      if (!stream?.audio_url) {
        return res.status(404).json({ error: 'Stream not available' });
      }
      return res.json({ success: true, ...stream, source: 'audius', external_id: String(id) });
    }

    return res.status(400).json({ error: 'Unsupported source' });
  } catch (error) {
    console.error('Resolve stream error:', error);
    res.status(500).json({ error: 'Failed to resolve stream' });
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