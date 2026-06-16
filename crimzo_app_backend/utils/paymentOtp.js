const crypto = require('crypto');
const nodemailer = require('nodemailer');

const DEV_OTP = '123456';
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function createMailer() {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function logPhoneOtp(phone, otp) {
  console.log(`\n📱 Payment verify OTP for +91${phone}: ${otp}\n`);
}

async function sendPaymentVerificationEmail({ email, username, otp, methodLabel, phone }) {
  if (phone) logPhoneOtp(phone, otp);
  const transporter = createMailer();
  if (!transporter) {
    console.log(`📧 Payment verify OTP for ${email}: ${otp} (SMTP not configured)`);
    return { sent: false, devOtp: process.env.NODE_ENV !== 'production' ? DEV_OTP : null };
  }

  try {
    await transporter.sendMail({
      from: `"Crimzo" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Verify your payment method — Crimzo',
      html: `
        <p>Hi ${username || 'there'},</p>
        <p>Your OTP to verify <b>${methodLabel}</b> is:</p>
        <h2 style="letter-spacing:4px">${otp}</h2>
        <p>Valid for 10 minutes. Do not share this code.</p>
      `,
    });
    return { sent: true, devOtp: process.env.NODE_ENV !== 'production' ? DEV_OTP : null };
  } catch (err) {
    console.error('Payment OTP email failed:', err.message);
    console.log(`📧 Fallback OTP for ${email}: ${otp}`);
    return { sent: false, devOtp: process.env.NODE_ENV !== 'production' ? DEV_OTP : null };
  }
}

function isOtpValid(storedHash, expiresAt, otpInput) {
  if (!storedHash || !expiresAt) return false;
  if (Date.now() > new Date(expiresAt).getTime()) return false;
  const input = String(otpInput || '').trim();
  if (process.env.NODE_ENV !== 'production' && input === DEV_OTP) return true;
  return hashOtp(input) === storedHash;
}

module.exports = {
  DEV_OTP,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  logPhoneOtp,
  sendPaymentVerificationEmail,
  isOtpValid,
};