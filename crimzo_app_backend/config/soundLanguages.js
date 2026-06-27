/** Instagram-style language tabs for reel music */
const SOUND_LANGUAGES = [
  { code: 'all', label: 'All', emoji: '🌐', searchQuery: null },
  { code: 'hindi', label: 'Hindi', emoji: '🇮🇳', searchQuery: 'hindi bollywood desi' },
  { code: 'english', label: 'English', emoji: '🇺🇸', searchQuery: 'english pop' },
  { code: 'punjabi', label: 'Punjabi', emoji: '🎵', searchQuery: 'punjabi bhangra' },
  { code: 'tamil', label: 'Tamil', emoji: '🎶', searchQuery: 'tamil kollywood' },
  { code: 'telugu', label: 'Telugu', emoji: '🎵', searchQuery: 'telugu tollywood' },
  { code: 'bengali', label: 'Bengali', emoji: '🎶', searchQuery: 'bengali' },
  { code: 'marathi', label: 'Marathi', emoji: '🎵', searchQuery: 'marathi' },
  { code: 'kannada', label: 'Kannada', emoji: '🎶', searchQuery: 'kannada sandalwood' },
  { code: 'malayalam', label: 'Malayalam', emoji: '🎵', searchQuery: 'malayalam' },
  { code: 'urdu', label: 'Urdu', emoji: '🎶', searchQuery: 'urdu ghazal' },
  { code: 'spanish', label: 'Spanish', emoji: '🇪🇸', searchQuery: 'spanish reggaeton latin' },
  { code: 'korean', label: 'Korean', emoji: '🇰🇷', searchQuery: 'korean kpop' },
];

function getLanguageConfig(code) {
  const normalized = String(code || 'all').trim().toLowerCase();
  return SOUND_LANGUAGES.find((l) => l.code === normalized) || SOUND_LANGUAGES[0];
}

module.exports = { SOUND_LANGUAGES, getLanguageConfig };