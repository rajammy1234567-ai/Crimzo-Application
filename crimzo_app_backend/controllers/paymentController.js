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
  BEANS_PER_INR,
  MIN_WITHDRAW_BEANS,
} = require('../config/walletConfig');
function notifyPurchaseTasks(userId, { diamonds = 0, topup = false } = {}) {
  if (!userId) return;
  if (diamonds <= 0 && !topup) return;
  const { recordTaskAction } = require('../utils/taskProgress');
  void recordTaskAction(userId, 'buy_diamonds', 1).catch(() => {});
}

const {
  diamondsToBeans,
  beansToInr,
  inrToBeans,
  totalWithdrawableBeans,
  beanTiers,
  deductBeansForWithdraw,
} = require('../utils/beanConversion');
const {
  isRazorpayConfigured,
  getRazorpayClient,
  getRazorpayStatus,
} = require('../config/razorpay');
const {
  isPayoutConfigured,
  getPayoutStatus,
  ensurePayoutDestination,
  createPayout,
  mapRazorpayPayoutStatus,
  verifyWebhookSignature,
} = require('../utils/razorpayPayout');
const {
  refundWithdrawalBalance,
  buildPayoutSnapshot,
  isManualWithdrawalMode,
  isWithdrawalDayAllowed,
  getNextWithdrawalDate,
  WITHDRAW_DAY_OF_MONTH,
} = require('../utils/withdrawalHelpers');
const { v4: uuidv4 } = require('uuid');
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

/** Withdrawals only go to verified bank account or UPI — not phone or card */
function isWithdrawablePayment(linked) {
  if (!linked || linked.status !== 'verified') return false;
  if (linked.type === 'upi') return !!linked.upi_id;
  if (linked.type === 'bank') {
    return !!(linked.account_number && linked.ifsc && linked.account_holder_name);
  }
  return false;
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
  const payout = getPayoutStatus();
  res.json({
    success: true,
    razorpayEnabled: status.configured,
    payoutEnabled: payout.configured,
    manualPayoutMode: isManualWithdrawalMode(),
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
      linked.razorpay_contact_id = undefined;
      linked.razorpay_fund_account_id = undefined;
      linked.payout_destination_key = undefined;
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
        razorpay_contact_id: undefined,
        razorpay_fund_account_id: undefined,
        payout_destination_key: undefined,
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

/** Razorpay — buy diamonds/beans directly (no wallet balance needed) */
exports.createPackageOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packageId, productType = 'diamonds' } = req.body;

    if (!['diamonds', 'beans'].includes(productType)) {
      return res.status(400).json({ error: 'Invalid product type' });
    }

    const pkg = resolvePackage(productType, packageId);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const amountInr = pkg.price;
    const amountPaise = Math.round(amountInr * 100);
    const diamonds = productType === 'diamonds' ? pkg.diamonds : 0;
    const beans = productType === 'beans' ? pkg.beans : 0;
    const packageName = productType === 'diamonds'
      ? `${diamonds.toLocaleString('en-IN')} Diamonds`
      : `${beans.toLocaleString('en-IN')} Beans`;

    const razorpay = getRazorpayClient();
    const user = await User.findById(userId).select('email username').lean();
    const checkoutUser = {
      email: user?.email || '',
      name: user?.username || 'Crimzo User',
    };
    const paymentPrefs = { method: 'card', showAllMethods: true };

    if (!razorpay) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Payment gateway not configured' });
      }

      const mockOrderId = `dev_pkg_${userId}_${Date.now()}`;
      const order = await PaymentOrder.create({
        user_id: userId,
        product_type: productType,
        package_id: pkg.id,
        amount_inr: amountInr,
        amount_paise: amountPaise,
        diamonds,
        beans,
        razorpay_order_id: mockOrderId,
        status: 'created',
        payment_method: 'razorpay',
      });

      return res.json({
        success: true,
        mode: 'dev_mock',
        orderId: order._id.toString(),
        amount: amountPaise,
        amountInr,
        currency: 'INR',
        packageName,
        diamonds,
        beans,
        productType,
        paymentPrefs,
        user: checkoutUser,
      });
    }

    const receipt = `${productType}_${userId}_${Date.now()}`.slice(0, 40);
    const rzOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: String(userId),
        type: productType,
        packageId: String(pkg.id),
      },
    });

    const order = await PaymentOrder.create({
      user_id: userId,
      product_type: productType,
      package_id: pkg.id,
      amount_inr: amountInr,
      amount_paise: amountPaise,
      diamonds,
      beans,
      razorpay_order_id: rzOrder.id,
      status: 'created',
      payment_method: 'razorpay',
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
      packageName,
      diamonds,
      beans,
      productType,
      paymentPrefs,
      user: checkoutUser,
    });
  } catch (error) {
    console.error('Create package order error:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
};

/** Verify Razorpay package payment → credit diamonds/beans */
exports.verifyPackagePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, devMock } = req.body;

    const order = await PaymentOrder.findOne({
      _id: orderId,
      user_id: userId,
      product_type: { $in: ['diamonds', 'beans'] },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'paid' || order.status === 'dev_mock') {
      const user = await User.findById(userId).select('wallet_balance diamonds beans');
      return res.json({
        success: true,
        alreadyProcessed: true,
        wallet_balance: user?.wallet_balance || 0,
        diamonds: user?.diamonds || 0,
        beans: user?.beans || 0,
        credited: order.product_type === 'diamonds' ? order.diamonds : order.beans,
        productType: order.product_type,
      });
    }

    if (devMock) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Dev mock disabled in production' });
      }
      order.status = 'dev_mock';
      order.paid_at = new Date();
      order.razorpay_payment_id = `dev_pay_${Date.now()}`;
      await order.save();

      const inc = {};
      if (order.diamonds > 0) inc.diamonds = order.diamonds;
      if (order.beans > 0) inc.beans = order.beans;
      const user = await User.findByIdAndUpdate(userId, { $inc: inc }, { new: true })
        .select('wallet_balance diamonds beans');
      notifyPurchaseTasks(userId, { diamonds: order.diamonds || 0 });

      return res.json({
        success: true,
        mode: 'dev_mock',
        wallet_balance: user.wallet_balance,
        diamonds: user.diamonds,
        beans: user.beans,
        credited: order.product_type === 'diamonds' ? order.diamonds : order.beans,
        productType: order.product_type,
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

    const inc = {};
    if (order.diamonds > 0) inc.diamonds = order.diamonds;
    if (order.beans > 0) inc.beans = order.beans;
    const user = await User.findByIdAndUpdate(userId, { $inc: inc }, { new: true })
      .select('wallet_balance diamonds beans');
    notifyPurchaseTasks(userId, { diamonds: order.diamonds || 0 });

    res.json({
      success: true,
      mode: 'razorpay',
      wallet_balance: user.wallet_balance,
      diamonds: user.diamonds,
      beans: user.beans,
      credited: order.product_type === 'diamonds' ? order.diamonds : order.beans,
      productType: order.product_type,
    });
  } catch (error) {
    console.error('Verify package payment error:', error);
    res.status(500).json({ error: 'Payment verification failed', details: error.message });
  }
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
    const hasVerified = isPaymentVerified(user?.linked_bank);
    const payType = hasVerified ? (user?.linked_bank?.type || 'bank') : 'card';

    const debitLabel = hasVerified
      ? (payType === 'upi'
        ? `Pay ₹${amountInr.toLocaleString('en-IN')} via UPI (${user.linked_bank.upi_id})`
        : payType === 'card'
          ? `Pay ₹${amountInr.toLocaleString('en-IN')} via Card`
          : `Debit ₹${amountInr.toLocaleString('en-IN')} from ${linked?.bank_name} •••• ${linked?.account_last4}`)
      : `Add ₹${amountInr.toLocaleString('en-IN')} to Crimzo Wallet`;

    const checkoutUser = {
      email: user?.email || '',
      name: (hasVerified && linked?.account_holder_name) || user?.username || 'Crimzo User',
    };
    const paymentPrefs = {
      method: payType === 'upi' ? 'upi' : payType === 'card' ? 'card' : 'netbanking',
      upi_vpa: hasVerified && payType === 'upi' ? user.linked_bank.upi_id : null,
      bank_code: hasVerified && payType === 'bank' ? (user?.linked_bank?.razorpay_bank_code || null) : null,
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
        bank: linked?.bank_name || '',
        account_last4: linked?.account_last4 || '',
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
      notifyPurchaseTasks(userId, { topup: true });
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
    notifyPurchaseTasks(userId, { topup: true });
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

    notifyPurchaseTasks(userId, { diamonds, topup: productType === 'diamonds' });

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
    const user = await User.findById(req.user.id).select('diamonds beans linked_bank');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const method = formatPaymentMethod(user.linked_bank);
    const diamonds = user.diamonds || 0;
    const beans = user.beans || 0;
    const diamondsAsBeans = diamondsToBeans(diamonds);
    const totalBeans = totalWithdrawableBeans(diamonds, beans);
    const withdrawableInr = beansToInr(totalBeans);
    const withdrawDayAllowed = isWithdrawalDayAllowed();
    const nextWithdrawDay = getNextWithdrawalDate();
    res.json({
      success: true,
      diamonds,
      beans,
      diamondsAsBeans,
      totalBeans,
      withdrawableInr,
      beansPerInr: BEANS_PER_INR,
      minWithdraw: MIN_WITHDRAW_INR,
      minWithdrawBeans: MIN_WITHDRAW_BEANS,
      maxWithdraw: MAX_WITHDRAW_INR,
      beanTiers: beanTiers(),
      withdrawDayAllowed,
      withdrawDayOfMonth: WITHDRAW_DAY_OF_MONTH,
      nextWithdrawDay: nextWithdrawDay.toISOString(),
      canWithdraw: withdrawDayAllowed
        && isWithdrawablePayment(user.linked_bank)
        && withdrawableInr >= MIN_WITHDRAW_INR,
      paymentMethod: method,
      hasVerifiedPayment: isWithdrawablePayment(user.linked_bank),
      payoutEnabled: isPayoutConfigured(),
      manualPayoutMode: isManualWithdrawalMode(),
    });
  } catch (error) {
    console.error('Get withdraw info error:', error);
    res.status(500).json({ error: 'Failed to get withdraw info' });
  }
};

exports.requestWithdraw = async (req, res) => {
  let withdrawal = null;
  let beansDeducted = false;
  let prevDiamonds = 0;
  let prevBeans = 0;
  let newDiamonds = 0;
  let newBeans = 0;

  try {
    const userId = req.user.id;
    const amountInr = Number(req.body.amount);

    if (!Number.isFinite(amountInr) || amountInr < MIN_WITHDRAW_INR) {
      return res.status(400).json({
        error: `Minimum withdrawal is ₹${MIN_WITHDRAW_INR}`,
        minWithdraw: MIN_WITHDRAW_INR,
      });
    }
    if (!isWithdrawalDayAllowed()) {
      const nextDay = getNextWithdrawalDate();
      return res.status(400).json({
        error: `Withdraw sirf har mahine ki ${WITHDRAW_DAY_OF_MONTH} tareekh ko hi ho sakta hai.`,
        code: 'WITHDRAW_DAY_RESTRICTED',
        withdrawDayOfMonth: WITHDRAW_DAY_OF_MONTH,
        nextWithdrawDay: nextDay.toISOString(),
      });
    }
    if (amountInr > MAX_WITHDRAW_INR) {
      return res.status(400).json({ error: `Maximum withdrawal is ₹${MAX_WITHDRAW_INR.toLocaleString('en-IN')}` });
    }

    const beansNeeded = inrToBeans(amountInr);

    const user = await User.findById(userId).select('diamonds beans linked_bank email username');
    if (!isWithdrawablePayment(user?.linked_bank)) {
      return res.status(400).json({
        error: 'Verify bank account or UPI first (card/phone alone cannot receive payouts)',
        code: 'PAYMENT_NOT_VERIFIED',
      });
    }

    const diamonds = user?.diamonds || 0;
    const beans = user?.beans || 0;
    prevDiamonds = diamonds;
    prevBeans = beans;
    const totalBeans = totalWithdrawableBeans(diamonds, beans);
    const availableInr = beansToInr(totalBeans);

    if (totalBeans < beansNeeded) {
      return res.status(400).json({
        error: 'Insufficient beans balance',
        minWithdraw: MIN_WITHDRAW_INR,
        availableInr,
        availableBeans: totalBeans,
        beansNeeded,
        diamondsConverted: diamondsToBeans(diamonds),
      });
    }

    const method = formatPaymentMethod(user.linked_bank);
    ({ diamonds: newDiamonds, beans: newBeans } = deductBeansForWithdraw(
      diamonds,
      beans,
      beansNeeded,
    ));

    const updated = await User.findByIdAndUpdate(
      userId,
      { diamonds: newDiamonds, beans: newBeans },
      { new: true },
    ).select('diamonds beans linked_bank email username');
    beansDeducted = true;

    const idempotencyKey = uuidv4();
    const useManualPayout = isManualWithdrawalMode();

    withdrawal = await WithdrawalRequest.create({
      user_id: userId,
      amount_inr: amountInr,
      beans_used: beansNeeded,
      diamonds_deducted: Math.max(0, prevDiamonds - newDiamonds),
      beans_deducted: Math.max(0, prevBeans - newBeans),
      status: useManualPayout ? 'pending' : 'processing',
      payout_method: user.linked_bank.type,
      payout_display: method?.display,
      payout_mode: useManualPayout ? 'manual' : 'razorpay',
      payout_snapshot: buildPayoutSnapshot(user.linked_bank),
      idempotency_key: idempotencyKey,
    });

    await PaymentOrder.create({
      user_id: userId,
      product_type: 'wallet_withdrawal',
      amount_inr: amountInr,
      beans: beansNeeded,
      status: 'paid',
      payment_method: 'withdrawal',
      paid_at: new Date(),
    });

    let payoutMessage = '';
    let payoutStatus = withdrawal.status;

    if (useManualPayout) {
      payoutMessage = `₹${amountInr.toLocaleString('en-IN')} withdrawal request submitted. Our team will transfer to ${method?.display} within 1–3 business days.`;
    } else {
      const fullUser = await User.findById(userId).select('diamonds beans linked_bank email username');
      const { fundAccountId } = await ensurePayoutDestination(fullUser);

      const amountPaise = Math.round(amountInr * 100);
      const payout = await createPayout({
        fundAccountId,
        amountPaise,
        referenceId: withdrawal._id.toString(),
        linkedType: user.linked_bank.type,
        idempotencyKey,
      });

      payoutStatus = mapRazorpayPayoutStatus(payout.status);
      withdrawal.razorpay_payout_id = payout.id;
      withdrawal.razorpay_fund_account_id = fundAccountId;
      withdrawal.razorpay_status = payout.status;
      withdrawal.razorpay_mode = payout.mode;
      withdrawal.status = payoutStatus;
      if (payout.utr) withdrawal.utr = payout.utr;
      if (payoutStatus === 'completed') withdrawal.completed_at = new Date();
      if (payoutStatus === 'failed') {
        withdrawal.failure_reason = payout.status_details?.description || 'Payout failed';
        await refundWithdrawalBalance(withdrawal);
        beansDeducted = false;
      }
      await withdrawal.save();

      payoutMessage = payoutStatus === 'completed'
        ? `₹${amountInr.toLocaleString('en-IN')} sent to ${method?.display}${payout.utr ? ` (UTR: ${payout.utr})` : ''}`
        : payoutStatus === 'failed'
          ? `Withdrawal failed — beans refunded. ${withdrawal.failure_reason}`
          : `₹${amountInr.toLocaleString('en-IN')} payout initiated to ${method?.display}. Money will arrive in your bank/UPI shortly.`;
    }

    const finalUser = await User.findById(userId).select('diamonds beans');

    res.json({
      success: payoutStatus !== 'failed',
      diamonds: finalUser.diamonds,
      beans: finalUser.beans,
      diamondsConverted: diamondsToBeans(prevDiamonds),
      beansUsed: beansNeeded,
      withdrawn: amountInr,
      withdrawalId: withdrawal._id.toString(),
      status: payoutStatus,
      razorpayStatus: withdrawal.razorpay_status || null,
      utr: withdrawal.utr || null,
      message: payoutMessage,
      payoutTo: method?.display,
      payoutDestination: user.linked_bank.type === 'upi' ? 'upi' : 'bank_account',
    });
  } catch (error) {
    console.error('Withdraw error:', error);

    if (withdrawal) {
      withdrawal.status = 'failed';
      withdrawal.failure_reason = error.message || 'Payout failed';
      if (!withdrawal.diamonds_deducted && !withdrawal.beans_deducted && beansDeducted) {
        withdrawal.diamonds_deducted = Math.max(0, prevDiamonds - newDiamonds);
        withdrawal.beans_deducted = Math.max(0, prevBeans - newBeans);
      }
      await withdrawal.save();
      await refundWithdrawalBalance(withdrawal);
    } else if (beansDeducted && req.user?.id) {
      await User.findByIdAndUpdate(req.user.id, { diamonds: prevDiamonds, beans: prevBeans });
    }

    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    res.status(statusCode).json({
      error: 'Withdrawal failed',
      details: error.razorpay?.error?.description || error.message,
      code: 'PAYOUT_FAILED',
    });
  }
};

exports.handlePayoutWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body?.event;
    const payout = req.body?.payload?.payout?.entity;
    if (!payout?.id) {
      return res.json({ success: true, ignored: true });
    }

    const withdrawal = await WithdrawalRequest.findOne({ razorpay_payout_id: payout.id });
    if (!withdrawal) {
      return res.json({ success: true, ignored: true });
    }

    const mapped = mapRazorpayPayoutStatus(payout.status);
    withdrawal.razorpay_status = payout.status;
    if (payout.utr) withdrawal.utr = payout.utr;

    if (mapped === 'completed' && withdrawal.status !== 'completed') {
      withdrawal.status = 'completed';
      withdrawal.completed_at = new Date();
      await withdrawal.save();
    } else if (mapped === 'failed' && withdrawal.status !== 'failed') {
      withdrawal.status = 'failed';
      withdrawal.failure_reason = payout.status_details?.description || event || 'Payout failed';
      await withdrawal.save();
      await refundWithdrawalBalance(withdrawal);
    } else if (mapped === 'processing') {
      withdrawal.status = 'processing';
      await withdrawal.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Payout webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

exports.getWithdrawHistory = async (req, res) => {
  try {
    const withdrawals = await WithdrawalRequest.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .limit(30)
      .lean();

    res.json({
      success: true,
      withdrawals: withdrawals.map((w) => ({
        id: w._id.toString(),
        amountInr: w.amount_inr,
        status: w.status,
        payoutDisplay: w.payout_display,
        payoutMethod: w.payout_method,
        utr: w.utr || null,
        failureReason: w.failure_reason || null,
        createdAt: w.created_at,
        completedAt: w.completed_at || null,
      })),
    });
  } catch (error) {
    console.error('Withdraw history error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
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