const mongoose = require('mongoose');

const paymentOrderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** wallet_topup = add INR via gateway; diamonds/beans = bought using wallet balance */
  product_type: { type: String, enum: ['wallet_topup', 'wallet_withdrawal', 'diamonds', 'beans'], required: true },
  package_id: { type: Number, default: null },
  amount_inr: { type: Number, required: true },
  amount_paise: { type: Number, default: 0 },
  diamonds: { type: Number, default: 0 },
  beans: { type: Number, default: 0 },
  razorpay_order_id: { type: String, index: true, sparse: true },
  razorpay_payment_id: { type: String },
  razorpay_signature: { type: String },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed', 'dev_mock'],
    default: 'created',
  },
  payment_method: { type: String, default: 'razorpay' }, // razorpay | dev_mock | wallet_balance | linked_bank | withdrawal
  created_at: { type: Date, default: Date.now },
  paid_at: { type: Date },
});

paymentOrderSchema.index(
  { razorpay_payment_id: 1 },
  { unique: true, partialFilterExpression: { razorpay_payment_id: { $type: 'string' } } },
);

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);