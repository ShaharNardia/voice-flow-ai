# Voice Flow AI - Comprehensive Test Suite

## Overview

This directory contains comprehensive tests for both UI and Server components of the Voice Flow AI system.

## Test Structure

```
tests/
├── api_tests/              # Server/API tests
│   ├── testFirebaseFunctions.js    # Main Firebase Functions tests
│   ├── testEdgeCases.js            # Edge case tests
│   ├── testIntegration.js          # Integration workflow tests
│   ├── test-data-fixtures.js       # Test data fixtures
│   └── test-cleanup.js             # Cleanup utilities
├── ui/                     # UI tests (Playwright)
│   ├── specs/              # Test specifications
│   ├── utils/               # Helper utilities
│   └── fixtures/            # Test data fixtures
├── performance/            # Performance tests
│   └── load-test.js        # Load testing
└── security/              # Security tests
    └── security-tests.js   # Security vulnerability tests
```

## Running Tests

### Server/API Tests

```bash
cd tests/api_tests
npm install
npm test                    # Run all tests
npm run test:smoke          # Smoke tests only
npm run test:functions      # Firebase Functions tests
npm run test:edge-cases     # Edge case tests
npm run test:integration    # Integration tests
npm run test:performance    # Performance tests
npm run test:security       # Security tests
```

### UI Tests (Playwright)

```bash
cd tests/ui
npm install
npx playwright test                    # Run all UI tests
npx playwright test --grep "@smoke"    # Run smoke tests only
npx playwright test auth.spec.ts        # Run specific test file
npx playwright test --project=chromium  # Run on specific browser
```

### Flutter Integration Tests

```bash
flutter test integration_test/e2e/                    # Run all E2E tests
flutter test integration_test/smoke/                   # Run smoke tests
flutter test integration_test/e2e/auth_flow_test.dart   # Run specific test
```

## Test Coverage

### Server Tests
- ✅ All Firebase Cloud Functions (15 functions)
- ✅ Edge cases (invalid inputs, missing fields, unauthorized)
- ✅ Integration workflows (full call flow, assistant workflow)
- ✅ Performance (concurrent requests, response times, throughput)
- ✅ Security (authentication, injection, XSS, input sanitization)

### UI Tests
- ✅ Authentication (login, signup, forget password, OAuth)
- ✅ Dashboard (KPIs, activity feed, quick actions)
- ✅ Assistants (CRUD, search, filter)
- ✅ Calls (place call, call logs, details, update agent)
- ✅ Leads (CRUD, capture, upload, place call)
- ✅ Jobs/Bookings (create, edit, assign, status, reschedule)
- ✅ Billing (invoices, subscription, payment methods)
- ✅ Phone Numbers (purchase, edit, delete, route config)
- ✅ Profile & Settings (view, edit, change password)
- ✅ Onboarding (startup flow, SMTP, company setup)
- ✅ Performance (page load times, network optimization)

### Flutter Integration Tests
- ✅ Auth Flow (Login → Dashboard)
- ✅ Assistant Flow (Create → Edit → Delete)
- ✅ Call Flow (Place → View → Update)
- ✅ Lead Flow (Create → Place Call → Convert)
- ✅ Job Flow (Create → Assign → Complete)
- ✅ Billing Flow (View Invoices → Manage)
- ✅ Full App Smoke Test
- ✅ Critical Paths Test

## Environment Setup

### Required Environment Variables

Create `.env.test` file in `tests/ui/`:
```
BASE_URL=https://your-app-url.com
QA_EMAIL=test@example.com
QA_PASSWORD=testpassword123
```

### Firebase Functions URL

Set environment variable for API tests:
```bash
export FIREBASE_FUNCTIONS_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net
```

## Test Results

Test results are generated in:
- `tests/ui/playwright-report/` - Playwright HTML reports
- `test-results/` - Screenshots and videos (on failure)
- Console output - Real-time test results

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run API Tests
  run: |
    cd tests/api_tests
    npm install
    npm test

- name: Run UI Tests
  run: |
    cd tests/ui
    npm install
    npx playwright install
    npx playwright test

- name: Run Flutter Integration Tests
  run: |
    flutter test integration_test/
```

## Maintenance

- Update test data fixtures when data models change
- Update selectors when UI changes
- Add new tests for new features
- Review and update edge cases as needed

