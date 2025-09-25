# 🔧 Debug Guide - Vapi Phone Number Issues

## 🔍 הבעיה שתוקנה
התקבל error: `"phoneNumber.twilioPhoneNumber must be a valid phone number"` מ-API של Vapi.

**הבעיה העיקרית**: השתמשנו במספר הטלפון של הלקוח במקום במספר הטלפון של החברה שממנו יוצאת השיחה.

## ✅ התיקונים שבוצעו

### 1. **תיקון phoneNumber Format (v2)**
- ✅ תיקון `phoneNumber` מלהיות string להיות object עם Twilio properties
- ✅ הוספת פונקציה `_isValidUuid()` שבודקת UUID תקין
- ✅ תיקון השליחה של `null` במקום `"null"` כ-string
- ✅ תיקון ה-URL הכפול (double slash)

### 2. **תיקונים ב-API Call (v3)**
```dart
// לפני - שגוי (תמשנו במספר הלקוח):
"phoneNumber": {"twilioPhoneNumber": "${escapeStringForJson(number)}", "twilioAccountSid": "ACcf36ee2a4549fb9077606737abb6242a"},

// אחרי - תקין (משתמשים במספר החברה):
"phoneNumber": {"twilioPhoneNumber": "${escapeStringForJson(companyPhoneNumber)}", "twilioAccountSid": "ACcf36ee2a4549fb9077606737abb6242a"},
```

### 3. **תיקון PlaceCallCall Method**
הוספנו פרמטר `companyPhoneNumber` ל-`PlaceCallCall`:
```dart
class PlaceCallCall {
  Future<ApiCallResponse> call({
    String? name = '',
    String? number = '',  // מספר הלקוח
    String? phoneNumberId = '',
    String? companyPhoneNumber = '',  // מספר החברה שממנו יוצאת השיחה
    // ...
  })
}
```

### 4. **תיקון Base URL**
```dart
// לפני - יוצר double slash:
static String getBaseUrl() => 'https://api.vapi.ai/';

// אחרי - תקין:
static String getBaseUrl() => 'https://api.vapi.ai';
```

## 🚀 **האפליקציה המעודכנת זמינה כאן:**
**https://voiceflow-ai-202509231639.web.app**

## 🔧 איך לבדוק שהבעיה נפתרה:

### צעד 1: בדוק Phone Numbers בחברה
1. לך ל-Firebase Console
2. Firestore Database > Company collection
3. בדוק שיש `phoneNumberMap` עם ID תקין

### צעד 2: בדוק שה-phoneNumberId תקין
Phone Number ID צריך להיות בפורמט UUID:
```
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### צעד 3: בדוק ב-Network Tab
1. פתח Developer Tools (F12)
2. לך ל-Network tab
3. נסה לעשות call
4. חפש את הבקשה ל-`api.vapi.ai/call`
5. בדוק שה-`phoneNumberId` נשלח נכון

## 📋 **מה לעשות אם עדיין יש בעיות:**

### אם אין Phone Numbers:
1. לך ל-Phone Numbers page באפליקציה
2. קנה/הוסף phone number חדש
3. וודא שהוא נשמר עם UUID תקין

### אם יש Phone Numbers אבל לא עובד:
1. בדוק שה-`id` בפורמט UUID תקין
2. בדוק שהוא קשור לחברה הנכונה
3. נסה למחוק ולהוסיף שוב

### אם זה עדיין לא עובד:
1. בדוק ב-Console האם יש errors אחרים
2. בדוק שה-assistant JSON תקין
3. בדוק שיש authorization תקין ל-Vapi

## 🛡️ **ה-INDEXES נשמרו!**
כל ה-INDEXES של Firestore נשמרו ועודכנו בהצלחה:
- Call collection: 2 indexes
- Lead collection: 3 indexes

## 📞 **Support**
אם עדיין יש בעיות, בדוק:
1. Firebase Console logs
2. Browser Developer Console
3. Network requests לוודא שהנתונים נשלחים נכון
