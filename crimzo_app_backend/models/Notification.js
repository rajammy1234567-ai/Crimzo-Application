const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['follow_request', 'follow_accepted', 'follow_rejected', 'message', 'gift', 'system'],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actor_username: { type: String, default: null },
  actor_avatar: { type: String, default: null },
  reference_id: { type: String, default: null },
  is_read: { type: Boolean, default: false, index: true },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

notificationSchema.virtual('id').get(function () { return this._id.toString(); });
notificationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_d, r) => { delete r._id; return r; },
});

module.exports = mongoose.model('Notification', notificationSchema);