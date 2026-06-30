/**
 * followups_service.js — automatic follow-up calls.
 *
 * When a lead call ends without success (no-answer / busy / completed-but-not-
 * resolved), we enqueue a per-lead follow-up. A scheduled job re-dials it later,
 * inside business hours, up to MAX_ATTEMPTS — then gives up ("exhausted") so a
 * human can take over (handoff, built separately).
 *
 * Design:
 *   • One queue doc per lead: followup_queue/{leadId}. attemptCount carries
 *     across calls, so re-dials don't multiply. Idempotent.
 *   • enqueueFollowup() is called from the end-of-call handler.
 *   • clearFollowup() resolves it on a successful outcome.
 *   • dispatchFollowups (onSchedule, every 5 min) re-dials due entries via
 *     voice_service._placeCallInternal (lazy-required to avoid a circular load).
 *   • Activity hours: entries outside the window are rescheduled to the next
 *     window instead of dialing at night.
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

const MAX_ATTEMPTS = 3;
// Delay before each follow-up attempt, indexed by (attemptCount-1).
const RETRY_DELAYS_MS = [4 * 3600e3, 24 * 3600e3, 48 * 3600e3];
const DEFAULT_TZ = process.env.FOLLOWUP_TZ || "Asia/Jerusalem";
const WINDOW_START_HOUR = 9;   // inclusive
const WINDOW_END_HOUR = 20;    // exclusive
const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

function localHour(tz) {
  try {
    return Number(new Intl.DateTimeFormat("en-US", {hour: "2-digit", hour12: false, timeZone: tz}).format(new Date()));
  } catch { return new Date().getUTCHours(); }
}
/** ms until we're next inside [WINDOW_START, WINDOW_END) in tz; 0 if inside now. */
function msUntilWindow(tz) {
  const h = localHour(tz);
  if (h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR) return 0;
  const hoursToAdd = h < WINDOW_START_HOUR ? (WINDOW_START_HOUR - h) : (24 - h + WINDOW_START_HOUR);
  return hoursToAdd * 3600e3;
}

/**
 * Upsert a per-lead follow-up after a call that needs one. Returns the new
 * status: "pending" | "exhausted" | null (insufficient data).
 */
async function enqueueFollowup({leadId, phone, companyPhone, assistantId, ownerId, campaignId, reason, timezone}) {
  if (!leadId || !phone || !companyPhone || !assistantId) return null;
  const db = getFirestore();
  const ref = db.collection("followup_queue").doc(String(leadId));
  const snap = await ref.get();
  const prevAttempts = snap.exists ? (snap.data().attemptCount || 0) : 0;
  const attemptCount = prevAttempts + 1;

  if (attemptCount > MAX_ATTEMPTS) {
    await ref.set({
      status: "exhausted", attemptCount: prevAttempts, reason: reason || "callback",
      nextAttemptAt: FAR_FUTURE, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    // ── HANDOFF: the bot gave up → hand the lead to a human ──────────────────
    // Three channels so it can't be missed: (1) a durable escalations record,
    // (2) the lead's own status flips to "escalated" (shows in the Leads list),
    // (3) a best-effort push to the owner.
    try {
      await db.collection("escalations").doc(String(leadId)).set({
        leadId, phone: phone || null, assistantId: assistantId || null,
        ownerId: ownerId || null, campaignId: campaignId || null,
        reason: "followup_exhausted", attempts: prevAttempts, status: "open",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await db.collection("leads").doc(String(leadId)).set(
        {status: "escalated", needsHuman: true, updatedAt: FieldValue.serverTimestamp()}, {merge: true}).catch(() => {});
      if (ownerId) {
        const {sendPushToUser} = require("./push_service");
        await sendPushToUser(ownerId, {
          title: "Lead needs a human",
          body: `Tried ${prevAttempts}× to reach ${phone || "a lead"} with no resolution — take over?`,
          url: "/leads",
          data: {leadId: String(leadId), kind: "followup_exhausted"},
        });
      }
    } catch (escErr) {
      logger.warn("[followup] escalation/notify failed (non-blocking)", {leadId, err: escErr.message});
    }
    logger.info("[followup] exhausted — escalated to human", {leadId, attempts: prevAttempts});
    return "exhausted";
  }

  const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
  await ref.set({
    leadId, phone, companyPhone, assistantId,
    ownerId: ownerId || null, campaignId: campaignId || null,
    reason: reason || "callback",
    attemptCount, maxAttempts: MAX_ATTEMPTS,
    status: "pending",
    nextAttemptAt: new Date(Date.now() + delay),
    timezone: timezone || DEFAULT_TZ,
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : {createdAt: FieldValue.serverTimestamp()}),
  }, {merge: true});
  logger.info("[followup] queued", {leadId, attemptCount, delayMs: delay});
  return "pending";
}

/** Resolve a lead's follow-up (e.g. on a successful call) so it stops re-dialing. */
async function clearFollowup(leadId, status = "done") {
  if (!leadId) return;
  try {
    await getFirestore().collection("followup_queue").doc(String(leadId)).set(
      {status, nextAttemptAt: FAR_FUTURE, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  } catch (_) { /* best-effort */ }
}

const dispatchFollowups = onSchedule("every 5 minutes", async () => {
  const db = getFirestore();
  const now = new Date();
  // Single-field inequality (auto-indexed). Status filtered in code so no
  // composite index is needed; resolved docs are parked at FAR_FUTURE.
  const snap = await db.collection("followup_queue")
    .where("nextAttemptAt", "<=", now)
    .limit(100)
    .get();
  if (snap.empty) return;

  const voiceService = require("./voice_service.js");   // lazy — break the require cycle
  let placed = 0, deferred = 0, failed = 0;

  for (const doc of snap.docs) {
    const f = doc.data();
    if (f.status !== "pending") continue;

    // Activity-hours guard — push to the next window instead of night-calling.
    const wait = msUntilWindow(f.timezone || DEFAULT_TZ);
    if (wait > 0) {
      await doc.ref.set({nextAttemptAt: new Date(Date.now() + wait), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      deferred++;
      continue;
    }

    // Mark "calling" BEFORE dialing so the next tick won't double-dial. The
    // call's end-of-call handler re-enqueues (reschedule) or clears this lead.
    await doc.ref.set({status: "calling", lastDispatchedAt: FieldValue.serverTimestamp()}, {merge: true});
    try {
      await voiceService._placeCallInternal({
        number: f.phone,
        companyPhone: f.companyPhone,
        assistantId: f.assistantId,
        metadata: {leadId: f.leadId, campaignId: f.campaignId || null, ownerId: f.ownerId || null, followup: true, attempt: f.attemptCount},
      }, f.ownerId || null);
      placed++;
    } catch (e) {
      failed++;
      logger.warn("[followup] place failed — backing off 1h", {leadId: f.leadId, err: e.message});
      await doc.ref.set({status: "pending", nextAttemptAt: new Date(Date.now() + 3600e3), lastError: e.message, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  }
  logger.info("[followup] dispatch done", {scanned: snap.size, placed, deferred, failed});
});

module.exports = {enqueueFollowup, clearFollowup, dispatchFollowups};
