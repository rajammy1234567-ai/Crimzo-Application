const mongoose = require('mongoose');

const reelViewSchema = new mongoose.Schema({
  reel_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

reelViewSchema.index({ reel_id: 1, user_id: 1 }, { unique: true });

reelViewSchema.virtual('id').get(function () { return this._id.toString(); });
reelViewSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('ReelView', reelViewSchema);