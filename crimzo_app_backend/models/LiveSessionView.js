const mongoose = require('mongoose');

const liveSessionViewSchema = new mongoose.Schema({
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

liveSessionViewSchema.index({ session_id: 1, user_id: 1 }, { unique: true });

liveSessionViewSchema.virtual('id').get(function () { return this._id.toString(); });
liveSessionViewSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('LiveSessionView', liveSessionViewSchema);