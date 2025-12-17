# 🚀 Quick Start - Running Tests

## Windows (PowerShell)

```powershell
# 1. התקן תלויות
cd tests/api_tests
npm install
cd ../ui
npm install
npx playwright install --with-deps
cd ../..

# 2. הגדר משתני סביבה
# לבדיקות UI - צור tests/ui/.env.test:
# BASE_URL=https://your-app-url.com
# QA_EMAIL=test@example.com
# QA_PASSWORD=testpassword123

# לבדיקות API - הגדר משתנה סביבה:
$env:FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"

# 3. הרץ את כל הבדיקות
.\run-all-tests.ps1

# או הרץ בדיקות ספציפיות:
cd tests/api_tests
npm test

cd ../ui
npm test

cd ../..
flutter test integration_test/
```

## Linux/Mac (Bash)

```bash
# 1. התקן תלויות
cd tests/api_tests && npm install && cd ../ui && npm install && npx playwright install --with-deps && cd ../..

# 2. הגדר משתני סביבה
# לבדיקות UI - צור tests/ui/.env.test:
# BASE_URL=https://your-app-url.com
# QA_EMAIL=test@example.com
# QA_PASSWORD=testpassword123

# לבדיקות API - הגדר משתנה סביבה:
export FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"

# 3. הרץ את כל הבדיקות
chmod +x run-all-tests.sh
./run-all-tests.sh

# או הרץ בדיקות ספציפיות:
cd tests/api_tests && npm test
cd ../ui && npm test
cd ../.. && flutter test integration_test/
```

## בדיקות מהירות (Smoke Tests)

```bash
# API Smoke Tests
cd tests/api_tests
npm run test:smoke

# UI Smoke Tests
cd tests/ui
npm run test:smoke
```

## פתרון בעיות

### Node.js לא מותקן
```bash
# הורד מ: https://nodejs.org/
# או עם Chocolatey (Windows):
choco install nodejs

# או עם Homebrew (Mac):
brew install node
```

### Flutter לא מותקן
```bash
# הורד מ: https://flutter.dev/docs/get-started/install
# הוסף ל-PATH
```

### Playwright לא מותקן
```bash
cd tests/ui
npx playwright install --with-deps
```

### משתני סביבה חסרים
- ודא שיצרת `tests/ui/.env.test` עם הערכים הנדרשים
- ודא שהגדרת `FIREBASE_FUNCTIONS_URL` לבדיקות API

## מידע נוסף

למדריך מפורט, ראה: `tests/RUN_TESTS.md`

