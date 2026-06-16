const mongoose = require('mongoose');
const Sticker = require('../models/Sticker');

// MongoDB connection (supports local for dev + Atlas for prod)
async function connectDB() {
  let uri = process.env.MONGO_URI || '';

  const looksInvalid = !uri || uri.includes('<') || uri.includes('your_') || uri.trim() === '' || uri.includes('crimzo01.jggyacm.mongodb.net/?');

  if (looksInvalid) {
    uri = 'mongodb://localhost:27017/crimzo';
    console.log('ℹ️  Using LOCAL MongoDB by default: mongodb://localhost:27017/crimzo');
    console.log('   To use Atlas instead: uncomment/edit MONGO_URI in .env (and add /crimzo to path)');
  } else if (uri.includes('mongodb+srv')) {
    console.log('✅ Using MongoDB Atlas (cloud)');
  } else {
    console.log('✅ Using local/custom MongoDB URI');
  }

  mongoose.set('strictQuery', false);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  console.log(`✅ Connected to MongoDB: ${uri.includes('mongodb+srv') ? 'Atlas' : uri}`);

  // Proper connection event listeners
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
  });
}

// Initialize collections (indexes via models) + seed default stickers
async function initDatabase() {
  try {
    // Ensure models are registered (importing them does)
    require('../models/User');
    require('../models/LiveSession');
    require('../models/PKBattle');
    require('../models/Reel');
    require('../models/ReelLike');
    require('../models/ReelComment');
    require('../models/Story');
    require('../models/Follow');
    require('../models/Sticker');
    require('../models/UserSticker');
    require('../models/GiftHistory');
    require('../models/Message');

    // Seed premium stickers if none with icons
    const stickerCount = await Sticker.countDocuments({ icon_name: { $ne: null } });
    if (stickerCount === 0) {
      console.log('🎨 Seeding premium stickers catalog (MongoDB)...');
      await Sticker.deleteMany({});

      const stickers = [
        { name: 'Red Heart', emoji: '❤', icon_name: 'heart', icon_color: '#FFFFFF', bg_color: '#FF2D55', category: 'love', price: 5, is_animated: false },
        { name: 'Sweet Kiss', emoji: '💋', icon_name: 'lips', icon_color: '#FFFFFF', bg_color: '#FF6B8A', category: 'love', price: 8, is_animated: false },
        { name: 'Love Eyes', emoji: '😍', icon_name: 'eye', icon_color: '#FFFFFF', bg_color: '#FF3B7A', category: 'love', price: 10, is_animated: false },
        { name: 'Rose', emoji: '🌹', icon_name: 'rose', icon_color: '#FFD700', bg_color: '#E91E63', category: 'love', price: 15, is_animated: true },
        { name: 'Love Wings', emoji: '💕', icon_name: 'heart-half', icon_color: '#FFD700', bg_color: '#FF1493', category: 'love', price: 20, is_animated: true },
        { name: 'Angel Ring', emoji: '😇', icon_name: 'happy', icon_color: '#FFFFFF', bg_color: '#FF69B4', category: 'love', price: 25, is_animated: true },
        { name: 'Thumbs Up', emoji: '👍', icon_name: 'thumbs-up', icon_color: '#FFFFFF', bg_color: '#4CAF50', category: 'fun', price: 5, is_animated: false },
        { name: 'Cool Shades', emoji: '😎', icon_name: 'glasses', icon_color: '#FFD700', bg_color: '#2196F3', category: 'fun', price: 8, is_animated: false },
        { name: 'Fire Blaze', emoji: '🔥', icon_name: 'flame', icon_color: '#FFD700', bg_color: '#FF5722', category: 'fun', price: 10, is_animated: true },
        { name: 'Lightning', emoji: '⚡', icon_name: 'flash', icon_color: '#FFFFFF', bg_color: '#FF9800', category: 'fun', price: 12, is_animated: true },
        { name: 'Bomb', emoji: '💣', icon_name: 'skull', icon_color: '#FF4444', bg_color: '#1A1A2E', category: 'fun', price: 15, is_animated: true },
        { name: 'Rainbow Star', emoji: '🌈', icon_name: 'sparkles', icon_color: '#FFD700', bg_color: '#9C27B0', category: 'fun', price: 18, is_animated: true },
        { name: 'Party Hat', emoji: '🎉', icon_name: 'bonfire', icon_color: '#FFFFFF', bg_color: '#9C27B0', category: 'party', price: 10, is_animated: true },
        { name: 'Confetti Pop', emoji: '🎊', icon_name: 'color-wand', icon_color: '#FFD700', bg_color: '#E040FB', category: 'party', price: 12, is_animated: true },
        { name: 'Disco Ball', emoji: '🪩', icon_name: 'planet', icon_color: '#FFD700', bg_color: '#7C4DFF', category: 'party', price: 15, is_animated: true },
        { name: 'Champagne', emoji: '🍾', icon_name: 'wine', icon_color: '#FFD700', bg_color: '#00BCD4', category: 'party', price: 20, is_animated: true },
        { name: 'Firework Sky', emoji: '🎆', icon_name: 'star-half', icon_color: '#FFD700', bg_color: '#311B92', category: 'party', price: 25, is_animated: true },
        { name: 'Neon Glow', emoji: '✨', icon_name: 'moon', icon_color: '#00FFFF', bg_color: '#0D47A1', category: 'party', price: 30, is_animated: true },
        { name: 'Royal Crown', emoji: '👑', icon_name: 'trophy', icon_color: '#FFD700', bg_color: '#B8860B', category: 'vip', price: 30, is_animated: true },
        { name: 'Blue Diamond', emoji: '💎', icon_name: 'diamond', icon_color: '#00BFFF', bg_color: '#1A237E', category: 'vip', price: 50, is_animated: true },
        { name: 'Gold Trophy', emoji: '🏆', icon_name: 'ribbon', icon_color: '#FFD700', bg_color: '#FF6F00', category: 'vip', price: 40, is_animated: true },
        { name: 'Space Rocket', emoji: '🚀', icon_name: 'rocket', icon_color: '#FF4444', bg_color: '#0D0D2B', category: 'vip', price: 60, is_animated: true },
        { name: 'Mega Star', emoji: '🌟', icon_name: 'star', icon_color: '#FFD700', bg_color: '#4A148C', category: 'vip', price: 80, is_animated: true },
        { name: 'Phoenix', emoji: '🦅', icon_name: 'bonfire', icon_color: '#FF4444', bg_color: '#BF360C', category: 'vip', price: 100, is_animated: true },
        { name: 'Galaxy Rose', emoji: '🌺', icon_name: 'flower', icon_color: '#FF69B4', bg_color: '#1A1A2E', category: 'vip', price: 150, is_animated: true },
        { name: 'Thunder God', emoji: '⚡', icon_name: 'thunderstorm', icon_color: '#FFD700', bg_color: '#0D0D2B', category: 'vip', price: 200, is_animated: true },
      ];

      await Sticker.insertMany(stickers);
      console.log('✅ Premium stickers seeded successfully (MongoDB)');
    }

    console.log('✅ Database (MongoDB) initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = { connectDB, initDatabase, mongoose };
