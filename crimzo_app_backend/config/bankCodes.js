/** IFSC prefix → display name + Razorpay netbanking code */
const BANK_MAP = {
  HDFC: { name: 'HDFC Bank', razorpay: 'HDFC' },
  ICIC: { name: 'ICICI Bank', razorpay: 'ICIC' },
  SBIN: { name: 'State Bank of India', razorpay: 'SBIN' },
  UTIB: { name: 'Axis Bank', razorpay: 'UTIB' },
  KKBK: { name: 'Kotak Mahindra Bank', razorpay: 'KKBK' },
  PUNB: { name: 'Punjab National Bank', razorpay: 'PUNB' },
  BARb: { name: 'Bank of Baroda', razorpay: 'BARB' },
  BARB: { name: 'Bank of Baroda', razorpay: 'BARB' },
  IDIB: { name: 'Indian Bank', razorpay: 'IDIB' },
  CNRB: { name: 'Canara Bank', razorpay: 'CNRB' },
  YESB: { name: 'Yes Bank', razorpay: 'YESB' },
  INDB: { name: 'IndusInd Bank', razorpay: 'INDB' },
  FDRL: { name: 'Federal Bank', razorpay: 'FDRL' },
  IDFB: { name: 'IDFC First Bank', razorpay: 'IDFB' },
  AUBL: { name: 'AU Small Finance Bank', razorpay: 'AUBL' },
};

function normalizeIfsc(ifsc) {
  return String(ifsc || '').trim().toUpperCase();
}

function isValidIfsc(ifsc) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizeIfsc(ifsc));
}

function resolveBankFromIfsc(ifsc) {
  const code = normalizeIfsc(ifsc).slice(0, 4);
  const hit = BANK_MAP[code];
  if (hit) return { code, ...hit };
  return { code, name: `${code} Bank`, razorpay: code };
}

function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
}

function isValidUpi(upi) {
  if (!upi) return true;
  return /^[\w.-]+@[\w.-]+$/.test(String(upi).trim().toLowerCase());
}

module.exports = {
  BANK_MAP,
  normalizeIfsc,
  isValidIfsc,
  resolveBankFromIfsc,
  maskAccountNumber,
  isValidUpi,
};