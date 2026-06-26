const Sticker = require('../models/Sticker');
const { emitStickersUpdated } = require('./socketEmitter');

/** Premium sticker catalog — upserted on boot so prices & new gifts stay in sync. */
const PREMIUM_STICKERS = [
  // ── Love (5–20 diamonds) ──
  { name: 'Red Heart', emoji: '❤️', icon_name: 'heart', icon_color: '#FFFFFF', bg_color: '#FF2D55', category: 'love', price: 8, is_animated: false },
  { name: 'Sweet Kiss', emoji: '💋', icon_name: 'heart-half', icon_color: '#FFFFFF', bg_color: '#FF6B8A', category: 'love', price: 10, is_animated: false },
  { name: 'Love Eyes', emoji: '😍', icon_name: 'eye', icon_color: '#FFFFFF', bg_color: '#FF3B7A', category: 'love', price: 12, is_animated: true },
  { name: 'Rose Bloom', emoji: '🌹', icon_name: 'rose', icon_color: '#FFD700', bg_color: '#E91E63', category: 'love', price: 15, is_animated: true },
  { name: 'Love Wings', emoji: '💕', icon_name: 'heart-circle', icon_color: '#FFD700', bg_color: '#FF1493', category: 'love', price: 18, is_animated: true },
  { name: 'Angel Halo', emoji: '😇', icon_name: 'happy', icon_color: '#FFFFFF', bg_color: '#FF69B4', category: 'love', price: 20, is_animated: true },

  // ── Fun (8–25) ──
  { name: 'Thumbs Up', emoji: '👍', icon_name: 'thumbs-up', icon_color: '#FFFFFF', bg_color: '#4CAF50', category: 'fun', price: 8, is_animated: false },
  { name: 'Cool Shades', emoji: '😎', icon_name: 'glasses', icon_color: '#FFD700', bg_color: '#2196F3', category: 'fun', price: 10, is_animated: false },
  { name: 'Fire Blaze', emoji: '🔥', icon_name: 'flame', icon_color: '#FFD700', bg_color: '#FF5722', category: 'fun', price: 12, is_animated: true },
  { name: 'Lightning', emoji: '⚡', icon_name: 'flash', icon_color: '#FFFFFF', bg_color: '#FF9800', category: 'fun', price: 15, is_animated: true },
  { name: 'Rainbow Star', emoji: '🌈', icon_name: 'sparkles', icon_color: '#FFD700', bg_color: '#9C27B0', category: 'fun', price: 18, is_animated: true },
  { name: 'Laugh Riot', emoji: '🤣', icon_name: 'happy', icon_color: '#FFD700', bg_color: '#FF6F00', category: 'fun', price: 20, is_animated: true },
  { name: 'Mind Blown', emoji: '🤯', icon_name: 'nuclear', icon_color: '#FFF', bg_color: '#7C4DFF', category: 'fun', price: 25, is_animated: true },

  // ── Party (10–50) ──
  { name: 'Party Pop', emoji: '🎉', icon_name: 'bonfire', icon_color: '#FFFFFF', bg_color: '#9C27B0', category: 'party', price: 10, is_animated: true },
  { name: 'Confetti', emoji: '🎊', icon_name: 'color-wand', icon_color: '#FFD700', bg_color: '#E040FB', category: 'party', price: 15, is_animated: true },
  { name: 'Disco Ball', emoji: '🪩', icon_name: 'planet', icon_color: '#FFD700', bg_color: '#7C4DFF', category: 'party', price: 20, is_animated: true },
  { name: 'Champagne', emoji: '🍾', icon_name: 'wine', icon_color: '#FFD700', bg_color: '#00BCD4', category: 'party', price: 25, is_animated: true },
  { name: 'Fireworks', emoji: '🎆', icon_name: 'star-half', icon_color: '#FFD700', bg_color: '#311B92', category: 'party', price: 30, is_animated: true },
  { name: 'Neon Glow', emoji: '✨', icon_name: 'moon', icon_color: '#00FFFF', bg_color: '#0D47A1', category: 'party', price: 40, is_animated: true },
  { name: 'DJ Drop', emoji: '🎧', icon_name: 'headset', icon_color: '#FFF', bg_color: '#FF2D55', category: 'party', price: 50, is_animated: true },

  // ── VIP (50–500) ──
  { name: 'Royal Crown', emoji: '👑', icon_name: 'trophy', icon_color: '#FFD700', bg_color: '#B8860B', category: 'vip', price: 50, is_animated: true },
  { name: 'Gold Trophy', emoji: '🏆', icon_name: 'ribbon', icon_color: '#FFD700', bg_color: '#FF6F00', category: 'vip', price: 80, is_animated: true },
  { name: 'Blue Diamond', emoji: '💎', icon_name: 'diamond', icon_color: '#00BFFF', bg_color: '#1A237E', category: 'vip', price: 100, is_animated: true },
  { name: 'Space Rocket', emoji: '🚀', icon_name: 'rocket', icon_color: '#FF4444', bg_color: '#0D0D2B', category: 'vip', price: 150, is_animated: true },
  { name: 'Mega Star', emoji: '🌟', icon_name: 'star', icon_color: '#FFD700', bg_color: '#4A148C', category: 'vip', price: 200, is_animated: true },
  { name: 'Phoenix Rise', emoji: '🦅', icon_name: 'bonfire', icon_color: '#FF4444', bg_color: '#BF360C', category: 'vip', price: 300, is_animated: true },
  { name: 'Galaxy Rose', emoji: '🌺', icon_name: 'flower', icon_color: '#FF69B4', bg_color: '#1A1A2E', category: 'vip', price: 500, is_animated: true },

  // ── Elite — thousands tier ──
  { name: 'Golden Throne', emoji: '🪑', icon_name: 'diamond', icon_color: '#FFD700', bg_color: '#5D4037', category: 'vip', price: 1000, is_animated: true },
  { name: 'Ruby Heart', emoji: '❤️‍🔥', icon_name: 'heart', icon_color: '#FF1744', bg_color: '#880E4F', category: 'love', price: 2500, is_animated: true },
  { name: 'Crystal Castle', emoji: '🏰', icon_name: 'home', icon_color: '#E1F5FE', bg_color: '#01579B', category: 'vip', price: 5000, is_animated: true },
  { name: 'Dragon Fury', emoji: '🐉', icon_name: 'flame', icon_color: '#FF6D00', bg_color: '#1B0000', category: 'fun', price: 10000, is_animated: true },
  { name: 'Unicorn Magic', emoji: '🦄', icon_name: 'sparkles', icon_color: '#F8BBD0', bg_color: '#4A148C', category: 'party', price: 25000, is_animated: true },
  { name: 'Supernova', emoji: '💫', icon_name: 'planet', icon_color: '#FFF59D', bg_color: '#0D0D2B', category: 'vip', price: 50000, is_animated: true },

  // ── Legend — lakhs tier ──
  { name: 'Emperor Crown', emoji: '👑', icon_name: 'trophy', icon_color: '#FFD700', bg_color: '#FF6F00', category: 'vip', price: 100000, is_animated: true },
  { name: 'Diamond Rain', emoji: '💎', icon_name: 'diamond', icon_color: '#00E5FF', bg_color: '#0A0A20', category: 'vip', price: 250000, is_animated: true },
  { name: 'Cosmic Love', emoji: '🌌', icon_name: 'heart-circle', icon_color: '#E040FB', bg_color: '#1A0033', category: 'love', price: 500000, is_animated: true },
  { name: 'Crimzo Legend', emoji: '🔱', icon_name: 'flash', icon_color: '#FFD700', bg_color: '#FF2D55', category: 'vip', price: 1000000, is_animated: true },
];

async function seedPremiumStickers() {
  let changed = false;
  for (const sticker of PREMIUM_STICKERS) {
    const existing = await Sticker.findOne({ name: sticker.name });
    if (existing) {
      const needsUpdate = existing.price !== sticker.price
        || existing.emoji !== sticker.emoji
        || existing.icon_name !== sticker.icon_name
        || existing.category !== sticker.category
        || existing.is_animated !== sticker.is_animated;
      if (needsUpdate) {
        await Sticker.updateOne({ _id: existing._id }, { $set: sticker });
        changed = true;
      }
    } else {
      await Sticker.create(sticker);
      changed = true;
    }
  }
  if (changed) {
    emitStickersUpdated();
    console.log('✅ Premium stickers catalog synced (MongoDB)');
  }
}

module.exports = { PREMIUM_STICKERS, seedPremiumStickers };