const EPIDEMIC_API_BASE = (process.env.EPIDEMIC_SOUND_API_BASE || 'https://partner-content-api.epidemicsound.com/v0').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 12000;

function isEnabled() {
  return !!process.env.EPIDEMIC_SOUND_API_KEY;
}

function pickCover(images) {
  if (!images) return null;
  return images.S || images.default || images.M || images.XS || null;
}

function mapEpidemicTrack(track, language = 'all') {
  const artists = [
    ...(track.mainArtists || []),
    ...(track.featuredArtists || []),
  ].filter(Boolean);

  return {
    id: `epidemic:${track.id}`,
    source: 'epidemic',
    external_id: String(track.id),
    title: track.title || 'Untitled',
    artist: artists.join(', ') || 'Epidemic Sound',
    audio_url: '',
    cover_url: pickCover(track.images),
    duration_ms: Math.max(0, track.length || 0),
    category: (track.genres?.[0]?.name || 'trending').toLowerCase(),
    language,
    usage_count: 0,
    is_trending: true,
    is_licensed: true,
    reels_count: 0,
  };
}

async function epidemicFetch(path, params = {}, userId = null) {
  const apiKey = process.env.EPIDEMIC_SOUND_API_KEY;
  if (!apiKey) throw new Error('EPIDEMIC_SOUND_API_KEY is not configured');

  const url = new URL(`${EPIDEMIC_API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
      return;
    }
    url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (userId) headers['x-partner-user-id'] = String(userId);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Epidemic Sound ${res.status}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getTrendingTracks(limit = 25, language = 'all', userId = null) {
  const { getLanguageConfig } = require('../config/soundLanguages');
  const lang = getLanguageConfig(language);

  if (lang.code !== 'all' && lang.searchQuery) {
    return searchTracks(lang.searchQuery, limit, lang.code, userId);
  }

  const payload = await epidemicFetch('/tracks/search', {
    term: 'trending popular upbeat',
    sort: 'Popularity',
    order: 'desc',
    limit: Math.min(limit, 60),
  }, userId);

  const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  return tracks.map((t) => mapEpidemicTrack(t, 'all'));
}

async function searchTracks(query, limit = 30, language = 'all', userId = null) {
  const q = String(query || '').trim();
  if (!q) return [];

  const payload = await epidemicFetch('/tracks/search', {
    term: q,
    sort: 'Relevance',
    order: 'desc',
    limit: Math.min(limit, 60),
  }, userId);

  const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  return tracks.map((t) => mapEpidemicTrack(t, language));
}

/** MP3 download URL — best compatibility with expo-av preview */
async function getTrackPlaybackUrl(trackId, userId = null) {
  const payload = await epidemicFetch(`/tracks/${trackId}/download`, {
    format: 'mp3',
    quality: 'normal',
  }, userId);

  if (!payload?.url) return null;

  return {
    audio_url: payload.url,
    expires: payload.expires || null,
    format: 'mp3',
  };
}

async function getTrackStreamUrl(trackId, userId = null) {
  const download = await getTrackPlaybackUrl(trackId, userId);
  if (download?.audio_url) return download;

  const payload = await epidemicFetch(`/tracks/${trackId}/stream`, {}, userId);
  if (!payload?.url) return null;

  return {
    audio_url: payload.url,
    expires: payload.expires || null,
    format: 'hls',
  };
}

async function reportTrackExported(trackId, userId, platform = 'other') {
  if (!isEnabled() || !trackId || !userId) return;

  try {
    const apiKey = process.env.EPIDEMIC_SOUND_API_KEY;
    const res = await fetch(`${EPIDEMIC_API_BASE}/analytics/report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{
          userId: String(userId),
          timestamp: new Date().toISOString(),
          userConnected: false,
          analyticsEvent: {
            trackId: String(trackId),
            type: 'trackDownloaded',
            format: 'mp3',
            quality: 'normal',
            platform: platform === 'instagram' ? 'Instagram' : 'other',
          },
        }],
      }),
    });
    if (!res.ok) {
      console.warn('Epidemic usage report failed:', res.status);
    }
  } catch (err) {
    console.warn('Epidemic usage report error:', err.message);
  }
}

module.exports = {
  isEnabled,
  mapEpidemicTrack,
  getTrendingTracks,
  searchTracks,
  getTrackStreamUrl,
  getTrackPlaybackUrl,
  reportTrackExported,
};