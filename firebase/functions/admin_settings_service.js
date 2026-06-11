/**
 * Admin Settings Service â€” plan config, subscriptions, API key metadata, system settings.
 * All endpoints require admin role.
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest, getUserDoc} = require("./security_utils");
const {logActivity} = require("./audit_service");

// â”€â”€ Hardcoded fallback plan limits (mirrors subscription_service.js PLAN_LIMITS) â”€â”€
const DEFAULT_PLAN_LIMITS = {
  basic: {assistants: 1, minutesPerMonth: 50, leads: 100, campaigns: 0, knowledgeBase: false, analytics: false, calendar: false, whatsapp: false, callHistoryLimit: 10},
  pro:   {assistants: 10, minutesPerMonth: 2000, leads: 5000, campaigns: 10, knowledgeBase: true, analytics: true, calendar: true, whatsapp: true, callHistoryLimit: null},
  scale: {assistants: 999, minutesPerMonth: 10000, leads: 999999, campaigns: 999, knowledgeBase: true, analytics: true, calendar: true, whatsapp: true, callHistoryLimit: null},
};

// â”€â”€ Admin check helper (self-contained, no cross-file dependency) â”€â”€
async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  const db = getFirestore();
  const doc = await getUserDoc(db, uid);
  const role = doc.exists ? doc.data().role : null;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({status: "error", message: "Forbidden. Admin only."});
    return null;
  }
  return uid;
}

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â”€â”€ Allowed API key names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ALLOWED_KEY_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_SCALE_PRICE_ID",
  "ELEVENLABS_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
];

// ── Plan-config validator (shared with unit tests) ──────────────────────
//
// Quota fields accept null/undefined/negative-number → "unlimited" (null).
// Non-negative numbers are clamped + floored. `price` is always a concrete
// non-negative number (no unlimited concept). callHistoryLimit allows null
// (unlimited) or a positive integer.
//
// Throws Error with a message describing the first invalid field. Returns
// the validated `{basic, pro, scale}` shape on success.
function validatePlans(plans) {
  if (!plans || typeof plans !== "object") {
    throw new Error("plans object required");
  }
  const quotaFields = ["assistants", "minutesPerMonth", "leads", "campaigns"];
  const boolFields  = ["knowledgeBase", "analytics", "calendar", "whatsapp"];
  const out = {};
  for (const tier of ["basic", "pro", "scale"]) {
    if (!plans[tier]) throw new Error(`Missing plan tier: ${tier}`);
    const p = plans[tier];
    out[tier] = {};
    for (const f of quotaFields) {
      const v = p[f];
      if (v === null || v === undefined) {
        out[tier][f] = null;
      } else if (typeof v === "number") {
        out[tier][f] = v < 0 ? null : Math.max(0, Math.floor(v));
      } else {
        throw new Error(`${tier}.${f} must be a number or null`);
      }
    }
    const pr = p.price;
    if (pr !== null && pr !== undefined && typeof pr !== "number") {
      throw new Error(`${tier}.price must be a number`);
    }
    out[tier].price = typeof pr === "number" ? Math.max(0, Math.floor(pr)) : 0;
    for (const f of boolFields) out[tier][f] = Boolean(p[f]);
    const chl = p.callHistoryLimit;
    out[tier].callHistoryLimit = (chl === null || chl === undefined) ? null : Math.max(1, Math.floor(Number(chl)));
  }
  return out;
}
exports._internal = { validatePlans };

// ── Default system settings ────────────────────────────────────────────
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

// â”€â”€ adminGetSubscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Sort by plan (scale â†’ pro â†’ basic), then by email
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

// â”€â”€ adminOverridePlan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    logActivity({ userId: callerUid, action: "billing.override_plan", category: "billing", resourceType: "user", resourceId: uid, details: {plan} }).catch(() => {});
  } catch (error) {
    logger.error("adminOverridePlan failed", error);
    res.status(500).json({status: "error", message: "Failed to override plan"});
  }
});

// â”€â”€ adminGetPlanConfig â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ adminUpdatePlanConfig â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Validate via shared helper (also exported for unit tests).
    let validated;
    try {
      validated = validatePlans(plans);
    } catch (e) {
      res.status(400).json({status: "error", message: e.message});
      return;
    }

    const db = getFirestore();
    await db.collection("config").doc("plans").set({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });

    res.status(200).json({status: "success"});
    logActivity({ userId: callerUid, action: "settings.update_plan_config", category: "settings", resourceType: "config", resourceId: "plan_config" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdatePlanConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to update plan config"});
  }
});

// â”€â”€ adminGetSystemSettings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ adminUpdateSystemSettings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    logActivity({ userId: callerUid, action: "settings.update_system", category: "settings", resourceType: "config", resourceId: "system_settings" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdateSystemSettings failed", error);
    res.status(500).json({status: "error", message: "Failed to update settings"});
  }
});

// â”€â”€ adminGetKeysMeta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * GET /adminGetKeysMeta
 * Returns metadata ONLY â€” isSet, last4, description. NEVER actual secrets.
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

    // Source of truth: Secret Manager. The Firestore "config/keys" doc was
    // a hand-maintained mirror that drifts out of sync as soon as someone
    // rotates a secret via the new /admin/api-keys page or
    // `firebase functions:secrets:set`. We query Secret Manager directly
    // and only fall back to the mirror when SM can't be reached.
    let getSecretMeta = null;
    try {
      ({ getSecretMeta } = require("./admin_secrets_service.js")._internal);
    } catch (e) {
      logger.warn("admin_secrets_service._internal unavailable, falling back to mirror", e.message);
    }

    const result = {};
    for (const keyName of ALLOWED_KEY_NAMES) {
      const mirror = stored[keyName] || {};
      let isSet = Boolean(mirror.isSet);
      let last4 = mirror.last4 || null;
      let source = mirror.isSet ? "mirror" : "unset";

      if (getSecretMeta) {
        try {
          const sm = await getSecretMeta(keyName);
          if (sm.status === "present") {
            isSet = true;
            // sm.masked is "…XXXX" or "…(short)" — strip the ellipsis for
            // the existing UI which prefixes its own marker. Also blocks
            // leaking a stale mirror prefix (#49).
            last4 = sm.masked && sm.masked.startsWith("…") && sm.masked.length === 5
              ? sm.masked.slice(1) : null;
            source = "secret-manager";
          } else if (sm.status === "missing") {
            isSet = false; last4 = null; source = "unset";
          }
        } catch (e) {
          logger.warn(`SM check failed for ${keyName}, keeping mirror`, e.message);
        }
      }

      result[keyName] = {
        isSet,
        last4,
        source,
        description: KEY_DEFAULTS[keyName]?.description || "",
      };
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error("adminGetKeysMeta failed", error);
    res.status(500).json({status: "error", message: "Failed to get keys metadata"});
  }
});

// â”€â”€ adminUpdateKeyMeta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    logActivity({ userId: callerUid, action: "settings.update_api_keys", category: "settings", resourceType: "config", resourceId: "api_keys" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdateKeyMeta failed", error);
    res.status(500).json({status: "error", message: "Failed to update key metadata"});
  }
});

// â”€â”€ Billing Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      res.status(400).json({status: "error", message: "signupCreditCents must be 0â€“100000"});
      return;
    }
    if (isNaN(creditDays) || creditDays < 1 || creditDays > 365) {
      res.status(400).json({status: "error", message: "signupCreditDays must be 1â€“365"});
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
    logActivity({ userId: callerUid, action: "settings.update_billing", category: "settings", resourceType: "config", resourceId: "billing_config" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdateBillingConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to save billing config"});
  }
});

// â”€â”€ Pronunciation Dictionary â€” Hebrew TTS pronunciation fixes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Firestore doc: config/pronunciation â†’ { fixes: [{original, replacement, note}] }

exports.adminGetPronunciation = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const doc = await db.collection("config").doc("pronunciation").get();
    const data = doc.exists ? doc.data() : {fixes: []};
    res.status(200).json(data);
  } catch (error) {
    logger.error("adminGetPronunciation failed", error);
    res.status(500).json({status: "error", message: "Failed to load pronunciation"});
  }
});

exports.adminUpdatePronunciation = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const fixes = body.fixes;
    if (!Array.isArray(fixes)) {
      res.status(400).json({status: "error", message: "fixes must be an array"});
      return;
    }
    // Validate each fix
    const validated = fixes.map(f => ({
      original: String(f.original || "").trim(),
      replacement: String(f.replacement || "").trim(),
      note: String(f.note || "").trim(),
    })).filter(f => f.original && f.replacement);

    const db = getFirestore();
    await db.collection("config").doc("pronunciation").set({
      fixes: validated,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    logger.info(`Pronunciation dictionary updated by ${uid}: ${validated.length} fixes`);
    res.status(200).json({status: "ok", count: validated.length});
    logActivity({ userId: uid, action: "settings.update_pronunciation", category: "settings", resourceType: "config", resourceId: "pronunciation" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdatePronunciation failed", error);
    res.status(500).json({status: "error", message: "Failed to save pronunciation"});
  }
});

// Public endpoint (no auth) for Cloud Run to fetch pronunciation fixes
exports.getPronunciationFixes = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  try {
    const db = getFirestore();
    const doc = await db.collection("config").doc("pronunciation").get();
    const fixes = doc.exists ? (doc.data().fixes || []) : [];
    res.status(200).json({fixes});
  } catch (error) {
    res.status(500).json({fixes: []});
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ Cost Tracking & Customer Pricing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const DEFAULT_RATE_CARD = {
  twilio: {costPerMinute: 0.013},
  openai: {costPerPromptToken1K: 0.00015, costPerCompletionToken1K: 0.0006, costPerTtsChar1K: 0.015},
  // OpenAI Realtime (gpt-4o-realtime-preview): priced per minute of input/output audio
  openaiRealtime: {costPerMinuteInput: 0.06, costPerMinuteOutput: 0.24},
  deepgram: {costPerMinute: 0.0043},
  googleTts: {costPerChar1K: 0.016},
  currency: "USD",
};

const DEFAULT_CUSTOMER_PRICING = {
  defaultModel: "markup",
  defaultMarkupPercent: 30,
  defaultFixedPerMinute: 0.50,
  currency: "USD",
  overrides: {},
};

// â”€â”€ Rate Card CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.adminGetRateCard = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const doc = await db.collection("config").doc("rateCard").get();
    res.status(200).json(doc.exists ? {...DEFAULT_RATE_CARD, ...doc.data()} : DEFAULT_RATE_CARD);
  } catch (error) {
    logger.error("adminGetRateCard error", error);
    res.status(500).json({status: "error", message: error.message});
  }
});

exports.adminUpdateRateCard = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST only"}); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const rc = body.rateCard || body;
    // Validate numeric fields
    const validate = (obj, path) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "object" && v !== null) validate(v, `${path}.${k}`);
        else if (typeof v === "number" && (v < 0 || v > 100)) throw new Error(`${path}.${k} out of range`);
      }
    };
    validate(rc, "rateCard");
    const db = getFirestore();
    await db.collection("config").doc("rateCard").set({...rc, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid}, {merge: true});
    res.status(200).json({status: "ok"});
    logActivity({ userId: uid, action: "settings.update_rate_card", category: "settings", resourceType: "config", resourceId: "rate_card" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdateRateCard error", error);
    res.status(500).json({status: "error", message: error.message});
  }
});

// â”€â”€ Customer Pricing CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.adminGetCustomerPricing = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const doc = await db.collection("config").doc("customerPricing").get();
    res.status(200).json(doc.exists ? {...DEFAULT_CUSTOMER_PRICING, ...doc.data()} : DEFAULT_CUSTOMER_PRICING);
  } catch (error) {
    logger.error("adminGetCustomerPricing error", error);
    res.status(500).json({status: "error", message: error.message});
  }
});

exports.adminUpdateCustomerPricing = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST only"}); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = {};
    if (body.defaultModel && ["markup", "fixedPerMinute"].includes(body.defaultModel)) data.defaultModel = body.defaultModel;
    if (typeof body.defaultMarkupPercent === "number") {
      if (body.defaultMarkupPercent < 0 || body.defaultMarkupPercent > 500) throw new Error("Markup must be 0-500%");
      data.defaultMarkupPercent = body.defaultMarkupPercent;
    }
    if (typeof body.defaultFixedPerMinute === "number") {
      if (body.defaultFixedPerMinute < 0 || body.defaultFixedPerMinute > 100) throw new Error("Fixed rate must be 0-100");
      data.defaultFixedPerMinute = body.defaultFixedPerMinute;
    }
    if (body.currency) data.currency = body.currency;
    if (body.overrides && typeof body.overrides === "object") data.overrides = body.overrides;
    data.updatedAt = FieldValue.serverTimestamp();
    data.updatedBy = uid;
    const db = getFirestore();
    await db.collection("config").doc("customerPricing").set(data, {merge: true});
    res.status(200).json({status: "ok"});
    logActivity({ userId: uid, action: "settings.update_customer_pricing", category: "settings", resourceType: "config", resourceId: "customer_pricing" }).catch(() => {});
  } catch (error) {
    logger.error("adminUpdateCustomerPricing error", error);
    res.status(500).json({status: "error", message: error.message});
  }
});

// â”€â”€ Cost Dashboard Query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.adminGetCostDashboard = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireAdmin(req, res);
  if (!uid) return;
  try {
    const db = getFirestore();
    const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const to = req.query.to || new Date().toISOString();
    const userId = req.query.userId || null;

    let q = db.collection("call_sessions")
      .where("createdAt", ">=", new Date(from))
      .where("createdAt", "<=", new Date(to));
    if (userId) q = q.where("ownerId", "==", userId);

    const snap = await q.get();
    const byService = {twilio: 0, llm: 0, stt: 0, tts: 0, realtime: 0};
    const byUserMap = {};
    const byAssistantMap = {};
    let totalCost = 0, totalRevenue = 0, totalMinutes = 0;
    const calls = [];

    snap.forEach((doc) => {
      const d = doc.data();
      const c = d.costs || {};
      const minutes = (d.duration || 0) / 60;
      totalMinutes += minutes;

      if (c.twilio) byService.twilio += c.twilio.cost || 0;
      if (c.llm) byService.llm += c.llm.cost || 0;
      if (c.stt) byService.stt += c.stt.cost || 0;
      if (c.tts) byService.tts += c.tts.cost || 0;
      if (c.realtime) byService.realtime += c.realtime.cost || 0;
      totalCost += c.totalCost || 0;
      totalRevenue += c.customerCharge || 0;

      const oid = d.ownerId || "unknown";
      if (!byUserMap[oid]) byUserMap[oid] = {uid: oid, email: d.ownerEmail || oid, calls: 0, minutes: 0, cost: 0, revenue: 0};
      byUserMap[oid].calls += 1;
      byUserMap[oid].minutes += minutes;
      byUserMap[oid].cost += c.totalCost || 0;
      byUserMap[oid].revenue += c.customerCharge || 0;

      // Per-assistant rollup
      const aid = d.assistantId || "none";
      const aname = d.assistantDefinition?.name || d.assistantName || "(no assistant)";
      if (!byAssistantMap[aid]) byAssistantMap[aid] = {assistantId: aid, assistantName: aname, calls: 0, minutes: 0, cost: 0, revenue: 0};
      byAssistantMap[aid].calls += 1;
      byAssistantMap[aid].minutes += minutes;
      byAssistantMap[aid].cost += c.totalCost || 0;
      byAssistantMap[aid].revenue += c.customerCharge || 0;

      calls.push({id: doc.id, createdAt: d.createdAt?.toDate?.()?.toISOString() || "", ownerId: oid, assistantId: aid, assistantName: aname, duration: d.duration || 0, costs: c});
    });

    res.status(200).json({
      summary: {totalCost: +totalCost.toFixed(4), totalRevenue: +totalRevenue.toFixed(4), profit: +(totalRevenue - totalCost).toFixed(4), totalCalls: snap.size, totalMinutes: +totalMinutes.toFixed(1)},
      byService: {twilio: +byService.twilio.toFixed(4), llm: +byService.llm.toFixed(4), stt: +byService.stt.toFixed(4), tts: +byService.tts.toFixed(4), realtime: +byService.realtime.toFixed(4)},
      byUser: Object.values(byUserMap).map((u) => ({...u, minutes: +u.minutes.toFixed(1), cost: +u.cost.toFixed(4), revenue: +u.revenue.toFixed(4)})),
      byAssistant: Object.values(byAssistantMap).map((a) => ({...a, minutes: +a.minutes.toFixed(1), cost: +a.cost.toFixed(4), revenue: +a.revenue.toFixed(4)})).sort((a, b) => b.cost - a.cost),
      calls: calls.slice(0, 200),
    });
  } catch (error) {
    logger.error("adminGetCostDashboard error", error);
    res.status(500).json({status: "error", message: error.message});
  }
});

// Public endpoint for Cloud Run to fetch rate card + customer pricing
exports.getCostConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  try {
    const db = getFirestore();
    const [rcDoc, cpDoc] = await Promise.all([
      db.collection("config").doc("rateCard").get(),
      db.collection("config").doc("customerPricing").get(),
    ]);
    res.status(200).json({
      rateCard: rcDoc.exists ? {...DEFAULT_RATE_CARD, ...rcDoc.data()} : DEFAULT_RATE_CARD,
      customerPricing: cpDoc.exists ? {...DEFAULT_CUSTOMER_PRICING, ...cpDoc.data()} : DEFAULT_CUSTOMER_PRICING,
    });
  } catch (error) {
    res.status(500).json({rateCard: DEFAULT_RATE_CARD, customerPricing: DEFAULT_CUSTOMER_PRICING});
  }
});
