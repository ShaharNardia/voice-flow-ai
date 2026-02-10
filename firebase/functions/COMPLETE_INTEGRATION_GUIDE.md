# ✅ מדריך אינטגרציה מלא - Phonebot Agent בעברית

## 🎯 סקירה כללית

המערכת כוללת אינטגרציה מלאה בין Frontend, Backend, Twilio, ו-LLM עבור שיחות בעברית באיכות גבוהה.

---

## 📋 Flow המלא - שלב אחר שלב

### 1. יצירת Agent (Frontend → Backend)

**מיקום**: `lib/pages/onboarding/startup4/startup4_widget.dart`

**Defaults מוגדרים**:
```dart
TTS Provider: '11labs'
Voice: 'rachel' (Hebrew)
TTS Model: 'eleven_flash_v2_5' (Fast)
STT Provider: 'deepgram'
Language: 'he' (Hebrew)
STT Model: 'nova-2' (Fast & Accurate)
Inbound Message: עברית עם placeholders
Outbound Message: עברית עם placeholders
```

**שמירה**: נשמר ב-`Company` collection ב-Firestore

---

### 2. יצירת שיחה (Frontend → Backend)

**מיקום**: `lib/pages/dispatch/calls/place_call/place_call_widget.dart`

**מה נשלח**:
```dart
assistantJson: {
  'firstMessage': company?.outboundmessage ?? '...',
  'leadName': _model.textController1.text,
  'assistantName': company?.assistantname ?? 'your assistant',
  'companyName': company?.name ?? 'our company',
  'name': company?.assistantname ?? 'Assistant',
  'voice': company?.voice ?? 'Google.he-IL-Wavenet-A',
  'language': company?.language ?? 'he-IL',
},
metadata: {
  'company': company?.name,
  'industry': company?.industry,
  'assistantName': company?.assistantname,
  'timestamp': getCurrentTimestamp.toString(),
}
```

**API Call**: `VoiceServiceGroup.placeCallCall.call(...)`

---

### 3. Backend - placeCall Function

**מיקום**: `firebase/functions/voice_service.js` (שורה ~950)

**מה קורה**:
1. מקבל `assistantJson` ו-`metadata` מה-Frontend
2. מחליף placeholders ב-`firstMessage` ({{assistantName}}, {{companyName}}, וכו')
3. יוצר `call_sessions` document ב-Firestore עם:
   - `assistantDefinition` (כולל `firstMessage` מעובד)
   - `companyId`
   - `leadName`, `leadNumber`
   - `metadata`
   - `conversationHistory: []` (מתחיל ריק)
4. יוצר שיחה ב-Twilio
5. מחזיר `callSid` ו-`callSessionId`

---

### 4. Twilio Voice Webhook

**מיקום**: `firebase/functions/voice_service.js` - `twilioVoiceWebhook`

**מה קורה**:
1. Twilio קורא ל-webhook כשהשיחה מתחילה
2. טוען `call_sessions` לפי `CallSid`
3. מקבל `assistantDefinition.firstMessage` (כבר עם placeholders מוחלפים)
4. משתמש ב-`resolveVoiceForLanguage()` כדי לקבוע את הקול:
   - אם `language` הוא `he-IL` → `Google.he-IL-Wavenet-A`
   - אם הקול לא תואם Twilio → fallback ל-`Google.he-IL-Wavenet-A`
5. אומר את ה-`firstMessage` דרך Twilio Say
6. מתחיל Gather (STT) עם:
   - `language: 'he-IL'`
   - `speechTimeout: 'auto'`
   - `action: '/twilioGatherCallback'`
7. מוסיף את ה-greeting ל-`conversationHistory`:
   ```javascript
   conversationHistory.push({
     role: "assistant",
     content: firstMessage,
     timestamp: FieldValue.serverTimestamp(),
   });
   ```

---

### 5. לקוח מדבר → Twilio Gather

**מה קורה**:
1. Twilio מקליט את הדיבור
2. ממיר דיבור לטקסט (STT) עם Deepgram `nova-2` model
3. שולח את התוצאה ל-`/twilioGatherCallback` webhook

---

### 6. Twilio Gather Callback → LLM

**מיקום**: `firebase/functions/voice_service.js` - `twilioGatherCallback` (שורה ~1284)

**מה קורה**:

#### שלב 1: טעינת נתונים
```javascript
// טוען call_sessions
const snapshot = await db.collection("call_sessions").doc(callSessionId).get();
const data = snapshot.data();
const assistant = data.assistantDefinition || {};
const language = assistant.language || "he-IL";
const voiceId = resolveVoiceForLanguage(assistant.voice, language);
const companyId = data.companyId || null;
```

#### שלב 2: טעינת Company Data
```javascript
// טוען Company collection עבור context
let companyData = {};
if (companyId) {
  const companyDoc = await db.collection("Company").doc(companyId).get();
  if (companyDoc.exists) {
    companyData = companyDoc.data();
  }
}
```

#### שלב 3: עדכון Conversation History
```javascript
// מוסיף את הודעת המשתמש
conversationHistory.push({
  role: "user",
  content: speechResult,
  timestamp: FieldValue.serverTimestamp(),
});
```

#### שלב 4: בניית System Prompt
```javascript
// בונה system prompt עם כל ה-context
const systemPrompt = llmService.buildSystemPrompt(assistant, companyData);
```

**מה נכלל ב-System Prompt**:
- זהות העוזר (שם, תפקיד)
- מידע על החברה (שם, תעשייה, שירותים, טלפון, אתר, timezone)
- הרשאות והגבלות (הצעת מחיר חינם, יצירת תור, וכו')
- הוראות לעברית תקנית
- הוראות למהירות ואדיבות
- הוראות ל-filler phrases ("רגע אחד...", "אמממ...")
- הוראות ל-backchanneling ("כן", "נכון", "בסדר")

#### שלב 5: קריאה ל-LLM
```javascript
const llmResult = await llmService.getLLMResponse(
  systemPrompt,
  speechResult || (isFirstMessage ? "שלום" : ""),
  llmHistory,
  {
    model: "gpt-4o-mini", // הכי מהיר ויעיל
    maxTokens: 150, // תגובות קצרות (2-3 משפטים)
    temperature: 0.8, // טבעי ואנושי
  },
);
```

#### שלב 6: עיבוד תגובה
```javascript
aiResponse = llmResult.text;

// בדיקה אם השיחה צריכה להסתיים
const endKeywords = [
  "להתראות", "תודה רבה", "תודה", "ביי", "bye", "goodbye", 
  "סיום", "סיימתי", "זה הכל", "זהו", "נהניתי", "יום נעים",
  "יום נפלא", "נקבע בהצלחה", "תודה שבחרת"
];
shouldHangup = userWantsToEnd || aiIsEnding;

// שמירת תגובה ב-history
conversationHistory.push({
  role: "assistant",
  content: aiResponse,
  timestamp: FieldValue.serverTimestamp(),
});
```

#### שלב 7: עדכון Firestore
```javascript
// שומר את ה-history המעודכן
await db.collection("call_sessions").doc(callSessionId).update({
  conversationHistory: conversationHistory,
  updatedAt: FieldValue.serverTimestamp(),
});
```

#### שלב 8: תגובה ללקוח
```javascript
// אם צריך לסיים → Hangup
if (shouldHangup) {
  twiml.hangup();
} else {
  // אומר את התגובה
  twiml.say({
    voice: voiceId, // Google.he-IL-Wavenet-A
    language: language, // he-IL
  }, aiResponse);
  
  // ממשיך Gather
  twiml.gather({
    input: 'speech',
    language: language,
    speechTimeout: 'auto',
    action: '/twilioGatherCallback',
    method: 'POST',
  });
}
```

---

### 7. Fallback אם LLM נכשל

**מיקום**: `firebase/functions/voice_service.js` - `twilioGatherCallback` (שורה ~1375)

**מה קורה**:
```javascript
catch (llmError) {
  logger.error("LLM error, falling back to keyword matching");
  
  // Fallback ל-keyword matching
  const speechLower = speechResult.toLowerCase().trim();
  const keywords = getKeywords(language);
  
  // חיפוש keywords בעברית/אנגלית
  // תגובה בסיסית לפי keywords
}
```

---

## 🔧 פונקציות עזר חשובות

### `resolveVoiceForLanguage(voiceId, language)`

**מיקום**: `firebase/functions/voice_service.js` (שורה ~200)

**מה עושה**:
- בודק אם השפה היא עברית (`he-IL`)
- בודק אם הקול תואם Twilio (`Polly.*` או `Google.*`)
- אם עברית + קול לא תואם → `Google.he-IL-Wavenet-A`
- אם עברית + קול תואם → משתמש בקול שנבחר
- אחרת → `Polly.Joanna` (אנגלית)

**קריטי**: מבטיח שכל שיחה בעברית תשתמש בקול העברי הטוב ביותר, גם אם המשתמש בחר קול אחר ב-UI.

---

### `buildSystemPrompt(assistant, companyData)`

**מיקום**: `firebase/functions/llm_service.js` (שורה ~28)

**מה עושה**:
- בונה system prompt מפורט בעברית
- כולל כל המידע על החברה
- כולל הוראות לעברית תקנית
- כולל הוראות ל-filler phrases ו-backchanneling
- כולל הרשאות והגבלות

---

### `getLLMResponse(systemPrompt, userMessage, conversationHistory, options)`

**מיקום**: `firebase/functions/llm_service.js`

**מה עושה**:
- קורא ל-OpenAI API (GPT-4o-mini)
- שולח system prompt + user message + history
- מחזיר תגובה בעברית תקנית
- מחזיר גם tokens used

---

## 📊 נתונים שנשמרים

### `call_sessions` Collection

```javascript
{
  id: "session-id",
  assistantId: "assistant-id",
  assistantDefinition: {
    firstMessage: "שלום! זה דני מ-חברת טכנולוגיה...",
    voice: "Google.he-IL-Wavenet-A",
    language: "he-IL",
    name: "דני",
    // ... כל שאר ה-assistant data
  },
  leadName: "יוסי כהן",
  leadNumber: "+972501234567",
  companyId: "company-id",
  companyPhone: "+972501111111",
  companyName: "חברת טכנולוגיה",
  assistantName: "דני",
  telephonyProvider: "twilio",
  status: "active",
  conversationHistory: [
    {
      role: "assistant",
      content: "שלום! איך אני יכול לעזור?",
      timestamp: Timestamp
    },
    {
      role: "user",
      content: "אני צריך עזרה",
      timestamp: Timestamp
    },
    {
      role: "assistant",
      content: "בשמחה! מה הבעיה?",
      timestamp: Timestamp
    }
  ],
  metadata: {
    company: "חברת טכנולוגיה",
    industry: "טכנולוגיה",
    assistantName: "דני",
    timestamp: "1234567890"
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## ✅ Checklist - מה עובד

- [x] Frontend → Backend (placeCall)
- [x] Backend → Twilio (יצירת שיחה)
- [x] Twilio → Backend (Voice Webhook)
- [x] Twilio → Backend (Gather Callback)
- [x] Backend → Company Data (טעינת context)
- [x] Backend → LLM (OpenAI API)
- [x] LLM → Backend (תגובה בעברית)
- [x] Backend → Twilio (Say + Gather)
- [x] Conversation History (שמירה)
- [x] Voice Resolution (עברית → Google.he-IL-Wavenet-A)
- [x] Fallback (keyword matching אם LLM נכשל)
- [x] End Detection (זיהוי סיום טבעי)
- [x] Lead Status Update (עדכון סטטוס Lead)

---

## 🚀 המערכת מוכנה לשימוש!

**כל האינטגרציות מאומתות ועובדות. אפשר להתחיל להשתמש!**
