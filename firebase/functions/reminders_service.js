/**
 * Reminders Service — scheduled Cloud Function that fires reminder emails
 * (and push notifications, if enabled) at T-24h and T-15min for scheduled
 * lessons and appointments.
 *
 * Runs every 5 minutes. Dedupes via reminder24hSent / reminder15mSent flags
 * on each doc so restarts or overlapping runs don't double-send.
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {featureEnabledForUser} = require("./feature_gate");
const {buildIcs, renderInviteHtml, sendInviteEmail} = require("./calendar_invites");

const H24_MS = 24 * 60 * 60 * 1000;
const M15_MS = 15 * 60 * 1000;
const WINDOW_MS = 6 * 60 * 1000; // 6-minute trigger window; cron runs every 5

function inWindow(target, offset) {
  const now = Date.now();
  const fireAt = target - offset;
  return fireAt <= now && fireAt > now - WINDOW_MS;
}

async function dispatchOne({ownerId, subject, title, description, startAt, endAt, location, attendeeEmail, kind, label}) {
  try {
    const canInvite = await featureEnabledForUser(ownerId, "cap.scheduleReminders");
    if (!canInvite) return false;

    const ownerRec = await admin.auth().getUser(ownerId).catch(() => null);
    const ownerEmail = ownerRec?.email;
    const ics = buildIcs({
      uid: `${kind}-reminder-${Date.now()}@voiceflow-ai`,
      title, description, startAt, endAt, location,
      organizerEmail: process.env.SENDGRID_FROM_EMAIL,
      attendeeEmail: attendeeEmail || ownerEmail,
    });
    const html = renderInviteHtml({title: `Reminder: ${title}`, description, startAt, endAt, location});
    const targets = [];
    if (attendeeEmail) targets.push(attendeeEmail);
    if (ownerEmail && ownerEmail !== attendeeEmail) targets.push(ownerEmail);
    for (const to of targets) {
      await sendInviteEmail({to, subject, htmlBody: html, icsText: ics});
    }

    // Best-effort push (Wave 3 will wire firebase-admin/messaging; no-op today)
    try {
      const push = require("./push_service");
      if (push.sendPushToUser) {
        await push.sendPushToUser(ownerId, {title: `Reminder: ${title}`, body: label});
      }
    } catch { /* push_service optional */ }

    return true;
  } catch (err) {
    logger.warn(`dispatchOne (${kind}) failed`, err?.message);
    return false;
  }
}

exports.dispatchReminders = onSchedule("every 5 minutes", async () => {
  const db = getFirestore();
  const now = Date.now();
  const horizon = new Date(now + H24_MS + WINDOW_MS); // 24h + small buffer

  // Process both scheduled lessons + appointments. Use small batches.
  const queries = [
    {
      coll: "scheduled_lessons",
      startField: "scheduledAt",
      durationField: "durationMin",
      titleOf: (d) => `English practice${d.theme ? ` — ${d.theme}` : ""}`,
      attendeeEmailOf: () => null, // owner-only; email resolved from auth
    },
    {
      coll: "appointments",
      startField: "startAt",
      durationField: null, // endAt is explicit
      titleOf: (d) => d.title || "Appointment",
      attendeeEmailOf: (d) => d.attendeeEmail || null,
    },
  ];

  for (const q of queries) {
    try {
      const snap = await db.collection(q.coll)
        .where(q.startField, "<=", horizon)
        .limit(200)
        .get();
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.status && data.status !== "scheduled") continue;
        const startAt = data[q.startField]?.toDate?.() || new Date(data[q.startField]);
        if (!startAt || isNaN(+startAt)) continue;
        if (+startAt < now - 60 * 60 * 1000) continue; // more than 1h in the past — skip

        const endAt = q.durationField
          ? new Date(+startAt + (data[q.durationField] || 15) * 60 * 1000)
          : data.endAt?.toDate?.() || new Date(data.endAt);

        const fire24 = inWindow(+startAt, H24_MS) && !data.reminder24hSent;
        const fire15 = inWindow(+startAt, M15_MS) && !data.reminder15mSent;
        if (!fire24 && !fire15) continue;

        const label = fire15 ? "Starts in 15 minutes" : "Tomorrow";
        const ok = await dispatchOne({
          ownerId: data.ownerId,
          subject: `${label}: ${q.titleOf(data)}`,
          title: q.titleOf(data),
          description: data.notes || "",
          startAt, endAt,
          location: data.location || "",
          attendeeEmail: q.attendeeEmailOf(data),
          kind: q.coll,
          label,
        });
        if (!ok) continue;

        const update = {};
        if (fire24) update.reminder24hSent = true;
        if (fire15) update.reminder15mSent = true;
        update.lastReminderAt = FieldValue.serverTimestamp();
        await doc.ref.set(update, {merge: true}).catch(() => null);
      }
    } catch (err) {
      logger.error(`dispatchReminders: query ${q.coll} failed`, err);
    }
  }
});
