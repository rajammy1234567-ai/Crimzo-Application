const SOUNDSTRIPE_API_BASE = (process.env.SOUNDSTRIPE_API_BASE || 'https://api.soundstripe.com').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 15000;
const SEARCH_POLL_MS = 900;
const SEARCH_MAX_POLLS = 20;

function isEnabled() {
  return !!process.env.SOUNDSTRIPE_API_KEY;
}

function mapSoundstripeSong(song, included = [], language = 'all') {
  const artists = included
    .filter((r) => r.type === 'artists')
    .map((r) => r.attributes?.name)
    .filter(Boolean);

  const audioFile = included.find((r) => r.type === 'audio_files' && r.attributes?.versions?.mp3);
  const mp3 = audioFile?.attributes?.versions?.mp3 || '';
  const durationSec = audioFile?.attributes?.duration || 0;
  const artistImage = included.find((r) => r.type === 'artists')?.attributes?.image || null;

  return {
    id: `soundstripe:${song.id}`,
    source: 'soundstripe',
    external_id: String(song.id),
    title: song.attributes?.title || 'Untitled',
    artist: artists[0] || 'Soundstripe',
    audio_url: mp3,
    cover_url: artistImage,
    duration_ms: Math.max(0, Math.round(durationSec * 1000)),
    category: (song.attributes?.tags?.genre?.[0] || 'trending').toLowerCase(),
    language,
    usage_count: 0,
    is_trending: true,
    is_licensed: true,
    reels_count: 0,
  };
}

async function soundstripeFetch(path, options = {}) {
  const apiKey = process.env.SOUNDSTRIPE_API_KEY;
  if (!apiKey) throw new Error('SOUNDSTRIPE_API_KEY is not configured');

  const url = `${SOUNDSTRIPE_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Token ${apiKey}`,
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Soundstripe ${res.status}: ${body.slice(0, 200)}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function songsFromIncluded(included = []) {
  return included.filter((r) => r.type === 'songs');
}

function relatedIncluded(song, included = []) {
  const artistIds = new Set((song.relationships?.artists?.data || []).map((a) => a.id));
  const audioIds = new Set((song.relationships?.audio_files?.data || []).map((a) => a.id));

  return [
    song,
    ...included.filter((r) => (
      (r.type === 'artists' && artistIds.has(r.id))
      || (r.type === 'audio_files' && audioIds.has(r.id))
    )),
  ];
}

async function getTrendingTracks(limit = 25, language = 'all') {
  const { getLanguageConfig } = require('../config/soundLanguages');
  const lang = getLanguageConfig(language);

  if (lang.code !== 'all' && lang.searchQuery) {
    return searchTracks(lang.searchQuery, limit, lang.code);
  }

  const payload = await soundstripeFetch(
    '/v1/playlists?filter[media_type]=songs&page[size]=5&include=songs,songs.audio_files,songs.artists',
  );

  const playlists = Array.isArray(payload?.data) ? payload.data : [];
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const songs = songsFromIncluded(included).slice(0, limit);

  return songs.map((song) => mapSoundstripeSong(song, relatedIncluded(song, included), 'all'));
}

async function pollSupeSearch(searchId) {
  for (let i = 0; i < SEARCH_MAX_POLLS; i += 1) {
    try {
      const payload = await soundstripeFetch(`/v1/supe/search/${searchId}`);
      if (payload?.data?.attributes?.status === 'completed') return payload;
      if (payload?.data?.attributes?.status === 'failed') {
        throw new Error('Soundstripe search failed');
      }
    } catch (err) {
      if (!String(err.message).includes('404')) throw err;
    }
    await new Promise((r) => setTimeout(r, SEARCH_POLL_MS));
  }
  throw new Error('Soundstripe search timed out');
}

async function searchTracks(query, limit = 30, language = 'all') {
  const q = String(query || '').trim();
  if (!q) return [];

  const callbackBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const callbackUrl = callbackBase.startsWith('https://')
    ? `${callbackBase}/api/sounds/webhooks/soundstripe`
    : 'https://example.com/webhooks/soundstripe';

  const created = await soundstripeFetch('/v1/supe/search', {
    method: 'POST',
    body: {
      data: {
        type: 'supe_searches',
        attributes: {
          query: q,
          callback_url: callbackUrl,
        },
      },
    },
  });

  let payload = created;
  if (created?.data?.attributes?.status === 'processing' && created?.data?.id) {
    payload = await pollSupeSearch(created.data.id);
  }

  const included = Array.isArray(payload?.included) ? payload.included : [];
  const songRefs = payload?.data?.relationships?.songs?.data || [];
  const songs = songRefs
    .map((ref) => included.find((r) => r.type === 'songs' && r.id === ref.id))
    .filter(Boolean)
    .slice(0, limit);

  return songs.map((song) => mapSoundstripeSong(song, included, language));
}

async function getTrackStreamUrl(songId) {
  const payload = await soundstripeFetch(`/v1/songs/${songId}`);
  const included = [
    ...(Array.isArray(payload?.included) ? payload.included : []),
    payload?.data,
  ].filter(Boolean);

  const song = payload?.data;
  if (!song) return null;

  const mapped = mapSoundstripeSong(song, included);
  if (!mapped.audio_url) return null;

  return {
    audio_url: mapped.audio_url,
    title: mapped.title,
    artist: mapped.artist,
    cover_url: mapped.cover_url,
    duration_ms: mapped.duration_ms,
  };
}

module.exports = {
  isEnabled,
  mapSoundstripeSong,
  getTrendingTracks,
  searchTracks,
  getTrackStreamUrl,
};