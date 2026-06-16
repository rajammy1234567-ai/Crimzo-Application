const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  follower_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  following_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

followSchema.virtual('id').get(function() { return this._id.toString(); });
followSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('Follow', followSchema);
