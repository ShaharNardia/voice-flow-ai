/**
 * NLPearl integration service.
 *
 * NLPearl (https://nlpearl.ai) is a fully-managed voice-AI platform.  Unlike
 * the OpenAI Realtime integration where we bridge audio ourselves, NLPearl
 * owns the entire call lifecycle:
 *   - They provide a phone number
 *   - The caller's audio is handled on their infrastructure
 *   - Their LLM + TTS speak back
 *   - At the end of the call they POST a webhook to us with the transcript
 *
 * Our job here is to:
 *   1. Configure the Pearl (agent) — system prompt, KB, inbound webhook URL
 *   2. Place outbound calls via their REST API
 *   3. Receive their webhook events and persist call data to Firestore
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger}    = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const https = require("https");

const NLPEARL_API_TOKEN = defineSecret("NLPEARL_API_TOKEN");
const BASE_URL = "api.nlpearl.ai";
const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// ── Low-level HTTPS helper ────────────────────────────────────────────────────
function nlpearlRequest(path, {method = "GET", body = null, token} = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: BASE_URL,
      path,
      method,
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        ...(data ? {"Content-Type": "application/json", "Content-Length": Buffer.byteLength(data)} : {}),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = buf ? JSON.parse(buf) : null; } catch (_) { parsed = buf; }
        resolve({status: res.statusCode, body: parsed});
      });
    });
    req.on("error", (e) => resolve({status: 0, body: {error: e.message}}));
    if (data) req.write(data);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** GET /v2/Account — sanity check */
function getAccount(token)        { return nlpearlRequest("/v2/Account",              {token}); }
/** GET /v2/Account/PhoneNumbers */
function listPhoneNumbers(token)  { return nlpearlRequest("/v2/Account/PhoneNumbers", {token}); }
/** GET /v2/Account/Voices */
function listVoices(token)        { return nlpearlRequest("/v2/Account/Voices",       {token}); }
/** GET /v2/Pearl/{id}/OngoingCalls */
function getOngoingCalls(token, pearlId) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/OngoingCalls`, {token});
}
/** PUT /v2/Pearl/{id}/Active — body: {isActive: boolean} */
function setPearlActive(token, pearlId, isActive) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/Active`, {method: "PUT", body: {isActive: !!isActive}, token});
}
/** POST /v2/Pearl/{id}/Analytics — body: {from, to} ISO date-times (max 90 days range) */
function getPearlAnalytics(token, pearlId, from, to) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/Analytics`, {method: "POST", body: {from, to}, token});
}
/** GET /v2/Pearl — list all Pearls */
function listPearls(token)        { return nlpearlRequest("/v2/Pearl",                {token}); }
/** GET /v2/Pearl/{id} */
function getPearl(token, pearlId) { return nlpearlRequest(`/v2/Pearl/${pearlId}`,     {token}); }
/** GET /v2/Pearl/{id}/Settings */
function getPearlSettings(token, pearlId) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/Settings`, {token});
}
/** PUT /v2/Pearl/{id}/Settings/Inbound — attaches inbound number + webhook URL */
function updateInboundSettings(token, pearlId, settings) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/Settings/Inbound`, {method: "PUT", body: settings, token});
}
/** POST /v2/Outbound/{pearlId}/Lead — triggers an outbound call */
function addOutboundLead(token, pearlId, lead) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Lead`, {method: "POST", body: lead, token});
}
/** POST /v2/Outbound/{pearlId}/Leads/Add — batch add (max 50k per call) */
function addLeadsBatch(token, pearlId, leads) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Leads/Add`, {method: "POST", body: {leads}, token});
}
/** POST /v2/Outbound/{pearlId}/Leads — search/list leads */
function searchLeads(token, pearlId, params = {}) {
  const body = {
    skip:        params.skip        || 0,
    limit:       Math.min(params.limit || 50, 200),
    sortProp:    params.sortProp    || "created",
    isAscending: !!params.isAscending,
    statuses:    Array.isArray(params.statuses) ? params.statuses : undefined,
    searchInput: params.searchInput || undefined,
  };
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Leads`, {method: "POST", body, token});
}
/** DELETE /v2/Outbound/{pearlId}/Leads — bulk delete by IDs */
function deleteLeads(token, pearlId, leadIds) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Leads`, {method: "DELETE", body: {leadIds}, token});
}
/** PUT /v2/Outbound/{pearlId}/Lead/{leadId} */
function updateLead(token, pearlId, leadId, data) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Lead/${leadId}`, {method: "PUT", body: data, token});
}
/** GET /v2/Outbound/{pearlId}/Lead/{leadId} */
function getLead(token, pearlId, leadId) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Lead/${leadId}`, {token});
}
/** GET /v2/Call/{callId} */
function getCall(token, callId) { return nlpearlRequest(`/v2/Call/${callId}`, {token}); }
/** POST /v2/Account/Blacklist/Search */
function searchBlacklist(token, params = {}) {
  const body = {
    skip:        params.skip        || 0,
    limit:       Math.min(params.limit || 50, 200),
    sortProp:    params.sortProp    || "created", // required by API
    isAscending: typeof params.isAscending === "boolean" ? params.isAscending : false,
    search:      params.search      || undefined,
  };
  return nlpearlRequest("/v2/Account/Blacklist/Search", {method: "POST", body, token});
}
/** POST /v2/Account/Blacklist */
function addToBlacklist(token, phoneNumbers) {
  return nlpearlRequest("/v2/Account/Blacklist", {method: "POST", body: {phoneNumbers}, token});
}
/** POST /v2/Account/Blacklist/Remove */
function removeFromBlacklist(token, phoneNumbers) {
  return nlpearlRequest("/v2/Account/Blacklist/Remove", {method: "POST", body: {phoneNumbers}, token});
}
/** POST /v2/Pearl — Create a new Pearl. Body: {name, inbound?, outbound?} */
function createPearl(token, body) {
  return nlpearlRequest("/v2/Pearl", {method: "POST", body, token});
}
/** PUT /v2/Pearl/{id} — Update Pearl basic info (name, pearl settings, variables) */
function updatePearl(token, pearlId, body) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}`, {method: "PUT", body, token});
}
/** PUT /v2/Pearl/{id}/Settings/Outbound */
function updateOutboundSettings(token, pearlId, settings) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/Settings/Outbound`, {method: "PUT", body: settings, token});
}
/** PUT /v2/Pearl/{id}/ResetMemory — reset memory for one caller (phoneNumber) or all (no arg) */
function resetPearlMemory(token, pearlId, phoneNumber) {
  return nlpearlRequest(`/v2/Pearl/${pearlId}/ResetMemory`, {method: "PUT", body: phoneNumber ? {phoneNumber} : {}, token});
}
/** GET /v2/Account/Users — team users */
function listUsers(token) { return nlpearlRequest("/v2/Account/Users", {token}); }
/** POST /v2/Account/AuditLog — body: {from, to, eventType?, userId?} */
function getAuditLog(token, params) {
  return nlpearlRequest("/v2/Account/AuditLog", {method: "POST", body: params, token});
}
/** DELETE /v2/Call — body: {callIds: []} */
function deleteCalls(token, callIds) {
  return nlpearlRequest("/v2/Call", {method: "DELETE", body: {callIds}, token});
}
/** GET /v2/Outbound/{id}/Lead/External/{externalId} */
function findLeadByExternalId(token, pearlId, externalId) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Lead/External/${encodeURIComponent(externalId)}`, {token});
}
/** GET /v2/Outbound/{id}/Lead/PhoneNumber/{phoneNumber} */
function findLeadByPhone(token, pearlId, phoneNumber) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Lead/PhoneNumber/${encodeURIComponent(phoneNumber)}`, {token});
}
/** DELETE /v2/Outbound/{id}/Leads/External — body: {leadExternalIds: []} */
function deleteLeadsByExternal(token, pearlId, leadExternalIds) {
  return nlpearlRequest(`/v2/Outbound/${pearlId}/Leads/External`, {method: "DELETE", body: {leadExternalIds}, token});
}

// ── Discovery endpoint — one-shot probe to find pearlId + phoneNumberId ──────
exports.nlpearlDiscover = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }

    const [account, phones, pearls] = await Promise.all([
      getAccount(token),
      listPhoneNumbers(token),
      listPearls(token),
    ]);

    // Enrich each pearl with its settings so we can see voice/prompt/etc.
    const pearlList = Array.isArray(pearls.body) ? pearls.body : (pearls.body?.items || []);
    const enriched = [];
    for (const p of pearlList) {
      const settings = await getPearlSettings(token, p.id || p.pearlId);
      enriched.push({pearl: p, settings: settings.body});
    }

    res.json({
      account: {status: account.status, body: account.body},
      phoneNumbers: {status: phones.status, body: phones.body},
      pearls: enriched,
    });
  },
);

// CORS for endpoints called from the dashboard frontend
const FRONTEND_CORS = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// ── Frontend helper: list Pearls (for the assistant editor dropdown) ─────────
exports.nlpearlListPearls = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const r = await listPearls(token);
    const list = Array.isArray(r.body) ? r.body : [];
    // Slim shape for the frontend
    res.json(list.map((p) => ({
      id: p.id || p.pearlId,
      name: p.name,
      type: p.type, // 1 = inbound
      status: p.status,
      createdAt: p.createdAt || p.created,
    })));
  },
);

// ── Frontend helper: list NLPearl phone numbers ──────────────────────────────
exports.nlpearlListPhones = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const [phones, pearls] = await Promise.all([listPhoneNumbers(token), listPearls(token)]);
    const phoneList  = Array.isArray(phones.body)  ? phones.body  : [];
    const pearlList  = Array.isArray(pearls.body)  ? pearls.body  : [];
    // Resolve which Pearl (if any) owns each phone by fetching settings.
    // direction: 1 = inbound, 2 = outbound, 3 = both
    const settingsByPhone = {};
    for (const p of pearlList) {
      const s = await getPearlSettings(token, p.id || p.pearlId);
      const pid = s.body?.inbound?.phoneNumberId;
      if (pid) settingsByPhone[pid] = {pearlId: p.id, pearlName: p.name};
    }
    res.json(phoneList.map((n) => ({
      id:        n.id,
      number:    n.number,
      direction: n.direction,
      provider:  "nlpearl",
      pearlId:   settingsByPhone[n.id]?.pearlId   || null,
      pearlName: settingsByPhone[n.id]?.pearlName || null,
    })));
  },
);

// ── Frontend helper: list available NLPearl voices ───────────────────────────
exports.nlpearlListVoices = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const r = await listVoices(token);
    res.status(r.status === 200 ? 200 : 500).json(r.body || []);
  },
);

// ── Frontend helper: ongoing call count for a Pearl (for live indicator) ─────
exports.nlpearlOngoingCalls = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const pearlId = req.query.pearlId || req.body?.pearlId;
    if (!pearlId) { res.status(400).json({error: "pearlId required"}); return; }
    const r = await getOngoingCalls(token, pearlId);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {totalOngoingCalls: 0, totalOnQueue: 0});
  },
);

// ── Frontend helper: pause/resume a Pearl ────────────────────────────────────
exports.nlpearlSetActive = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, isActive} = req.body || {};
    if (!pearlId || typeof isActive !== "boolean") {
      res.status(400).json({error: "pearlId + isActive (boolean) required"}); return;
    }
    const r = await setPearlActive(token, pearlId, isActive);
    res.status(r.status === 200 ? 200 : 500).json({ok: r.status === 200, status: r.body});
  },
);

// ── Frontend helper: analytics for a Pearl (last 30 days by default) ─────────
exports.nlpearlAnalytics = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const pearlId = req.query.pearlId || req.body?.pearlId;
    if (!pearlId) { res.status(400).json({error: "pearlId required"}); return; }
    // Default: last 30 days
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = req.query.from || req.body?.from || past.toISOString();
    const to   = req.query.to   || req.body?.to   || now.toISOString();
    const r = await getPearlAnalytics(token, pearlId, from, to);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: batch-add leads to a Pearl outbound campaign ────────────
exports.nlpearlAddLeads = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, leads} = req.body || {};
    if (!pearlId || !Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({error: "pearlId + non-empty leads array required"}); return;
    }
    if (leads.length > 50000) {
      res.status(400).json({error: "Max 50,000 leads per request"}); return;
    }
    const r = await addLeadsBatch(token, pearlId, leads);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: search/list leads ───────────────────────────────────────
exports.nlpearlSearchLeads = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const pearlId = req.body?.pearlId || req.query.pearlId;
    if (!pearlId) { res.status(400).json({error: "pearlId required"}); return; }
    const r = await searchLeads(token, pearlId, req.body || req.query);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: delete leads by IDs ─────────────────────────────────────
exports.nlpearlDeleteLeads = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, leadIds} = req.body || {};
    if (!pearlId || !Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({error: "pearlId + non-empty leadIds array required"}); return;
    }
    const r = await deleteLeads(token, pearlId, leadIds);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: search blacklist ────────────────────────────────────────
exports.nlpearlBlacklistSearch = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const r = await searchBlacklist(token, req.body || req.query || {});
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: add to blacklist (numbers or prefixes) ─────────────────
exports.nlpearlBlacklistAdd = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {phoneNumbers} = req.body || {};
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      res.status(400).json({error: "phoneNumbers (array) required"}); return;
    }
    const r = await addToBlacklist(token, phoneNumbers);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend helper: remove from blacklist ───────────────────────────────────
exports.nlpearlBlacklistRemove = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {phoneNumbers} = req.body || {};
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      res.status(400).json({error: "phoneNumbers (array) required"}); return;
    }
    const r = await removeFromBlacklist(token, phoneNumbers);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Frontend: create a new Pearl (inbound or outbound) ──────────────────────
exports.nlpearlCreatePearl = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {name, kind, phoneNumberId, waitingSentence} = req.body || {};
    if (!name || !["inbound", "outbound"].includes(kind)) {
      res.status(400).json({error: "name + kind (inbound|outbound) required"}); return;
    }
    // Minimum-viable settings for each kind.  Phone number is optional —
    // the user can attach one later via nlpearlConfigurePearl or the
    // outbound settings endpoint.
    const body = { name };
    if (kind === "inbound") {
      body.inbound = {
        phoneNumberId: phoneNumberId || undefined,
        totalAgents: 1,
        recordingOptions: true,
        transcriptOptions: 1,
        waitingSentence: waitingSentence || "Hello, please hold while we connect you.",
        callWebhookUrl: `${BASE_FUNCTION_URL}/nlpearlWebhook`,
      };
    } else {
      body.outbound = {
        phoneNumberId: phoneNumberId || undefined,
        totalAgents: 1,
        recordingTrack: 3,         // 3 = Both sides
        transcriptOptions: 1,      // 1 = FullTranscript
        callWebhookUrl: `${BASE_FUNCTION_URL}/nlpearlWebhook`,
      };
    }
    const r = await createPearl(token, body);
    res.status(r.status === 200 ? 200 : 500).json({sent: body, result: r});
  },
);

// ── Frontend: update Pearl name (or other top-level fields) ─────────────────
exports.nlpearlUpdatePearl = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, name} = req.body || {};
    if (!pearlId) { res.status(400).json({error: "pearlId required"}); return; }
    if (!name) { res.status(400).json({error: "At least one field (name) is required"}); return; }
    const r = await updatePearl(token, pearlId, {name});
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Frontend: update outbound settings for a Pearl ──────────────────────────
exports.nlpearlUpdateOutboundSettings = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, settings} = req.body || {};
    if (!pearlId || !settings) { res.status(400).json({error: "pearlId + settings required"}); return; }
    // Ensure our webhook URL is set on outbound too
    const merged = {
      callWebhookUrl: `${BASE_FUNCTION_URL}/nlpearlWebhook`,
      ...settings,
    };
    const r = await updateOutboundSettings(token, pearlId, merged);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Frontend: reset memory for a caller (or all callers) ────────────────────
exports.nlpearlResetMemory = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, phoneNumber} = req.body || {};
    if (!pearlId) { res.status(400).json({error: "pearlId required"}); return; }
    const r = await resetPearlMemory(token, pearlId, phoneNumber);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Compliance: list team users ──────────────────────────────────────────────
exports.nlpearlListUsers = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const r = await listUsers(token);
    res.status(r.status === 200 ? 200 : 500).json(r.body || []);
  },
);

// ── Compliance: audit log viewer ─────────────────────────────────────────────
exports.nlpearlAuditLog = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    // Default to last 30 days if no range provided
    const now  = new Date();
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const body = {
      from:      req.body?.from      || past.toISOString(),
      to:        req.body?.to        || now.toISOString(),
      eventType: req.body?.eventType || undefined,
      userId:    req.body?.userId    || undefined,
    };
    const r = await getAuditLog(token, body);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {});
  },
);

// ── Compliance: bulk delete calls (GDPR) ─────────────────────────────────────
exports.nlpearlDeleteCalls = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {callIds} = req.body || {};
    if (!Array.isArray(callIds) || callIds.length === 0) {
      res.status(400).json({error: "callIds (non-empty array) required"}); return;
    }
    const r = await deleteCalls(token, callIds);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Leads: update a single lead ──────────────────────────────────────────────
exports.nlpearlUpdateLead = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, leadId, data} = req.body || {};
    if (!pearlId || !leadId || !data) {
      res.status(400).json({error: "pearlId + leadId + data required"}); return;
    }
    const r = await updateLead(token, pearlId, leadId, data);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Leads: lookup by external ID ─────────────────────────────────────────────
exports.nlpearlFindLeadByExternal = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const pearlId    = req.query.pearlId    || req.body?.pearlId;
    const externalId = req.query.externalId || req.body?.externalId;
    if (!pearlId || !externalId) { res.status(400).json({error: "pearlId + externalId required"}); return; }
    const r = await findLeadByExternalId(token, pearlId, externalId);
    res.status(r.status === 200 ? 200 : r.status).json(r.body || {});
  },
);

// ── Leads: lookup by phone number ────────────────────────────────────────────
exports.nlpearlFindLeadByPhone = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const pearlId     = req.query.pearlId     || req.body?.pearlId;
    const phoneNumber = req.query.phoneNumber || req.body?.phoneNumber;
    if (!pearlId || !phoneNumber) { res.status(400).json({error: "pearlId + phoneNumber required"}); return; }
    const r = await findLeadByPhone(token, pearlId, phoneNumber);
    res.status(r.status === 200 ? 200 : r.status).json(r.body || {});
  },
);

// ── Leads: bulk delete by external IDs ───────────────────────────────────────
exports.nlpearlDeleteLeadsByExternal = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION, ...FRONTEND_CORS},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }
    const {pearlId, leadExternalIds} = req.body || {};
    if (!pearlId || !Array.isArray(leadExternalIds) || leadExternalIds.length === 0) {
      res.status(400).json({error: "pearlId + leadExternalIds (non-empty array) required"}); return;
    }
    const r = await deleteLeadsByExternal(token, pearlId, leadExternalIds);
    res.status(r.status === 200 ? 200 : 500).json(r.body || {ok: r.status === 200});
  },
);

// ── Configuration endpoint — bind webhook + phone number to a Pearl ──────────
exports.nlpearlConfigurePearl = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION},
  async (req, res) => {
    const token = NLPEARL_API_TOKEN.value();
    if (!token) { res.status(500).json({error: "NLPEARL_API_TOKEN not set"}); return; }

    const {pearlId, phoneNumberId, waitingSentence, transferNumber} = req.body || req.query || {};
    if (!pearlId || !phoneNumberId) {
      res.status(400).json({error: "pearlId and phoneNumberId required"});
      return;
    }

    const settings = {
      phoneNumberId,
      totalAgents: 1,
      recordingOptions: true,                 // record calls for review
      transcriptOptions: 1,                   // 1 = FullTranscript (quality first)
      callWebhookUrl: `${BASE_FUNCTION_URL}/nlpearlWebhook`,
      waitingSentence: waitingSentence || "רגע אחד בבקשה, מעבירים אותך לנציג.",
      ...(transferNumber ? {transferNumber} : {}),
    };

    const result = await updateInboundSettings(token, pearlId, settings);
    res.status(result.status === 200 ? 200 : 500).json({sent: settings, result});
  },
);

// ── Webhook receiver — NLPearl POSTs call events here ────────────────────────
/**
 * NLPearl webhook payload (verified from real production events):
 *   {
 *     id:                  "<NLPearl call ID>",
 *     pearlId:             "<Pearl ID>",
 *     from:                "+972...",          // caller phone (E.164)
 *     to:                  "+972...",          // dialed/destination
 *     duration:            38,                 // seconds
 *     conversationStatus:  100 | 110 | 130 | ..., // see enum below
 *     status:              2 | 4 | ...,         // call processing state
 *     summary:             "Hebrew summary text",
 *     transcript:          [{ role: 2|3, content: "..." }],   // 2=user, 3=assistant
 *     recordingUrl:        "<https URL>",
 *     additionalData:      [{ name, key, value }, ...],
 *     startTime:           "ISO timestamp",
 *   }
 *
 * Conversation status enum (from NLPearl OpenAPI):
 *   100 Success · 110 NotSuccessful · 130 Completed · 150 Unreachable
 *   220 Blacklisted · 300 QueueAbandon · 500 Error
 */
const NLPEARL_CONVO_STATUS = {
  10: "need_retry", 20: "in_call_queue", 40: "on_call", 70: "voicemail_left",
  100: "success", 110: "not_successful", 130: "completed", 150: "unreachable",
  220: "blacklisted", 300: "queue_abandon", 500: "error",
};

/**
 * NLPearl webhook fields use mixed casing in practice (PascalCase for some keys,
 * camelCase for others depending on platform version). This helper grabs a
 * field by trying both forms.
 */
function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    // Try lowercase + Capitalized variants
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    const upper = k.charAt(0).toUpperCase() + k.slice(1);
    if (obj[lower] !== undefined && obj[lower] !== null) return obj[lower];
    if (obj[upper] !== undefined && obj[upper] !== null) return obj[upper];
  }
  return undefined;
}

/** Convert NLPearl's transcript array (role:2/3) into a readable text block. */
function transcriptArrayToText(transcript) {
  if (!Array.isArray(transcript)) return null;
  return transcript
    .map((t) => {
      const role = pick(t, "Role", "role");
      const content = pick(t, "Content", "content", "Text", "text") || "";
      const speaker = role === 2 ? "User" : role === 3 ? "Bot" : `Role${role}`;
      return `${speaker}: ${content}`;
    })
    .join("\n");
}

/** Convert NLPearl's transcript array into the conversationHistory shape used by the rest of the app. */
function transcriptToHistory(transcript) {
  if (!Array.isArray(transcript)) return [];
  return transcript.map((t) => {
    const role = pick(t, "Role", "role");
    const content = pick(t, "Content", "content", "Text", "text") || "";
    return {
      role:    role === 2 ? "user" : role === 3 ? "assistant" : String(role || "?"),
      content,
    };
  });
}

/** Extract a recording URL from any shape NLPearl might send. */
function extractRecordingUrl(rec) {
  if (!rec) return null;
  if (typeof rec === "string") return rec;
  return pick(rec, "Url", "url", "RecordingUrl", "recordingUrl") || null;
}

/**
 * Normalise an NLPearl webhook payload into a flat camelCase shape we use
 * everywhere downstream.  Tolerates both PascalCase (current platform output)
 * and camelCase (older docs).
 */
function normalizeNlpearlPayload(evt) {
  return {
    callId:             pick(evt, "Id", "id", "CallId", "callId"),
    pearlId:            pick(evt, "PearlId", "pearlId"),
    from:               pick(evt, "From", "from", "FromNumber", "fromNumber"),
    to:                 pick(evt, "To", "to", "ToNumber", "toNumber"),
    duration:           pick(evt, "Duration", "duration") || 0,
    conversationStatus: pick(evt, "ConversationStatus", "conversationStatus"),
    status:             pick(evt, "Status", "status"),
    summary:            pick(evt, "Summary", "summary"),
    transcript:         pick(evt, "Transcript", "transcript") || [],
    recordingUrl:       extractRecordingUrl(pick(evt, "Recording", "recording", "RecordingUrl", "recordingUrl")),
    sentiment:          pick(evt, "OverallSentiment", "overallSentiment", "sentiment"),
    additionalData:     pick(evt, "AdditionalData", "additionalData", "CollectedInfo", "collectedInfo"),
    tags:               pick(evt, "Tags", "tags"),
    name:               pick(evt, "Name", "name"),
    leadId:             pick(evt, "LeadId", "leadId"),
    relatedId:          pick(evt, "RelatedId", "relatedId"),
    startTime:          pick(evt, "StartTime", "startTime", "Created", "created"),
    isCallTransferred:  pick(evt, "IsCallTransferred", "isCallTransferred"),
  };
}

/** Build the call_sessions doc body from a normalised NLPearl payload. */
async function buildCallSessionFromNlpearl(db, n, rawEvt) {
  const convoStatusLabel = NLPEARL_CONVO_STATUS[n.conversationStatus] || "unknown";
  // Resolve our assistant doc by NLPearl pearlId so the dashboard shows the
  // right assistant name.
  let assistantId = null;
  let assistantName = null;
  if (n.pearlId) {
    try {
      const asSnap = await db.collection("assistants").where("nlpearlPearlId", "==", n.pearlId).limit(1).get();
      if (!asSnap.empty) {
        assistantId   = asSnap.docs[0].id;
        assistantName = asSnap.docs[0].data().name || asSnap.docs[0].data().assistantName || null;
      }
    } catch (_) { /* missing index ok */ }
  }
  return {
    id: n.callId,
    telephonyProvider: "nlpearl",
    callType: "inbound",
    status: convoStatusLabel === "success" || convoStatusLabel === "completed" ? "completed" : convoStatusLabel,
    assistantId,
    assistantName,
    assistantDefinition: assistantName ? { name: assistantName } : null,
    companyPhone: n.to || null,
    leadNumber:   n.from || null,
    duration:     typeof n.duration === "number" ? n.duration : 0,
    callDuration: typeof n.duration === "number" ? n.duration : 0,
    transcriptText:      transcriptArrayToText(n.transcript),
    conversationHistory: transcriptToHistory(n.transcript),
    summary:    n.summary || null,
    recordings: n.recordingUrl ? [{ url: n.recordingUrl, source: "nlpearl" }] : [],
    // NLPearl-specific metadata
    nlpearlCallId:                  n.callId,
    nlpearlPearlId:                 n.pearlId || null,
    nlpearlConversationStatus:      n.conversationStatus || null,
    nlpearlConversationStatusLabel: convoStatusLabel,
    nlpearlSentiment:               n.sentiment || null,
    nlpearlAdditionalData:          n.additionalData || null,
    nlpearlTags:                    n.tags || null,
    rawNlpearl:                     rawEvt,
    createdAt: FieldValue.serverTimestamp(),
    endedAt:   FieldValue.serverTimestamp(),
  };
}

exports.nlpearlWebhook = onRequest(
  {secrets: [NLPEARL_API_TOKEN], region: REGION},
  async (req, res) => {
    try {
      const evt = req.body || {};
      const n = normalizeNlpearlPayload(evt);
      logger.info("[NLPearl] webhook received", {
        callId: n.callId, pearlId: n.pearlId, from: n.from, to: n.to,
        conversationStatus: n.conversationStatus, duration: n.duration,
        keys: Object.keys(evt).slice(0, 25),
      });

      const db = getFirestore();
      const docCallId = n.callId || `nlp_${Date.now()}`;

      // 1) Always persist raw event for audit / replay
      await db.collection("nlpearl_events").add({
        receivedAt: FieldValue.serverTimestamp(),
        type: n.callId ? "call_completed" : "unknown",
        callId: docCallId,
        nlpearlCallId: n.callId || null,
        payload: evt,
      });

      // 2) Persist to call_sessions if we have an NLPearl call id
      if (n.callId) {
        const sessionDoc = await buildCallSessionFromNlpearl(db, n, evt);
        await db.collection("call_sessions").doc(docCallId).set(sessionDoc, {merge: true});
        logger.info(`[NLPearl] call_sessions/${docCallId} written (status=${sessionDoc.status}, dur=${n.duration}s)`);
      }

      res.status(200).json({ok: true, callId: docCallId});
    } catch (err) {
      logger.error("[NLPearl] webhook error", err);
      res.status(200).json({ok: false, error: err.message}); // still 200 so they don't retry-storm us
    }
  },
);

/**
 * One-shot backfill: re-process every stored nlpearl_events payload through
 * the (now-fixed) webhook logic, populating call_sessions retroactively.
 * Idempotent — uses set/merge keyed by the NLPearl call id.
 */
exports.nlpearlBackfillFromEvents = onRequest(
  {region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    try {
      const db = getFirestore();
      const snap = await db.collection("nlpearl_events").get();
      const out = { processed: 0, written: 0, skipped: 0, errors: [] };
      // Dedup by callId — for each callId, pick the "richest" event (highest
      // duration + non-empty summary).  NLPearl can deliver the same call event
      // multiple times (retries, partial states).
      const byCallId = new Map();
      for (const doc of snap.docs) {
        const evt = doc.data().payload || {};
        const n = normalizeNlpearlPayload(evt);
        if (!n.callId) continue;
        const score = (typeof n.duration === "number" ? n.duration : 0)
                    + (n.summary ? 1000 : 0)
                    + (Array.isArray(n.transcript) ? n.transcript.length * 10 : 0)
                    + (n.recordingUrl ? 500 : 0);
        const prev = byCallId.get(n.callId);
        if (!prev || score > prev.score) byCallId.set(n.callId, {n, evt, score, docId: doc.id});
      }
      out.processed = snap.size;
      out.uniqueCallIds = byCallId.size;
      out.skipped = snap.size - byCallId.size;

      for (const [callId, {n, evt}] of byCallId.entries()) {
        try {
          const sessionDoc = await buildCallSessionFromNlpearl(db, n, evt);
          await db.collection("call_sessions").doc(callId).set(sessionDoc);
          out.written++;
        } catch (e) {
          out.errors.push({callId, error: e.message});
        }
      }
      res.json(out);
    } catch (err) {
      logger.error("backfill error", err);
      res.status(500).json({error: err.message});
    }
  },
);

/** Diagnostic: dump the keys + types of the first nlpearl_event payload. */
exports.nlpearlDebugFirstEvent = onRequest(
  {region: REGION, ...FRONTEND_CORS},
  async (_req, res) => {
    const db = getFirestore();
    const snap = await db.collection("nlpearl_events").limit(1).get();
    if (snap.empty) { res.json({error: "no events"}); return; }
    const evt = snap.docs[0].data().payload || {};
    const keys = Object.keys(evt).slice(0, 30);
    const out = {keys, types: {}, samples: {}};
    for (const k of keys) {
      out.types[k] = typeof evt[k];
      if (typeof evt[k] !== "object") out.samples[k] = evt[k];
      else if (Array.isArray(evt[k])) out.samples[k] = `[Array x${evt[k].length}]`;
      else out.samples[k] = `[Object keys: ${Object.keys(evt[k] || {}).slice(0, 5).join(", ")}]`;
    }
    // Also test pick
    out.pickTests = {
      Duration:    pick(evt, "Duration", "duration"),
      Id:          pick(evt, "Id", "id"),
      From:        pick(evt, "From", "from"),
      Summary_len: (pick(evt, "Summary", "summary") || "").length,
    };
    res.json(out);
  },
);

// Internal exports (used by other services, e.g. placeCall)
module.exports.internal = {
  addOutboundLead,
  getCall,
  listPearls,
  listPhoneNumbers,
  updateInboundSettings,
};
