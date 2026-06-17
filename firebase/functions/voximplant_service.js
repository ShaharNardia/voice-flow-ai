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
      applicationId: d.voxApplicationId || null,
      callerId:   d.voxCallerId  || d.defaultDdi || null,
    };
  } catch (err) {
    logger.error("[VoxImplant] getConfig failed:", err.message);
    return null;
  }
}

/**
 * Resolve Voximplant config for a buy/search request. Prefers an explicit
 * companyId; otherwise finds the single Company doc that holds Voximplant
 * credentials (this deployment is effectively single-primary-company). Returns
 * { config, companyId } or null.
 */
async function resolveVoxConfig(companyId) {
  if (companyId) {
    const cfg = await getVoxConfig(companyId, { requireProviderFlag: false });
    if (cfg) return { config: cfg, companyId };
  }
  try {
    const db = getFirestore();
    const snap = await db.collection("Company").where("voxApiKey", "!=", null).limit(1).get();
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const cfg = await getVoxConfig(docSnap.id, { requireProviderFlag: false });
      if (cfg) return { config: cfg, companyId: docSnap.id };
    }
  } catch (err) {
    logger.error("[VoxImplant] resolveVoxConfig failed:", err.message);
  }
  return null;
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

// ── Phone-number provisioning (VoxImplant Management API) ────────────────────
//
// Self-serve DID buy flow. Voximplant's number APIs are multi-step:
//   GetPhoneNumberCategories → GetPhoneNumberRegions → GetNewPhoneNumbers (search)
//   AttachPhoneNumber (buy) → BindPhoneNumberToApplication (route inbound to our rule)
// Inventory is region/KYC-gated per account, so a search can legitimately return
// an empty list for a country even when the API call itself succeeds.

/** Thin GET wrapper around the Management API; always injects auth. */
async function voxApi(config, method, params = {}) {
  const resp = await axios.get(`${VOX_API_BASE}/${method}`, {
    params: { account_id: config.accountId, api_key: config.apiKey, ...params },
    timeout: 20000,
  });
  const data = resp.data || {};
  if (data.error) {
    throw new Error(`VoxImplant ${method}: ${data.error.msg || data.error.code || JSON.stringify(data.error)}`);
  }
  return data;
}

const VOX_CATEGORY_PREFERENCE = ["GEOGRAPHIC", "GEOGRAPHIC_TOLLFREE", "MOBILE", "NATIONAL", "TOLLFREE"];

/**
 * Search numbers available to buy for a country.
 * Resolves a sensible category automatically when none is supplied, and falls
 * back to the first region with inventory if the category needs a region.
 * @returns {{ numbers: Array, category: string|null, note?: string }}
 */
async function searchVoxNumbers(config, { country = "US", category, regionId, count = 20 } = {}) {
  country = String(country).toUpperCase();

  let categoryName = category;
  let categories = [];
  if (!categoryName) {
    const cats = await voxApi(config, "GetPhoneNumberCategories", { country_code: country });
    categories = Array.isArray(cats.result) ? cats.result : [];
    const picked = VOX_CATEGORY_PREFERENCE
      .map((p) => categories.find((c) => c.phone_category_name === p))
      .find(Boolean) || categories[0];
    if (!picked) return { numbers: [], category: null, note: `No number categories offered for ${country}.` };
    categoryName = picked.phone_category_name;
  }

  const fetchNumbers = async (extra = {}) => {
    const data = await voxApi(config, "GetNewPhoneNumbers", {
      country_code: country, phone_category_name: categoryName, count, ...extra,
    });
    return Array.isArray(data.result) ? data.result : [];
  };

  let raw = [];
  try {
    raw = await fetchNumbers(regionId ? { phone_region_id: regionId } : {});
  } catch {
    raw = [];
  }
  // Some categories require an explicit region — retry with the first region
  // that actually has inventory.
  if (raw.length === 0 && !regionId) {
    try {
      const regions = await voxApi(config, "GetPhoneNumberRegions", { country_code: country, phone_category_name: categoryName });
      const withStock = (Array.isArray(regions.result) ? regions.result : [])
        .filter((r) => Number(r.phone_count) > 0)
        .sort((a, b) => Number(a.phone_price) - Number(b.phone_price));
      if (withStock[0]) raw = await fetchNumbers({ phone_region_id: withStock[0].phone_region_id });
    } catch { /* leave raw empty */ }
  }

  const numbers = raw.map((n) => ({
    phoneNumber: n.phone_number,
    phoneId: n.phone_id != null ? String(n.phone_id) : undefined,
    category: n.phone_category_name || categoryName,
    region: n.phone_region_name || "",
    regionId: n.phone_region_id != null ? String(n.phone_region_id) : undefined,
    monthlyPrice: n.phone_price != null ? String(n.phone_price) : undefined,
    setupPrice: n.phone_installation_price != null ? String(n.phone_installation_price) : undefined,
    country,
  }));
  return { numbers, category: categoryName };
}

/**
 * Buy a Voximplant DID and bind it to our application+rule so inbound calls
 * trigger the VoxEngine scenario. Binding is best-effort — if it fails (e.g. the
 * Company doc has no resolvable application), the number is still attached and
 * we surface a note so an admin can finish binding in the Voximplant console.
 * @returns {{ phoneNumber: string, phoneId?: string, bound: boolean, note?: string }}
 */
async function buyVoxNumber(config, { phoneNumber, phoneId, country, category, regionId } = {}) {
  const attachParams = { phone_count: 1 };
  if (country)  attachParams.country_code = String(country).toUpperCase();
  if (category) attachParams.phone_category_name = category;
  if (regionId) attachParams.phone_region_id = regionId;
  if (phoneNumber) attachParams.phone_number = phoneNumber;

  const attach = await voxApi(config, "AttachPhoneNumber", attachParams);
  const attachedList = Array.isArray(attach.phone_numbers) ? attach.phone_numbers : [];
  if (attach.result !== 1 && attachedList.length === 0) {
    throw new Error(`AttachPhoneNumber failed: ${JSON.stringify(attach)}`);
  }
  const attached  = attachedList[0] || {};
  const boughtNum = attached.phone_number || phoneNumber;
  const boughtId  = attached.phone_id != null ? String(attached.phone_id) : phoneId;

  // Bind to application + rule (routes inbound to our scenario).
  let bound = false, note;
  try {
    const bindParams = { bind: true, rule_id: config.ruleId };
    if (boughtId) bindParams.phone_id = boughtId; else bindParams.phone_number = boughtNum;
    // application_name must be the FQDN form (e.g. "voiceflow.account.voximplant.com").
    if (config.appName && config.appName.includes(".")) bindParams.application_name = config.appName;
    if (config.applicationId) bindParams.application_id = config.applicationId;
    if (!bindParams.application_name && !bindParams.application_id) {
      note = "Number attached but not auto-bound: set voxAppName (FQDN) or voxApplicationId on the Company doc, or bind it to your app+rule in the Voximplant console.";
    } else {
      const bind = await voxApi(config, "BindPhoneNumberToApplication", bindParams);
      bound = bind.result === 1;
      if (!bound) note = `Number attached but bind returned: ${JSON.stringify(bind)}`;
    }
  } catch (e) {
    note = `Number attached but binding failed (${e.message}). Bind it to your app+rule in the Voximplant console.`;
  }

  return { phoneNumber: boughtNum, phoneId: boughtId, bound, note };
}

/** List DIDs already owned on the account. */
async function listVoxNumbers(config) {
  const data = await voxApi(config, "GetPhoneNumbers", { count: 100 });
  return (Array.isArray(data.result) ? data.result : []).map((n) => ({
    phoneNumber: n.phone_number,
    phoneId: n.phone_id != null ? String(n.phone_id) : undefined,
    country: n.phone_country_code || "",
    category: n.phone_category_name || "",
    isBound: !!n.application_id,
  }));
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
  resolveVoxConfig,
  placeCallViaVoxImplant,
  updateCallViaVoxImplant,
  handleWebhook,
  searchVoxNumbers,
  buyVoxNumber,
  listVoxNumbers,
};
