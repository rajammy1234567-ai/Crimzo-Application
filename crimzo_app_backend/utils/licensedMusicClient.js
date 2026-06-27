const epidemic = require('./epidemicSoundClient');
const soundstripe = require('./soundstripeClient');
const audius = require('./audiusClient');

const PROVIDERS = {
  epidemic,
  soundstripe,
  audius,
};

function resolveProviderName() {
  const preferred = String(process.env.LICENSED_MUSIC_PROVIDER || 'epidemic').trim().toLowerCase();

  if (preferred === 'soundstripe' && soundstripe.isEnabled()) return 'soundstripe';
  if (preferred === 'epidemic' && epidemic.isEnabled()) return 'epidemic';
  if (preferred === 'audius' && process.env.AUDIUS_ENABLED !== 'false') return 'audius';

  if (epidemic.isEnabled()) return 'epidemic';
  if (soundstripe.isEnabled()) return 'soundstripe';
  if (process.env.AUDIUS_ENABLED !== 'false') return 'audius';

  return null;
}

function getProvider() {
  const name = resolveProviderName();
  return name ? { name, client: PROVIDERS[name] } : null;
}

function isLicensedProvider(name) {
  return name === 'epidemic' || name === 'soundstripe';
}

async function fetchCatalog({ tab, language, q, limit, userId }) {
  const provider = getProvider();
  if (!provider) return { sounds: [], provider: null };

  const { name, client } = provider;
  const search = q && String(q).trim() ? String(q).trim() : '';

  try {
    let sounds = [];
    if (search) {
      sounds = await client.searchTracks(search, limit, language, userId);
    } else if (tab === 'trending') {
      sounds = await client.getTrendingTracks(limit, language, userId);
    } else {
      const { getLanguageConfig } = require('../config/soundLanguages');
      const lang = getLanguageConfig(language);
      if (lang.code !== 'all' && lang.searchQuery) {
        sounds = await client.searchTracks(lang.searchQuery, limit, lang.code, userId);
      } else {
        sounds = await client.getTrendingTracks(limit, language, userId);
      }
    }

    return { sounds, provider: name };
  } catch (error) {
    console.warn(`Licensed catalog fetch failed (${name}):`, error.message);
    return { sounds: [], provider: name };
  }
}

async function resolveStream(source, id, userId = null) {
  if (source === 'epidemic' && epidemic.isEnabled()) {
    const stream = await epidemic.getTrackStreamUrl(id, userId);
    if (!stream?.audio_url) return null;
    return { ...stream, source: 'epidemic', external_id: String(id) };
  }

  if (source === 'soundstripe' && soundstripe.isEnabled()) {
    const stream = await soundstripe.getTrackStreamUrl(id);
    if (!stream?.audio_url) return null;
    return { ...stream, source: 'soundstripe', external_id: String(id) };
  }

  if (source === 'audius' && process.env.AUDIUS_ENABLED !== 'false') {
    const stream = await audius.getTrackStreamUrl(id);
    if (!stream?.audio_url) return null;
    return { ...stream, source: 'audius', external_id: String(id) };
  }

  return null;
}

async function reportUsage(source, trackId, userId, platform = 'other') {
  if (source === 'epidemic') {
    await epidemic.reportTrackExported(trackId, userId, platform);
  }
}

module.exports = {
  getProvider,
  resolveProviderName,
  isLicensedProvider,
  fetchCatalog,
  resolveStream,
  reportUsage,
};