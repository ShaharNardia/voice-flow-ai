/**
 * Admin Phone Service — cross-user phone number management + integration health checks.
 * All endpoints require admin role.
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest} = require("./security_utils");
const twilio = require("twilio");
const axios = require("axios");

/** Detect country from phone E.164 prefix (Twilio isoCountry is sometimes wrong) */
function detectCountryFromNumber(phoneNumber, twilioCountry) {
  if (phoneNumber.startsWith("+972")) return "IL";
  if (phoneNumber.startsWith("+44"))  return "GB";
  if (phoneNumber.startsWith("+49"))  return "DE";
  if (phoneNumber.startsWith("+33"))  return "FR";
  if (phoneNumber.startsWith("+61"))  return "AU";
  if (phoneNumber.startsWith("+55"))  return "BR";
  if (phoneNumber.startsWith("+91"))  return "IN";
  if (phoneNumber.startsWith("+81"))  return "JP";
  if (phoneNumber.startsWith("+86"))  return "CN";
  if (phoneNumber.startsWith("+1"))   return "US";
  return twilioCountry || "US";
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.web\.app$/,
    /\.firebaseapp\.com$/,
  ],
};

// ── Credentials ───────────────────────────────────────────────────────────────
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const STRIPE_SECRET_KEY  = process.env.STRIPE_SECRET_KEY;
const SENDGRID_API_KEY   = process.env.SENDGRID_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEEPGRAM_API_KEY   = process.env.DEEPGRAM_API_KEY;
const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

// ── Admin check (self-contained) ──────────────────────────────────────────────
async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  const db = getFirestore();
  let role = null;
  const newDoc = await db.collection("users").doc(uid).get();
  if (newDoc.exists) {
    role = newDoc.data().role;
  } else {
    const legacyDoc = await db.collection("user").doc(uid).get();
    if (legacyDoc.exists) role = legacyDoc.data().role;
  }
  if (role !== "admin") {
    res.status(403).json({status: "error", message: "Forbidden. Admin only."});
    return null;
  }
  return uid;
}

// ── adminListAllPhoneNumbers ───────────────────────────────────────────────────
/**
 * GET /adminListAllPhoneNumbers
 * Returns all Twilio phone numbers in the account, cross-referenced with Firestore owners.
 */
exports.adminListAllPhoneNumbers = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const client = getTwilioClient();
    if (!client) {
      res.status(500).json({status: "error", message: "Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."});
      return;
    }

    const db = getFirestore();

    // Fetch all numbers from Twilio
    const twilioNumbers = await client.incomingPhoneNumbers.list({limit: 200});

    // Fetch all phone_numbers docs from Firestore
    const phoneSnap = await db.collection("phone_numbers").get();
    const phoneMap = {}; // sid → { ownerId, firestoreId }
    const phoneMapByNumber = {}; // phoneNumber → { ownerId, firestoreId }
    phoneSnap.forEach((d) => {
      const data = d.data();
      const sid = data.sid || data.twilioSid;
      const num = data.phoneNumber || data.number;
      if (sid) phoneMap[sid] = {ownerId: data.ownerId, firestoreId: d.id};
      if (num) phoneMapByNumber[num] = {ownerId: data.ownerId, firestoreId: d.id};
    });

    // Collect all unique ownerIds
    const ownerIds = new Set();
    for (const tn of twilioNumbers) {
      const info = phoneMap[tn.sid] || phoneMapByNumber[tn.phoneNumber];
      if (info && info.ownerId) ownerIds.add(info.ownerId);
    }

    // Fetch user emails in batch
    const userEmailMap = {};
    if (ownerIds.size > 0) {
      const userDocs = await db.collection("users").get();
      userDocs.forEach((d) => {
        if (ownerIds.has(d.id)) userEmailMap[d.id] = d.data().email || d.data().displayName || d.id;
      });
      // Also check legacy users if needed
      const legacyDocs = await db.collection("user").get();
      legacyDocs.forEach((d) => {
        if (ownerIds.has(d.id) && !userEmailMap[d.id]) {
          userEmailMap[d.id] = d.data().email || d.id;
        }
      });
    }

    const result = twilioNumbers.map((tn) => {
      const info = phoneMap[tn.sid] || phoneMapByNumber[tn.phoneNumber] || {};
      return {
        sid: tn.sid,
        phoneNumber: tn.phoneNumber,
        friendlyName: tn.friendlyName || tn.phoneNumber,
        country: detectCountryFromNumber(tn.phoneNumber, tn.isoCountry),
        voiceUrl: tn.voiceUrl || null,
        smsUrl: tn.smsUrl || null,
        ownerId: info.ownerId || null,
        ownerEmail: info.ownerId ? (userEmailMap[info.ownerId] || info.ownerId) : null,
        firestoreId: info.firestoreId || null,
        dateCreated: tn.dateCreated ? tn.dateCreated.toISOString() : null,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error("adminListAllPhoneNumbers failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to list phone numbers"});
  }
});

// ── adminReleasePhoneNumber ────────────────────────────────────────────────────
/**
 * POST /adminReleasePhoneNumber  { sid, phoneNumber? }
 * Releases a Twilio number and removes it from Firestore.
 */
exports.adminReleasePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {sid, phoneNumber} = body;

    if (!sid) {
      res.status(400).json({status: "error", message: "sid required"});
      return;
    }

    const client = getTwilioClient();
    if (!client) {
      res.status(500).json({status: "error", message: "Twilio not configured."});
      return;
    }

    const db = getFirestore();

    // Release from Twilio
    await client.incomingPhoneNumbers(sid).remove();

    // Remove from Firestore phone_numbers collection (search by sid or phoneNumber)
    const queries = [
      db.collection("phone_numbers").where("sid", "==", sid).limit(5).get(),
      db.collection("phone_numbers").where("twilioSid", "==", sid).limit(5).get(),
    ];
    if (phoneNumber) {
      queries.push(db.collection("phone_numbers").where("phoneNumber", "==", phoneNumber).limit(5).get());
      queries.push(db.collection("phone_numbers").where("number", "==", phoneNumber).limit(5).get());
    }

    const snaps = await Promise.all(queries);
    const batch = db.batch();
    const deleted = new Set();
    for (const snap of snaps) {
      snap.forEach((d) => {
        if (!deleted.has(d.id)) {
          batch.delete(d.ref);
          deleted.add(d.id);
        }
      });
    }
    if (deleted.size > 0) await batch.commit();

    res.status(200).json({status: "success", sid, phoneNumber, deletedDocs: deleted.size});
  } catch (error) {
    logger.error("adminReleasePhoneNumber failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to release phone number"});
  }
});

// ── adminReassignPhoneNumber ───────────────────────────────────────────────────
/**
 * POST /adminReassignPhoneNumber  { sid, phoneNumber?, newOwnerId }
 * Reassigns ownership of a phone number in Firestore.
 */
exports.adminReassignPhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {sid, phoneNumber, newOwnerId} = body;

    if (!sid || !newOwnerId) {
      res.status(400).json({status: "error", message: "sid and newOwnerId required"});
      return;
    }

    const db = getFirestore();

    // Find the Firestore doc
    const queries = [
      db.collection("phone_numbers").where("sid", "==", sid).limit(3).get(),
      db.collection("phone_numbers").where("twilioSid", "==", sid).limit(3).get(),
    ];
    if (phoneNumber) {
      queries.push(db.collection("phone_numbers").where("phoneNumber", "==", phoneNumber).limit(3).get());
    }

    const snaps = await Promise.all(queries);
    const batch = db.batch();
    const updated = new Set();

    for (const snap of snaps) {
      snap.forEach((d) => {
        if (!updated.has(d.id)) {
          batch.update(d.ref, {
            ownerId: newOwnerId,
            updatedAt: FieldValue.serverTimestamp(),
            reassignedBy: callerUid,
          });
          updated.add(d.id);
        }
      });
    }

    if (updated.size > 0) {
      await batch.commit();
    } else {
      // Number not in Firestore — create a doc for it
      await db.collection("phone_numbers").add({
        sid,
        phoneNumber: phoneNumber || null,
        ownerId: newOwnerId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        reassignedBy: callerUid,
      });
    }

    res.status(200).json({status: "success", sid, newOwnerId, updatedDocs: updated.size || 1});
  } catch (error) {
    logger.error("adminReassignPhoneNumber failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to reassign phone number"});
  }
});

// ── adminCheckIntegrations ─────────────────────────────────────────────────────
/**
 * GET /adminCheckIntegrations
 * Tests live connectivity for all configured external services.
 * Uses Promise.allSettled so one failure doesn't block others.
 */
exports.adminCheckIntegrations = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  // Helper: timeout wrapper
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
    ]);
  }

  // Individual service checks
  async function checkTwilio() {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return {status: "not_configured", label: "Twilio", detail: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set"};
    }
    try {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const account = await withTimeout(client.api.accounts(TWILIO_ACCOUNT_SID).fetch(), 5000);
      const numbersPage = await withTimeout(client.incomingPhoneNumbers.list({limit: 5}), 5000);
      return {
        status: "ok",
        label: "Twilio",
        detail: `${account.friendlyName} · ${account.status} · ${numbersPage.length}+ numbers`,
        accountSid: account.sid ? account.sid.slice(0, 10) + "..." : null,
      };
    } catch (err) {
      return {status: "error", label: "Twilio", detail: err.message || "Connection failed"};
    }
  }

  async function checkStripe() {
    if (!STRIPE_SECRET_KEY) {
      return {status: "not_configured", label: "Stripe", detail: "STRIPE_SECRET_KEY not set"};
    }
    try {
      const stripe = require("stripe")(STRIPE_SECRET_KEY);
      const account = await withTimeout(stripe.accounts.retrieve(), 5000);
      const mode = STRIPE_SECRET_KEY.startsWith("sk_live") ? "live mode" : "test mode";
      return {
        status: "ok",
        label: "Stripe",
        detail: `${account.business_profile?.name || account.email || account.id} · ${mode}`,
        mode,
      };
    } catch (err) {
      return {status: "error", label: "Stripe", detail: err.message || "Connection failed"};
    }
  }

  async function checkSendGrid() {
    if (!SENDGRID_API_KEY) {
      return {status: "not_configured", label: "SendGrid", detail: "SENDGRID_API_KEY not set"};
    }
    try {
      const response = await withTimeout(axios.get("https://api.sendgrid.com/v3/user/account", {
        headers: {Authorization: `Bearer ${SENDGRID_API_KEY}`},
        timeout: 5000,
      }), 5000);
      return {
        status: "ok",
        label: "SendGrid",
        detail: response.data?.email || "Connected",
      };
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.message || "Connection failed";
      return {status: "error", label: "SendGrid", detail: msg};
    }
  }

  async function checkElevenLabs() {
    if (!ELEVENLABS_API_KEY) {
      return {status: "not_configured", label: "ElevenLabs", detail: "ELEVENLABS_API_KEY not set"};
    }
    try {
      const response = await withTimeout(axios.get("https://api.elevenlabs.io/v1/user", {
        headers: {"xi-api-key": ELEVENLABS_API_KEY},
        timeout: 5000,
      }), 5000);
      const sub = response.data?.subscription;
      return {
        status: "ok",
        label: "ElevenLabs",
        detail: sub ? `${sub.tier} · ${sub.character_count || 0} chars used` : "Connected",
      };
    } catch (err) {
      const msg = err.response?.data?.detail?.message || err.message || "Connection failed";
      return {status: "error", label: "ElevenLabs", detail: msg};
    }
  }

  async function checkDeepgram() {
    if (!DEEPGRAM_API_KEY) {
      return {status: "not_configured", label: "Deepgram", detail: "DEEPGRAM_API_KEY not set"};
    }
    try {
      const response = await withTimeout(axios.get("https://api.deepgram.com/v1/auth/token", {
        headers: {Authorization: `Token ${DEEPGRAM_API_KEY}`},
        timeout: 5000,
      }), 5000);
      return {
        status: "ok",
        label: "Deepgram",
        detail: response.data?.member?.email || "Connected",
      };
    } catch (err) {
      const msg = err.response?.data?.err_msg || err.message || "Connection failed";
      return {status: "error", label: "Deepgram", detail: msg};
    }
  }

  async function checkOpenAI() {
    if (!OPENAI_API_KEY) {
      return {status: "not_configured", label: "OpenAI", detail: "OPENAI_API_KEY not set"};
    }
    try {
      const response = await withTimeout(axios.get("https://api.openai.com/v1/models?limit=1", {
        headers: {Authorization: `Bearer ${OPENAI_API_KEY}`},
        timeout: 5000,
      }), 5000);
      const modelCount = response.data?.data?.length || 0;
      return {
        status: "ok",
        label: "OpenAI",
        detail: modelCount > 0 ? "API key valid · GPT models available" : "Connected",
      };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || "Connection failed";
      return {status: "error", label: "OpenAI", detail: msg};
    }
  }

  try {
    const [twRes, strRes, sgRes, elRes, dgRes, oaRes] = await Promise.allSettled([
      checkTwilio(),
      checkStripe(),
      checkSendGrid(),
      checkElevenLabs(),
      checkDeepgram(),
      checkOpenAI(),
    ]);

    const extract = (settled) =>
      settled.status === "fulfilled"
        ? settled.value
        : {status: "error", label: "Unknown", detail: settled.reason?.message || "Internal error"};

    res.status(200).json({
      twilio:     extract(twRes),
      stripe:     extract(strRes),
      sendgrid:   extract(sgRes),
      elevenlabs: extract(elRes),
      deepgram:   extract(dgRes),
      openai:     extract(oaRes),
      checkedAt:  new Date().toISOString(),
    });
  } catch (error) {
    logger.error("adminCheckIntegrations failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to check integrations"});
  }
});
