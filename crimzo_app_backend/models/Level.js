const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  level_number: { type: Number, required: true, unique: true, min: 1 },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price_diamonds: { type: Number, default: 0, min: 0 },
  showcase_type: {
    type: String,
    enum: ['scooter', 'bike', 'car', 'rath', 'supercar', 'yacht', 'jet', 'throne'],
    default: 'scooter',
  },
  showcase_emoji: { type: String, default: '🛵' },
  showcase_image_url: { type: String, default: null },
  /** Bundled 3D model key, e.g. golf_gti → assets/models/golf_gti/ */
  showcase_model_key: { type: String, default: null },
  icon_name: { type: String, default: 'star' },
  badge_color: { type: String, default: '#FF2D55' },
  is_default: { type: Boolean, default: false },
  sort_order: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

levelSchema.virtual('id').get(function () {
  return this._id.toString();
});

levelSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Level', levelSchema);