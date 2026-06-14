/**
 * voximplant_inbound.js — inbound session brain for Voximplant calls.
 *
 * WHY THIS EXISTS (isolated, on purpose):
 * Inbound Voximplant rules trigger the VoxEngine scenario with NO customData,
 * so the scenario has no callSessionId / cloudRunUrl and no idea which assistant
 * should answer the DID. The Twilio webhook resolves all of this inline, but that
 * block is embedded in the live `twilioVoiceWebhook` and refactoring it blind
 * would risk every production Twilio/SIP call. So this module is a SELF-CONTAINED
 * mirror used ONLY by the Voximplant `inbound.start` webhook event:
 *
 *   VoxEngine scenario (inbound) ──POST {event:"inbound.start", from, to}──▶ voxImplantWebhook
 *        ◀── { callSessionId, cloudRunUrl } ──
 *   scenario then opens WS to cloudRunUrl/voximplant/stream/{callSessionId}
 *
 * It creates a call_sessions doc shaped exactly like the Twilio inbound path
 * (telephonyProvider:"voximplant") so the existing Cloud Run /voximplant/stream
 * handler finds it and handleGeminiSession runs unchanged.
 *
 * NOTE: kept deliberately decoupled (its own resolver) until inbound Voximplant
 * is validated end-to-end. Once proven, the shared definition builder should be
 * extracted from twilioVoiceWebhook and reused by both (DRY) — tracked separately.
 */

"use strict";

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const crypto = require("crypto");

// Production Cloud Run media service. Overridable via env for staging.
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL ||
  "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

/**
 * Find the company + assistant that owns a DID, matching by digit suffix so
 * "+972747054945", "747054945", "0747054945" all resolve to the same entry
 * (same logic as the Phone Numbers Configure handler).
 */
async function resolveByDid(db, did) {
  const target = onlyDigits(did);
  if (!target) return null;
  const snap = await db.collection("Company").get();
  for (const c of snap.docs) {
    const data = c.data();
    const map = Array.isArray(data.phoneNumberMap) ? data.phoneNumberMap : [];
    const entry = map.find((e) => {
      const d = onlyDigits(e.phoneNumber);
      if (!d) return false;
      if (d === target) return true;
      const short = d.length <= target.length ? d : target;
      const long = d.length <= target.length ? target : d;
      return short.length >= 7 && long.endsWith(short);
    });
    if (entry) return { companyDoc: { id: c.id, ...data }, assistantId: entry.assistantId || null };
  }
  return null;
}

/**
 * Build an assistantDefinition mirroring the Twilio inbound shape. Faithful to
 * the fields Cloud Run's handleGeminiSession reads — especially voiceProvider +
 * realtimeEnabled, which decide the bidirectional <Connect><Stream> path.
 */
function buildAssistantDefinition(assistant, companyDoc) {
  const a = assistant || {};
  const name = a.name || a.assistantName || companyDoc.assistantname || "Virtual Assistant";
  const companyName = a.companyName || companyDoc.name || "our team";
  const language = a.language || companyDoc.language || "he-IL";
  const voiceProvider = a.voiceProvider || (a.realtimeEnabled ? "openai-realtime" : "classic");
  return {
    id: a.id || null,
    name,
    assistantName: name,
    companyName,
    firstMessage: a.firstMessage || companyDoc.inboundmessage || "",
    systemPrompt: a.systemPrompt || "",
    voice: a.voice || companyDoc.voice || null,
    language,
    llmModel: a.llmModel || "gpt-4o-mini",
    temperature: a.temperature ?? 0.8,
    maxTokens: a.maxTokens || 150,
    speechSpeed: a.speechSpeed || 1.0,
    voiceStability: a.voiceStability ?? 0.5,
    transcriber: { provider: a.sttProvider || "deepgram", model: a.sttModel || "nova-3", language },
    sttProvider: a.sttProvider || "deepgram",
    sttModel: a.sttModel || "nova-3",
    assistantVibe: a.assistantVibe || "friendly",
    callerGender: a.callerGender || "neutral",
    voiceAccent: a.voiceAccent || "default",
    voiceProvider,
    // gemini-hybrid / gemini-live / openai-realtime → bidirectional stream path.
    realtimeEnabled: (a.realtimeEnabled ||
      ["gemini-live", "gemini-hybrid", "openai-realtime"].includes(voiceProvider)) ? true : false,
    realtimeVoice: a.realtimeVoice || "Aoede",
    realtimeVadMode: a.realtimeVadMode || null,
    realtimeVadSensitivity: a.realtimeVadSensitivity || null,
    realtimeScenarioId: a.realtimeScenarioId || null,
    customTools: a.customTools || [],
    feedbackCallEnabled: a.feedbackCallEnabled || false,
  };
}

/**
 * Resolve the DID, create a call_sessions doc, and return what the scenario
 * needs to open the audio WebSocket.
 *
 * @returns {Promise<{callSessionId, cloudRunUrl, assistantName}|null>} null if no DID match.
 */
async function createInboundSession({ from, to }) {
  const db = getFirestore();
  const resolved = await resolveByDid(db, to);
  if (!resolved) {
    logger.warn(`[VoxInbound] No company/assistant mapped to DID ${to}`);
    return null;
  }
  const { companyDoc, assistantId } = resolved;

  let assistant = null;
  if (assistantId) {
    try {
      const aDoc = await db.collection("assistants").doc(assistantId).get();
      if (aDoc.exists) assistant = { id: aDoc.id, ...aDoc.data() };
    } catch (e) {
      logger.warn(`[VoxInbound] assistant ${assistantId} load failed: ${e.message}`);
    }
  }

  const sessionId = "VX" + crypto.randomBytes(14).toString("hex");
  const def = buildAssistantDefinition(assistant, companyDoc);
  const sessionData = {
    id: sessionId,
    ownerId: assistant?.ownerId || companyDoc.createdBy || companyDoc.ownerId || null,
    assistantId: assistant?.id || null,
    companyId: companyDoc.id,
    assistantDefinition: def,
    leadNumber: from || "",
    companyPhone: to || "",
    companyName: def.companyName,
    assistantName: def.assistantName,
    telephonyProvider: "voximplant",
    status: "in-progress",
    callType: "inbound",
    conversationHistory: [],
    metadata: { callType: "inbound", callerNumber: from || "", carrier: "voximplant" },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection("call_sessions").doc(sessionId).set(sessionData);
  logger.info(`[VoxInbound] created session ${sessionId} for DID ${to} → assistant ${def.assistantName} (${def.voiceProvider})`);
  return { callSessionId: sessionId, cloudRunUrl: CLOUD_RUN_URL, assistantName: def.assistantName };
}

module.exports = { createInboundSession, _internal: { resolveByDid, buildAssistantDefinition } };
