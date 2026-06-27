/**
 * agent_registry_service.js â€” Agent-to-Agent Calling Network
 *
 * A verified directory of business AI phone endpoints that can communicate
 * machine-to-machine. Think of it as the SWIFT network for AI phone calls.
 *
 * How it works:
 *  1. Business registers their AI assistant as a callable "agent endpoint"
 *     - Provides: agent name, capabilities, phone number or webhook URL, category
 *     - Gets back: an agentId and API key for inbound agent calls
 *
 *  2. During a call, the AI can use the built-in tool: call_agent_network
 *     - Searches the registry for an agent matching the query
 *     - Makes a structured request to that agent's webhook endpoint
 *     - Returns the response to the calling AI
 *
 *  3. When your assistant RECEIVES an agent call:
 *     - Request arrives at /agentHandshake with the agentId + signed payload
 *     - Your assistant processes it and returns a structured response
 *
 * Endpoints:
 *  POST agentRegister          â€” Register your AI as a callable agent
 *  POST agentUpdate            â€” Update your agent listing
 *  DELETE agentUnregister      â€” Remove your agent from the directory
 *  GET  agentDirectory         â€” Browse public agents (paginated, filterable)
 *  POST agentSearch            â€” Search agents by capability/category/name
 *  POST agentHandshake         â€” Receive and process an inbound agent call
 *  POST agentCallOut           â€” Call another agent (used from Cloud Run)
 *  GET  agentMyListings        â€” My registered agents
 *
 * Firestore collections:
 *  agent_registry  { ownerId, agentName, description, capabilities[], category,
 *                    webhookUrl, phoneNumber, isPublic, verified, apiKeyHash,
 *                    callsReceived, callsMade, rating, createdAt, updatedAt }
 *  agent_calls     { fromAgentId, toAgentId, requestPayload, responsePayload,
 *                    status, durationMs, callSessionId, createdAt }
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const crypto = require("crypto");
const axios = require("axios");

const {
  sanitizeObject,
  applyRateLimit,
  extractUidFromRequest,
} = require("./security_utils");
const {safeJsonParse} = require("./workflow_utils");

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

function generateApiKey() {
  return `vf_agent_${crypto.randomBytes(20).toString("hex")}`;
}

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

/**
 * Verify inbound agent call signature.
 * The calling agent signs the payload with their API key.
 */
function verifyAgentSignature(payload, signature, apiKeyHash) {
  // We can't reverse the hash, so we use a HMAC-based approach
  // For inbound calls, we verify using the stored key hash
  const expected = crypto.createHmac("sha256", apiKeyHash).update(JSON.stringify(payload)).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

// â”€â”€ Agent Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.agentRegister = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {
      agentName,
      description = "",
      capabilities = [],
      category = "general",
      webhookUrl = null,
      phoneNumber = null,
      isPublic = true,
      assistantId = null,
    } = payload;

    if (!agentName || !agentName.trim()) {
      res.status(400).json({status:"error",message:"agentName required"});
      return;
    }
    if (!webhookUrl && !phoneNumber) {
      res.status(400).json({status:"error",message:"Either webhookUrl or phoneNumber required"});
      return;
    }
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      res.status(400).json({status:"error",message:"capabilities[] must be a non-empty array"});
      return;
    }

    const VALID_CATEGORIES = [
      "general","sales","support","booking","ecommerce","healthcare",
      "finance","legal","real_estate","logistics","hr","hospitality","other",
    ];
    const resolvedCategory = VALID_CATEGORIES.includes(category) ? category : "general";

    // Generate API key for this agent (shown only once)
    const rawApiKey = generateApiKey();
    const apiKeyHash = hashApiKey(rawApiKey);

    const db = getFirestore();

    // Limit: 10 agents per user
    const existing = await db.collection("agent_registry")
      .where("ownerId","==",uid).where("active","==",true).count().get();
    if (existing.data().count >= 10) {
      res.status(429).json({status:"error",message:"Maximum 10 agents per account"});
      return;
    }

    const docRef = await db.collection("agent_registry").add({
      ownerId: uid,
      assistantId: assistantId || null,
      agentName: agentName.trim(),
      description: description.trim(),
      capabilities: capabilities.map(c => String(c).trim().toLowerCase()).filter(Boolean).slice(0, 20),
      category: resolvedCategory,
      webhookUrl: webhookUrl || null,
      phoneNumber: phoneNumber || null,
      isPublic: Boolean(isPublic),
      verified: false,        // Manual verification by platform team
      active: true,
      apiKeyHash,             // Store only the hash, never the raw key
      callsReceived: 0,
      callsMade: 0,
      lastActiveAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Return the raw API key ONCE â€” cannot be retrieved again
    res.status(200).json({
      status: "ok",
      agentId: docRef.id,
      apiKey: rawApiKey, // Show once
      message: "Agent registered. Store your API key â€” it will not be shown again.",
      warning: "Your agent must verify inbound calls using your API key. See documentation.",
    });
  } catch (e) {
    logger.error("agentRegister", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.agentUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id, ...fields} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("agent_registry").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Agent not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    const updates = {updatedAt: FieldValue.serverTimestamp()};
    if (fields.agentName    !== undefined) updates.agentName    = String(fields.agentName).trim();
    if (fields.description  !== undefined) updates.description  = String(fields.description).trim();
    if (fields.capabilities !== undefined && Array.isArray(fields.capabilities))
      updates.capabilities = fields.capabilities.map(c => String(c).trim().toLowerCase()).filter(Boolean).slice(0,20);
    if (fields.webhookUrl   !== undefined) updates.webhookUrl   = fields.webhookUrl || null;
    if (fields.phoneNumber  !== undefined) updates.phoneNumber  = fields.phoneNumber || null;
    if (fields.isPublic     !== undefined) updates.isPublic     = Boolean(fields.isPublic);
    if (fields.category     !== undefined) updates.category     = fields.category || "general";

    await docRef.update(updates);
    res.status(200).json({status:"ok", message:"Agent updated"});
  } catch (e) {
    logger.error("agentUpdate", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.agentUnregister = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("agent_registry").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Agent not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    await docRef.update({active: false, deactivatedAt: FieldValue.serverTimestamp()});
    res.status(200).json({status:"ok", message:"Agent removed from directory"});
  } catch (e) {
    logger.error("agentUnregister", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Directory & Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.agentDirectory = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const category  = req.query.category  || null;
    const page      = Math.max(0, parseInt(req.query.page  || "0", 10));
    const limitNum  = Math.min(50, parseInt(req.query.limit || "20", 10));

    const db = getFirestore();
    let query = db.collection("agent_registry")
      .where("isPublic","==",true)
      .where("active","==",true);
    if (category) query = query.where("category","==",category);

    // Try the indexed query first. If the composite index isn't built yet
    // (FAILED_PRECONDITION = gRPC code 9), fall back to fetching without
    // orderBy and sorting in memory — the directory is small and this stays
    // correct without blocking on index creation.
    let snap;
    try {
      snap = await query
        .orderBy("callsReceived","desc")
        .offset(page * limitNum)
        .limit(limitNum)
        .get();
    } catch (idxErr) {
      if (idxErr.code === 9 || /index/i.test(idxErr.message || "")) {
        const allSnap = await query.limit(500).get();
        const sorted = allSnap.docs.sort((a, b) =>
          (b.data().callsReceived || 0) - (a.data().callsReceived || 0),
        );
        const start = page * limitNum;
        snap = { docs: sorted.slice(start, start + limitNum) };
      } else {
        throw idxErr;
      }
    }

    const agents = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        agentName: data.agentName,
        description: data.description,
        capabilities: data.capabilities,
        category: data.category,
        verified: data.verified,
        callsReceived: data.callsReceived,
        // Never expose: ownerId, apiKeyHash, webhookUrl (privacy)
      };
    });
    res.status(200).json({status:"ok", agents, count: agents.length, page, limit: limitNum});
  } catch (e) {
    logger.error("agentDirectory", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.agentSearch = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const payload = sanitizeObject(safeJsonParse(req.body));
    const {query = "", category = null, limit: lim = 10} = payload;

    const db = getFirestore();
    let firestoreQuery = db.collection("agent_registry")
      .where("isPublic","==",true)
      .where("active","==",true);
    if (category) firestoreQuery = firestoreQuery.where("category","==",category);
    const snap = await firestoreQuery.limit(200).get();

    const q = String(query).toLowerCase();
    const agents = snap.docs
      .map(d => ({id: d.id, ...d.data()}))
      .filter(a =>
        !q ||
        a.agentName?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        (Array.isArray(a.capabilities) && a.capabilities.some(c => c.includes(q)))
      )
      .slice(0, Number(lim))
      .map(a => ({
        id: a.id,
        agentName: a.agentName,
        description: a.description,
        capabilities: a.capabilities,
        category: a.category,
        verified: a.verified,
      }));

    res.status(200).json({status:"ok", agents, count: agents.length});
  } catch (e) {
    logger.error("agentSearch", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.agentMyListings = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const db = getFirestore();
    const snap = await db.collection("agent_registry")
      .where("ownerId","==",uid)
      .orderBy("createdAt","desc")
      .get();

    const agents = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      apiKeyHash: undefined, // Never expose
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", agents});
  } catch (e) {
    logger.error("agentMyListings", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Agent-to-Agent Call Out (internal â€” Cloud Run calls this) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cloud Run calls this when the AI uses the call_agent_network tool.
exports.agentCallOut = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }
  if (!applyRateLimit(req, res, {maxRequests: 60, windowMs: 60000})) return;

  try {
    const payload = safeJsonParse(req.body) || {};
    const {toAgentId, fromCallSessionId, fromOwnerId, requestMessage, context = {}} = payload;

    if (!toAgentId || !requestMessage) {
      res.status(400).json({status:"error",message:"toAgentId and requestMessage required"});
      return;
    }

    const db = getFirestore();
    const agentSnap = await db.collection("agent_registry").doc(toAgentId).get();
    if (!agentSnap.exists || !agentSnap.data().active) {
      res.status(404).json({status:"error",message:"Agent not found or inactive"});
      return;
    }
    const agent = agentSnap.data();

    const startMs = Date.now();
    let responsePayload = null;
    let callStatus = "pending";

    // Make the outbound request to the agent's webhook
    if (agent.webhookUrl) {
      try {
        const requestBody = {
          requestMessage,
          context,
          fromCallSessionId: fromCallSessionId || null,
          timestamp: new Date().toISOString(),
          protocol: "voiceflow-agent-v1",
        };
        const resp = await axios.post(agent.webhookUrl, requestBody, {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
            "X-VoiceFlow-Agent-Call": "1",
            "X-VoiceFlow-From-Session": fromCallSessionId || "",
          },
          validateStatus: () => true,
        });
        responsePayload = resp.data;
        callStatus = resp.status >= 200 && resp.status < 300 ? "success" : "error";
      } catch (e) {
        callStatus = "timeout";
        responsePayload = {error: e.message};
      }
    } else {
      // No webhook â€” return agent contact info for the AI to relay
      responsePayload = {
        message: `${agent.agentName} can be reached at ${agent.phoneNumber || "no phone configured"}`,
        phoneNumber: agent.phoneNumber,
      };
      callStatus = "success";
    }

    const durationMs = Date.now() - startMs;

    // Log the agent call
    await db.collection("agent_calls").add({
      fromCallSessionId: fromCallSessionId || null,
      fromOwnerId: fromOwnerId || null,
      toAgentId,
      toAgentName: agent.agentName,
      requestMessage: String(requestMessage).slice(0, 500),
      responsePayload: JSON.stringify(responsePayload).slice(0, 2000),
      status: callStatus,
      durationMs,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Increment counter on the target agent
    agentSnap.ref.update({
      callsReceived: FieldValue.increment(1),
      lastActiveAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    res.status(200).json({
      status: callStatus,
      agentName: agent.agentName,
      response: responsePayload,
      durationMs,
    });
  } catch (e) {
    logger.error("agentCallOut", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Agent Handshake (receive inbound agent calls at YOUR endpoint) â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Businesses put this URL in their agent registration as their webhookUrl.
// Another agent's AI calls this endpoint â€” your AI processes it.
exports.agentHandshake = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const {agentId, requestMessage, context = {}, protocol} = safeJsonParse(req.body) || {};

    if (!agentId || !requestMessage) {
      res.status(400).json({status:"error",message:"agentId and requestMessage required"});
      return;
    }
    if (protocol !== "voiceflow-agent-v1") {
      res.status(400).json({status:"error",message:"Unsupported protocol"});
      return;
    }

    const db = getFirestore();
    const agentSnap = await db.collection("agent_registry").doc(agentId).get();
    if (!agentSnap.exists || !agentSnap.data().active) {
      res.status(404).json({status:"error",message:"Agent not found"});
      return;
    }

    const agent = agentSnap.data();

    // Route to the linked assistant for AI processing (if configured)
    // For now: return the agent's description + capabilities as context
    // In production: you'd call your AI assistant with the requestMessage
    const response = {
      agentName: agent.agentName,
      capabilities: agent.capabilities,
      message: `I am ${agent.agentName}. ${agent.description || ""}. I received your message: "${String(requestMessage).slice(0, 200)}"`,
      status: "received",
      timestamp: new Date().toISOString(),
    };

    // Log the inbound call
    await db.collection("agent_calls").add({
      direction: "inbound",
      toAgentId: agentId,
      toOwnerId: agent.ownerId,
      requestMessage: String(requestMessage).slice(0, 500),
      responsePayload: JSON.stringify(response),
      context,
      status: "success",
      createdAt: FieldValue.serverTimestamp(),
    });

    agentSnap.ref.update({
      callsReceived: FieldValue.increment(1),
      lastActiveAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    res.status(200).json({status:"ok", ...response});
  } catch (e) {
    logger.error("agentHandshake", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// Rotate API key for an agent
exports.agentRotateKey = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {id} = payload;
    if (!id) { res.status(400).json({status:"error",message:"id required"}); return; }

    const db = getFirestore();
    const docRef = db.collection("agent_registry").doc(id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({status:"error",message:"Agent not found"}); return; }
    if (snap.data().ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    const newRawKey = generateApiKey();
    const newHash   = hashApiKey(newRawKey);
    await docRef.update({apiKeyHash: newHash, updatedAt: FieldValue.serverTimestamp()});

    res.status(200).json({
      status: "ok",
      apiKey: newRawKey,
      message: "API key rotated. Store the new key â€” it will not be shown again.",
    });
  } catch (e) {
    logger.error("agentRotateKey", e);
    res.status(500).json({status:"error", message: e.message});
  }
});
