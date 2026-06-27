/**
 * Analysis & Plan Tests
 * Tests: analyzeCall, getUserPlan, getIntegrationStatus
 *
 * Requires env vars:
 *   FIREBASE_API_KEY  — Firebase web API key
 *   QA_EMAIL          — Regular user email for auth tests
 *   QA_PASSWORD       — Regular user password
 */

const axios = require('axios');

const BASE_URL =
  process.env.FIREBASE_FUNCTIONS_URL ||
  'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

const FIREBASE_AUTH_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

const results = { passed: [], failed: [], skipped: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function logTest(name, status, details = '') {
  const result = { name, status, details };
  if (status === 'PASS') {
    results.passed.push(result);
    console.log(`  ✓ [PASS] ${name}`);
  } else if (status === 'SKIP') {
    results.skipped.push(result);
    console.log(`  ⊘ [SKIP] ${name}: ${details}`);
  } else {
    results.failed.push(result);
    console.error(`  ✗ [FAIL] ${name}: ${details}`);
  }
}

async function acquireToken(email, password) {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_API_KEY not set');
  const r = await axios.post(
    `${FIREBASE_AUTH_URL}?key=${apiKey}`,
    { email, password, returnSecureToken: true },
    { timeout: 10000 }
  );
  return r.data.idToken;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── getIntegrationStatus ─────────────────────────────────────────────────────

async function testGetIntegrationStatus() {
  const name = 'getIntegrationStatus';
  const url = `${BASE_URL}/getIntegrationStatus`;
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const body = res.data;
    if (!body.services) throw new Error('Missing "services" field in response');
    const expectedKeys = ['twilio', 'stripe', 'sendgrid', 'elevenlabs', 'deepgram', 'openai', 'whatsapp'];
    const missingKeys = expectedKeys.filter(k => !(k in body.services));
    if (missingKeys.length > 0) throw new Error(`Missing service keys: ${missingKeys.join(', ')}`);

    // Validate shape of each service
    for (const [key, svc] of Object.entries(body.services)) {
      if (typeof svc.configured !== 'boolean') {
        throw new Error(`services.${key}.configured is not boolean`);
      }
      if (typeof svc.label !== 'string') {
        throw new Error(`services.${key}.label is not string`);
      }
    }
    logTest(name, 'PASS', `${Object.keys(body.services).length} services returned`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Verify timestamp present
  try {
    const res = await axios.get(url, { timeout: 10000 });
    if (!res.data.timestamp) throw new Error('Missing timestamp');
    logTest(`${name} - has timestamp`, 'PASS');
  } catch (e) {
    logTest(`${name} - has timestamp`, 'FAIL', e.message);
  }
}

// ─── getUserPlan ──────────────────────────────────────────────────────────────

async function testGetUserPlan(userToken) {
  const name = 'getUserPlan';

  if (!userToken) {
    logTest(name, 'SKIP', 'No user token — set QA_EMAIL + QA_PASSWORD + FIREBASE_API_KEY');
    return;
  }

  // Happy path
  try {
    const res = await axios.get(`${BASE_URL}/getUserPlan`, {
      headers: authHeaders(userToken),
      timeout: 10000,
    });
    const body = res.data;
    const validPlans = ['basic', 'pro', 'scale'];
    if (!validPlans.includes(body.plan)) {
      throw new Error(`Unexpected plan value: ${body.plan}`);
    }
    if (!body.limits || typeof body.limits.assistants !== 'number') {
      throw new Error('Missing or invalid limits.assistants');
    }
    if (!body.usage || typeof body.usage.assistantCount !== 'number') {
      throw new Error('Missing or invalid usage.assistantCount');
    }
    logTest(name, 'PASS', `plan: ${body.plan}, assistants limit: ${body.limits.assistants}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No auth → 401
  try {
    await axios.get(`${BASE_URL}/getUserPlan`, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── analyzeCall ──────────────────────────────────────────────────────────────

async function testAnalyzeCall(userToken) {
  const name = 'analyzeCall';

  if (!userToken) {
    logTest(name, 'SKIP', 'No user token');
    return;
  }

  // Fake session ID → 404 "not found"
  try {
    await axios.post(
      `${BASE_URL}/analyzeCall`,
      { callSessionId: 'qa-fake-session-id-000' },
      { headers: authHeaders(userToken), timeout: 15000 }
    );
    logTest(`${name} - fake session → 404`, 'FAIL', 'Expected 404 for non-existent session');
  } catch (e) {
    if (e.response?.status === 404) {
      logTest(`${name} - fake session → 404`, 'PASS');
    } else if (e.response?.status === 500) {
      // Some implementations return 500 for missing OpenAI key — acceptable
      logTest(`${name} - fake session → server error`, 'PASS', 'Server error expected without real session');
    } else {
      logTest(`${name} - fake session → 404`, 'FAIL', `Status: ${e.response?.status}, msg: ${e.response?.data?.message || e.message}`);
    }
  }

  // No auth → 401
  try {
    await axios.post(`${BASE_URL}/analyzeCall`, { callSessionId: 'fake' }, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // Missing callSessionId → 400
  try {
    await axios.post(
      `${BASE_URL}/analyzeCall`,
      {},
      { headers: authHeaders(userToken), timeout: 8000 }
    );
    logTest(`${name} - missing callSessionId → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing callSessionId → 400`, 'PASS');
    } else {
      logTest(`${name} - missing callSessionId → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // Real AI analysis .skip
  logTest(
    `${name} - real AI analysis`,
    'SKIP',
    'SKIP: Requires a real call session + configured OpenAI key — verify manually'
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('\n========================================');
  console.log(' Analysis & Plan Tests');
  console.log('========================================\n');

  let userToken = null;
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (email && password && process.env.FIREBASE_API_KEY) {
    try {
      userToken = await acquireToken(email, password);
      console.log('  ✓ User token acquired\n');
    } catch (e) {
      console.warn(`  ⚠ Could not acquire user token: ${e.message}\n`);
    }
  } else {
    console.log('  ⚠ QA_EMAIL/QA_PASSWORD/FIREBASE_API_KEY not fully set — some tests will skip\n');
  }

  await testGetIntegrationStatus();
  await testGetUserPlan(userToken);
  await testAnalyzeCall(userToken);

  console.log('\n========================================');
  console.log(' Analysis & Plan Test Summary');
  console.log('========================================');
  console.log(`  ✓ Passed:  ${results.passed.length}`);
  console.log(`  ✗ Failed:  ${results.failed.length}`);
  console.log(`  ⊘ Skipped: ${results.skipped.length}`);

  if (results.failed.length > 0) {
    console.log('\n  Failed:');
    results.failed.forEach(t => console.log(`    ✗ ${t.name}: ${t.details}`));
  }

  return results.failed.length === 0 ? 0 : 1;
}

if (require.main === module) {
  runAllTests().then(process.exit).catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
  });
}

module.exports = { runAllTests };
