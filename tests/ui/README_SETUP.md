# UI Tests Setup Guide

## Quick Setup

### 1. Configure Test Credentials

Create or update the `.env.test` file with your test credentials:

```bash
cd tests/ui
cp .env.test.example .env.test
```

Then edit `.env.test` with your actual values:

```env
# Base URL - your deployed application URL
BASE_URL=https://your-app-url.web.app

# Test User Credentials
QA_EMAIL=your-test-user@example.com
QA_PASSWORD=YourActualTestPassword123!
```

### 2. Create Test User

1. Go to Firebase Console → Authentication
2. Create a new user with email/password
3. Use these credentials in `.env.test`
4. Make sure this user has access to all features being tested

### 3. Install Dependencies

```bash
npm install
npx playwright install --with-deps
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run specific browser
npx playwright test --project=chromium

# Run with UI mode
npx playwright test --ui

# Run specific test file
npx playwright test specs/auth.spec.ts
```

## Important Notes

⚠️ **Security**: Never commit `.env.test` with real credentials to version control!

✅ **Best Practice**: Use a dedicated QA test account, not a production user

📝 **Test Data**: The test user should have access to test data and features

## Troubleshooting

### Error: QA_EMAIL and QA_PASSWORD must be defined

**Solution**: Make sure `.env.test` file exists in `tests/ui/` directory with valid credentials

### Tests failing with authentication errors

**Solution**: 
1. Verify credentials are correct
2. Check if BASE_URL is accessible
3. Ensure test user account is active in Firebase

### Playwright browsers not installed

**Solution**: Run `npx playwright install --with-deps`

## Test Structure

```
tests/ui/
├── .env.test              # Your credentials (DO NOT COMMIT)
├── .env.test.example      # Template file
├── playwright.config.ts   # Playwright configuration
├── specs/                 # Test files
│   ├── auth.spec.ts      # Authentication tests
│   ├── dashboard.spec.ts # Dashboard tests
│   └── ...
├── utils/                 # Helper functions
│   ├── session.ts        # Login helpers
│   └── helpers.ts        # Common utilities
└── fixtures/             # Test data
    └── test-data.ts      # Shared test data
```

## Running from Root

You can also use the master test script from the project root:

```powershell
.\run-all-tests.ps1
```

This will automatically:
- Check for `.env.test`
- Install dependencies
- Run all test suites including UI tests

##View Test Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

Or open `playwright-report/index.html` in your browser.

## CI/CD Integration

For CI/CD pipelines, set environment variables:

```yaml
env:
  BASE_URL: ${{ secrets.TEST_BASE_URL }}
  QA_EMAIL: ${{ secrets.QA_EMAIL }}
  QA_PASSWORD: ${{ secrets.QA_PASSWORD }}
```

---

**Need Help?** Check the main testing documentation in `tests/TEST_SETUP_AND_RESULTS.md`

