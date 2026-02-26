# מדריך אינטגרציה למרכזיה מותאמת אישית

## סקירה כללית

המערכת תומכת בהחלפת Twilio במרכזיה משלך בענן. יש כבר תמיכה מובנית ב-Asterisk, וניתן להוסיף תמיכה במרכזיות אחרות (FreeSWITCH, Kamailio, 3CX, וכו').

## אופציה 1: אם יש לך Asterisk (הכי קל!)

אם המרכזיה שלך היא **Asterisk**, המערכת כבר מוכנה לזה!

### שלב 1: הגדרת Asterisk Bridge

1. **העתק את תיקיית ה-Bridge לשרת Asterisk שלך:**
   ```bash
   cd /opt
   git clone <repository> voiceflow-bridge
   cd voiceflow-bridge/firebase/asterisk-bridge
   npm install
   ```

2. **הגדר את ה-environment:**
   ```bash
   cp env.sample .env
   nano .env
   ```

   הגדר את הערכים הבאים:
   ```env
   # Asterisk ARI Configuration
   ASTERISK_HOST=localhost
   ASTERISK_ARI_PORT=8088
   ASTERISK_ARI_USER=voiceflow
   ASTERISK_ARI_PASSWORD=your_secure_password
   ASTERISK_ARI_APP=voiceflow-bridge

   # SIP Trunk Configuration
   SIP_TRUNK_NAME=your-trunk-name
   DEFAULT_CALLER_ID=+972501234567

   # Bridge Server Configuration
   BRIDGE_PORT=3000
   BRIDGE_SECRET=your_secret_key_here

   # Firebase Configuration
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
   ```

3. **הפעל את ה-Bridge:**
   ```bash
   # Development
   npm run dev

   # Production (עם PM2)
   pm2 start src/index.js --name voiceflow-bridge
   pm2 save
   ```

4. **ודא שה-Bridge נגיש מהאינטרנט:**
   - פתח פורט 3000 בפיירוול
   - או השתמש ב-reverse proxy (nginx) עם HTTPS

### שלב 2: הגדרה ב-Firebase

1. **עדכן את הגדרות החברה ב-Firestore:**
   ```javascript
   // ב-Company collection, עדכן את המסמך של החברה:
   {
     telephonyProvider: "asterisk",
     asteriskBridgeUrl: "https://your-bridge-server.com:3000",
     asteriskBridgeSecret: "your_secret_key_here",
     asteriskCallerId: "+972501234567",
     sipTrunkName: "your-trunk-name"
   }
   ```

2. **או דרך ה-UI:**
   - לך ל-Settings → PBX Settings
   - בחר "Asterisk" ב-Telephony Provider
   - הזן את ה-URL וה-Secret של ה-Bridge

### שלב 3: בדיקה

1. **בדוק שה-Bridge עובד:**
   ```bash
   curl https://your-bridge-server.com:3000/health
   ```

2. **נסה לבצע שיחה דרך המערכת**

---

## אופציה 2: אם יש לך מרכזיה אחרת (FreeSWITCH, Kamailio, 3CX, וכו')

אם המרכזיה שלך **לא** Asterisk, צריך לבנות Bridge מותאם אישית.

### מה צריך לבנות?

Bridge service שרץ על שרת המרכזיה שלך ומתרגם בין Firebase Functions למרכזיה שלך.

### דרישות ה-Bridge:

#### 1. API Endpoints (חובה)

ה-Bridge צריך לחשוף את ה-endpoints הבאים:

##### Health Check
```
GET /health
Response: { "status": "ok", "activeCalls": 0 }
```

##### Place Call
```
POST /call
Headers:
  X-Bridge-Secret: your_secret
  Content-Type: application/json

Body:
{
  "leadNumber": "+972501234567",
  "leadName": "ישראל ישראלי",
  "companyName": "חברה בע\"מ",
  "assistantName": "שרה",
  "greeting": "שלום {{clientName}}, כאן {{assistantName}} מ{{companyName}}...",
  "callerId": "+972509876543",
  "callSessionId": "firebase-session-id",
  "metadata": {
    "leadId": "lead-doc-id",
    "companyId": "company-doc-id"
  }
}

Response:
{
  "status": "initiated",
  "callId": "unique-call-id",
  "channelId": "channel-id",
  "callSessionId": "firebase-session-id"
}
```

##### Get Call Status
```
GET /call/:callId
Headers:
  X-Bridge-Secret: your_secret

Response:
{
  "callId": "unique-call-id",
  "status": "answered", // initiating, dialing, ringing, answered, completed
  "channelId": "channel-id",
  "duration": 45
}
```

##### Hangup Call
```
POST /call/:callId/hangup
Headers:
  X-Bridge-Secret: your_secret

Response:
{
  "status": "hangup_requested",
  "callId": "unique-call-id"
}
```

#### 2. Webhook ל-Firebase (אופציונלי אבל מומלץ)

כדי לעדכן את Firebase על שינויים בסטטוס השיחה:

```
POST https://your-firebase-project.cloudfunctions.net/updateCallStatus
Body:
{
  "callSessionId": "firebase-session-id",
  "status": "answered",
  "callId": "unique-call-id",
  "metadata": {}
}
```

#### 3. תמיכה ב-TTS (Text-to-Speech)

ה-Bridge צריך להמיר טקסט לקול. אפשרויות:

- **Google Cloud TTS** (מומלץ - איכות גבוהה, תמיכה בעברית)
- **Festival** (חינמי, איכות בינונית)
- **eSpeak** (חינמי, תמיכה בעברית)
- **ElevenLabs** (איכות גבוהה, בתשלום)

#### 4. תמיכה ב-STT (Speech-to-Text)

לשיחות אינטראקטיביות, צריך STT. אפשרויות:

- **Google Cloud Speech-to-Text**
- **Deepgram**
- **Whisper** (OpenAI)

### דוגמה: Bridge ל-FreeSWITCH

```javascript
const express = require('express');
const mod_esl = require('mod_esl'); // FreeSWITCH ESL
const axios = require('axios');

const app = express();
app.use(express.json());

const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

// Place call
app.post('/call', async (req, res) => {
  const { leadNumber, greeting, callSessionId } = req.body;
  
  // Generate TTS audio
  const audioFile = await generateTTS(greeting);
  
  // Originate call via FreeSWITCH ESL
  const callId = await freeswitch.originate({
    endpoint: `sofia/gateway/your-trunk/${leadNumber}`,
    app: 'playback',
    appArgs: audioFile,
    variables: {
      VOICEFLOW_SESSION_ID: callSessionId
    }
  });
  
  res.json({
    status: 'initiated',
    callId,
    callSessionId
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeCalls: activeCalls.size });
});

app.listen(3000);
```

### דוגמה: Bridge ל-3CX

```javascript
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const PBX_API_URL = process.env.PBX_API_URL;
const PBX_API_KEY = process.env.PBX_API_KEY;

// Place call
app.post('/call', async (req, res) => {
  const { leadNumber, greeting, callSessionId } = req.body;
  
  // Generate TTS
  const audioFile = await generateTTS(greeting);
  
  // Make call via 3CX API
  const response = await axios.post(`${PBX_API_URL}/api/Call`, {
    extension: 'your-extension',
    destination: leadNumber,
    audioFile: audioFile
  }, {
    headers: { 'Authorization': `Bearer ${PBX_API_KEY}` }
  });
  
  res.json({
    status: 'initiated',
    callId: response.data.callId,
    callSessionId
  });
});

app.listen(3000);
```

### שלב 3: עדכון Firebase Functions

אם המרכזיה שלך לא Asterisk, צריך להוסיף service חדש ב-`firebase/functions`:

1. **צור קובץ חדש:** `firebase/functions/custom_pbx_service.js`

```javascript
const {logger} = require("firebase-functions");
const axios = require("axios");
const {getFirestore} = require("firebase-admin/firestore");

async function isCustomPbxEnabled(companyId) {
  const db = getFirestore();
  const companyDoc = await db.collection("Company").doc(companyId).get();
  
  if (!companyDoc.exists) return false;
  
  const data = companyDoc.data();
  return data.telephonyProvider === "custom" && data.customPbxBridgeUrl;
}

async function getCustomPbxConfig(companyId) {
  const db = getFirestore();
  const companyDoc = await db.collection("Company").doc(companyId).get();
  
  if (!companyDoc.exists) return null;
  
  const data = companyDoc.data();
  
  if (data.telephonyProvider !== "custom") return null;
  
  return {
    bridgeUrl: data.customPbxBridgeUrl,
    bridgeSecret: data.customPbxBridgeSecret,
    defaultCallerId: data.customPbxCallerId || data.defaultDdi,
  };
}

async function placeCallViaCustomPbx(config, callData) {
  const { bridgeUrl, bridgeSecret, defaultCallerId } = config;
  const { leadNumber, leadName, companyName, assistantName, greeting, companyPhone, callSessionId, metadata } = callData;

  try {
    const response = await axios.post(
      `${bridgeUrl}/call`,
      {
        leadNumber,
        leadName,
        companyName,
        assistantName,
        greeting,
        callerId: companyPhone || defaultCallerId,
        callSessionId,
        metadata,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Bridge-Secret": bridgeSecret,
        },
        timeout: 30000,
      }
    );

    logger.info("Custom PBX call initiated:", response.data);
    
    return {
      success: true,
      callId: response.data.callId,
      channelId: response.data.channelId,
      provider: "custom",
    };
  } catch (error) {
    logger.error("Custom PBX call failed:", error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      provider: "custom",
    };
  }
}

module.exports = {
  isCustomPbxEnabled,
  getCustomPbxConfig,
  placeCallViaCustomPbx,
};
```

2. **עדכן את `voice_service.js`:**

```javascript
const customPbxService = require("./custom_pbx_service");

// ב-placeCall function, הוסף:
const customPbxConfig = await customPbxService.getCustomPbxConfig(companyId);
const useCustomPbx = customPbxConfig !== null;

if (useCustomPbx) {
  const customPbxResult = await customPbxService.placeCallViaCustomPbx(customPbxConfig, {
    leadNumber,
    leadName,
    companyName,
    assistantName,
    greeting: processedFirstMessage,
    companyPhone,
    callSessionId: sessionId,
    metadata: payload.metadata || {},
  });
  
  // Handle result...
}
```

3. **עדכן את Company schema:**

הוסף שדות חדשים ל-`lib/backend/schema/company_record.dart`:
- `customPbxBridgeUrl`
- `customPbxBridgeSecret`
- `customPbxCallerId`

---

## סיכום - מה צריך לעשות?

### אם יש לך Asterisk:
1. ✅ התקן את Asterisk Bridge על שרת Asterisk
2. ✅ הגדר את ה-Bridge (URL, Secret)
3. ✅ עדכן את הגדרות החברה ב-Firebase: `telephonyProvider: "asterisk"`

### אם יש לך מרכזיה אחרת:
1. 🔧 בנה Bridge service שמדבר עם המרכזיה שלך
2. 🔧 חשוף את ה-API endpoints הנדרשים
3. 🔧 הוסף תמיכה ב-TTS ו-STT
4. 🔧 עדכן את Firebase Functions להוסיף תמיכה ב-`telephonyProvider: "custom"`
5. 🔧 עדכן את ה-UI להוסיף אפשרות לבחור "Custom PBX"

---

## שאלות נפוצות

**Q: האם אני יכול להשתמש גם ב-Twilio וגם במרכזיה שלי?**
A: כן! כל חברה יכולה להיות מוגדרת עם provider אחר. חברה אחת יכולה להשתמש ב-Twilio, אחרת ב-Asterisk, וכו'.

**Q: מה אם המרכזיה שלי לא תומכת ב-ARI/ESL?**
A: צריך לבנות Bridge שמתרגם בין HTTP API לממשק של המרכזיה שלך (CLI, AMI, וכו').

**Q: האם אני צריך לשנות משהו ב-Frontend?**
A: לא! כל השינויים הם ב-Backend. ה-Frontend כבר תומך בהגדרת `telephonyProvider`.

**Q: מה עם שיחות נכנסות?**
A: כרגע ה-Bridge תומך רק בשיחות יוצאות. לשיחות נכנסות, צריך להוסיף webhook מהמרכזיה ל-Firebase Functions.

---

## תמיכה

אם אתה צריך עזרה בבניית Bridge למרכזיה שלך, צור issue או פנה לצוות הפיתוח.
