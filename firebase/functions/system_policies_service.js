/**
 * System Policies — admin-editable behavior rules for Gemini Live calls.
 *
 * Replaces hardcoded values in cloud-run/mediastream/index.js:
 *   • voice header / anti-meta-narration rules
 *   • goodbye-detection phrases (Hebrew, Arabic, English, Spanish)
 *   • silence-watchdog threshold + max check-ins
 *   • filler vocabulary (Hebrew + English)
 *   • banned phrases (English narrator-speak the model should not emit)
 *
 * Stored as a SINGLETON Firestore document at system_policies/global.
 * Cloud Run loads + caches policies on call start (see fetchSystemPolicies
 * in index.js); admins edit via /admin/policies.
 *
 * Endpoints:
 *   GET  /getSystemPolicies   (auth: admin) → current policies
 *   POST /updateSystemPolicies { ...fields } (auth: admin) → merge update
 *   GET  /getSystemPoliciesPublic → minimal subset for Cloud Run (no auth — runs
 *                                   under Cloud Run's own service account)
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const REGION = "us-central1";
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

const POLICY_DOC = "system_policies/global";

// ── Default policy — matches what Cloud Run currently hardcodes ──────────────
// Changing these defaults changes behavior for any tenant that hasn't customized.
const DEFAULT_POLICY = {
  voiceHeader: (
    "VOICE CALL — your output is spoken aloud by TTS. " +
    "No markdown, no asterisks, no headers, no stage directions. " +
    "No narrator phrases like \"Initiating Dialogue\" or \"Analyzing Input\". " +
    "Output only the literal words to speak, in plain prose, short sentences.\n" +
    "NEVER promise to call the caller back later, get back to them, follow up, or contact them. " +
    "Either answer now with information you have, or honestly say you don't know that specific thing — " +
    "then offer what you CAN help with. The caller is here right now; help them right now.\n" +
    "Silence is unnatural on a phone call. If you need a moment to think, look something up, or process, " +
    "fill the gap like a real person does — with VARIETY, not the same canned phrase every time. " +
    "Mix it up across turns. Use any of: " +
    "(Hebrew) \"אהה...\", \"אמ...\", \"מממ...\", \"רגע\", \"אוקיי\", \"בוא נראה\", \"תני לי רגע\", \"אהה כן\", " +
    "\"כן כן\", \"אני מסתכל לרגע\", \"אז...\", \"טוב, אז...\" — sometimes nothing at all, just continue the sentence; " +
    "(English) \"um\", \"uh\", \"hmm\", \"okay\", \"right\", \"let me see\", \"one sec\", \"so...\", \"alright\", \"good question\". " +
    "Don't always say \"let me check\" or \"רק שנייה אני בודק\" — that's robotic. Sound human: vary, hesitate naturally, " +
    "use partial words, breaths, small reactions to what the caller said. Never leave silence for more than a second."
  ),

  // Goodbye-detection patterns (one regex per language). The full turn text
  // is checked; goodbye-end-of-turn fires only if the LAST sentence matches
  // AND the last sentence is not a question (handled separately in Cloud Run).
  goodbyePatterns: {
    hebrew:  "(להתראות|להישמע|כל טוב|יום (טוב|נעים)|שיהיה לך יום|תודה (רבה|לך)\\s+ו?(להתראות|שלום|כל טוב)|ביי|שלום\\s*[.!?]?\\s*$)",
    arabic:  "(مع السلامة|إلى اللقاء|وداعاً|اللقاء|يوم(اً)? (سعيد|طيب))",
    english: "\\b(goodbye|good\\s*bye|bye[-\\s]*bye|bye[\\s.!,?]|have a (good|nice|great) (day|one)|take care|talk to you later)\\b",
    spanish: "\\b(adi[óo]s|hasta luego|hasta pronto|que tengas? (un )?buen d[íi]a)\\b",
  },

  // Silence watchdog
  silenceThresholdMs: 12000,
  silenceMaxChecks:   3,

  // Default farewell message when silence-watchdog ends the call
  silenceFarewell: {
    hebrew:  "ניראה לי שאין אף אחד על הקו. תודה ויום נעים, להתראות.",
    arabic:  "يبدو أنه لا يوجد أحد على الخط. شكراً لك ويوماً سعيداً، إلى اللقاء.",
    english: "It sounds like nobody's on the line. Have a nice day, goodbye.",
  },

  // Default check-in phrase
  silenceCheckIn: {
    hebrew:  "אתה עדיין שם? אם כן, אני כאן לעזור.",
    arabic:  "هل ما زلت على الخط؟ أنا هنا للمساعدة.",
    english: "Are you still there? I'm here to help.",
  },

  // KB injection cap (chars)
  maxKbChars: 8000,

  // Max recording duration (seconds) — safety cap
  maxCallDurationSec: 1800,

  // Whether to expose tool-call rows in the conversation history UI
  showToolCallsInTranscript: true,

  // Whether the strip-meta pass runs (set false to debug what model emits raw)
  stripMetaEnabled: true,

  // GLOBAL TELEPHONY OVERRIDE — the master "switch everything off Twilio" lever.
  //   "none"       → normal per-assistant routing (default).
  //   "voximplant" → every assistant whose carrier is Twilio (or unset) places
  //                  OUTBOUND calls via Voximplant instead. Explicit per-assistant
  //                  "sip"/"voximplant" are unaffected. No-ops safely if the
  //                  company has no Voximplant credentials (falls back to Twilio).
  // NOTE: this only moves OUTBOUND dialing. Inbound carrier is determined by
  // where the DID physically lives (porting the numbers to Voximplant is a
  // provisioning step, not a software toggle).
  globalTelephonyOverride: "none",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  const role = u.exists ? u.data().role : null;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin only" });
    return null;
  }
  return uid;
}

async function loadPolicy(db) {
  try {
    const snap = await db.doc(POLICY_DOC).get();
    if (!snap.exists) return DEFAULT_POLICY;
    return { ...DEFAULT_POLICY, ...snap.data() };
  } catch (e) {
    logger.warn("loadPolicy failed, using defaults:", e.message);
    return DEFAULT_POLICY;
  }
}

/**
 * Whitelist a patch against DEFAULT_POLICY keys. Returns a new object that
 * contains only the recognised fields. Exposed for unit tests.
 */
function filterPatch(patch) {
  const allowed = new Set(Object.keys(DEFAULT_POLICY));
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

exports._internal = { DEFAULT_POLICY, filterPatch };

// ── Endpoints ────────────────────────────────────────────────────────────────

exports.getSystemPolicies = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireAdmin(req, res))) return;
  const db = getFirestore();
  const policy = await loadPolicy(db);
  res.json({ policy, defaults: DEFAULT_POLICY });
});

exports.updateSystemPolicies = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;

  const patch = req.body || {};
  // Whitelist mutable fields — refuse anything else (defensive).
  const filtered = filterPatch(patch);
  if (Object.keys(filtered).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  try {
    const db = getFirestore();
    await db.doc(POLICY_DOC).set({
      ...filtered,
      updatedAt:   FieldValue.serverTimestamp(),
      updatedBy:   uid,
    }, { merge: true });
    // Also log the change for audit (never delete this audit log).
    await db.collection("system_policy_audit").add({
      changedBy:   uid,
      changedAt:   FieldValue.serverTimestamp(),
      changedKeys: Object.keys(filtered),
      newValues:   filtered,
    });
    logger.info("System policies updated", { uid, keys: Object.keys(filtered) });
    const policy = await loadPolicy(db);
    res.json({ policy, updated: Object.keys(filtered) });
  } catch (e) {
    logger.error("updateSystemPolicies failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Cloud Run reads this — no auth so the mediastream service can fetch on
 * call start without needing service-account JWT plumbing. The endpoint
 * only returns the policy, never any tenant data, so leak risk is low.
 */
exports.getSystemPoliciesPublic = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const db = getFirestore();
  const policy = await loadPolicy(db);
  res.json({ policy });
});
