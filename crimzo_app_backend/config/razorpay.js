const Razorpay = require('razorpay');

function isPlaceholderKey(value) {
  if (!value) return true;
  const v = String(value).toLowerCase();
  return (
    v.includes('xxxx') ||
    v.includes('your_razorpay') ||
    v.includes('replace') ||
    v === 'rzp_test_xxxxxxxx'
  );
}

function isRazorpayConfigured() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return !!(keyId && keySecret && !isPlaceholderKey(keyId) && !isPlaceholderKey(keySecret));
}

function getRazorpayClient() {
  if (!isRazorpayConfigured()) return null;
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function getRazorpayStatus() {
  const configured = isRazorpayConfigured();
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const isTestKey = keyId.startsWith('rzp_test_');
  const isLiveKey = keyId.startsWith('rzp_live_');

  let mode = 'disabled';
  if (configured) mode = 'razorpay';
  else if (process.env.NODE_ENV !== 'production') mode = 'dev_mock';

  return {
    configured,
    mode,
    keyType: isLiveKey ? 'live' : isTestKey ? 'test' : configured ? 'unknown' : null,
    keyIdMasked: keyId ? `${keyId.slice(0, 12)}...` : null,
    devMockEnabled: process.env.NODE_ENV !== 'production' && !configured,
  };
}

module.exports = {
  isPlaceholderKey,
  isRazorpayConfigured,
  getRazorpayClient,
  getRazorpayStatus,
};