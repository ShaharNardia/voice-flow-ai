/**
 * verbal_contract_service.js â€” Verbal Contract Engine
 *
 * Turns verbal "I agree" moments into legally-admissible contract records.
 *
 * How it works in a call:
 *  1. Assistant config includes one or more contract templates (terms to recite)
 *  2. During a V2V/Standard call the AI is given a built-in tool: initiate_verbal_contract
 *  3. When AI detects the caller is ready to agree, it calls the tool
 *  4. Tool returns the contract terms text â€” AI reads it aloud
 *  5. AI then calls confirm_verbal_contract when caller says "yes I agree"
 *  6. A permanent, timestamped contract record is written to Firestore
 *  7. An SMS confirmation with the contract summary is sent to the caller
 *
 * Endpoints:
 *  POST contractTemplateCreate   â€” Create a contract template
 *  PUT  contractTemplateUpdate   â€” Update a template
 *  GET  contractTemplateList     â€” List templates for this account
 *  DELETE contractTemplateDelete â€” Delete a template
 *  POST contractCreate           â€” Create a confirmed contract (called from Cloud Run)
 *  GET  contractList             â€” List contracts (dashboard)
 *  GET  contractGet              â€” Get a specific contract
 *
 * Firestore collections:
 *  contract_templates  { ownerId, name, terms[], language, version, createdAt, updatedAt }
 *  verbal_contracts    { callSessionId, ownerId, templateId, templateName, terms[], partyName,
 *                        partyPhone, confirmedAt, callRecordingUrl, contractHash, status }
 */

"use strict";

const {onRequest}  = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const crypto = require("crypto");
const {
  sanitizeObject,
  applyRateLimit,
  extractUidFromRequest,
} = require("./security_utils");
const {safeJsonParse, normalizePhoneNumber} = require("./workflow_utils");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate a deterministic SHA-256 hash for the contract contents.
 * This is the "digital seal" â€” if any term changes, the hash changes.
 */
function hashContractTerms(terms, partyPhone, confirmedAt) {
  const payload = JSON.stringify({terms, partyPhone, confirmedAt});
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Build the spoken contract text the AI will read aloud.
 * Replaces {{partyName}}, {{date}}, {{time}} placeholders.
 */
function buildContractText(template, ctx) {
  const today = new Date().toLocaleDateString("en-US", {dateStyle: "long"});
  const time  = new Date().toLocaleTimeString("en-US", {timeStyle: "short"});
  return (template.terms || []).map((term, i) => {
    let t = String(term)
      .replace(/\{\{partyName\}\}/g, ctx.partyName || "the caller")
      .replace(/\{\{date\}\}/g, today)
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{assistantName\}\}/g, ctx.assistantName || "")
      .replace(/\{\{companyName\}\}/g, ctx.companyName || "");
    return `${i + 1}. ${t}`;
  }).join(" ");
}

// â”€â”€ Contract Template CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.contractTemplateCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {name, terms, language = "en", smsConfirmation = true} = payload;

    if (!name || !name.trim()) {
      res.status(400).json({status:"error",message:"name is required"});
      return;
    }
    if (!Array.isArray(terms) || terms.length === 0) {
      res.status(400).json({status:"error",message:"terms must be a non-empty array of strings"});
      return;
    }
    // Validate each term is a non-empty string
    const cleanTerms = terms.map(t => String(t).trim()).filter(Boolean);
    if (cleanTerms.length === 0) {
      res.status(400).json({status:"error",message:"terms must contain at least one non-empty string"});
      return;
    }

    const db = getFirestore();
    const docRef = await db.collection("contract_templates").add({
      ownerId: uid,
      name: name.trim(),
      terms: cleanTerms,
      language,
      smsConfirmation,
      version: 1,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({status:"ok", id: docRef.id, message:"Template created"});
  } catch (e) {
    logger.error("contractTemplateCreate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.contractTemplateUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id, name, terms, language, smsConfirmation} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("contract_templates").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Template not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    const updates = {updatedAt: FieldValue.serverTimestamp()};
    if (name  !== undefined) updates.name  = String(name).trim();
    if (terms !== undefined && Array.isArray(terms)) {
      updates.terms = terms.map(t => String(t).trim()).filter(Boolean);
      updates.version = (snap.data().version || 1) + 1; // bump version on term change
    }
    if (language !== undefined) updates.language = language;
    if (smsConfirmation !== undefined) updates.smsConfirmation = Boolean(smsConfirmation);

    await docRef.update(updates);
    res.status(200).json({status:"ok", message:"Template updated"});
  } catch (e) {
    logger.error("contractTemplateUpdate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.contractTemplateList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const db = getFirestore();
    const snap = await db.collection("contract_templates")
      .where("ownerId","==",uid)
      .where("active","==",true)
      .orderBy("createdAt","desc")
      .get();

    const templates = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", templates});
  } catch (e) {
    logger.error("contractTemplateList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.contractTemplateDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("contract_templates").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Template not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    // Soft delete â€” keeps historical reference for existing contracts
    await docRef.update({active: false, deletedAt: FieldValue.serverTimestamp()});
    res.status(200).json({status:"ok", message:"Template deleted"});
  } catch (e) {
    logger.error("contractTemplateDelete", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Contract Creation (called from Cloud Run after verbal confirmation) â”€â”€â”€â”€
// Internal endpoint â€” Cloud Run service account, no user token.
exports.contractCreate = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const payload = safeJsonParse(req.body) || {};
    const {
      callSessionId,
      ownerId,
      templateId,
      templateName,
      terms,
      partyName,
      partyPhone,
      assistantName,
      companyName,
      callRecordingUrl = null,
      confirmedTranscriptSnippet = null,
    } = payload;

    if (!callSessionId || !Array.isArray(terms) || terms.length === 0) {
      res.status(400).json({status:"error", message:"callSessionId and terms[] required"});
      return;
    }

    const confirmedAt = new Date().toISOString();
    const contractHash = hashContractTerms(terms, partyPhone, confirmedAt);

    const db = getFirestore();
    const contractRef = await db.collection("verbal_contracts").add({
      callSessionId,
      ownerId: ownerId || null,
      templateId: templateId || null,
      templateName: templateName || "Custom Agreement",
      terms,
      partyName: partyName || null,
      partyPhone: partyPhone || null,
      assistantName: assistantName || null,
      companyName: companyName || null,
      contractHash,
      status: "confirmed",
      callRecordingUrl,
      confirmedTranscriptSnippet: confirmedTranscriptSnippet
        ? String(confirmedTranscriptSnippet).slice(0, 500)
        : null,
      confirmedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });

    // Tag the call session with the contract ID
    await db.collection("call_sessions").doc(callSessionId).set({
      verbalContractId: contractRef.id,
      hasVerbalContract: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    res.status(200).json({status:"ok", contractId: contractRef.id, contractHash});
  } catch (e) {
    logger.error("contractCreate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Contract List & Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.contractList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const page  = Math.max(0, parseInt(req.query.page  || "0", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "50", 10));

    const db = getFirestore();
    const snap = await db.collection("verbal_contracts")
      .where("ownerId","==",uid)
      .orderBy("confirmedAt","desc")
      .offset(page * limit)
      .limit(limit)
      .get();

    const contracts = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      confirmedAt: d.data().confirmedAt?.toDate?.()?.toISOString() || null,
      createdAt:   d.data().createdAt?.toDate?.()?.toISOString()   || null,
    }));
    res.status(200).json({status:"ok", contracts, count: contracts.length, page, limit});
  } catch (e) {
    logger.error("contractList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.contractGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const id = req.query.id || safeJsonParse(req.body)?.id;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const snap = await db.collection("verbal_contracts").doc(id).get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Contract not found"}); return; }
    const data = snap.data();
    if (data.ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    res.status(200).json({
      status: "ok",
      contract: {
        id: snap.id, ...data,
        confirmedAt: data.confirmedAt?.toDate?.()?.toISOString() || null,
        createdAt:   data.createdAt?.toDate?.()?.toISOString()   || null,
      },
    });
  } catch (e) {
    logger.error("contractGet", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// Dispute / void a contract
exports.contractVoid = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id, reason = ""} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("verbal_contracts").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Contract not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }
    if (snap.data().status === "voided") { res.status(409).json({status:"error",message:"Contract already voided"}); return; }

    await docRef.update({
      status: "voided",
      voidReason: reason.trim(),
      voidedAt: FieldValue.serverTimestamp(),
    });
    res.status(200).json({status:"ok", message:"Contract voided"});
  } catch (e) {
    logger.error("contractVoid", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Export helpers for Cloud Run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports.buildContractText = buildContractText;
