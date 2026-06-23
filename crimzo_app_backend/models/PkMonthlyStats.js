const mongoose = require('mongoose');

const pkMonthlyStatsSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  wins: { type: Number, default: 0 },
  total_score: { type: Number, default: 0 },
  battles_played: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
}, { timestamps: false });

pkMonthlyStatsSchema.index({ user_id: 1, month: 1 }, { unique: true });
pkMonthlyStatsSchema.index({ month: 1, wins: -1, total_score: -1 });

module.exports = mongoose.model('PkMonthlyStats', pkMonthlyStatsSchema);