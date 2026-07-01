const mongoose = require('mongoose');

const reelSoundSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  artist: { type: String, default: 'Unknown', trim: true },
  audio_url: { type: String, required: true },
  cover_url: { type: String },
  duration_ms: { type: Number, default: 0 },
  category: { type: String, default: 'trending', trim: true },
  // track_language — NOT "language" (reserved by MongoDB text indexes)
  track_language: { type: String, default: 'all', trim: true, lowercase: true },
  source: { type: String, default: 'crimzo', trim: true },
  external_id: { type: String },
  usage_count: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

reelSoundSchema.index({ is_active: 1, category: 1 });
reelSoundSchema.index({ is_active: 1, track_language: 1, usage_count: -1 });
reelSoundSchema.index({ title: 'text', artist: 'text' });

reelSoundSchema.virtual('id').get(function () { return this._id.toString(); });
reelSoundSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_d, r) => { delete r._id; return r; },
});

module.exports = mongoose.model('ReelSound', reelSoundSchema);