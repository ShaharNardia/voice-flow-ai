const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const sgMail = require("@sendgrid/mail");
const {sanitizeObject, isValidEmail} = require("./security_utils");

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ── Bilingual email templates ────────────────────────────────────────

const EMAIL_TEMPLATES = {
  // Call summary sent after a completed call
  callSummary: {
    he: {
      subject: "סיכום שיחה – {{companyName}}",
      body: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">סיכום שיחה</h2>
          <p>שלום {{customerName}},</p>
          <p>תודה על השיחה עם {{companyName}}.</p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>תאריך:</strong> {{callDate}}</p>
            <p><strong>משך:</strong> {{callDuration}}</p>
            <p><strong>סיכום:</strong> {{callSummary}}</p>
          </div>
          <p>אם יש לך שאלות נוספות, אל תהסס/י לפנות אלינו.</p>
          <p>בברכה,<br/>{{companyName}}</p>
        </div>`,
    },
    en: {
      subject: "Call Summary – {{companyName}}",
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Call Summary</h2>
          <p>Hello {{customerName}},</p>
          <p>Thank you for speaking with {{companyName}}.</p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Date:</strong> {{callDate}}</p>
            <p><strong>Duration:</strong> {{callDuration}}</p>
            <p><strong>Summary:</strong> {{callSummary}}</p>
          </div>
          <p>If you have any further questions, don't hesitate to reach out.</p>
          <p>Best regards,<br/>{{companyName}}</p>
        </div>`,
    },
  },
  // Appointment confirmation
  appointmentConfirmation: {
    he: {
      subject: "אישור תור – {{companyName}}",
      body: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">אישור תור</h2>
          <p>שלום {{customerName}},</p>
          <p>התור שלך עם {{companyName}} אושר.</p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>תאריך ושעה:</strong> {{appointmentTime}}</p>
            <p><strong>כתובת:</strong> {{address}}</p>
            <p><strong>פרטים:</strong> {{details}}</p>
          </div>
          <p>לביטול או שינוי, אנא צור/צרי קשר טלפוני.</p>
          <p>בברכה,<br/>{{companyName}}</p>
        </div>`,
    },
    en: {
      subject: "Appointment Confirmation – {{companyName}}",
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Appointment Confirmation</h2>
          <p>Hello {{customerName}},</p>
          <p>Your appointment with {{companyName}} has been confirmed.</p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Date & Time:</strong> {{appointmentTime}}</p>
            <p><strong>Address:</strong> {{address}}</p>
            <p><strong>Details:</strong> {{details}}</p>
          </div>
          <p>To cancel or reschedule, please call us.</p>
          <p>Best regards,<br/>{{companyName}}</p>
        </div>`,
    },
  },
  // Welcome email for new leads
  welcome: {
    he: {
      subject: "ברוכים הבאים ל-{{companyName}}",
      body: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">ברוכים הבאים!</h2>
          <p>שלום {{customerName}},</p>
          <p>תודה על הפנייה שלך ל-{{companyName}}.</p>
          <p>אחד מנציגינו יצור איתך קשר בהקדם.</p>
          <p>בברכה,<br/>{{companyName}}</p>
        </div>`,
    },
    en: {
      subject: "Welcome to {{companyName}}",
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Welcome!</h2>
          <p>Hello {{customerName}},</p>
          <p>Thank you for reaching out to {{companyName}}.</p>
          <p>One of our representatives will contact you shortly.</p>
          <p>Best regards,<br/>{{companyName}}</p>
        </div>`,
    },
  },
};

/**
 * Replace {{placeholder}} tokens in email content.
 */
function applyTemplateVars(text, vars) {
  if (!text || typeof text !== "string") return text || "";
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
    result = result.replace(regex, value || "");
  }
  return result;
}

/**
 * Get a template by name and language.
 *
 * @param {string} templateName - One of: callSummary, appointmentConfirmation, welcome
 * @param {string} language - Language code: "he" or "en" (defaults to "he")
 * @param {Object} vars - Template variables to substitute
 * @returns {{subject: string, body: string}}
 */
function getEmailTemplate(templateName, language, vars = {}) {
  const lang = (language || "he").toLowerCase().startsWith("he") ? "he" : "en";
  const template = EMAIL_TEMPLATES[templateName]?.[lang];

  if (!template) {
    return null;
  }

  return {
    subject: applyTemplateVars(template.subject, vars),
    body: applyTemplateVars(template.body, vars),
  };
}

// ── Cloud Function ───────────────────────────────────────────────────

exports.sendMailToCustomer = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  if (!process.env.SENDGRID_API_KEY) {
    logger.error("SENDGRID_API_KEY is not configured.");
    throw new HttpsError("failed-precondition", "Email service not configured.");
  }

  const data = sanitizeObject(request.data || {});
  const to = data.email;
  const fromAddress = data.fromEmail || process.env.SENDGRID_FROM_EMAIL;

  if (!to) {
    throw new HttpsError("invalid-argument", "Recipient email is required.");
  }

  if (!isValidEmail(to)) {
    throw new HttpsError("invalid-argument", "Invalid recipient email format.");
  }

  if (!fromAddress) {
    logger.error("sendMailToCustomer missing from address.");
    throw new HttpsError(
      "failed-precondition",
      "Default sender email is not configured.",
    );
  }

  // Support both direct subject/body and template-based emails
  let subject = data.subject;
  let body = data.body;

  if (data.template) {
    const templateResult = getEmailTemplate(
      data.template,
      data.language || "he",
      data.templateVars || {},
    );
    if (templateResult) {
      subject = subject || templateResult.subject;
      body = body || templateResult.body;
    }
  }

  if (!subject || !body) {
    throw new HttpsError(
      "invalid-argument",
      "Subject and body are required (or provide a valid template name).",
    );
  }

  try {
    await sgMail.send({
      to,
      from: fromAddress,
      subject,
      html: body,
    });

    logger.info(`Email sent to ${to} (template: ${data.template || "custom"})`);

    return {status: "success"};
  } catch (error) {
    logger.error("Error sending email via SendGrid", error);
    throw new HttpsError(
      "internal",
      error?.message || "Error sending email.",
    );
  }
});

// Export for use by other functions
exports.getEmailTemplate = getEmailTemplate;
exports.EMAIL_TEMPLATES = EMAIL_TEMPLATES;
