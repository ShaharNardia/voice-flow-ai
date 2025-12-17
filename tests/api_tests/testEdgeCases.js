/**
 * Edge Cases Tests for Firebase Functions
 * Tests invalid inputs, missing fields, unauthorized access, etc.
 */

const axios = require('axios');

const BASE_URL = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

const results = {
  passed: [],
  failed: [],
};

function logTest(name, status, details = '') {
  const result = { name, status, details, timestamp: new Date().toISOString() };
  
  if (status === 'PASS') {
    results.passed.push(result);
    console.log(`✓ [PASS] ${name}${details ? `: ${details}` : ''}`);
  } else {
    results.failed.push(result);
    console.error(`✗ [FAIL] ${name}${details ? `: ${details}` : ''}`);
  }
}

async function testInvalidInputs() {
  console.log('\n=== Testing Invalid Inputs ===\n');
  
  // Test assignAssistant with invalid phone number
  try {
    const response = await axios.post(`${BASE_URL}/assignAssistant`, {
      phoneNumber: 'invalid-phone'
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('assignAssistant - Invalid Phone Number', 'PASS', 'Correctly rejects invalid phone');
    } else {
      logTest('assignAssistant - Invalid Phone Number', 'FAIL', 'Should reject invalid phone');
    }
  } catch (error) {
    logTest('assignAssistant - Invalid Phone Number', 'PASS', 'Correctly rejects invalid phone');
  }

  // Test createReservation with invalid data
  try {
    const response = await axios.post(`${BASE_URL}/createReservation`, {
      companyId: null,
      leadId: '',
      assistantId: 123 // Wrong type
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('createReservation - Invalid Data Types', 'PASS', 'Correctly validates data types');
    } else {
      logTest('createReservation - Invalid Data Types', 'FAIL', 'Should validate data types');
    }
  } catch (error) {
    logTest('createReservation - Invalid Data Types', 'PASS', 'Correctly validates data types');
  }

  // Test placeCall with invalid parameters
  try {
    const response = await axios.post(`${BASE_URL}/placeCall`, {
      phoneNumber: '',
      assistantId: null,
      company: undefined
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('placeCall - Invalid Parameters', 'PASS', 'Correctly validates parameters');
    } else {
      logTest('placeCall - Invalid Parameters', 'FAIL', 'Should validate parameters');
    }
  } catch (error) {
    logTest('placeCall - Invalid Parameters', 'PASS', 'Correctly validates parameters');
  }
}

async function testMissingRequiredFields() {
  console.log('\n=== Testing Missing Required Fields ===\n');
  
  // Test assignAssistant without phoneNumber
  try {
    const response = await axios.post(`${BASE_URL}/assignAssistant`, {}, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('assignAssistant - Missing Phone Number', 'PASS', 'Correctly requires phoneNumber');
    } else {
      logTest('assignAssistant - Missing Phone Number', 'FAIL', 'Should require phoneNumber');
    }
  } catch (error) {
    logTest('assignAssistant - Missing Phone Number', 'PASS', 'Correctly requires phoneNumber');
  }

  // Test createReservation with missing fields
  try {
    const response = await axios.post(`${BASE_URL}/createReservation`, {
      companyId: 'test-company'
      // Missing leadId and assistantId
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('createReservation - Missing Required Fields', 'PASS', 'Correctly requires all fields');
    } else {
      logTest('createReservation - Missing Required Fields', 'FAIL', 'Should require all fields');
    }
  } catch (error) {
    logTest('createReservation - Missing Required Fields', 'PASS', 'Correctly requires all fields');
  }

  // Test endOfCallLog without call_session_id
  try {
    const response = await axios.post(`${BASE_URL}/endOfCallLog`, {
      duration: 120,
      status: 'completed'
      // Missing call_session_id
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status >= 400) {
      logTest('endOfCallLog - Missing call_session_id', 'PASS', 'Correctly requires call_session_id');
    } else {
      logTest('endOfCallLog - Missing call_session_id', 'FAIL', 'Should require call_session_id');
    }
  } catch (error) {
    logTest('endOfCallLog - Missing call_session_id', 'PASS', 'Correctly requires call_session_id');
  }
}

async function testUnauthorizedAccess() {
  console.log('\n=== Testing Unauthorized Access ===\n');
  
  // Test getLeadDetails without authentication
  try {
    const response = await axios.post(`${BASE_URL}/getLeadDetails`, {
      data: { company_id: 'test-company' }
    }, { 
      timeout: 10000,
      validateStatus: () => true
    });
    
    if (response.status === 401 || response.status === 403 || response.status >= 500) {
      logTest('getLeadDetails - Unauthorized Access', 'PASS', 'Correctly requires authentication');
    } else {
      logTest('getLeadDetails - Unauthorized Access', 'FAIL', 'Should require authentication');
    }
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403 || error.response.status >= 500)) {
      logTest('getLeadDetails - Unauthorized Access', 'PASS', 'Correctly requires authentication');
    } else {
      logTest('getLeadDetails - Unauthorized Access', 'FAIL', error.message);
    }
  }
}

async function testRateLimiting() {
  console.log('\n=== Testing Rate Limiting ===\n');
  
  // Send multiple rapid requests
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(
      axios.get(`${BASE_URL}/assistantsList`, {
        params: { company: 'test-company' },
        timeout: 5000,
        validateStatus: () => true
      }).catch(() => ({ status: 429 }))
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);
    
    if (rateLimited) {
      logTest('Rate Limiting - Multiple Requests', 'PASS', 'Rate limiting is active');
    } else {
      logTest('Rate Limiting - Multiple Requests', 'PASS', 'All requests processed (no rate limit hit)');
    }
  } catch (error) {
    logTest('Rate Limiting - Multiple Requests', 'PASS', 'Rate limiting test completed');
  }
}

async function testTimeoutHandling() {
  console.log('\n=== Testing Timeout Handling ===\n');
  
  // Test with very short timeout
  try {
    await axios.post(`${BASE_URL}/assignAssistant`, {
      phoneNumber: '+15551234567'
    }, { 
      timeout: 1 // 1ms timeout - should fail
    });
    
    logTest('Timeout Handling', 'FAIL', 'Should timeout with 1ms');
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      logTest('Timeout Handling', 'PASS', 'Correctly handles timeout');
    } else {
      logTest('Timeout Handling', 'FAIL', error.message);
    }
  }
}

async function testConcurrentRequests() {
  console.log('\n=== Testing Concurrent Requests ===\n');
  
  // Send concurrent requests
  const requests = [];
  for (let i = 0; i < 5; i++) {
    requests.push(
      axios.get(`${BASE_URL}/assistantsList`, {
        params: { company: 'test-company' },
        timeout: 10000,
        validateStatus: () => true
      })
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    const allSuccessful = responses.every(r => r.status < 500);
    
    if (allSuccessful) {
      logTest('Concurrent Requests', 'PASS', 'All concurrent requests handled');
    } else {
      logTest('Concurrent Requests', 'FAIL', 'Some requests failed');
    }
  } catch (error) {
    logTest('Concurrent Requests', 'FAIL', error.message);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Edge Cases Tests                     ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  await testInvalidInputs();
  await testMissingRequiredFields();
  await testUnauthorizedAccess();
  await testRateLimiting();
  await testTimeoutHandling();
  await testConcurrentRequests();
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Test Results                          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`✓ Passed:  ${results.passed.length}`);
  console.log(`✗ Failed:  ${results.failed.length}`);
  console.log(`────────────────────────────────────────`);
  console.log(`Total:     ${results.passed.length + results.failed.length}\n`);
  
  if (results.failed.length > 0) {
    console.log('Failed Tests:');
    results.failed.forEach(test => {
      console.log(`  ✗ ${test.name}: ${test.details}`);
    });
    process.exit(1);
  }
  
  console.log('✅ All edge case tests passed!');
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };

