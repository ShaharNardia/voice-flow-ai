/**
 * Subscription Service — Plan management, Stripe Checkout, and usage stats.
 *
 * Exports:
 *   createCheckoutSession     POST /createCheckoutSession
 *   createBillingPortalSession POST /createBillingPortalSession
 *   getUserPlan               GET  /getUserPlan
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {extractUidFromRequest} = require("./security_utils");

// ── CORS ────────────────────────────────────────────────────────────────────
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

// ── Stripe ──────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured.");
    _stripe = require("stripe")(STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ── Auth helper ─────────────────────────────────────────────────────────────
async function requireAuth(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  return uid;
}

// ── Plan definitions ─────────────────────────────────────────────────────────
// Exported so other services can import for limit enforcement
const PLAN_LIMITS = {
  basic: {
    assistants: 1,
    minutesPerMonth: 50,
    leads: 100,
    campaigns: 0,
    knowledgeBase: false,
    analytics: false,
    calendar: false,
    whatsapp: false,
    callHistoryLimit: 10,
  },
  pro: {
    assistants: 10,
    minutesPerMonth: 2000,
    leads: 5000,
    campaigns: 10,
    knowledgeBase: true,
    analytics: true,
    calendar: true,
    whatsapp: true,
    callHistoryLimit: null,
  },
  scale: {
    assistants: 999,
    minutesPerMonth: 10000,
    leads: 999999,
    campaigns: 999,
    knowledgeBase: true,
    analytics: true,
    calendar: true,
    whatsapp: true,
    callHistoryLimit: null,
  },
};
exports.PLAN_LIMITS = PLAN_LIMITS;

/** Resolve plan from Stripe price ID using env vars */
function derivePlanFromPriceId(priceId) {
  if (!priceId) return "pro";
  if (priceId === process.env.STRIPE_SCALE_PRICE_ID) return "scale";
  return "pro"; // Default paid plan
}
exports.derivePlanFromPriceId = derivePlanFromPriceId;

// ── createCheckoutSession ────────────────────────────────────────────────────
/**
 * POST /createCheckoutSession
 * Body: { priceId, successUrl, cancelUrl }
 * Returns: { url } — redirect to Stripe Checkout
 */
exports.createCheckoutSession = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const {priceId, successUrl, cancelUrl} = body;

    if (!priceId) { res.status(400).json({message: "priceId is required"}); return; }

    const db = getFirestore();
    const stripe = getStripe();

    // Get or create Stripe customer
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    let customerId = userData.stripe_customer_id;

    if (!customerId) {
      // Also check legacy `user` collection
      const legacySnap = await db.collection("user").doc(uid).get();
      customerId = legacySnap.exists ? legacySnap.data()?.stripe_customer_id : null;
    }

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userData.email || undefined,
        name: userData.displayName || userData.companyName || undefined,
        metadata: {firebase_uid: uid},
      });
      customerId = customer.id;
      // Store in both collections
      await db.collection("users").doc(uid).set({stripe_customer_id: customerId}, {merge: true});
      await db.collection("user").doc(uid).set({stripe_customer_id: customerId}, {merge: true});
    }

    // Create checkout session with 14-day free trial
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{price: priceId, quantity: 1}],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: successUrl || `${process.env.FRONTEND_URL || "https://voiceflow-ai-202509231639.web.app"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || "https://voiceflow-ai-202509231639.web.app"}/billing`,
      allow_promotion_codes: true,
    });

    res.status(200).json({url: session.url});
  } catch (err) {
    logger.error("createCheckoutSession error:", err);
    res.status(500).json({message: err.message || "Internal error"});
  }
});

// ── createBillingPortalSession ───────────────────────────────────────────────
/**
 * POST /createBillingPortalSession
 * Body: { returnUrl? }
 * Returns: { url } — redirect to Stripe Billing Portal
 */
exports.createBillingPortalSession = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const returnUrl = body.returnUrl || `${process.env.FRONTEND_URL || "https://voiceflow-ai-202509231639.web.app"}/billing`;

    const db = getFirestore();
    const stripe = getStripe();

    // Find stripe_customer_id
    const userSnap = await db.collection("users").doc(uid).get();
    let customerId = userSnap.exists ? userSnap.data()?.stripe_customer_id : null;

    if (!customerId) {
      const legacySnap = await db.collection("user").doc(uid).get();
      customerId = legacySnap.exists ? legacySnap.data()?.stripe_customer_id : null;
    }

    if (!customerId) {
      res.status(400).json({message: "No Stripe customer found. Please upgrade first."});
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.status(200).json({url: session.url});
  } catch (err) {
    logger.error("createBillingPortalSession error:", err);
    res.status(500).json({message: err.message || "Internal error"});
  }
});

// ── getUserPlan ───────────────────────────────────────────────────────────────
/**
 * GET /getUserPlan
 * Returns: { plan, limits, usage: { minutesUsed, assistantCount, leadCount, campaignCount, callCount } }
 */
exports.getUserPlan = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({message: "Method not allowed"}); return; }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  try {
    const db = getFirestore();

    // Read plan from Firestore
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    // Determine plan with migration compatibility
    let plan = userData.plan;
    if (!plan) {
      // Migrate: subscribed=true → pro, else basic
      plan = userData.subscribed === true ? "pro" : "basic";
    }
    // Read plan limits from Firestore config (admin-editable), fall back to hardcoded
    const configSnap = await db.collection("config").doc("plans").get();
    const allLimits = configSnap.exists ? configSnap.data() : PLAN_LIMITS;
    const limits = allLimits[plan] || PLAN_LIMITS.basic;

    // Count assistants
    const assistantsSnap = await db.collection("assistants")
      .where("ownerId", "==", uid)
      .count()
      .get();
    const assistantCount = assistantsSnap.data().count || 0;

    // Count leads
    const leadsSnap = await db.collection("leads")
      .where("ownerId", "==", uid)
      .count()
      .get();
    const leadCount = leadsSnap.data().count || 0;

    // Count campaigns
    const campaignsSnap = await db.collection("campaigns")
      .where("ownerId", "==", uid)
      .count()
      .get();
    const campaignCount = campaignsSnap.data().count || 0;

    // Count calls this month + sum duration for minutes
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const callsSnap = await db.collection("call_sessions")
      .where("ownerId", "==", uid)
      .where("createdAt", ">=", startOfMonth)
      .get();

    let callCount = callsSnap.size;
    let minutesUsed = 0;
    callsSnap.forEach((doc) => {
      const d = doc.data();
      if (typeof d.duration === "number") {
        minutesUsed += Math.ceil(d.duration / 60);
      } else {
        minutesUsed += 2; // 2-minute estimate per call if no duration field
      }
    });

    res.status(200).json({
      plan,
      limits,
      usage: {
        minutesUsed,
        assistantCount,
        leadCount,
        campaignCount,
        callCount,
      },
    });
  } catch (err) {
    logger.error("getUserPlan error:", err);
    res.status(500).json({message: err.message || "Internal error"});
  }
});
