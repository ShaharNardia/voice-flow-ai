# 📋 הוראות הגדרת LENCELOTECH Agent 1

## 🎯 סקירה

מדריך זה מסביר איך להגדיר את Agent 1 עבור LENCELOTECH עם תרחיש "טייגר לילי" במסעדה סינית.

---

## 📝 שלב 1: הפעלת הסקריפט

### אופציה A: יצירת Company חדש

```bash
cd firebase/functions
node setup_lencelotech_agent.js
```

זה יוצר Company record חדש עם כל ההגדרות.

### אופציה B: עדכון Company קיים

```bash
cd firebase/functions
node setup_lencelotech_agent.js COMPANY_ID
```

החלף `COMPANY_ID` ב-ID של ה-Company הקיים ב-Firestore.

---

## 📞 שלב 2: הוספת מספר טלפון

### 2.1 מציאת מספר טלפון ב-Twilio

1. פתח [Twilio Console](https://console.twilio.com/)
2. עבור ל-Phone Numbers
3. בחר את המספר שבו תרצה להשתמש
4. העתק את המספר (פורמט: `+1234567890`)

### 2.2 הוספת המספר ל-Firestore

1. פתח [Firestore Console](https://console.firebase.google.com/project/voiceflow-ai-202509231639/firestore)
2. עבור ל-`Company` collection
3. מצא את ה-Company שיצרת (שם: "LENCELOTECH")
4. לחץ על ה-document
5. לחץ על "Add field"
6. שם השדה: `phoneNumberMap`
7. סוג: Array
8. הוסף אובייקט:
   ```json
   {
     "id": "twilio_sid_xxx",
     "phoneNumber": "+1234567890",
     "label": "inbound_outbound",
     "primary": true,
     "assistant": "agent1"
   }
   ```
9. החלף:
   - `twilio_sid_xxx` - Twilio SID של המספר (מהטבלה ב-Twilio Console)
   - `+1234567890` - המספר שלך

### 2.3 הגדרת Webhook ב-Twilio

1. ב-Twilio Console, עבור ל-Phone Numbers
2. לחץ על המספר שלך
3. גלול ל-"Voice & Fax"
4. ב-"A CALL COMES IN", הגדר:
   - **Webhook URL**: `https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook`
   - **HTTP Method**: `POST`
5. שמור

---

## ✅ שלב 3: אימות

### 3.1 בדיקת Firestore

ודא שהשדות הבאים מוגדרים:

- ✅ `name`: "LENCELOTECH"
- ✅ `assistantname`: "העוזר הווירטואלי"
- ✅ `language`: "he-IL"
- ✅ `agent`: "11labs" (או "google")
- ✅ `voice`: "rachel" (או "Google.he-IL-Wavenet-A")
- ✅ `provider`: "deepgram"
- ✅ `modelname`: "nova-2"
- ✅ `additionalInsturctions`: מכיל "טייגר לילי"
- ✅ `phoneNumberMap`: מכיל את המספר שלך

### 3.2 בדיקת Twilio

ודא ש:
- ✅ המספר מוגדר עם Voice Webhook
- ✅ Webhook URL נכון
- ✅ HTTP Method הוא POST

### 3.3 בדיקת API Keys

ודא ש-API Keys מוגדרים ב-Firebase Secrets:

```bash
firebase functions:secrets:access OPENAI_API_KEY
firebase functions:secrets:access DEEPGRAM_API_KEY
firebase functions:secrets:access ELEVENLABS_API_KEY
```

אם חסרים, הגדר אותם:

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set DEEPGRAM_API_KEY
firebase functions:secrets:set ELEVENLABS_API_KEY
```

---

## 🧪 שלב 4: בדיקת השיחה

### 4.1 שיחה נכנסת

1. התקשר למספר הטלפון
2. ודא שהבוט עונה בעברית
3. ודא שהבוט מזכיר "טייגר לילי"
4. ודא שהבוט שואל על הזמנות
5. נסה להפריע - ודא שהבוט עוצר מיד

### 4.2 שיחה יוצאת

1. פתח את ה-App
2. עבור ל-"Place Call"
3. הזן מספר טלפון
4. לחץ "Call"
5. ודא שהשיחה מתחילה
6. ודא שהבוט מדבר בעברית

---

## 🐛 פתרון בעיות

### בעיה: הסקריפט לא רץ

**פתרון:**
1. ודא שאתה ב-`firebase/functions`
2. ודא ש-`node` מותקן
3. ודא שקובץ ה-service account קיים

### בעיה: הבוט לא עונה

**פתרון:**
1. בדוק ש-`phoneNumberMap` מוגדר נכון
2. בדוק ש-Webhook URL נכון ב-Twilio
3. בדוק logs ב-Firebase Functions

### בעיה: הבוט לא מזהה "טייגר לילי"

**פתרון:**
1. ודא ש-`additionalInsturctions` מוגדר ב-Firestore
2. בדוק logs ב-`llm_service.js`
3. ודא שההוראות כוללות "טייגר לילי"

### בעיה: אין הפרעות

**פתרון:**
1. ודא ש-`provider: "deepgram"` ב-Firestore
2. ודא ש-Deepgram WebSocket מופעל
3. בדוק logs ב-`twilio_media_stream.js`

---

## 📚 קישורים שימושיים

- [Firestore Console](https://console.firebase.google.com/project/voiceflow-ai-202509231639/firestore)
- [Twilio Console](https://console.twilio.com/)
- [Firebase Functions Logs](https://console.firebase.google.com/project/voiceflow-ai-202509231639/functions/logs)
- [LENCELOTECH Agent Config](./LENCELOTECH_AGENT_CONFIG.md)

---

**עודכן לאחרונה**: 2025-01-XX
