# 📖 מדריך משתמש - יצירת Phonebot Agent בעברית

## 🚀 התחלה מהירה

### שלב 1: יצירת Agent חדש

1. **היכנס למערכת** והתחבר לחשבון שלך
2. **עבור לדף ה-Onboarding** (Startup4)
3. **בטאב "Greeting"** תראה את כל ההגדרות הבסיסיות

### שלב 2: הגדרות TTS (Text-to-Speech)

**TTS Provider**: `11labs` (ברירת מחדל)
- זהו הפרוביידר המהיר ביותר עם איכות עברית מעולה

**Voice**: `rachel` (ברירת מחדל)
- זהו הקול העברי הטוב ביותר של ElevenLabs

**TTS Model**: `eleven_flash_v2_5` (ברירת מחדל)
- המודל המהיר ביותר עם latency נמוך

### שלב 3: הגדרות STT (Speech-to-Text)

**Transcriber Provider**: `deepgram` (ברירת מחדל)
- הפרוביידר המדויק והמהיר ביותר לעברית

**Language**: `he` (ברירת מחדל)
- עברית - כבר מסומן!

**Transcriber Model**: `nova-2` (ברירת מחדל)
- המודל המהיר והמדויק ביותר

### שלב 4: הודעות

**Inbound Message** (הודעה נכנסת):
```
שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?
```

**Outbound Message** (הודעה יוצאת):
```
שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?
```

**Assistant Name**: `העוזר הווירטואלי` (ברירת מחדל)

---

## ⚙️ הגדרות מתקדמות

### טאב "Services"
- הוסף שירותים שהחברה שלך מספקת
- כל שירות צריך: שם, תיאור, מחיר, משך

### טאב "Permissions"
- **הצעת מחיר חינם**: כן/לא
- **יצירת תור**: כן/לא
- **שינוי תור**: כן/לא
- **ביטול תור**: כן/לא

### טאב "Restrictions"
- **הגבלה על משא ומתן על מחיר**: כן/לא
- **הגבלה על ייעוץ משפטי**: כן/לא
- **הגבלה על ייעוץ רפואי**: כן/לא

### טאב "Personalization"
- הוסף הוראות מותאמות אישית ל-Agent

---

## 📞 יצירת שיחה

### דרך 1: מ-Leads Page

1. **עבור ל-Leads**
2. **בחר Lead** מהרשימה
3. **לחץ על "Call"**
4. השיחה תתחיל אוטומטית עם כל ההגדרות

### דרך 2: מ-Place Call Page

1. **עבור ל-Dispatch → Calls → Place Call**
2. **הזן שם**: שם הלקוח
3. **הזן מספר**: מספר הטלפון
4. **לחץ על "Place Call"**
5. השיחה תתחיל אוטומטית

---

## 🎯 מה קורה בשיחה?

### 1. Greeting
- Agent אומר את ה-`firstMessage` בעברית
- הקול: `Google.he-IL-Wavenet-A` (איכות גבוהה)

### 2. Conversation
- Agent מקשיב לדיבור (Deepgram STT)
- Agent מבין את השפה העברית
- Agent חושב (LLM - GPT-4o-mini)
- Agent עונה בעברית תקנית
- Agent אומר את התשובה (Google TTS)

### 3. Natural Flow
- Agent משתמש ב-filler phrases ("רגע אחד...", "אמממ...")
- Agent משתמש ב-backchanneling ("כן", "נכון", "בסדר")
- Agent נשמע כמו נציג אנושי מקצועי

### 4. End Detection
- Agent מזהה כשהשיחה מסתיימת
- מילות סיום: "תודה", "להתראות", "ביי", וכו'
- Agent מסיים את השיחה בצורה מקצועית

---

## 🔍 מעקב אחר שיחות

### Call Sessions
- כל שיחה נשמרת ב-`call_sessions` collection
- כולל: כל ההודעות, timestamps, metadata

### Conversation History
- כל השיחה נשמרת ב-`conversationHistory`
- אפשר לראות את כל ההודעות (user + assistant)

### Lead Status
- סטטוס ה-Lead מתעדכן אוטומטית לפי תוכן השיחה

---

## ⚠️ בעיות נפוצות

### בעיה: הקול לא נשמע עברית
**פתרון**: ודא ש-`language` מוגדר ל-`he` או `he-IL`

### בעיה: Agent לא מבין עברית
**פתרון**: ודא ש-`Transcriber Provider` הוא `deepgram` ו-`Language` הוא `he`

### בעיה: תגובות איטיות
**פתרון**: ודא ש-`TTS Model` הוא `eleven_flash_v2_5` ו-`STT Model` הוא `nova-2`

### בעיה: Agent לא נשמע טבעי
**פתרון**: ודא שה-`firstMessage` כתוב בעברית תקנית

---

## 📚 מידע נוסף

- **תיעוד מלא**: `firebase/functions/COMPLETE_INTEGRATION_GUIDE.md`
- **תוצאות בדיקות**: `firebase/functions/TEST_RESULTS.md`
- **אימות אינטגרציות**: `firebase/functions/INTEGRATION_VERIFICATION.md`

---

## ✅ הכל מוכן!

**המערכת מוכנה לשימוש. פשוט צור Agent חדש והתחל לשוחח!**
