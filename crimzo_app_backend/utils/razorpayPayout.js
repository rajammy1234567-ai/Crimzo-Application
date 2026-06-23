const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { isRazorpayConfigured, isPlaceholderKey } = require('../config/razorpay');

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function isPayoutConfigured() {
  const accountNumber = process.env.RAZORPAY_X_ACCOUNT_NUMBER;
  return isRazorpayConfigured()
    && !!accountNumber
    && !isPlaceholderKey(accountNumber);
}

function getPayoutStatus() {
  const configured = isPayoutConfigured();
  return {
    configured,
    accountConfigured: !!(process.env.RAZORPAY_X_ACCOUNT_NUMBER && !isPlaceholderKey(process.env.RAZORPAY_X_ACCOUNT_NUMBER)),
    webhookConfigured: !!(process.env.RAZORPAY_WEBHOOK_SECRET && !isPlaceholderKey(process.env.RAZORPAY_WEBHOOK_SECRET)),
  };
}

function payoutDestinationKey(linked) {
  if (!linked) return null;
  if (linked.type === 'upi') return `upi:${(linked.upi_id || '').toLowerCase()}`;
  if (linked.type === 'bank') {
    return `bank:${(linked.ifsc || '').toUpperCase()}:${linked.account_number || ''}`;
  }
  return null;
}

function sanitizeContactName(name) {
  const cleaned = String(name || 'Crimzo User')
    .replace(/[^a-zA-Z0-9\s'.\-_/()]/g, ' ')
    .trim()
    .slice(0, 50);
  return cleaned.length >= 3 ? cleaned : 'Crimzo User';
}

async function razorpayXRequest(method, path, body, extraHeaders = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.error?.description || data?.error?.reason || `Razorpay X API ${res.status}`);
    err.statusCode = res.status;
    err.razorpay = data;
    throw err;
  }

  return data;
}

async function ensureContact({ userId, name, email, phone }) {
  const referenceId = `crimzo_${userId}`;
  return razorpayXRequest('POST', '/contacts', {
    name: sanitizeContactName(name),
    email: email || undefined,
    contact: phone || undefined,
    type: 'customer',
    reference_id: referenceId,
  });
}

async function ensureFundAccount({ contactId, linked }) {
  if (linked.type === 'upi') {
    return razorpayXRequest('POST', '/fund_accounts', {
      contact_id: contactId,
      account_type: 'vpa',
      vpa: { address: linked.upi_id },
    });
  }

  return razorpayXRequest('POST', '/fund_accounts', {
    contact_id: contactId,
    account_type: 'bank_account',
    bank_account: {
      name: sanitizeContactName(linked.account_holder_name),
      ifsc: linked.ifsc,
      account_number: linked.account_number,
    },
  });
}

function mapRazorpayPayoutStatus(rzStatus) {
  switch (rzStatus) {
    case 'processed':
      return 'completed';
    case 'failed':
    case 'reversed':
    case 'cancelled':
    case 'rejected':
      return 'failed';
    case 'queued':
    case 'pending':
    case 'processing':
    default:
      return 'processing';
  }
}

async function createPayout({
  fundAccountId,
  amountPaise,
  referenceId,
  mode,
  linkedType,
  idempotencyKey,
}) {
  const payoutMode = linkedType === 'upi' ? 'UPI' : (mode || 'IMPS');
  const key = idempotencyKey || uuidv4();

  return razorpayXRequest(
    'POST',
    '/payouts',
    {
      account_number: process.env.RAZORPAY_X_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: amountPaise,
      currency: 'INR',
      mode: payoutMode,
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: String(referenceId).slice(0, 40),
      narration: 'Crimzo Withdraw',
      notes: {
        source: 'crimzo_withdraw',
        reference_id: String(referenceId).slice(0, 40),
      },
    },
    { 'X-Payout-Idempotency': key },
  );
}

async function fetchPayout(payoutId) {
  return razorpayXRequest('GET', `/payouts/${payoutId}`);
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || isPlaceholderKey(secret)) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

/**
 * Ensure RazorpayX contact + fund account for user's verified bank/UPI.
 * Persists IDs on user.linked_bank when created.
 */
async function ensurePayoutDestination(user) {
  const linked = user.linked_bank;
  if (!linked || linked.status !== 'verified') {
    throw new Error('Payment method not verified');
  }
  if (linked.type === 'card') {
    throw new Error('Card cannot receive withdrawals — link bank or UPI');
  }

  const destKey = payoutDestinationKey(linked);
  let contactId = linked.razorpay_contact_id;
  let fundAccountId = linked.razorpay_fund_account_id;

  if (linked.payout_destination_key && linked.payout_destination_key !== destKey) {
    contactId = null;
    fundAccountId = null;
  }

  if (!contactId) {
    const contact = await ensureContact({
      userId: user._id.toString(),
      name: linked.account_holder_name,
      email: user.email,
      phone: linked.linked_phone,
    });
    contactId = contact.id;
    linked.razorpay_contact_id = contactId;
  }

  if (!fundAccountId) {
    const fundAccount = await ensureFundAccount({ contactId, linked });
    fundAccountId = fundAccount.id;
    linked.razorpay_fund_account_id = fundAccountId;
    linked.payout_destination_key = destKey;
  }

  user.markModified('linked_bank');
  await user.save();

  return { contactId, fundAccountId };
}

module.exports = {
  isPayoutConfigured,
  getPayoutStatus,
  payoutDestinationKey,
  ensurePayoutDestination,
  createPayout,
  fetchPayout,
  mapRazorpayPayoutStatus,
  verifyWebhookSignature,
};