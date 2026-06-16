const mongoose = require('mongoose');

const followRequestSchema = new mongoose.Schema({
  requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  target_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

followRequestSchema.index({ requester_id: 1, target_id: 1 }, { unique: true });
followRequestSchema.index({ target_id: 1, status: 1 });

followRequestSchema.virtual('id').get(function () { return this._id.toString(); });
followRequestSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_d, r) => { delete r._id; return r; },
});

module.exports = mongoose.model('FollowRequest', followRequestSchema);