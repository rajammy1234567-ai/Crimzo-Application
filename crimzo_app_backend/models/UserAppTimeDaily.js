const mongoose = require('mongoose');

const userAppTimeDailySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  total_seconds: { type: Number, default: 0 },
  breakdown: {
    home: { type: Number, default: 0 },
    reels: { type: Number, default: 0 },
    live: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    profile: { type: Number, default: 0 },
    pk: { type: Number, default: 0 },
    create: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
}, { timestamps: true });

userAppTimeDailySchema.index({ user_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('UserAppTimeDaily', userAppTimeDailySchema);