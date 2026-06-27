/**
 * SIP setup wizard backend — admin-only helpers for the /admin/sip-setup page.
 *
 *   POST /sipSetupCheckBridge   { bridgeUrl, bridgeSecret }
 *     → server-side proxy that hits the bridge /health endpoint (avoids CORS
 *       and keeps the bridge IP out of the browser console). Returns:
 *       { ok, ariConnected, version, activeCalls, latencyMs }
 *
 *   GET  /sipSetupGetConfig
 *     → which SIP env vars are configured on this Functions deployment.
 *       Helps the wizard show "you still need to set X" hints.
 *
 *   GET  /sipSetupGetCloudRunConfig
 *     → mirrors the above for the Cloud Run service.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const axios = require("axios");
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

async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  // Best-effort role check via Firestore. The frontend already gates this route
  // with the (admin) layout, this is defense in depth.
  try {
    const { getFirestore } = require("firebase-admin/firestore");
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(uid).get();
    const role = userSnap.data()?.role;
    if (role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Admin only" });
      return null;
    }
  } catch (e) {
    logger.warn("Role check failed in sipSetup", e.message);
    res.status(500).json({ error: "Role check failed" });
    return null;
  }
  return uid;
}

exports.sipSetupCheckBridge = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

  if (!(await requireAdmin(req, res))) return;

  const { bridgeUrl, bridgeSecret } = req.body || {};
  if (!bridgeUrl) { res.status(400).json({ error: "bridgeUrl required" }); return; }

  const t0 = Date.now();
  try {
    // Try the authenticated /metrics endpoint if a secret is provided, else /health.
    const url = bridgeSecret
      ? `${bridgeUrl.replace(/\/$/, "")}/health`  // /health is unauthenticated by design
      : `${bridgeUrl.replace(/\/$/, "")}/health`;
    const r = await axios.get(url, { timeout: 8000, validateStatus: () => true });
    const latencyMs = Date.now() - t0;
    if (r.status === 200 && r.data?.status === "ok") {
      res.json({
        ok: true,
        ariConnected: !!r.data.ariConnected,
        version: r.data.version || null,
        activeCalls: r.data.activeCalls || 0,
        latencyMs,
      });
    } else {
      res.json({
        ok: false,
        error: `Bridge returned HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`,
        latencyMs,
      });
    }
  } catch (e) {
    res.json({
      ok: false,
      error: e.code === "ECONNREFUSED" ? "Connection refused — is the bridge running on that port?"
           : e.code === "ETIMEDOUT"    ? "Timed out — is the firewall blocking this Firebase IP?"
           : e.code === "ENOTFOUND"    ? "Hostname not found — DNS or typo?"
           : e.message,
      latencyMs: Date.now() - t0,
    });
  }
});

exports.sipSetupGetConfig = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireAdmin(req, res))) return;

  // We DON'T return the actual values (those are secrets) — only whether they're set.
  res.json({
    functions: {
      SIP_BRIDGE_URL:    !!process.env.SIP_BRIDGE_URL,
      SIP_BRIDGE_SECRET: !!process.env.SIP_BRIDGE_SECRET,
      // Expose the URL so the wizard can confirm what's currently wired
      // (URL is not secret; the secret stays hidden)
      currentBridgeUrl:  process.env.SIP_BRIDGE_URL || null,
    },
  });
});

/**
 * Multi-check verification — used by the wizard's per-step "Verify" buttons.
 * Each check is independent so the wizard can show a per-check ✓/✗ matrix.
 *
 *   POST /sipSetupVerify  { bridgeUrl?, bridgeSecret? }
 *   →  {
 *        firebaseEnv: { ok, detail },
 *        cloudRunPing: { ok, status, detail },
 *        bridgeReachable: { ok, ariConnected, version, detail },
 *      }
 */
exports.sipSetupVerify = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }
  if (!(await requireAdmin(req, res))) return;

  const { bridgeUrl, bridgeSecret } = req.body || {};
  const out = {
    firebaseEnv:     { ok: false, detail: "" },
    cloudRunPing:    { ok: false, status: null, detail: "" },
    bridgeReachable: { ok: false, ariConnected: false, version: null, detail: "" },
  };

  // 1. Firebase Functions env
  if (process.env.SIP_BRIDGE_URL && process.env.SIP_BRIDGE_SECRET) {
    out.firebaseEnv.ok = true;
    out.firebaseEnv.detail = `SIP_BRIDGE_URL = ${process.env.SIP_BRIDGE_URL}`;
  } else {
    const missing = [];
    if (!process.env.SIP_BRIDGE_URL)    missing.push("SIP_BRIDGE_URL");
    if (!process.env.SIP_BRIDGE_SECRET) missing.push("SIP_BRIDGE_SECRET");
    out.firebaseEnv.detail = `Missing: ${missing.join(", ")}. Add to firebase/functions/.env and redeploy placeCall.`;
  }

  // 2. Cloud Run mediastream health
  try {
    const cloudRunUrl = process.env.CLOUD_RUN_MEDIASTREAM_URL
                     || "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app";
    const r = await axios.get(`${cloudRunUrl}/health`, { timeout: 6000, validateStatus: () => true });
    out.cloudRunPing.status = r.status;
    if (r.status === 200) {
      out.cloudRunPing.ok = true;
      out.cloudRunPing.detail = "Cloud Run mediastream service is up";
    } else {
      out.cloudRunPing.detail = `Cloud Run returned HTTP ${r.status}`;
    }
  } catch (e) {
    out.cloudRunPing.detail = e.message || "Cloud Run unreachable";
  }

  // 3. Bridge reachable + ARI connected (if URL provided)
  if (bridgeUrl) {
    try {
      const r = await axios.get(`${bridgeUrl.replace(/\/$/, "")}/health`, { timeout: 8000, validateStatus: () => true });
      if (r.status === 200 && r.data?.status === "ok") {
        out.bridgeReachable.ok = true;
        out.bridgeReachable.ariConnected = !!r.data.ariConnected;
        out.bridgeReachable.version = r.data.version || null;
        out.bridgeReachable.detail = r.data.ariConnected
          ? `Bridge ${r.data.version || ""} + Asterisk ARI both healthy`
          : "Bridge reachable but Asterisk ARI is NOT connected — check ari.conf password and http.conf";
      } else {
        out.bridgeReachable.detail = `Bridge returned HTTP ${r.status}`;
      }
    } catch (e) {
      out.bridgeReachable.detail = e.code === "ECONNREFUSED" ? "Connection refused — bridge not running on that port"
                                 : e.code === "ETIMEDOUT"    ? "Timed out — firewall blocking GCP IPs?"
                                 : e.code === "ENOTFOUND"    ? "Hostname not found"
                                 : e.message;
    }
  } else {
    out.bridgeReachable.detail = "No bridge URL provided yet";
  }

  res.json(out);
});
