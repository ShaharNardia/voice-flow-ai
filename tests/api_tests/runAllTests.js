/**
 * Master test runner - executes all test suites
 */

const { runSmokeTests } = require('./smokeTest');
const { runAllTests: runFunctionTests } = require('./testFirebaseFunctions');
const { runAllTests: runEdgeCaseTests } = require('./testEdgeCases');
const { runAllTests: runIntegrationTests } = require('./testIntegration');
const { runAllTests: runAdminFunctionTests } = require('./testAdminFunctions');
const { runAllTests: runAnalysisAndPlanTests } = require('./testAnalysisAndPlan');
const { runAllTests: runCampaignLeadsTests } = require('./testCampaignsAndLeads');
const { runAllTests: runPerformanceTests } = require('../performance/load-test');
const { runAllTests: runSecurityTests } = require('../security/security-tests');

async function runAllTestSuites() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Voice Flow AI - Comprehensive Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  let totalFailed = 0;

  // Run smoke tests first
  console.log('→ Running Smoke Tests...\n');
  const smokeResult = await runSmokeTests();
  totalFailed += smokeResult;

  console.log('\n\n');

  // Run comprehensive function tests
  console.log('→ Running Firebase Functions Tests...\n');
  const functionResult = await runFunctionTests();
  totalFailed += functionResult;

  console.log('\n\n');

  // Run edge case tests
  console.log('→ Running Edge Case Tests...\n');
  try {
    const edgeCaseResult = await runEdgeCaseTests();
    totalFailed += edgeCaseResult;
  } catch (error) {
    console.error('Error running edge case tests:', error.message);
    totalFailed += 1;
  }

  console.log('\n\n');

  // Run integration tests
  console.log('→ Running Integration Tests...\n');
  try {
    const integrationResult = await runIntegrationTests();
    totalFailed += integrationResult;
  } catch (error) {
    console.error('Error running integration tests:', error.message);
    totalFailed += 1;
  }

  console.log('\n\n');

  // Run analysis & plan tests
  console.log('→ Running Analysis & Plan Tests...\n');
  try {
    const analysisResult = await runAnalysisAndPlanTests();
    totalFailed += analysisResult;
  } catch (error) {
    console.error('Error running analysis & plan tests:', error.message);
    totalFailed += 1;
  }

  console.log('\n\n');

  // Run campaign & leads CRM tests
  console.log('→ Running Campaign & Leads CRM Tests...\n');
  try {
    const crmResult = await runCampaignLeadsTests();
    totalFailed += crmResult;
  } catch (error) {
    console.error('Error running campaign & leads tests:', error.message);
    totalFailed += 1;
  }

  console.log('\n\n');

  // Run admin function tests (requires QA_ADMIN_EMAIL + FIREBASE_API_KEY)
  if (process.env.QA_ADMIN_EMAIL && process.env.FIREBASE_API_KEY) {
    console.log('→ Running Admin Functions Tests...\n');
    try {
      const adminResult = await runAdminFunctionTests();
      totalFailed += adminResult;
    } catch (error) {
      console.error('Error running admin function tests:', error.message);
      totalFailed += 1;
    }
    console.log('\n\n');
  } else {
    console.log('⚠ Skipping Admin Function Tests (QA_ADMIN_EMAIL or FIREBASE_API_KEY not set)\n\n');
  }

  // Run performance tests
  console.log('→ Running Performance Tests...\n');
  try {
    const performanceResult = await runPerformanceTests();
    totalFailed += performanceResult;
  } catch (error) {
    console.error('Error running performance tests:', error.message);
    totalFailed += 1;
  }

  console.log('\n\n');

  // Run security tests
  console.log('→ Running Security Tests...\n');
  try {
    const securityResult = await runSecurityTests();
    totalFailed += securityResult;
  } catch (error) {
    console.error('Error running security tests:', error.message);
    totalFailed += 1;
  }

  // Final summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Final Test Report                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  if (totalFailed === 0) {
    console.log('\n✓ ALL TESTS PASSED\n');
    console.log('The system is ready for production deployment.');
  } else {
    console.log('\n✗ SOME TESTS FAILED\n');
    console.log(`Total failed test suites: ${totalFailed}`);
    console.log('\nPlease review the failed tests above and fix the issues.');
  }

  console.log('\n');

  return totalFailed === 0 ? 0 : 1;
}

if (require.main === module) {
  runAllTestSuites().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

module.exports = { runAllTestSuites };

