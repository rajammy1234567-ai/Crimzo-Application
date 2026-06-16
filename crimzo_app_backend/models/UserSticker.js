const mongoose = require('mongoose');

const userStickerSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sticker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sticker', required: true },
  purchased_at: { type: Date, default: Date.now },
}, { timestamps: false });

userStickerSchema.index({ user_id: 1, sticker_id: 1 }, { unique: true });

userStickerSchema.virtual('id').get(function() { return this._id.toString(); });
userStickerSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('UserSticker', userStickerSchema);
