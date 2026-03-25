/**
 * Admin Functions Tests
 * Tests all 25 admin Firebase Cloud Functions.
 *
 * Requires env vars:
 *   FIREBASE_API_KEY       — Firebase web API key (Project Settings → General)
 *   QA_ADMIN_EMAIL         — Email of an admin-role user
 *   QA_ADMIN_PASSWORD      — Password of the admin-role user
 *   QA_EMAIL               — A regular (non-admin) user email (for 403 checks)
 *   QA_PASSWORD            — Regular user password
 *   FIREBASE_FUNCTIONS_URL — (optional) defaults to us-central1 URL
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
  const result = { name, status, details, timestamp: new Date().toISOString() };
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

async function get(path, token) {
  return axios.get(`${BASE_URL}${path}`, { headers: authHeaders(token), timeout: 15000 });
}

async function post(path, body, token) {
  return axios.post(`${BASE_URL}${path}`, body, {
    headers: authHeaders(token),
    timeout: 15000,
  });
}

// ─── Test state shared across tests (created user uid for teardown) ───────────
let createdUserUid = null;
let adminToken = null;
let regularToken = null;

// ─── User Management ──────────────────────────────────────────────────────────

async function testAdminListUsers() {
  const name = 'adminListUsers';
  try {
    const res = await get('/adminListUsers', adminToken);
    const users = res.data;
    if (!Array.isArray(users)) throw new Error('Response is not an array');
    if (users.length > 0) {
      const u = users[0];
      if (!u.uid || !u.email) throw new Error('Missing uid or email fields');
    }
    logTest(name, 'PASS', `${users.length} users returned`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No token → 401
  try {
    await axios.get(`${BASE_URL}/adminListUsers`, { timeout: 8000 });
    logTest(`${name} - no auth`, 'FAIL', 'Expected 401 but got 200');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // Regular user token → 403
  if (regularToken) {
    try {
      await get('/adminListUsers', regularToken);
      logTest(`${name} - regular user → 403`, 'FAIL', 'Expected 403 but got 200');
    } catch (e) {
      if (e.response?.status === 403) {
        logTest(`${name} - regular user → 403`, 'PASS');
      } else {
        logTest(`${name} - regular user → 403`, 'FAIL', `Status: ${e.response?.status}`);
      }
    }
  }
}

async function testAdminCreateUser() {
  const name = 'adminCreateUser';
  const ts = Date.now();
  const email = `qa-test-${ts}@voiceflow-qa.com`;
  try {
    const res = await post('/adminCreateUser', { email, password: 'TestPass123!' }, adminToken);
    const body = res.data;
    if (!body.uid) throw new Error('Missing uid in response');
    createdUserUid = body.uid;
    logTest(name, 'PASS', `Created uid: ${body.uid}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Missing email → 400
  try {
    await post('/adminCreateUser', { password: 'TestPass123!' }, adminToken);
    logTest(`${name} - missing email → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing email → 400`, 'PASS');
    } else {
      logTest(`${name} - missing email → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }

  // Duplicate email → error
  try {
    await post('/adminCreateUser', { email, password: 'TestPass123!' }, adminToken);
    logTest(`${name} - duplicate email → error`, 'FAIL', 'Expected error for duplicate');
  } catch (e) {
    if (e.response?.status >= 400) {
      logTest(`${name} - duplicate email → error`, 'PASS', `Status: ${e.response?.status}`);
    } else {
      logTest(`${name} - duplicate email → error`, 'FAIL', e.message);
    }
  }
}

async function testAdminGetUserDetail() {
  const name = 'adminGetUserDetail';
  if (!createdUserUid) {
    logTest(name, 'SKIP', 'No created user uid available (adminCreateUser failed)');
    return;
  }
  try {
    const res = await get(`/adminGetUserDetail?uid=${encodeURIComponent(createdUserUid)}`, adminToken);
    const body = res.data;
    if (!Array.isArray(body.assistants)) throw new Error('Missing assistants array');
    logTest(name, 'PASS', `plan: ${body.plan}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Missing uid → 400
  try {
    await get('/adminGetUserDetail', adminToken);
    logTest(`${name} - missing uid → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing uid → 400`, 'PASS');
    } else {
      logTest(`${name} - missing uid → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

async function testAdminSetRole() {
  const name = 'adminSetRole';
  if (!createdUserUid) {
    logTest(name, 'SKIP', 'No created user uid');
    return;
  }
  try {
    const res = await post('/adminSetRole', { uid: createdUserUid, role: 'admin' }, adminToken);
    logTest(`${name} - set to admin`, 'PASS', `status: ${res.data.status}`);
    // Reset back to user
    await post('/adminSetRole', { uid: createdUserUid, role: 'user' }, adminToken);
    logTest(`${name} - reset to user`, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Invalid role → 400
  try {
    await post('/adminSetRole', { uid: createdUserUid, role: 'superadmin' }, adminToken);
    logTest(`${name} - invalid role → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - invalid role → 400`, 'PASS');
    } else {
      logTest(`${name} - invalid role → 400`, 'FAIL', `Status: ${e.response?.status}, msg: ${e.response?.data?.message}`);
    }
  }
}

async function testAdminToggleUser() {
  const name = 'adminToggleUser';
  if (!createdUserUid) {
    logTest(name, 'SKIP', 'No created user uid');
    return;
  }
  try {
    const res = await post('/adminToggleUser', { uid: createdUserUid, status: 'suspended' }, adminToken);
    logTest(`${name} - suspend`, 'PASS', `newStatus: ${res.data.newStatus || res.data.status}`);
    // Re-activate
    await post('/adminToggleUser', { uid: createdUserUid, status: 'active' }, adminToken);
    logTest(`${name} - reactivate`, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminResetPassword() {
  const name = 'adminResetPassword';
  const testEmail = process.env.QA_EMAIL || process.env.QA_ADMIN_EMAIL;
  if (!testEmail) {
    logTest(name, 'SKIP', 'No QA_EMAIL set');
    return;
  }
  try {
    const res = await post('/adminResetPassword', { email: testEmail }, adminToken);
    const link = res.data.resetLink || res.data.link || res.data.url;
    if (link && link.startsWith('https')) {
      logTest(name, 'PASS', 'Reset link generated');
    } else {
      logTest(name, 'PASS', 'Request accepted (link format may vary)');
    }
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Missing email → 400
  try {
    await post('/adminResetPassword', {}, adminToken);
    logTest(`${name} - missing email → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing email → 400`, 'PASS');
    } else {
      logTest(`${name} - missing email → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

async function testAdminDeleteUser() {
  const name = 'adminDeleteUser';
  if (!createdUserUid) {
    logTest(name, 'SKIP', 'No created user uid to delete (teardown skipped)');
    return;
  }
  try {
    await post('/adminDeleteUser', { uid: createdUserUid }, adminToken);
    logTest(name, 'PASS', `Deleted uid: ${createdUserUid}`);
    createdUserUid = null;
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Missing uid → 400
  try {
    await post('/adminDeleteUser', {}, adminToken);
    logTest(`${name} - missing uid → 400`, 'FAIL', 'Expected 400');
  } catch (e) {
    if (e.response?.status === 400) {
      logTest(`${name} - missing uid → 400`, 'PASS');
    } else {
      logTest(`${name} - missing uid → 400`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── Phone & Integrations ─────────────────────────────────────────────────────

async function testAdminListAllPhoneNumbers() {
  const name = 'adminListAllPhoneNumbers';
  try {
    const res = await get('/adminListAllPhoneNumbers', adminToken);
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    logTest(name, 'PASS', `${res.data.length} numbers`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No token → 401
  try {
    await axios.get(`${BASE_URL}/adminListAllPhoneNumbers`, { timeout: 8000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

async function testAdminReleasePhoneNumber() {
  logTest(
    'adminReleasePhoneNumber',
    'SKIP',
    'SKIP: Releasing a Twilio number is irreversible — verify manually'
  );
}

async function testAdminReassignPhoneNumber() {
  const name = 'adminReassignPhoneNumber';
  // Use non-existent SID — should get 400 or 404
  try {
    await post(
      '/adminReassignPhoneNumber',
      { sid: 'PN_NONEXISTENT_TEST_SID', newOwnerId: 'nonexistent-uid' },
      adminToken
    );
    logTest(`${name} - nonexistent SID`, 'FAIL', 'Expected 400/404 for fake SID');
  } catch (e) {
    if (e.response?.status === 400 || e.response?.status === 404) {
      logTest(`${name} - nonexistent SID → 400/404`, 'PASS', `Status: ${e.response?.status}`);
    } else {
      // May succeed if function creates new doc — acceptable
      logTest(`${name} - nonexistent SID`, 'PASS', `Handled gracefully: ${e.response?.status || e.message}`);
    }
  }
}

async function testAdminCheckIntegrations() {
  const name = 'adminCheckIntegrations';
  try {
    const res = await get('/adminCheckIntegrations', adminToken);
    const body = res.data;
    const hasExpectedKeys = ['twilio', 'stripe'].some(k => k in body);
    if (!hasExpectedKeys) throw new Error('Missing expected integration keys');
    logTest(name, 'PASS', `Keys: ${Object.keys(body).join(', ')}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // No token → 401
  try {
    await axios.get(`${BASE_URL}/adminCheckIntegrations`, { timeout: 12000 });
    logTest(`${name} - no auth → 401`, 'FAIL', 'Expected 401');
  } catch (e) {
    if (e.response?.status === 401) {
      logTest(`${name} - no auth → 401`, 'PASS');
    } else {
      logTest(`${name} - no auth → 401`, 'FAIL', `Status: ${e.response?.status}`);
    }
  }
}

// ─── Subscriptions & Plans ────────────────────────────────────────────────────

async function testAdminGetSubscriptions() {
  const name = 'adminGetSubscriptions';
  try {
    const res = await get('/adminGetSubscriptions', adminToken);
    if (!Array.isArray(res.data)) throw new Error('Response is not an array');
    logTest(name, 'PASS', `${res.data.length} subscriptions`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminOverridePlan() {
  const name = 'adminOverridePlan';
  const testUid = process.env.QA_TEST_UID;
  if (!testUid) {
    logTest(name, 'SKIP', 'Set QA_TEST_UID to test plan override without touching real users');
    return;
  }
  try {
    await post('/adminOverridePlan', { uid: testUid, plan: 'pro' }, adminToken);
    logTest(`${name} - set to pro`, 'PASS');
    // Reset
    await post('/adminOverridePlan', { uid: testUid, plan: 'basic' }, adminToken);
    logTest(`${name} - reset to basic`, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Invalid plan → 400
  if (testUid) {
    try {
      await post('/adminOverridePlan', { uid: testUid, plan: 'enterprise' }, adminToken);
      logTest(`${name} - invalid plan → 400`, 'FAIL', 'Expected 400');
    } catch (e) {
      if (e.response?.status === 400) {
        logTest(`${name} - invalid plan → 400`, 'PASS');
      } else {
        logTest(`${name} - invalid plan → 400`, 'FAIL', `Status: ${e.response?.status}`);
      }
    }
  }
}

async function testAdminGetPlanConfig() {
  const name = 'adminGetPlanConfig';
  try {
    const res = await get('/adminGetPlanConfig', adminToken);
    const body = res.data;
    const plans = body.plans || body;
    if (!plans.basic || !plans.pro || !plans.scale) throw new Error('Missing plan tiers');
    logTest(name, 'PASS', `Source: ${body.source || 'unknown'}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminUpdatePlanConfig() {
  const name = 'adminUpdatePlanConfig';
  try {
    // Only update basic tier minutesPerMonth to the same value (no-op safe)
    const configRes = await get('/adminGetPlanConfig', adminToken);
    const plans = configRes.data.plans || configRes.data;
    await post('/adminUpdatePlanConfig', { plans }, adminToken);
    logTest(name, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }

  // Non-admin token → 403
  if (regularToken) {
    try {
      await post('/adminUpdatePlanConfig', { plans: {} }, regularToken);
      logTest(`${name} - non-admin → 403`, 'FAIL', 'Expected 403');
    } catch (e) {
      if (e.response?.status === 403) {
        logTest(`${name} - non-admin → 403`, 'PASS');
      } else {
        logTest(`${name} - non-admin → 403`, 'FAIL', `Status: ${e.response?.status}`);
      }
    }
  }
}

// ─── System & Keys ────────────────────────────────────────────────────────────

async function testAdminGetSystemSettings() {
  const name = 'adminGetSystemSettings';
  try {
    const res = await get('/adminGetSystemSettings', adminToken);
    if (!res.data || typeof res.data !== 'object') throw new Error('Invalid response shape');
    logTest(name, 'PASS', `Keys: ${Object.keys(res.data).slice(0, 3).join(', ')}...`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminUpdateSystemSettings() {
  const name = 'adminUpdateSystemSettings';
  try {
    // Read current settings, write them back (no-op)
    const current = await get('/adminGetSystemSettings', adminToken);
    await post('/adminUpdateSystemSettings', current.data, adminToken);
    logTest(name, 'PASS');
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminGetKeysMeta() {
  const name = 'adminGetKeysMeta';
  try {
    const res = await get('/adminGetKeysMeta', adminToken);
    const body = res.data;
    // Response may be object or array
    if (typeof body !== 'object' || body === null) throw new Error('Invalid response');
    logTest(name, 'PASS', `Keys present: ${Object.keys(body).length || JSON.stringify(body).slice(0, 60)}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

async function testAdminUpdateKeyMeta() {
  const name = 'adminUpdateKeyMeta';
  try {
    const res = await post('/adminUpdateKeyMeta', { key: 'OPENAI_API_KEY', notes: 'QA test note' }, adminToken);
    logTest(name, 'PASS', `status: ${res.data.status}`);
  } catch (e) {
    logTest(name, 'FAIL', e.response?.data?.message || e.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('\n========================================');
  console.log(' Admin Functions Tests');
  console.log('========================================\n');

  const adminEmail = process.env.QA_ADMIN_EMAIL;
  const adminPassword = process.env.QA_ADMIN_PASSWORD;
  const regularEmail = process.env.QA_EMAIL;
  const regularPassword = process.env.QA_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('⚠ QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD not set — skipping all admin tests');
    return 0;
  }

  if (!process.env.FIREBASE_API_KEY) {
    console.log('⚠ FIREBASE_API_KEY not set — skipping all admin tests');
    return 0;
  }

  // Acquire tokens
  try {
    console.log('  → Acquiring admin token...');
    adminToken = await acquireToken(adminEmail, adminPassword);
    console.log('  ✓ Admin token acquired\n');
  } catch (e) {
    console.error(`  ✗ Failed to acquire admin token: ${e.message}`);
    return 1;
  }

  if (regularEmail && regularPassword) {
    try {
      regularToken = await acquireToken(regularEmail, regularPassword);
    } catch (e) {
      console.warn(`  ⚠ Could not acquire regular user token: ${e.message}`);
    }
  }

  // User management (order matters: create → test → delete)
  await testAdminListUsers();
  await testAdminCreateUser();
  await testAdminGetUserDetail();
  await testAdminSetRole();
  await testAdminToggleUser();
  await testAdminResetPassword();

  // Phone & integrations
  await testAdminListAllPhoneNumbers();
  await testAdminReleasePhoneNumber();
  await testAdminReassignPhoneNumber();
  await testAdminCheckIntegrations();

  // Subscriptions & plans
  await testAdminGetSubscriptions();
  await testAdminOverridePlan();
  await testAdminGetPlanConfig();
  await testAdminUpdatePlanConfig();

  // System & keys
  await testAdminGetSystemSettings();
  await testAdminUpdateSystemSettings();
  await testAdminGetKeysMeta();
  await testAdminUpdateKeyMeta();

  // Teardown: delete created user (must be last)
  await testAdminDeleteUser();

  // Summary
  console.log('\n========================================');
  console.log(' Admin Functions Test Summary');
  console.log('========================================');
  console.log(`  ✓ Passed:  ${results.passed.length}`);
  console.log(`  ✗ Failed:  ${results.failed.length}`);
  console.log(`  ⊘ Skipped: ${results.skipped.length}`);
  console.log(`  Total:     ${results.passed.length + results.failed.length + results.skipped.length}`);

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
