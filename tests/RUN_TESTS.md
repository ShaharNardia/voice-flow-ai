# 🧪 מדריך הרצת בדיקות - Voice Flow AI

## 📋 תוכן עניינים
1. [הכנה ראשונית](#הכנה-ראשונית)
2. [בדיקות UI (Playwright)](#בדיקות-ui-playwright)
3. [בדיקות Server/API](#בדיקות-serverapi)
4. [בדיקות Flutter Integration](#בדיקות-flutter-integration)
5. [הרצת כל הבדיקות](#הרצת-כל-הבדיקות)

---

## 🚀 הכנה ראשונית

### 1. התקנת תלויות Node.js

```bash
# התקנת תלויות לבדיקות API
cd tests/api_tests
npm install

# התקנת תלויות לבדיקות UI
cd ../ui
npm install
npx playwright install --with-deps
```

### 2. הגדרת משתני סביבה

#### לבדיקות UI:
```bash
cd tests/ui
cp .env.test.example .env.test
# ערוך את .env.test והזן את הערכים שלך:
# BASE_URL=https://your-app-url.com
# QA_EMAIL=test@example.com
# QA_PASSWORD=testpassword123
```

#### לבדיקות API:
```bash
# הגדר משתנה סביבה (Windows PowerShell)
$env:FIREBASE_FUNCTIONS_URL="https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net"

# או (Windows CMD)
set FIREBASE_FUNCTIONS_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net

# או (Linux/Mac)
export FIREBASE_FUNCTIONS_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net
```

### 3. התקנת תלויות Flutter

```bash
# מהתיקייה הראשית של הפרויקט
flutter pub get
```

---

## 🎭 בדיקות UI (Playwright)

### הרצת כל הבדיקות:
```bash
cd tests/ui
npm test
```

### הרצת בדיקות ספציפיות:
```bash
# בדיקות smoke בלבד
npm run test:smoke

# בדיקות אימות
npm run test:auth

# בדיקות dashboard
npm run test:dashboard

# בדיקות assistants
npm run test:assistants

# בדיקות calls
npm run test:calls

# בדיקות leads
npm run test:leads

# בדיקות jobs
npm run test:jobs

# בדיקות billing
npm run test:billing

# בדיקות phone numbers
npm run test:phone

# בדיקות profile
npm run test:profile

# בדיקות onboarding
npm run test:onboarding

# בדיקות performance
npm run test:performance
```

### מצבי הרצה נוספים:
```bash
# מצב UI אינטראקטיבי
npm run test:ui

# מצב debug
npm run test:debug

# צפייה בדוח HTML
npm run report
```

---

## 🔧 בדיקות Server/API

### הרצת כל הבדיקות:
```bash
cd tests/api_tests
npm test
```

### הרצת בדיקות ספציפיות:
```bash
# בדיקות smoke
npm run test:smoke

# בדיקות Firebase Functions
npm run test:functions

# בדיקות edge cases
npm run test:edge-cases

# בדיקות integration
npm run test:integration

# בדיקות performance
npm run test:performance

# בדיקות security
npm run test:security
```

---

## 📱 בדיקות Flutter Integration

### הרצת כל הבדיקות:
```bash
# מהתיקייה הראשית של הפרויקט
flutter test integration_test/
```

### הרצת בדיקות ספציפיות:
```bash
# בדיקות E2E
flutter test integration_test/e2e/

# בדיקות smoke
flutter test integration_test/smoke/

# בדיקה ספציפית
flutter test integration_test/e2e/auth_flow_test.dart
```

### הרצה על מכשיר/אמולטור:
```bash
# רשימת מכשירים זמינים
flutter devices

# הרצה על מכשיר ספציפי
flutter test integration_test/e2e/auth_flow_test.dart -d <device-id>
```

---

## 🎯 הרצת כל הבדיקות

### סקריפט מהיר (Windows PowerShell):
```powershell
# מהתיקייה הראשית
Write-Host "Running API Tests..." -ForegroundColor Cyan
cd tests/api_tests
npm test
cd ../..

Write-Host "Running UI Tests..." -ForegroundColor Cyan
cd tests/ui
npm test
cd ../..

Write-Host "Running Flutter Integration Tests..." -ForegroundColor Cyan
flutter test integration_test/
```

### סקריפט מהיר (Linux/Mac):
```bash
#!/bin/bash
# מהתיקייה הראשית

echo "Running API Tests..."
cd tests/api_tests && npm test && cd ../..

echo "Running UI Tests..."
cd tests/ui && npm test && cd ../..

echo "Running Flutter Integration Tests..."
flutter test integration_test/
```

---

## 📊 תוצאות בדיקות

### בדיקות UI:
- דוחות HTML: `tests/ui/playwright-report/index.html`
- צילומי מסך: `test-results/` (במקרה של כשלון)
- וידאו: `test-results/` (במקרה של כשלון)

### בדיקות API:
- תוצאות מוצגות בקונסול
- כל בדיקה מדווחת על PASS/FAIL

### בדיקות Flutter:
- תוצאות מוצגות בקונסול
- ניתן לראות דוח מפורט עם `flutter test --reporter expanded`

---

## ⚠️ פתרון בעיות נפוצות

### בעיה: Playwright לא מותקן
```bash
cd tests/ui
npx playwright install --with-deps
```

### בעיה: משתני סביבה לא מוגדרים
- ודא שיצרת את `.env.test` ב-`tests/ui/`
- ודא שהגדרת `FIREBASE_FUNCTIONS_URL` לבדיקות API

### בעיה: Flutter dependencies חסרים
```bash
flutter pub get
flutter clean
flutter pub get
```

### בעיה: Node modules חסרים
```bash
cd tests/api_tests && npm install
cd ../ui && npm install
```

---

## 📝 הערות חשובות

1. **בדיקות UI** דורשות אפליקציה רצה - ודא שהאפליקציה זמינה ב-`BASE_URL`
2. **בדיקות API** דורשות Firebase Functions פעילים
3. **בדיקות Flutter** דורשות Flutter SDK מותקן
4. חלק מהבדיקות עלולות ליצור נתוני בדיקה - נקה אותם לאחר מכן אם נדרש

---

## 🎉 הצלחה!

אם כל הבדיקות עוברות, המערכת מוכנה לפרודקשן! 🚀

