const AUDIUS_HOSTS = [
  process.env.AUDIUS_API_HOST,
  'https://discoveryprovider.audius.co',
  'https://discovery-3.audius.co',
  'https://discovery-4.audius.co',
].filter(Boolean);

const REQUEST_TIMEOUT_MS = 9000;

async function audiusFetch(path, params = {}) {
  let lastError = null;

  for (const host of AUDIUS_HOSTS) {
    try {
      const url = new URL(`${host.replace(/\/$/, '')}/v1${path}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = new Error(`Audius ${res.status} @ ${host}`);
        continue;
      }

      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Audius unavailable');
}

function pickArtwork(track) {
  const art = track?.artwork;
  if (!art) return null;
  return art['150x150'] || art['480x480'] || art['1000x1000'] || null;
}

function mapAudiusTrack(track, language = 'all') {
  const streamUrl = track?.stream?.url || track?.stream?.mirrors?.[0] || '';
  const artist = track?.user?.name || track?.user?.handle || 'Unknown Artist';

  return {
    id: `audius:${track.id}`,
    source: 'audius',
    external_id: String(track.id),
    title: track.title || 'Untitled',
    artist,
    audio_url: streamUrl,
    cover_url: pickArtwork(track),
    duration_ms: Math.max(0, (track.duration || 0) * 1000),
    category: (track.genre || 'trending').toLowerCase(),
    language,
    usage_count: track.play_count || 0,
    is_trending: true,
    reels_count: 0,
  };
}

async function getTrendingTracks(limit = 25, language = 'all') {
  const { getLanguageConfig } = require('../config/soundLanguages');
  const lang = getLanguageConfig(language);

  if (lang.code !== 'all' && lang.searchQuery) {
    return searchTracks(lang.searchQuery, limit, lang.code);
  }

  const payload = await audiusFetch('/tracks/trending', { limit });
  const tracks = Array.isArray(payload?.data) ? payload.data : [];
  return tracks.map((t) => mapAudiusTrack(t, 'all'));
}

async function searchTracks(query, limit = 30, language = 'all') {
  const q = String(query || '').trim();
  if (!q) return [];

  const payload = await audiusFetch('/tracks/search', { query: q, limit });
  const tracks = Array.isArray(payload?.data) ? payload.data : [];
  return tracks
    .filter((t) => t?.is_streamable !== false && (t?.stream?.url || t?.stream?.mirrors?.length))
    .map((t) => mapAudiusTrack(t, language));
}

async function getTrackStreamUrl(trackId) {
  const payload = await audiusFetch(`/tracks/${trackId}`);
  const track = payload?.data;
  if (!track) return null;

  return {
    audio_url: track.stream?.url || track.stream?.mirrors?.[0] || null,
    title: track.title,
    artist: track.user?.name || track.user?.handle,
    cover_url: pickArtwork(track),
    duration_ms: Math.max(0, (track.duration || 0) * 1000),
  };
}

module.exports = {
  getTrendingTracks,
  searchTracks,
  getTrackStreamUrl,
  mapAudiusTrack,
};