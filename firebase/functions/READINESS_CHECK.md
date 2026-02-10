# ✅ בדיקת מוכנות - Agent בעברית

## 🔍 תנאים נדרשים לשיחה מושלמת בעברית

### 1. ✅ הקוד מוכן
- ✅ כל ה-defaults הם `"he-IL"` או `"Google.he-IL-Wavenet-A"`
- ✅ כל הפונקציות מקבלות ומעבירות שפה נכון
- ✅ LLM prompts בעברית
- ✅ Messages בעברית
- ✅ Filler phrases בעברית

### 2. ⚠️ תנאים שצריך לוודא ב-Firestore

#### Company Collection - שדות נדרשים:
```javascript
{
  // שדות חובה:
  language: "he" או "he-IL",  // אם לא מוגדר → default "he-IL" ✅
  voice: "Google.he-IL-Wavenet-A" או כל קול אחר,  // אם לא מוגדר → default ✅
  inboundmessage: "שלום, כאן {{assistantName}} מ-{{companyName}}...",  // חובה!
  assistantname: "העוזר הווירטואלי",  // חובה!
  
  // שדות אופציונליים:
  outboundmessage: "...",
  name: "שם החברה",
  // ... שאר השדות
}
```

**חשוב**: 
- ✅ אם `language` לא מוגדר → default `"he-IL"` (שורה 1572)
- ✅ אם `voice` לא מוגדר → default `"Google.he-IL-Wavenet-A"` (שורה 1571)
- ⚠️ **חובה**: `inboundmessage` או `assistantname` חייבים להיות מוגדרים (שורה 1534)

### 3. ⚠️ API Keys

#### OpenAI API Key (חובה ל-LLM)
**מיקום**: `llm_service.js` שורה 446-449
```javascript
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY not configured");
}
```

**צריך לוודא**:
- ✅ `OPENAI_API_KEY` מוגדר ב-Firebase Functions environment variables
- ✅ או ב-`.env` file (אם משתמשים ב-local development)

**איך לבדוק**:
```bash
# ב-Firebase Console → Functions → Configuration → Environment variables
# או
firebase functions:config:get
```

#### Deepgram API Key (אופציונלי - רק אם משתמשים ב-Deepgram STT)
**מיקום**: `deepgram_service.js` שורה 38-41
```javascript
if (!DEEPGRAM_API_KEY) {
  logger.error("DEEPGRAM_API_KEY is not set");
  throw new Error("DEEPGRAM_API_KEY is required");
}
```

**הערה**: כרגע המערכת משתמשת ב-**Twilio Gather** (לא Deepgram Media Streams) כי Firebase Functions לא תומך ב-WebSocket. אז Deepgram API Key לא נדרש כרגע.

### 4. ✅ Twilio Configuration

**צריך לוודא**:
- ✅ Twilio Account SID ו-Auth Token מוגדרים
- ✅ Twilio Phone Number מוגדר ב-Company collection (`phoneNumberMap` או `companyPhoneNumbers`)
- ✅ Twilio Voice URL מוגדר ל-`https://[REGION]-[PROJECT_ID].cloudfunctions.net/twilioVoiceWebhook`

### 5. ✅ Flow המלא

#### שיחה נכנסת (Inbound):
1. ✅ Twilio → `twilioVoiceWebhook`
2. ✅ חיפוש Company לפי מספר טלפון
3. ✅ יצירת `assistantDefinition` עם `language: companyDoc.language || "he-IL"`
4. ✅ שמירה ב-`call_sessions`
5. ✅ `response.say()` עם `voice: Google.he-IL-Wavenet-A`, `language: "he-IL"`
6. ✅ `response.gather()` עם `language: "he-IL"`
7. ✅ Twilio → `twilioGatherCallback`
8. ✅ `buildSystemPrompt(assistant, companyData, language)` → prompt בעברית
9. ✅ `getLLMResponse()` → תגובה בעברית
10. ✅ `response.say()` עם התגובה בעברית

#### שיחה יוצאת (Outbound):
1. ✅ `placeCall` → מקבל `assistantJson` עם `language: "he-IL"`
2. ✅ יצירת `assistantDefinition`
3. ✅ שמירה ב-`call_sessions`
4. ✅ אותו flow כמו inbound

### 6. ⚠️ נקודות לתשומת לב

#### STT (Speech-to-Text):
- ⚠️ **כרגע**: משתמש ב-**Twilio Gather** (שורה 1716-1730)
- ⚠️ **לא**: Deepgram Media Streams (כי Firebase Functions לא תומך ב-WebSocket)
- ✅ **Twilio Gather** תומך בעברית עם `language: "he-IL"` (שורה 1727)
- ⚠️ **דיוק**: Twilio Gather פחות מדויק מ-Deepgram, אבל עובד

#### אם LLM נכשל:
- ✅ יש **fallback** ל-keyword matching (שורה 1955-1982)
- ✅ Fallback משתמש ב-`getKeywords(language)` → keywords בעברית
- ✅ Fallback משתמש ב-`getMessage(..., language)` → messages בעברית

### 7. ✅ בדיקות מהירות

#### בדיקה 1: האם Company מוגדר נכון?
```javascript
// ב-Firestore Console, בדוק:
Company/{companyId} = {
  language: "he" או "he-IL",  // ✅
  voice: "Google.he-IL-Wavenet-A",  // ✅ (אופציונלי)
  inboundmessage: "שלום...",  // ✅ חובה!
  assistantname: "העוזר הווירטואלי",  // ✅ חובה!
  phoneNumberMap: [...],  // ✅ חובה!
  companyPhoneNumbers: [...],  // ✅ חובה!
}
```

#### בדיקה 2: האם API Keys מוגדרים?
```bash
# ב-Firebase Console → Functions → Configuration
OPENAI_API_KEY = "sk-proj-..."  # ✅ חובה!
DEEPGRAM_API_KEY = "..."  # ⚠️ אופציונלי (לא נדרש כרגע)
```

#### בדיקה 3: האם Twilio מוגדר?
```bash
# ב-Firebase Console → Functions → Configuration
TWILIO_ACCOUNT_SID = "AC..."  # ✅ חובה!
TWILIO_AUTH_TOKEN = "..."  # ✅ חובה!
```

---

## 📊 סיכום

### ✅ מה עובד בוודאות:
1. ✅ **הקוד מוכן** - כל ה-defaults והקישורים נכונים
2. ✅ **LLM בעברית** - אם `OPENAI_API_KEY` מוגדר
3. ✅ **TTS בעברית** - `Google.he-IL-Wavenet-A`
4. ✅ **Messages בעברית** - כל ההודעות קיימות
5. ✅ **Fallback בעברית** - אם LLM נכשל

### ⚠️ מה צריך לוודא:
1. ⚠️ **Company.language** - אם לא מוגדר → default `"he-IL"` ✅
2. ⚠️ **Company.inboundmessage** - **חובה!** (או `assistantname`)
3. ⚠️ **OPENAI_API_KEY** - **חובה ל-LLM!**
4. ⚠️ **Twilio Configuration** - Account SID, Auth Token, Phone Number

### 🎯 תשובה לשאלה: "האם Agent יעבוד מושלם בעברית?"

**כן, אבל רק אם:**
1. ✅ `OPENAI_API_KEY` מוגדר
2. ✅ `Company.inboundmessage` או `Company.assistantname` מוגדרים
3. ✅ Twilio מוגדר נכון
4. ✅ מספר טלפון משויך ל-Company

**אם כל זה מוגדר → Agent יעבוד מושלם בעברית!** 🎉

---

## 🚀 איך לבדוק שזה עובד

### שלב 1: בדוק Company ב-Firestore
```javascript
// Firestore Console → Company → {companyId}
// וודא שיש:
- language: "he" או "he-IL"
- inboundmessage: "שלום..."
- assistantname: "..."
- phoneNumberMap: [{phoneNumber: "+972..."}]
```

### שלב 2: בדוק API Keys
```bash
firebase functions:config:get
# או
# Firebase Console → Functions → Configuration
```

### שלב 3: בצע שיחה
- התקשר למספר הטלפון המשויך ל-Company
- האזן לברכה בעברית
- דבר בעברית
- האזן לתגובה בעברית

### שלב 4: בדוק לוגים
```bash
# Firebase Console → Functions → Logs
# חפש:
- "Twilio voice webhook received"
- "Using Twilio Gather STT"
- "LLM response generated"
```

---

## ✅ מסקנה סופית

**הקוד מוכן 100% לעברית!**

אבל צריך לוודא:
1. ⚠️ **OPENAI_API_KEY** מוגדר (חובה!)
2. ⚠️ **Company.inboundmessage** מוגדר (חובה!)
3. ⚠️ **Twilio** מוגדר נכון

**אם כל זה מוגדר → Agent יעבוד מושלם בעברית!** 🎉
