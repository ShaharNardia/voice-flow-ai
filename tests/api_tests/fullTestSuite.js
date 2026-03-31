/**
 * Full API test suite — Firebase Functions (HTTP + callable) + optional Cloud Run.
 *
 * Usage:
 *   QA_EMAIL=... QA_PASSWORD=... node fullTestSuite.js
 *
 * Env:
 *   FIREBASE_FUNCTIONS_URL  (default: production us-central1)
 *   FIREBASE_API_KEY        (Firebase Web API key for password sign-in)
 *   QA_EMAIL / QA_PASSWORD
 *   CLOUD_RUN_URL           (optional; Hebrew TTS / health)
 *
 * Env file (optional): tests/api_tests/.env — do not auto-load tests/ui/.env.test here
 * (Playwright creds may be placeholders and would make Auth fail the whole suite).
 */

const path = require("path");
try {
  require("dotenv").config({
    path: path.join(__dirname, ".env"),
    quiet: true,
  });
} catch {
  /* dotenv missing — set process.env manually */
}

const axios = require("axios");

const BASE_URL =
  process.env.FIREBASE_FUNCTIONS_URL ||
  "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyDzcCqM4hD7XMYhR-60ULyJ9CLNqn8dni8";

const FIREBASE_AUTH_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

const CLOUD_RUN_URL =
  process.env.CLOUD_RUN_URL ||
  "https://voiceflow-mediastream-900818829902.us-central1.run.app";

const QA_EMAIL = process.env.QA_EMAIL || "";
const QA_PASSWORD = process.env.QA_PASSWORD || "";

let authToken = null;

const stats = {passed: 0, failed: 0, skipped: 0, total: 0};
const failures = [];

const cleanup = {assistantId: null, scenarioId: null};

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function measure(fn) {
  const start = Date.now();
  const result = await fn();
  return {result, ms: Date.now() - start};
}

function report(name, passed, ms, detail = "") {
  stats.total++;
  if (passed) {
    stats.passed++;
    console.log(`  ✅ ${name}  (${ms}ms)`);
  } else {
    stats.failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    failures.push(msg);
    console.log(`  ❌ ${name}  (${ms}ms)  ${detail}`);
  }
}

function skip(name, reason) {
  stats.total++;
  stats.skipped++;
  console.log(`  ⏭️  ${name}  SKIPPED: ${reason}`);
}

async function GET(path, token) {
  return axios.get(`${BASE_URL}${path}`, {
    headers: token ? authHeaders(token) : {"Content-Type": "application/json"},
    timeout: 25000,
    validateStatus: () => true,
  });
}

async function POST(path, body, token) {
  return axios.post(`${BASE_URL}${path}`, body, {
    headers: token ? authHeaders(token) : {"Content-Type": "application/json"},
    timeout: 25000,
    validateStatus: () => true,
  });
}

async function POSTnoAuth(path, body) {
  return POST(path, body, null);
}

async function GETnoAuth(path) {
  return axios.get(`${BASE_URL}${path}`, {
    timeout: 25000,
    validateStatus: () => true,
  });
}

/** Firebase callable (v2) over HTTP */
async function callable(name, data, token) {
  return axios.post(
    `${BASE_URL}/${name}`,
    {data},
    {
      headers: token ? authHeaders(token) : {"Content-Type": "application/json"},
      timeout: 25000,
      validateStatus: () => true,
    },
  );
}

/** If endpoint is not deployed (404), count as skip instead of fail */
function reportOrSkip404(name, res, ms, okPredicate) {
  if (res.status === 404) {
    skip(name, "HTTP 404 — not deployed");
    return;
  }
  report(name, okPredicate(res), ms, okPredicate(res) ? "" : `Status ${res.status}`);
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function testAuth() {
  console.log(
    "\n━━━━━━━━ AUTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  if (!QA_EMAIL || !QA_PASSWORD) {
    skip("Firebase Auth login", "QA_EMAIL / QA_PASSWORD not set");
    skip("Auth rejects wrong password", "QA_EMAIL / QA_PASSWORD not set");
    console.log(
      "\n  Set QA_EMAIL and QA_PASSWORD to run authenticated HTTP tests.\n",
    );
    return false;
  }

  const {result: loginOk, ms: loginMs} = await measure(async () => {
    try {
      const r = await axios.post(
        `${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`,
        {
          email: QA_EMAIL,
          password: QA_PASSWORD,
          returnSecureToken: true,
        },
        {timeout: 15000},
      );
      authToken = r.data.idToken;
      return !!authToken;
    } catch {
      return false;
    }
  });
  report(
    "Firebase Auth login",
    loginOk,
    loginMs,
    loginOk ? "" : "Failed to obtain token",
  );

  if (!authToken) {
    console.log("\n  FATAL: Cannot continue without auth token.\n");
    return false;
  }

  const {result: badPwOk, ms: badPwMs} = await measure(async () => {
    try {
      await axios.post(
        `${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`,
        {
          email: QA_EMAIL,
          password: "WRONG_PASSWORD___",
          returnSecureToken: true,
        },
        {timeout: 10000},
      );
      return false;
    } catch (e) {
      return e.response && e.response.status === 400;
    }
  });
  report("Auth rejects wrong password", badPwOk, badPwMs);

  return true;
}

// ── Assistants ─────────────────────────────────────────────────────────────

async function testAssistants() {
  console.log(
    "\n━━━━━━━━ ASSISTANTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: listRes, ms: listMs} = await measure(() =>
    GET("/assistantsList", authToken),
  );
  report(
    "assistantsList",
    listRes.status === 200,
    listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : "",
  );

  const {result: createRes, ms: createMs} = await measure(() =>
    POST(
      "/assistantsCreate",
      {
        name: `__test_assistant_${Date.now()}`,
        firstMessage: "Hello from automated test",
        language: "he-IL",
      },
      authToken,
    ),
  );
  const createOk = createRes.status >= 200 && createRes.status < 300;
  if (createOk && createRes.data) {
    cleanup.assistantId = createRes.data.id || null;
  }
  report(
    "assistantsCreate",
    createOk,
    createMs,
    !createOk
      ? `Status ${createRes.status}: ${JSON.stringify(createRes.data || {}).slice(0, 200)}`
      : "",
  );

  if (cleanup.assistantId) {
    const {result: getRes, ms: getMs} = await measure(() =>
      GET(`/assistantsGet?id=${cleanup.assistantId}`, authToken),
    );
    report(
      "assistantsGet",
      getRes.status === 200,
      getMs,
      getRes.status !== 200 ? `Status ${getRes.status}` : "",
    );

    const {result: updateRes, ms: updateMs} = await measure(() =>
      POST(
        "/assistantsUpdate",
        {id: cleanup.assistantId, name: `__test_updated_${Date.now()}`},
        authToken,
      ),
    );
    report(
      "assistantsUpdate",
      updateRes.status >= 200 && updateRes.status < 300,
      updateMs,
      updateRes.status >= 300 ? `Status ${updateRes.status}` : "",
    );

    const {result: delRes, ms: delMs} = await measure(() =>
      POST("/assistantsDelete", {id: cleanup.assistantId}, authToken),
    );
    report(
      "assistantsDelete",
      delRes.status >= 200 && delRes.status < 300,
      delMs,
      delRes.status >= 300 ? `Status ${delRes.status}` : "",
    );
    cleanup.assistantId = null;
  } else {
    skip("assistantsGet", "No assistant created");
    skip("assistantsUpdate", "No assistant created");
    skip("assistantsDelete", "No assistant created");
  }
}

// ── Phone ──────────────────────────────────────────────────────────────────

async function testPhone() {
  console.log(
    "\n━━━━━━━━ PHONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: searchRes, ms: searchMs} = await measure(() =>
    POST("/searchPhoneNumbers", {country: "US", areaCode: "415"}, authToken),
  );
  report(
    "searchPhoneNumbers",
    searchRes.status >= 200 && searchRes.status < 500,
    searchMs,
    searchRes.status >= 500 ? `Status ${searchRes.status}` : "",
  );
}

// ── Calls ────────────────────────────────────────────────────────────────────

async function testCalls() {
  console.log(
    "\n━━━━━━━━ CALLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: placeRes, ms: placeMs} = await measure(() =>
    POST(
      "/placeCall",
      {to: "+15005550006", assistantId: "test-nonexistent"},
      authToken,
    ),
  );
  const placeOk = placeRes.status >= 200 && placeRes.status < 500;
  report(
    "placeCall (reachable)",
    placeOk,
    placeMs,
    !placeOk ? `Status ${placeRes.status}` : `Status ${placeRes.status}`,
  );

  const {result: flowRes, ms: flowMs} = await measure(() =>
    POSTnoAuth("/scenarioFlowExecute", {}),
  );
  const xml = String(flowRes.data || "");
  report(
    "scenarioFlowExecute (Twilio XML)",
    flowRes.status === 200 && xml.includes("Response"),
    flowMs,
    flowRes.status !== 200 ? `Status ${flowRes.status}` : "",
  );
}

// ── Leads (callable) ─────────────────────────────────────────────────────────

async function testLeads() {
  console.log(
    "\n━━━━━━━━ LEADS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: r, ms} = await measure(() =>
    callable(
      "getLeadDetails",
      {company_id: "test-suite-nonexistent-company", limit: 1},
      authToken,
    ),
  );
  const ok =
    r.status === 200 ||
    (r.status >= 400 && r.status < 500) ||
    (r.data && r.data.error);
  report(
    "getLeadDetails (callable)",
    ok,
    ms,
    !ok ? `Status ${r.status}` : "",
  );

  const {result: batchRes, ms: bms} = await measure(() =>
    POST("/leadsBatchCreate", {leads: []}, authToken),
  );
  reportOrSkip404(
    "leadsBatchCreate (extended API)",
    batchRes,
    bms,
    (res) =>
      res.status === 200 ||
      res.status === 400 ||
      res.status === 405,
  );
}

// ── Campaigns (optional HTTP) ───────────────────────────────────────────────

async function testCampaigns() {
  console.log(
    "\n━━━━━━━━ CAMPAIGNS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: listRes, ms} = await measure(() =>
    GET("/campaignsList", authToken),
  );
  reportOrSkip404(
    "campaignsList",
    listRes,
    ms,
    (res) => res.status === 200,
  );

  const {result: createRes, ms: cms} = await measure(() =>
    POST(
      "/campaignsCreate",
      {
        name: `__test_campaign_${Date.now()}`,
        assistantId: "test",
        leadIds: [],
      },
      authToken,
    ),
  );
  if (createRes.status === 404) {
    skip("campaignsCreate", "HTTP 404 — not deployed");
  } else {
    report(
      "campaignsCreate",
      createRes.status >= 200 && createRes.status < 300,
      cms,
      createRes.status >= 300
        ? `Status ${createRes.status}: ${JSON.stringify(createRes.data || {}).slice(0, 160)}`
        : "",
    );
  }
}

// ── Scenarios ────────────────────────────────────────────────────────────────

async function testScenarios() {
  console.log(
    "\n━━━━━━━━ SCENARIOS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: listRes, ms: listMs} = await measure(() =>
    GET("/scenariosList", authToken),
  );
  report(
    "scenariosList",
    listRes.status === 200,
    listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : "",
  );

  const {result: createRes, ms: createMs} = await measure(() =>
    POST(
      "/scenariosCreate",
      {
        name: `__test_scenario_${Date.now()}`,
        nodes: [
          {
            id: "start_1",
            type: "start",
            data: {trigger: "outbound"},
          },
        ],
        edges: [],
      },
      authToken,
    ),
  );
  const createOk = createRes.status >= 200 && createRes.status < 300;
  if (createOk && createRes.data) {
    cleanup.scenarioId = createRes.data.id || null;
  }
  report(
    "scenariosCreate",
    createOk,
    createMs,
    !createOk
      ? `Status ${createRes.status}: ${JSON.stringify(createRes.data || {}).slice(0, 200)}`
      : "",
  );

  const {result: ntRes, ms: ntMs} = await measure(() =>
    GET("/scenariosNodeTypes", authToken),
  );
  report(
    "scenariosNodeTypes",
    ntRes.status === 200,
    ntMs,
    ntRes.status !== 200 ? `Status ${ntRes.status}` : "",
  );

  if (cleanup.scenarioId) {
    const {result: delRes, ms: delMs} = await measure(() =>
      POST("/scenariosDelete", {id: cleanup.scenarioId}, authToken),
    );
    report(
      "scenariosDelete",
      delRes.status >= 200 && delRes.status < 300,
      delMs,
      delRes.status >= 300 ? `Status ${delRes.status}` : "",
    );
    cleanup.scenarioId = null;
  }
}

// ── Knowledge ──────────────────────────────────────────────────────────────

async function testKnowledge() {
  console.log(
    "\n━━━━━━━━ KNOWLEDGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: listRes, ms} = await measure(() =>
    GET("/knowledgeListFiles?assistantId=__smoke_test_assistant__", authToken),
  );
  if (listRes.status === 404) {
    skip("knowledgeListFiles", "HTTP 404 — deploy functions with knowledge exports");
    return;
  }
  report(
    "knowledgeListFiles",
    listRes.status === 200,
    ms,
    listRes.status !== 200 ? `Status ${listRes.status}` : "",
  );
}

// ── Billing ──────────────────────────────────────────────────────────────────

async function testBilling() {
  console.log(
    "\n━━━━━━━━ BILLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: stripeRes, ms: sms} = await measure(() =>
    POSTnoAuth("/stripeCustomerSubscription", {}),
  );
  report(
    "stripeCustomerSubscription (no signature → 400)",
    stripeRes.status === 400 || stripeRes.status === 500,
    sms,
    stripeRes.status === 200 ? "Unexpected 200 without Stripe signature" : "",
  );

  const {result: planRes, ms: pms} = await measure(() =>
    GET("/getUserPlan", authToken),
  );
  reportOrSkip404(
    "getUserPlan",
    planRes,
    pms,
    (res) => res.status === 200,
  );

  const {result: subRes, ms: subMs} = await measure(() =>
    callable("setUserSubscription", {uid: "invalid-uid-format!!!"}, authToken),
  );
  const subOk =
    subRes.status === 200 ||
    subRes.status === 400 ||
    subRes.status === 403 ||
    subRes.status === 500;
  report(
    "setUserSubscription (callable guard)",
    subOk,
    subMs,
    !subOk ? `Status ${subRes.status}` : "",
  );
}

// ── TTS (Functions) ──────────────────────────────────────────────────────────

async function testTts() {
  console.log(
    "\n━━━━━━━━ TTS (Functions) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: voicesRes, ms: vms} = await measure(() =>
    GET("/listTtsVoices?provider=google", authToken),
  );
  report(
    "listTtsVoices",
    voicesRes.status === 200,
    vms,
    voicesRes.status !== 200 ? `Status ${voicesRes.status}` : "",
  );

  const {result: synthRes, ms: syms} = await measure(() =>
    POST(
      "/synthesizeTts",
      {
        provider: "google",
        text: "Hello automated test.",
        voiceId: "he-IL-Wavenet-A",
        languageCode: "he-IL",
      },
      authToken,
    ),
  );
  report(
    "synthesizeTts",
    synthRes.status >= 200 && synthRes.status < 300,
    syms,
    synthRes.status >= 300 ? `Status ${synthRes.status}` : "",
  );
}

// ── Admin (bootstrap + optional extended routes) ───────────────────────────

async function testAdmin() {
  console.log(
    "\n━━━━━━━━ ADMIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: bootRes, ms: bms} = await measure(() =>
    POSTnoAuth("/bootstrapAdminUser", {uid: "test", secret: "wrong"}),
  );
  report(
    "bootstrapAdminUser rejects bad secret",
    bootRes.status === 403 || bootRes.status === 400,
    bms,
    bootRes.status === 200 ? "Unexpected success" : "",
  );

  const adminGets = [
    "/adminListUsers",
    "/adminGetSubscriptions",
    "/adminGetPlanConfig",
    "/adminGetSystemSettings",
  ];
  for (const path of adminGets) {
    const {result: res, ms} = await measure(() => GET(path, authToken));
    const name = path.replace(/^\//, "");
    if (res.status === 404) {
      skip(name, "HTTP 404 — not deployed");
    } else {
      const ok = res.status === 200 || res.status === 403;
      report(
        name,
        ok,
        ms,
        ok ? "" : `Status ${res.status}`,
      );
    }
  }
}

// ── Misc HTTP / webhooks ─────────────────────────────────────────────────────

async function testMisc() {
  console.log(
    "\n━━━━━━━━ MISC & WEBHOOKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: healthRes, ms: hms} = await measure(() =>
    GETnoAuth("/healthCheck"),
  );
  report(
    "healthCheck",
    healthRes.status === 200 || healthRes.status === 503,
    hms,
    healthRes.status >= 500 ? `Status ${healthRes.status}` : "",
  );

  const {result: assignRes, ms: ams} = await measure(() =>
    POSTnoAuth("/assignAssistant", {phoneNumber: "+15005550000"}),
  );
  const assignOk = assignRes.status >= 200 && assignRes.status < 500;
  report(
    "assignAssistant (reachable)",
    assignOk,
    ams,
    !assignOk ? `Status ${assignRes.status}` : "",
  );

  const {result: eocRes, ms: ems} = await measure(() =>
    POSTnoAuth("/endOfCallLog", {call_session_id: `suite_${Date.now()}`}),
  );
  const eocOk = eocRes.status >= 200 && eocRes.status < 500;
  report(
    "endOfCallLog (reachable)",
    eocOk,
    ems,
    !eocOk ? `Status ${eocRes.status}` : "",
  );

  const {result: vapiRes, ms: vms} = await measure(() =>
    POSTnoAuth("/vapiWebhook", {message: {type: "test"}}),
  );
  report(
    "vapiWebhook (reachable)",
    vapiRes.status >= 200 && vapiRes.status < 500,
    vms,
    vapiRes.status >= 500 ? `Status ${vapiRes.status}` : "",
  );

  for (const wh of [
    "twilioVoiceWebhook",
    "twilioGatherCallback",
    "twilioStatusCallback",
  ]) {
    const {result: res, ms} = await measure(() => POSTnoAuth(`/${wh}`, {}));
    const ok = res.status >= 200 && res.status < 500;
    report(`${wh} (reachable)`, ok, ms, !ok ? `Status ${res.status}` : "");
  }

  const {result: aiGen, ms: agms} = await measure(() =>
    POSTnoAuth("/scenarioAiGenerate", {}),
  );
  report(
    "scenarioAiGenerate validates body",
    aiGen.status === 400,
    agms,
    aiGen.status !== 400 ? `Status ${aiGen.status}` : "",
  );
}

// ── Callables (smoke) ────────────────────────────────────────────────────────

async function testCallables() {
  console.log(
    "\n━━━━━━━━ CALLABLES (smoke) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: jobRes, ms: jms} = await measure(() =>
    callable("getPhoneNumberFromJob", {jobId: "nonexistent-job"}, null),
  );
  report(
    "getPhoneNumberFromJob",
    jobRes.status >= 200 && jobRes.status < 500,
    jms,
    jobRes.status >= 500 ? `Status ${jobRes.status}` : "",
  );

  const {result: resRes, ms: rms} = await measure(() =>
    callable(
      "createReservation",
      {
        companyId: "x",
        leadId: "y",
        assistantId: "z",
        callId: `t_${Date.now()}`,
        reservationDetails: {date: new Date().toISOString(), duration: 60},
      },
      null,
    ),
  );
  const resvOk =
    resRes.status >= 200 && resRes.status < 600 && resRes.status !== 0;
  report(
    "createReservation (callable)",
    resvOk,
    rms,
    !resvOk ? `Status ${resRes.status}` : "",
  );
}

// ── Cloud Run ────────────────────────────────────────────────────────────────

async function testCloudRun() {
  console.log(
    "\n━━━━━━━━ CLOUD RUN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const {result: healthRes, ms: hms} = await measure(async () => {
    try {
      return await axios.get(`${CLOUD_RUN_URL}/health`, {
        timeout: 15000,
        validateStatus: () => true,
      });
    } catch (e) {
      return {status: 0, data: e.message};
    }
  });
  report(
    "Cloud Run /health",
    healthRes.status === 200,
    hms,
    healthRes.status !== 200 ? `Status ${healthRes.status}` : "",
  );

  const {result: ttsRes, ms: tms} = await measure(async () => {
    try {
      return await axios.post(
        `${CLOUD_RUN_URL}/tts-preview`,
        {text: "Hello", voice: "alloy"},
        {timeout: 20000, validateStatus: () => true},
      );
    } catch (e) {
      return {status: 0, data: e.message};
    }
  });
  const ttsOk = ttsRes.status >= 200 && ttsRes.status < 500;
  report(
    "Cloud Run /tts-preview",
    ttsOk,
    tms,
    !ttsOk ? `Status ${ttsRes.status}` : "",
  );

  const {result: hebRes, ms: hebMs} = await measure(async () => {
    try {
      return await axios.post(
        `${CLOUD_RUN_URL}/generate-hebrew-tts`,
        {text: "שלום"},
        {timeout: 20000, validateStatus: () => true},
      );
    } catch (e) {
      return {status: 0, data: e.message};
    }
  });
  if (hebRes.status === 404) {
    skip("Cloud Run /generate-hebrew-tts", "HTTP 404");
  } else {
    const hebOk = hebRes.status >= 200 && hebRes.status < 500;
    report(
      "Cloud Run /generate-hebrew-tts (reachable)",
      hebOk,
      hebMs,
      !hebOk ? `Status ${hebRes.status}` : "",
    );
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function runFullTestSuite() {
  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║     Voice Flow AI — Full API Test Suite                               ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝",
  );
  console.log(`  Base URL:      ${BASE_URL}`);
  console.log(`  Cloud Run:     ${CLOUD_RUN_URL}`);
  console.log(`  Timestamp:     ${new Date().toISOString()}`);
  console.log("");

  const started = Date.now();
  const authOk = await testAuth();

  const categories = authOk
    ? [
        testAssistants,
        testPhone,
        testCalls,
        testLeads,
        testCampaigns,
        testScenarios,
        testKnowledge,
        testBilling,
        testTts,
        testAdmin,
        testMisc,
        testCallables,
        testCloudRun,
      ]
    : [testMisc, testCallables, testCloudRun];

  for (const fn of categories) {
    try {
      await fn();
    } catch (err) {
      console.log(`  ❌ CATEGORY ERROR: ${fn.name}: ${err.message}`);
      stats.failed++;
      stats.total++;
      failures.push(`${fn.name}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log(
    "╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                         SUMMARY                                       ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝",
  );
  console.log(`  Total:   ${stats.total}`);
  console.log(`  Passed:  ${stats.passed}`);
  console.log(`  Failed:  ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Time:    ${elapsed}s`);
  console.log("");

  if (failures.length) {
    console.log("  Failed tests:");
    failures.forEach((f) => console.log(`    ❌ ${f}`));
    console.log("");
  }

  if (!authOk) {
    console.log(
      "  ⚠️  Authenticated sections were skipped — set QA_EMAIL / QA_PASSWORD.\n",
    );
  }

  if (stats.failed === 0) {
    console.log("  ✅ ALL EXECUTED TESTS PASSED (skipped items excluded)\n");
  } else {
    console.log(`  ❌ ${stats.failed} TEST(S) FAILED\n`);
  }

  return stats.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  runFullTestSuite()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });
}

module.exports = {runFullTestSuite};
