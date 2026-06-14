/**
 * voximplant_service.js
 *
 * Firebase Functions module for routing calls through VoxImplant
 * as an alternative to Twilio for clients that don't have SIP infrastructure.
 *
 * Architecture:
 *   Firebase → VoxImplant Management API (StartScenarios)
 *            → VoxImplant Scenario (JS) runs on VoxImplant platform
 *            → Scenario places call + opens WebSocket to Cloud Run
 *            → Scenario POSTs lifecycle events back to voxImplantWebhook
 *
 * Company Firestore fields required:
 *   telephonyProvider : "voximplant"
 *   voxAccountId      : "12345"            (VoxImplant account ID)
 *   voxApiKey         : "abc...xyz"         (VoxImplant API key)
 *   voxRuleId         : "67890"             (rule ID in VoxImplant app)
 *   voxAppName        : "voiceflow"         (optional, for logging)
 *   voxCallerId       : "+1234567890"       (outbound caller ID)
 */

const { logger } = require("firebase-functions");
const axios       = require("axios");
const { getFirestore } = require("firebase-admin/firestore");

const VOX_API_BASE = "https://api.voximplant.com/platform_api";

// ── Company config helpers ────────────────────────────────────────────────────

async function isVoxImplantEnabled(companyId) {
  if (!companyId) return false;
  try {
    const db  = getFirestore();
    const doc = await db.collection("Company").doc(companyId).get();
    if (!doc.exists) return false;
    const d = doc.data();
    return d.telephonyProvider === "voximplant" && d.voxAccountId && d.voxApiKey && d.voxRuleId;
  } catch (err) {
    logger.error("[VoxImplant] isEnabled check failed:", err.message);
    return false;
  }
}

async function getVoxConfig(companyId, opts = {}) {
  if (!companyId) return null;
  // requireProviderFlag=true (default): only return creds when the company is
  // globally on Voximplant. Pass false for per-assistant opt-in, where the
  // routing decision lives on the assistant but the credentials still live on
  // the Company doc. Either way the credentials themselves must be present.
  const { requireProviderFlag = true } = opts;
  try {
    const db  = getFirestore();
    const doc = await db.collection("Company").doc(companyId).get();
    if (!doc.exists) return null;
    const d = doc.data();
    if (requireProviderFlag && d.telephonyProvider !== "voximplant") return null;
    if (!d.voxAccountId || !d.voxApiKey || !d.voxRuleId) return null;
    return {
      accountId:  d.voxAccountId,
      apiKey:     d.voxApiKey,
      ruleId:     d.voxRuleId,
      appName:    d.voxAppName    || "voiceflow",
      callerId:   d.voxCallerId  || d.defaultDdi || null,
    };
  } catch (err) {
    logger.error("[VoxImplant] getConfig failed:", err.message);
    return null;
  }
}

// ── Place outbound call via VoxImplant Management API ─────────────────────────

/**
 * Starts a VoxImplant scenario that places an outbound PSTN call.
 * The scenario receives `customData` (JSON string) with call parameters
 * and webhookUrl to report events back.
 *
 * @returns {{ success: boolean, callId?: string, error?: string }}
 */
async function placeCallViaVoxImplant(config, callData) {
  const { accountId, apiKey, ruleId, callerId } = config;
  const {
    leadNumber, leadName, companyName, assistantName,
    greeting, companyPhone, callSessionId, webhookUrl, cloudRunUrl, metadata,
  } = callData;

  const customData = JSON.stringify({
    callSessionId,
    to:           leadNumber,
    from:         callerId || companyPhone,
    leadName:     leadName     || "",
    companyName:  companyName  || "",
    assistantName: assistantName || "",
    greeting:     greeting     || "",
    webhookUrl,
    cloudRunUrl,
    metadata:     metadata     || {},
  });

  try {
    const resp = await axios.post(
      `${VOX_API_BASE}/StartScenarios`,
      null,
      {
        params: {
          account_id:   accountId,
          api_key:      apiKey,
          rule_id:      ruleId,
          custom_data:  customData,
          reference_to_call_id: callSessionId,
        },
        timeout: 15000,
      }
    );

    const result = resp.data;

    // VoxImplant returns { result: 1, media_session_access_url, ... } on success
    if (result.result !== 1) {
      throw new Error(`VoxImplant error: ${result.error || JSON.stringify(result)}`);
    }

    logger.info(`[VoxImplant] Scenario started for session ${callSessionId}`, { result });

    return {
      success:   true,
      callId:    String(result.media_session_id || callSessionId),
      sessionUrl: result.media_session_access_url || null,
    };
  } catch (err) {
    logger.error(`[VoxImplant] placeCall failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── Hangup / update a live call ───────────────────────────────────────────────

/**
 * Send a command to a running scenario via VoxImplant's SendMediaSessionCommand.
 * The scenario listens for AppEvents.MessageReceived to handle these.
 */
async function updateCallViaVoxImplant(config, callId, payload) {
  const { accountId, apiKey } = config;
  try {
    await axios.post(
      `${VOX_API_BASE}/SendMediaSessionCommand`,
      null,
      {
        params: {
          account_id:       accountId,
          api_key:          apiKey,
          media_session_id: callId,
          cmd:              JSON.stringify(payload),
        },
        timeout: 8000,
      }
    );
    return true;
  } catch (err) {
    logger.warn(`[VoxImplant] updateCall failed: ${err.message}`);
    return false;
  }
}

// ── Webhook handler (called by the VoxImplant scenario) ──────────────────────

/**
 * Express handler for POST /voxImplantWebhook
 * VoxImplant scenario calls this on: call.connected, call.completed, call.failed
 */
async function handleWebhook(req, res) {
  const db   = getFirestore();
  const body = req.body || {};
  const {
    event, callSessionId, callId,
    duration, hangupCause,
  } = body;

  logger.info(`[VoxImplant] Webhook event=${event} session=${callSessionId}`);

  // INBOUND BOOTSTRAP — the VoxEngine scenario has no session for an inbound
  // call (rules pass no customData). It POSTs inbound.start with {from, to(DID)};
  // we resolve the DID→assistant, create the session, and hand back the id +
  // Cloud Run URL so the scenario can open the audio WebSocket. Handled BEFORE
  // the callSessionId guard because no session exists yet.
  if (event === "inbound.start") {
    try {
      const voxInbound = require("./voximplant_inbound.js");
      const result = await voxInbound.createInboundSession({ from: body.from, to: body.to });
      if (!result) return res.status(404).json({ error: `No assistant mapped to DID ${body.to}` });
      return res.json({ ok: true, ...result });
    } catch (e) {
      logger.error("[VoxImplant] inbound.start failed:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (!callSessionId) return res.status(400).json({ error: "Missing callSessionId" });

  try {
    const sessionRef = db.collection("call_sessions").doc(callSessionId);

    switch (event) {
      case "call.ringing":
        await sessionRef.set({ status: "ringing",    voxCallId: callId }, { merge: true });
        break;

      case "call.connected":
        await sessionRef.set({ status: "in-progress", voxCallId: callId }, { merge: true });
        break;

      case "call.completed":
        await sessionRef.set({
          status:      "completed",
          endedAt:     new Date().toISOString(),
          duration:    duration || 0,
          hangupCause: hangupCause || "normal",
        }, { merge: true });
        break;

      case "call.failed":
        await sessionRef.set({
          status:    "failed",
          error:     hangupCause || "VoxImplant call failed",
        }, { merge: true });
        break;

      default:
        logger.warn(`[VoxImplant] Unknown event: ${event}`);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error("[VoxImplant] Webhook handler error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  isVoxImplantEnabled,
  getVoxConfig,
  placeCallViaVoxImplant,
  updateCallViaVoxImplant,
  handleWebhook,
};
