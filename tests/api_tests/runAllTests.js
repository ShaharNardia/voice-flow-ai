/**
 * Master test runner - executes all test suites
 */

const { runSmokeTests } = require('./smokeTest');
const { runAllTests: runFunctionTests } = require('./testFirebaseFunctions');

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

