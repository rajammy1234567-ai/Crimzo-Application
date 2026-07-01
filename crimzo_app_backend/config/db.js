const mongoose = require('mongoose');

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
    require('../models/PkMonthlyStats');
    require('../models/PkMonthlyReward');
    require('../models/Reel');
    require('../models/ReelSound');
    require('../models/ReelLike');
    require('../models/ReelComment');
    require('../models/Story');
    require('../models/Follow');
    require('../models/Sticker');
    require('../models/UserSticker');
    require('../models/GiftHistory');
    require('../models/Message');
    require('../models/Level');

    const { seedPremiumStickers } = require('../utils/stickerSeed');
    await seedPremiumStickers();

    const { seedDefaultLevels } = require('../utils/levelSeed');
    await seedDefaultLevels();

    const { seedDefaultTasks } = require('../utils/taskSeed');
    await seedDefaultTasks();

    const { seedDefaultSounds } = require('../utils/soundSeed');
    await seedDefaultSounds();

    console.log('✅ Database (MongoDB) initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = { connectDB, initDatabase, mongoose };
