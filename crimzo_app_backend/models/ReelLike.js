const mongoose = require('mongoose');

const reelLikeSchema = new mongoose.Schema({
  reel_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

reelLikeSchema.index({ reel_id: 1, user_id: 1 }, { unique: true });

reelLikeSchema.virtual('id').get(function() { return this._id.toString(); });
reelLikeSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('ReelLike', reelLikeSchema);
