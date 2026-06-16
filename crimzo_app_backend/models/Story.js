const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  media_url: { type: String, required: true },
  media_type: { type: String, enum: ['photo', 'video'], default: 'photo' },
  caption: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
}, { timestamps: false });

// MongoDB auto-deletes stories after expires_at (24h TTL)
storySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

storySchema.virtual('id').get(function() { return this._id.toString(); });
storySchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('Story', storySchema);
