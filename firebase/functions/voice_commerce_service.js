/**
 * voice_commerce_service.js â€” Voice Commerce Engine
 *
 * Enables complete purchase flows over a phone call â€” no website required.
 *
 * How it works:
 *  1. Assistant has a product catalog configured (Firestore voice_products)
 *  2. During a call the AI has tools: lookup_product, add_to_cart, get_cart, place_voice_order
 *  3. Payment is captured via Stripe PaymentIntent (link sent via SMS to caller)
 *     OR optionally via Twilio Pay (DTMF card entry â€” PCI-DSS compliant)
 *  4. Order is created in voice_orders collection
 *  5. Confirmation SMS is sent to the caller
 *
 * Endpoints:
 *  POST voiceProductCreate       â€” Add a product to the catalog
 *  POST voiceProductUpdate       â€” Update a product
 *  GET  voiceProductList         â€” List products for this account
 *  POST voiceProductDelete       â€” Delete a product
 *  POST voiceOrderCreate         â€” Create an order (called from Cloud Run)
 *  GET  voiceOrderList           â€” List orders dashboard
 *  GET  voiceOrderGet            â€” Get order detail
 *  POST voiceOrderUpdateStatus   â€” Update order status
 *  POST voiceCreatePaymentLink   â€” Generate Stripe payment link (sent to caller by SMS)
 *
 * Firestore collections:
 *  voice_products  { ownerId, name, description, price, currency, sku, stock, active }
 *  voice_carts     { callSessionId, ownerId, items[], totalAmount, currency, status, createdAt }
 *  voice_orders    { callSessionId, ownerId, items[], totalAmount, currency, status,
 *                    partyName, partyPhone, paymentIntentId, paymentLink, createdAt }
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");

const {
  sanitizeObject,
  applyRateLimit,
  extractUidFromRequest,
} = require("./security_utils");
const {safeJsonParse} = require("./workflow_utils");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â”€â”€ Product Catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.voiceProductCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {name, description = "", price, currency = "USD", sku = "", stock = null, category = ""} = payload;

    if (!name || !name.trim()) { res.status(400).json({status:"error",message:"name required"}); return; }
    if (price === undefined || price === null || isNaN(Number(price))) {
      res.status(400).json({status:"error",message:"price must be a valid number"}); return;
    }

    const db = getFirestore();
    const docRef = await db.collection("voice_products").add({
      ownerId: uid,
      name: name.trim(),
      description: description.trim(),
      price: Math.round(Number(price) * 100) / 100, // 2 decimal places
      currency: currency.toUpperCase(),
      sku: sku.trim(),
      stock: stock !== null ? Number(stock) : null, // null = unlimited
      category: category.trim(),
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({status:"ok", id: docRef.id, message:"Product created"});
  } catch (e) {
    logger.error("voiceProductCreate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceProductUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id, ...fields} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("voice_products").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Product not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    const updates = {updatedAt: FieldValue.serverTimestamp()};
    if (fields.name        !== undefined) updates.name        = String(fields.name).trim();
    if (fields.description !== undefined) updates.description = String(fields.description).trim();
    if (fields.price       !== undefined) updates.price       = Math.round(Number(fields.price) * 100) / 100;
    if (fields.currency    !== undefined) updates.currency    = String(fields.currency).toUpperCase();
    if (fields.sku         !== undefined) updates.sku         = String(fields.sku).trim();
    if (fields.stock       !== undefined) updates.stock       = fields.stock !== null ? Number(fields.stock) : null;
    if (fields.active      !== undefined) updates.active      = Boolean(fields.active);
    if (fields.category    !== undefined) updates.category    = String(fields.category).trim();

    await docRef.update(updates);
    res.status(200).json({status:"ok", message:"Product updated"});
  } catch (e) {
    logger.error("voiceProductUpdate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceProductList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const includeInactive = req.query.includeInactive === "true";
    const db = getFirestore();
    let query = db.collection("voice_products").where("ownerId","==",uid);
    if (!includeInactive) query = query.where("active","==",true);
    const snap = await query.orderBy("createdAt","desc").get();

    const products = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", products, count: products.length});
  } catch (e) {
    logger.error("voiceProductList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceProductDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("voice_products").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Product not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    await docRef.update({active: false, deletedAt: FieldValue.serverTimestamp()});
    res.status(200).json({status:"ok", message:"Product deleted"});
  } catch (e) {
    logger.error("voiceProductDelete", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Product Search (used by Cloud Run AI tool) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Internal â€” no CORS, no user auth; called by Cloud Run service account
exports.voiceProductSearch = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const payload = safeJsonParse(req.body) || {};
    const {ownerId, query = "", limit: lim = 10} = payload;
    if (!ownerId) { res.status(400).json({status:"error",message:"ownerId required"}); return; }

    const db = getFirestore();
    const snap = await db.collection("voice_products")
      .where("ownerId","==",ownerId)
      .where("active","==",true)
      .limit(100) // fetch all, then filter in-memory for fuzzy match
      .get();

    const q = String(query).toLowerCase();
    const products = snap.docs
      .map(d => ({id: d.id, ...d.data()}))
      .filter(p =>
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      )
      .slice(0, Number(lim));

    res.status(200).json({status:"ok", products});
  } catch (e) {
    logger.error("voiceProductSearch", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Create Payment Link (Stripe) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called from Cloud Run after order is ready â€” generates a hosted payment link
// the AI can text to the caller via SMS.
exports.voiceCreatePaymentLink = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const payload = safeJsonParse(req.body) || {};
    const {callSessionId, ownerId, items, partyPhone, partyName, currency = "usd"} = payload;

    if (!callSessionId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({status:"error",message:"callSessionId and items[] required"});
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(503).json({status:"error",message:"Stripe not configured"});
      return;
    }

    // Build Stripe line items
    const lineItems = items.map(item => ({
      price_data: {
        currency: currency.toLowerCase(),
        product_data: {name: item.name || "Item"},
        unit_amount: Math.round((item.price || 0) * 100), // cents
      },
      quantity: item.quantity || 1,
    }));

    const totalAmount = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);

    // Create Stripe Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: lineItems,
      after_completion: {
        type: "redirect",
        redirect: {url: process.env.STRIPE_SUCCESS_URL || "https://voice.lancelotech.com/payment-success"},
      },
      metadata: {callSessionId, ownerId: ownerId || "", partyPhone: partyPhone || ""},
    });

    // Create order record
    const db = getFirestore();
    const orderRef = await db.collection("voice_orders").add({
      callSessionId,
      ownerId: ownerId || null,
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currency: currency.toLowerCase(),
      partyName: partyName || null,
      partyPhone: partyPhone || null,
      paymentLink: paymentLink.url,
      paymentLinkId: paymentLink.id,
      status: "pending_payment",
      createdAt: FieldValue.serverTimestamp(),
    });

    // Tag the call session
    await db.collection("call_sessions").doc(callSessionId).set({
      voiceOrderId: orderRef.id,
      hasVoiceOrder: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    res.status(200).json({
      status: "ok",
      orderId: orderRef.id,
      paymentLink: paymentLink.url,
      totalAmount,
      currency,
    });
  } catch (e) {
    logger.error("voiceCreatePaymentLink", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Order Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.voiceOrderCreate = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const payload = safeJsonParse(req.body) || {};
    const {callSessionId, ownerId, items, partyName, partyPhone, notes = "", currency = "usd"} = payload;

    if (!callSessionId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({status:"error",message:"callSessionId and items[] required"});
      return;
    }

    const totalAmount = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
    const db = getFirestore();
    const orderRef = await db.collection("voice_orders").add({
      callSessionId,
      ownerId: ownerId || null,
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      currency,
      partyName: partyName || null,
      partyPhone: partyPhone || null,
      notes: notes.trim(),
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("call_sessions").doc(callSessionId).set({
      voiceOrderId: orderRef.id,
      hasVoiceOrder: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    res.status(200).json({status:"ok", orderId: orderRef.id, totalAmount});
  } catch (e) {
    logger.error("voiceOrderCreate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceOrderList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const page  = Math.max(0, parseInt(req.query.page  || "0", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "50", 10));
    const status = req.query.status || null;

    const db = getFirestore();
    let query = db.collection("voice_orders").where("ownerId","==",uid);
    if (status) query = query.where("status","==",status);
    const snap = await query.orderBy("createdAt","desc").offset(page * limit).limit(limit).get();

    const orders = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", orders, count: orders.length, page, limit});
  } catch (e) {
    logger.error("voiceOrderList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceOrderGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const id = req.query.id || safeJsonParse(req.body)?.id;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const snap = await db.collection("voice_orders").doc(id).get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Order not found"}); return; }
    const data = snap.data();
    if (data.ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    res.status(200).json({
      status:"ok",
      order: {
        id: snap.id, ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      },
    });
  } catch (e) {
    logger.error("voiceOrderGet", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.voiceOrderUpdateStatus = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id, status} = payload;
    if (!id || !status) { res.status(400).json({status:"error",message:"id and status required"}); return; }

    const VALID_STATUSES = ["pending","pending_payment","paid","processing","shipped","delivered","cancelled","refunded"];
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({status:"error",message:`status must be one of: ${VALID_STATUSES.join(", ")}`});
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("voice_orders").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Order not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    await docRef.update({status, updatedAt: FieldValue.serverTimestamp()});
    res.status(200).json({status:"ok", message:`Order status updated to ${status}`});
  } catch (e) {
    logger.error("voiceOrderUpdateStatus", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Stripe Webhook â€” update order when payment completes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.voiceCommerceStripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
    } else {
      event = safeJsonParse(req.body);
    }
  } catch (e) {
    logger.error("Stripe webhook signature failed", e.message);
    res.status(400).json({status:"error", message:"Webhook signature verification failed"});
    return;
  }

  if (event?.type === "payment_intent.succeeded" || event?.type === "checkout.session.completed") {
    try {
      const metadata = event.data?.object?.metadata || {};
      const callSessionId = metadata.callSessionId;
      if (callSessionId) {
        const db = getFirestore();
        const ordersSnap = await db.collection("voice_orders")
          .where("callSessionId","==",callSessionId).limit(1).get();
        if (!ordersSnap.empty) {
          await ordersSnap.docs[0].ref.update({
            status: "paid",
            paidAt: FieldValue.serverTimestamp(),
            stripeEventId: event.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
          logger.info(`Voice order paid for session ${callSessionId}`);
        }
      }
    } catch (e) {
      logger.error("Voice commerce webhook processing error", e);
    }
  }

  res.status(200).json({received: true});
});
