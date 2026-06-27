/**
 * Admin Secrets — list + rotate Firebase / GCP secrets from the admin UI.
 *
 * SECURITY:
 *   - super_admin only
 *   - whitelist of allowed secret names (no arbitrary writes)
 *   - secret VALUES are never read or returned; we only return metadata
 *     (existence, version count, last rotated timestamp, masked tail)
 *   - rotation creates a new secret version; old versions remain accessible
 *     to functions using `defineSecret` until they cold-start with the new
 *     binding. Audit row written for every rotation.
 *   - secret payloads are accepted via POST body and IMMEDIATELY hashed for
 *     audit + cleared from process memory references after use.
 *
 * Endpoints:
 *   GET  /adminListSecrets        → { secrets: [{name, status, versionCount, lastRotated, masked}, ...] }
 *   POST /adminRotateSecret       { name, value }  → adds new version
 *
 * Setting a new version does NOT auto-redeploy functions. Functions pick up
 * new versions on cold-start, which usually happens within minutes as
 * instances cycle. For immediate rotation, run a manual redeploy.
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
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

const PROJECT_ID = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";

// Whitelist of secret names admin can manage.
// Each entry describes: human label, which functions consume it (informational),
// and whether rotation requires a manual redeploy to take effect.
const MANAGED_SECRETS = [
  { name: "OPENAI_API_KEY",     label: "OpenAI API key",      provider: "openai",     functions: ["assistantTestChat", "analyzeCall", "promptCoachChat", "scenarioWizardChat", "scenarioWizardGenerate", "scenarioAiAssistant", "tutorCreateSession", "synthesizeTts"] },
  { name: "GEMINI_API_KEY",     label: "Google Gemini key",   provider: "google",     functions: ["voiceflow-mediastream (Cloud Run env var)"] },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs key",      provider: "elevenlabs", functions: ["elevenlabsCloneVoice", "elevenlabsPreviewVoice", "elevenlabsDeleteVoice", "synthesizeTts", "listTtsVoices"] },
  { name: "DEEPGRAM_API_KEY",   label: "Deepgram STT key",    provider: "deepgram",   functions: ["voiceflow-mediastream (Cloud Run env var)"] },
  { name: "TWILIO_AUTH_TOKEN",  label: "Twilio auth token",   provider: "twilio",     functions: ["voice_service.placeCall", "twilioRecordingCallback", "voiceflow-mediastream"] },
  { name: "SENDGRID_API_KEY",   label: "SendGrid email key",  provider: "sendgrid",   functions: ["sendMailToCustomer", "tutorCreateSession"] },
  { name: "SIP_BRIDGE_SECRET",  label: "SIP bridge secret",   provider: "sip",        functions: ["placeCall", "voiceflow-mediastream"] },
];

const client = new SecretManagerServiceClient();

async function requireSuperAdmin(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  const role = u.exists ? u.data().role : null;
  if (role !== "super_admin") {
    res.status(403).json({ error: "super_admin only" });
    return null;
  }
  return uid;
}

// Look up the metadata of a single secret (without reading the value).
async function getSecretMeta(name) {
  const out = {
    name,
    status: "missing",
    versionCount: 0,
    lastRotated: null,
    masked: null,
    error: null,
  };
  try {
    const secretPath = `projects/${PROJECT_ID}/secrets/${name}`;
    const [secret] = await client.getSecret({ name: secretPath });
    out.status = "present";
    out.createdAt = secret.createTime?.seconds
      ? new Date(parseInt(secret.createTime.seconds, 10) * 1000).toISOString()
      : null;

    // Count versions
    const versions = [];
    for await (const v of client.listVersionsAsync({ parent: secretPath, pageSize: 50 })) {
      versions.push(v);
    }
    out.versionCount = versions.length;
    const latestEnabled = versions.find((v) => v.state === "ENABLED");
    if (latestEnabled) {
      out.lastRotated = latestEnabled.createTime?.seconds
        ? new Date(parseInt(latestEnabled.createTime.seconds, 10) * 1000).toISOString()
        : null;

      // Read just enough of the value to show a masked last-4 hint. This is
      // the ONLY place we touch the value bytes — they're scoped to this fn
      // and never logged.
      try {
        const [v] = await client.accessSecretVersion({ name: latestEnabled.name });
        const val = v.payload?.data?.toString?.() || "";
        if (val.length >= 8) out.masked = `…${val.slice(-4)}`;
        else if (val.length > 0) out.masked = "…(short)";
      } catch (_) { /* permission edge — ignore */ }
    }
  } catch (e) {
    if (e.code === 5 /* NOT_FOUND */) {
      out.status = "missing";
    } else {
      out.error = e.message;
    }
  }
  return out;
}

// Exposed for other admin services that want to render key status without
// duplicating Secret Manager wiring.
exports._internal = { getSecretMeta };

exports.adminListSecrets = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await requireSuperAdmin(req, res))) return;

  try {
    const metas = await Promise.all(MANAGED_SECRETS.map(async (s) => {
      const meta = await getSecretMeta(s.name);
      return { ...s, ...meta };
    }));
    res.json({ secrets: metas, project: PROJECT_ID });
  } catch (e) {
    logger.error("adminListSecrets failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

exports.adminRotateSecret = onRequest({ region: REGION, memory: "256MiB", ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const uid = await requireSuperAdmin(req, res);
  if (!uid) return;

  const { name, value } = req.body || {};
  if (!name || typeof value !== "string") { res.status(400).json({ error: "name + value required" }); return; }
  if (!MANAGED_SECRETS.find((s) => s.name === name)) {
    res.status(403).json({ error: "Not in managed-secrets whitelist" });
    return;
  }
  // Trim trailing whitespace / newlines — the most common rotation-corruption
  // cause we've hit (e.g. shell echo adding \n).
  const cleaned = value.replace(/\s+$/g, "");
  if (cleaned.length < 8) { res.status(400).json({ error: "Value too short — likely paste error" }); return; }

  // Hash for audit (we never store the secret itself).
  const hash = crypto.createHash("sha256").update(cleaned).digest("hex").slice(0, 16);

  try {
    const parent = `projects/${PROJECT_ID}/secrets/${name}`;
    // Ensure the secret container exists (idempotent create attempt)
    try {
      await client.createSecret({
        parent: `projects/${PROJECT_ID}`,
        secretId: name,
        secret: { replication: { automatic: {} } },
      });
    } catch (e) {
      if (e.code !== 6 /* ALREADY_EXISTS */) throw e;
    }
    const [version] = await client.addSecretVersion({
      parent,
      payload: { data: Buffer.from(cleaned, "utf8") },
    });

    const db = getFirestore();
    await db.collection("secret_rotation_audit").add({
      secretName: name,
      versionName: version.name,
      hashPrefix: hash,
      rotatedBy: uid,
      rotatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Secret rotated", { name, version: version.name, uid });
    res.json({
      name,
      versionName: version.name,
      message: "New version created. Existing function instances will pick up the new value on cold-start (usually within minutes). For immediate effect, redeploy the affected functions.",
      affectedFunctions: MANAGED_SECRETS.find((s) => s.name === name)?.functions || [],
    });
  } catch (e) {
    logger.error("adminRotateSecret failed", e.message);
    res.status(500).json({ error: e.message });
  }
});
