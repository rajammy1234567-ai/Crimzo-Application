const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount_inr: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  payout_method: { type: String }, // bank | upi | card
  payout_display: { type: String },
  failure_reason: { type: String },
  created_at: { type: Date, default: Date.now },
  completed_at: { type: Date },
});

module.exports = mongoose.model('WithdrawalRequest', withdrawalSchema);