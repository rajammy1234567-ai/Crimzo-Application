const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referred_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    referral_code: { type: String, required: true },
    reward_inr: { type: Number, required: true },
    reward_diamonds: { type: Number, required: true },
    status: { type: String, enum: ['completed', 'reversed'], default: 'completed' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

referralSchema.virtual('id').get(function id() {
  return this._id.toString();
});

referralSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Referral', referralSchema);