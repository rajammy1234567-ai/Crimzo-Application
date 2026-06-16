const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  message_type: { type: String, enum: ['text', 'gift'], default: 'text' },
  gift_diamonds: { type: Number, default: 0 },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

messageSchema.virtual('id').get(function() { return this._id.toString(); });
messageSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('Message', messageSchema);
