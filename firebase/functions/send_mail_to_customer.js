const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const sgMail = require("@sendgrid/mail");

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

exports.sendMailToCustomer = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  if (!process.env.SENDGRID_API_KEY) {
    logger.error("SENDGRID_API_KEY is not configured.");
    throw new HttpsError("failed-precondition", "Email service not configured.");
  }

  const data = request.data || {};
  const to = data.email;
  const subject = data.subject;
  const body = data.body;
  const fromAddress = data.fromEmail || process.env.SENDGRID_FROM_EMAIL;

  if (!to || !subject || !body) {
    throw new HttpsError("invalid-argument", "Email, subject, and body are required.");
  }

  if (!fromAddress) {
    logger.error("sendMailToCustomer missing from address.");
    throw new HttpsError(
      "failed-precondition",
      "Default sender email is not configured.",
    );
  }

  try {
    await sgMail.send({
      to,
      from: fromAddress,
      subject,
      html: body,
    });

    return {status: "success"};
  } catch (error) {
    logger.error("Error sending email via SendGrid", error);
    throw new HttpsError(
      "internal",
      error?.message || "Error sending email.",
    );
  }
});
