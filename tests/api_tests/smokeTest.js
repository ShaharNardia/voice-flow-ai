/**
 * Smoke Tests - Basic connectivity and health checks
 * Tests non-destructive endpoints to verify system is running
 */

const axios = require('axios');

const BASE_URL = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

const results = {
  passed: [],
  failed: []
};

function logTest(name, status, details = '') {
  const timestamp = new Date().toISOString();
  const result = { name, status, details, timestamp };
  
  if (status === 'PASS') {
    results.passed.push(result);
    console.log(`✓ [PASS] ${name}`);
  } else {
    results.failed.push(result);
    console.error(`✗ [FAIL] ${name}: ${details}`);
  }
}

async function smokeTestEndpoint(name, method, url, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      timeout: 5000
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    if (response.status >= 200 && response.status < 500) {
      logTest(`${name} - Connectivity`, 'PASS', `Status: ${response.status}`);
      return true;
    } else {
      logTest(`${name} - Connectivity`, 'FAIL', `Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logTest(`${name} - Connectivity`, 'FAIL', 'Connection refused - server not running?');
    } else if (error.code === 'ENOTFOUND') {
      logTest(`${name} - Connectivity`, 'FAIL', 'DNS lookup failed - check BASE_URL');
    } else if (error.response) {
      logTest(`${name} - Connectivity`, 'PASS', `Server responding (${error.response.status})`);
      return true;
    } else {
      logTest(`${name} - Connectivity`, 'FAIL', error.message);
    }
    return false;
  }
}

async function runSmokeTests() {
  console.log('\n========================================');
  console.log('Smoke Tests - Basic Connectivity');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test read-only endpoints
  await smokeTestEndpoint('assistantsList', 'GET', '/assistantsList?company=test');
  await smokeTestEndpoint('getLeadDetails', 'POST', '/getLeadDetails', { company: 'test', limit: 1 });
  await smokeTestEndpoint('assignAssistant', 'POST', '/assignAssistant', { phoneNumber: '+10000000000' });
  await smokeTestEndpoint('getPhoneNumberFromJob', 'POST', '/getPhoneNumberFromJob', { jobId: 'smoke-test' });

  console.log('\n========================================');
  console.log('Smoke Test Summary');
  console.log('========================================');
  console.log(`✓ Passed: ${results.passed.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  console.log(`Total: ${results.passed.length + results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\n========================================');
    console.log('Failed Tests:');
    console.log('========================================');
    results.failed.forEach(test => {
      console.log(`✗ ${test.name}: ${test.details}`);
    });
  }

  return results.failed.length === 0 ? 0 : 1;
}

if (require.main === module) {
  runSmokeTests().then(exitCode => {
    process.exit(exitCode);
  });
}

module.exports = { runSmokeTests };

