/**
 * Calendar invite helpers — ICS generation, Google/Outlook deep-links, and
 * a SendGrid wrapper that attaches an ICS file so the recipient's mail
 * client auto-detects "Add to calendar".
 *
 * Works with Gmail, Outlook, Apple Mail, Yahoo — all consume standard ICS.
 * No OAuth, no third-party APIs.
 */

const sgMail = require("@sendgrid/mail");
const {logger} = require("firebase-functions");

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function pad(n) { return String(n).padStart(2, "0"); }

/**
 * Format a Date or ISO string as ICS datetime (UTC): YYYYMMDDTHHmmssZ.
 */
function toIcsDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Format a Date as a Google Calendar URL datetime: YYYYMMDDTHHmmssZ.
 */
function toGcalDate(input) {
  return toIcsDate(input);
}

function escapeIcsText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Build an RFC 5545 ICS VEVENT. Returns plain text.
 */
function buildIcs({uid, title, description, startAt, endAt, location, organizerEmail, attendeeEmail}) {
  const eventUid = uid || `${Date.now()}-${Math.random().toString(36).slice(2)}@voiceflow-ai`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoiceFlow AI//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(startAt)}`,
    `DTEND:${toIcsDate(endAt)}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (organizerEmail) lines.push(`ORGANIZER;CN=VoiceFlow AI:mailto:${organizerEmail}`);
  if (attendeeEmail) lines.push(`ATTENDEE;CN=${escapeIcsText(attendeeEmail)};RSVP=TRUE:mailto:${attendeeEmail}`);
  lines.push("STATUS:CONFIRMED");
  lines.push("SEQUENCE:0");
  lines.push("BEGIN:VALARM");
  lines.push("TRIGGER:-PT15M");
  lines.push("ACTION:DISPLAY");
  lines.push("DESCRIPTION:Reminder");
  lines.push("END:VALARM");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Build an "Add to Google Calendar" deep link.
 */
function buildGoogleCalendarUrl({title, description, startAt, endAt, location}) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "",
    dates: `${toGcalDate(startAt)}/${toGcalDate(endAt)}`,
  });
  if (description) params.append("details", description);
  if (location) params.append("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build an "Add to Outlook Web" deep link.
 */
function buildOutlookCalendarUrl({title, description, startAt, endAt, location}) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title || "",
    startdt: new Date(startAt).toISOString(),
    enddt: new Date(endAt).toISOString(),
  });
  if (description) params.append("body", description);
  if (location) params.append("location", location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Build an "Add to Office 365" deep link (work/school accounts).
 */
function buildOffice365CalendarUrl({title, description, startAt, endAt, location}) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title || "",
    startdt: new Date(startAt).toISOString(),
    enddt: new Date(endAt).toISOString(),
  });
  if (description) params.append("body", description);
  if (location) params.append("location", location);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Render a friendly confirmation/reminder email body with 3 "Add to calendar"
 * deep-links. The ICS attachment is handled separately by sendInviteEmail.
 */
function renderInviteHtml({title, description, startAt, endAt, location, ctaUrl}) {
  const start = new Date(startAt);
  const when = start.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const gcal = buildGoogleCalendarUrl({title, description, startAt, endAt, location});
  const outlook = buildOutlookCalendarUrl({title, description, startAt, endAt, location});
  const o365 = buildOffice365CalendarUrl({title, description, startAt, endAt, location});

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="color:#111827;font-size:20px;margin:0 0 8px;">${title || "Your appointment is confirmed"}</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${when}${location ? ` &middot; ${location}` : ""}</p>
    ${description ? `<p style="color:#374151;font-size:14px;line-height:1.6;">${description}</p>` : ""}
    <div style="margin:24px 0;padding:16px;background:#f9fafb;border-radius:8px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 10px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Add to calendar</p>
      <a href="${gcal}" style="display:inline-block;margin-right:8px;padding:8px 14px;background:#ffffff;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;">Google</a>
      <a href="${outlook}" style="display:inline-block;margin-right:8px;padding:8px 14px;background:#ffffff;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;">Outlook</a>
      <a href="${o365}" style="display:inline-block;padding:8px 14px;background:#ffffff;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;">Office 365</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin:0 0 0;">An .ics invite is attached — opening it in Gmail, Apple Mail, or Outlook will add the event automatically.</p>
    ${ctaUrl ? `<p style="margin-top:24px;"><a href="${ctaUrl}" style="color:#7c3aed;font-size:14px;">Open in app &rarr;</a></p>` : ""}
  </div>`;
}

/**
 * Send an invite/reminder email with ICS attachment.
 * Returns true on success, false on failure (logged, non-throwing — the
 * caller doesn't want a failing email to break the booking flow).
 */
async function sendInviteEmail({to, subject, htmlBody, icsText, fromOverride}) {
  if (!process.env.SENDGRID_API_KEY) {
    logger.warn("SENDGRID_API_KEY not configured — skipping invite email");
    return false;
  }
  const from = fromOverride || process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    logger.warn("SENDGRID_FROM_EMAIL not configured — skipping invite email");
    return false;
  }
  try {
    const msg = {
      to, from, subject,
      html: htmlBody,
    };
    if (icsText) {
      msg.attachments = [{
        content: Buffer.from(icsText, "utf-8").toString("base64"),
        filename: "invite.ics",
        type: "text/calendar; method=REQUEST",
        disposition: "attachment",
      }];
    }
    await sgMail.send(msg);
    return true;
  } catch (err) {
    logger.error("sendInviteEmail failed", err?.response?.body || err);
    return false;
  }
}

module.exports = {
  buildIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildOffice365CalendarUrl,
  renderInviteHtml,
  sendInviteEmail,
};
