# 🔍 בדיקת איכות TTS/STT בעברית + Latency

## תאריך: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## ✅ הגדרות נוכחיות

### TTS (Text-to-Speech)
- **Provider**: Google Cloud TTS
- **Voice**: `Google.he-IL-Wavenet-A` (איכות גבוהה מאוד)
- **Language**: `he-IL`
- **מיקום בקוד**: `voice_service.js` שורה 1659 - `resolveVoiceForLanguage()`

### STT (Speech-to-Text)
- **Provider**: Twilio Gather (כרגע - Deepgram דורש WebSocket)
- **Language**: `he-IL`
- **Timeout**: 10 seconds
- **Enhanced**: `true` (שיפור זיהוי עברית)
- **Speech Timeout**: `auto`
- **מיקום בקוד**: `voice_service.js` שורות 1798-1808

### LLM (Language Model)
- **Provider**: OpenAI
- **Model**: `gpt-4o-mini` (הכי מהיר ויעיל)
- **Max Tokens**: 150 (תגובות קצרות לקול)
- **Temperature**: 0.8 (טבעי)
- **Timeout**: 10 seconds
- **מיקום בקוד**: `llm_service.js` שורות 449-451, 482

### Retry Logic
- **Max Retries**: 3
- **Backoff**: Exponential (200ms, 400ms, 800ms)
- **מיקום בקוד**: `voice_service.js` שורות 2015-2140

## 📊 Latency Breakdown (צפוי)

### 1. STT (Speech-to-Text)
- **Twilio Gather**: ~1-2 seconds
- **Enhanced mode**: משפר זיהוי עברית
- **Language**: `he-IL` - מותאם לעברית

### 2. LLM Processing
- **GPT-4o-mini**: ~0.5-1.5 seconds
- **Max Tokens 150**: תגובות קצרות = מהיר יותר
- **Retry logic**: יכול להוסיף עד 2-3 שניות אם יש שגיאות

### 3. TTS (Text-to-Speech)
- **Google WaveNet**: ~0.5-1 second
- **איכות גבוהה**: אבל מהיר יחסית

### 4. Total Latency
- **Best case**: ~2 seconds (STT 1s + LLM 0.5s + TTS 0.5s)
- **Average case**: ~3 seconds (STT 1.5s + LLM 1s + TTS 0.5s)
- **Worst case**: ~4.5 seconds (STT 2s + LLM 1.5s + TTS 1s)
- **With retry**: עד ~7.5 seconds (אם יש שגיאות)

## ✅ בדיקות איכות

### בדיקה 1: TTS Quality
**מה לבדוק:**
1. הקול נשמע עברי טבעי
2. הגייה נכונה של מילים עבריות
3. אינטונציה טבעית
4. אין "רובוטיות"

**איך לבדוק:**
- התקשר למספר הטלפון
- האזן ל-greeting
- בדוק שהקול נשמע עברי ואיכותי

**צפוי:**
- ✅ Google Hebrew WaveNet A - איכות גבוהה מאוד
- ✅ הגייה נכונה
- ✅ אינטונציה טבעית

### בדיקה 2: STT Accuracy
**מה לבדוק:**
1. זיהוי נכון של מילים עבריות
2. זיהוי נכון של משפטים
3. זיהוי גם עם רעש רקע
4. זיהוי גם עם מבטא

**איך לבדוק:**
- התקשר למספר הטלפון
- דבר בעברית ברורה
- בדוק שהמערכת מזהה נכון
- נסה גם עם רעש רקע קל

**צפוי:**
- ✅ Twilio Gather עם enhanced=true - איכות טובה
- ✅ Language=he-IL - מותאם לעברית
- ⚠️  לא כמו Deepgram, אבל טוב

### בדיקה 3: Latency
**מה לבדוק:**
1. זמן מתחילת דיבור עד תחילת תשובה
2. זמן מתחילת דיבור עד סיום תשובה
3. האם יש עיכובים מיותרים

**איך לבדוק:**
- התקשר למספר הטלפון
- דבר מיד אחרי ה-greeting
- מדוד זמן עד שהתשובה מתחילה
- מדוד זמן עד שהתשובה מסתיימת

**צפוי:**
- ✅ 2-4.5 שניות (תלוי ברשת ו-LLM)
- ✅ GPT-4o-mini - מהיר יחסית
- ✅ Max Tokens 150 - תגובות קצרות

### בדיקה 4: LLM Accuracy
**מה לבדוק:**
1. התשובות רלוונטיות
2. התשובות מדויקות
3. התשובות בעברית תקנית
4. התשובות קצרות וממוקדות

**איך לבדוק:**
- שאל שאלות בעברית
- בדוק שהתשובות רלוונטיות
- בדוק שהתשובות בעברית תקנית
- בדוק שהתשובות לא ארוכות מדי

**צפוי:**
- ✅ GPT-4o-mini - דיוק טוב
- ✅ System prompt בעברית
- ✅ Max Tokens 150 - תגובות קצרות

## 🔍 איך לבדוק בפועל

### שלב 1: בדיקת TTS
1. התקשר למספר הטלפון
2. האזן ל-greeting
3. בדוק:
   - הקול נשמע עברי? ✅
   - הגייה נכונה? ✅
   - אינטונציה טבעית? ✅

### שלב 2: בדיקת STT
1. אחרי ה-greeting, דבר בעברית
2. אמר: "שלום, אני רוצה מידע"
3. בדוק:
   - המערכת מזהה נכון? ✅
   - התשובה רלוונטית? ✅

### שלב 3: בדיקת Latency
1. מדוד זמן מתחילת דיבור עד תחילת תשובה
2. צפוי: 2-4.5 שניות
3. אם יותר מ-6 שניות - יש בעיה

### שלב 4: בדיקת דיוק
1. שאל שאלות מורכבות יותר
2. בדוק שהתשובות מדויקות
3. בדוק שהתשובות בעברית תקנית

## 📊 Monitoring

### Google Cloud Logging
1. לך ל: https://console.cloud.google.com/logs/query?project=voiceflow-ai-202509231639
2. חפש: `twilioGatherCallback` או `LLM call`
3. בדוק:
   - `processingTimeMs` - זמן עיבוד
   - `tokensUsed` - tokens שנצרכו
   - `responseLength` - אורך תשובה

### Twilio Console
1. לך ל: https://console.twilio.com/us1/monitor/logs/voice
2. בחר שיחה
3. בדוק:
   - Duration - משך השיחה
   - Status - סטטוס השיחה

## ⚠️ נקודות לשיפור עתידי

1. **Deepgram STT**: דורש WebSocket (לא נתמך ב-Firebase Functions)
   - פתרון: העברת `twilioMediaStream` ל-Cloud Run
   - יתרון: איכות STT גבוהה יותר

2. **Latency**: יכול להיות נמוך יותר עם:
   - Deepgram STT (מהיר יותר)
   - Streaming responses
   - Caching

3. **TTS**: Google WaveNet A טוב, אבל:
   - ElevenLabs Flash v2.5 יכול להיות מהיר יותר
   - אבל לא נתמך ב-Twilio ישירות

## ✅ סיכום

### TTS
- ✅ **איכות**: גבוהה מאוד (Google Hebrew WaveNet A)
- ✅ **Latency**: טוב (~0.5-1 שנייה)
- ✅ **עברית**: מושלם

### STT
- ✅ **איכות**: טובה (Twilio Gather enhanced)
- ✅ **Latency**: טוב (~1-2 שניות)
- ⚠️  **שיפור עתידי**: Deepgram (דורש WebSocket)

### LLM
- ✅ **איכות**: טובה (GPT-4o-mini)
- ✅ **Latency**: טוב (~0.5-1.5 שניות)
- ✅ **עברית**: מושלם

### Total Latency
- ✅ **Best**: ~2 שניות
- ✅ **Average**: ~3 שניות
- ✅ **Worst**: ~4.5 שניות
- ✅ **מקובל**: כן, טוב לשיחה בזמן אמת

## 🚀 מוכן לבדיקה!

כל ההגדרות מוכנות. ניתן לבצע בדיקה אמיתית מול שיחת טלפון.

**לאחר הבדיקה, בדוק את הלוגים:**
- Google Cloud Logging
- Twilio Console
- Firebase Functions Logs
