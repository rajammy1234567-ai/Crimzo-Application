const mongoose = require('mongoose');

const reelCommentSchema = new mongoose.Schema({
  reel_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

reelCommentSchema.virtual('id').get(function() { return this._id.toString(); });
reelCommentSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('ReelComment', reelCommentSchema);
