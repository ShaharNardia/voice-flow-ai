# 🎯 LENCELOTECH Agent 1 - הגדרות מלאות

## 📋 סקירה כללית

תיעוד מלא של Agent 1 עבור חברת LENCELOTECH - פונבוט בעברית מושלם עבור מסעדה סינית דמיונית בשם "טייגר לילי".

---

## 📞 מספר הטלפון

### ✅ המספר הישראלי

**מספר הטלפון:** `+97237207134`

**Company ID:** `Ay8S5OCemI64r1yXfe9t`

**Company Name:** `LENCELOTECH`

**Status:** ✅ מוגדר ונכון

### איך למצוא את המספר

**דרך Firestore Console:**
1. פתח [Firestore Console](https://console.firebase.google.com/project/voiceflow-ai-202509231639/firestore)
2. עבור ל-`Company` collection
3. מצא את ה-Company עם `name: "LENCELOTECH"` או ID: `Ay8S5OCemI64r1yXfe9t`
4. פתח את ה-document
5. חפש ב-`phoneNumberMap` את המספר עם `primary: true`
6. המספר נמצא ב-`phoneNumber` field: `+97237207134`

**דרך קוד:**
```javascript
const db = getFirestore();
const companyRef = db.collection("Company").doc("LENCELOTECH_COMPANY_ID");
const companyDoc = await companyRef.get();
const phoneNumbers = companyDoc.data().phoneNumberMap;
const primaryNumber = phoneNumbers.find(p => p.primary)?.phoneNumber;
console.log("Phone number:", primaryNumber);
```

**דרך Frontend:**
- `lib/pages/dispatch/calls/place_call/place_call_widget.dart`
- המספר מוצג אוטומטית ב-UI

### וידוא שהמספר מוגדר נכון

**בדיקה ב-Firestore:**
```javascript
{
  phoneNumberMap: [
    {
      id: "twilio_sid_xxx",
      phoneNumber: "+1234567890", // המספר שלך
      label: "inbound_outbound",
      primary: true,
      assistant: "agent1"
    }
  ]
}
```

**בדיקה ב-Twilio:**
1. פתח [Twilio Console](https://console.twilio.com/)
2. עבור ל-Phone Numbers
3. ודא שהמספר מוגדר עם Voice Webhook:
   - Voice URL: `https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook`
   - HTTP Method: `POST`

---

## ⚙️ הגדרות Agent

### TTS (Text-to-Speech) - דיבור

| הגדרה | ערך | הערות |
|-------|-----|-------|
| **Provider** | `11labs` | הכי מהיר + איכות מעולה |
| **Voice** | `rachel` | קול עברי טבעי |
| **Model** | `eleven_flash_v2_5` | Flash v2.5 - הכי מהיר (latency נמוך) |

**חלופה (אם 11labs לא זמין):**
- Provider: `google`
- Voice: `Google.he-IL-Wavenet-A`
- Model: (לא נדרש)

**שדות ב-Firestore:**
```javascript
{
  agent: "11labs",           // TTS Provider
  modelvoice: "eleven_flash_v2_5",  // TTS Model
  voice: "rachel"            // Voice ID (לשימוש ב-11labs)
  // או
  voice: "Google.he-IL-Wavenet-A"  // אם משתמשים ב-Google
}
```

### STT (Speech-to-Text) - זיהוי דיבור

| הגדרה | ערך | הערות |
|-------|-----|-------|
| **Provider** | `deepgram` | הכי מדויק + מהיר |
| **Language** | `he` או `he-IL` | עברית |
| **Model** | `nova-2` | הכי מהיר + מדויק |

**שדות ב-Firestore:**
```javascript
{
  provider: "deepgram",      // STT Provider
  modelname: "nova-2",      // STT Model
  language: "he-IL"          // Language code
}
```

**הערה**: Deepgram משתמש ב-WebSocket real-time transcription עם VAD (Voice Activity Detection) להפרעות.

### LLM (Large Language Model) - בינה מלאכותית

| הגדרה | ערך | הערות |
|-------|-----|-------|
| **Provider** | `OpenAI` | (אוטומטי) |
| **Model** | `gpt-4o-mini` | הכי מהיר + יעיל |
| **Max Tokens** | `150` | תגובות קצרות (2-3 משפטים) |
| **Temperature** | `0.8` | טבעי ואנושי |

**הגדרות אלה קבועות בקוד:**
- `firebase/functions/llm_service.js` - שורה 449-451
- `firebase/functions/voice_service.js` - שורה 2175-2178

**לא צריך להגדיר ב-Firestore** - זה אוטומטי.

### הודעות (Messages)

#### Inbound Message (שיחה נכנסת)
```
שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?
```

**שדה ב-Firestore:**
```javascript
{
  inboundmessage: "שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?"
}
```

#### Outbound Message (שיחה יוצאת)
```
שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?
```

**שדה ב-Firestore:**
```javascript
{
  outboundmessage: "שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?"
}
```

**Placeholders:**
- `{{assistantName}}` - שם העוזר (מ-`assistantname`)
- `{{companyName}}` - שם החברה (מ-`name`)
- `{{leadName}}` - שם הלקוח (רק ב-outbound)

### הוראות נוספות (Additional Instructions)

**תרחיש: מסעדה סינית "טייגר לילי"**

```
אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'. תפקידך הוא לקבל הזמנות טלפוניות. שאל את הלקוח מה הוא רוצה להזמין, כמה מנות, מתי הוא רוצה לאסוף, ופרטי יצירת קשר.
```

**שדה ב-Firestore:**
```javascript
{
  additionalInsturctions: "אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'. תפקידך הוא לקבל הזמנות טלפוניות. שאל את הלקוח מה הוא רוצה להזמין, כמה מנות, מתי הוא רוצה לאסוף, ופרטי יצירת קשר."
}
```

**הערה**: השדה נקרא `additionalInsturctions` (עם typo) - זה השם הקיים ב-Firestore.

---

## 🎨 הגדרות נוספות

### זהות

```javascript
{
  name: "LENCELOTECH",
  assistantname: "העוזר הווירטואלי",
  industry: "מסעדות"
}
```

### אזור זמן

```javascript
{
  timeZone: "Asia/Jerusalem"
}
```

### הרשאות (Permissions)

```javascript
{
  offerFreeEstimation: true,        // הצעת מחיר חינם
  createJobPermission: true,        // יצירת תור
  reshedulePermission: true,         // שינוי תור
  cancelPermission: true,            // ביטול תור
  addNotePermission: true            // הוספת הערה
}
```

### הגבלות (Restrictions)

```javascript
{
  priceRestriction: false,           // אין הגבלה על משא ומתן מחיר
  legalRestriction: false,           // אין הגבלה על ייעוץ משפטי
  medicalRestriction: false,         // אין הגבלה על ייעוץ רפואי
  personalQuestion: false            // אין הגבלה על שאלות אישיות
}
```

### הגדרות שיחה

```javascript
{
  aiHandleInbound: true,            // AI מטפל בשיחות נכנסות
  outboundCallHandling: true,        // AI מטפל בשיחות יוצאות
  isTwentyFourBySeven: true         // פעילות 24/7
}
```

---

## 🔧 הגדרות Interruptions (הפרעות)

### Deepgram VAD (Voice Activity Detection)

**מוגדר אוטומטית ב-`deepgram_service.js`:**
```javascript
{
  endpointing: 300,      // End of speech detection (ms) - נמוך = מהיר יותר
  vad_events: true,      // Voice activity detection - מאפשר barge-in
  interim_results: true  // תוצאות ביניים - מאפשר interruption מהיר
}
```

### Twilio Barge-in

**מוגדר ב-`twilio_media_stream.js`:**
- זיהוי אוטומטי של הפרעות
- עצירת TTS מיד כשמזוהה דיבור
- Latency: ~200-400ms

**לא צריך הגדרה ב-Firestore** - זה אוטומטי.

---

## 📊 הגדרות Latency (עיכוב)

### צפוי

| שלב | זמן | הערות |
|-----|-----|-------|
| **TTS** | 200-400ms | תלוי ב-provider |
| **STT** | 200-400ms | Deepgram real-time |
| **LLM** | 500-2000ms | OpenAI GPT-4o-mini |
| **סה"כ** | ~1-3 שניות | תלוי ב-LLM |

### אופטימיזציה

1. **TTS**: השתמש ב-`eleven_flash_v2_5` (הכי מהיר)
2. **STT**: השתמש ב-`nova-2` (הכי מהיר)
3. **LLM**: `gpt-4o-mini` + `maxTokens: 150` (תגובות קצרות)
4. **Interruptions**: VAD מופעל אוטומטית

---

## ✅ אימות הגדרות

### בדיקה 1: Firestore

```javascript
const db = getFirestore();
const companyRef = db.collection("Company").doc("LENCELOTECH_COMPANY_ID");
const companyDoc = await companyRef.get();
const data = companyDoc.data();

console.log("Name:", data.name);
console.log("TTS Provider:", data.agent);
console.log("TTS Voice:", data.voice);
console.log("STT Provider:", data.provider);
console.log("STT Model:", data.modelname);
console.log("Language:", data.language);
console.log("Additional Instructions:", data.additionalInsturctions);
console.log("Phone Numbers:", data.phoneNumberMap);
```

### בדיקה 2: שיחה נכנסת

1. התקשר למספר הטלפון
2. ודא שהבוט עונה בעברית
3. ודא שהבוט מזהה "טייגר לילי"
4. ודא שהבוט שואל על הזמנות
5. נסה להפריע - ודא שהבוט עוצר מיד

### בדיקה 3: שיחה יוצאת

1. פתח את ה-App
2. עבור ל-"Place Call"
3. הזן מספר טלפון
4. לחץ "Call"
5. ודא שהשיחה מתחילה
6. ודא שהבוט מדבר בעברית

---

## 🐛 פתרון בעיות

### בעיה: הבוט לא עונה בעברית

**פתרון:**
1. ודא ש-`language: "he-IL"` ב-Firestore
2. ודא ש-`voice` תואם Twilio (Google.he-IL-Wavenet-A)
3. בדוק logs ב-Firebase Functions

### בעיה: הבוט לא מזהה "טייגר לילי"

**פתרון:**
1. ודא ש-`additionalInsturctions` מוגדר ב-Firestore
2. בדוק שההוראות כוללות "טייגר לילי"
3. בדוק logs ב-`llm_service.js` - System Prompt

### בעיה: אין הפרעות (interruptions)

**פתרון:**
1. ודא ש-`provider: "deepgram"` ב-Firestore
2. ודא ש-Deepgram WebSocket מופעל
3. בדוק logs ב-`twilio_media_stream.js`

### בעיה: Latency גבוה

**פתרון:**
1. ודא ש-`modelvoice: "eleven_flash_v2_5"` (11labs)
2. ודא ש-`modelname: "nova-2"` (Deepgram)
3. ודא ש-`maxTokens: 150` ב-LLM

---

## 📝 Company Record מלא (דוגמה)

```javascript
{
  name: "LENCELOTECH",
  assistantname: "העוזר הווירטואלי",
  industry: "מסעדות",
  language: "he-IL",
  timeZone: "Asia/Jerusalem",
  
  // TTS
  agent: "11labs",
  modelvoice: "eleven_flash_v2_5",
  voice: "rachel",
  
  // STT
  provider: "deepgram",
  modelname: "nova-2",
  
  // Messages
  inboundmessage: "שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
  outboundmessage: "שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
  
  // Additional Instructions
  additionalInsturctions: "אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'. תפקידך הוא לקבל הזמנות טלפוניות. שאל את הלקוח מה הוא רוצה להזמין, כמה מנות, מתי הוא רוצה לאסוף, ופרטי יצירת קשר.",
  
  // Permissions
  offerFreeEstimation: true,
  createJobPermission: true,
  reshedulePermission: true,
  cancelPermission: true,
  addNotePermission: true,
  
  // Restrictions
  priceRestriction: false,
  legalRestriction: false,
  medicalRestriction: false,
  personalQuestion: false,
  
  // Call Handling
  aiHandleInbound: true,
  outboundCallHandling: true,
  isTwentyFourBySeven: true,
  
  // Phone Numbers
  phoneNumberMap: [
    {
      id: "twilio_sid_xxx",
      phoneNumber: "+1234567890",
      label: "inbound_outbound",
      primary: true,
      assistant: "agent1"
    }
  ]
}
```

---

## 🔗 קישורים שימושיים

- [Firestore Console](https://console.firebase.google.com/project/voiceflow-ai-202509231639/firestore)
- [Twilio Console](https://console.twilio.com/)
- [Firebase Functions Logs](https://console.firebase.google.com/project/voiceflow-ai-202509231639/functions/logs)

---

**עודכן לאחרונה**: 2025-01-XX
**גרסה**: 1.0
