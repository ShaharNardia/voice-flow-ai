/**
 * Health Check & Monitoring Endpoint
 *
 * Provides system health status for uptime monitoring services.
 * Checks: Firestore connectivity, Twilio config, Stripe config, SendGrid config.
 *
 * Also exports getIntegrationStatus — lightweight, no-auth, env-var-presence check
 * for the user-facing Settings page.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const VERSION = "1.0.0";
const START_TIME = Date.now();

exports.healthCheck = onRequest({secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method !== "GET") {
    res.set("Allow", "GET");
    res.status(405).json({status: "error", message: "Method not allowed."});
    return;
  }

  const checks = {};
  let overallHealthy = true;

  // 1. Firestore connectivity (critical – only failure that causes degraded)
  try {
    const db = getFirestore();
    const fsStart = Date.now();
    await db.collection("admin").limit(1).get();
    const fsLatency = Date.now() - fsStart;
    checks.firestore = {status: "ok", latencyMs: fsLatency};
  } catch (error) {
    checks.firestore = {status: "error", message: error.message};
    overallHealthy = false;
  }

  // 2. Environment configuration checks (informational only – missing optional
  //    services should NOT cause degraded status; only Firestore is critical)
  const envChecks = {
    twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    stripe: !!process.env.STRIPE_SECRET_KEY,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    adminSecret: !!process.env.ADMIN_PROVISION_SECRET,
    googleTts: true, // Always available via default credentials
  };

  const configuredCount = Object.values(envChecks).filter(Boolean).length;
  const totalCount = Object.values(envChecks).length;

  checks.config = {
    status: configuredCount === totalCount ? "ok" : "partial",
    configured: `${configuredCount}/${totalCount}`,
    services: envChecks,
  };

  // 3. Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rssMb: Math.round(mem.rss / 1024 / 1024),
  };

  const uptimeSeconds = Math.round((Date.now() - START_TIME) / 1000);

  const result = {
    status: overallHealthy ? "healthy" : "degraded",
    version: VERSION,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    region: process.env.FUNCTION_REGION || "us-central1",
    nodeVersion: process.version,
    checks,
  };

  const statusCode = overallHealthy ? 200 : 503;
  res.status(statusCode).json(result);
});

/**
 * getIntegrationStatus — public (no auth required), no live API calls.
 * Returns boolean "configured" flag per service based on env var presence.
 * Used by the user-facing Settings page to display which integrations are active.
 */
exports.getIntegrationStatus = onRequest({secrets: [OPENAI_API_KEY]}, async (req, res) => {
  // Allow CORS from any origin — this is read-only, non-sensitive data
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  const services = {
    twilio: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      label: "Twilio",
      description: "Voice calls & SMS",
    },
    stripe: {
      configured: !!process.env.STRIPE_SECRET_KEY,
      label: "Stripe",
      description: "Billing & subscriptions",
    },
    sendgrid: {
      configured: !!process.env.SENDGRID_API_KEY,
      label: "SendGrid",
      description: "Transactional email",
    },
    elevenlabs: {
      configured: !!process.env.ELEVENLABS_API_KEY,
      label: "ElevenLabs",
      description: "AI voice synthesis",
    },
    deepgram: {
      configured: !!process.env.DEEPGRAM_API_KEY,
      label: "Deepgram",
      description: "Speech-to-text transcription",
    },
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      label: "OpenAI",
      description: "AI language model",
    },
    whatsapp: {
      configured: !!process.env.TWILIO_WHATSAPP_FROM,
      label: "WhatsApp",
      description: "WhatsApp messaging via Twilio",
    },
  };

  res.status(200).json({services, timestamp: new Date().toISOString()});
});
