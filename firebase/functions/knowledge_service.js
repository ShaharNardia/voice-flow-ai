/**
 * Knowledge Base Service
 * Allows uploading documents (TXT, MD, PDF, DOCX) as context for assistants.
 * Files are stored in Firebase Storage; their text is chunked, embedded via
 * OpenAI text-embedding-3-small, and stored in Firestore for RAG retrieval.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const {extractUidFromRequest} = require("./security_utils");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 800;      // characters per chunk
const CHUNK_OVERLAP = 100;   // characters overlap between chunks
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â"€â"€ Cosine Similarity â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ Text Extraction â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
  // txt, md, json, csv â€" plain text
  return buffer.toString("utf-8");
}

// â"€â"€ Chunking â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ OpenAI Embeddings â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function embedTexts(texts) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured. Contact your admin to set OPENAI_API_KEY.");
  }
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {model: EMBEDDING_MODEL, input: texts},
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      },
    );
    return response.data.data.map((d) => d.embedding);
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error("OpenAI API key is invalid or expired. Contact your admin to update it.");
    }
    throw err;
  }
}

// â"€â"€ Exported: getKnowledgeContext (used internally by voice_service.js) â"€â"€â"€â"€â"€â"€â"€

async function getKnowledgeContext(db, assistantId, query, topK = 3) {
  if (!process.env.OPENAI_API_KEY || !query) return [];
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

// â"€â"€ Process & embed an uploaded file â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeProcessFile = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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

    // Batch write new chunks. Firestore caps at 10 MB per transaction â€"
    // embedding vectors (~6 KB each) + text blow past that at 500 docs/batch.
    const now = FieldValue.serverTimestamp();
    const WRITE_BATCH_SIZE = 20;
    for (let i = 0; i < chunks.length; i += WRITE_BATCH_SIZE) {
      const batch = db.batch();
      const slice = chunks.slice(i, i + WRITE_BATCH_SIZE);
      slice.forEach((content, j) => {
        const globalIdx = i + j;
        const docRef = db.collection("knowledge_chunks").doc();
        batch.set(docRef, {
          assistantId,
          ownerId: uid,
          content,
          embedding: allEmbeddings[globalIdx],
          sourceFile: fileName,
          storagePath,
          chunkIndex: globalIdx,
          createdAt: now,
        });
      });
      await batch.commit();
    }

    logger.info(`Processed ${chunks.length} chunks for assistant ${assistantId}, file ${fileName}`);
    res.status(200).json({chunksCreated: chunks.length, fileName});
  } catch (error) {
    logger.error("knowledgeProcessFile failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process file"});
  }
});

// â"€â"€ List files for an assistant â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeListFiles = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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

    // Group by sourceFile (for files/text) or sourceRoot (for URL crawls).
    // URL-type chunks from a crawled site collapse into a single entry
    // keyed by the root URL the user supplied, with a `pagesCount` field.
    const fileMap = {};
    snap.forEach((doc) => {
      const d = doc.data();
      const {sourceFile, sourceRoot, storagePath, sourceType, syncedAt} = d;
      const groupKey = (sourceType === "url" && sourceRoot) ? sourceRoot : sourceFile;
      if (!fileMap[groupKey]) {
        fileMap[groupKey] = {
          sourceFile: groupKey,
          storagePath: storagePath || null,
          chunkCount: 0,
          sourceType: sourceType || "file",
          syncedAt: syncedAt || null,
          pagesCount: 0,
          _pageSet: new Set(),
        };
      }
      fileMap[groupKey].chunkCount++;
      if (sourceType === "url" && sourceFile) fileMap[groupKey]._pageSet.add(sourceFile);
    });
    const results = Object.values(fileMap).map((f) => {
      const out = {...f, pagesCount: f._pageSet.size};
      delete out._pageSet;
      return out;
    });

    res.status(200).json(results);
  } catch (error) {
    logger.error("knowledgeListFiles failed", error);
    res.status(500).json({status: "error", message: "Failed to list files"});
  }
});

// â"€â"€ Delete a file and its chunks â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeDeleteFile = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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
    // The UI sends the group key back as `sourceFile`. For URL-crawled
    // entries that's the sourceRoot (site root); fetch chunks matching
    // either the per-page sourceFile OR the sourceRoot.
    const [bySource, byRoot] = await Promise.all([
      db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .where("sourceFile", "==", sourceFile)
        .where("ownerId", "==", uid)
        .get(),
      db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .where("sourceRoot", "==", sourceFile)
        .where("ownerId", "==", uid)
        .get(),
    ]);
    const seen = new Set();
    const allDocs = [];
    [bySource, byRoot].forEach((snap) => snap.forEach((doc) => {
      if (!seen.has(doc.id)) { seen.add(doc.id); allDocs.push(doc); }
    }));

    if (allDocs.length === 0) {
      res.status(404).json({status: "error", message: "File not found"});
      return;
    }

    // Get storage path from first doc (only set for file uploads, not URL crawls)
    const storagePath = allDocs[0].data().storagePath;

    // Delete Firestore chunks (batches of 500)
    for (let i = 0; i < allDocs.length; i += 500) {
      const batch = db.batch();
      allDocs.slice(i, i + 500).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // Delete from Storage (best effort)
    if (storagePath) {
      try {
        await admin.storage().bucket().file(storagePath).delete();
      } catch (storageErr) {
        logger.warn("Storage delete failed (non-fatal)", storageErr.message);
      }
    }

    // FIX (Issue 4 â€" KB URL deletion "Failed to delete file"):
    // `snap` was never declared in this scope â€" the variable holding all the
    // de-duplicated Firestore docs is `allDocs` (an array built above).
    // Referencing the undefined `snap.size` threw a TypeError which was caught
    // by the outer catch block and surfaced as "Failed to delete file".
    // The chunks were actually deleted successfully; only the success response
    // was broken.  Return the correct count so the UI refreshes the list.
    logger.info(`knowledgeDeleteFile: deleted ${allDocs.length} chunks for sourceFile="${sourceFile}" assistantId="${assistantId}"`);
    res.status(200).json({deleted: allDocs.length});
  } catch (error) {
    logger.error("knowledgeDeleteFile failed", error);
    res.status(500).json({status: "error", message: "Failed to delete file"});
  }
});

// â"€â"€ Semantic search â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeSearch = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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

// â"€â"€ URL Text Extraction â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Crawl configuration â€" safe defaults to avoid hammering target sites.
const CRAWL_MAX_PAGES = 60;
const CRAWL_MAX_DEPTH = 3;
const CRAWL_PAGE_TIMEOUT_MS = 12000;
const CRAWL_PAGE_MAX_BYTES = 1.5 * 1024 * 1024;   // 1.5 MB per page
const SKIP_EXTENSIONS = /\.(pdf|zip|rar|7z|mp3|mp4|wav|mov|avi|jpg|jpeg|png|gif|webp|svg|ico|css|js|woff2?|ttf|otf|eot)(\?.*)?$/i;
// Real browser UA - reduces WAF/CDN bot-detection rejections (e.g. Imperva/Incapsula)
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// Googlebot UA - many sites whitelist Googlebot in their WAF rules
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// Patterns that appear in actual WAF JS challenge pages (NOT in normal Incapsula-monitored responses).
// We combine with a size check (<15KB) to avoid false positives on monitored-but-accessible pages.
const WAF_CHALLENGE_PATTERNS = [/incapsula.*challenge/i, /ddos.*protection/i, /challenge-platform/i, /please.*enable.*javascript/i, /checking.*browser/i, /just.*moment.*cloudflare/i];

/**
 * Fetch a single HTML page and return its visible text.
 * Returns null on failure (network error, non-HTML, too small).
 */
async function fetchPageTextWithUA(url, sitemapMeta, userAgent) {
  try {
    const response = await axios.get(url, {
      timeout: CRAWL_PAGE_TIMEOUT_MS,
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      maxContentLength: CRAWL_PAGE_MAX_BYTES,
      responseType: "text",
      validateStatus: (s) => s < 400,
    });
    const ct = (response.headers["content-type"] || "").toLowerCase();
    if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) return null;

    // Detect actual WAF challenge pages (small JS-challenge responses from Imperva/Cloudflare).
    // We require BOTH a size threshold AND a challenge-specific pattern to avoid false positives:
    // Incapsula injects its monitoring JS into ALL pages, so we cannot use its presence alone.
    const rawHtml = response.data || "";
    const isSmallResponse = rawHtml.length < 15000;
    const isWafPage = (isSmallResponse && WAF_CHALLENGE_PATTERNS.some((p) => p.test(rawHtml))) ||
      Boolean(response.headers["x-iinfo"] && isSmallResponse);

    const cheerio = require("cheerio");
    const $ = cheerio.load(response.data);

    // Always collect outgoing links before stripping (links are in nav/header)
    const base = new URL(url);
    const links = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const abs = new URL(href, base);
        if (abs.origin !== base.origin) return;
        if (SKIP_EXTENSIONS.test(abs.pathname)) return;
        abs.hash = "";
        links.push(abs.toString());
      } catch (_) {}
    });

    // Extract meta fallbacks before stripping
    const metaDesc = $("meta[name='description']").attr("content") || "";
    const ogDesc   = $("meta[property='og:description']").attr("content") || "";
    const pageTitle = $("title").text() || "";

    // Extract JSON-LD descriptions (useful for Hebrew SEO-rich sites)
    const jsonLdTexts = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "{}");
        const descs = [];
        const walk = (obj) => {
          if (!obj || typeof obj !== "object") return;
          if (obj.description) descs.push(String(obj.description));
          if (obj.name) descs.push(String(obj.name));
          if (Array.isArray(obj)) obj.forEach(walk);
          else Object.values(obj).forEach(walk);
        };
        walk(data);
        jsonLdTexts.push(...descs);
      } catch (_) {}
    });

    // Remove definite noise (keep nav/header - they contain real text on many sites)
    $("script, style, noscript, iframe, svg, [aria-hidden='true']").remove();

    // Try main content area first (highest quality)
    const mainSelectors = ["main", "[role='main']", "article", "#content", ".content", "#main", ".main"];
    let text = "";
    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length) {
        text = el.text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (text.length >= 80) break;
      }
    }

    // Fall back to headings + paragraphs extraction (works well for JS-heavy sites)
    if (text.length < 80) {
      const parts = [];
      $("h1, h2, h3, h4, p, li, td, th, [class*='text'], [class*='content'], [class*='description']").each((_, el) => {
        const t = $(el).clone().children("script,style").remove().end().text().trim();
        if (t.length > 5) parts.push(t);
      });
      text = parts.join(" ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Last resort: full body text
    if (text.length < 80) {
      $("nav, footer, aside, [role='navigation'], [role='banner']").remove();
      text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }

    // Append meta fallbacks so even JS-only pages yield something useful
    const metaSources = [pageTitle, metaDesc, ogDesc, ...jsonLdTexts];
    // Also include sitemap-harvested metadata when provided
    if (sitemapMeta?.title)       metaSources.push(sitemapMeta.title);
    if (sitemapMeta?.description) metaSources.push(sitemapMeta.description);
    if (sitemapMeta?.keywords)    metaSources.push(sitemapMeta.keywords);

    const extras = metaSources.map((s) => s.trim()).filter((s) => s.length > 5).join("\n");
    if (extras) text = (text ? text + "\n\n" : "") + extras;

    // Deduplicate repeated whitespace / lines
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    // WAF challenge detected - if we have any meta content use it, otherwise skip
    if (isWafPage) {
      if (!text || text.length < 10) return null;
      // Prefix so analysts know the content came from meta only
      text = "[WAF-protected page - metadata only]\n" + text;
      return {text, links};
    }

    // Minimum bar: 10 chars (was 20 - too aggressive for non-English / meta-only pages)
    if (!text || text.length < 10) return null;

    return {text, links};
  } catch (_) {
    return null;
  }
}

/**
 * Get a Wayback Machine snapshot timestamp for a URL.
 * Returns the timestamp string (e.g. "20260114093217") or null.
 * Uses a single API call so it can be shared across multiple pages.
 */
async function getWaybackTimestamp(url) {
  try {
    // Try exact URL first, then with trailing slash, then the www variant
    const candidates = [url, url.replace(/\/?$/, "/"), url.replace("://", "://www.")];
    for (const candidate of candidates) {
      const apiRes = await axios.get(
        `https://archive.org/wayback/available?url=${encodeURIComponent(candidate)}`,
        {timeout: 8000, headers: {"User-Agent": USER_AGENT}},
      );
      const snap = apiRes.data && apiRes.data.archived_snapshots && apiRes.data.archived_snapshots.closest;
      if (snap && snap.available && snap.timestamp) {
        logger.info("[KB/Wayback] timestamp=" + snap.timestamp + " for " + candidate);
        return snap.timestamp;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Fetch a page directly from Wayback Machine using a known timestamp.
 * No extra API calls — construct the archive URL directly.
 * Returns {text, links} or null.
 */
async function fetchArchivePage(originalUrl, timestamp, sitemapMeta) {
  try {
    // Normalise: Wayback stores www and non-www separately; try original then www variant
    const archiveUrl = `https://web.archive.org/web/${timestamp}/${originalUrl}`;
    const response = await axios.get(archiveUrl, {
      timeout: CRAWL_PAGE_TIMEOUT_MS,
      headers: {"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"},
      maxContentLength: CRAWL_PAGE_MAX_BYTES,
      responseType: "text",
      validateStatus: (s) => s < 500,
    });
    const html = response.data || "";
    logger.info("[KB/Wayback] " + archiveUrl + " -> " + response.status + " size=" + html.length);
    if (html.length < 200 || response.status >= 400) return null;

    const cheerio = require("cheerio");
    const $ = cheerio.load(html);

    // Strip Wayback toolbar (added by archive.org)
    $("#wm-ipp-base, #wm-toolbar, #donato, #wm-ipp").remove();

    // Links (relative to original URL, not archive.org)
    const base = new URL(originalUrl);
    const links = [];
    $("a[href]").each((_, el) => {
      try {
        let href = $(el).attr("href") || "";
        // Strip Wayback prefix: /web/20240101000000/https://...
        href = href.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\//, "")
                   .replace(/^\/web\/\d+\//, "");
        const abs = new URL(href, base);
        if (abs.origin !== base.origin && abs.origin !== base.origin.replace("://", "://www.")) return;
        if (SKIP_EXTENSIONS.test(abs.pathname)) return;
        abs.hash = "";
        // Normalise to non-www
        links.push(abs.toString().replace("://www.", "://"));
      } catch (_) {}
    });

    $("script, style, noscript, iframe, svg, [aria-hidden='true']").remove();

    const metaDesc  = $("meta[name='description']").attr("content") || "";
    const ogDesc    = $("meta[property='og:description']").attr("content") || "";
    const pageTitle = $("title").text() || "";
    const jsonLdTexts = [];
    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "{}");
        const descs = [];
        const walk = (obj) => {
          if (!obj || typeof obj !== "object") return;
          if (obj.description) descs.push(String(obj.description));
          if (obj.name) descs.push(String(obj.name));
          if (Array.isArray(obj)) obj.forEach(walk); else Object.values(obj).forEach(walk);
        };
        walk(data); jsonLdTexts.push(...descs);
      } catch (_) {}
    });

    const mainSelectors = ["main", "[role='main']", "article", "#content", ".content", "#main", ".main"];
    let text = "";
    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length) {
        text = el.text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (text.length >= 80) break;
      }
    }
    if (text.length < 80) {
      const parts = [];
      $("h1, h2, h3, h4, p, li, td, th").each((_, el) => {
        const t = $(el).clone().children("script,style").remove().end().text().trim();
        if (t.length > 5) parts.push(t);
      });
      text = parts.join(" ").replace(/[ \t]+/g, " ").trim();
    }
    if (text.length < 80) {
      $("nav, footer, aside").remove();
      text = $("body").text().replace(/[ \t]+/g, " ").trim();
    }

    const metaSources = [pageTitle, metaDesc, ogDesc, ...jsonLdTexts];
    if (sitemapMeta && sitemapMeta.title) metaSources.push(sitemapMeta.title);
    const extras = metaSources.map((s) => s.trim()).filter((s) => s.length > 5).join("\n");
    if (extras) text = (text ? text + "\n\n" : "") + extras;

    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!text || text.length < 10) return null;

    return {text, links, viaWayback: true};
  } catch (e) {
    logger.info("[KB/Wayback] fetchArchivePage error: " + e.message);
    return null;
  }
}

/**
 * Backwards-compat wrapper: resolve timestamp then fetch.
 * Only used as the last-resort in fetchPageText; crawlSite uses the
 * shared-timestamp path instead.
 */
async function fetchPageViaWayback(url, sitemapMeta) {
  const ts = await getWaybackTimestamp(url);
  if (!ts) return null;
  return fetchArchivePage(url, ts, sitemapMeta);
}

/**
 * Public fetchPageText - tries Chrome UA first, then Googlebot UA, then Wayback Machine.
 * The Wayback Machine fallback bypasses WAFs (Incapsula/Cloudflare) because
 * the cached copy is served from archive.org's own IP space.
 */
async function fetchPageText(url, sitemapMeta) {
  const r1 = await fetchPageTextWithUA(url, sitemapMeta, USER_AGENT);
  if (r1) return r1;
  const r2 = await fetchPageTextWithUA(url, sitemapMeta, GOOGLEBOT_UA);
  if (r2) return r2;
  // Last resort: serve from Wayback Machine archive
  return fetchPageViaWayback(url, sitemapMeta);
}

/**
 * Attempt to pull URLs from /sitemap.xml (and robots.txt Sitemap: lines).
 * Returns a Map<url, {title?, description?, keywords?}> - metadata is populated
 * from WordPress/Yoast sitemap extensions (news:title, image:caption, etc.)
 * and used as fallback text for WAF-blocked pages.
 */
async function discoverFromSitemap(origin) {
  // Map: url → {title?, description?, keywords?}
  const found = new Map();

  // Extract rich metadata from a single <url> block in the XML
  const extractMeta = (block) => {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i")) ||
                block.match(new RegExp(`<${tag}[^>]*>([^<]{1,500})<\\/${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };
    const title = get("news:title") || get("image:title") || get("title") || get("dc:title");
    const description = get("news:keywords") || get("image:caption") || get("description");
    const keywords = get("news:keywords");
    return (title || description || keywords) ? {title, description, keywords} : null;
  };

  const tryFetchXml = async (u, depth = 0) => {
    if (depth > 2) return; // prevent runaway recursion
    try {
      const r = await axios.get(u, {
        timeout: 10000,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/xml,text/xml,*/*;q=0.8",
        },
        responseType: "text",
        maxContentLength: 6 * 1024 * 1024,
      });
      const xml = r.data || "";

      // Handle sitemap index (nested <sitemap><loc>...</loc>...)
      const nestedSitemaps = [...xml.matchAll(/<sitemap[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      for (const sm of nestedSitemaps) {
        if (found.size < CRAWL_MAX_PAGES * 2) await tryFetchXml(sm, depth + 1);
      }

      // Parse individual <url> blocks to capture per-URL metadata
      const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => m[1]);
      for (const block of urlBlocks) {
        const locMatch = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i);
        if (!locMatch) continue;
        const loc = locMatch[1];
        if (SKIP_EXTENSIONS.test(loc)) continue;
        const meta = extractMeta(block) || {};
        // If sitemap has no title/description, fall back to URL slug as minimum text.
        // e.g. "/treatments/dental-implants/" -> "treatments dental implants"
        if (!meta.title) {
          try {
            const parts = new URL(loc).pathname.split("/").filter(Boolean);
            if (parts.length > 0) {
              meta.title = parts.map((p) => decodeURIComponent(p).replace(/-/g, " ")).join(" - ");
            }
          } catch (_) {}
        }
        if (!found.has(loc)) found.set(loc, meta);
        if (found.size >= CRAWL_MAX_PAGES * 2) return;
      }

      // Also handle plain <loc> entries outside <url> blocks (some sitemap generators)
      if (urlBlocks.length === 0) {
        const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
        for (const loc of locs) {
          if (/\.xml(\?.*)?$/i.test(loc)) continue; // skip nested sitemaps already processed
          if (SKIP_EXTENSIONS.test(loc)) continue;
          if (!found.has(loc)) {
            const meta = {};
            try {
              const parts = new URL(loc).pathname.split("/").filter(Boolean);
              if (parts.length > 0) {
                meta.title = parts.map((p) => decodeURIComponent(p).replace(/-/g, " ")).join(" - ");
              }
            } catch (_) {}
            found.set(loc, meta);
          }
          if (found.size >= CRAWL_MAX_PAGES * 2) return;
        }
      }
    } catch (_) {}
  };

  // Try robots.txt for Sitemap: lines first
  try {
    const r = await axios.get(`${origin}/robots.txt`, {
      timeout: 6000,
      headers: {"User-Agent": USER_AGENT},
      responseType: "text",
      maxContentLength: 100_000,
    });
    const sitemaps = [...(r.data || "").matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    for (const sm of sitemaps) await tryFetchXml(sm, 0);
  } catch (_) {}

  // Always try the conventional location if nothing found yet
  if (found.size === 0) await tryFetchXml(`${origin}/sitemap.xml`, 0);

  // If both failed (site blocked at CDN level), try fetching sitemap via Wayback Machine
  if (found.size === 0) {
    try {
      const sitemapUrl = `${origin}/sitemap.xml`;
      const apiRes = await axios.get(
        `https://archive.org/wayback/available?url=${encodeURIComponent(sitemapUrl)}`,
        {timeout: 8000, headers: {"User-Agent": USER_AGENT}},
      );
      const snap = apiRes.data && apiRes.data.archived_snapshots && apiRes.data.archived_snapshots.closest;
      if (snap && snap.available && snap.url) {
        await tryFetchXml(snap.url, 0);
      }
    } catch (_) {}
  }

  // Also try Wayback CDX API to discover all URLs for this domain from the archive
  // This works even when direct sitemap access is blocked
  if (found.size === 0) {
    try {
      const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(origin.replace(/^https?:\/\//, "") + "/*")}&output=json&fl=original&collapse=urlkey&limit=120&statuscode=200&matchType=prefix`;
      const cdxRes = await axios.get(cdxUrl, {timeout: 15000, headers: {"User-Agent": USER_AGENT}});
      const rows = cdxRes.data || [];
      // rows is [[header], [url], [url], ...] — skip first row (header)
      for (let i = 1; i < rows.length; i++) {
        const loc = rows[i][0];
        if (!loc || SKIP_EXTENSIONS.test(loc)) continue;
        if (!found.has(loc)) {
          const meta = {};
          try {
            const parts = new URL(loc).pathname.split("/").filter(Boolean);
            if (parts.length > 0) {
              meta.title = parts.map((p) => decodeURIComponent(p).replace(/-/g, " ")).join(" - ");
            }
          } catch (_) {}
          found.set(loc, meta);
        }
        if (found.size >= CRAWL_MAX_PAGES * 2) break;
      }
    } catch (_) {}
  }

  // Return as Map, limited to CRAWL_MAX_PAGES entries
  if (found.size > CRAWL_MAX_PAGES) {
    const entries = [...found.entries()].slice(0, CRAWL_MAX_PAGES);
    return new Map(entries);
  }
  return found;
}

/**
 * Crawl a whole site starting from `startUrl`.
 * Returns [{url, text}] for each reachable page (capped by CRAWL_MAX_PAGES).
 */
async function crawlSite(startUrl) {
  const start = new URL(startUrl);
  if (!["http:", "https:"].includes(start.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  const visited = new Set();
  const results = [];

  // 1. Discover URLs via sitemap - returns Map<url, {title?,description?,keywords?}>
  const sitemapMap = await discoverFromSitemap(start.origin);
  const hasSitemap = sitemapMap.size > 0;
  logger.info("[KB/crawl] sitemapMap.size=" + sitemapMap.size + " for " + startUrl);

  // Pre-fetch ONE Wayback timestamp for the whole site.
  // We reuse it for every page so we only make 1 archive.org API call total (avoiding rate limits).
  let sharedWaybackTs = null;
  if (!hasSitemap) {
    // Site is likely fully WAF-blocked; get the timestamp now before starting the page loop
    sharedWaybackTs = await getWaybackTimestamp(startUrl);
    logger.info("[KB/crawl] sharedWaybackTs=" + sharedWaybackTs);
  }

  // Build seed list: sitemap URLs + always the start URL
  const seedEntries = hasSitemap
    ? [...sitemapMap.entries()]
    : [[startUrl, {}]];
  if (hasSitemap && !sitemapMap.has(startUrl)) {
    seedEntries.unshift([startUrl, {}]);
  }

  // 2. BFS over seeds + discovered links, capped by page count and depth.
  // Queue entries: {url, depth, meta?}
  const queue = seedEntries.map(([u, m]) => ({url: u, depth: 0, meta: m}));

  // Wayback Machine fetches take ~4s each; cap at 25 pages for Wayback-dependent sites
  // to stay within the 540s Cloud Function timeout.
  const pageLimit = CRAWL_MAX_PAGES;
  let waybackCount = 0;
  const WAYBACK_MAX = 25;

  while (queue.length > 0 && results.length < pageLimit) {
    const {url, depth, meta} = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    // Try direct fetch first; if blocked, use shared Wayback timestamp (no extra API call)
    let page = await fetchPageTextWithUA(url, meta, USER_AGENT) ||
               await fetchPageTextWithUA(url, meta, GOOGLEBOT_UA);
    if (!page && sharedWaybackTs) {
      page = await fetchArchivePage(url, sharedWaybackTs, meta);
    } else if (!page) {
      page = await fetchPageViaWayback(url, meta);
    }
    logger.info("[KB/crawl] " + url + " -> " + (page ? "ok len=" + page.text.length + (page.viaWayback?" [wayback]":"") : "null"));
    if (page) {
      if (page.viaWayback) waybackCount++;
      // If Wayback is the only thing working, stop after WAYBACK_MAX fetches
      // to avoid timeout (remaining pages will use slug fallback)
      if (page.viaWayback && waybackCount >= WAYBACK_MAX) {
        results.push({url, text: page.text});
        // Drain remaining queue using slug fallback only
        while (queue.length > 0 && results.length < pageLimit) {
          const {url: u2, meta: m2} = queue.shift();
          if (visited.has(u2)) continue;
          visited.add(u2);
          const synth = [m2 && m2.title, m2 && m2.description].filter(Boolean).join("\n").trim();
          if (synth.length >= 10) results.push({url: u2, text: "[Sitemap entry] " + synth});
        }
        break;
      }
      results.push({url, text: page.text});

      // Only BFS-discover more pages if the sitemap didn't already give us a flat list
      if (depth < CRAWL_MAX_DEPTH && !hasSitemap) {
        for (const link of page.links) {
          if (!visited.has(link) && results.length + queue.length < CRAWL_MAX_PAGES * 2) {
            queue.push({url: link, depth: depth + 1, meta: {}});
          }
        }
      }
    } else if (meta && (meta.title || meta.description)) {
      // Page fetch failed entirely (network error, hard block) but we have slug/sitemap metadata -
      // synthesize a minimal text entry so the page isn't silently dropped.
      const synth = [meta.title, meta.description, meta.keywords]
        .filter(Boolean).join("\n").trim();
      if (synth.length >= 10) {
        results.push({url, text: "[Sitemap entry] " + synth});
      }
    }
  }

  if (results.length === 0) throw new Error("No readable pages crawled from URL");
  return results;
}

/**
 * Back-compat shim: old single-page fetch.
 * Retained because some callers may still use it.
 */
async function fetchUrlText(url) {
  const pages = await crawlSite(url);
  return pages.map((p) => `## ${p.url}\n${p.text}`).join("\n\n---\n\n");
}

// â"€â"€ Internal helper: scrape URL â†' chunk â†' embed â†' store â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function _processUrl(uid, assistantId, url) {
  // 1. Crawl the whole site (sitemap + BFS fallback), capped.
  const pages = await crawlSite(url);
  logger.info(`[KB] Crawled ${pages.length} pages from ${url}`);

  // 2. For each page, chunk its text and collect all chunks with their source page URL.
  const allChunks = [];           // {content, sourceUrl, chunkIndexOnPage}
  for (const page of pages) {
    const pageText = `${page.url}\n\n${page.text}`; // prepend URL so chunks have context
    const pageChunks = chunkText(pageText);
    for (let i = 0; i < pageChunks.length; i++) {
      allChunks.push({content: pageChunks[i], sourceUrl: page.url, chunkIndexOnPage: i});
    }
  }
  if (allChunks.length === 0) throw new Error("No text chunks extracted from crawled pages");

  // 3. Embed in batches of 50.
  const allEmbeddings = [];
  for (let i = 0; i < allChunks.length; i += 50) {
    const slice = allChunks.slice(i, i + 50).map((c) => c.content);
    const embeddings = await embedTexts(slice);
    allEmbeddings.push(...embeddings);
  }

  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  // 4. Delete any existing chunks that came from any page under this site root.
  //    Each chunk (~6 KB embedding + text) means ~500 deletes still stays
  //    under Firestore's 10 MB/txn limit, but we chunk at 400 for safety.
  const existingByRoot = await db.collection("knowledge_chunks")
    .where("assistantId", "==", assistantId)
    .where("sourceRoot", "==", url)
    .get();
  const existingLegacy = await db.collection("knowledge_chunks")
    .where("assistantId", "==", assistantId)
    .where("sourceFile", "==", url)
    .get();
  const toDelete = [];
  const seenIds = new Set();
  [existingByRoot, existingLegacy].forEach((snap) => snap.forEach((doc) => {
    if (!seenIds.has(doc.id)) { seenIds.add(doc.id); toDelete.push(doc.ref); }
  }));
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    toDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  // 5. Batch-write new chunks. Firestore caps each batch at 10 MB. Each
  //    doc is ~6 KB embedding + up to ~2 KB text = ~8 KB; 100 docs/batch
  //    gives ~800 KB per commit â€" safe margin even for very long chunks.
  const WRITE_BATCH_SIZE = 20;
  for (let i = 0; i < allChunks.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    const slice = allChunks.slice(i, i + WRITE_BATCH_SIZE);
    slice.forEach((c, j) => {
      const globalIdx = i + j;
      const docRef = db.collection("knowledge_chunks").doc();
      batch.set(docRef, {
        assistantId,
        ownerId: uid,
        content: c.content,
        embedding: allEmbeddings[globalIdx],
        sourceFile: c.sourceUrl,
        sourceRoot: url,
        sourceType: "url",
        storagePath: null,
        chunkIndex: globalIdx,
        chunkIndexOnPage: c.chunkIndexOnPage,
        syncedAt: now,
        createdAt: now,
      });
    });
    await batch.commit();
  }

  return {
    chunksCreated: allChunks.length,
    pagesCrawled: pages.length,
    url,
  };
}

// â"€â"€ Add a URL as a knowledge source â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Crawling + embedding a whole site can take up to a minute and several
// hundred MB, so we override the default 60s / 256Mi Function limits.

const URL_FN_OPTS = {...corsOptions, timeoutSeconds: 540, memory: "1GiB"};

exports.knowledgeProcessUrl = onRequest({...URL_FN_OPTS, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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
    logger.info(`Processed URL ${url} â†' ${result.chunksCreated} chunks for assistant ${assistantId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error("knowledgeProcessUrl failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process URL"});
  }
});

// â"€â"€ Re-sync an existing URL source â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeSync = onRequest({...URL_FN_OPTS, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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
    logger.info(`Synced URL ${url} â†' ${result.chunksCreated} chunks for assistant ${assistantId}`);
    res.status(200).json(result);
  } catch (error) {
    logger.error("knowledgeSync failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to sync URL"});
  }
});

// â"€â"€ Add plain text as a knowledge source â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

exports.knowledgeProcessText = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
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

    // Write new chunks with embeddings. Firestore has a 10 MB per-txn cap;
    // chunking at 100 docs/batch keeps us well under it.
    const now = FieldValue.serverTimestamp();
    const WRITE_BATCH_SIZE = 20;
    for (let i = 0; i < chunks.length; i += WRITE_BATCH_SIZE) {
      const batch = db.batch();
      const slice = chunks.slice(i, i + WRITE_BATCH_SIZE);
      slice.forEach((content, j) => {
        const globalIdx = i + j;
        const docRef = db.collection("knowledge_chunks").doc();
        batch.set(docRef, {
          assistantId,
          ownerId: uid,
          content,
          embedding: allEmbeddings[globalIdx],
          sourceFile: sourceTitle,
          sourceType: "text",
          storagePath: null,
          chunkIndex: globalIdx,
          createdAt: now,
        });
      });
      await batch.commit();
    }

    logger.info(`ProcessText "${sourceTitle}" â†' ${chunks.length} chunks for assistant ${assistantId}`);
    res.status(200).json({chunksCreated: chunks.length, title: sourceTitle});
  } catch (error) {
    logger.error("knowledgeProcessText failed", error);
    res.status(500).json({status: "error", message: error.message || "Failed to process text"});
  }
});

module.exports.getKnowledgeContext = getKnowledgeContext;
