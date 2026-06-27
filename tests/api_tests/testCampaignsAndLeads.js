/**
 * Campaigns & Leads CRM Tests
 * Tests: campaignsCreate, campaignsList, campaignStart (.skip), campaignPause,
 *        leadsBatchCreate, leadsUpdate, leadsDelete, appointmentsList
 *
 * Requires env vars:
 *   FIREBASE_API_KEY  — Firebase web API key
 *   QA_EMAIL          — Regular user email
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

async function post(path, body, token) {
  return axios.post(`${BASE_URL}${path}`, body, {
    headers: authHeaders(token),
    timeout: 15000,
  });
}

async function get(path, token) {
  return axios.get(`${BASE_URL}${path}`, { headers: authHeaders(token), timeout: 15000 });
}

// ─── Test state ───────────────────────────────────────────────────────────────
let createdCampaignId = null;
let createdLeadId = null;

// ─── campaignsCreate ──────────────────────────────────────────────────────────

async function testCampaignsCreate(token) {
  const name = 'campaignsCreate';
  const ts = Date.now();
  try {
    const res = await post(
      '/campaignsCreate',
      {
        name: `QA Campaign ${ts}`,
        assistantId: 'qa-test-assistant',
        fromNumber: '+15550000000',
        description: 'Automated QA test campaign',
      },
      token
    );
    const body = res.data;
    const id = body.id || body.campaignId || body.campaign?.id;
    if (!id) throw new Error('Missing id in response');
    createdCampaignId = id;
    logTest(name, 'PASS', `id: ${id}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Missing name → 400
  try {
    await post('/campaignsCreate', { assistantId: 'test', fromNumber: '+15550000000' }, token);
    logTest(`${name} - missing name → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing name → 400`, 'PASS');
    } else {
      logTest(`${name} - missing name → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // No auth → 401
  try {
    await axios.post(`${BASE_URL}/campaignsCreate`, { name: 'test' }, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── campaignsList ────────────────────────────────────────────────────────────

async function testCampaignsList(token) {
  const name = 'campaignsList';
  try {
    const res = await get('/campaignsList', token);
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    logTest(name, 'PASS', `${res.data.length} campaigns`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No auth → 401
  try {
    await axios.get(`${BASE_URL}/campaignsList`, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── leadsBatchCreate ─────────────────────────────────────────────────────────

async function testLeadsBatchCreate(token) {
  const name = 'leadsBatchCreate';
  if (!createdCampaignId) {
    logTest(name, 'SKIP', 'No campaignId available (campaignsCreate failed)');
    return;
  }
  try {
    const res = await post(
      '/leadsBatchCreate',
      {
        campaignId: createdCampaignId,
        leads: [{ phone: '+15551234567', name: 'QA Lead 1' }],
      },
      token
    );
    const created = res.data.created ?? res.data.count ?? res.data.leads?.length;
    if (typeof created !== 'number') throw new Error(`Unexpected created count: ${JSON.stringify(res.data)}`);
    logTest(name, 'PASS', `created: ${created}`);

    // Store a lead ID for update/delete tests if returned
    if (res.data.leads && res.data.leads[0]) {
      createdLeadId = res.data.leads[0].id || res.data.leads[0].leadId;
    } else if (res.data.leadIds && res.data.leadIds[0]) {
      createdLeadId = res.data.leadIds[0];
    }
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Empty leads array → 400
  try {
    await post('/leadsBatchCreate', { campaignId: createdCampaignId, leads: [] }, token);
    logTest(`${name} - empty array → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - empty array → 400`, 'PASS');
    } else {
      logTest(`${name} - empty array → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // No auth → 401
  try {
    await axios.post(`${BASE_URL}/leadsBatchCreate`, { leads: [] }, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── leadsUpdate ──────────────────────────────────────────────────────────────

async function testLeadsUpdate(token) {
  const name = 'leadsUpdate';
  if (!createdLeadId) {
    logTest(name, 'SKIP', 'No lead ID available — leadsBatchCreate must return lead IDs');
    return;
  }
  try {
    await post('/leadsUpdate', { leadId: createdLeadId, status: 'callback', notes: 'QA update' }, token);
    logTest(name, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

// ─── leadsDelete ──────────────────────────────────────────────────────────────

async function testLeadsDelete(token) {
  const name = 'leadsDelete';
  if (!createdLeadId) {
    logTest(name, 'SKIP', 'No lead ID to delete');
    return;
  }
  try {
    await post('/leadsDelete', { leadId: createdLeadId }, token);
    logTest(name, 'PASS', `Deleted leadId: ${createdLeadId}`);
    createdLeadId = null;
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

// ─── campaignStart ────────────────────────────────────────────────────────────

async function testCampaignStart() {
  logTest(
    'campaignStart',
    'SKIP',
    'SKIP: Starting a campaign places real outbound calls — do not run in automated CI'
  );
}

// ─── campaignPause ────────────────────────────────────────────────────────────

async function testCampaignPause(token) {
  const name = 'campaignPause';
  if (!createdCampaignId) {
    logTest(name, 'SKIP', 'No campaignId available');
    return;
  }
  try {
    const res = await post('/campaignPause', { campaignId: createdCampaignId }, token);
    // Accept 200 success or 400 "campaign not running" — both mean the endpoint is working
    logTest(name, 'PASS', `status: ${res.data.status || 'ok'}`);
  } catch (e) {
    if (e.response?.status === 400) {
      // Campaign was never started — expected in test environment
      logTest(name, 'PASS', 'Expected 400: campaign not in running state');
    } else {
      logTest(name, 'FAIL', e.response?.data?.message || e.message);
    }
  }
}

// ─── appointmentsList ─────────────────────────────────────────────────────────

async function testAppointmentsList(token) {
  const name = 'appointmentsList';
  try {
    const res = await get('/appointmentsList', token);
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    logTest(name, 'PASS', `${res.data.length} appointments`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No auth → 401
  try {
    await axios.get(`${BASE_URL}/appointmentsList`, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('\n========================================');
  console.log(' Campaigns & Leads CRM Tests');
  console.log('========================================\n');

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!email || !password || !apiKey) {
    console.log('  ⚠ QA_EMAIL/QA_PASSWORD/FIREBASE_API_KEY not set — skipping all CRM tests');
    return 0;
  }

  let token;
  try {
    token = await acquireToken(email, password);
    console.log('  ✓ User token acquired\n');
  } catch (e) {
    console.error(`  ✗ Failed to acquire token: ${e.message}`);
    return 1;
  }

  // Order matters: create → use → delete
  await testCampaignsCreate(token);
  await testCampaignsList(token);
  await testLeadsBatchCreate(token);
  await testLeadsUpdate(token);
  await testLeadsDelete(token);
  await testCampaignStart();
  await testCampaignPause(token);
  await testAppointmentsList(token);

  // Summary
  console.log('\n========================================');
  console.log(' Campaigns & Leads Test Summary');
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
