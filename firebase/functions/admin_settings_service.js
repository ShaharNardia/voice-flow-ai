/**
 * Admin Settings Service — plan config, subscriptions, API key metadata, system settings.
 * All endpoints require admin role.
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest} = require("./security_utils");

// ── Hardcoded fallback plan limits (mirrors subscription_service.js PLAN_LIMITS) ──
const DEFAULT_PLAN_LIMITS = {
  basic: {assistants: 1, minutesPerMonth: 50, leads: 100, campaigns: 0, knowledgeBase: false, analytics: false, calendar: false, whatsapp: false, callHistoryLimit: 10},
  pro:   {assistants: 10, minutesPerMonth: 2000, leads: 5000, campaigns: 10, knowledgeBase: true, analytics: true, calendar: true, whatsapp: true, callHistoryLimit: null},
  scale: {assistants: 999, minutesPerMonth: 10000, leads: 999999, campaigns: 999, knowledgeBase: true, analytics: true, calendar: true, whatsapp: true, callHistoryLimit: null},
};

// ── Admin check helper (self-contained, no cross-file dependency) ──
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

// ── Allowed API key names ──────────────────────────────────────────────────
const ALLOWED_KEY_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_SCALE_PRICE_ID",
  "ELEVENLABS_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
];

// ── Default system settings ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  appName: "VoiceFlow AI",
  supportEmail: "support@voiceflow.ai",
  defaultPlan: "basic",
  featureFlags: {
    onboardingWizard: true,
    stripeLiveMode: false,
    maintenanceMode: false,
  },
};

// ── adminGetSubscriptions ──────────────────────────────────────────────────
/**
 * GET /adminGetSubscriptions
 * Returns all users with their plan, Stripe info, and minutes used this month.
 */
exports.adminGetSubscriptions = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();

    // Fetch all Firebase Auth users
    const listResult = await admin.auth().listUsers(1000);
    const authUsers = listResult.users;

    // Fetch all Firestore user docs
    const userDocs = await db.collection("users").get();
    const userMap = {};
    userDocs.forEach((d) => { userMap[d.id] = d.data(); });

    // Compute minutes used this month per user from call_sessions
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const callsSnap = await db.collection("call_sessions")
      .where("createdAt", ">=", startOfMonth)
      .get();

    const minutesMap = {};
    callsSnap.forEach((d) => {
      const data = d.data();
      const oid = data.ownerId;
      if (!oid) return;
      const mins = typeof data.duration === "number" ? Math.ceil(data.duration / 60) : 2;
      minutesMap[oid] = (minutesMap[oid] || 0) + mins;
    });

    const result = authUsers.map((authUser) => {
      const profile = userMap[authUser.uid] || {};
      return {
        uid: authUser.uid,
        email: authUser.email || "",
        displayName: profile.displayName || authUser.displayName || "",
        plan: profile.plan || (profile.subscribed === true ? "pro" : "basic"),
        stripeCustomerId: profile.stripe_customer_id || null,
        stripeSubscriptionId: profile.stripe_subscription_id || null,
        stripeStatus: profile.stripe_subscription_status || null,
        minutesUsedThisMonth: minutesMap[authUser.uid] || 0,
      };
    });

    // Sort by plan (scale → pro → basic), then by email
    const planOrder = {scale: 0, pro: 1, basic: 2};
    result.sort((a, b) => {
      const po = (planOrder[a.plan] ?? 2) - (planOrder[b.plan] ?? 2);
      if (po !== 0) return po;
      return a.email.localeCompare(b.email);
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error("adminGetSubscriptions failed", error);
    res.status(500).json({status: "error", message: "Failed to load subscriptions"});
  }
});

// ── adminOverridePlan ──────────────────────────────────────────────────────
/**
 * POST /adminOverridePlan  { uid, plan }
 * Manually set a user's plan, bypassing Stripe.
 */
exports.adminOverridePlan = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {uid, plan} = body;

    if (!uid) {
      res.status(400).json({status: "error", message: "uid required"});
      return;
    }
    if (!["basic", "pro", "scale"].includes(plan)) {
      res.status(400).json({status: "error", message: "plan must be basic, pro, or scale"});
      return;
    }

    const db = getFirestore();
    const update = {
      plan,
      planUpdatedAt: FieldValue.serverTimestamp(),
      planOverriddenByAdmin: true,
      planOverriddenBy: callerUid,
    };

    await Promise.all([
      db.collection("users").doc(uid).set(update, {merge: true}),
      db.collection("user").doc(uid).set({plan, planUpdatedAt: FieldValue.serverTimestamp()}, {merge: true}),
    ]);

    res.status(200).json({status: "success", uid, plan});
  } catch (error) {
    logger.error("adminOverridePlan failed", error);
    res.status(500).json({status: "error", message: "Failed to override plan"});
  }
});

// ── adminGetPlanConfig ─────────────────────────────────────────────────────
/**
 * GET /adminGetPlanConfig
 * Returns plan limits + prices. Reads from config/plans Firestore doc,
 * falls back to hardcoded PLAN_LIMITS if not yet customized.
 */
exports.adminGetPlanConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();
    const snap = await db.collection("config").doc("plans").get();

    if (snap.exists) {
      res.status(200).json({plans: snap.data(), source: "firestore"});
    } else {
      // Return hardcoded defaults enriched with display prices
      const withPrices = {
        basic: Object.assign({}, DEFAULT_PLAN_LIMITS.basic, {price: 0}),
        pro:   Object.assign({}, DEFAULT_PLAN_LIMITS.pro,   {price: 99}),
        scale: Object.assign({}, DEFAULT_PLAN_LIMITS.scale, {price: 249}),
      };
      res.status(200).json({plans: withPrices, source: "hardcoded"});
    }
  } catch (error) {
    logger.error("adminGetPlanConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to get plan config"});
  }
});

// ── adminUpdatePlanConfig ──────────────────────────────────────────────────
/**
 * POST /adminUpdatePlanConfig  { plans: { basic, pro, scale } }
 */
exports.adminUpdatePlanConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {plans} = body;

    if (!plans || typeof plans !== "object") {
      res.status(400).json({status: "error", message: "plans object required"});
      return;
    }

    // Validate each plan tier
    const numericFields = ["assistants", "minutesPerMonth", "leads", "campaigns", "price"];
    const boolFields = ["knowledgeBase", "analytics", "calendar", "whatsapp"];
    const validated = {};

    for (const tier of ["basic", "pro", "scale"]) {
      if (!plans[tier]) {
        res.status(400).json({status: "error", message: `Missing plan tier: ${tier}`});
        return;
      }
      const p = plans[tier];
      validated[tier] = {};
      for (const f of numericFields) {
        const v = p[f];
        if (v !== null && v !== undefined && typeof v !== "number") {
          res.status(400).json({status: "error", message: `${tier}.${f} must be a number`});
          return;
        }
        validated[tier][f] = typeof v === "number" ? Math.max(0, Math.floor(v)) : 0;
      }
      for (const f of boolFields) {
        validated[tier][f] = Boolean(p[f]);
      }
      // callHistoryLimit can be null (unlimited) or a non-negative integer
      const chl = p.callHistoryLimit;
      validated[tier].callHistoryLimit = (chl === null || chl === undefined) ? null : Math.max(1, Math.floor(Number(chl)));
    }

    const db = getFirestore();
    await db.collection("config").doc("plans").set({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });

    res.status(200).json({status: "success"});
  } catch (error) {
    logger.error("adminUpdatePlanConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to update plan config"});
  }
});

// ── adminGetSystemSettings ─────────────────────────────────────────────────
/**
 * GET /adminGetSystemSettings
 */
exports.adminGetSystemSettings = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();
    const snap = await db.collection("config").doc("settings").get();
    const settings = snap.exists ? snap.data() : DEFAULT_SETTINGS;
    res.status(200).json(settings);
  } catch (error) {
    logger.error("adminGetSystemSettings failed", error);
    res.status(500).json({status: "error", message: "Failed to get system settings"});
  }
});

// ── adminUpdateSystemSettings ──────────────────────────────────────────────
/**
 * POST /adminUpdateSystemSettings  { settings }
 */
exports.adminUpdateSystemSettings = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {settings} = body;

    if (!settings || typeof settings !== "object") {
      res.status(400).json({status: "error", message: "settings object required"});
      return;
    }

    // Validate fields
    if (settings.defaultPlan && !["basic", "pro"].includes(settings.defaultPlan)) {
      res.status(400).json({status: "error", message: "defaultPlan must be basic or pro"});
      return;
    }

    const sanitized = {
      appName: typeof settings.appName === "string" ? settings.appName.slice(0, 100) : DEFAULT_SETTINGS.appName,
      supportEmail: typeof settings.supportEmail === "string" ? settings.supportEmail.slice(0, 200) : DEFAULT_SETTINGS.supportEmail,
      defaultPlan: ["basic", "pro"].includes(settings.defaultPlan) ? settings.defaultPlan : "basic",
      featureFlags: {
        onboardingWizard: Boolean(settings.featureFlags?.onboardingWizard ?? true),
        stripeLiveMode: Boolean(settings.featureFlags?.stripeLiveMode ?? false),
        maintenanceMode: Boolean(settings.featureFlags?.maintenanceMode ?? false),
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    };

    const db = getFirestore();
    await db.collection("config").doc("settings").set(sanitized);

    res.status(200).json({status: "success"});
  } catch (error) {
    logger.error("adminUpdateSystemSettings failed", error);
    res.status(500).json({status: "error", message: "Failed to update settings"});
  }
});

// ── adminGetKeysMeta ───────────────────────────────────────────────────────
/**
 * GET /adminGetKeysMeta
 * Returns metadata ONLY — isSet, last4, description. NEVER actual secrets.
 */
exports.adminGetKeysMeta = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();
    const snap = await db.collection("config").doc("keys").get();
    const stored = snap.exists ? snap.data() : {};

    // Default descriptions for each key
    const KEY_DEFAULTS = {
      STRIPE_SECRET_KEY:     {description: "Stripe API secret key (sk_live_... or sk_test_...)"},
      STRIPE_WEBHOOK_SECRET: {description: "Stripe webhook signing secret (whsec_...)"},
      STRIPE_PRO_PRICE_ID:   {description: "Stripe Price ID for PRO plan ($99/mo)"},
      STRIPE_SCALE_PRICE_ID: {description: "Stripe Price ID for SCALE plan ($249/mo)"},
      ELEVENLABS_API_KEY:    {description: "ElevenLabs TTS API key"},
      TWILIO_ACCOUNT_SID:    {description: "Twilio Account SID (AC...)"},
      TWILIO_AUTH_TOKEN:     {description: "Twilio Auth Token"},
    };

    const result = {};
    for (const keyName of ALLOWED_KEY_NAMES) {
      const meta = stored[keyName] || {};
      result[keyName] = {
        isSet: Boolean(meta.isSet),
        last4: meta.last4 || null,
        description: KEY_DEFAULTS[keyName]?.description || "",
      };
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error("adminGetKeysMeta failed", error);
    res.status(500).json({status: "error", message: "Failed to get keys metadata"});
  }
});

// ── adminUpdateKeyMeta ─────────────────────────────────────────────────────
/**
 * POST /adminUpdateKeyMeta  { keyName, last4, isSet }
 * Updates metadata only. Actual secrets managed via Firebase Secret Manager.
 */
exports.adminUpdateKeyMeta = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {keyName, last4, isSet} = body;

    if (!ALLOWED_KEY_NAMES.includes(keyName)) {
      res.status(400).json({status: "error", message: `Invalid keyName. Allowed: ${ALLOWED_KEY_NAMES.join(", ")}`});
      return;
    }

    if (isSet && last4 && (typeof last4 !== "string" || !/^[a-zA-Z0-9]{1,8}$/.test(last4))) {
      res.status(400).json({status: "error", message: "last4 must be 1-8 alphanumeric characters"});
      return;
    }

    const db = getFirestore();
    await db.collection("config").doc("keys").set({
      [keyName]: {
        isSet: Boolean(isSet),
        last4: isSet && last4 ? last4 : null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: callerUid,
      },
    }, {merge: true});

    res.status(200).json({status: "success", keyName});
  } catch (error) {
    logger.error("adminUpdateKeyMeta failed", error);
    res.status(500).json({status: "error", message: "Failed to update key metadata"});
  }
});

// ── Billing Config ─────────────────────────────────────────────────────────

const DEFAULT_BILLING_CONFIG = {
  signupCreditCents: 1000,      // $10 signup credit for Basic users
  signupCreditDays: 30,         // credit validity in days
  basicRequiresOwnKeys: false,  // if true, Basic plan users must supply own API keys
};

exports.adminGetBillingConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;
  try {
    const db = getFirestore();
    const doc = await db.collection("config").doc("billing").get();
    const data = doc.exists ? doc.data() : {};
    res.status(200).json({
      signupCreditCents: typeof data.signupCreditCents === "number" ? data.signupCreditCents : DEFAULT_BILLING_CONFIG.signupCreditCents,
      signupCreditDays:  typeof data.signupCreditDays  === "number" ? data.signupCreditDays  : DEFAULT_BILLING_CONFIG.signupCreditDays,
      basicRequiresOwnKeys: typeof data.basicRequiresOwnKeys === "boolean" ? data.basicRequiresOwnKeys : DEFAULT_BILLING_CONFIG.basicRequiresOwnKeys,
    });
  } catch (error) {
    logger.error("adminGetBillingConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to load billing config"});
  }
});

exports.adminUpdateBillingConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {config} = body;
    if (!config || typeof config !== "object") {
      res.status(400).json({status: "error", message: "config object required"});
      return;
    }
    const creditCents = Math.round(Number(config.signupCreditCents));
    const creditDays  = Math.round(Number(config.signupCreditDays));
    if (isNaN(creditCents) || creditCents < 0 || creditCents > 100000) {
      res.status(400).json({status: "error", message: "signupCreditCents must be 0–100000"});
      return;
    }
    if (isNaN(creditDays) || creditDays < 1 || creditDays > 365) {
      res.status(400).json({status: "error", message: "signupCreditDays must be 1–365"});
      return;
    }
    const db = getFirestore();
    await db.collection("config").doc("billing").set({
      signupCreditCents: creditCents,
      signupCreditDays:  creditDays,
      basicRequiresOwnKeys: Boolean(config.basicRequiresOwnKeys),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });
    res.status(200).json({status: "success"});
  } catch (error) {
    logger.error("adminUpdateBillingConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to save billing config"});
  }
});
