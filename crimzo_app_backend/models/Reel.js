const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  video_url: { type: String, required: true },
  thumbnail_url: { type: String },
  caption: { type: String, default: '' },
  likes_count: { type: Number, default: 0 },
  views_count: { type: Number, default: 0 },
  comments_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

reelSchema.virtual('id').get(function() { return this._id.toString(); });
reelSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('Reel', reelSchema);
