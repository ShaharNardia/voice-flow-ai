/**
 * Knowledge Base Service
 * Allows uploading documents (TXT, MD, PDF, DOCX) as context for assistants.
 * Files are stored in Firebase Storage; their text is chunked, embedded via
 * OpenAI text-embedding-3-small, and stored in Firestore for RAG retrieval.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const {extractUidFromRequest} = require("./security_utils");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 800;      // characters per chunk
const CHUNK_OVERLAP = 100;   // characters overlap between chunks
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

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

// ── Cosine Similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Text Extraction ───────────────────────────────────────────────────────────

async function extractText(buffer, fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  if (ext === "pdf") {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({buffer});
    return result.value;
  }
  // txt, md, json, csv — plain text
  return buffer.toString("utf-8");
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function chunkText(text) {
  const chunks = [];
  // Split into paragraphs first, then merge by char count
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      // Carry overlap
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If a paragraph was too long, split it by char count
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= CHUNK_SIZE * 1.5) {
      result.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        result.push(chunk.slice(i, i + CHUNK_SIZE));
      }
    }
  }
  return result.filter((c) => c.trim().length > 20);
}

// ── OpenAI Embeddings ─────────────────────────────────────────────────────────

async function embedTexts(texts) {
  const response = await axios.post(
    "https://api.openai.com/v1/embeddings",
    {model: EMBEDDING_MODEL, input: texts},
    {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    },
  );
  return response.data.data.map((d) => d.embedding);
}

// ── Exported: getKnowledgeContext (used internally by voice_service.js) ───────

async function getKnowledgeContext(db, assistantId, query, topK = 3) {
  if (!OPENAI_API_KEY || !query) return [];
  try {
    const [queryEmbedding] = await embedTexts([query]);
    const snap = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .get();

    if (snap.empty) return [];

    const scored = snap.docs.map((doc) => {
      const data = doc.data();
      const score = data.embedding ? cosineSimilarity(queryEmbedding, data.embedding) : 0;
      return {content: data.content, score};
    });

    return scored
      .filter((c) => c.score > 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (e) {
    logger.warn("getKnowledgeContext error", e.message);
    return [];
  }
}

// ── Process & embed an uploaded file ─────────────────────────────────────────

exports.knowledgeProcessFile = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, storagePath, fileName} = body;

    if (!assistantId || !storagePath || !fileName) {
      res.status(400).json({status: "error", message: "assistantId, storagePath, fileName required"});
      return;
    }

    // Download file from Storage
    const bucket = admin.storage().bucket();
    const [buffer] = await bucket.file(storagePath).download();

    if (buffer.length > MAX_FILE_BYTES) {
      res.status(400).json({status: "error", message: "File too large (max 5 MB)"});
      return;
    }

    // Extract text
    const text = await extractText(buffer, fileName);
    if (!text || text.trim().length < 10) {
      res.status(400).json({status: "error", message: "No readable text found in file"});
      return;
    }

    // Chunk
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      res.status(400).json({status: "error", message: "Could not extract text chunks"});
      return;
    }

    // Embed all chunks (batch requests of 50 to avoid rate limits)
    const allEmbeddings = [];
    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embedTexts(batch);
      allEmbeddings.push(...embeddings);
    }

    // Delete existing chunks for this file (in case of re-upload)
    const db = getFirestore();
    const existingSnap = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("sourceFile", "==", fileName)
      .get();
    const deleteOps = [];
    existingSnap.forEach((doc) => deleteOps.push(doc.ref.delete()));
    await Promise.all(deleteOps);

    // Batch write new chunks (Firestore max 500 per batch)
    const now = FieldValue.serverTimestamp();
    let batch = db.batch();
    let batchCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const docRef = db.collection("knowledge_chunks").doc();
      batch.set(docRef, {
        assistantId,
        ownerId: uid,
        content: chunks[i],
        embedding: allEmbeddings[i],
        sourceFile: fileName,
        storagePath,
        chunkIndex: i,
        createdAt: now,
      });
      batchCount++;
      if (batchCount === 499) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    logger.info(`Processed ${chunks.length} chunks for assistant ${assistantId}, file ${fileName}`);
    res.status(200).json({chunksCreated: chunks.length, fileName});
  } catch (error) {
    logger.error("knowledgeProcessFile failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process file"});
  }
});

// ── List files for an assistant ───────────────────────────────────────────────

exports.knowledgeListFiles = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const {assistantId} = req.query;
    if (!assistantId) { res.status(400).json({status: "error", message: "assistantId required"}); return; }

    const db = getFirestore();
    const snap = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("ownerId", "==", uid)
      .get();

    // Group by sourceFile
    const fileMap = {};
    snap.forEach((doc) => {
      const {sourceFile, storagePath, sourceType, syncedAt} = doc.data();
      if (!fileMap[sourceFile]) {
        fileMap[sourceFile] = {
          sourceFile,
          storagePath: storagePath || null,
          chunkCount: 0,
          sourceType: sourceType || "file",
          syncedAt: syncedAt || null,
        };
      }
      fileMap[sourceFile].chunkCount++;
    });

    res.status(200).json(Object.values(fileMap));
  } catch (error) {
    logger.error("knowledgeListFiles failed", error);
    res.status(500).json({status: "error", message: "Failed to list files"});
  }
});

// ── Delete a file and its chunks ──────────────────────────────────────────────

exports.knowledgeDeleteFile = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, sourceFile} = body;
    if (!assistantId || !sourceFile) {
      res.status(400).json({status: "error", message: "assistantId and sourceFile required"});
      return;
    }

    const db = getFirestore();
    const snap = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("sourceFile", "==", sourceFile)
      .where("ownerId", "==", uid)
      .get();

    if (snap.empty) {
      res.status(404).json({status: "error", message: "File not found"});
      return;
    }

    // Get storage path from first doc
    const storagePath = snap.docs[0].data().storagePath;

    // Delete Firestore chunks
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Delete from Storage (best effort)
    if (storagePath) {
      try {
        await admin.storage().bucket().file(storagePath).delete();
      } catch (storageErr) {
        logger.warn("Storage delete failed (non-fatal)", storageErr.message);
      }
    }

    res.status(200).json({deleted: snap.size});
  } catch (error) {
    logger.error("knowledgeDeleteFile failed", error);
    res.status(500).json({status: "error", message: "Failed to delete file"});
  }
});

// ── Semantic search ───────────────────────────────────────────────────────────

exports.knowledgeSearch = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, query} = body;
    if (!assistantId || !query) {
      res.status(400).json({status: "error", message: "assistantId and query required"});
      return;
    }

    const db = getFirestore();
    const chunks = await getKnowledgeContext(db, assistantId, query, 5);
    res.status(200).json({results: chunks});
  } catch (error) {
    logger.error("knowledgeSearch failed", error);
    res.status(500).json({status: "error", message: "Search failed"});
  }
});

// ── URL Text Extraction ───────────────────────────────────────────────────────

async function fetchUrlText(url) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {"User-Agent": "VoiceFlowBot/1.0 (+https://voiceflowai.app)"},
    maxContentLength: MAX_FILE_BYTES,
    responseType: "text",
  });

  const cheerio = require("cheerio");
  const $ = cheerio.load(response.data);

  // Remove noise elements
  $("script, style, nav, footer, header, aside, [role=navigation], noscript").remove();

  // Extract and clean text
  const text = $("body").text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text || text.length < 10) throw new Error("No readable text found at URL");
  return text;
}

// ── Internal helper: scrape URL → chunk → embed → store ──────────────────────

async function _processUrl(uid, assistantId, url) {
  const text = await fetchUrlText(url);
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("No text chunks extracted from URL");

  const allEmbeddings = [];
  for (let i = 0; i < chunks.length; i += 50) {
    const embeddings = await embedTexts(chunks.slice(i, i + 50));
    allEmbeddings.push(...embeddings);
  }

  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  // Delete existing chunks for this URL (idempotent — enables sync)
  const existingSnap = await db.collection("knowledge_chunks")
    .where("assistantId", "==", assistantId)
    .where("sourceFile", "==", url)
    .get();
  const deleteOps = [];
  existingSnap.forEach((doc) => deleteOps.push(doc.ref.delete()));
  await Promise.all(deleteOps);

  // Batch-write new chunks
  let batch = db.batch();
  let batchCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const docRef = db.collection("knowledge_chunks").doc();
    batch.set(docRef, {
      assistantId,
      ownerId: uid,
      content: chunks[i],
      embedding: allEmbeddings[i],
      sourceFile: url,
      sourceType: "url",
      storagePath: null,
      chunkIndex: i,
      syncedAt: now,
      createdAt: now,
    });
    batchCount++;
    if (batchCount === 499) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  return {chunksCreated: chunks.length, url};
}

// ── Add a URL as a knowledge source ──────────────────────────────────────────

exports.knowledgeProcessUrl = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, url} = body;

    if (!assistantId || !url) {
      res.status(400).json({status: "error", message: "assistantId and url required"});
      return;
    }

    const result = await _processUrl(uid, assistantId, url);
    logger.info(`Processed URL ${url} → ${result.chunksCreated} chunks for assistant ${assistantId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error("knowledgeProcessUrl failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process URL"});
  }
});

// ── Re-sync an existing URL source ───────────────────────────────────────────

exports.knowledgeSync = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, url} = body;

    if (!assistantId || !url) {
      res.status(400).json({status: "error", message: "assistantId and url required"});
      return;
    }

    const result = await _processUrl(uid, assistantId, url);
    logger.info(`Synced URL ${url} → ${result.chunksCreated} chunks for assistant ${assistantId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error("knowledgeSync failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to sync URL"});
  }
});

// ── Add plain text as a knowledge source ────────────────────────────────────

exports.knowledgeProcessText = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({status: "error", message: "Unauthorized"}); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {assistantId, text, title} = body;

    if (!assistantId || !text) {
      res.status(400).json({status: "error", message: "assistantId and text required"});
      return;
    }

    const sourceTitle = title || `text-${Date.now()}`;
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      res.status(400).json({status: "error", message: "Text too short to index"});
      return;
    }

    // Embed all chunks (batch requests of 50 to avoid rate limits)
    const allEmbeddings = [];
    const embBatchSize = 50;
    for (let i = 0; i < chunks.length; i += embBatchSize) {
      const slice = chunks.slice(i, i + embBatchSize);
      const embeddings = await embedTexts(slice);
      allEmbeddings.push(...embeddings);
    }

    const db = getFirestore();

    // Delete existing chunks for this title (re-save)
    const existing = await db.collection("knowledge_chunks")
      .where("assistantId", "==", assistantId)
      .where("sourceFile", "==", sourceTitle)
      .get();
    const delOps = [];
    existing.forEach((doc) => delOps.push(doc.ref.delete()));
    await Promise.all(delOps);

    // Write new chunks with embeddings
    const now = FieldValue.serverTimestamp();
    let batch = db.batch();
    let batchCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const docRef = db.collection("knowledge_chunks").doc();
      batch.set(docRef, {
        assistantId,
        ownerId: uid,
        content: chunks[i],
        embedding: allEmbeddings[i],
        sourceFile: sourceTitle,
        sourceType: "text",
        storagePath: null,
        chunkIndex: i,
        createdAt: now,
      });
      batchCount++;
      if (batchCount === 499) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    logger.info(`ProcessText "${sourceTitle}" → ${chunks.length} chunks for assistant ${assistantId}`);
    res.status(200).json({chunksCreated: chunks.length, title: sourceTitle});
  } catch (error) {
    logger.error("knowledgeProcessText failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process text"});
  }
});

module.exports.getKnowledgeContext = getKnowledgeContext;
