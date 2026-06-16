const mongoose = require('mongoose');

const giftHistorySchema = new mongoose.Schema({
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sticker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sticker' }, // can be null
  diamonds_spent: { type: Number, default: 0 },
  beans_earned: { type: Number, default: 0 },
  session_id: { type: String },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

giftHistorySchema.virtual('id').get(function() { return this._id.toString(); });
giftHistorySchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('GiftHistory', giftHistorySchema);
