# 🔧 הגדרת OpenAI API Key

## שלב 1: קבלת API Key
1. היכנס ל-https://platform.openai.com/api-keys
2. לחץ על "Create new secret key"
3. העתק את ה-API Key (מתחיל ב-`sk-`)

## שלב 2: הוספת ה-API Key ל-`.env`

### Windows PowerShell:
```powershell
cd firebase\functions
Add-Content -Path ".env" -Value "`nOPENAI_API_KEY=sk-your-api-key-here"
```

### Linux/Mac:
```bash
cd firebase/functions
echo "OPENAI_API_KEY=sk-your-api-key-here" >> .env
```

## שלב 3: Deploy
```bash
cd firebase/functions
nvm use 20.10.0  # אם צריך
firebase deploy --only functions
```

## ⚠️ חשוב
- ה-API Key חייב להיות מוגדר ב-`.env` לפני ה-deploy
- ה-API Key לא יופיע ב-Git (הוא ב-`.gitignore`)
- אם אין לך API Key, המערכת תחזור ל-keyword matching (fallback)

## 💰 עלויות
- GPT-4o-mini הוא זול מאוד: ~$0.15 לכל מיליון tokens
- שיחה ממוצעת: ~500-1000 tokens
- עלות שיחה ממוצעת: ~$0.0001 (פחות מ-0.01 אגורה)
