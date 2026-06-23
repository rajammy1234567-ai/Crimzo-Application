const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount_inr: { type: Number, required: true },
  beans_used: { type: Number, default: 0 },
  diamonds_deducted: { type: Number, default: 0 },
  beans_deducted: { type: Number, default: 0 },
  balance_refunded: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  payout_method: { type: String }, // bank | upi
  payout_display: { type: String },
  payout_mode: { type: String, enum: ['manual', 'razorpay'], default: 'manual' },
  payout_snapshot: {
    type: { type: String },
    account_holder_name: { type: String },
    account_number: { type: String },
    account_last4: { type: String },
    ifsc: { type: String },
    bank_name: { type: String },
    upi_id: { type: String },
    linked_phone: { type: String },
  },
  admin_note: { type: String },
  processed_by: { type: String },
  razorpay_payout_id: { type: String, index: true, sparse: true },
  razorpay_fund_account_id: { type: String },
  razorpay_status: { type: String },
  razorpay_mode: { type: String },
  idempotency_key: { type: String },
  utr: { type: String },
  failure_reason: { type: String },
  beans_refunded: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date },
});

module.exports = mongoose.model('WithdrawalRequest', withdrawalSchema);