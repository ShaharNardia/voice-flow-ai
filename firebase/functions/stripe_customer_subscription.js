const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

// ── Stripe initialisation ───────────────────────────────────────────
// SECURITY: Keys are loaded from environment / Firebase Secrets.
// Set them with:
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
// Never hard-code secret keys in source code.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured. " +
        "Set it via Firebase Secrets: firebase functions:secrets:set STRIPE_SECRET_KEY",
      );
    }
    _stripe = require("stripe")(STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ── Idempotency – prevent duplicate event processing ────────────────
const PROCESSED_EVENTS_COLLECTION = "ProcessedStripeEvents";
const EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function isEventAlreadyProcessed(eventId) {
  const db = getFirestore();
  const docRef = db.collection(PROCESSED_EVENTS_COLLECTION).doc(eventId);
  const snapshot = await docRef.get();
  return snapshot.exists;
}

async function markEventProcessed(eventId, eventType) {
  const db = getFirestore();
  const docRef = db.collection(PROCESSED_EVENTS_COLLECTION).doc(eventId);
  await docRef.set({
    eventId,
    eventType,
    processedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + EVENT_TTL_MS).toISOString(),
  });
}

// ── Plan helpers ─────────────────────────────────────────────────────
function derivePlanFromPriceId(priceId) {
  if (!priceId) return "pro";
  if (priceId === process.env.STRIPE_SCALE_PRICE_ID) return "scale";
  return "pro";
}

// ── Webhook handler ─────────────────────────────────────────────────
exports.stripeCustomerSubscription = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({
        status: "error",
        message: "Method not allowed. Expected POST.",
      });
      return;
    }

    logger.info("Received Stripe webhook request");

    if (!STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET is not configured.");
      return res.sendStatus(500);
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      logger.warn("Missing stripe-signature header");
      return res.sendStatus(400);
    }

    // Verify the event
    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      logger.error("Error verifying Stripe signature:", err.message);
      return res.sendStatus(400);
    }

    // ── Idempotency check ─────────────────────────────────────────
    if (await isEventAlreadyProcessed(event.id)) {
      logger.info(`Stripe event ${event.id} already processed – skipping.`);
      return res.sendStatus(200);
    }

    // ── Handle subscription events ────────────────────────────────
    const SUBSCRIPTION_EVENTS = {
      "customer.subscription.created": true,
      "customer.subscription.updated": true,
      "customer.subscription.deleted": false,
    };

    const subscribedValue = SUBSCRIPTION_EVENTS[event.type];

    if (subscribedValue !== undefined) {
      const dataObject = event.data.object;

      logger.info(
        `Processing ${event.type} for customer ${dataObject.customer}`,
      );

      const db = getFirestore();
      const userSnapshot = await db
        .collection("user")
        .where("stripe_customer_id", "==", dataObject.customer)
        .get();

      if (userSnapshot.empty) {
        logger.warn(
          `No user found with stripe_customer_id: ${dataObject.customer}`,
        );
      } else {
        // Process each user doc individually so one failure doesn't
        // prevent the rest from updating.
        // Derive plan from price ID for paid events
        const priceId = dataObject.items?.data?.[0]?.price?.id || null;
        const newPlan = subscribedValue ? derivePlanFromPriceId(priceId) : "basic";

        for (const userDoc of userSnapshot.docs) {
          try {
            await userDoc.ref.update({
              subscribed: subscribedValue,
              stripe_subscription_id: dataObject.id,
              stripe_subscription_status: dataObject.status,
              plan: newPlan,
              planUpdatedAt: FieldValue.serverTimestamp(),
            });
            // Also mirror plan to `users` collection
            const db = getFirestore();
            await db.collection("users").doc(userDoc.id).set(
              { plan: newPlan, planUpdatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            );
            logger.info(
              `Updated subscription for user ${userDoc.id} → subscribed=${subscribedValue}, plan=${newPlan}`,
            );
          } catch (updateErr) {
            logger.error(
              `Failed to update user ${userDoc.id}:`,
              updateErr,
            );
          }
        }
      }
    } else {
      logger.info(`Unhandled Stripe event type: ${event.type}`);
    }

    // Mark event as processed (after successful handling)
    await markEventProcessed(event.id, event.type);

    return res.sendStatus(200);
  } catch (err) {
    logger.error("Error processing Stripe webhook:", err);
    return res.sendStatus(500);
  }
});
