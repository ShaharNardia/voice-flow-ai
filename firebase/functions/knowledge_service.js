/**
 * Knowledge Base Service
 * Handles file upload processing, URL crawling, and plain-text ingestion
 * for the per-assistant RAG knowledge base.
 *
 * Storage layout:  users/{uid}/knowledge/{assistantId}/{fileId}_{fileName}
 * Firestore:       assistants/{assistantId}/knowledge_sources/{sourceId}
 *                  { sourceFile, sourceType, chunkCount, createdAt, updatedAt }
 *
 * Chunks stored in: knowledge_chunks/{chunkId}
 *                  { assistantId, sourceFile, chunkIndex, text, createdAt }
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const https = require("https");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.web\.app$/,
    /\.firebaseapp\.com$/,
  ],
};

// ── Text chunking helpers ────────────────────────────────────────────────────

const CHUNK_SIZE = 800;   // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

/**
 * Split text into overlapping chunks.
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter((c) => c.length > 20); // drop tiny chunks
}

/**
 * Save chunks to Firestore under the assistant's knowledge_sources.
 * Returns number of chunks saved.
 */
async function saveChunks(db, assistantId, sourceFile, sourceType, chunks) {
  const batch = db.batch();
  const sourceRef = db.collection("assistants").doc(assistantId)
    .collection("knowledge_sources").doc(
      Buffer.from(sourceFile).toString("base64").replace(/[/+=]/g, "_").slice(0, 80)
    );

  // Upsert source metadata
  batch.set(sourceRef, {
    sourceFile,
    sourceType,
    chunkCount: chunks.length,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  // Write individual chunks (delete old ones first would require a separate query)
  // For simplicity, use unique IDs based on source + index
  const chunksCollection = db.collection("knowledge_chunks");
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${assistantId}_${Buffer.from(sourceFile).toString("base64").slice(0, 40)}_${i}`;
    batch.set(chunksCollection.doc(chunkId), {
      assistantId,
      sourceFile,
      sourceType,
      chunkIndex: i,
      text: chunks[i],
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return chunks.length;
}

// ── Process File ─────────────────────────────────────────────────────────────

exports.knowledgeProcessFile = onRequest({...corsOptions, memory: "512MiB"}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send(""); return; }

  try {
    const {assistantId, storagePath, fileName} = req.body || {};
    if (!assistantId || !storagePath || !fileName) {
      res.status(400).json({error: "Missing assistantId, storagePath, or fileName"});
      return;
    }

    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const [content] = await file.download();
    const text = content.toString("utf8");

    const chunks = chunkText(text);
    const db = getFirestore();
    const saved = await saveChunks(db, assistantId, fileName, "file", chunks);

    logger.info(`[knowledge] Processed file ${fileName} → ${saved} chunks`);
    res.json({chunksCreated: saved, fileName});
  } catch (err) {
    logger.error("[knowledge] processFile error", err);
    res.status(500).json({error: err.message});
  }
});

// ── Process URL ──────────────────────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : require("http");
    const options = {
      timeout: 15000,
      headers: {"User-Agent": "Mozilla/5.0 (compatible; VoiceFlowBot/1.0)"},
    };
    const req = mod.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location));
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Fetch timeout")); });
  });
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/?(p|div|section|article|h[1-6]|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50000);
}

exports.knowledgeProcessUrl = onRequest({...corsOptions, memory: "512MiB", timeoutSeconds: 60}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send(""); return; }

  try {
    const {assistantId, url} = req.body || {};
    if (!assistantId || !url) {
      res.status(400).json({error: "Missing assistantId or url"});
      return;
    }

    const html = await fetchUrl(url);
    const text = extractText(html);
    const chunks = chunkText(text);
    const db = getFirestore();
    const saved = await saveChunks(db, assistantId, url, "url", chunks);

    logger.info(`[knowledge] Processed URL ${url} → ${saved} chunks`);
    res.json({chunksCreated: saved, url});
  } catch (err) {
    logger.error("[knowledge] processUrl error", err);
    res.status(500).json({error: err.message});
  }
});

// ── Process Plain Text ────────────────────────────────────────────────────────

exports.knowledgeProcessText = onRequest({...corsOptions, memory: "256MiB"}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send(""); return; }

  try {
    const {assistantId, text, title} = req.body || {};
    if (!assistantId || !text) {
      res.status(400).json({error: "Missing assistantId or text"});
      return;
    }

    const sourceLabel = title || `Text (${new Date().toLocaleDateString()})`;
    const chunks = chunkText(text);
    const db = getFirestore();
    const saved = await saveChunks(db, assistantId, sourceLabel, "text", chunks);

    logger.info(`[knowledge] Processed text "${sourceLabel}" → ${saved} chunks`);
    res.json({chunksCreated: saved, title: sourceLabel});
  } catch (err) {
    logger.error("[knowledge] processText error", err);
    res.status(500).json({error: err.message});
  }
});

// ── List Files ───────────────────────────────────────────────────────────────

exports.knowledgeListFiles = onRequest({...corsOptions}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).send(""); return; }

  try {
    const assistantId = req.query.assistantId;
    if (!assistantId) { res.status(400).json({error: "Missing assistantId"}); return; }

    const db = getFirestore();
    const snap = await db.collection("assistants").doc(assistantId)
      .collection("knowledge_sources").get();

    const files = snap.docs.map((d) => {
      const data = d.data();
      return {
        sourceFile: data.sourceFile,
        sourceType: data.sourceType || "file",
        chunkCount: data.chunkCount || 0,
      };
    });

    res.json(files);
  } catch (err) {
    logger.error("[knowledge] listFiles error", err);
    res.status(500).json({error: err.message});
  }
});

// ── Delete File ──────────────────────────────────────────────────────────────

exports.knowledgeDeleteFile = onRequest({...corsOptions}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send(""); return; }

  try {
    const {assistantId, sourceFile} = req.body || {};
    if (!assistantId || !sourceFile) { res.status(400).json({error: "Missing params"}); return; }

    const db = getFirestore();
    const batch = db.batch();

    // Delete source metadata
    const sourceDocId = Buffer.from(sourceFile).toString("base64").replace(/[/+=]/g, "_").slice(0, 80);
    batch.delete(db.collection("assistants").doc(assistantId).collection("knowledge_sources").doc(sourceDocId));

    // Delete associated chunks
    const chunksSnap = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("sourceFile", "==", sourceFile)
      .get();
    chunksSnap.docs.forEach((d) => batch.delete(d.ref));

    await batch.commit();
    logger.info(`[knowledge] Deleted ${sourceFile} (${chunksSnap.size} chunks)`);
    res.json({deleted: chunksSnap.size});
  } catch (err) {
    logger.error("[knowledge] deleteFile error", err);
    res.status(500).json({error: err.message});
  }
});

// ── Sync URL ─────────────────────────────────────────────────────────────────

exports.knowledgeSync = onRequest({...corsOptions, memory: "512MiB", timeoutSeconds: 60}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).send(""); return; }

  try {
    const {assistantId, url} = req.body || {};
    if (!assistantId || !url) { res.status(400).json({error: "Missing params"}); return; }

    // Delete old chunks for this URL, then re-crawl
    const db = getFirestore();
    const oldChunks = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("sourceFile", "==", url)
      .get();
    const batch = db.batch();
    oldChunks.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    const html = await fetchUrl(url);
    const text = extractText(html);
    const chunks = chunkText(text);
    const saved = await saveChunks(db, assistantId, url, "url", chunks);

    logger.info(`[knowledge] Synced URL ${url} → ${saved} chunks`);
    res.json({chunksCreated: saved, url});
  } catch (err) {
    logger.error("[knowledge] syncUrl error", err);
    res.status(500).json({error: err.message});
  }
});
