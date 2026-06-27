const ReelSound = require('../models/ReelSound');

const DEFAULT_SOUNDS = [
  { title: 'Bollywood Beats', artist: 'Crimzo India', language: 'hindi', category: 'trending', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { title: 'Desi Vibes', artist: 'Crimzo India', language: 'hindi', category: 'pop', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { title: 'Punjabi Energy', artist: 'Crimzo Beats', language: 'punjabi', category: 'dance', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { title: 'Tamil Groove', artist: 'Crimzo South', language: 'tamil', category: 'trending', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { title: 'Telugu Flow', artist: 'Crimzo South', language: 'telugu', category: 'pop', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { title: 'English Pop Hit', artist: 'Crimzo Global', language: 'english', category: 'pop', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { title: 'Bengali Melody', artist: 'Crimzo East', language: 'bengali', category: 'chill', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { title: 'Marathi Rhythm', artist: 'Crimzo West', language: 'marathi', category: 'trending', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { title: 'K-Pop Style', artist: 'Crimzo Global', language: 'korean', category: 'dance', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { title: 'Latin Heat', artist: 'Crimzo Global', language: 'spanish', category: 'dance', duration_ms: 180000, audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
];

async function seedDefaultSounds() {
  const count = await ReelSound.countDocuments();
  if (count === 0) {
    await ReelSound.insertMany(DEFAULT_SOUNDS.map((s) => ({ ...s, source: 'crimzo' })));
    console.log(`✅ Seeded ${DEFAULT_SOUNDS.length} reel sounds`);
    return;
  }

  // Backfill language on older seeds
  await ReelSound.updateMany(
    { language: { $exists: false } },
    { $set: { language: 'all', source: 'crimzo' } },
  );
}

module.exports = { seedDefaultSounds, DEFAULT_SOUNDS };