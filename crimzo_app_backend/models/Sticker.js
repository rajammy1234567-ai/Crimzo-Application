const mongoose = require('mongoose');

const stickerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  emoji: { type: String, required: true },
  icon_name: { type: String, default: null },
  icon_color: { type: String, default: '#FFFFFF' },
  bg_color: { type: String, default: '#FF2D55' },
  category: { type: String, default: 'fun' },
  price: { type: Number, default: 10 },
  is_animated: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { timestamps: false });

stickerSchema.virtual('id').get(function() { return this._id.toString(); });
stickerSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { delete r._id; return r; } });

module.exports = mongoose.model('Sticker', stickerSchema);
