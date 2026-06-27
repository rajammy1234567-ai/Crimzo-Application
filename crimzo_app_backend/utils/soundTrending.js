const mongoose = require('mongoose');
const Reel = require('../models/Reel');
const ReelSound = require('../models/ReelSound');

const TRENDING_WINDOW_DAYS = 7;

function mapLocalSound(doc, extra = {}) {
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    source: doc.source || 'crimzo',
    external_id: doc.external_id || null,
    title: doc.title,
    artist: doc.artist || 'Unknown',
    audio_url: doc.audio_url,
    cover_url: doc.cover_url || null,
    duration_ms: doc.duration_ms || 0,
    category: doc.category || 'trending',
    language: doc.language || 'all',
    usage_count: doc.usage_count || 0,
    reels_count: extra.reels_count || 0,
    is_trending: !!extra.is_trending,
  };
}

/** Real-time trending from reels posted in the last 7 days */
async function getAppTrendingSounds(limit = 15, language = 'all') {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const matchStage = {
    created_at: { $gte: since },
    $or: [{ audio_url: { $exists: true, $ne: null } }, { audio_id: { $exists: true, $ne: null } }],
  };

  if (language && language !== 'all') {
    matchStage.audio_language = language;
  }

  const grouped = await Reel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          audio_id: '$audio_id',
          external_id: '$external_id',
          external_source: '$external_source',
          audio_title: '$audio_title',
          audio_artist: '$audio_artist',
          audio_url: '$audio_url',
          audio_language: '$audio_language',
        },
        reels_count: { $sum: 1 },
        last_used: { $max: '$created_at' },
      },
    },
    { $sort: { reels_count: -1, last_used: -1 } },
    { $limit: limit },
  ]);

  return grouped.map((row, index) => {
    const g = row._id || {};
    const id = g.audio_id
      ? String(g.audio_id)
      : g.external_id
        ? `${g.external_source || 'external'}:${g.external_id}`
        : `trending:${index}`;

    return {
      id,
      source: g.external_source || (g.audio_id ? 'crimzo' : 'crimzo'),
      external_id: g.external_id ? String(g.external_id) : null,
      title: g.audio_title || 'Trending Sound',
      artist: g.audio_artist || 'Crimzo',
      audio_url: g.audio_url || '',
      cover_url: null,
      duration_ms: 0,
      category: 'trending',
      language: g.audio_language || language || 'all',
      usage_count: row.reels_count,
      reels_count: row.reels_count,
      is_trending: true,
    };
  }).filter((s) => s.audio_url);
}

async function getLocalSounds({ language, q, limit }) {
  const filter = { is_active: true };
  if (language && language !== 'all') filter.language = language;
  if (q && String(q).trim()) {
    const term = String(q).trim();
    filter.$or = [
      { title: { $regex: term, $options: 'i' } },
      { artist: { $regex: term, $options: 'i' } },
    ];
  }

  const docs = await ReelSound.find(filter)
    .sort({ usage_count: -1, created_at: -1 })
    .limit(limit)
    .lean();

  return docs.map((d) => mapLocalSound(d, { is_trending: (d.usage_count || 0) > 2 }));
}

function dedupeSounds(sounds) {
  const seen = new Set();
  const out = [];

  for (const sound of sounds) {
    const key = sound.external_id
      ? `${sound.source}:${sound.external_id}`
      : `${sound.title}:${sound.artist}`.toLowerCase();

    if (seen.has(key) || !sound.audio_url) continue;
    seen.add(key);
    out.push(sound);
  }

  return out;
}

module.exports = {
  getAppTrendingSounds,
  getLocalSounds,
  mapLocalSound,
  dedupeSounds,
};