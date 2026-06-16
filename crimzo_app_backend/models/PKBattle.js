const mongoose = require('mongoose');

const pkBattleSchema = new mongoose.Schema({
  battle_id: { type: String, required: true, unique: true },
  host1_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  host2_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  channel_name: { type: String, required: true },
  host1_score: { type: Number, default: 0 },
  host2_score: { type: Number, default: 0 },
  status: { type: String, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
  winner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  viewers_count: { type: Number, default: 0 },
  duration: { type: Number, default: 300 },
  created_at: { type: Date, default: Date.now },
  ended_at: { type: Date },
}, { timestamps: false });

pkBattleSchema.virtual('id').get(function() { return this._id.toString(); });
pkBattleSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('PKBattle', pkBattleSchema);
