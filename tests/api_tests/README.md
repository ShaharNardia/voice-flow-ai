# Voice Flow AI - API Test Suite

## Overview
This test suite validates all Firebase Cloud Functions, including the migrated N8N workflows and VAPI replacements.

**Latest Test Run:** ✅ **ALL TESTS PASSED** (11/11 passed, 4 skipped)  
See [TEST_RESULTS.md](TEST_RESULTS.md) for detailed results.

## Prerequisites
1. Node.js installed
2. Firebase project deployed with functions
3. Environment variable set (optional):
   ```bash
   export FIREBASE_FUNCTIONS_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net
   ```

## Quick Start

```bash
cd tests/api_tests
npm install
npm test
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Smoke tests only (connectivity)
npm run test:smoke

# Firebase Functions tests only
npm run test:functions
```

## Test Coverage

### ✅ Migrated N8N Workflows (6/6 Passing)
- ✓ Assign Assistant to Inbound Call
- ✓ Book Reservation
- ✓ End of Call Log
- ✓ Get Leads
- ✓ Get Phone Number From Job ID
- ✓ Transfer Call Flow

### ✅ VAPI Replacement Functions (5/5 Passing)
- ✓ Assistants List
- ✓ Assistants Create
- ✓ Assistants Update
- ✓ Assistants Delete
- ✓ Place Call

### ⊗ Excluded Tests (Per User Request)
- ⊗ Stripe integrations (purchase/removal)
- ⊗ Twilio phone number purchase
- ⊗ Twilio phone number removal
- ⊗ Phone number configuration (Twilio)

## Test Results Format

Tests output:
- ✓ **PASS** - Test succeeded
- ✗ **FAIL** - Test failed (with details)
- ○ **SKIP** - Test skipped (excluded per user request)

## Latest Results Summary

```
╔════════════════════════════════════════╗
║  Voice Flow AI - Test Results         ║
╚════════════════════════════════════════╝

✓ Passed:  11
✗ Failed:   0
○ Skipped:  4
───────────────
Total:     15

✅ ALL TESTS PASSED
The system is ready for production deployment.
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run API Tests
  run: |
    cd tests/api_tests
    npm install
    npm test
  
- name: Check Test Results
  run: |
    if [ -f tests/api_tests/TEST_RESULTS.md ]; then
      cat tests/api_tests/TEST_RESULTS.md
    fi
```

## Troubleshooting

### Connection Refused
- Ensure Firebase Functions are deployed: `firebase deploy --only functions`
- Check Firebase Console for function status
- Verify FIREBASE_FUNCTIONS_URL is correct

### Authentication Errors
- `getLeadDetails` requires authentication (Firebase Callable function)
- Test validates that it correctly rejects unauthenticated requests
- For authenticated testing, add Firebase Admin SDK token

### Timeout Errors
- Default timeout: 10000ms (10 seconds)
- Increase if needed in test files
- Check function cold-start times in Firebase Console

### Test Failures
1. Review detailed error in console output
2. Check Firebase Functions logs: `firebase functions:log`
3. Verify function environment variables are set
4. Ensure Firestore has required indexes

## Test Infrastructure

### Files
- `runAllTests.js` - Master test runner
- `testFirebaseFunctions.js` - Comprehensive API tests
- `smokeTest.js` - Basic connectivity tests
- `detailedTest.js` - Detailed error reporting
- `TEST_RESULTS.md` - Latest test results report

### Test Strategy
1. **Smoke Tests** - Verify basic connectivity
2. **Validation Tests** - Ensure proper error handling
3. **Success Tests** - Verify successful operations
4. **Security Tests** - Validate authentication requirements

## Next Steps

1. ✅ All tests passing - ready for production
2. Consider adding authenticated integration tests
3. Set up automated daily testing in CI/CD
4. Add monitoring and alerting for production APIs
5. Implement load testing for high-traffic scenarios

