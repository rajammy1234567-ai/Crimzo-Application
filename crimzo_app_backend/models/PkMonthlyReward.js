const mongoose = require('mongoose');

const pkMonthlyRewardSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  winner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  winner_username: { type: String },
  wins: { type: Number, default: 0 },
  total_score: { type: Number, default: 0 },
  diamonds_awarded: { type: Number, default: 0 },
  announced_at: { type: Date, default: Date.now },
}, { timestamps: false });

module.exports = mongoose.model('PkMonthlyReward', pkMonthlyRewardSchema);