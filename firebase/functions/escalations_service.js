/**
 * escalations_service.js — read/resolve the follow-up queue + escalations that
 * followups_service.js writes. Powers the Follow-ups / Escalations dashboard.
 *
 *   followup_queue/{leadId} — transient retry queue (the scheduler dials these)
 *   escalations/{leadId}    — durable, human-actionable (bot gave up → take over)
 *
 * All endpoints are auth-gated and ownerId-scoped (same pattern as
 * leads_service.js). Queries use a single ownerId filter (auto-indexed) and
 * sort/filter in code, so no composite Firestore index is required.
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {extractUidFromRequest} = require("./security_utils");
const {logActivity} = require("./audit_service");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

async function requireAuth(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized."}); return null; }
  return uid;
}

function ms(v) {
  // normalize Firestore Timestamp | Date | ISO string → epoch ms (for sorting)
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return +v.toDate();
  const t = +new Date(v);
  return isNaN(t) ? 0 : t;
}

/** GET /followupsList — the caller's pending/active follow-up queue. */
exports.followupsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const snap = await db.collection("followup_queue").where("ownerId", "==", uid).limit(300).get();
    const items = snap.docs
      .map((d) => ({id: d.id, ...d.data()}))
      .filter((x) => x.status === "pending" || x.status === "calling")   // active only
      .sort((a, b) => ms(a.nextAttemptAt) - ms(b.nextAttemptAt));
    res.json(items);
  } catch (e) {
    logger.error("followupsList failed", e.message);
    res.status(500).json({status: "error", message: e.message});
  }
});

/** GET /escalationsList — the caller's OPEN escalations (leads needing a human). */
exports.escalationsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const snap = await db.collection("escalations").where("ownerId", "==", uid).limit(300).get();
    const items = snap.docs
      .map((d) => ({id: d.id, ...d.data()}))
      .filter((x) => (x.status || "open") === "open")
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));   // newest first
    res.json(items);
  } catch (e) {
    logger.error("escalationsList failed", e.message);
    res.status(500).json({status: "error", message: e.message});
  }
});

/** POST /escalationResolve { leadId, notes? } — mark handled + clear the lead flag. */
exports.escalationResolve = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;
  const body = req.body || {};
  const leadId = body.leadId;
  if (!leadId) { res.status(400).json({status: "error", message: "leadId required"}); return; }
  try {
    const db = getFirestore();
    const ref = db.collection("escalations").doc(String(leadId));
    const snap = await ref.get();
    if (!snap.exists || (snap.data().ownerId && snap.data().ownerId !== uid)) {
      res.status(404).json({status: "error", message: "Escalation not found"}); return;
    }
    await ref.set({
      status: "resolved",
      notes: body.notes || null,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    // Clear the lead's needs-human flag (best-effort) + stop any further follow-ups.
    await db.collection("leads").doc(String(leadId)).set(
      {status: "completed", needsHuman: false, updatedAt: FieldValue.serverTimestamp()}, {merge: true}).catch(() => {});
    await db.collection("followup_queue").doc(String(leadId)).set(
      {status: "done", updatedAt: FieldValue.serverTimestamp()}, {merge: true}).catch(() => {});

    res.json({status: "success", id: String(leadId)});
    logActivity({userId: uid, action: "escalation.resolve", category: "escalation", resourceType: "escalation", resourceId: String(leadId), details: {notes: body.notes || null}}).catch(() => {});
  } catch (e) {
    logger.error("escalationResolve failed", e.message);
    res.status(500).json({status: "error", message: e.message});
  }
});

module.exports = {
  followupsList: exports.followupsList,
  escalationsList: exports.escalationsList,
  escalationResolve: exports.escalationResolve,
};
