const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel_name: { type: String, required: true },
  agora_token: { type: String },
  session_type: { type: String, enum: ['single', 'pk_battle'], default: 'single' },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  viewers_count: { type: Number, default: 0 },
  location: { type: String },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date },
}, { timestamps: false });

liveSessionSchema.virtual('id').get(function() { return this._id.toString(); });
liveSessionSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
