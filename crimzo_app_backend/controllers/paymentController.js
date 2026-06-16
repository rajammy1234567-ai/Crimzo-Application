const crypto = require('crypto');
const User = require('../models/User');
const PaymentOrder = require('../models/PaymentOrder');
const {
  DIAMOND_PACKAGES,
  BEAN_PACKAGES,
  getDiamondPackage,
  getBeanPackage,
} = require('../config/diamondPackages');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const {
  TOPUP_PRESETS,
  MIN_TOPUP_INR,
  MAX_TOPUP_INR,
  MIN_WITHDRAW_INR,
  MAX_WITHDRAW_INR,
} = require('../config/walletConfig');
const {
  isRazorpayConfigured,
  getRazorpayClient,
  getRazorpayStatus,
} = require('../config/razorpay');
const {
  normalizeIfsc,
  isValidIfsc,
  resolveBankFromIfsc,
  maskAccountNumber,
  isValidUpi,
} = require('../config/bankCodes');
const {
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  sendPaymentVerificationEmail,
  isOtpValid,
  DEV_OTP,
} = require('../utils/paymentOtp');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function isPaymentVerified(linked) {
  if (!linked || linked.status !== 'verified') return false;
  if (linked.type === 'upi') return !!linked.upi_id;
  if (linked.type === 'card') return !!linked.account_holder_name;
  return !!(linked.account_last4 && linked.ifsc && linked.linked_phone);
}

function formatPaymentMethod(linked) {
  if (!linked?.account_holder_name && !linked?.upi_id && !linked?.account_last4 && linked?.type !== 'card') {
    return null;
  }

  const base = {
    type: linked.type || (linked.upi_id && !linked.account_last4 ? 'upi' : 'bank'),
    status: linked.status || 'pending',
    account_holder_name: linked.account_holder_name || null,
    linked_phone: linked.linked_phone ? `******${linked.linked_phone.slice(-4)}` : null,
    linked_at: linked.linked_at,
    verified_at: linked.verified_at || null,
  };

  if (base.type === 'upi') {
    return {
      ...base,
      upi_id: linked.upi_id || null,
      display: linked.upi_id ? `UPI · ${linked.upi_id}` : 'UPI (pending)',
    };
  }

  if (base.type === 'card') {
    return {
      ...base,
      card_last4: linked.card_last4 || null,
      card_network: linked.card_network || null,
      display: linked.card_last4
        ? `Card · ${linked.card_network || 'Card'} •••• ${linked.card_last4}`
        : 'Card (pay via Razorpay)',
    };
  }

  return {
    ...base,
    bank_name: linked.bank_name || null,
    account_last4: linked.account_last4 || null,
    ifsc: linked.ifsc || null,
    upi_id: linked.upi_id || null,
    razorpay_bank_code: linked.razorpay_bank_code || null,
    display: linked.bank_name && linked.account_last4
      ? `${linked.bank_name} · •••• ${linked.account_last4}`
      : 'Bank account (pending)',
  };
}

/** @deprecated alias */
function formatLinkedBank(linked) {
  return formatPaymentMethod(linked);
}

function resolvePackage(productType, packageId) {
  if (productType === 'beans') return getBeanPackage(packageId);
  if (productType === 'diamonds') return getDiamondPackage(packageId);
  return null;
}

exports.getPaymentStatus = (_req, res) => {
  const status = getRazorpayStatus();
  res.json({
    success: true,
    razorpayEnabled: status.configured,
    devMockEnabled: status.devMockEnabled,
    mode: status.mode,
    keyType: status.keyType,
    environment: process.env.NODE_ENV || 'development',
  });
};

exports.getLinkedBank = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('linked_bank email');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const method = formatPaymentMethod(user.linked_bank);
    res.json({
      success: true,
      linked: method,
      paymentMethod: method,
      hasLinkedBank: isPaymentVerified(user.linked_bank),
      hasVerifiedPayment: isPaymentVerified(user.linked_bank),
      isPendingVerification: user.linked_bank?.status === 'pending',
    });
  } catch (error) {
    console.error('Get payment method error:', error);
    res.status(500).json({ error: 'Failed to get payment method' });
  }
};

/** Step A: User enters bank OR UPI → we send OTP to verify ownership */
exports.setupPaymentMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const rawType = req.body.type;
    const payType = rawType === 'upi' ? 'upi' : rawType === 'card' ? 'card' : 'bank';
    const holder = String(req.body.account_holder_name || '').trim();
    const linkedPhone = normalizePhone(req.body.linked_phone);

    if (holder.length < 2) {
      return res.status(400).json({ error: 'Enter name as per bank/UPI/card records' });
    }

    const userDoc = await User.findById(userId).select('email username');
    if (!userDoc) return res.status(404).json({ error: 'User not found' });

    let linked = {
      type: payType,
      account_holder_name: holder,
      status: 'pending',
      linked_at: new Date(),
      verified_at: null,
    };

    let methodLabel = '';
    let phoneForOtp = null;

    if (payType === 'upi') {
      const upiId = String(req.body.upi_id || '').trim().toLowerCase();
      if (!isValidUpi(upiId)) {
        return res.status(400).json({ error: 'Invalid UPI ID (e.g. yourname@paytm)' });
      }
      if (linkedPhone.length !== 10) {
        return res.status(400).json({ error: 'Enter 10-digit mobile linked to UPI' });
      }
      linked.upi_id = upiId;
      linked.linked_phone = linkedPhone;
      phoneForOtp = linkedPhone;
      methodLabel = `UPI ${upiId}`;
    } else if (payType === 'card') {
      if (linkedPhone.length !== 10) {
        return res.status(400).json({ error: 'Enter 10-digit mobile linked to card' });
      }
      linked.linked_phone = linkedPhone;
      phoneForOtp = linkedPhone;
      methodLabel = `Card for ${holder}`;
    } else {
      const accountNumber = String(req.body.account_number || '').replace(/\D/g, '');
      const ifsc = normalizeIfsc(req.body.ifsc);
      if (accountNumber.length < 9 || accountNumber.length > 18) {
        return res.status(400).json({ error: 'Account number must be 9–18 digits' });
      }
      if (!isValidIfsc(ifsc)) {
        return res.status(400).json({ error: 'Invalid IFSC code' });
      }
      if (linkedPhone.length !== 10) {
        return res.status(400).json({ error: 'Enter bank-linked 10-digit mobile number' });
      }
      const bank = resolveBankFromIfsc(ifsc);
      linked = {
        ...linked,
        bank_name: bank.name,
        account_number: accountNumber,
        account_last4: accountNumber.slice(-4),
        ifsc,
        linked_phone: linkedPhone,
        razorpay_bank_code: bank.razorpay,
      };
      phoneForOtp = linkedPhone;
      methodLabel = `${bank.name} •••• ${linked.account_last4}`;
    }

    const otp = generateOtp();
    linked.verify_otp_hash = hashOtp(otp);
    linked.verify_otp_expires = new Date(Date.now() + OTP_TTL_MS);

    const user = await User.findByIdAndUpdate(userId, { linked_bank: linked }, { new: true })
      .select('linked_bank email');

    const mail = await sendPaymentVerificationEmail({
      email: user.email,
      username: userDoc.username,
      otp,
      methodLabel,
      phone: phoneForOtp,
    });

    res.json({
      success: true,
      message: phoneForOtp
        ? 'OTP sent to linked mobile & email'
        : 'OTP sent to your registered email',
      paymentMethod: formatPaymentMethod(user.linked_bank),
      otpSent: mail.sent,
      emailMasked: user.email.replace(/(.{2}).+(@.+)/, '$1***$2'),
      phoneMasked: phoneForOtp ? `******${phoneForOtp.slice(-4)}` : null,
      devHint: process.env.NODE_ENV !== 'production'
        ? `Test OTP: ${DEV_OTP} (check backend console for phone OTP)`
        : undefined,
    });
  } catch (error) {
    console.error('Setup payment method error:', error);
    res.status(500).json({ error: 'Failed to setup payment method', details: error.message });
  }
};

/** Step B: Verify OTP → payment method active */
exports.verifyPaymentMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const otp = String(req.body.otp || '').trim();

    const user = await User.findById(userId).select('linked_bank');
    if (!user?.linked_bank) {
      return res.status(400).json({ error: 'No payment method to verify. Setup first.' });
    }

    const { verify_otp_hash, verify_otp_expires } = user.linked_bank;
    if (!isOtpValid(verify_otp_hash, verify_otp_expires, otp)) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.linked_bank.status = 'verified';
    user.linked_bank.verified_at = new Date();
    user.linked_bank.verify_otp_hash = undefined;
    user.linked_bank.verify_otp_expires = undefined;
    await user.save();

    const method = formatPaymentMethod(user.linked_bank);
    res.json({
      success: true,
      message: 'Payment method verified successfully',
      paymentMethod: method,
      linked: method,
      hasVerifiedPayment: true,
    });
  } catch (error) {
    console.error('Verify payment method error:', error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
  }
};

exports.resendPaymentOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('linked_bank email username');
    if (!user?.linked_bank || user.linked_bank.status === 'verified') {
      return res.status(400).json({ error: 'Nothing to verify' });
    }

    const otp = generateOtp();
    user.linked_bank.verify_otp_hash = hashOtp(otp);
    user.linked_bank.verify_otp_expires = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    const method = formatPaymentMethod(user.linked_bank);
    const methodLabel = method?.type === 'upi'
      ? `UPI ${user.linked_bank.upi_id}`
      : `${user.linked_bank.bank_name} •••• ${user.linked_bank.account_last4}`;

    const mail = await sendPaymentVerificationEmail({
      email: user.email,
      username: user.username,
      otp,
      methodLabel,
    });

    res.json({
      success: true,
      message: 'OTP resent',
      otpSent: mail.sent,
      devHint: process.env.NODE_ENV !== 'production' ? `Test OTP: ${DEV_OTP}` : undefined,
    });
  } catch (error) {
    console.error('Resend payment OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

/** Legacy — redirects to setup flow */
exports.linkBank = exports.setupPaymentMethod;

exports.unlinkBank = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: { linked_bank: 1 } });
    res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    console.error('Unlink payment method error:', error);
    res.status(500).json({ error: 'Failed to remove payment method' });
  }
};

exports.getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('wallet_balance diamonds beans username email linked_bank');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      success: true,
      wallet_balance: user.wallet_balance || 0,
      diamonds: user.diamonds || 0,
      beans: user.beans || 0,
      topupPresets: TOPUP_PRESETS,
      razorpayEnabled: isRazorpayConfigured(),
      devMockEnabled: process.env.NODE_ENV !== 'production' && !isRazorpayConfigured(),
      linkedBank: formatPaymentMethod(user.linked_bank),
      paymentMethod: formatPaymentMethod(user.linked_bank),
      hasLinkedBank: isPaymentVerified(user.linked_bank),
      hasVerifiedPayment: isPaymentVerified(user.linked_bank),
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
};

exports.getPackages = async (_req, res) => {
  res.json({
    success: true,
    diamonds: DIAMOND_PACKAGES,
    beans: BEAN_PACKAGES,
    topupPresets: TOPUP_PRESETS,
    razorpayEnabled: isRazorpayConfigured(),
    devMockEnabled: process.env.NODE_ENV !== 'production' && !isRazorpayConfigured(),
  });
};

/** Step 1: Debit linked bank → credit app wallet (Razorpay routes money in production) */
exports.createTopupOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const amountInr = Number(req.body.amount);

    if (!Number.isFinite(amountInr) || amountInr < MIN_TOPUP_INR || amountInr > MAX_TOPUP_INR) {
      return res.status(400).json({
        error: `Amount must be between ₹${MIN_TOPUP_INR} and ₹${MAX_TOPUP_INR.toLocaleString('en-IN')}`,
      });
    }

    const amountPaise = Math.round(amountInr * 100);
    const razorpay = getRazorpayClient();
    const user = await User.findById(userId)
      .select('email username wallet_balance linked_bank')
      .lean();

    const linked = formatPaymentMethod(user?.linked_bank);
    if (!isPaymentVerified(user?.linked_bank)) {
      return res.status(400).json({
        error: 'Verify your bank or UPI first',
        code: 'PAYMENT_NOT_VERIFIED',
      });
    }

    const payType = user?.linked_bank?.type || 'bank';
    const debitLabel = payType === 'upi'
      ? `Pay ₹${amountInr.toLocaleString('en-IN')} via UPI (${user.linked_bank.upi_id})`
      : payType === 'card'
        ? `Pay ₹${amountInr.toLocaleString('en-IN')} via Card`
        : `Debit ₹${amountInr.toLocaleString('en-IN')} from ${linked.bank_name} •••• ${linked.account_last4}`;
    const checkoutUser = {
      email: user?.email || '',
      name: linked.account_holder_name || user?.username || 'Crimzo User',
    };
    const paymentPrefs = {
      method: payType === 'upi' ? 'upi' : payType === 'card' ? 'card' : 'netbanking',
      upi_vpa: payType === 'upi' ? user.linked_bank.upi_id : null,
      bank_code: payType === 'bank' ? (user?.linked_bank?.razorpay_bank_code || null) : null,
      showAllMethods: true,
    };

    if (!razorpay) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Payment gateway not configured' });
      }

      const mockOrderId = `dev_topup_${userId}_${Date.now()}`;
      const order = await PaymentOrder.create({
        user_id: userId,
        product_type: 'wallet_topup',
        amount_inr: amountInr,
        amount_paise: amountPaise,
        razorpay_order_id: mockOrderId,
        status: 'created',
        payment_method: 'linked_bank',
      });

      return res.json({
        success: true,
        mode: 'dev_mock',
        orderId: order._id.toString(),
        amount: amountPaise,
        amountInr,
        currency: 'INR',
        packageName: debitLabel,
        linkedBank: linked,
        paymentPrefs,
        user: checkoutUser,
      });
    }

    const receipt = `topup_${userId}_${Date.now()}`.slice(0, 40);
    const rzOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: String(userId),
        type: 'wallet_topup',
        amountInr: String(amountInr),
        bank: linked.bank_name,
        account_last4: linked.account_last4,
      },
    });

    const order = await PaymentOrder.create({
      user_id: userId,
      product_type: 'wallet_topup',
      amount_inr: amountInr,
      amount_paise: amountPaise,
      razorpay_order_id: rzOrder.id,
      status: 'created',
      payment_method: 'linked_bank',
    });

    res.json({
      success: true,
      mode: 'razorpay',
      orderId: order._id.toString(),
      razorpayOrderId: rzOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: amountPaise,
      amountInr,
      currency: 'INR',
      packageName: debitLabel,
      linkedBank: linked,
      paymentPrefs,
      user: checkoutUser,
    });
  } catch (error) {
    console.error('Create topup order error:', error);
    res.status(500).json({ error: 'Failed to create top-up order', details: error.message });
  }
};

async function creditWalletFromOrder(order) {
  const user = await User.findByIdAndUpdate(
    order.user_id,
    { $inc: { wallet_balance: order.amount_inr } },
    { new: true },
  ).select('wallet_balance diamonds beans');
  return user;
}

/** Verify Razorpay payment → credit wallet balance */
exports.verifyTopup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, devMock } = req.body;

    const order = await PaymentOrder.findOne({
      _id: orderId,
      user_id: userId,
      product_type: 'wallet_topup',
    });
    if (!order) return res.status(404).json({ error: 'Top-up order not found' });

    if (order.status === 'paid' || order.status === 'dev_mock') {
      const user = await User.findById(userId).select('wallet_balance diamonds beans');
      return res.json({
        success: true,
        alreadyProcessed: true,
        wallet_balance: user?.wallet_balance || 0,
        diamonds: user?.diamonds || 0,
        beans: user?.beans || 0,
        creditedInr: order.amount_inr,
      });
    }

    if (devMock && (order.payment_method === 'dev_mock' || order.payment_method === 'linked_bank')) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Dev mock disabled in production' });
      }
      order.status = 'dev_mock';
      order.paid_at = new Date();
      order.razorpay_payment_id = `dev_pay_${Date.now()}`;
      await order.save();

      const user = await creditWalletFromOrder(order);
      return res.json({
        success: true,
        mode: 'dev_mock',
        wallet_balance: user.wallet_balance,
        diamonds: user.diamonds,
        beans: user.beans,
        creditedInr: order.amount_inr,
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(503).json({ error: 'Payment gateway not configured' });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }
    if (order.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order ID mismatch' });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      order.status = 'failed';
      await order.save();
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    order.status = 'paid';
    order.razorpay_payment_id = razorpay_payment_id;
    order.razorpay_signature = razorpay_signature;
    order.paid_at = new Date();
    await order.save();

    const user = await creditWalletFromOrder(order);
    res.json({
      success: true,
      mode: 'razorpay',
      wallet_balance: user.wallet_balance,
      diamonds: user.diamonds,
      beans: user.beans,
      creditedInr: order.amount_inr,
    });
  } catch (error) {
    console.error('Verify topup error:', error);
    res.status(500).json({ error: 'Top-up verification failed', details: error.message });
  }
};

/** Step 2: Buy diamonds/beans using wallet balance (no gateway) */
exports.purchaseWithWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packageId, productType = 'diamonds' } = req.body;

    if (!['diamonds', 'beans'].includes(productType)) {
      return res.status(400).json({ error: 'Invalid product type' });
    }

    const pkg = resolvePackage(productType, packageId);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const price = pkg.price;
    const diamonds = productType === 'diamonds' ? pkg.diamonds : 0;
    const beans = productType === 'beans' ? pkg.beans : 0;

    const inc = { wallet_balance: -price };
    if (diamonds > 0) inc.diamonds = diamonds;
    if (beans > 0) inc.beans = beans;

    const user = await User.findOneAndUpdate(
      { _id: userId, wallet_balance: { $gte: price } },
      { $inc: inc },
      { new: true },
    ).select('wallet_balance diamonds beans');

    if (!user) {
      const current = await User.findById(userId).select('wallet_balance');
      return res.status(400).json({
        error: 'Insufficient wallet balance',
        required: price,
        available: current?.wallet_balance || 0,
        shortfall: price - (current?.wallet_balance || 0),
      });
    }

    await PaymentOrder.create({
      user_id: userId,
      product_type: productType,
      package_id: pkg.id,
      amount_inr: price,
      diamonds,
      beans,
      status: 'paid',
      payment_method: 'wallet_balance',
      paid_at: new Date(),
    });

    res.json({
      success: true,
      wallet_balance: user.wallet_balance,
      diamonds: user.diamonds,
      beans: user.beans,
      spentInr: price,
      credited: productType === 'diamonds' ? diamonds : beans,
      productType,
    });
  } catch (error) {
    console.error('Wallet purchase error:', error);
    res.status(500).json({ error: 'Purchase failed', details: error.message });
  }
};

exports.getWithdrawInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('wallet_balance linked_bank');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const method = formatPaymentMethod(user.linked_bank);
    res.json({
      success: true,
      wallet_balance: user.wallet_balance || 0,
      minWithdraw: MIN_WITHDRAW_INR,
      maxWithdraw: MAX_WITHDRAW_INR,
      canWithdraw: isPaymentVerified(user.linked_bank) && (user.wallet_balance || 0) >= MIN_WITHDRAW_INR,
      paymentMethod: method,
      hasVerifiedPayment: isPaymentVerified(user.linked_bank),
    });
  } catch (error) {
    console.error('Get withdraw info error:', error);
    res.status(500).json({ error: 'Failed to get withdraw info' });
  }
};

exports.requestWithdraw = async (req, res) => {
  try {
    const userId = req.user.id;
    const amountInr = Number(req.body.amount);

    if (!Number.isFinite(amountInr) || amountInr < MIN_WITHDRAW_INR) {
      return res.status(400).json({
        error: `Minimum withdrawal is ₹${MIN_WITHDRAW_INR}`,
        minWithdraw: MIN_WITHDRAW_INR,
      });
    }
    if (amountInr > MAX_WITHDRAW_INR) {
      return res.status(400).json({ error: `Maximum withdrawal is ₹${MAX_WITHDRAW_INR.toLocaleString('en-IN')}` });
    }

    const user = await User.findById(userId).select('wallet_balance linked_bank');
    if (!isPaymentVerified(user?.linked_bank)) {
      return res.status(400).json({ error: 'Verify bank/UPI/card first', code: 'PAYMENT_NOT_VERIFIED' });
    }

    const method = formatPaymentMethod(user.linked_bank);
    const updated = await User.findOneAndUpdate(
      { _id: userId, wallet_balance: { $gte: amountInr } },
      { $inc: { wallet_balance: -amountInr } },
      { new: true },
    ).select('wallet_balance');

    if (!updated) {
      return res.status(400).json({
        error: 'Insufficient wallet balance',
        minWithdraw: MIN_WITHDRAW_INR,
        available: user?.wallet_balance || 0,
      });
    }

    const isDev = process.env.NODE_ENV !== 'production' && !isRazorpayConfigured();
    const withdrawal = await WithdrawalRequest.create({
      user_id: userId,
      amount_inr: amountInr,
      status: isDev ? 'completed' : 'processing',
      payout_method: user.linked_bank.type,
      payout_display: method?.display,
      completed_at: isDev ? new Date() : null,
    });

    await PaymentOrder.create({
      user_id: userId,
      product_type: 'wallet_withdrawal',
      amount_inr: amountInr,
      status: 'paid',
      payment_method: 'withdrawal',
      paid_at: new Date(),
    });

    res.json({
      success: true,
      wallet_balance: updated.wallet_balance,
      withdrawn: amountInr,
      withdrawalId: withdrawal._id.toString(),
      status: withdrawal.status,
      message: isDev
        ? `₹${amountInr.toLocaleString('en-IN')} sent to ${method?.display} (test mode)`
        : `₹${amountInr.toLocaleString('en-IN')} withdrawal initiated — 1–3 business days`,
      payoutTo: method?.display,
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({ error: 'Withdrawal failed', details: error.message });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await PaymentOrder.find({
      user_id: userId,
      status: { $in: ['paid', 'dev_mock'] },
    })
      .sort({ paid_at: -1, created_at: -1 })
      .limit(40)
      .lean();

    res.json({ success: true, orders });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};