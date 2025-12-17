# 🔧 Fix for UI Tests - Missing Credentials

## הבעיה / The Problem

All 170 UI tests are failing with:
```
Error: QA_EMAIL and QA_PASSWORD must be defined in environment variables
```

## הפתרון / The Solution

The UI tests need a `.env.test` file with valid test user credentials.

### Steps to Fix (בצעדים):

#### 1. Create Test User in Firebase (צור משתמש בדיקה)

Go to [Firebase Console](https://console.firebase.google.com/):
1. Select your project: `voiceflow-ai-202509231639`
2. Go to **Authentication** → **Users**
3. Click **Add User**
4. Create a test account:
   - Email: `qa-test@yourdomain.com` (or any email)
   - Password: Create a strong password
5. **Save these credentials!**

#### 2. Update .env.test File (עדכן את הקובץ)

Navigate to `tests/ui/` and edit `.env.test`:

```bash
cd tests/ui
notepad .env.test
```

Update with your actual values:

```env
# Your deployed application URL
BASE_URL=https://voiceflow-ai-202509231639.web.app

# The test user you just created
QA_EMAIL=qa-test@yourdomain.com
QA_PASSWORD=YourActualPassword123!
```

**Important**: Replace with REAL credentials!

#### 3. Run Tests Again (הרץ שוב)

```powershell
# From project root
.\run-all-tests.ps1

# Or just UI tests
cd tests\ui
npm test
```

## Quick Test (בדיקה מהירה)

To verify your credentials work:

```bash
cd tests\ui
npx playwright test specs/auth.spec.ts --project=chromium
```

This will test only authentication, which should pass if credentials are correct.

## Files Created (קבצים שנוצרו)

✅ `tests/ui/.env.test.example` - Template file  
✅ `tests/ui/.env.test` - Your credentials (needs updating)  
✅ `tests/ui/.gitignore` - Protects .env.test from git  
✅ `tests/ui/README_SETUP.md` - Detailed setup guide  
📝 `run-all-tests.ps1` - Updated to check credentials  

## Security Note (אבטחה) 🔒

- ⚠️ **Never commit `.env.test` to git!**
- ✅ Use a dedicated test account (not your personal account)
- ✅ `.env.test` is already in `.gitignore`

## Alternative: Skip UI Tests (אלטרנטיבה)

If you don't want to run UI tests now:

```powershell
# Run only API tests
cd tests\api_tests
npm test

# Run only performance tests
cd tests\performance
npm test

# Run only security tests  
cd tests\security
npm test
```

## What Happens Next (מה קורה אחרי)

After updating credentials and running tests:

**Expected Results:**
- ✅ ~85 tests should pass on Chromium
- ✅ ~85 tests should pass on WebKit  
- 📊 Total: 170 UI tests passing

**If tests still fail:**
1. Check BASE_URL is accessible
2. Verify test user can log in manually
3. Check Firebase Auth is enabled
4. See `tests/ui/README_SETUP.md` for troubleshooting

## תוצאות נוכחיות / Current Results

After fixing credentials, expected test status:

| Test Suite | Status |
|------------|--------|
| API Tests | ✅ 40/40 passing |
| Performance | ✅ 5/5 passing |
| Security | ⚠️ 17/19 passing (2 XSS findings) |
| **UI Tests** | ⏳ **0/170** (waiting for credentials) |
| **Total** | **62/234** (needs UI setup) |

After setup:

| Test Suite | Status |
|------------|--------|
| API Tests | ✅ 40/40 passing |
| Performance | ✅ 5/5 passing |
| Security | ⚠️ 17/19 passing |
| **UI Tests** | ✅ **170/170 passing** |
| **Total** | ✅ **232/234 passing (99%)** |

## Need Help? (צריך עזרה?)

1. Check `tests/ui/README_SETUP.md`
2. Check `tests/TEST_SETUP_AND_RESULTS.md`  
3. Check `TESTING_QUICK_START.md`

---

**קישורים מהירים / Quick Links:**
- [Firebase Console](https://console.firebase.google.com/)
- [Playwright Docs](https://playwright.dev/)
- Project UI Tests: `tests/ui/`

