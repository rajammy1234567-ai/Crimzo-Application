const PaymentOrder = require('../models/PaymentOrder');
const WithdrawalRequest = require('../models/WithdrawalRequest');

function paymentMethodLabel(method) {
  const labels = {
    razorpay: 'Razorpay',
    wallet_balance: 'Wallet balance',
    dev_mock: 'Test payment',
    linked_bank: 'Linked bank',
    withdrawal: 'Withdrawal',
  };
  return labels[method] || method || 'Payment';
}

function mapOrderTransaction(order) {
  if (!order || order.product_type === 'wallet_withdrawal') return null;

  const id = order._id.toString();
  const createdAt = order.paid_at || order.created_at;
  const amountInr = Number(order.amount_inr) || 0;
  const payLabel = paymentMethodLabel(order.payment_method);

  if (order.product_type === 'wallet_topup') {
    return {
      id: `order_${id}`,
      category: 'deposit',
      type: 'wallet_topup',
      direction: 'credit',
      amountInr,
      title: 'Added to Wallet',
      subtitle: payLabel,
      status: 'completed',
      paymentMethod: order.payment_method,
      createdAt,
    };
  }

  if (order.product_type === 'diamonds') {
    return {
      id: `order_${id}`,
      category: 'deposit',
      type: 'diamond_purchase',
      direction: 'credit',
      amountInr,
      diamonds: order.diamonds || 0,
      title: 'Diamond Purchase',
      subtitle: `+${(order.diamonds || 0).toLocaleString('en-IN')} diamonds · ${payLabel}`,
      status: 'completed',
      paymentMethod: order.payment_method,
      createdAt,
    };
  }

  if (order.product_type === 'beans') {
    return {
      id: `order_${id}`,
      category: 'deposit',
      type: 'bean_purchase',
      direction: 'credit',
      amountInr,
      beans: order.beans || 0,
      title: 'Bean Purchase',
      subtitle: `+${(order.beans || 0).toLocaleString('en-IN')} beans · ${payLabel}`,
      status: 'completed',
      paymentMethod: order.payment_method,
      createdAt,
    };
  }

  return null;
}

function mapWithdrawalTransaction(row) {
  const status = row.status || 'pending';
  return {
    id: `withdraw_${row._id}`,
    category: 'withdraw',
    type: 'withdraw',
    direction: 'debit',
    amountInr: Number(row.amount_inr) || 0,
    beans: row.beans_used || 0,
    title: 'Withdrawal',
    subtitle: row.payout_display || row.payout_method || 'Bank / UPI',
    status,
    payoutDisplay: row.payout_display || null,
    payoutMethod: row.payout_method || null,
    scheduledCreditDate: row.scheduled_credit_date || null,
    utr: row.utr || null,
    failureReason: row.failure_reason || null,
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
  };
}

function buildTransactionSummary(orders, withdrawals) {
  const totalDeposited = orders
    .filter((o) => o.product_type === 'wallet_topup')
    .reduce((sum, o) => sum + (Number(o.amount_inr) || 0), 0);
  const totalPurchased = orders
    .filter((o) => ['diamonds', 'beans'].includes(o.product_type))
    .reduce((sum, o) => sum + (Number(o.amount_inr) || 0), 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'completed')
    .reduce((sum, w) => sum + (Number(w.amount_inr) || 0), 0);
  const pendingWithdrawn = withdrawals
    .filter((w) => ['pending', 'processing'].includes(w.status))
    .reduce((sum, w) => sum + (Number(w.amount_inr) || 0), 0);

  return {
    totalDeposited,
    totalPurchased,
    totalWithdrawn,
    pendingWithdrawn,
    depositCount: orders.filter((o) => o.product_type === 'wallet_topup').length,
    purchaseCount: orders.filter((o) => ['diamonds', 'beans'].includes(o.product_type)).length,
    withdrawCount: withdrawals.length,
  };
}

async function fetchUserTransactionHistory(userId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const [orders, withdrawals] = await Promise.all([
    PaymentOrder.find({
      user_id: userId,
      status: { $in: ['paid', 'dev_mock'] },
      product_type: { $ne: 'wallet_withdrawal' },
    })
      .sort({ paid_at: -1, created_at: -1 })
      .limit(safeLimit)
      .lean(),
    WithdrawalRequest.find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(safeLimit)
      .lean(),
  ]);

  const transactions = [
    ...orders.map(mapOrderTransaction).filter(Boolean),
    ...withdrawals.map(mapWithdrawalTransaction),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, safeLimit);

  return {
    transactions,
    summary: buildTransactionSummary(orders, withdrawals),
  };
}

module.exports = {
  paymentMethodLabel,
  mapOrderTransaction,
  mapWithdrawalTransaction,
  buildTransactionSummary,
  fetchUserTransactionHistory,
};