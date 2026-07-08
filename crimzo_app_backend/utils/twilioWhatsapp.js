const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

function isTwilioConfigured() {
  return Boolean(accountSid && authToken);
}

let client = null;
if (isTwilioConfigured()) {
  client = twilio(accountSid, authToken);
}

/**
 * Sends a WhatsApp OTP using Twilio Sandbox
 * @param {string} mobile 10-digit Indian mobile number
 * @param {string} otp The generated OTP
 */
async function sendWhatsAppOtp(mobile, otp) {
  if (!client) {
    throw new Error('Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  }

  try {
    const message = await client.messages.create({
      from: 'whatsapp:+14155238886',
      contentSid: 'HX229f5a04fd0510ce1b071852155d3e75',
      contentVariables: JSON.stringify({ "1": otp }),
      to: `whatsapp:+91${mobile}`
    });

    console.log(`WhatsApp OTP sent to +91${mobile}, SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error('Twilio WhatsApp error:', error);
    throw error;
  }
}

module.exports = {
  isTwilioConfigured,
  sendWhatsAppOtp
};