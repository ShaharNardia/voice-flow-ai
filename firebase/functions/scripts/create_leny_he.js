/**
 * create_leny_he.js — Hebrew "Leny" assistant for LanceloTech
 *
 * Steps:
 *  1. Fetch https://lancelotech.com/ content (+ sub-pages)
 *  2. Create Company document in Firestore with LanceloTech data
 *  3. Create assistant document "Leny" (he-IL) linked to that Company
 *  4. Place test call to +972508908099 via deployed placeCall function
 *  5. Poll call_sessions until call completes (up to 5 min)
 *  6. Print full Hebrew transcript + quality analysis
 *
 * Usage:
 *   cd firebase/functions
 *   node scripts/create_leny_he.js
 *
 * Re-run to update existing assistant (pass existing IDs as args):
 *   node scripts/create_leny_he.js <companyId> <assistantId>
 */

"use strict";

const https = require("https");
const { execSync } = require("child_process");
const path = require("path");

// ─── Auth Token ─────────────────────────────────────────────────────────────

// Use gcloud user token (project owner, bypasses security rules via IAM)
// Falls back to GOOGLE_APPLICATION_CREDENTIALS service account token
let AUTH_TOKEN = "";

function getAccessToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  try {
    // Try gcloud user token first (project owner)
    const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
    AUTH_TOKEN = token;
    return token;
  } catch {
    try {
      // Fall back to service account
      const token = execSync("gcloud auth application-default print-access-token", { encoding: "utf8" }).trim();
      AUTH_TOKEN = token;
      return token;
    } catch (e) {
      console.error("❌ Cannot get access token. Run: gcloud auth login");
      process.exit(1);
    }
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_ID = "voiceflow-ai-202509231639";
const REGION = "us-central1";
const FUNCTIONS_BASE = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

const TO_NUMBER = "+972508908099";
const FROM_NUMBER = "+17312525841"; // TWILIO_DEFAULT_FROM

const LANCELOTECH_URLS = [
  "https://lancelotech.com/",
  "https://lancelotech.com/about",
  "https://lancelotech.com/services",
  "https://lancelotech.com/contact",
];

// ─── Web Fetch Helper ────────────────────────────────────────────────────────

/**
 * Fetch a URL and return the raw HTML as a string. Follows redirects (up to 3).
 * Returns null on error (e.g. 404).
 */
function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 3) {
      resolve(null);
      return;
    }
    const urlObj = new URL(url);
    const lib = urlObj.protocol === "https:" ? https : require("http");
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VoiceFlowBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "he,en;q=0.9",
      },
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
        resolve(fetchUrl(redirectUrl, redirectCount + 1));
        return;
      }
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Extract visible text from HTML (minimal parser — no cheerio needed).
 * Strips scripts, styles, nav, header, footer, then collapses whitespace.
 */
function extractText(html) {
  if (!html) return "";

  // Remove script / style / nav / footer / header blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    // Replace block tags with newline
    .replace(/<\/?(p|div|section|article|h[1-6]|li|br|tr)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Limit to ~3000 chars to fit comfortably in the system prompt
  if (text.length > 3000) {
    text = text.substring(0, 3000) + "...";
  }
  return text;
}

/**
 * Fetch and extract content from lancelotech.com pages.
 * Returns a combined string of all available content.
 */
async function fetchLanceloTechContent() {
  console.log("\n📄 Fetching lancelotech.com content...");
  const sections = [];

  for (const url of LANCELOTECH_URLS) {
    process.stdout.write(`   Fetching ${url} ... `);
    const html = await fetchUrl(url);
    if (!html) {
      console.log("⏭  (skipped — not available)");
      continue;
    }
    const text = extractText(html);
    if (text.length < 100) {
      console.log("⏭  (too short — skipped)");
      continue;
    }
    console.log(`✅ (${text.length} chars)`);
    sections.push(`=== ${url} ===\n${text}`);
  }

  if (sections.length === 0) {
    console.log("   ⚠️  No content fetched — will use static fallback description.");
    return `LanceloTech היא חברת טכנולוגיה ישראלית המתמחה בפיתוח פתרונות דיגיטליים חדשניים לעסקים. החברה מציעה שירותי פיתוח תוכנה, יעוץ טכנולוגי, ופתרונות AI מתקדמים. לפרטים נוספים בקרו באתר https://lancelotech.com`;
  }

  return sections.join("\n\n");
}

// ─── Firestore REST API helpers ──────────────────────────────────────────────

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Convert a plain JS object to Firestore REST API field format.
 */
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreDocument(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

/**
 * Write a document to Firestore using REST API.
 * Uses PATCH with updateMask to create-or-merge.
 */
function firestoreSet(collection, docId, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(toFirestoreDocument(data));
    const token = getAccessToken();
    // Each field needs its own updateMask.fieldPaths= query param
    const maskParams = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    const urlPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?${maskParams}`;

    const options = {
      hostname: "firestore.googleapis.com",
      path: urlPath,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${token}`,
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let respData = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { respData += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(respData));
        } else {
          reject(new Error(`Firestore PATCH ${collection}/${docId} → ${res.statusCode}: ${respData}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Firestore request timed out")); });
    req.write(body);
    req.end();
  });
}

/**
 * Generate a random Firestore-like document ID.
 */
function newDocId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ─── Firestore Setup ─────────────────────────────────────────────────────────

/**
 * Create (or update) Company document with LanceloTech config.
 */
async function setupCompany(existingCompanyId, lanceloContent) {
  const companyId = existingCompanyId || newDocId();
  const isNew = !existingCompanyId;
  console.log(isNew ? `   ✨ Creating new Company: ${companyId}` : `   📝 Updating Company: ${companyId}`);

  // The additionalInsturctions (typo matches production code) contains:
  // 1. Leny persona/style guidelines
  // 2. LanceloTech website content (for RAG-like context)
  const additionalInsturctions = [
    "אני לני, נציגת הדיגיטל של LanceloTech. אני כאן לעזור למבקרים להבין את השירותים שלנו ולחבר אותם עם הצוות הנכון.",
    "",
    "כיצד להתנהל:",
    "- תמיד תקשיב קודם — לא לפרסם",
    "- שאלי שאלה אחת ברורה בכל פעם",
    "- תשובה ישירה, משפט-שניים מקסימום",
    "- אם שאלו על מחיר — תאמי שיחה עם נציג",
    "- אם לא יודעת — אמרי בכנות ותציעי לחבר עם נציג",
    "",
    "סגנון שיחה:",
    "- עברית ישראלית מדוברת — לא ספרותית, לא תרגום מאנגלית",
    "- חמה ומקצועית",
    "- לא מקריאה רשימות — נקודה אחת בכל פעם",
    "",
    "מידע על LanceloTech מהאתר:",
    lanceloContent,
  ].join("\n");

  const now = new Date().toISOString();
  const companyData = {
    name: "LanceloTech",
    assistantname: "לני",
    industry: "פתרונות טכנולוגיים",
    companyLink: "https://lancelotech.com",
    timeZone: "Asia/Jerusalem",
    language: "he-IL",
    provider: "deepgram",
    modelname: "nova-2",
    agent: "google",
    voice: "Google.he-IL-Neural2-A",
    inboundmessage: "שלום! זה לני מ-LanceloTech. במה אוכל לעזור לך היום?",
    outboundmessage: "שלום! זה לני מ-LanceloTech. יש לך רגע?",
    additionalInsturctions,
    offerFreeEstimation: false,
    createJobPermission: false,
    reshedulePermission: false,
    cancelPermission: false,
    priceRestriction: true,
    legalRestriction: true,
    medicalRestriction: false,
    aiHandleInbound: true,
    outboundCallHandling: true,
    isTwentyFourBySeven: true,
    telephonyProvider: "twilio",
    updatedAt: now,
    ...(isNew ? { createdAt: now } : {}),
  };

  await firestoreSet("Company", companyId, companyData);
  console.log(`   ✅ Company saved: ${companyId}`);
  return companyId;
}

/**
 * Create (or update) the Hebrew Leny assistant in Firestore.
 */
async function setupAssistant(existingAssistantId, companyId) {
  const assistantId = existingAssistantId || newDocId();
  const isNew = !existingAssistantId;
  console.log(isNew ? `   ✨ Creating new assistant: ${assistantId}` : `   📝 Updating assistant: ${assistantId}`);

  const now = new Date().toISOString();
  const definition = {
    name: "Leny",
    assistantName: "לני",
    companyName: "LanceloTech",
    language: "he-IL",
    voice: "Google.he-IL-Neural2-A",
    firstMessage: "שלום! אני לני מ-LanceloTech. במה אוכל לעזור לך היום?",
    companyId,
    companyPhone: FROM_NUMBER,
  };

  const record = {
    id: assistantId,
    name: "Leny",
    firstMessage: "שלום! אני לני מ-LanceloTech. במה אוכל לעזור לך היום?",
    language: "he-IL",
    definition,
    companyId,
    ownerId: "",
    updatedAt: now,
    ...(isNew ? { createdAt: now } : {}),
  };

  await firestoreSet("assistants", assistantId, record);
  console.log(`   ✅ Assistant saved: ${assistantId}`);
  return assistantId;
}

// ─── Place Call ──────────────────────────────────────────────────────────────

/**
 * Call the deployed placeCall Firebase function.
 * Returns the callSessionId.
 */
function placeCallHttp(assistantId, companyId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      number: TO_NUMBER,
      companyPhone: FROM_NUMBER,
      assistantId,
      companyId,
      assistant: {
        name: "Leny",
        assistantName: "לני",
        companyName: "LanceloTech",
        language: "he-IL",
        voice: "Google.he-IL-Neural2-A",
        firstMessage: "שלום! אני לני מ-LanceloTech. במה אוכל לעזור לך היום?",
        companyId,
      },
      metadata: {
        source: "create_leny_he_script",
        purpose: "quality_test",
      },
    });

    const url = new URL(`${FUNCTIONS_BASE}/placeCall`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          reject(new Error(`placeCall returned ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.callSessionId || parsed.sessionId || null);
        } catch (e) {
          reject(new Error(`Failed to parse placeCall response: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("placeCall HTTP request timed out after 30s"));
    });
    req.write(payload);
    req.end();
  });
}

// ─── Poll Call Session ───────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_TIME_MS = 6 * 60 * 1000; // 6 minutes

/**
 * Fetch a Firestore document via REST API.
 * Returns plain JS object or null if not found.
 */
function firestoreGet(collection, docId) {
  return new Promise((resolve) => {
    const token = getAccessToken();
    const urlPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
    const options = {
      hostname: "firestore.googleapis.com",
      path: urlPath,
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode === 404) { resolve(null); return; }
        try {
          const doc = JSON.parse(data);
          if (!doc.fields) { resolve(null); return; }
          resolve(fromFirestoreDocument(doc));
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Convert Firestore REST document fields to plain JS object.
 */
function fromFirestoreDocument(doc) {
  if (!doc || !doc.fields) return {};
  return fromFirestoreFields(doc.fields);
}

function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

function fromFirestoreValue(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}

/**
 * Poll call_sessions/{id} until status is terminal.
 * Returns the final session data.
 */
async function pollCallSession(sessionId) {
  const start = Date.now();
  const terminalStatuses = new Set(["completed", "failed", "canceled", "no-answer", "busy", "error"]);

  let lastStatus = "";
  let dots = 0;

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    await sleep(POLL_INTERVAL_MS);
    const data = await firestoreGet("call_sessions", sessionId);
    if (!data) {
      console.log("   ⚠️  Session doc not found yet, waiting...");
      continue;
    }
    const status = data.status || "unknown";

    if (status !== lastStatus) {
      console.log(`\n   📞 Call status: ${status}`);
      lastStatus = status;
    } else {
      process.stdout.write(".");
      dots++;
      if (dots % 20 === 0) process.stdout.write("\n   ");
    }

    if (terminalStatuses.has(status)) {
      console.log(`\n   ✅ Call ended with status: ${status}`);
      return data;
    }
  }

  console.log("\n   ⏰ Polling timeout — fetching final state");
  return await firestoreGet("call_sessions", sessionId);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Quality Analysis ────────────────────────────────────────────────────────

/**
 * Print a quality assessment based on call session data.
 */
function analyzeCallQuality(sessionData) {
  if (!sessionData) {
    console.log("\n❌ No session data to analyze.");
    return;
  }

  const history = sessionData.conversationHistory || [];
  const status = sessionData.status || "unknown";
  const duration = sessionData.duration || sessionData.callDuration || "N/A";

  console.log("\n" + "═".repeat(60));
  console.log("📊  CALL QUALITY ASSESSMENT");
  console.log("═".repeat(60));
  console.log(`\n📞 Call Status : ${status}`);
  console.log(`⏱  Duration   : ${duration}s`);
  console.log(`💬 Turns      : ${history.length}`);

  if (history.length === 0) {
    console.log("\n⚠️  No conversation history found.");
    console.log("   Possible causes:");
    console.log("   - Call was not answered");
    console.log("   - Media stream (Cloud Run) did not receive audio");
    console.log("   - Twilio Gather was used instead of Media Streams");
    return;
  }

  // Print full transcript
  console.log("\n─── TRANSCRIPT ───────────────────────────────────────");
  for (const turn of history) {
    const role = turn.role === "assistant" ? "🤖 Leny " : "👤 User  ";
    const text = turn.content || "";
    console.log(`${role}: ${text}`);
  }
  console.log("──────────────────────────────────────────────────────");

  // Quality checks
  console.log("\n─── QUALITY CHECKLIST ────────────────────────────────");

  const assistantTurns = history.filter((t) => t.role === "assistant");
  const userTurns = history.filter((t) => t.role === "user");

  // 1. Hebrew in responses?
  const hebrewRegex = /[\u0590-\u05FF]/;
  const allHebrew = assistantTurns.every((t) => hebrewRegex.test(t.content || ""));
  console.log(`${allHebrew ? "✅" : "❌"} Hebrew responses: ${allHebrew ? "All responses in Hebrew" : "Some responses not in Hebrew!"}`);

  // 2. Response length (concise)?
  const avgWords = assistantTurns.length > 0
    ? assistantTurns.reduce((acc, t) => acc + (t.content || "").split(/\s+/).length, 0) / assistantTurns.length
    : 0;
  const concise = avgWords <= 20;
  console.log(`${concise ? "✅" : "⚠️ "} Conciseness   : avg ${Math.round(avgWords)} words/response (target ≤20)`);

  // 3. Robotic phrases check
  const roboticPhrases = ["אני שמח לעמוד לרשותך", "כיצד אוכל לסייע", "האם תרצה", "בהחלט אשמח", "אני שמחה לעזור"];
  const roboticFound = assistantTurns.filter((t) =>
    roboticPhrases.some((p) => (t.content || "").includes(p))
  );
  console.log(`${roboticFound.length === 0 ? "✅" : "❌"} Natural Hebrew: ${roboticFound.length === 0 ? "No robotic phrases" : `Robotic phrases found: ${roboticFound.map((t) => t.content).join(" | ")}`}`);

  // 4. STT accuracy (user turns not empty/garbled)?
  const nonEmptyUser = userTurns.filter((t) => (t.content || "").trim().length > 3);
  const sttOk = userTurns.length === 0 || nonEmptyUser.length > 0;
  console.log(`${sttOk ? "✅" : "⚠️ "} STT accuracy  : ${userTurns.length} user turns, ${nonEmptyUser.length} non-empty`);

  // 5. Greeting correct?
  const firstAssistant = assistantTurns[0];
  const greetingOk = firstAssistant && firstAssistant.content && firstAssistant.content.includes("לני");
  console.log(`${greetingOk ? "✅" : "❌"} Greeting      : ${firstAssistant?.content || "(none)"}`);

  // 6. LanceloTech mentioned?
  const lanceloMentioned = assistantTurns.some((t) => (t.content || "").toLowerCase().includes("lancelotech") || (t.content || "").includes("לנסלו"));
  console.log(`${lanceloMentioned ? "✅" : "⚠️ "} Brand mention : LanceloTech ${lanceloMentioned ? "mentioned" : "not explicitly mentioned (may be fine)"}`);

  console.log("\n─── RECOMMENDATIONS ──────────────────────────────────");

  if (!allHebrew) {
    console.log("❌ FIX: Some responses not in Hebrew. Check system prompt language setting.");
  }
  if (!concise) {
    console.log("⚠️  FIX: Responses too long. Add 'משפט אחד, שניים מקסימום' to systemPrompt.");
  }
  if (roboticFound.length > 0) {
    console.log("❌ FIX: Robotic phrases detected. The Hebrew prompt style examples need reinforcement.");
  }
  if (userTurns.length === 0 && history.length > 1) {
    console.log("⚠️  NOTE: No user turns recorded. Media stream may not be streaming audio correctly.");
  }
  if (allHebrew && concise && roboticFound.length === 0 && sttOk) {
    console.log("🎉 All checks passed! Hebrew quality looks excellent.");
  }

  console.log("═".repeat(60));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const existingCompanyId = process.argv[2] || null;
  const existingAssistantId = process.argv[3] || null;

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Hebrew Leny Assistant — LanceloTech Setup + Test   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n📡 Target call: ${TO_NUMBER}`);
  console.log(`📞 From       : ${FROM_NUMBER}`);
  console.log(`🌐 Functions  : ${FUNCTIONS_BASE}`);

  // ── Step 1: Fetch lancelotech.com content ──────────────────────────────
  console.log("\n━━ STEP 1: Fetch lancelotech.com ━━━━━━━━━━━━━━━━━━━━━");
  const lanceloContent = await fetchLanceloTechContent();
  console.log(`   Total content: ${lanceloContent.length} chars`);

  // ── Step 2: Create/update Company ─────────────────────────────────────
  console.log("\n━━ STEP 2: Setup Company document ━━━━━━━━━━━━━━━━━━━━");
  const companyId = await setupCompany(existingCompanyId, lanceloContent);

  // ── Step 3: Create/update Assistant ───────────────────────────────────
  console.log("\n━━ STEP 3: Setup Assistant document ━━━━━━━━━━━━━━━━━━");
  const assistantId = await setupAssistant(existingAssistantId, companyId);

  console.log(`\n   🆔 Company ID   : ${companyId}`);
  console.log(`   🆔 Assistant ID : ${assistantId}`);
  console.log(`\n   💡 Re-run with these IDs to update instead of recreate:`);
  console.log(`   node scripts/create_leny_he.js ${companyId} ${assistantId}`);

  // ── Step 4: Place test call ────────────────────────────────────────────
  console.log("\n━━ STEP 4: Place test call ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   📞 Calling ${TO_NUMBER}...`);

  let callSessionId;
  try {
    callSessionId = await placeCallHttp(assistantId, companyId);
    if (!callSessionId) {
      throw new Error("placeCall returned no callSessionId");
    }
    console.log(`   ✅ Call initiated! Session: ${callSessionId}`);
  } catch (err) {
    console.error("   ❌ Failed to place call:", err.message);
    console.log("\n   💡 You can still test manually:");
    console.log(`   POST ${FUNCTIONS_BASE}/placeCall`);
    console.log(`   { "number": "${TO_NUMBER}", "companyPhone": "${FROM_NUMBER}", "assistantId": "${assistantId}", "companyId": "${companyId}" }`);
    process.exit(1);
  }

  // ── Step 5: Poll until complete ────────────────────────────────────────
  console.log("\n━━ STEP 5: Waiting for call to complete ━━━━━━━━━━━━━━");
  console.log(`   📡 Polling call_sessions/${callSessionId}`);
  console.log(`   (Up to 6 minutes — answer the call at ${TO_NUMBER}!)\n`);

  const sessionData = await pollCallSession(callSessionId);

  // ── Step 6: Quality analysis ───────────────────────────────────────────
  console.log("\n━━ STEP 6: Quality Analysis ━━━━━━━━━━━━━━━━━━━━━━━━━━");
  analyzeCallQuality(sessionData);

  console.log("\n✅ Done!");
  console.log(`\n📋 Summary:`);
  console.log(`   Company ID   : ${companyId}`);
  console.log(`   Assistant ID : ${assistantId}`);
  console.log(`   Session ID   : ${callSessionId}`);
  console.log(`\n   Firestore links:`);
  console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/Company/${companyId}`);
  console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/assistants/${assistantId}`);
  console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/call_sessions/${callSessionId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Fatal error:", err);
    process.exit(1);
  });
