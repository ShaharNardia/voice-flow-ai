/**
 * Admin Health — single endpoint that runs every integration health check
 * in parallel and returns a structured snapshot for /admin/health.
 *
 * Checks:
 *   • Gemini Live API     — list models (validates GEMINI_API_KEY + reachability)
 *   • ElevenLabs          — /user/subscription (validates ELEVENLABS_API_KEY + quota)
 *   • OpenAI              — /v1/models (validates OPENAI_API_KEY)
 *   • Deepgram            — /v1/projects (validates DEEPGRAM_API_KEY)
 *   • Twilio              — accounts.get
 *   • SIP bridge          — /health (if SIP_BRIDGE_URL configured)
 *   • Cloud Run mediastream — /health
 *   • Firestore           — getCollections() round-trip
 *
 * All checks have short timeouts and report ok/degraded/down with the
 * specific error text for diagnostics.
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

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

const SHORT_TIMEOUT = 6000;

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

async function timeIt(fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    return { latencyMs: Date.now() - t0, ...out };
  } catch (e) {
    return { latencyMs: Date.now() - t0, status: "down", detail: e.message || String(e) };
  }
}

// ── Individual checks ─────────────────────────────────────────────────────

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: "down", detail: "GEMINI_API_KEY env not set" };
  const r = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`, {
    timeout: SHORT_TIMEOUT, validateStatus: () => true,
  });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}` };
  return { status: "ok", detail: `Models endpoint reachable` };
}

async function checkElevenLabs() {
  const key = (ELEVENLABS_API_KEY.value() || process.env.ELEVENLABS_API_KEY || "").replace(/\s/g, "");
  if (!key) return { status: "down", detail: "ELEVENLABS_API_KEY not set" };
  const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": key }, timeout: SHORT_TIMEOUT, validateStatus: () => true,
  });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}` };
  const used = r.data?.character_count || 0;
  const lim  = r.data?.character_limit || 0;
  const pct  = lim > 0 ? Math.round((used / lim) * 100) : 0;
  return {
    status: pct > 90 ? "degraded" : "ok",
    detail: `${used.toLocaleString()}/${lim.toLocaleString()} chars (${pct}%) · tier=${r.data?.tier || "?"}`,
    extra: { tier: r.data?.tier, used, limit: lim, percent: pct },
  };
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: "down", detail: "OPENAI_API_KEY not set" };
  const r = await axios.get("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` }, timeout: SHORT_TIMEOUT, validateStatus: () => true,
  });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}` };
  return { status: "ok", detail: "Models endpoint reachable" };
}

async function checkDeepgram() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { status: "down", detail: "DEEPGRAM_API_KEY not set" };
  const r = await axios.get("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${key}` }, timeout: SHORT_TIMEOUT, validateStatus: () => true,
  });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}` };
  return { status: "ok", detail: "Projects endpoint reachable" };
}

async function checkTwilio() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { status: "down", detail: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing" };
  const r = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    auth: { username: sid, password: token }, timeout: SHORT_TIMEOUT, validateStatus: () => true,
  });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}` };
  return {
    status: r.data?.status === "active" ? "ok" : "degraded",
    detail: `Account ${r.data?.friendly_name || sid} · ${r.data?.status}`,
  };
}

async function checkSipBridge() {
  const url = process.env.SIP_BRIDGE_URL;
  if (!url) return { status: "unconfigured", detail: "SIP_BRIDGE_URL not set (SIP path not in use)" };
  const r = await axios.get(`${url.replace(/\/$/, "")}/health`, { timeout: SHORT_TIMEOUT, validateStatus: () => true });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}` };
  return {
    status: r.data?.ariConnected ? "ok" : "degraded",
    detail: r.data?.ariConnected
      ? `Bridge ${r.data?.version || "?"} · ${r.data?.activeCalls ?? 0} active calls`
      : "Bridge online but Asterisk ARI is NOT connected",
  };
}

async function checkCloudRunMediastream() {
  const url = "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app";
  const r = await axios.get(`${url}/health`, { timeout: SHORT_TIMEOUT, validateStatus: () => true });
  if (r.status !== 200) return { status: "down", detail: `HTTP ${r.status}` };
  return { status: "ok", detail: "Cloud Run mediastream healthy" };
}

async function checkFirestore() {
  try {
    const db = getFirestore();
    // Cheapest possible touch — list one document from a small known collection
    await db.collection("users").limit(1).get();
    return { status: "ok", detail: "Read round-trip OK" };
  } catch (e) {
    return { status: "down", detail: e.message };
  }
}

// ── Endpoint ──────────────────────────────────────────────────────────────

exports.adminHealthCheck = onRequest(
  { region: REGION, secrets: [ELEVENLABS_API_KEY, OPENAI_API_KEY], timeoutSeconds: 30, memory: "256MiB", ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await requireAdmin(req, res))) return;

    const t0 = Date.now();
    const [gemini, elevenlabs, openai, deepgram, twilio, sipBridge, cloudRun, firestore] = await Promise.all([
      timeIt(checkGemini),
      timeIt(checkElevenLabs),
      timeIt(checkOpenAI),
      timeIt(checkDeepgram),
      timeIt(checkTwilio),
      timeIt(checkSipBridge),
      timeIt(checkCloudRunMediastream),
      timeIt(checkFirestore),
    ]);

    const results = [
      { id: "gemini",     label: "Gemini Live API",             provider: "google",     ...gemini },
      { id: "openai",     label: "OpenAI API",                  provider: "openai",     ...openai },
      { id: "elevenlabs", label: "ElevenLabs (TTS + cloning)",  provider: "elevenlabs", ...elevenlabs },
      { id: "deepgram",   label: "Deepgram (STT)",              provider: "deepgram",   ...deepgram },
      { id: "twilio",     label: "Twilio",                       provider: "twilio",     ...twilio },
      { id: "sip",        label: "SIP Bridge (Asterisk)",        provider: "sip",        ...sipBridge },
      { id: "cloudrun",   label: "Cloud Run mediastream",       provider: "google",     ...cloudRun },
      { id: "firestore",  label: "Firestore",                    provider: "google",     ...firestore },
    ];

    const overall = results.every((r) => r.status === "ok" || r.status === "unconfigured")
      ? "ok"
      : results.some((r) => r.status === "down")
        ? "down"
        : "degraded";

    res.json({
      overall,
      results,
      totalLatencyMs: Date.now() - t0,
      checkedAt: new Date().toISOString(),
    });
  }
);
