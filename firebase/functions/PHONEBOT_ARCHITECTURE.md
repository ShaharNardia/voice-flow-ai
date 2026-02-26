# 🏗️ Phonebot System Architecture - תיעוד מלא

## 📋 תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [זרימת נתונים](#זרימת-נתונים)
3. [מקורות הגדרות](#מקורות-הגדרות)
4. [מיפוי שדות Company Record](#מיפוי-שדות-company-record)
5. [קבצים מרכזיים](#קבצים-מרכזיים)
6. [API Keys ו-Secrets](#api-keys-ו-secrets)

---

## 🎯 סקירה כללית

מערכת Phonebot היא מערכת שיחות AI בעברית המבוססת על:
- **Frontend**: Flutter (Dart)
- **Backend**: Firebase Functions (Node.js)
- **Database**: Firestore
- **Telephony**: Twilio Voice API
- **STT**: Deepgram / Twilio
- **TTS**: ElevenLabs / Google Cloud TTS
- **LLM**: OpenAI GPT-4o-mini

---

## 🔄 זרימת נתונים

```
┌─────────────────┐
│  Flutter App    │
│  (Frontend)     │
└────────┬────────┘
         │
         │ 1. יצירת/עדכון Company
         │    (Company Record)
         ▼
┌─────────────────┐
│   Firestore     │
│  Company Collection │
└────────┬────────┘
         │
         │ 2. קריאת הגדרות
         │    (בזמן שיחה)
         ▼
┌─────────────────┐
│ Firebase Functions│
│  Backend         │
│  ├─ voice_service.js │
│  ├─ llm_service.js   │
│  └─ deepgram_service.js │
└────────┬────────┘
         │
         ├─► 3a. Twilio Voice API
         │      (TTS + Call Routing)
         │
         ├─► 3b. Deepgram WebSocket
         │      (Real-time STT)
         │
         └─► 3c. OpenAI API
               (LLM Response)
```

### זרימת שיחה נכנסת (Inbound)

1. **Twilio מקבל שיחה** → קורא ל-`twilioVoiceWebhook`
2. **voice_service.js** מזהה את המספר הנכנס
3. **מחפש Company** ב-Firestore לפי `phoneNumberMap`
4. **יוצר call_session** עם הגדרות מה-Company
5. **משתמש ב-LLM** (llm_service.js) לבניית תגובות
6. **משתמש ב-Twilio Gather** או **Deepgram** ל-STT
7. **משתמש ב-Twilio Say** או **11labs** ל-TTS

### זרימת שיחה יוצאת (Outbound)

1. **Frontend** קורא ל-`placeCall` endpoint
2. **voice_service.js** מקבל `assistantJson` ו-`metadata`
3. **יוצר call_session** ב-Firestore
4. **מתחיל שיחה** דרך Twilio
5. **ממשיך כמו שיחה נכנסת**

---

## 📦 מקורות הגדרות

### 1. Firestore - Company Collection (מקור ראשי)

כל ההגדרות של Agent נשמרות ב-`Company` collection. כל Company = Agent אחד.

**מיקום**: `firestore://Company/{companyId}`

### 2. Firebase Functions - Environment Variables

**מיקום**: `.env` או Firebase Secrets

- `OPENAI_API_KEY` - מפתח OpenAI
- `DEEPGRAM_API_KEY` - מפתח Deepgram
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token
- `ELEVENLABS_API_KEY` - ElevenLabs API Key (ב-Secrets)

### 3. Defaults בקוד

**קבצים:**
- `firebase/functions/llm_service.js` - Default prompts, filler phrases
- `firebase/functions/voice_service.js` - Default voices, messages
- `firebase/functions/deepgram_service.js` - Default STT settings

---

## 📊 מיפוי שדות Company Record

### שדות זהות והגדרות בסיסיות

| שדה | סוג | תיאור | דוגמה |
|-----|-----|-------|-------|
| `name` | String | שם החברה | "LENCELOTECH" |
| `assistantname` | String | שם העוזר הווירטואלי | "העוזר הווירטואלי" |
| `industry` | String | תחום עיסוק | "מסעדות" |

### הגדרות TTS (Text-to-Speech)

| שדה | סוג | תיאור | ערכים אפשריים |
|-----|-----|-------|----------------|
| `agent` | String | TTS Provider | `"11labs"`, `"google"`, `"azure"` |
| `modelvoice` | String | TTS Model | `"eleven_flash_v2_5"` (11labs), `"Google.he-IL-Wavenet-A"` (Google) |
| `voice` | String | Voice ID | `"rachel"` (11labs), `"Google.he-IL-Wavenet-A"` (Google) |

**הערה**: `voice` משמש גם ל-Twilio Say (חייב להיות Twilio-compatible)

### הגדרות STT (Speech-to-Text)

| שדה | סוג | תיאור | ערכים אפשריים |
|-----|-----|-------|----------------|
| `provider` | String | STT Provider | `"deepgram"`, `"twilio"` |
| `modelname` | String | STT Model | `"nova-2"` (Deepgram) |
| `language` | String | שפת STT | `"he-IL"`, `"he"`, `"en-US"` |

**הערה**: יש גם `transcriber.provider` ו-`sttProvider` - כולם מתייחסים לאותו דבר

### הודעות

| שדה | סוג | תיאור | Placeholders |
|-----|-----|-------|--------------|
| `inboundmessage` | String | הודעה לשיחה נכנסת | `{{assistantName}}`, `{{companyName}}` |
| `outboundmessage` | String | הודעה לשיחה יוצאת | `{{assistantName}}`, `{{companyName}}`, `{{leadName}}` |

### הוראות נוספות

| שדה | סוג | תיאור | הערה |
|-----|-----|-------|------|
| `additionalInsturctions` | String | הוראות נוספות לפרומפט | ⚠️ יש typo בשם (צריך להיות `additionalInstructions`) |

**שימוש**: הוראות אלה מתווספות לפרומפט בסוף, מאפשרות התאמה אישית (למשל: "אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'")

### שירותים

| שדה | סוג | תיאור | מבנה |
|-----|-----|-------|------|
| `service` | Array | רשימת שירותים | `[{name, description, price, duration}]` |

### מספרי טלפון

| שדה | סוג | תיאור | מבנה |
|-----|-----|-------|------|
| `phoneNumberMap` | Array | מפת מספרי טלפון | `[{id, phoneNumber, label, primary, assistant, forwardingNumber}]` |
| `companyPhoneNumbers` | Array | רשימת מספרים (legacy) | `["+1234567890"]` |

**שימוש**: `phoneNumberMap` משמש לזיהוי שיחות נכנסות

### הרשאות

| שדה | סוג | תיאור |
|-----|-----|-------|
| `offerFreeEstimation` | Boolean | הצעת מחיר חינם |
| `createJobPermission` | Boolean | הרשאה ליצור תור |
| `reshedulePermission` | Boolean | הרשאה לשנות תור |
| `cancelPermission` | Boolean | הרשאה לבטל תור |
| `addNotePermission` | Boolean | הרשאה להוסיף הערה |

### הגבלות

| שדה | סוג | תיאור |
|-----|-----|-------|
| `priceRestriction` | Boolean | הגבלה על משא ומתן מחיר |
| `legalRestriction` | Boolean | הגבלה על ייעוץ משפטי |
| `medicalRestriction` | Boolean | הגבלה על ייעוץ רפואי |
| `personalQuestion` | Boolean | הגבלה על שאלות אישיות |
| `additionalRestrictionTopics` | String | נושאי הגבלה נוספים |

### הגדרות נוספות

| שדה | סוג | תיאור |
|-----|-----|-------|
| `timeZone` | String | אזור זמן | `"Asia/Jerusalem"` |
| `companyLink` | String | אתר אינטרנט |
| `fallBackNumber` | String | מספר חירום |
| `isTwentyFourBySeven` | Boolean | פעילות 24/7 |
| `aiHandleInbound` | Boolean | AI מטפל בשיחות נכנסות |
| `outboundCallHandling` | Boolean | AI מטפל בשיחות יוצאות |

### הגדרות Telephony

| שדה | סוג | תיאור |
|-----|-----|-------|
| `telephonyProvider` | String | `"twilio"` או `"asterisk"` |
| `asteriskBridgeUrl` | String | URL של Asterisk Bridge |
| `asteriskBridgeSecret` | String | Secret ל-Asterisk |
| `asteriskCallerId` | String | Caller ID ל-Asterisk |
| `defaultDdi` | String | מספר DDI ברירת מחדל |

---

## 📁 קבצים מרכזיים

### Backend (Firebase Functions)

#### `voice_service.js`
**תפקיד**: נקודת כניסה ראשית לשיחות

**Endpoints:**
- `placeCall` - יצירת שיחה יוצאת
- `twilioVoiceWebhook` - Webhook מ-Twilio (שיחות נכנסות)
- `twilioGatherCallback` - Callback מ-Twilio Gather (STT results)
- `twilioStatusCallback` - Callback מ-Twilio (status updates)

**תפקידים מרכזיים:**
- זיהוי Company לפי מספר טלפון
- יצירת call_sessions
- ניהול שיחות עם Twilio
- אינטגרציה עם LLM

#### `llm_service.js`
**תפקיד**: בניית System Prompt וקריאות ל-OpenAI

**פונקציות מרכזיות:**
- `buildSystemPrompt()` - בניית פרומפט מ-Company data
- `buildHebrewPrompt()` - פרומפט בעברית
- `buildEnglishPrompt()` - פרומפט באנגלית
- `buildArabicPrompt()` - פרומפט בערבית
- `getLLMResponse()` - קריאה ל-OpenAI API
- `getConversationHistory()` - היסטוריית שיחה
- `getRandomFiller()` - filler phrases

#### `deepgram_service.js`
**תפקיד**: אינטגרציה עם Deepgram STT

**פונקציות מרכזיות:**
- `createDeepgramConnection()` - יצירת WebSocket connection
- `normalizeLanguageForDeepgram()` - נרמול שפה

#### `twilio_media_stream.js`
**תפקיד**: טיפול ב-Media Stream מ-Twilio (real-time STT + barge-in)

**תפקידים:**
- זיהוי הפרעות (interruptions)
- Barge-in detection
- Real-time transcription

### Frontend (Flutter)

#### `lib/pages/onboarding/startup4/startup4_widget.dart`
**תפקיד**: UI להגדרת Agent

**Tabs:**
1. Greeting - הודעות, TTS, STT
2. Lead Sources - מקורות לידים
3. Services - שירותים
4. Permissions - הרשאות
5. Restrictions - הגבלות
6. Personalization - הוראות נוספות

#### `lib/pages/dispatch/calls/place_call/place_call_widget.dart`
**תפקיד**: UI ליצירת שיחה יוצאת

---

## 🔑 API Keys ו-Secrets

### Firebase Secrets

**הגדרה:**
```bash
firebase functions:secrets:set ELEVENLABS_API_KEY
```

**שימוש בקוד:**
```javascript
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
```

### Environment Variables (.env)

**מיקום**: `firebase/functions/.env` (לא ב-git!)

**נדרש:**
```
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

### Google Cloud (אוטומטי)

- Google Cloud TTS - דרך Firebase Admin SDK
- לא צריך API key נפרד

---

## 🔍 איך למצוא הגדרות

### 1. מציאת Company ID

**דרך Frontend:**
- התחבר למערכת
- Company ID נמצא ב-`currentUserDocument.company.id`

**דרך Firestore Console:**
- פתח Firestore Console
- עבור ל-`Company` collection
- מצא את ה-Company לפי `name`

### 2. מציאת מספר טלפון

**דרך Firestore:**
```javascript
const company = await db.collection("Company").doc(companyId).get();
const phoneNumbers = company.data().phoneNumberMap;
const primaryNumber = phoneNumbers.find(p => p.primary)?.phoneNumber;
```

**דרך Frontend:**
- `lib/pages/dispatch/calls/place_call/place_call_widget.dart`
- שורה 374: `company?.phoneNumberMap?.firstOrNull?.phoneNumber`

### 3. בדיקת הגדרות Agent

**דרך Firestore:**
```javascript
const company = await db.collection("Company").doc(companyId).get();
const data = company.data();

console.log("TTS Provider:", data.agent);
console.log("TTS Voice:", data.voice);
console.log("STT Provider:", data.provider);
console.log("STT Model:", data.modelname);
console.log("Language:", data.language);
console.log("Additional Instructions:", data.additionalInsturctions);
```

---

## ⚠️ בעיות ידועות

### 1. Typo בשם שדה
- **שדה**: `additionalInsturctions` (צריך להיות `additionalInstructions`)
- **פתרון**: נשתמש בשם הקיים כדי לא לשבור קוד קיים

### 2. שמות שדות לא עקביים
- `provider` / `sttProvider` / `transcriber.provider` - כולם STT provider
- `agent` / `ttsProvider` - TTS provider
- **פתרון**: הקוד תומך בכל הווריאציות

### 3. Voice Resolution
- לא כל הקולות תואמים Twilio
- **פתרון**: `resolveVoiceForLanguage()` ב-`voice_service.js` ממיר אוטומטית

---

## 📝 הערות חשובות

1. **כל ההגדרות ב-Firestore** - אין הגדרות hardcoded (חוץ מ-defaults)
2. **System Prompt נבנה דינמית** - מ-Company data + additionalInsturctions
3. **Interruptions** - מופעלים דרך Deepgram VAD + Twilio barge-in
4. **Latency** - תלוי ב-LLM (500-2000ms) + TTS (200-400ms) + STT (200-400ms)

---

## 🔗 קישורים שימושיים

- [Twilio Voice API Docs](https://www.twilio.com/docs/voice)
- [Deepgram API Docs](https://developers.deepgram.com/)
- [OpenAI API Docs](https://platform.openai.com/docs/)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/)

---

**עודכן לאחרונה**: 2025-01-XX
**גרסה**: 1.0
