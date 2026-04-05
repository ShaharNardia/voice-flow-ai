/**
 * Full Test Suite - Voice Flow AI
 * Comprehensive automated tests for ALL backend Firebase Functions + Cloud Run.
 *
 * Authenticates with Firebase Auth, then exercises every exported function via HTTP.
 *
 * Usage:
 *   node fullTestSuite.js
 *
 * Environment variables (optional overrides):
 *   FIREBASE_FUNCTIONS_URL  — defaults to production us-central1 URL
 *   FIREBASE_API_KEY        — defaults to the production web API key
 *   QA_EMAIL / QA_PASSWORD  — test user creds (defaults below)
 *   CLOUD_RUN_URL           — Cloud Run base URL
 */

const axios = require('axios');

// ── Configuration ────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.FIREBASE_FUNCTIONS_URL ||
  'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyDzcCqM4hD7XMYhR-60ULyJ9CLNqn8dni8';

const FIREBASE_AUTH_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

const CLOUD_RUN_URL =
  process.env.CLOUD_RUN_URL ||
  'https://voiceflow-mediastream-900818829902.us-central1.run.app';

const QA_EMAIL = process.env.QA_EMAIL || 'shahar@lancelotech.com';
const QA_PASSWORD = process.env.QA_PASSWORD || 'Test123!';

// ── State ────────────────────────────────────────────────────────────────────

let authToken = null;

const stats = { passed: 0, failed: 0, skipped: 0, total: 0 };
const failures = [];

// IDs created during tests for cleanup
const cleanup = {
  assistantId: null,
  leadIds: [],
  campaignId: null,
  scenarioId: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function measure(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

function report(name, passed, ms, detail = '') {
  stats.total++;
  if (passed) {
    stats.passed++;
    console.log(`  \u2705 ${name}  (${ms}ms)`);
  } else {
    stats.failed++;
    const msg = detail ? `${name}: ${detail}` : name;
    failures.push(msg);
    console.log(`  \u274C ${name}  (${ms}ms)  ${detail}`);
  }
}

function skip(name, reason) {
  stats.total++;
  stats.skipped++;
  console.log(`  \u23ED\uFE0F  ${name}  SKIPPED: ${reason}`);
}

async function GET(path, token) {
  return axios.get(`${BASE_URL}${path}`, {
    headers: authHeaders(token),
    timeout: 20000,
    validateStatus: () => true,
  });
}

async function POST(path, body, token) {
  return axios.post(`${BASE_URL}${path}`, body, {
    headers: authHeaders(token),
    timeout: 20000,
    validateStatus: () => true,
  });
}

async function POSTnoAuth(path, body) {
  return axios.post(`${BASE_URL}${path}`, body, {
    timeout: 20000,
    validateStatus: () => true,
  });
}

async function GETnoAuth(path) {
  return axios.get(`${BASE_URL}${path}`, {
    timeout: 20000,
    validateStatus: () => true,
  });
}

// ── 1. Auth Tests ────────────────────────────────────────────────────────────

async function testAuth() {
  console.log('\n\u2501\u2501 AUTH \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // Login with valid credentials
  const { result: loginOk, ms: loginMs } = await measure(async () => {
    try {
      const r = await axios.post(
        `${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`,
        { email: QA_EMAIL, password: QA_PASSWORD, returnSecureToken: true },
        { timeout: 15000 }
      );
      authToken = r.data.idToken;
      return !!authToken;
    } catch (e) {
      return false;
    }
  });
  report('Firebase Auth login', loginOk, loginMs, loginOk ? '' : 'Failed to obtain token');

  if (!authToken) {
    console.log('\n  FATAL: Cannot continue without auth token. Aborting.');
    return false;
  }

  // Login with wrong password should fail
  const { result: badPwOk, ms: badPwMs } = await measure(async () => {
    try {
      await axios.post(
        `${FIREBASE_AUTH_URL}?key=${FIREBASE_API_KEY}`,
        { email: QA_EMAIL, password: 'WRONG_PASSWORD', returnSecureToken: true },
        { timeout: 10000 }
      );
      return false; // should have thrown
    } catch (e) {
      return e.response && e.response.status === 400;
    }
  });
  report('Auth rejects wrong password', badPwOk, badPwMs);

  return true;
}

// ── 2. Assistants Tests ──────────────────────────────────────────────────────

async function testAssistants() {
  console.log('\n\u2501\u2501 ASSISTANTS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // List assistants
  const { result: listRes, ms: listMs } = await measure(async () => {
    const r = await GET('/assistantsList', authToken);
    return r;
  });
  report('assistantsList', listRes.status === 200, listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : '');

  // Create assistant
  const { result: createRes, ms: createMs } = await measure(async () => {
    const r = await POST('/assistantsCreate', {
      name: `__test_assistant_${Date.now()}`,
      firstMessage: 'Hello from automated test',
      systemPrompt: 'You are a test assistant. Keep responses short.',
      voice: 'alloy',
      model: 'gpt-4o-mini',
      language: 'en',
    }, authToken);
    return r;
  });
  const createOk = createRes.status >= 200 && createRes.status < 300;
  if (createOk && createRes.data) {
    cleanup.assistantId = createRes.data.id || createRes.data.assistantId || null;
  }
  report('assistantsCreate', createOk, createMs,
    !createOk ? `Status ${createRes.status}: ${JSON.stringify(createRes.data).substring(0, 200)}` : '');

  // Get assistant (if we created one)
  if (cleanup.assistantId) {
    const { result: getRes, ms: getMs } = await measure(async () => {
      return GET(`/assistantsGet?id=${cleanup.assistantId}`, authToken);
    });
    report('assistantsGet', getRes.status === 200, getMs,
      getRes.status !== 200 ? `Status ${getRes.status}` : '');

    // Update assistant
    const { result: updateRes, ms: updateMs } = await measure(async () => {
      return POST('/assistantsUpdate', {
        id: cleanup.assistantId,
        name: `__test_assistant_updated_${Date.now()}`,
      }, authToken);
    });
    report('assistantsUpdate', updateRes.status >= 200 && updateRes.status < 300, updateMs,
      updateRes.status >= 300 ? `Status ${updateRes.status}` : '');

    // Delete assistant (cleanup)
    const { result: delRes, ms: delMs } = await measure(async () => {
      return POST('/assistantsDelete', { id: cleanup.assistantId }, authToken);
    });
    report('assistantsDelete', delRes.status >= 200 && delRes.status < 300, delMs,
      delRes.status >= 300 ? `Status ${delRes.status}` : '');
    cleanup.assistantId = null;
  } else {
    skip('assistantsGet', 'No assistant created');
    skip('assistantsUpdate', 'No assistant created');
    skip('assistantsDelete', 'No assistant created');
  }
}

// ── 3. Phone Numbers Tests ───────────────────────────────────────────────────

async function testPhoneNumbers() {
  console.log('\n\u2501\u2501 PHONE NUMBERS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // List phone numbers
  const { result: listRes, ms: listMs } = await measure(async () => {
    return GET('/listPhoneNumbers', authToken);
  });
  report('listPhoneNumbers', listRes.status === 200, listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : '');

  // Search available phone numbers
  const { result: searchRes, ms: searchMs } = await measure(async () => {
    return POST('/searchPhoneNumbers', { country: 'US', areaCode: '415' }, authToken);
  });
  report('searchPhoneNumbers', searchRes.status >= 200 && searchRes.status < 500, searchMs,
    searchRes.status >= 500 ? `Status ${searchRes.status}` : '');
}

// ── 4. Calls Tests ───────────────────────────────────────────────────────────

async function testCalls() {
  console.log('\n\u2501\u2501 CALLS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // Place call (to test number — Twilio test creds or +15005550006)
  const { result: placeRes, ms: placeMs } = await measure(async () => {
    return POST('/placeCall', {
      to: '+15005550006',
      assistantId: 'test',
    }, authToken);
  });
  // We accept 200 (call placed) or 400/422 (validation error — means function is alive)
  const placeOk = placeRes.status >= 200 && placeRes.status < 500;
  report('placeCall (reachable)', placeOk, placeMs,
    !placeOk ? `Status ${placeRes.status}` : `Status ${placeRes.status}`);

  // getRecording — expects 400 without a valid SID but proves function runs
  const { result: recRes, ms: recMs } = await measure(async () => {
    return GET('/getRecording?callSid=CA0000000000000000000000000000test', authToken);
  });
  const recOk = recRes.status >= 200 && recRes.status < 500;
  report('getRecording (reachable)', recOk, recMs,
    !recOk ? `Status ${recRes.status}` : `Status ${recRes.status}`);
}

// ── 5. Leads Tests ───────────────────────────────────────────────────────────

async function testLeads() {
  console.log('\n\u2501\u2501 LEADS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // Batch create leads
  const ts = Date.now();
  const { result: batchRes, ms: batchMs } = await measure(async () => {
    return POST('/leadsBatchCreate', {
      leads: [
        { firstName: 'Test', lastName: `Auto_${ts}`, phone: '+15005550001', email: `test_${ts}@example.com` },
        { firstName: 'Test2', lastName: `Auto_${ts}`, phone: '+15005550002', email: `test2_${ts}@example.com` },
      ],
    }, authToken);
  });
  const batchOk = batchRes.status >= 200 && batchRes.status < 300;
  if (batchOk && batchRes.data) {
    const ids = batchRes.data.leadIds || batchRes.data.ids || [];
    cleanup.leadIds.push(...ids);
  }
  report('leadsBatchCreate', batchOk, batchMs,
    !batchOk ? `Status ${batchRes.status}: ${JSON.stringify(batchRes.data).substring(0, 200)}` : '');

  // Update lead
  if (cleanup.leadIds.length > 0) {
    const { result: updateRes, ms: updateMs } = await measure(async () => {
      return POST('/leadsUpdate', {
        leadId: cleanup.leadIds[0],
        data: { firstName: 'Updated_Test' },
      }, authToken);
    });
    report('leadsUpdate', updateRes.status >= 200 && updateRes.status < 300, updateMs,
      updateRes.status >= 300 ? `Status ${updateRes.status}` : '');

    // Delete leads (cleanup)
    for (const lid of cleanup.leadIds) {
      const { result: delRes, ms: delMs } = await measure(async () => {
        return POST('/leadsDelete', { leadId: lid }, authToken);
      });
      report(`leadsDelete (${lid.substring(0, 8)}...)`, delRes.status >= 200 && delRes.status < 300, delMs,
        delRes.status >= 300 ? `Status ${delRes.status}` : '');
    }
    cleanup.leadIds = [];
  } else {
    skip('leadsUpdate', 'No leads created');
    skip('leadsDelete', 'No leads created');
  }
}

// ── 6. Campaigns Tests ───────────────────────────────────────────────────────

async function testCampaigns() {
  console.log('\n\u2501\u2501 CAMPAIGNS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // List campaigns
  const { result: listRes, ms: listMs } = await measure(async () => {
    return GET('/campaignsList', authToken);
  });
  report('campaignsList', listRes.status === 200, listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : '');

  // Create campaign
  const { result: createRes, ms: createMs } = await measure(async () => {
    return POST('/campaignsCreate', {
      name: `__test_campaign_${Date.now()}`,
      assistantId: 'test',
      leadIds: [],
    }, authToken);
  });
  const createOk = createRes.status >= 200 && createRes.status < 300;
  if (createOk && createRes.data) {
    cleanup.campaignId = createRes.data.id || createRes.data.campaignId || null;
  }
  report('campaignsCreate', createOk, createMs,
    !createOk ? `Status ${createRes.status}: ${JSON.stringify(createRes.data).substring(0, 200)}` : '');
}

// ── 7. Scenarios Tests ───────────────────────────────────────────────────────

async function testScenarios() {
  console.log('\n\u2501\u2501 SCENARIOS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // List scenarios
  const { result: listRes, ms: listMs } = await measure(async () => {
    return GET('/scenariosList', authToken);
  });
  report('scenariosList', listRes.status === 200, listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : '');

  // Create scenario
  const { result: createRes, ms: createMs } = await measure(async () => {
    return POST('/scenariosCreate', {
      name: `__test_scenario_${Date.now()}`,
      nodes: [{ id: 'start', type: 'greeting', data: { message: 'Hello test' } }],
      edges: [],
    }, authToken);
  });
  const createOk = createRes.status >= 200 && createRes.status < 300;
  if (createOk && createRes.data) {
    cleanup.scenarioId = createRes.data.id || createRes.data.scenarioId || null;
  }
  report('scenariosCreate', createOk, createMs,
    !createOk ? `Status ${createRes.status}: ${JSON.stringify(createRes.data).substring(0, 200)}` : '');

  // Get scenario node types
  const { result: ntRes, ms: ntMs } = await measure(async () => {
    return GET('/scenariosNodeTypes', authToken);
  });
  report('scenariosNodeTypes', ntRes.status === 200, ntMs,
    ntRes.status !== 200 ? `Status ${ntRes.status}` : '');

  // Delete scenario (cleanup)
  if (cleanup.scenarioId) {
    const { result: delRes, ms: delMs } = await measure(async () => {
      return POST('/scenariosDelete', { id: cleanup.scenarioId }, authToken);
    });
    report('scenariosDelete', delRes.status >= 200 && delRes.status < 300, delMs,
      delRes.status >= 300 ? `Status ${delRes.status}` : '');
    cleanup.scenarioId = null;
  }
}

// ── 8. Knowledge Base Tests ──────────────────────────────────────────────────

async function testKnowledgeBase() {
  console.log('\n\u2501\u2501 KNOWLEDGE BASE \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  const { result: listRes, ms: listMs } = await measure(async () => {
    return GET('/knowledgeListFiles', authToken);
  });
  report('knowledgeListFiles', listRes.status === 200, listMs,
    listRes.status !== 200 ? `Status ${listRes.status}` : '');
}

// ── 9. Billing Tests ─────────────────────────────────────────────────────────

async function testBilling() {
  console.log('\n\u2501\u2501 BILLING \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  const { result: planRes, ms: planMs } = await measure(async () => {
    return GET('/getUserPlan', authToken);
  });
  report('getUserPlan', planRes.status === 200, planMs,
    planRes.status !== 200 ? `Status ${planRes.status}` : '');

  // getCostConfig (public or auth)
  const { result: costRes, ms: costMs } = await measure(async () => {
    return GET('/getCostConfig', authToken);
  });
  report('getCostConfig', costRes.status === 200, costMs,
    costRes.status !== 200 ? `Status ${costRes.status}` : '');
}

// ── 10. TTS Tests ────────────────────────────────────────────────────────────

async function testTTS() {
  console.log('\n\u2501\u2501 TTS (Text-to-Speech) \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  const { result: voicesRes, ms: voicesMs } = await measure(async () => {
    return GET('/listTtsVoices', authToken);
  });
  report('listTtsVoices', voicesRes.status === 200, voicesMs,
    voicesRes.status !== 200 ? `Status ${voicesRes.status}` : '');

  const { result: synthRes, ms: synthMs } = await measure(async () => {
    return POST('/synthesizeTts', {
      text: 'Hello, this is a test.',
      voice: 'alloy',
    }, authToken);
  });
  report('synthesizeTts', synthRes.status >= 200 && synthRes.status < 300, synthMs,
    synthRes.status >= 300 ? `Status ${synthRes.status}` : '');
}

// ── 11. Admin Tests ──────────────────────────────────────────────────────────

async function testAdmin() {
  console.log('\n\u2501\u2501 ADMIN \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // adminListUsers
  const { result: usersRes, ms: usersMs } = await measure(async () => {
    return GET('/adminListUsers', authToken);
  });
  report('adminListUsers', usersRes.status === 200, usersMs,
    usersRes.status !== 200 ? `Status ${usersRes.status}` : '');

  // adminGetSubscriptions
  const { result: subsRes, ms: subsMs } = await measure(async () => {
    return GET('/adminGetSubscriptions', authToken);
  });
  report('adminGetSubscriptions', subsRes.status === 200, subsMs,
    subsRes.status !== 200 ? `Status ${subsRes.status}` : '');

  // adminGetPlanConfig
  const { result: planCfgRes, ms: planCfgMs } = await measure(async () => {
    return GET('/adminGetPlanConfig', authToken);
  });
  report('adminGetPlanConfig', planCfgRes.status === 200, planCfgMs,
    planCfgRes.status !== 200 ? `Status ${planCfgRes.status}` : '');

  // adminGetRateCard
  const { result: rateRes, ms: rateMs } = await measure(async () => {
    return GET('/adminGetRateCard', authToken);
  });
  report('adminGetRateCard', rateRes.status === 200, rateMs,
    rateRes.status !== 200 ? `Status ${rateRes.status}` : '');

  // adminGetCostDashboard
  const { result: costDashRes, ms: costDashMs } = await measure(async () => {
    return GET('/adminGetCostDashboard', authToken);
  });
  report('adminGetCostDashboard', costDashRes.status === 200, costDashMs,
    costDashRes.status !== 200 ? `Status ${costDashRes.status}` : '');

  // adminGetCustomerPricing
  const { result: pricingRes, ms: pricingMs } = await measure(async () => {
    return GET('/adminGetCustomerPricing', authToken);
  });
  report('adminGetCustomerPricing', pricingRes.status === 200, pricingMs,
    pricingRes.status !== 200 ? `Status ${pricingRes.status}` : '');

  // adminCheckIntegrations
  const { result: intgRes, ms: intgMs } = await measure(async () => {
    return GET('/adminCheckIntegrations', authToken);
  });
  report('adminCheckIntegrations', intgRes.status === 200, intgMs,
    intgRes.status !== 200 ? `Status ${intgRes.status}` : '');

  // adminGetSystemSettings
  const { result: sysRes, ms: sysMs } = await measure(async () => {
    return GET('/adminGetSystemSettings', authToken);
  });
  report('adminGetSystemSettings', sysRes.status === 200, sysMs,
    sysRes.status !== 200 ? `Status ${sysRes.status}` : '');

  // adminGetKeysMeta
  const { result: keysRes, ms: keysMs } = await measure(async () => {
    return GET('/adminGetKeysMeta', authToken);
  });
  report('adminGetKeysMeta', keysRes.status === 200, keysMs,
    keysRes.status !== 200 ? `Status ${keysRes.status}` : '');

  // adminGetBillingConfig
  const { result: billCfgRes, ms: billCfgMs } = await measure(async () => {
    return GET('/adminGetBillingConfig', authToken);
  });
  report('adminGetBillingConfig', billCfgRes.status === 200, billCfgMs,
    billCfgRes.status !== 200 ? `Status ${billCfgRes.status}` : '');

  // adminGetPronunciation
  const { result: pronRes, ms: pronMs } = await measure(async () => {
    return GET('/adminGetPronunciation', authToken);
  });
  report('adminGetPronunciation', pronRes.status === 200, pronMs,
    pronRes.status !== 200 ? `Status ${pronRes.status}` : '');

  // adminListAllPhoneNumbers
  const { result: allPhonesRes, ms: allPhonesMs } = await measure(async () => {
    return GET('/adminListAllPhoneNumbers', authToken);
  });
  report('adminListAllPhoneNumbers', allPhonesRes.status === 200, allPhonesMs,
    allPhonesRes.status !== 200 ? `Status ${allPhonesRes.status}` : '');

  // No-auth guard: adminListUsers without token should 401
  const { result: noAuthRes, ms: noAuthMs } = await measure(async () => {
    return GETnoAuth('/adminListUsers');
  });
  report('adminListUsers no-auth returns 401', noAuthRes.status === 401, noAuthMs,
    noAuthRes.status !== 401 ? `Got ${noAuthRes.status} instead of 401` : '');
}

// ── 12. Misc Functions Tests ─────────────────────────────────────────────────

async function testMiscFunctions() {
  console.log('\n\u2501\u2501 MISC FUNCTIONS \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // healthCheck
  const { result: healthRes, ms: healthMs } = await measure(async () => {
    return GETnoAuth('/healthCheck');
  });
  report('healthCheck', healthRes.status === 200, healthMs,
    healthRes.status !== 200 ? `Status ${healthRes.status}` : '');

  // getIntegrationStatus
  const { result: intRes, ms: intMs } = await measure(async () => {
    return GETnoAuth('/getIntegrationStatus');
  });
  report('getIntegrationStatus', intRes.status === 200, intMs,
    intRes.status !== 200 ? `Status ${intRes.status}` : '');

  // getPronunciationFixes (public endpoint)
  const { result: pronFixRes, ms: pronFixMs } = await measure(async () => {
    return GET('/getPronunciationFixes', authToken);
  });
  report('getPronunciationFixes', pronFixRes.status === 200, pronFixMs,
    pronFixRes.status !== 200 ? `Status ${pronFixRes.status}` : '');

  // appointmentsList
  const { result: apptRes, ms: apptMs } = await measure(async () => {
    return GET('/appointmentsList', authToken);
  });
  report('appointmentsList', apptRes.status === 200, apptMs,
    apptRes.status !== 200 ? `Status ${apptRes.status}` : '');

  // getLeadDetails
  const { result: leadRes, ms: leadMs } = await measure(async () => {
    return POSTnoAuth('/getLeadDetails', { company: 'test', limit: 1 });
  });
  const leadOk = leadRes.status >= 200 && leadRes.status < 500;
  report('getLeadDetails (reachable)', leadOk, leadMs,
    !leadOk ? `Status ${leadRes.status}` : '');

  // assignAssistant
  const { result: assignRes, ms: assignMs } = await measure(async () => {
    return POSTnoAuth('/assignAssistant', { phoneNumber: '+15005550000' });
  });
  const assignOk = assignRes.status >= 200 && assignRes.status < 500;
  report('assignAssistant (reachable)', assignOk, assignMs,
    !assignOk ? `Status ${assignRes.status}` : '');
}

// ── 13. Cloud Run Tests ──────────────────────────────────────────────────────

async function testCloudRun() {
  console.log('\n\u2501\u2501 CLOUD RUN (voiceflow-mediastream) \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  // Health check
  const { result: healthRes, ms: healthMs } = await measure(async () => {
    try {
      return await axios.get(`${CLOUD_RUN_URL}/health`, {
        timeout: 15000,
        validateStatus: () => true,
      });
    } catch (e) {
      return { status: 0, data: e.message };
    }
  });
  report('Cloud Run /health', healthRes.status === 200, healthMs,
    healthRes.status !== 200 ? `Status ${healthRes.status}` : '');

  // Root endpoint
  const { result: rootRes, ms: rootMs } = await measure(async () => {
    try {
      return await axios.get(`${CLOUD_RUN_URL}/`, {
        timeout: 15000,
        validateStatus: () => true,
      });
    } catch (e) {
      return { status: 0, data: e.message };
    }
  });
  const rootOk = rootRes.status >= 200 && rootRes.status < 500;
  report('Cloud Run / (root)', rootOk, rootMs,
    !rootOk ? `Status ${rootRes.status}` : '');

  // TTS preview endpoint
  const { result: ttsRes, ms: ttsMs } = await measure(async () => {
    try {
      return await axios.post(`${CLOUD_RUN_URL}/tts-preview`, {
        text: 'Hello test',
        voice: 'alloy',
      }, {
        timeout: 20000,
        validateStatus: () => true,
      });
    } catch (e) {
      return { status: 0, data: e.message };
    }
  });
  const ttsOk = ttsRes.status >= 200 && ttsRes.status < 500;
  report('Cloud Run /tts-preview', ttsOk, ttsMs,
    !ttsOk ? `Status ${ttsRes.status}` : '');

  // generate_hebrew_tts endpoint (if exists)
  const { result: hebRes, ms: hebMs } = await measure(async () => {
    try {
      return await axios.post(`${CLOUD_RUN_URL}/generate-hebrew-tts`, {
        text: 'shalom',
      }, {
        timeout: 15000,
        validateStatus: () => true,
      });
    } catch (e) {
      return { status: 0, data: e.message };
    }
  });
  const hebOk = hebRes.status >= 200 && hebRes.status < 500;
  report('Cloud Run /generate-hebrew-tts (reachable)', hebOk, hebMs,
    !hebOk ? `Status ${hebRes.status}` : '');
}

// ── 14. Webhook reachability ─────────────────────────────────────────────────

async function testWebhooks() {
  console.log('\n\u2501\u2501 WEBHOOKS (reachability) \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  const webhooks = [
    'vapiWebhook',
    'twilioVoiceWebhook',
    'twilioGatherCallback',
    'twilioStatusCallback',
    'twilioRecordingCallback',
    'twilioFeedbackWebhook',
    'twilioFeedbackGather',
    'endOfCallLog',
  ];

  for (const wh of webhooks) {
    const { result: res, ms } = await measure(async () => {
      return POSTnoAuth(`/${wh}`, {});
    });
    const ok = res.status >= 200 && res.status < 500;
    report(`${wh} (reachable)`, ok, ms,
      !ok ? `Status ${res.status}` : `Status ${res.status}`);
  }
}

// ── Main Runner ──────────────────────────────────────────────────────────────

async function runFullTestSuite() {
  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551     Voice Flow AI  -  Full API Test Suite                   \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log(`  Base URL:      ${BASE_URL}`);
  console.log(`  Cloud Run URL: ${CLOUD_RUN_URL}`);
  console.log(`  Test user:     ${QA_EMAIL}`);
  console.log(`  Timestamp:     ${new Date().toISOString()}`);
  console.log('');

  const started = Date.now();

  // Auth (must pass to continue)
  const authOk = await testAuth();
  if (!authOk) {
    console.log('\n  Auth failed - cannot run remaining tests.\n');
    printSummary(started);
    return stats.failed > 0 ? 1 : 0;
  }

  // Run all test categories (continue on failure)
  const categories = [
    testAssistants,
    testPhoneNumbers,
    testCalls,
    testLeads,
    testCampaigns,
    testScenarios,
    testKnowledgeBase,
    testBilling,
    testTTS,
    testAdmin,
    testMiscFunctions,
    testCloudRun,
    testWebhooks,
  ];

  for (const testFn of categories) {
    try {
      await testFn();
    } catch (err) {
      console.log(`  \u274C CATEGORY ERROR: ${err.message}`);
      stats.failed++;
      stats.total++;
      failures.push(`${testFn.name}: ${err.message}`);
    }
  }

  printSummary(started);
  return stats.failed > 0 ? 1 : 0;
}

function printSummary(started) {
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551                       SUMMARY                               \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log(`  Total:   ${stats.total}`);
  console.log(`  Passed:  ${stats.passed}`);
  console.log(`  Failed:  ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Time:    ${elapsed}s`);
  console.log('');

  if (failures.length > 0) {
    console.log('  Failed tests:');
    failures.forEach(f => console.log(`    \u274C ${f}`));
    console.log('');
  }

  if (stats.failed === 0) {
    console.log('  \u2705 ALL TESTS PASSED');
  } else {
    console.log(`  \u274C ${stats.failed} TEST(S) FAILED`);
  }
  console.log('');
}

// ── Entry Point ──────────────────────────────────────────────────────────────

if (require.main === module) {
  runFullTestSuite()
    .then(exitCode => process.exit(exitCode))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runFullTestSuite };
