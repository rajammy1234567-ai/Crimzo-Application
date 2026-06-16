const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  crimzo_id: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  username: { type: String, required: true, trim: true },
  avatar: { type: String, default: null },
  bio: { type: String, default: '' },
  country: { type: String, default: 'Unknown' },
  diamonds: { type: Number, default: 810 },
  beans: { type: Number, default: 0 },
  /** INR balance — user adds money here first, then buys diamonds/beans */
  wallet_balance: { type: Number, default: 0 },
  /** Verified payment method — bank or UPI (OTP verified before add money) */
  linked_bank: {
    type: { type: String, enum: ['bank', 'upi', 'card'], default: 'bank' },
    account_holder_name: { type: String },
    linked_phone: { type: String },
    bank_name: { type: String },
    account_number: { type: String },
    account_last4: { type: String },
    ifsc: { type: String },
    upi_id: { type: String },
    card_last4: { type: String },
    card_network: { type: String },
    razorpay_bank_code: { type: String },
    status: { type: String, enum: ['pending', 'verified'], default: 'pending' },
    verify_otp_hash: { type: String },
    verify_otp_expires: { type: Date },
    linked_at: { type: Date },
    verified_at: { type: Date },
  },
  followers_count: { type: Number, default: 0 },
  following_count: { type: Number, default: 0 },
  friends_count: { type: Number, default: 0 },
  is_online: { type: Boolean, default: false },
  status: { type: String, default: 'offline' }, // offline, online, live, pk_*, etc.
  is_banned: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Virtual for frontend-friendly id
userSchema.virtual('id').get(function() {
  return this._id.toString();
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
