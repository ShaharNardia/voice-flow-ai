/**
 * Appointments Service â€” endpoints for listing, creating, and cancelling
 * appointments booked by an assistant (or manually). Primary booking path
 * is the `book_appointment` assistant tool in llm_service.js, which calls
 * `createAppointmentInternal` directly.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest} = require("./security_utils");
const {featureEnabledForUser, requireFeature} = require("./feature_gate");
const {buildIcs, renderInviteHtml, sendInviteEmail} = require("./calendar_invites");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

/**
 * Internal helper â€” callable from tool handlers. Creates the appointment doc
 * and sends the invite email. Returns {id, startAt, endAt}.
 *
 * @param {Object} params
 * @param {string} params.ownerId        - UID of the business owner
 * @param {string} [params.assistantId]  - Assistant that booked (optional)
 * @param {string} [params.callSessionId]
 * @param {string} params.title
 * @param {Date|string} params.startAt
 * @param {Date|string} params.endAt
 * @param {string} [params.attendeeName]
 * @param {string} [params.attendeeEmail]
 * @param {string} [params.attendeePhone]
 * @param {string} [params.location]
 * @param {string} [params.notes]
 * @param {string} [params.timezone]
 */
async function createAppointmentInternal(params) {
  const {
    ownerId, assistantId = null, callSessionId = null,
    title, startAt, endAt,
    attendeeName = "", attendeeEmail = "", attendeePhone = "",
    location = "", notes = "", timezone = "",
  } = params;

  if (!ownerId) throw new Error("ownerId required");
  if (!title) throw new Error("title required");
  const start = startAt instanceof Date ? startAt : new Date(startAt);
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  if (isNaN(+start) || isNaN(+end)) throw new Error("startAt and endAt must be valid datetimes");
  if (+end <= +start) throw new Error("endAt must be after startAt");

  const db = getFirestore();
  const ref = await db.collection("appointments").add({
    ownerId, assistantId, callSessionId,
    title, startAt: start, endAt: end,
    attendeeName, attendeeEmail, attendeePhone,
    location, notes, timezone,
    status: "scheduled",
    reminder24hSent: false,
    reminder15mSent: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Fire invite emails â€” one to attendee (if email), one to business owner.
  // Feature-gated on cap.calendarInvites for the owner.
  (async () => {
    try {
      const sendEnabled = await featureEnabledForUser(ownerId, "cap.calendarInvites");
      if (!sendEnabled) return;

      const ownerRec = await admin.auth().getUser(ownerId).catch(() => null);
      const ownerEmail = ownerRec?.email;

      const description = notes || "Booked via VoiceFlow AI.";
      const ics = buildIcs({
        uid: `appt-${ref.id}@voiceflow-ai`,
        title,
        description,
        startAt: start,
        endAt: end,
        location,
        organizerEmail: ownerEmail || process.env.SENDGRID_FROM_EMAIL,
        attendeeEmail,
      });
      const html = renderInviteHtml({
        title, description,
        startAt: start, endAt: end,
        location,
      });
      const subject = `Appointment confirmed â€” ${start.toLocaleString()}`;

      const targets = [];
      if (attendeeEmail) targets.push(attendeeEmail);
      if (ownerEmail && ownerEmail !== attendeeEmail) targets.push(ownerEmail);
      for (const to of targets) {
        await sendInviteEmail({to, subject, htmlBody: html, icsText: ics});
      }
    } catch (err) {
      logger.warn("Appointment invite email failed", ref.id, err?.message);
    }
  })();

  return {id: ref.id, startAt: start.toISOString(), endAt: end.toISOString()};
}

/**
 * POST /appointmentsCreate â€” manual create (non-assistant path).
 */
exports.bookingsCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  if (!(await requireFeature(req, res, uid, "cap.appointments"))) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = await createAppointmentInternal({
      ownerId: uid,
      assistantId: body.assistantId,
      title: body.title,
      startAt: body.startAt,
      endAt: body.endAt,
      attendeeName: body.attendeeName,
      attendeeEmail: body.attendeeEmail,
      attendeePhone: body.attendeePhone,
      location: body.location,
      notes: body.notes,
      timezone: body.timezone,
    });
    res.status(200).json(result);
  } catch (e) {
    logger.error("appointmentsCreate failed", e);
    res.status(400).json({error: e.message || "Failed"});
  }
});

/**
 * GET /appointmentsList â€” current user's appointments.
 */
exports.bookingsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const db = getFirestore();
    const snap = await db.collection("appointments")
      .where("ownerId", "==", uid)
      .limit(500)
      .get();
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        startAt: data.startAt?.toDate?.()?.toISOString() || data.startAt,
        endAt: data.endAt?.toDate?.()?.toISOString() || data.endAt,
        attendeeName: data.attendeeName || "",
        attendeeEmail: data.attendeeEmail || "",
        attendeePhone: data.attendeePhone || "",
        location: data.location || "",
        notes: data.notes || "",
        status: data.status || "scheduled",
        assistantId: data.assistantId || null,
        callSessionId: data.callSessionId || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
    items.sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)));
    res.status(200).json({items});
  } catch (e) {
    logger.error("appointmentsList failed", e);
    res.status(500).json({error: "Failed"});
  }
});

/**
 * POST /appointmentsCancel  { id }
 */
exports.bookingsCancel = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const id = body.id;
    if (!id) { res.status(400).json({error: "id required"}); return; }
    const db = getFirestore();
    const ref = db.collection("appointments").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({error: "Not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({error: "Forbidden"}); return; }
    await ref.set({status: "cancelled", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    res.status(200).json({ok: true});
  } catch (e) {
    logger.error("appointmentsCancel failed", e);
    res.status(500).json({error: "Failed"});
  }
});

/**
 * POST /bookingsUpdate  { id, ...fields }  — edit a manually-managed appointment.
 * Whitelisted fields; ownership enforced; validates time ordering if both given.
 */
exports.bookingsUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  if (!(await requireFeature(req, res, uid, "cap.appointments"))) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const id = body.id;
    if (!id) { res.status(400).json({error: "id required"}); return; }
    const db = getFirestore();
    const ref = db.collection("appointments").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({error: "Not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({error: "Forbidden"}); return; }

    const cur = snap.data();
    const upd = {updatedAt: FieldValue.serverTimestamp()};
    if (typeof body.title === "string" && body.title.trim()) upd.title = body.title.trim();
    if (body.startAt != null) { const s = new Date(body.startAt); if (isNaN(+s)) { res.status(400).json({error: "startAt invalid"}); return; } upd.startAt = s; }
    if (body.endAt != null) { const e = new Date(body.endAt); if (isNaN(+e)) { res.status(400).json({error: "endAt invalid"}); return; } upd.endAt = e; }
    for (const f of ["attendeeName", "attendeeEmail", "attendeePhone", "location", "notes", "timezone"]) {
      if (typeof body[f] === "string") upd[f] = body[f];
    }
    if (typeof body.status === "string" && ["scheduled", "cancelled", "completed"].includes(body.status)) upd.status = body.status;

    const finalStart = upd.startAt || cur.startAt?.toDate?.() || cur.startAt;
    const finalEnd = upd.endAt || cur.endAt?.toDate?.() || cur.endAt;
    if (finalStart && finalEnd && +new Date(finalEnd) <= +new Date(finalStart)) {
      res.status(400).json({error: "endAt must be after startAt"}); return;
    }

    await ref.set(upd, {merge: true});
    res.status(200).json({ok: true, id: String(id)});
  } catch (e) {
    logger.error("bookingsUpdate failed", e);
    res.status(500).json({error: "Failed"});
  }
});

exports.createAppointmentInternal = createAppointmentInternal;
