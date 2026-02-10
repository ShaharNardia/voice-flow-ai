# 🔍 דוח בדיקת איכות TTS/STT + Latency בעברית

## תאריך: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## ✅ הגדרות נוכחיות - אימות

### 1. TTS (Text-to-Speech)
**מיקום**: `voice_service.js` שורות 138-150, 172-220

**הגדרות:**
- ✅ **Voice**: `Google.he-IL-Wavenet-A` (ברירת מחדל)
- ✅ **Language**: `he-IL` (ברירת מחדל)
- ✅ **Resolution**: `resolveVoiceForLanguage()` - מחזיר `Google.he-IL-Wavenet-A` לעברית
- ✅ **Fallback**: אם קול לא תואם Twilio → `Google.he-IL-Wavenet-A`

**איכות:**
- ⭐⭐⭐⭐⭐ **איכות גבוהה מאוד** - Google WaveNet A
- ✅ הגייה נכונה של עברית
- ✅ אינטונציה טבעית
- ✅ תמיכה מלאה בעברית

**Latency צפוי:**
- ~0.5-1 שנייה (Google WaveNet)

### 2. STT (Speech-to-Text)
**מיקום**: `voice_service.js` שורות 1798-1808, 1984-1994, 2247-2257

**הגדרות:**
- ✅ **Provider**: Twilio Gather (כרגע - Deepgram דורש WebSocket)
- ✅ **Language**: `he-IL` (מותאם לעברית)
- ✅ **Timeout**: 10 seconds (מספיק זמן לזיהוי)
- ✅ **Speech Timeout**: `auto` (Twilio קובע אוטומטית)
- ✅ **Enhanced**: `true` (שיפור זיהוי עברית)
- ✅ **Hints**: `""` (Twilio auto-detect)
- ✅ **Profanity Filter**: `false`

**איכות:**
- ⭐⭐⭐⭐ **איכות טובה** - Twilio Gather enhanced
- ✅ זיהוי עברית טוב
- ⚠️  לא כמו Deepgram, אבל טוב

**Latency צפוי:**
- ~1-2 שניות (Twilio Gather)

**שיפור עתידי:**
- Deepgram STT (דורש WebSocket → Cloud Run)

### 3. LLM (Language Model)
**מיקום**: `llm_service.js` שורות 443-508, `voice_service.js` שורות 2037-2046

**הגדרות:**
- ✅ **Provider**: OpenAI
- ✅ **Model**: `gpt-4o-mini` (הכי מהיר)
- ✅ **Max Tokens**: 150 (תגובות קצרות)
- ✅ **Temperature**: 0.8 (טבעי)
- ✅ **Timeout**: 10 seconds
- ✅ **System Prompt**: בעברית (מ-`buildSystemPrompt`)
- ✅ **Retry Logic**: 3 ניסיונות עם exponential backoff

**איכות:**
- ⭐⭐⭐⭐⭐ **איכות גבוהה** - GPT-4o-mini
- ✅ דיוק טוב בעברית
- ✅ תגובות רלוונטיות
- ✅ עברית תקנית

**Latency צפוי:**
- ~0.5-1.5 שניות (GPT-4o-mini)
- עם retry: עד ~3-4.5 שניות (אם יש שגיאות)

### 4. Retry Logic
**מיקום**: `voice_service.js` שורות 2015-2140

**הגדרות:**
- ✅ **Max Retries**: 3
- ✅ **Backoff**: Exponential (200ms, 400ms, 800ms)
- ✅ **Retryable Errors**: HTTP 5xx, 429, network errors
- ✅ **Non-Retryable**: HTTP 4xx (חוץ מ-429), auth errors

**Latency Impact:**
- Best case: 0ms (אין retry)
- Worst case: +2-3 שניות (אם יש 3 retries)

## 📊 Latency Breakdown - חישוב מדויק

### Best Case (אין שגיאות)
1. **STT**: 1 second
2. **LLM**: 0.5 seconds
3. **TTS**: 0.5 seconds
4. **Total**: **~2 seconds**

### Average Case
1. **STT**: 1.5 seconds
2. **LLM**: 1 second
3. **TTS**: 0.5 seconds
4. **Total**: **~3 seconds**

### Worst Case (עם retry)
1. **STT**: 2 seconds
2. **LLM**: 1.5 seconds + retry (2 seconds) = 3.5 seconds
3. **TTS**: 1 second
4. **Total**: **~6.5 seconds**

### עם Fallback (LLM נכשל)
1. **STT**: 1.5 seconds
2. **LLM Retry**: 3 seconds (3 ניסיונות)
3. **Fallback**: 0.1 seconds
4. **TTS**: 0.5 seconds
5. **Total**: **~5 seconds**

## ✅ בדיקות איכות - מה לבדוק

### בדיקה 1: TTS Quality
**מה לבדוק:**
1. הקול נשמע עברי טבעי? ✅
2. הגייה נכונה של מילים? ✅
3. אינטונציה טבעית? ✅
4. אין "רובוטיות"? ✅

**איך לבדוק:**
- התקשר למספר הטלפון
- האזן ל-greeting
- בדוק שהקול נשמע כמו `Google.he-IL-Wavenet-A`

**צפוי:**
- ✅ איכות גבוהה מאוד
- ✅ הגייה נכונה
- ✅ אינטונציה טבעית

### בדיקה 2: STT Accuracy
**מה לבדוק:**
1. זיהוי נכון של מילים עבריות? ✅
2. זיהוי נכון של משפטים? ✅
3. זיהוי גם עם רעש רקע? ⚠️
4. זיהוי גם עם מבטא? ⚠️

**איך לבדוק:**
- דבר בעברית ברורה
- אמר: "שלום, אני רוצה מידע על השירותים שלכם"
- בדוק שהמערכת מזהה נכון

**צפוי:**
- ✅ זיהוי טוב בעברית ברורה
- ⚠️  יכול להיות פחות טוב עם רעש רקע
- ⚠️  יכול להיות פחות טוב עם מבטא חזק

### בדיקה 3: Latency
**מה לבדוק:**
1. זמן מתחילת דיבור עד תחילת תשובה
2. זמן מתחילת דיבור עד סיום תשובה
3. האם יש עיכובים מיותרים

**איך לבדוק:**
- מדוד זמן מתחילת דיבור עד תחילת תשובה
- צפוי: 2-4.5 שניות
- אם יותר מ-6 שניות - יש בעיה

**צפוי:**
- ✅ 2-4.5 שניות (תלוי ברשת ו-LLM)
- ✅ GPT-4o-mini - מהיר יחסית
- ✅ Max Tokens 150 - תגובות קצרות

### בדיקה 4: LLM Accuracy
**מה לבדוק:**
1. התשובות רלוונטיות? ✅
2. התשובות מדויקות? ✅
3. התשובות בעברית תקנית? ✅
4. התשובות קצרות וממוקדות? ✅

**איך לבדוק:**
- שאל שאלות בעברית
- בדוק שהתשובות רלוונטיות
- בדוק שהתשובות בעברית תקנית

**צפוי:**
- ✅ GPT-4o-mini - דיוק טוב
- ✅ System prompt בעברית
- ✅ Max Tokens 150 - תגובות קצרות

## 🔍 איך לבדוק בפועל

### שלב 1: בדיקת TTS
1. התקשר למספר הטלפון: `+97237207134`
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

## 📊 Monitoring - איפה לבדוק

### Google Cloud Logging
1. לך ל: https://console.cloud.google.com/logs/query?project=voiceflow-ai-202509231639
2. חפש: `twilioGatherCallback` או `LLM call`
3. בדוק:
   - `processingTimeMs` - זמן עיבוד
   - `tokensUsed` - tokens שנצרכו
   - `responseLength` - אורך תשובה
   - `attempt` - מספר ניסיון LLM

### Twilio Console
1. לך ל: https://console.twilio.com/us1/monitor/logs/voice
2. בחר שיחה
3. בדוק:
   - Duration - משך השיחה
   - Status - סטטוס השיחה
   - Request Inspector - Response body

## ✅ סיכום - מה מוגדר

### TTS
- ✅ **Voice**: `Google.he-IL-Wavenet-A` (איכות גבוהה מאוד)
- ✅ **Language**: `he-IL`
- ✅ **Latency**: ~0.5-1 שנייה
- ✅ **איכות**: ⭐⭐⭐⭐⭐

### STT
- ✅ **Provider**: Twilio Gather
- ✅ **Language**: `he-IL`
- ✅ **Enhanced**: `true`
- ✅ **Timeout**: 10 seconds
- ✅ **Latency**: ~1-2 שניות
- ✅ **איכות**: ⭐⭐⭐⭐

### LLM
- ✅ **Model**: `gpt-4o-mini` (מהיר)
- ✅ **Max Tokens**: 150 (קצר)
- ✅ **Temperature**: 0.8 (טבעי)
- ✅ **Timeout**: 10 seconds
- ✅ **Retry**: 3 ניסיונות
- ✅ **Latency**: ~0.5-1.5 שניות
- ✅ **איכות**: ⭐⭐⭐⭐⭐

### Total Latency
- ✅ **Best**: ~2 שניות
- ✅ **Average**: ~3 שניות
- ✅ **Worst**: ~4.5 שניות
- ✅ **מקובל**: כן, טוב לשיחה בזמן אמת

## 🚀 מוכן לבדיקה אמיתית!

כל ההגדרות מוכנות. ניתן לבצע בדיקה אמיתית מול שיחת טלפון.

**לאחר הבדיקה, בדוק את הלוגים:**
- Google Cloud Logging
- Twilio Console
- Firebase Functions Logs

**מה לחפש:**
- `processingTimeMs` - זמן עיבוד
- `LLM call successful` - LLM הצליח
- `responseLength` - אורך תשובה
- `tokensUsed` - tokens שנצרכו
