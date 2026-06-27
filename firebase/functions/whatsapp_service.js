const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const twilio = require("twilio");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
// Must be a Twilio-approved WhatsApp sender (e.g. whatsapp:+14155238886 for sandbox)
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

/**
 * Send a WhatsApp message via Twilio
 * Can be called directly from other modules (e.g. twilio_media_stream.js tool handler)
 * or via the exported Cloud Function.
 *
 * @param {string} to   - Recipient phone in E.164 format (e.g. +12125551234)
 * @param {string} body - Message text
 * @returns {Promise<string>} Twilio message SID
 */
async function sendWhatsAppMessage(to, body) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not configured");
  }
  if (!TWILIO_WHATSAPP_FROM) {
    throw new Error("TWILIO_WHATSAPP_FROM is not set");
  }
  if (!to || !body) {
    throw new Error("to and body are required");
  }

  // Normalize to E.164 — Twilio requires the whatsapp: prefix
  const normalizedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const normalizedFrom = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const message = await client.messages.create({
    body,
    from: normalizedFrom,
    to: normalizedTo,
  });

  logger.info("WhatsApp message sent", {
    sid: message.sid,
    to: normalizedTo,
    status: message.status,
  });

  return message.sid;
}

/**
 * Firebase callable Cloud Function — send a WhatsApp message to a customer.
 * Called from frontend when agent triggers a WhatsApp send.
 */
const sendWhatsApp = onCall(
    {
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (request) => {
      const {to, message} = request.data || {};

      if (!to || !message) {
        throw new HttpsError("invalid-argument", "to and message are required");
      }

      // Basic E.164 validation
      if (!/^\+[1-9]\d{7,14}$/.test(to)) {
        throw new HttpsError("invalid-argument", "to must be a valid E.164 phone number");
      }

      try {
        const sid = await sendWhatsAppMessage(to, message);
        return {success: true, sid};
      } catch (error) {
        logger.error("WhatsApp send failed", {error: error.message, to});
        throw new HttpsError("internal", `WhatsApp send failed: ${error.message}`);
      }
    },
);

module.exports = {sendWhatsApp, sendWhatsAppMessage};
