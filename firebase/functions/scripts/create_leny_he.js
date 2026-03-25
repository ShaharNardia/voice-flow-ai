/**
 * create_leny_he.js — Ensure the Hebrew "Leny" assistant exists in Firestore
 * and place a test outbound call with it.
 *
 * Usage:
 *   node create_leny_he.js [phone_number]
 *
 * Examples:
 *   node create_leny_he.js                   # calls default +972508908099
 *   node create_leny_he.js +972501234567     # calls custom number
 *   node create_leny_he.js --setup-only      # only creates/patches assistant, no call
 */
"use strict";

require("dotenv").config({path: require("path").join(__dirname, "../.env")});
const https = require("https");
const {execSync} = require("child_process");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM        = process.env.TWILIO_DEFAULT_FROM;
const PROJECT_ID         = "voiceflow-ai-202509231639";
const BASE_URL           = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

const args = process.argv.slice(2);
const SETUP_ONLY = args.includes("--setup-only");
const TEST_PHONE = args.find((a) => a.startsWith("+")) || "+972508908099";

// ── HTTP helper ─────────────────────────────────────────────────────────────

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({status: res.statusCode, data: JSON.parse(data)}); }
        catch { resolve({status: res.statusCode, data}); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── gcloud auth ─────────────────────────────────────────────────────────────

async function getGcloudToken() {
  try {
    return execSync("gcloud auth print-access-token", {timeout: 10000}).toString().trim();
  } catch {
    return null;
  }
}

// ── Firestore REST helpers ───────────────────────────────────────────────────

function toFirestoreValue(v) {
  if (v === null || v === undefined) return {nullValue: null};
  if (typeof v === "boolean") return {booleanValue: v};
  if (typeof v === "number")
    return Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v};
  if (typeof v === "string") return {stringValue: v};
  if (Array.isArray(v)) return {arrayValue: {values: v.map(toFirestoreValue)}};
  if (typeof v === "object") {
    const mapFields = {};
    for (const [k, val] of Object.entries(v)) mapFields[k] = toFirestoreValue(val);
    return {mapValue: {fields: mapFields}};
  }
  return {stringValue: String(v)};
}

function parseFirestoreField(v) {
  if (!v) return null;
  if ("stringValue"  in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue"  in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue"    in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue"   in v) return (v.arrayValue.values || []).map(parseFirestoreField);
  if ("mapValue"     in v) {
    const obj = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) obj[k] = parseFirestoreField(fv);
    return obj;
  }
  return JSON.stringify(v);
}

function parseFirestoreDoc(docResp) {
  if (!docResp?.data?.fields) return null;
  const obj = {};
  for (const [k, v] of Object.entries(docResp.data.fields)) obj[k] = parseFirestoreField(v);
  return obj;
}

async function writeFirestore(token, collectionPath, docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`;
  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "createdAt" || k === "updatedAt") {
      firestoreFields[k] = {timestampValue: new Date().toISOString()};
    } else {
      firestoreFields[k] = toFirestoreValue(v);
    }
  }
  const body = JSON.stringify({fields: firestoreFields});
  const urlObj = new URL(url);
  return httpRequest({
    hostname: urlObj.hostname,
    path:
      urlObj.pathname +
      "?updateMask.fieldPaths=" +
      Object.keys(fields).map(encodeURIComponent).join("&updateMask.fieldPaths="),
    method: "PATCH",
    headers: {
      Authorization:   `Bearer ${token}`,
      "Content-Type":  "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);
}

async function readFirestore(token, collectionPath, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`;
  const urlObj = new URL(url);
  return httpRequest({
    hostname: urlObj.hostname,
    path:     urlObj.pathname,
    method:   "GET",
    headers:  {Authorization: `Bearer ${token}`},
  });
}

async function runQuery(token, collectionId, fieldPath, op, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = JSON.stringify({
    structuredQuery: {
      from: [{collectionId}],
      where: {fieldFilter: {field: {fieldPath}, op, value: {stringValue: value}}},
      limit: 1,
    },
  });
  const urlObj = new URL(url);
  const resp = await httpRequest({
    hostname: urlObj.hostname,
    path:     urlObj.pathname,
    method:   "POST",
    headers:  {
      Authorization:   `Bearer ${token}`,
      "Content-Type":  "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  if (Array.isArray(resp.data) && resp.data[0]?.document) {
    const doc = resp.data[0].document;
    const id  = doc.name.split("/").pop();
    const fields = {};
    for (const [k, v] of Object.entries(doc.fields || {})) fields[k] = parseFirestoreField(v);
    return {id, ...fields};
  }
  return null;
}

// ── Leny assistant definition ─────────────────────────────────────────────

const LENY_DEFINITION = {
  name:          "Leny",
  assistantName: "Leny",
  language:      "he-IL",
  voice:         "Google.he-IL-Wavenet-A", // Google WaveNet Hebrew female voice (Twilio TTS)
  firstMessage:  "שלום! אני לני, עוזרת AI. איך אני יכולה לעזור לך?",
  systemPrompt:
    "אתה עוזר AI ידידותי בשם לני. אתה עונה בעברית בצורה טבעית וחמה. " +
    "אתה מסייע ללקוחות בשאלות ובקשות שלהם. תשובותיך קצרות וממוקדות.",
  endCallMessage: "תודה על השיחה! ביי!",
  model:          "gpt-4o-mini",
  feedbackCallEnabled: true,
  active:         true,
  createdAt:      "SERVER_TS",
  updatedAt:      "SERVER_TS",
};

// ── Ensure Leny exists ────────────────────────────────────────────────────

async function ensureLenyAssistant(token) {
  console.log("🔍 Looking for existing Hebrew Leny assistant...");

  // Search by name + language
  let leny = await runQuery(token, "assistants", "name", "EQUAL", "Leny");
  if (!leny) {
    leny = await runQuery(token, "assistants", "language", "EQUAL", "he-IL");
  }

  if (leny) {
    console.log(`✅ Found existing assistant: ${leny.id}`);
    console.log(`   name: ${leny.name || "(missing)"}  assistantName: ${leny.assistantName || "(missing)"}`);
    console.log(`   language: ${leny.language}  voice: ${leny.voice || "(default)"}`);

    // Patch missing fields
    const patches = {};
    if (!leny.name)          patches.name          = "Leny";
    if (!leny.assistantName) patches.assistantName = "Leny";
    if (!leny.firstMessage)  patches.firstMessage  = LENY_DEFINITION.firstMessage;
    if (!leny.systemPrompt)  patches.systemPrompt  = LENY_DEFINITION.systemPrompt;
    if (!leny.voice)         patches.voice         = LENY_DEFINITION.voice;

    if (Object.keys(patches).length > 0) {
      console.log(`🔧 Patching ${Object.keys(patches).join(", ")} on assistant ${leny.id}...`);
      const patchResp = await writeFirestore(token, "assistants", leny.id, patches);
      if (patchResp.status >= 300) {
        console.warn(`⚠️  Patch returned ${patchResp.status}:`, JSON.stringify(patchResp.data).slice(0, 200));
      } else {
        console.log("✅ Patch applied");
        Object.assign(leny, patches);
      }
    }

    return leny;
  }

  // Create new Leny assistant
  console.log("➕ No Hebrew assistant found — creating Leny...");
  const newId = "leny-he-" + randomId();
  const def   = {...LENY_DEFINITION};
  delete def.createdAt;
  delete def.updatedAt;

  const writeResp = await writeFirestore(token, "assistants", newId, def);
  if (writeResp.status >= 300) {
    console.error("❌ Failed to create assistant:", writeResp.status, JSON.stringify(writeResp.data).slice(0, 300));
    process.exit(1);
  }

  console.log(`✅ Created assistant: assistants/${newId}`);
  return {id: newId, ...def};
}

// ── Twilio outbound call ──────────────────────────────────────────────────

async function placeTwilioCall(to, sessionId) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_DEFAULT_FROM not set in .env");
  }
  const twilio = require("twilio");
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const call = await client.calls.create({
    to,
    from: TWILIO_FROM,
    url:  `${BASE_URL}/twilioVoiceWebhook?callSessionId=${sessionId}`,
    statusCallback:      `${BASE_URL}/twilioStatusCallback?callSessionId=${sessionId}`,
    statusCallbackMethod: "POST",
    statusCallbackEvent:  ["initiated", "ringing", "answered", "completed"],
  });
  return call.sid;
}

// ── Poll session ──────────────────────────────────────────────────────────

async function pollSession(token, sessionId, maxMs = 120000) {
  const start   = Date.now();
  let lastStatus = "";
  console.log("\n⏳ Polling call session...\n");

  while (Date.now() - start < maxMs) {
    const resp = await readFirestore(token, "call_sessions", sessionId);
    const doc  = parseFirestoreDoc(resp);
    if (doc) {
      const status = doc.status || "unknown";
      if (status !== lastStatus) {
        lastStatus = status;
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[+${elapsed}s] status: ${status}`);
        if (Array.isArray(doc.conversationHistory) && doc.conversationHistory.length) {
          doc.conversationHistory.slice(-3).forEach((t) => {
            const icon = t.role === "assistant" ? "🤖" : "👤";
            console.log(`   ${icon} ${String(t.content || "").slice(0, 120)}`);
          });
        }
      }
      if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
        console.log(`\n✅ Call finished: ${status}`);
        if (doc.analysis) {
          console.log(`📊 Outcome: ${doc.analysis.outcome}`);
          if (doc.analysis.summary) console.log(`   Summary: ${doc.analysis.summary}`);
        }
        return doc;
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.log("⏰ Polling timeout reached");
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("VoiceFlow AI — Hebrew Leny Assistant Setup & Test Call");
  console.log("=".repeat(60));

  // Auth
  const token = await getGcloudToken();
  if (!token) {
    console.error("❌ No gcloud token. Run: gcloud auth login");
    process.exit(1);
  }
  console.log("✅ gcloud token obtained\n");

  // Ensure assistant
  const assistant = await ensureLenyAssistant(token);
  console.log(`\n🤖 Assistant ready: ${assistant.name || assistant.id}`);
  console.log(`   ID: ${assistant.id}`);
  console.log(`   Language: ${assistant.language}  Voice: ${assistant.voice || "default"}`);

  if (SETUP_ONLY) {
    console.log("\n🏁 --setup-only flag: skipping test call.");
    process.exit(0);
  }

  console.log(`\n📞 Placing test call to ${TEST_PHONE}...`);

  // Build session
  const sessionId = randomId();
  const sessionFields = {
    assistantId:        assistant.id,
    assistantDefinition: {
      id:            assistant.id,
      name:          assistant.name          || "Leny",
      assistantName: assistant.assistantName || "Leny",
      language:      assistant.language      || "he-IL",
      voice:         assistant.voice         || "Google.he-IL-Wavenet-A",
      firstMessage:  assistant.firstMessage  || LENY_DEFINITION.firstMessage,
      systemPrompt:  assistant.systemPrompt  || LENY_DEFINITION.systemPrompt,
      endCallMessage: assistant.endCallMessage || LENY_DEFINITION.endCallMessage,
      feedbackCallEnabled: true,
    },
    leadNumber:   TEST_PHONE,
    companyPhone: TWILIO_FROM,
    leadName:     "Test",
    status:       "initiated",
    feedbackEnabled: true,
  };

  const writeResp = await writeFirestore(token, "call_sessions", sessionId, sessionFields);
  if (writeResp.status >= 300) {
    console.error("❌ Failed to write session:", writeResp.status, JSON.stringify(writeResp.data).slice(0, 200));
    process.exit(1);
  }
  console.log(`📄 Session: call_sessions/${sessionId}`);

  const callSid = await placeTwilioCall(TEST_PHONE, sessionId);
  console.log(`✅ Call SID: ${callSid}`);

  await writeFirestore(token, "call_sessions", sessionId, {twilioSid: callSid, status: "dialing"});

  await pollSession(token, sessionId, 120000);

  console.log(`\n📋 Session doc: call_sessions/${sessionId}`);
  console.log("🔍 Cloud Run logs:");
  console.log("   gcloud run services logs read voiceflow-mediastream --region=us-central1 --limit=50");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
