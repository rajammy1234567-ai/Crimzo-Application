/**
 * FAST2SMS OTP delivery — https://docs.fast2sms.com/reference/send-otp
 * Set FAST2SMS_API_KEY and FAST2SMS_OTP_ID in .env (from FAST2SMS dashboard).
 */

const FAST2SMS_BASE = 'https://www.fast2sms.com';

function isFast2SmsConfigured() {
  return Boolean(process.env.FAST2SMS_API_KEY && process.env.FAST2SMS_OTP_ID);
}

function normalizeIndianMobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return null;
}

async function fast2smsRequest(path, body) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) throw new Error('FAST2SMS_API_KEY not configured');

  const res = await fetch(`${FAST2SMS_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: apiKey,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid response from FAST2SMS');
  }

  if (!data?.return && data?.status_code !== 200) {
    throw new Error(data?.message || 'FAST2SMS request failed');
  }

  return data;
}

/**
 * Send OTP via FAST2SMS DLT template.
 * @returns {{ requestId?: string }}
 */
async function sendOtpSms(phone, otp) {
  const mobile = normalizeIndianMobile(phone);
  if (!mobile) throw new Error('Valid 10-digit Indian mobile number required');

  if (!isFast2SmsConfigured()) {
    console.log(`\n📱 [DEV] OTP for +91${mobile}: ${otp}\n`);
    return { devMode: true };
  }

  const otpLength = Math.min(10, Math.max(4, String(otp).length));
  const data = await fast2smsRequest('/dev/otp/send', {
    mobile,
    otp_id: process.env.FAST2SMS_OTP_ID,
    otp: String(otp),
    otp_length: otpLength,
    otp_expiry: 5,
  });

  return { requestId: data.request_id };
}

/**
 * Verify OTP via FAST2SMS (when SMS was sent through their OTP service).
 */
async function verifyOtpSms(phone, otp) {
  const mobile = normalizeIndianMobile(phone);
  if (!mobile) throw new Error('Valid 10-digit Indian mobile number required');

  if (!isFast2SmsConfigured()) {
    return { devMode: true };
  }

  await fast2smsRequest('/dev/otp/verify', {
    mobile,
    otp: String(otp),
  });

  return { verified: true };
}

module.exports = {
  isFast2SmsConfigured,
  normalizeIndianMobile,
  sendOtpSms,
  verifyOtpSms,
};