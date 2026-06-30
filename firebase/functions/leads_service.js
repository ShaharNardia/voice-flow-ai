/**
 * Leads & Campaigns Service
 *
 * Manages the CRM layer: leads (imported from XLSX), outbound calling
 * campaigns, and appointment calendar queries.
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {extractUidFromRequest} = require("./security_utils");
const {logActivity} = require("./audit_service");
const {checkPlanLimit} = require("./subscription_service");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

/** Extract UID or send 401 */
async function requireAuth(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  return uid;
}

// â”€â”€ Leads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /leadsBatchCreate
 * Body: { campaignId?: string, leads: [{phone, name?, email?, company?, notes?, ...customFields}] }
 * Creates up to 5000 leads in Firestore batches of 500.
 */
exports.leadsBatchCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {campaignId, leads} = req.body || {};

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({status: "error", message: "leads array is required"});
  }
  if (leads.length > 5000) {
    return res.status(400).json({status: "error", message: "Maximum 5000 leads per batch"});
  }

  // Check plan limit
  if (uid) {
    const planCheck = await checkPlanLimit(uid, "leads");
    if (!planCheck.allowed) {
      res.status(403).json({
        status: "error",
        code: "plan_limit_reached",
        message: `Lead limit reached (${planCheck.current}/${planCheck.limit} on ${planCheck.plan} plan). Upgrade to import more leads.`,
      });
      return;
    }
  }

  const now = FieldValue.serverTimestamp();
  let created = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk = leads.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const lead of chunk) {
      if (!lead.phone) continue; // phone required
      const {phone, name, email, company, notes, ...rest} = lead;
      const docRef = db.collection("leads").doc();
      batch.set(docRef, {
        phone: String(phone).trim(),
        name: name ? String(name).trim() : null,
        email: email ? String(email).trim() : null,
        company: company ? String(company).trim() : null,
        notes: notes ? String(notes).trim() : null,
        customFields: rest || {},
        status: "new",
        campaignId: campaignId || null,
        assistantId: null,
        callCount: 0,
        lastCallId: null,
        lastCallDate: null,
        lastCallSummary: null,
        lastCallOutcome: null,
        ownerId: uid,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    await batch.commit();
  }

  // Update campaign leadCount
  if (campaignId && created > 0) {
    await db.collection("campaigns").doc(campaignId).set(
      {leadCount: FieldValue.increment(created), updatedAt: now},
      {merge: true},
    ).catch(() => {});
  }

  logger.info("leadsBatchCreate", {uid, campaignId, created});
  res.status(201).json({status: "success", created});
  logActivity({ userId: uid, action: "lead.batch_create", category: "lead", resourceType: "lead", details: {count: created} }).catch(() => {});
});

/**
 * POST /leadsUpdate
 * Body: { id, ...fields }
 */
exports.leadsUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {id, ...fields} = req.body || {};
  if (!id) return res.status(400).json({status: "error", message: "id required"});

  const docRef = db.collection("leads").doc(id);
  const snap = await docRef.get();
  if (!snap.exists || snap.data().ownerId !== uid) {
    return res.status(404).json({status: "error", message: "Lead not found"});
  }

  const allowed = ["name", "email", "company", "phone", "notes", "status", "customFields"];
  const update = {updatedAt: FieldValue.serverTimestamp()};
  for (const key of allowed) {
    if (fields[key] !== undefined) update[key] = fields[key];
  }
  await docRef.set(update, {merge: true});
  res.json({status: "success", id});
  logActivity({ userId: uid, action: "lead.update", category: "lead", resourceType: "lead", resourceId: id }).catch(() => {});
});

/**
 * POST /leadsDelete
 * Body: { id }
 */
exports.leadsDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {id} = req.body || {};
  if (!id) return res.status(400).json({status: "error", message: "id required"});

  const docRef = db.collection("leads").doc(id);
  const snap = await docRef.get();
  if (!snap.exists || snap.data().ownerId !== uid) {
    return res.status(404).json({status: "error", message: "Lead not found"});
  }
  await docRef.delete();
  res.json({status: "success", id});
  logActivity({ userId: uid, action: "lead.delete", category: "lead", resourceType: "lead", resourceId: id }).catch(() => {});
});

// â”€â”€ Campaigns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /campaignsCreate
 * Body: { name, assistantId, fromNumber, description? }
 */
exports.campaignsCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {name, assistantId, fromNumber, description, autoDial, callWindowStart, callWindowEnd, timezone, batchSize} = req.body || {};
  if (!name || !assistantId || !fromNumber) {
    return res.status(400).json({status: "error", message: "name, assistantId, fromNumber required"});
  }

  // Check plan limit
  if (uid) {
    const planCheck = await checkPlanLimit(uid, "campaigns");
    if (!planCheck.allowed) {
      res.status(403).json({
        status: "error",
        code: "plan_limit_reached",
        message: `Campaign limit reached (${planCheck.current}/${planCheck.limit} on ${planCheck.plan} plan). Upgrade to create more campaigns.`,
      });
      return;
    }
  }

  const now = FieldValue.serverTimestamp();
  const docRef = db.collection("campaigns").doc();
  const data = {
    id: docRef.id,
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    assistantId,
    fromNumber,
    status: "draft",
    leadCount: 0,
    calledCount: 0,
    successCount: 0,
    failedCount: 0,
    // Scheduled auto-dialer (Phase B): when autoDial is on and status is
    // "running", dispatchCampaigns dials the next batch every 5 min, but ONLY
    // inside [callWindowStart, callWindowEnd) in the campaign's timezone.
    autoDial: autoDial === true,
    callWindowStart: Number.isFinite(callWindowStart) ? Math.max(0, Math.min(23, callWindowStart)) : 9,
    callWindowEnd: Number.isFinite(callWindowEnd) ? Math.max(1, Math.min(24, callWindowEnd)) : 20,
    timezone: (typeof timezone === "string" && timezone) ? timezone : "Asia/Jerusalem",
    batchSize: Number.isFinite(batchSize) ? Math.max(1, Math.min(20, batchSize)) : 5,
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
  };
  await docRef.set(data);
  logger.info("campaignsCreate", {uid, campaignId: docRef.id});
  res.status(201).json({...data, id: docRef.id});
  logActivity({ userId: uid, action: "campaign.create", category: "campaign", resourceType: "campaign", resourceId: docRef.id, details: {name} }).catch(() => {});
});

/**
 * GET /campaignsList
 */
exports.campaignsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const snap = await db.collection("campaigns")
    .where("ownerId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const campaigns = snap.docs.map((d) => ({id: d.id, ...d.data()}));
  res.json(campaigns);
});

/**
 * POST /campaignStart
 * Body: { campaignId, batchSize?: number }
 * Queues the next N uncontacted leads for outbound calls.
 */
exports.campaignStart = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {campaignId, batchSize = 10} = req.body || {};
  if (!campaignId) return res.status(400).json({status: "error", message: "campaignId required"});

  // Verify ownership
  const campaignSnap = await db.collection("campaigns").doc(campaignId).get();
  if (!campaignSnap.exists || campaignSnap.data().ownerId !== uid) {
    return res.status(404).json({status: "error", message: "Campaign not found"});
  }
  const campaign = campaignSnap.data();

  // Mark campaign as running
  await db.collection("campaigns").doc(campaignId).set(
    {status: "running", updatedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );

  // Fetch next batch of uncontacted leads
  const leadsSnap = await db.collection("leads")
    .where("campaignId", "==", campaignId)
    .where("status", "==", "new")
    .limit(Number(batchSize))
    .get();

  if (leadsSnap.empty) {
    // All leads contacted â€” mark complete
    await db.collection("campaigns").doc(campaignId).set(
      {status: "completed", updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    // Notify campaign owner
    try {
      const {sendPushToUser} = require("./push_service");
      const campSnap = await db.collection("campaigns").doc(campaignId).get();
      const campOwner = campSnap.exists ? campSnap.data().ownerId : null;
      if (campOwner) {
        const campName = campSnap.data().name || "Campaign";
        await sendPushToUser(campOwner, {
          title: "âœ… Campaign completed",
          body: `"${campName}" â€” all leads have been called.`,
          url: "/leads",
        });
      }
    } catch (_) {}
    return res.json({queued: 0, remaining: 0, status: "completed"});
  }

  // Reuse placeCall logic from voice_service (internal call)
  const voiceService = require("./voice_service");
  const queued = [];
  const errors = [];

  for (const leadDoc of leadsSnap.docs) {
    const lead = leadDoc.data();
    try {
      // Mark as queued first to prevent double-calling
      await leadDoc.ref.set(
        {status: "queued", updatedAt: FieldValue.serverTimestamp()},
        {merge: true},
      );

      // Trigger outbound call via placeCall internal helper
      await voiceService._placeCallInternal({
        number: lead.phone,
        companyPhone: campaign.fromNumber,
        assistantId: campaign.assistantId,
        metadata: {leadId: leadDoc.id, campaignId, leadName: lead.name || ""},
      }, uid);

      queued.push(leadDoc.id);
    } catch (e) {
      logger.warn("campaignStart: call failed for lead", {leadId: leadDoc.id, error: e.message});
      errors.push(leadDoc.id);
      // Reset to new so it can be retried
      await leadDoc.ref.set({status: "new", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  }

  // Count remaining new leads
  const remainingSnap = await db.collection("leads")
    .where("campaignId", "==", campaignId)
    .where("status", "==", "new")
    .get();

  logger.info("campaignStart", {uid, campaignId, queued: queued.length, errors: errors.length});
  res.json({queued: queued.length, errors: errors.length, remaining: remainingSnap.size});
  logActivity({ userId: uid, action: "campaign.start", category: "campaign", resourceType: "campaign", resourceId: campaignId }).catch(() => {});
});

/**
 * POST /campaignPause
 * Body: { campaignId }
 */
exports.campaignPause = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {campaignId} = req.body || {};
  if (!campaignId) return res.status(400).json({status: "error", message: "campaignId required"});

  const snap = await db.collection("campaigns").doc(campaignId).get();
  if (!snap.exists || snap.data().ownerId !== uid) {
    return res.status(404).json({status: "error", message: "Campaign not found"});
  }

  await db.collection("campaigns").doc(campaignId).set(
    {status: "paused", updatedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  res.json({status: "paused"});
});

/**
 * POST /campaignsUpdate
 * Body: { campaignId, ...fields }  — edit scheduling/auto-dial settings.
 * Whitelisted fields only; ownership enforced.
 */
exports.campaignsUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {campaignId} = req.body || {};
  if (!campaignId) return res.status(400).json({status: "error", message: "campaignId required"});
  const ref = db.collection("campaigns").doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().ownerId !== uid) {
    return res.status(404).json({status: "error", message: "Campaign not found"});
  }

  const b = req.body || {};
  const upd = {updatedAt: FieldValue.serverTimestamp()};
  if (typeof b.name === "string") upd.name = b.name.trim();
  if (typeof b.description === "string") upd.description = b.description.trim();
  if (typeof b.assistantId === "string") upd.assistantId = b.assistantId;
  if (typeof b.fromNumber === "string") upd.fromNumber = b.fromNumber;
  if (typeof b.autoDial === "boolean") upd.autoDial = b.autoDial;
  if (Number.isFinite(b.callWindowStart)) upd.callWindowStart = Math.max(0, Math.min(23, b.callWindowStart));
  if (Number.isFinite(b.callWindowEnd)) upd.callWindowEnd = Math.max(1, Math.min(24, b.callWindowEnd));
  if (typeof b.timezone === "string" && b.timezone) upd.timezone = b.timezone;
  if (Number.isFinite(b.batchSize)) upd.batchSize = Math.max(1, Math.min(20, b.batchSize));

  await ref.set(upd, {merge: true});
  res.json({status: "success", id: campaignId});
  logActivity({userId: uid, action: "campaign.update", category: "campaign", resourceType: "campaign", resourceId: campaignId}).catch(() => {});
});

// â”€â”€ Appointments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /appointmentsList?assistantId=&from=&to=
 * Returns appointments joined with call_sessions.analysis.summary
 */
exports.appointmentsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getFirestore();
  const {assistantId, from, to} = req.query || {};

  // Get companyId for this user
  const userSnap = await db.collection("users").doc(uid).get();
  const companyId = userSnap.exists ? userSnap.data().companyId || uid : uid;

  let q = db.collection("appointments")
    .where("companyId", "in", [companyId, uid])
    .orderBy("createdAt", "desc")
    .limit(200);

  if (assistantId) {
    q = db.collection("appointments")
      .where("companyId", "in", [companyId, uid])
      .where("assistantId", "==", assistantId)
      .orderBy("createdAt", "desc")
      .limit(200);
  }

  const snap = await q.get();
  const appointments = [];

  for (const doc of snap.docs) {
    const appt = {id: doc.id, ...doc.data()};

    // Date range filter
    if (from || to) {
      const apptDate = appt.createdAt?.toDate?.() || new Date(0);
      if (from && apptDate < new Date(from)) continue;
      if (to && apptDate > new Date(to)) continue;
    }

    // Join call_sessions for analysis summary
    if (appt.callSessionId) {
      try {
        const sessionSnap = await db.collection("call_sessions").doc(appt.callSessionId).get();
        if (sessionSnap.exists) {
          const session = sessionSnap.data();
          appt.analysis = session.analysis || null;
          appt.assistantName = appt.assistantName || session.assistantDefinition?.name || session.assistantName || null;
          appt.assistantId = appt.assistantId || session.assistantId || null;
        }
      } catch (_) {}
    }

    appointments.push(appt);
  }

  res.json(appointments);
});
