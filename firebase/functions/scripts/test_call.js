/**
 * Test call script — places a real outbound call using Twilio directly.
 * Uses Firestore REST API (gcloud token) to create the session.
 */
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const https = require("https");
const { execSync } = require("child_process");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM        = process.env.TWILIO_DEFAULT_FROM;
const PROJECT_ID         = "voiceflow-ai-202509231639";
const BASE_URL           = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;
const TEST_PHONE         = process.argv[2] || "+972508908099";

// ── Helpers ────────────────────────────────────────────────────────────────

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
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

async function getGcloudToken() {
  try {
    const token = execSync("gcloud auth print-access-token", { timeout: 10000 }).toString().trim();
    return token;
  } catch {
    return null;
  }
}

// ── Firestore REST write ───────────────────────────────────────────────────

async function writeFirestore(token, collectionPath, docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`;

  // Convert plain object to Firestore REST API format
  function toFirestoreValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
    if (typeof v === "object") {
      const mapFields = {};
      for (const [k, val] of Object.entries(v)) mapFields[k] = toFirestoreValue(val);
      return { mapValue: { fields: mapFields } };
    }
    return { stringValue: String(v) };
  }

  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "createdAt" || k === "updatedAt") {
      firestoreFields[k] = { timestampValue: new Date().toISOString() };
    } else {
      firestoreFields[k] = toFirestoreValue(v);
    }
  }

  const body = JSON.stringify({ fields: firestoreFields });
  const urlObj = new URL(url);

  const resp = await httpRequest({
    hostname: urlObj.hostname,
    path: urlObj.pathname + "?updateMask.fieldPaths=" + Object.keys(fields).map(encodeURIComponent).join("&updateMask.fieldPaths="),
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  return resp;
}

// ── Firestore REST read ────────────────────────────────────────────────────

async function readFirestore(token, collectionPath, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`;
  const urlObj = new URL(url);
  const resp = await httpRequest({
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` },
  });
  return resp;
}

function parseFirestoreField(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(parseFirestoreField);
  if ("mapValue" in v) {
    const obj = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) obj[k] = parseFirestoreField(fv);
    return obj;
  }
  return JSON.stringify(v);
}

function parseFirestoreDoc(docResp) {
  if (!docResp.data?.fields) return null;
  const obj = {};
  for (const [k, v] of Object.entries(docResp.data.fields)) obj[k] = parseFirestoreField(v);
  return obj;
}

// ── Query Firestore for Hebrew assistant ──────────────────────────────────

async function queryHebrewAssistant(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "assistants" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "language" },
          op: "EQUAL",
          value: { stringValue: "he-IL" },
        },
      },
      limit: 1,
    },
  });
  const urlObj = new URL(url);
  const resp = await httpRequest({
    hostname: urlObj.hostname,
    path: urlObj.pathname,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  if (Array.isArray(resp.data) && resp.data[0]?.document) {
    const doc = resp.data[0].document;
    const id = doc.name.split("/").pop();
    const fields = {};
    for (const [k, v] of Object.entries(doc.fields || {})) fields[k] = parseFirestoreField(v);
    return { id, ...fields };
  }
  return null;
}

// ── Twilio outbound call ───────────────────────────────────────────────────

async function placeTwilioCall(to, sessionId) {
  const twilio = require("twilio");
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const call = await client.calls.create({
    to,
    from: TWILIO_FROM,
    url: `${BASE_URL}/twilioVoiceWebhook?callSessionId=${sessionId}`,
    statusCallback: `${BASE_URL}/twilioStatusCallback?callSessionId=${sessionId}`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });
  return call.sid;
}

// ── Poll session via REST ──────────────────────────────────────────────────

async function pollSession(token, sessionId, maxMs = 120000) {
  const start = Date.now();
  let lastStatus = "";
  console.log("⏳ Polling call session...\n");

  while (Date.now() - start < maxMs) {
    const resp = await readFirestore(token, "call_sessions", sessionId);
    const doc = parseFirestoreDoc(resp);
    if (doc) {
      const status = doc.status || "unknown";
      if (status !== lastStatus) {
        lastStatus = status;
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[+${elapsed}s] status: ${status}`);
        if (Array.isArray(doc.conversationHistory) && doc.conversationHistory.length) {
          const turns = doc.conversationHistory.slice(-3);
          turns.forEach((t) => {
            const r = t.role === "assistant" ? "🤖" : "👤";
            console.log(`   ${r} ${String(t.content || "").slice(0, 100)}`);
          });
        }
      }
      if (["completed","failed","busy","no-answer","canceled"].includes(status)) {
        console.log(`\n✅ Call finished: ${status}`);
        if (doc.analysis) {
          console.log(`📊 Outcome: ${doc.analysis.outcome}`);
          if (doc.analysis.summary) console.log(`   Summary: ${doc.analysis.summary}`);
        }
        if (doc.feedback) {
          console.log(`⭐ Feedback rating: ${doc.feedback.rating || "pending"}`);
        }
        return doc;
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.log("⏰ Timeout");
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("VoiceFlow AI — Test Call");
  console.log("=".repeat(60));
  console.log(`Target: ${TEST_PHONE}`);

  const token = await getGcloudToken();
  if (!token) { console.error("❌ No gcloud token. Run: gcloud auth login"); process.exit(1); }
  console.log("✅ gcloud token obtained\n");

  // Find Hebrew assistant
  const assistant = await queryHebrewAssistant(token);
  if (!assistant) { console.error("❌ No Hebrew assistant found"); process.exit(1); }
  console.log(`🤖 Assistant: ${assistant.name || assistant.assistantName || assistant.id}`);
  console.log(`   Language: ${assistant.language}  Voice: ${assistant.voice || "default"}`);
  console.log(`   ID: ${assistant.id}\n`);

  // Create session
  const sessionId = randomId();
  const sessionData = {
    assistantId: assistant.id,
    assistantDefinition: { ...assistant, feedbackCallEnabled: true },
    leadNumber: TEST_PHONE,
    companyPhone: TWILIO_FROM,
    leadName: "Test",
    status: "initiated",
    createdAt: "SERVER_TS",
    updatedAt: "SERVER_TS",
  };
  // Remove SERVER_TS markers (handled by Firestore timestamp override above)
  delete sessionData.createdAt; delete sessionData.updatedAt;

  const sessionFields = {
    assistantId: assistant.id,
    leadNumber: TEST_PHONE,
    companyPhone: TWILIO_FROM,
    leadName: "Test",
    status: "initiated",
    feedbackEnabled: true,
  };
  // Copy assistant definition fields that matter
  const def = { ...assistant };
  delete def.id;
  sessionFields.assistantDefinition = def;

  const writeResp = await writeFirestore(token, "call_sessions", sessionId, sessionFields);
  if (writeResp.status >= 300) {
    console.error("❌ Failed to write session:", writeResp.status, JSON.stringify(writeResp.data).slice(0,200));
    process.exit(1);
  }
  console.log(`📄 Session: call_sessions/${sessionId}`);

  // Place call
  console.log(`\n📞 Calling ${TEST_PHONE} from ${TWILIO_FROM}...`);
  const callSid = await placeTwilioCall(TEST_PHONE, sessionId);
  console.log(`✅ Call SID: ${callSid}\n`);

  // Update session with SID
  await writeFirestore(token, "call_sessions", sessionId, { twilioSid: callSid, status: "dialing" });

  // Poll
  await pollSession(token, sessionId, 120000);

  console.log(`\n📋 Session doc: call_sessions/${sessionId}`);
  console.log("🔍 Cloud Run logs: gcloud run services logs read voiceflow-mediastream --region=us-central1 --limit=40");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
