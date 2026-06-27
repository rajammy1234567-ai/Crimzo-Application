const ReelSound = require('../models/ReelSound');

const DEFAULT_SOUNDS = [
  {
    title: 'Neon Nights',
    artist: 'Crimzo Beats',
    category: 'trending',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    title: 'Midnight Drive',
    artist: 'Crimzo Beats',
    category: 'trending',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    title: 'Summer Glow',
    artist: 'Crimzo Beats',
    category: 'pop',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    title: 'City Lights',
    artist: 'Crimzo Beats',
    category: 'hiphop',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    title: 'Chill Wave',
    artist: 'Crimzo Beats',
    category: 'chill',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    title: 'Dance Floor',
    artist: 'Crimzo Beats',
    category: 'dance',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    title: 'Golden Hour',
    artist: 'Crimzo Beats',
    category: 'trending',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    title: 'Retro Funk',
    artist: 'Crimzo Beats',
    category: 'retro',
    duration_ms: 180000,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
];

async function seedDefaultSounds() {
  const count = await ReelSound.countDocuments();
  if (count > 0) return;

  await ReelSound.insertMany(DEFAULT_SOUNDS);
  console.log(`✅ Seeded ${DEFAULT_SOUNDS.length} reel sounds`);
}

module.exports = { seedDefaultSounds, DEFAULT_SOUNDS };