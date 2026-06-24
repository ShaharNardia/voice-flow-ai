/**
 * Tool Library — admin-defined HTTP API tools that any assistant can opt into.
 *
 * Each tool has a name, description, URL, method, headers, parameters schema.
 * Stored at tool_library/{toolId}. Assistants reference them by ID via the
 * assistant.libraryToolIds array. Cloud Run merges these into the per-assistant
 * customTools list at call start.
 *
 * Endpoints (admin only):
 *   GET  /toolLibraryList                              → list
 *   POST /toolLibraryCreate { name, ... }              → create
 *   POST /toolLibraryUpdate { id, ... }                → update
 *   POST /toolLibraryDelete { id }                     → soft delete
 *   POST /toolLibraryTest { id|tool, sampleArgs }      → live HTTP test
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const axios = require("axios");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");
const toolExec = require("./tool_executor.js");

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

async function authedUser(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  if (!u.exists) { res.status(403).json({ error: "User not found" }); return null; }
  const data = u.data();
  return {
    uid,
    companyId: data.companyId || data.uid || uid,
    role: data.role || "user",
  };
}

function isAdmin(user) {
  return user.role === "admin" || user.role === "super_admin";
}

// Lightweight placeholder-substitution for URL/headers — {{argName}} replaced.
function substitute(str, args) {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = args?.[key];
    return v !== undefined && v !== null ? String(v) : `{{${key}}}`;
  });
}

// ── List ─────────────────────────────────────────────────────────────────

exports.toolLibraryList = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const user = await authedUser(req, res);
  if (!user) return;

  try {
    const db = getFirestore();
    let q = db.collection("tool_library").where("companyId", "==", user.companyId);
    if (isAdmin(user) && req.query.all === "1") {
      q = db.collection("tool_library");
    }
    const snap = await q.get();
    const tools = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => !t.deletedAt);
    res.json({ tools });
  } catch (e) {
    logger.error("toolLibraryList failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Create ───────────────────────────────────────────────────────────────

exports.toolLibraryCreate = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const user = await authedUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) { res.status(403).json({ error: "Admin only" }); return; }

  const { name, description, url, method, headers, parameters } = req.body || {};
  if (!name || !url) { res.status(400).json({ error: "name + url required" }); return; }

  try {
    const db = getFirestore();
    const sanitizedName = String(name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
    const doc = await db.collection("tool_library").add({
      name: sanitizedName,
      displayName: name,
      description: description || "",
      url,
      method: (method || "POST").toUpperCase(),
      headers: headers || {},
      parameters: Array.isArray(parameters) ? parameters : [],
      companyId: user.companyId,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      enabled: true,
    });
    const fresh = await doc.get();
    res.json({ tool: { id: doc.id, ...fresh.data() } });
  } catch (e) {
    logger.error("toolLibraryCreate failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Update ───────────────────────────────────────────────────────────────

exports.toolLibraryUpdate = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const user = await authedUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) { res.status(403).json({ error: "Admin only" }); return; }

  const { id, ...patch } = req.body || {};
  if (!id) { res.status(400).json({ error: "id required" }); return; }

  try {
    const db = getFirestore();
    const ref = db.collection("tool_library").doc(id);
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
    if (snap.data().companyId !== user.companyId && user.role !== "super_admin") {
      res.status(403).json({ error: "Not your tool" });
      return;
    }
    await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
    const fresh = await ref.get();
    res.json({ tool: { id, ...fresh.data() } });
  } catch (e) {
    logger.error("toolLibraryUpdate failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Delete (soft) ────────────────────────────────────────────────────────

exports.toolLibraryDelete = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const user = await authedUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) { res.status(403).json({ error: "Admin only" }); return; }

  const { id } = req.body || {};
  if (!id) { res.status(400).json({ error: "id required" }); return; }

  try {
    const db = getFirestore();
    await db.collection("tool_library").doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: user.uid,
      enabled: false,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Test (live HTTP) ─────────────────────────────────────────────────────

exports.toolLibraryTest = onRequest({ region: REGION, timeoutSeconds: 30, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const user = await authedUser(req, res);
  if (!user) return;
  if (!isAdmin(user)) { res.status(403).json({ error: "Admin only" }); return; }

  let tool = req.body?.tool;
  const id = req.body?.id;
  const sampleArgs = req.body?.sampleArgs || {};

  if (!tool && id) {
    const db = getFirestore();
    const snap = await db.collection("tool_library").doc(id).get();
    if (!snap.exists) { res.status(404).json({ error: "Tool not found" }); return; }
    tool = snap.data();
  }
  if (!tool?.url) { res.status(400).json({ error: "tool.url required (pass tool inline or id)" }); return; }

  const t0 = Date.now();
  try {
    const url = substitute(tool.url, sampleArgs);
    const method = (tool.method || "POST").toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(tool.headers || {})) {
      headers[k] = substitute(v, sampleArgs);
    }
    if (!headers["Content-Type"] && method !== "GET") headers["Content-Type"] = "application/json";

    const r = await axios({
      method, url, headers,
      data: method !== "GET" ? sampleArgs : undefined,
      timeout: 20_000,
      validateStatus: () => true,
      maxContentLength: 5 * 1024 * 1024,
    });
    res.json({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      latencyMs: Date.now() - t0,
      headers: Object.fromEntries(Object.entries(r.headers).slice(0, 20)),
      body: typeof r.data === "string" ? r.data.slice(0, 5000) : JSON.stringify(r.data).slice(0, 5000),
      url,
    });
  } catch (e) {
    res.json({
      ok: false,
      latencyMs: Date.now() - t0,
      error: e.message,
      code: e.code,
    });
  }
});

// ── Owner tool test ────────────────────────────────────────────────────────
// Any authenticated user can fire a single tool definition with sample args to
// verify its API works (the assistant editor's per-tool "Test" button). Uses
// the SSRF-guarded executor. (toolLibraryTest above stays admin-only for the
// shared library; this tests an inline definition the caller already owns.)
exports.customToolTest = onRequest({ region: REGION, timeoutSeconds: 30, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

  const tool = req.body?.tool;
  const sampleArgs = req.body?.sampleArgs || {};
  if (!tool || !tool.url) { res.status(400).json({ error: "tool.url required" }); return; }

  try {
    const r = await toolExec.executeCustomApiTool(tool, sampleArgs, { timeout: 20000 });
    res.json(r);   // { ok, status, ms, result, url }
  } catch (e) {
    res.json({ ok: false, status: 0, ms: 0, result: `Error: ${e.message}`, url: tool.url });
  }
});

// Internal helpers exposed for unit tests. Not part of the HTTP surface.
exports._internal = { substitute };
