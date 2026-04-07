const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('[TwilioService] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set — SMS disabled.');
}

/**
 * Send an SMS message via Twilio.
 * @param {string} to - Recipient phone number in E.164 format (e.g. +919876543210)
 * @param {string} body - Message text
 * @returns {Promise<object|null>} Twilio message object or null if disabled/error
 */
async function sendSMS(to, body) {
  if (!client) {
    console.warn('[TwilioService] Client not initialised — skipping SMS.');
    return null;
  }

  if (!fromNumber) {
    console.warn('[TwilioService] TWILIO_PHONE_NUMBER not set — skipping SMS.');
    return null;
  }

  try {
    const message = await client.messages.create({
      body: body,
      from: fromNumber,
      to: to,
    });
    console.log('[TwilioService] SMS sent — SID:', message.sid);
    return message;
  } catch (err) {
    console.error('[TwilioService] Failed to send SMS:', err.message);
    return null;
  }
}

module.exports = { sendSMS };
