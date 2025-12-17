# ✅ הגדרת בדיקות - Voice Flow AI

## 📦 שלב 1: התקנת תלויות

### Windows (PowerShell):
```powershell
# התקן תלויות לבדיקות API
cd tests\api_tests
npm install

# התקן תלויות לבדיקות UI
cd ..\ui
npm install
npx playwright install --with-deps

# חזור לתיקייה הראשית
cd ..\..
```

### Linux/Mac:
```bash
# התקן תלויות לבדיקות API
cd tests/api_tests
npm install

# התקן תלויות לבדיקות UI
cd ../ui
npm install
npx playwright install --with-deps

# חזור לתיקייה הראשית
cd ../..
```

---

## 🔧 שלב 2: הגדרת משתני סביבה

### לבדיקות UI:

1. צור קובץ `.env.test` בתיקייה `tests/ui/`:
```bash
cd tests/ui
copy .env.test.example .env.test  # Windows
# או
cp .env.test.example .env.test   # Linux/Mac
```

2. ערוך את הקובץ והזן את הערכים שלך:
```
BASE_URL=https://your-app-url.com
QA_EMAIL=test@example.com
QA_PASSWORD=testpassword123
```

### לבדיקות API:

**Windows PowerShell:**
```powershell
$env:FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"
```

**Windows CMD:**
```cmd
set FIREBASE_FUNCTIONS_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net
```

**Linux/Mac:**
```bash
export FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"
```

**או הוסף לקובץ `.bashrc` / `.zshrc`:**
```bash
echo 'export FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"' >> ~/.bashrc
source ~/.bashrc
```

---

## 🚀 שלב 3: הרצת בדיקות

### אפשרות 1: הרצת כל הבדיקות (מומלץ)

**Windows:**
```powershell
.\run-all-tests.ps1
```

**Linux/Mac:**
```bash
chmod +x run-all-tests.sh
./run-all-tests.sh
```

### אפשרות 2: הרצת בדיקות ספציפיות

#### בדיקות API:
```bash
cd tests/api_tests
npm test                    # כל הבדיקות
npm run test:smoke          # בדיקות smoke בלבד
npm run test:functions      # בדיקות Firebase Functions
npm run test:edge-cases     # בדיקות edge cases
npm run test:integration    # בדיקות integration
npm run test:performance    # בדיקות performance
npm run test:security       # בדיקות security
```

#### בדיקות UI:
```bash
cd tests/ui
npm test                    # כל הבדיקות
npm run test:smoke          # בדיקות smoke בלבד
npm run test:auth           # בדיקות אימות
npm run test:dashboard      # בדיקות dashboard
npm run test:assistants     # בדיקות assistants
npm run test:calls          # בדיקות calls
npm run test:leads          # בדיקות leads
npm run test:jobs           # בדיקות jobs
npm run test:billing        # בדיקות billing
npm run test:phone          # בדיקות phone numbers
npm run test:profile        # בדיקות profile
npm run test:onboarding     # בדיקות onboarding
npm run test:performance    # בדיקות performance
```

#### בדיקות Flutter Integration:
```bash
# מהתיקייה הראשית
flutter test integration_test/              # כל הבדיקות
flutter test integration_test/e2e/         # בדיקות E2E
flutter test integration_test/smoke/        # בדיקות smoke
flutter test integration_test/e2e/auth_flow_test.dart  # בדיקה ספציפית
```

---

## 📊 צפייה בתוצאות

### בדיקות UI:
- דוח HTML: `tests/ui/playwright-report/index.html`
- פתח בדפדפן: `cd tests/ui && npm run report`

### בדיקות API:
- תוצאות מוצגות בקונסול בזמן אמת

### בדיקות Flutter:
- תוצאות מוצגות בקונסול
- דוח מפורט: `flutter test --reporter expanded`

---

## ⚠️ פתרון בעיות

### בעיה: "npm: command not found"
**פתרון:** התקן Node.js מ-https://nodejs.org/

### בעיה: "flutter: command not found"
**פתרון:** התקן Flutter מ-https://flutter.dev/docs/get-started/install

### בעיה: Playwright לא מותקן
```bash
cd tests/ui
npx playwright install --with-deps
```

### בעיה: משתני סביבה לא מוגדרים
- ודא שיצרת `tests/ui/.env.test`
- ודא שהגדרת `FIREBASE_FUNCTIONS_URL`

### בעיה: "Cannot find module"
```bash
cd tests/api_tests && npm install
cd ../ui && npm install
```

### בעיה: Flutter dependencies חסרים
```bash
flutter pub get
flutter clean
flutter pub get
```

---

## 📝 הערות חשובות

1. **בדיקות UI** דורשות אפליקציה רצה - ודא שהאפליקציה זמינה ב-`BASE_URL`
2. **בדיקות API** דורשות Firebase Functions פעילים
3. **בדיקות Flutter** דורשות Flutter SDK מותקן
4. חלק מהבדיקות עלולות ליצור נתוני בדיקה - נקה אותם לאחר מכן אם נדרש

---

## ✅ בדיקה מהירה שהכל מוכן

```bash
# בדוק Node.js
node --version

# בדוק Flutter
flutter --version

# בדוק תלויות API
cd tests/api_tests && npm list --depth=0 && cd ../..

# בדוק תלויות UI
cd tests/ui && npm list --depth=0 && cd ../..

# בדוק משתני סביבה
# Windows PowerShell:
$env:FIREBASE_FUNCTIONS_URL
# Linux/Mac:
echo $FIREBASE_FUNCTIONS_URL
```

---

## 🎉 מוכן!

אם כל הבדיקות עוברות, המערכת מוכנה לפרודקשן! 🚀

למדריך מפורט יותר, ראה: `tests/RUN_TESTS.md`

