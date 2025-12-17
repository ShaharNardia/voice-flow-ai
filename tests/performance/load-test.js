/**
 * Load Testing for Firebase Functions
 * Tests concurrent requests, response times, throughput, and error rates
 */

const axios = require('axios');

const BASE_URL = process.env.FIREBASE_FUNCTIONS_URL || 'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';

const results = {
  passed: [],
  failed: [],
  metrics: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
  },
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

async function testConcurrentApiCalls() {
  console.log('\n=== Testing Concurrent API Calls ===\n');
  
  const concurrentRequests = 20;
  const requests = [];
  const startTime = Date.now();
  
  for (let i = 0; i < concurrentRequests; i++) {
    requests.push(
      axios.get(`${BASE_URL}/assistantsList`, {
        params: { company: 'test-company' },
        timeout: 30000,
        validateStatus: () => true
      }).then(response => ({
        status: response.status,
        responseTime: Date.now() - startTime,
        success: response.status < 500
      })).catch(error => ({
        status: error.response?.status || 500,
        responseTime: Date.now() - startTime,
        success: false,
        error: error.message
      }))
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    const successful = responses.filter(r => r.success).length;
    const failed = responses.filter(r => !r.success).length;
    const responseTimes = responses.map(r => r.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    results.metrics.totalRequests = concurrentRequests;
    results.metrics.successfulRequests = successful;
    results.metrics.failedRequests = failed;
    results.metrics.averageResponseTime = avgResponseTime;
    results.metrics.minResponseTime = minResponseTime;
    results.metrics.maxResponseTime = maxResponseTime;
    
    const successRate = (successful / concurrentRequests) * 100;
    const errorRate = (failed / concurrentRequests) * 100;
    
    console.log(`Total Requests: ${concurrentRequests}`);
    console.log(`Successful: ${successful} (${successRate.toFixed(1)}%)`);
    console.log(`Failed: ${failed} (${errorRate.toFixed(1)}%)`);
    console.log(`Total Time: ${totalTime}ms`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Min Response Time: ${minResponseTime}ms`);
    console.log(`Max Response Time: ${maxResponseTime}ms`);
    
    if (successRate >= 80) {
      logTest('Concurrent API Calls', 'PASS', `Success rate: ${successRate.toFixed(1)}%`);
    } else {
      logTest('Concurrent API Calls', 'FAIL', `Success rate too low: ${successRate.toFixed(1)}%`);
    }
  } catch (error) {
    logTest('Concurrent API Calls', 'FAIL', error.message);
  }
}

async function testResponseTimes() {
  console.log('\n=== Testing Response Times ===\n');
  
  const endpoints = [
    { name: 'assistantsList', method: 'GET', url: `${BASE_URL}/assistantsList`, params: { company: 'test-company' } },
    { name: 'assignAssistant', method: 'POST', url: `${BASE_URL}/assignAssistant`, data: { phoneNumber: '+15551234567' } },
  ];
  
  for (const endpoint of endpoints) {
    const times = [];
    
    // Run 5 requests and measure times
    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      try {
        const config = {
          timeout: 10000,
          validateStatus: () => true
        };
        
        if (endpoint.method === 'GET') {
          config.params = endpoint.params;
          await axios.get(endpoint.url, config);
        } else {
          config.data = endpoint.data;
          await axios.post(endpoint.url, endpoint.data, config);
        }
        
        const responseTime = Date.now() - startTime;
        times.push(responseTime);
      } catch (error) {
        const responseTime = Date.now() - startTime;
        times.push(responseTime);
      }
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    
    console.log(`${endpoint.name}:`);
    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
    console.log(`  Max: ${maxTime}ms`);
    
    // Response time should be under 5 seconds
    if (avgTime < 5000) {
      logTest(`Response Time - ${endpoint.name}`, 'PASS', `Average: ${avgTime.toFixed(2)}ms`);
    } else {
      logTest(`Response Time - ${endpoint.name}`, 'FAIL', `Average too high: ${avgTime.toFixed(2)}ms`);
    }
  }
}

async function testThroughput() {
  console.log('\n=== Testing Throughput ===\n');
  
  const duration = 10000; // 10 seconds
  const startTime = Date.now();
  let requestCount = 0;
  let successCount = 0;
  
  while (Date.now() - startTime < duration) {
    try {
      const response = await axios.get(`${BASE_URL}/assistantsList`, {
        params: { company: 'test-company' },
        timeout: 5000,
        validateStatus: () => true
      });
      
      requestCount++;
      if (response.status < 500) {
        successCount++;
      }
    } catch (error) {
      requestCount++;
    }
  }
  
  const actualDuration = Date.now() - startTime;
  const throughput = (requestCount / actualDuration) * 1000; // requests per second
  const successRate = (successCount / requestCount) * 100;
  
  console.log(`Duration: ${actualDuration}ms`);
  console.log(`Total Requests: ${requestCount}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Throughput: ${throughput.toFixed(2)} requests/second`);
  console.log(`Success Rate: ${successRate.toFixed(1)}%`);
  
  if (throughput > 0 && successRate >= 80) {
    logTest('Throughput', 'PASS', `${throughput.toFixed(2)} req/s, ${successRate.toFixed(1)}% success`);
  } else {
    logTest('Throughput', 'FAIL', `Throughput: ${throughput.toFixed(2)} req/s, Success: ${successRate.toFixed(1)}%`);
  }
}

async function testErrorRatesUnderLoad() {
  console.log('\n=== Testing Error Rates Under Load ===\n');
  
  const loadRequests = 50;
  const requests = [];
  
  for (let i = 0; i < loadRequests; i++) {
    requests.push(
      axios.get(`${BASE_URL}/assistantsList`, {
        params: { company: 'test-company' },
        timeout: 10000,
        validateStatus: () => true
      }).then(response => ({
        success: response.status < 500,
        status: response.status
      })).catch(error => ({
        success: false,
        status: error.response?.status || 500
      }))
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    const successful = responses.filter(r => r.success).length;
    const failed = responses.filter(r => !r.success).length;
    const errorRate = (failed / loadRequests) * 100;
    
    console.log(`Total Requests: ${loadRequests}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Error Rate: ${errorRate.toFixed(1)}%`);
    
    // Error rate should be under 10%
    if (errorRate < 10) {
      logTest('Error Rate Under Load', 'PASS', `Error rate: ${errorRate.toFixed(1)}%`);
    } else {
      logTest('Error Rate Under Load', 'FAIL', `Error rate too high: ${errorRate.toFixed(1)}%`);
    }
  } catch (error) {
    logTest('Error Rate Under Load', 'FAIL', error.message);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Performance/Load Tests                ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  await testConcurrentApiCalls();
  await testResponseTimes();
  await testThroughput();
  await testErrorRatesUnderLoad();
  
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Test Results                          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`✓ Passed:  ${results.passed.length}`);
  console.log(`✗ Failed:  ${results.failed.length}`);
  console.log(`────────────────────────────────────────`);
  console.log(`Total:     ${results.passed.length + results.failed.length}\n`);
  
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Performance Metrics                   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Total Requests: ${results.metrics.totalRequests}`);
  console.log(`Successful: ${results.metrics.successfulRequests}`);
  console.log(`Failed: ${results.metrics.failedRequests}`);
  console.log(`Average Response Time: ${results.metrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`Min Response Time: ${results.metrics.minResponseTime === Infinity ? 'N/A' : results.metrics.minResponseTime + 'ms'}`);
  console.log(`Max Response Time: ${results.metrics.maxResponseTime}ms\n`);
  
  if (results.failed.length > 0) {
    console.log('Failed Tests:');
    results.failed.forEach(test => {
      console.log(`  ✗ ${test.name}: ${test.details}`);
    });
    process.exit(1);
  }
  
  console.log('✅ All performance tests passed!');
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };

