const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");

const {
  safeJsonParse,
  buildSuccessResponse,
  buildNotFoundResponse,
  generateId,
} = require("./workflow_utils");

const {
  sanitizeObject,
  applyRateLimit,
  handleCorsSafe,
  setCorsHeadersSafe,
  isValidPhone,
  validateRequired,
} = require("./security_utils");

const axios = require("axios");
const asteriskService = require("./asterisk_service");
const scenarioEngine = require("./scenario_engine");
const llmService = require("./llm_service");
const deepgramService = require("./deepgram_service");

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// Cloud Run WebSocket service for real-time Twilio Media Streams (Deepgram STT)
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.us-central1.run.app";
// Convert https:// → wss:// for WebSocket connections
const CLOUD_RUN_WSS = CLOUD_RUN_URL.replace(/^https?:\/\//, "wss://");

// CORS configuration for Firebase Functions v2
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.web\.app$/,
    /\.firebaseapp\.com$/,
  ],
};

// CORS configuration (for manual handling in webhooks)
const ALLOWED_ORIGINS = [
  "https://voiceflow-ai-202509231639.web.app",
  "https://voiceflow-ai-202509231639.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5000",
];

function setCorsHeaders(req, res) {
  // Delegate to hardened CORS handler from security_utils
  // No wildcard fallback – unknown origins are blocked
  return setCorsHeadersSafe(req, res);
}

// Multi-language messages support
const MESSAGES = {
  "he-IL": {
    defaultGreeting: "אהלן! מה נשמע? איך אפשר לעזור?",
    askAvailability: "נוח לדבר עכשיו?",
    didNotHear: "לא שמעתי, אפשר לחזור על זה?",
    noResponse: "אין בעיה, ניצור קשר בזמן אחר. יום טוב!",
    positiveResponse: "מעולה! נחזור אליך בהקדם. יום טוב!",
    negativeResponse: "הבנתי, אין בעיה. אפשר ליצור קשר מתי שנוח. יום טוב!",
    unclearResponse: "אוקיי, נחזור אליך בקרוב. יום טוב!",
    thankYouGoodbye: "תודה, יום טוב!",
    errorOccurred: "רגע, משהו השתבש. אפשר לנסות שוב אחר כך.",
    sessionNotFound: "לא מצאתי את השיחה. להתראות.",
    scenarioNotFound: "משהו לא עבד. להתראות.",
    flowError: "הייתה תקלה. להתראות.",
    contactSupport: "אהלן, לא הצלחתי למצוא את פרטי השיחה. כדאי ליצור קשר עם התמיכה.",
    assistantNotFound: "אהלן, לא הצלחתי לטעון את המידע. להתראות.",
    willBeInTouch: "תודה! ניצור קשר בקרוב. יום טוב!",
  },
  "he": {
    defaultGreeting: "אהלן! מה נשמע? איך אפשר לעזור?",
    askAvailability: "נוח לדבר עכשיו?",
    didNotHear: "לא שמעתי, אפשר לחזור על זה?",
    noResponse: "אין בעיה, ניצור קשר בזמן אחר. יום טוב!",
    positiveResponse: "מעולה! נחזור אליך בהקדם. יום טוב!",
    negativeResponse: "הבנתי, אין בעיה. אפשר ליצור קשר מתי שנוח. יום טוב!",
    unclearResponse: "אוקיי, נחזור אליך בקרוב. יום טוב!",
    thankYouGoodbye: "תודה, יום טוב!",
    errorOccurred: "רגע, משהו השתבש. אפשר לנסות שוב אחר כך.",
    sessionNotFound: "לא מצאתי את השיחה. להתראות.",
    scenarioNotFound: "משהו לא עבד. להתראות.",
    flowError: "הייתה תקלה. להתראות.",
    contactSupport: "אהלן, לא הצלחתי למצוא את פרטי השיחה. כדאי ליצור קשר עם התמיכה.",
    assistantNotFound: "אהלן, לא הצלחתי לטעון את המידע. להתראות.",
    willBeInTouch: "תודה! ניצור קשר בקרוב. יום טוב!",
  },
  "en-US": {
    defaultGreeting: "Hello, this is your virtual assistant. Thank you for taking our call.",
    askAvailability: "Are you available to speak with us? Please say yes or no.",
    didNotHear: "Sorry, I didn't catch that. Could you please repeat?",
    noResponse: "No problem. We will contact you again soon. Have a great day!",
    positiveResponse: "Great! Thank you for your interest. One of our team members will call you back shortly to assist you further. Have a wonderful day!",
    negativeResponse: "I understand. Thank you for your time. If you change your mind, feel free to reach out to us. Have a great day!",
    unclearResponse: "Thank you for your response. We will have someone reach out to you soon. Have a great day!",
    thankYouGoodbye: "Thank you for your time. Goodbye.",
    errorOccurred: "An error occurred. Please try again later.",
    sessionNotFound: "Session not found. Goodbye.",
    scenarioNotFound: "Scenario not found. Goodbye.",
    flowError: "Flow error. Goodbye.",
    contactSupport: "Hello. We could not locate your call session. Please contact support.",
    assistantNotFound: "Hello. We could not locate your assistant information. Goodbye.",
    willBeInTouch: "Thank you for your time. We will be in touch. Goodbye.",
  },
  "en": {
    defaultGreeting: "Hello, this is your virtual assistant. Thank you for taking our call.",
    askAvailability: "Are you available to speak with us? Please say yes or no.",
    didNotHear: "Sorry, I didn't catch that. Could you please repeat?",
    noResponse: "No problem. We will contact you again soon. Have a great day!",
    positiveResponse: "Great! Thank you for your interest. One of our team members will call you back shortly to assist you further. Have a wonderful day!",
    negativeResponse: "I understand. Thank you for your time. If you change your mind, feel free to reach out to us. Have a great day!",
    unclearResponse: "Thank you for your response. We will have someone reach out to you soon. Have a great day!",
    thankYouGoodbye: "Thank you for your time. Goodbye.",
    errorOccurred: "An error occurred. Please try again later.",
    sessionNotFound: "Session not found. Goodbye.",
    scenarioNotFound: "Scenario not found. Goodbye.",
    flowError: "Flow error. Goodbye.",
    contactSupport: "Hello. We could not locate your call session. Please contact support.",
    assistantNotFound: "Hello. We could not locate your assistant information. Goodbye.",
    willBeInTouch: "Thank you for your time. We will be in touch. Goodbye.",
  },
  "ar": {
    defaultGreeting: "مرحباً، هذا هو المساعد الافتراضي الخاص بك. شكراً لردك على المكالمة.",
    askAvailability: "هل أنت متاح للتحدث معنا؟ يرجى قول نعم أو لا.",
    didNotHear: "عذراً، لم أسمعك. هل يمكنك التكرار من فضلك؟",
    noResponse: "لا مشكلة. سنتواصل معك قريباً. يوم سعيد!",
    positiveResponse: "رائع! شكراً لاهتمامك. أحد أعضاء فريقنا سيتصل بك قريباً لمساعدتك أكثر. يوم رائع!",
    negativeResponse: "أفهم. شكراً لوقتك. إذا غيرت رأيك، لا تتردد في التواصل معنا. يوم سعيد!",
    unclearResponse: "شكراً لردك. سيتواصل معك أحد من فريقنا قريباً. يوم سعيد!",
    thankYouGoodbye: "شكراً لوقتك. وداعاً.",
    errorOccurred: "حدث خطأ. يرجى المحاولة مرة أخرى لاحقاً.",
    sessionNotFound: "لم يتم العثور على جلسة المكالمة. وداعاً.",
    scenarioNotFound: "لم يتم العثور على السيناريو. وداعاً.",
    flowError: "خطأ في السيناريو. وداعاً.",
    contactSupport: "مرحباً. لم نتمكن من تحديد مكالمتك. يرجى الاتصال بالدعم.",
    assistantNotFound: "مرحباً. لم نتمكن من تحديد تفاصيل المساعد. وداعاً.",
    willBeInTouch: "شكراً لوقتك. سنتواصل معك قريباً. وداعاً.",
  },
};

// Default voices by language (Google Cloud TTS via Twilio)
// Neural2 NOT available for Hebrew on Twilio — causes APPLICATION ERROR.
// Using WaveNet which is the best available. Hebrew male: B, D
const DEFAULT_VOICES = {
  "he": "Google.he-IL-Neural2-A",
  "he-IL": "Google.he-IL-Neural2-A",
  "en": "Polly.Joanna",
  "en-US": "Polly.Joanna",
  "en-GB": "Polly.Amy",
  "ar": "Google.ar-XA-Wavenet-A",
  "ar-XA": "Google.ar-XA-Wavenet-A",
};

// Default Hebrew voice (female Neural2-A — significantly more natural than WaveNet)
const DEFAULT_HEBREW_VOICE = "Google.he-IL-Neural2-A";
// Default English voice (for backward compatibility)
const DEFAULT_ENGLISH_VOICE = "Polly.Joanna";

/**
 * Strip nikud (Hebrew diacritical marks) from text.
 * Google WaveNet is trained on non-vocalized Hebrew — nikud confuses it.
 * Also strips SSML tags if present from previous versions.
 * @param {string} text - Text that may contain nikud
 * @returns {string} Clean text without nikud
 */
function cleanHebrewText(text) {
  if (!text) return text;
  // Strip Hebrew nikud Unicode range (U+0591–U+05C7)
  return text.replace(/[\u0591-\u05C7]/g, "");
}

// SSML removed — made TTS worse. Plain text sounds more natural with WaveNet.
function wrapSSML(text, language) {
  if (!text) return text;
  // Clean nikud from Hebrew text (WaveNet doesn't need it)
  if (language && language.startsWith("he")) {
    return cleanHebrewText(text);
  }
  return text;
}

/**
 * Resolve the best TTS voice for the given language.
 *
 * Twilio <Say> only supports two voice families:
 *   • Amazon Polly  – prefix "Polly."
 *   • Google Cloud TTS – prefix "Google."
 *
 * Any other voice ID (e.g. OpenAI "alloy", ElevenLabs "rachel", Deepgram
 * "aura-asteria-en", etc.) is NOT a valid Twilio voice and must be replaced
 * with the best available Twilio-compatible voice for the target language.
 *
 * For Hebrew the best quality is Google WaveNet (he-IL-Wavenet-D = male).
 * Polly has NO Hebrew voices, so Polly voices are also swapped when Hebrew.
 *
 * @param {string} voiceId - The voice ID from the assistant definition
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "ar")
 * @returns {string} Twilio-compatible voice ID
 */
function resolveVoiceForLanguage(voiceId, language) {
  if (!language) {
    language = "he-IL"; // Default to Hebrew
  }

  const lang = language.toLowerCase();
  const isTwilioVoice =
    voiceId && (voiceId.startsWith("Polly.") || voiceId.startsWith("Google."));

  // Check if we have a default voice for this language
  const defaultVoice = DEFAULT_VOICES[lang] || DEFAULT_VOICES[language] || null;

  // If it's a valid Twilio voice and matches the language, keep it
  if (isTwilioVoice) {
    // For Hebrew: only keep Google.he-* voices
    if (lang.startsWith("he") && voiceId.startsWith("Google.") && voiceId.includes("he-IL")) {
      return voiceId;
    }
    // For English: keep Polly or Google.en-* voices
    if (lang.startsWith("en") && (voiceId.startsWith("Polly.") || (voiceId.startsWith("Google.") && voiceId.includes("en-")))) {
      return voiceId;
    }
    // For Arabic: keep Google.ar-* voices
    if (lang.startsWith("ar") && voiceId.startsWith("Google.") && voiceId.includes("ar-")) {
      return voiceId;
    }
    // For other languages, if it's a valid Twilio voice, keep it
    if (!lang.startsWith("he") && !lang.startsWith("en") && !lang.startsWith("ar")) {
      return voiceId;
    }
  }

  // Use default voice for the language, or fallback
  if (defaultVoice) {
    return defaultVoice;
  }

  // Fallback based on language
  if (lang.startsWith("he")) {
    return DEFAULT_HEBREW_VOICE;
  } else if (lang.startsWith("en")) {
    return DEFAULT_ENGLISH_VOICE;
  } else if (lang.startsWith("ar")) {
    return DEFAULT_VOICES["ar"] || DEFAULT_VOICES["ar-XA"] || DEFAULT_ENGLISH_VOICE;
  }

  // Ultimate fallback to English
  return DEFAULT_ENGLISH_VOICE;
}

// Get message based on language (defaults to Hebrew)
function getMessage(key, language = "he-IL") {
  if (!language) {
    language = "he-IL"; // Default to Hebrew
  }

  const lang = language.toLowerCase();
  
  // Try exact match first
  if (MESSAGES[language] && MESSAGES[language][key]) {
    return MESSAGES[language][key];
  }
  
  // Try base language code
  if (lang.startsWith("he")) {
    return MESSAGES["he-IL"]?.[key] || MESSAGES["he"]?.[key] || "";
  } else if (lang.startsWith("en")) {
    return MESSAGES["en-US"]?.[key] || MESSAGES["en"]?.[key] || "";
  } else if (lang.startsWith("ar")) {
    return MESSAGES["ar"]?.[key] || "";
  }
  
  // Fallback to English, then Hebrew
  return MESSAGES["en-US"]?.[key] || MESSAGES["he-IL"]?.[key] || "";
}

// Get positive/negative keywords based on language
function getKeywords(language = "he-IL") {
  if (!language) {
    language = "he-IL"; // Default to Hebrew
  }

  const lang = language.toLowerCase();
  
  if (lang.startsWith("he")) {
    return {
      positive: ["כן", "בטח", "מעוניין", "מעוניינת", "זמין", "זמינה", "בסדר", "אוקיי", "yes", "yeah", "sure", "ok", "okay", "available", "interested"],
      negative: ["לא", "עסוק", "עסוקה", "אחר כך", "לא מעוניין", "לא מעוניינת", "no", "nope", "not", "busy", "later"],
    };
  } else if (lang.startsWith("en")) {
    return {
      positive: ["yes", "yeah", "sure", "ok", "okay", "available", "interested", "absolutely", "definitely", "of course"],
      negative: ["no", "nope", "not", "busy", "later", "not interested", "not available"],
    };
  } else if (lang.startsWith("ar")) {
    return {
      positive: ["نعم", "بالتأكيد", "ممكن", "متاح", "مهتم", "حسناً", "موافق"],
      negative: ["لا", "مشغول", "لاحقاً", "غير مهتم", "غير متاح"],
    };
  }
  
  // Default to English
  return {
    positive: ["yes", "yeah", "sure", "ok", "okay", "available", "interested"],
    negative: ["no", "nope", "not", "busy", "later"],
  };
}

function handleCors(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_DEFAULT_FROM = process.env.TWILIO_DEFAULT_FROM;
const TWILIO_VOICE_WEBHOOK =
  process.env.TWILIO_VOICE_WEBHOOK_URL ||
  `${BASE_FUNCTION_URL}/twilioVoiceWebhook`;
const TWILIO_STATUS_WEBHOOK =
  process.env.TWILIO_STATUS_WEBHOOK_URL ||
  `${BASE_FUNCTION_URL}/twilioStatusCallback`;

const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

// ── Admin Key Fallback (Issue 6) ─────────────────────────────────────────────
// Priority: 1) Company's own Twilio keys → 2) Admin SystemSettings/keys → 3) .env
async function getEffectiveTwilioCredentials(companyId) {
  const db = getFirestore();

  // 1. Company-specific credentials
  if (companyId) {
    try {
      const cd = await db.collection("Company").doc(String(companyId)).get();
      if (cd.exists) {
        const d = cd.data();
        if (d.twilioAccountSid && d.twilioAuthToken) {
          return {
            accountSid: d.twilioAccountSid,
            authToken: d.twilioAuthToken,
            defaultFrom: d.twilioDefaultFrom || TWILIO_DEFAULT_FROM,
            isOwn: true,
          };
        }
      }
    } catch (_) {}
  }

  // 2. Admin SystemSettings fallback
  try {
    const settingsDoc = await db.collection("SystemSettings").doc("keys").get();
    if (settingsDoc.exists) {
      const s = settingsDoc.data();
      if (s.twilioAccountSid && s.twilioAuthToken) {
        return {
          accountSid: s.twilioAccountSid,
          authToken: s.twilioAuthToken,
          defaultFrom: s.twilioDefaultFrom || TWILIO_DEFAULT_FROM,
          isOwn: false,
        };
      }
    }
  } catch (_) {}

  // 3. Env var fallback
  return {
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
    defaultFrom: TWILIO_DEFAULT_FROM,
    isOwn: false,
  };
}

// ── Credit Check (Issue 7) ────────────────────────────────────────────────────
// Returns {allowed: true} or {allowed: false, reason: "credit_exhausted", userId}
async function checkUserCredit(companyId) {
  if (!companyId) return {allowed: true};
  const db = getFirestore();
  try {
    const cd = await db.collection("Company").doc(String(companyId)).get();
    if (!cd.exists) return {allowed: true};
    const companyData = cd.data();
    const userRef = companyData.userId; // DocumentReference or string
    if (!userRef) return {allowed: true};
    const userDoc = typeof userRef === "string"
      ? await db.collection("user").doc(userRef).get()
      : await userRef.get();
    if (!userDoc.exists) return {allowed: true};
    const u = userDoc.data();
    // Only check credit for basic/unsubscribed plans
    const isBasic = u.subscriptionPlan === "basic" || (!u.subscribed && !u.stripe_subscription_status);
    if (!isBasic) return {allowed: true};
    const credit = u.creditBalance || 0;
    const expired = u.creditExpiresAt && u.creditExpiresAt.toDate && u.creditExpiresAt.toDate() < new Date();
    if (credit <= 0 || expired) {
      return {allowed: false, reason: "credit_exhausted", userId: userDoc.id};
    }
    return {allowed: true, userId: userDoc.id, credit};
  } catch (e) {
    logger.warn("Credit check error:", e.message);
    return {allowed: true}; // fail open — don't block calls on system errors
  }
}

function getJsonBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    return safeJsonParse(req.body);
  }
  return req.body;
}

/**
 * Replace {{placeholder}} tokens in a message with actual values
 * Supports: {{clientName}}, {{leadName}}, {{name}}, {{assistantName}}, {{companyName}}
 */
function replacePlaceholders(message, data) {
  if (!message || typeof message !== "string") {
    return message || "";
  }
  
  const leadName = data.leadName || data.clientName || data.name || "valued customer";
  const assistantName = data.assistantName || data.assistant?.name || "your assistant";
  const companyName = data.companyName || data.company || "our company";
  
  return message
    .replace(/\{\{clientName\}\}/gi, leadName)
    .replace(/\{\{leadName\}\}/gi, leadName)
    .replace(/\{\{name\}\}/gi, leadName)
    .replace(/\{\{assistantName\}\}/gi, assistantName)
    .replace(/\{\{companyName\}\}/gi, companyName)
    .replace(/\{\{company\}\}/gi, companyName);
}

function requireTwilio(res) {
  if (!twilioClient) {
    res.status(500).json({
      status: "error",
      message:
        "Twilio configuration missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.",
    });
    return false;
  }
  return true;
}

function collectPhoneNumbers(raw) {
  const numbers = new Set();
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        numbers.add(trimmed);
      }
    }
  };
  visit(raw);
  return numbers;
}

function flattenPhoneEntries(raw) {
  const entries = [];
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      entries.push(value);
    }
  };
  visit(raw);
  return entries;
}

function buildEntryKey(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.id) {
    return `id:${entry.id}`;
  }
  if (entry.phoneNumber) {
    return `phone:${entry.phoneNumber}`;
  }
  return null;
}

function normalizePhoneEntries(rawEntries) {
  const map = new Map();
  const existing = flattenPhoneEntries(rawEntries);
  existing.forEach((entry) => {
    const key = buildEntryKey(entry);
    if (!key) {
      return;
    }
    const current = map.get(key) || {};
    map.set(key, {...current, ...entry});
  });
  return map;
}

function upsertPhoneEntry(rawEntries, incomingEntry) {
  const map = normalizePhoneEntries(rawEntries);
  const key = buildEntryKey(incomingEntry);
  if (key) {
    const current = map.get(key) || {};
    map.set(key, {...current, ...incomingEntry});
  }
  return Array.from(map.values());
}

function removePhoneEntry(rawEntries, {sid, phoneNumber}) {
  const map = normalizePhoneEntries(rawEntries);
  if (sid) {
    map.delete(`id:${sid}`);
  }
  if (phoneNumber) {
    map.delete(`phone:${phoneNumber}`);
  }
  return Array.from(map.values());
}

exports.searchPhoneNumbers = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const country = (payload.country || "US").toUpperCase();
    const limit =
      typeof payload.limit === "number" && payload.limit > 0
        ? Math.min(payload.limit, 20)
        : 10;

    const searchParams = {
      limit,
    };

    if (payload.areaCode) {
      searchParams.areaCode = String(payload.areaCode);
    }

    if (payload.contains) {
      searchParams.contains = String(payload.contains);
    }

    const numbers = await twilioClient
      .availablePhoneNumbers(country)
      .local.list(searchParams);

    const formatted = numbers.map((number) => ({
      friendlyName: number.friendlyName,
      phoneNumber: number.phoneNumber,
      locality: number.locality,
      region: number.region,
      postalCode: number.postalCode,
      isoCountry: number.isoCountry,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    logger.error("Failed to search Twilio numbers", error);
    res.status(500).json({
      status: "error",
      message: "Failed to search phone numbers",
    });
  }
});

exports.purchasePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const phoneNumber = payload.phoneNumber || payload.number;
    if (!phoneNumber) {
      res.status(400).json({
        status: "error",
        message: "phoneNumber is required.",
      });
      return;
    }

    const friendlyName = payload.friendlyName || "VoiceFlow AI";
    const companyId = payload.companyId;

    const purchased = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName,
      voiceUrl: TWILIO_VOICE_WEBHOOK,
      voiceMethod: "POST",
      statusCallback: TWILIO_STATUS_WEBHOOK,
      statusCallbackMethod: "POST",
      smsUrl: TWILIO_VOICE_WEBHOOK,
      smsMethod: "POST",
    });

    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          const data = snapshot.exists ? snapshot.data() : {};
          const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers);
          currentNumbers.add(purchased.phoneNumber);

          const phoneEntry = {
            id: purchased.sid,
            label: "inbound_outbound",
            phoneNumber: purchased.phoneNumber,
          };
          if (friendlyName) {
            phoneEntry.friendlyName = friendlyName;
          }

          const nextEntries = upsertPhoneEntry(data?.phoneNumberMap, phoneEntry);

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
        });
      } catch (updateError) {
        logger.error(
          `Failed to update company phone numbers for company ${companyId}`,
          updateError,
        );
      }
    }

    res.status(201).json({
      status: "success",
      sid: purchased.sid,
      phoneNumber: purchased.phoneNumber,
      friendlyName: purchased.friendlyName,
    });
  } catch (error) {
    logger.error("Failed to purchase Twilio number", error);
    res.status(500).json({
      status: "error",
      message: "Failed to purchase phone number",
    });
  }
});

exports.assistantsCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  // Rate limit: 30 creates per minute per IP
  if (!applyRateLimit(req, res, {maxRequests: 30, windowMs: 60000})) {
    return;
  }

  try {
    // Sanitize all input to prevent XSS
    const rawPayload = getJsonBody(req);
    const payload = sanitizeObject(rawPayload);
    const db = getFirestore();
    const docRef = db.collection("assistants").doc();
    const now = FieldValue.serverTimestamp();

    const definition = payload.assistant || payload;
    const ownerId =
      payload.userId ||
      payload.metadata?.userId ||
      payload.ownerId ||
      payload.metadata?.ownerId ||
      null;
    const companyId =
      payload.companyId || payload.metadata?.companyId || payload.metadata?.orgId || null;

    const record = {
      id: docRef.id,
      name: payload.name || definition?.name || "Assistant",
      firstMessage: payload.firstMessage || definition?.firstMessage || "",
      language:
        payload.language ||
        definition?.transcriber?.language ||
        definition?.model?.language ||
        "he-IL",
      definition,
      ownerId,
      companyId,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(record);

    res.status(201).json({
      id: docRef.id,
      name: record.name,
      firstMessage: record.firstMessage,
      language: record.language,
      assistant: definition,
      metadata: {
        ownerId,
        companyId,
      },
    });
  } catch (error) {
    logger.error("Failed to create assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create assistant",
    });
  }
});

exports.assistantsUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "PATCH") {
    res.set("Allow", "POST, PATCH");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or PATCH.",
    });
    return;
  }

  // Rate limit: 30 updates per minute per IP
  if (!applyRateLimit(req, res, {maxRequests: 30, windowMs: 60000})) {
    return;
  }

  try {
    const payload = sanitizeObject(getJsonBody(req));
    const assistantId = payload.id || payload.assistantId;
    if (!assistantId) {
      res.status(400).json({
        status: "error",
        message: "Assistant id is required.",
      });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("assistants").doc(assistantId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      res
        .status(404)
        .json(buildNotFoundResponse("Assistant not found", {assistantId}));
      return;
    }

    const updates = {};
    const definition = snapshot.data().definition || {};
    const newDefinition = payload.assistant || payload.definition;

    if (payload.name) {
      updates.name = payload.name;
    }
    if (payload.firstMessage) {
      updates.firstMessage = payload.firstMessage;
    }
    if (payload.language) {
      updates.language = payload.language;
    }
    if (newDefinition) {
      updates.definition = newDefinition;
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    await docRef.set(updates, {merge: true});

    const result = await docRef.get();
    res.status(200).json({
      id: result.id,
      ...result.data(),
      definition: result.data().definition || definition,
    });
  } catch (error) {
    logger.error("Failed to update assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update assistant",
    });
  }
});

exports.assistantsDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.set("Allow", "POST, DELETE");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or DELETE.",
    });
    return;
  }

  try {
    const payload = getJsonBody(req);
    const assistantId = payload.id || payload.assistantId;
    if (!assistantId) {
      res.status(400).json({
        status: "error",
        message: "Assistant id is required.",
      });
      return;
    }

    const db = getFirestore();
    await db.collection("assistants").doc(assistantId).delete();
    res.status(200).json(buildSuccessResponse({assistantId}));
  } catch (error) {
    logger.error("Failed to delete assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete assistant",
    });
  }
});

exports.assistantsList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.set("Allow", "GET");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected GET.",
    });
    return;
  }

  try {
    const db = getFirestore();
    const snapshot = await db
      .collection("assistants")
      .orderBy("createdAt", "desc")
      .get();

    const assistants = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.assistantName || "(Unnamed)",
        assistantName: data.assistantName || data.name || "(Unnamed)",
        firstMessage: data.firstMessage,
        language: data.language,
        voice: data.voice || null,
        isActive: data.isActive !== false,
        assistant: data.definition,
        metadata: {
          ownerId: data.ownerId || null,
          companyId: data.companyId || null,
        },
      };
    });

    res.status(200).json(assistants);
  } catch (error) {
    logger.error("Failed to list assistants", error);
    res.status(500).json({
      status: "error",
      message: "Failed to list assistants",
    });
  }
});

exports.assistantsGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.set("Allow", "GET");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected GET.",
    });
    return;
  }

  try {
    const assistantId = req.query.assistantId || req.query.id;
    if (!assistantId) {
      res.status(400).json({
        status: "error",
        message: "assistantId query parameter is required.",
      });
      return;
    }

    const db = getFirestore();
    const doc = await db.collection("assistants").doc(String(assistantId)).get();
    if (!doc.exists) {
      res
        .status(404)
        .json(buildNotFoundResponse("Assistant not found", {assistantId}));
      return;
    }

    const data = doc.data();
    res.status(200).json({
      id: doc.id,
      assistant: data.definition,
      name: data.name,
      firstMessage: data.firstMessage,
      language: data.language,
      metadata: {
        ownerId: data.ownerId || null,
        companyId: data.companyId || null,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch assistant",
    });
  }
});

exports.configurePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const rawNumber = payload.number || payload.phoneNumber;
    if (!rawNumber) {
      res.status(400).json({
        status: "error",
        message: "number is required.",
      });
      return;
    }

    const friendlyName = payload.name || payload.friendlyName || "VoiceFlow AI";
    const phoneNumber = rawNumber.trim();
    const companyId = payload.companyId || null;

    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber,
      limit: 1,
    });

    if (!numbers || numbers.length === 0) {
      res.status(404).json(
        buildNotFoundResponse("Twilio number not found", {
          phoneNumber,
        }),
      );
      return;
    }

    const target = numbers[0];
    await target.update({
      friendlyName,
      voiceUrl: TWILIO_VOICE_WEBHOOK,
      voiceMethod: "POST",
      statusCallback: TWILIO_STATUS_WEBHOOK,
      statusCallbackMethod: "POST",
      smsUrl: TWILIO_VOICE_WEBHOOK,
      smsMethod: "POST",
    });

    // If companyId provided, ensure the number is added to the company
    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          if (!snapshot.exists) {
            logger.warn(`Company ${companyId} not found, skipping phone number addition`);
            return;
          }
          
          const data = snapshot.data() || {};
          const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers || []);
          currentNumbers.add(target.phoneNumber);

          const phoneEntry = {
            id: target.sid,
            label: "inbound_outbound",
            phoneNumber: target.phoneNumber,
          };
          if (friendlyName) {
            phoneEntry.friendlyName = friendlyName;
          }

          const nextEntries = upsertPhoneEntry(data?.phoneNumberMap || [], phoneEntry);

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
          
          logger.info(`Added phone number ${target.phoneNumber} to company ${companyId}`);
        });
      } catch (updateError) {
        logger.error(
          `Failed to add phone number to company ${companyId}`,
          updateError,
        );
        // Don't fail the request if company update fails
      }
    }

    res.status(201).json({
      id: target.sid,
      number: target.phoneNumber,
      status: "configured",
      voiceUrl: TWILIO_VOICE_WEBHOOK,
      companyId: companyId || null,
    });
  } catch (error) {
    logger.error("Failed to configure phone number", error);
    res.status(500).json({
      status: "error",
      message: "Failed to configure phone number",
    });
  }
});

exports.releasePhoneNumber = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.set("Allow", "POST, DELETE");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST or DELETE.",
    });
    return;
  }

  if (!requireTwilio(res)) {
    return;
  }

  try {
    const payload = getJsonBody(req);
    const sid = payload.sid || payload.phoneSid || payload.numberSid;
    if (!sid) {
      res.status(400).json({
        status: "error",
        message: "sid is required.",
      });
      return;
    }

    await twilioClient.incomingPhoneNumbers(sid).remove();

    const companyId = payload.companyId;
    const phoneNumber = payload.phoneNumber;
    const friendlyName = payload.friendlyName || null;
    if (companyId) {
      const db = getFirestore();
      const companyRef = db.collection("Company").doc(String(companyId));
      try {
        await db.runTransaction(async (trx) => {
          const snapshot = await trx.get(companyRef);
          if (!snapshot.exists) {
            return;
          }
          const data = snapshot.data() || {};
          const currentNumbers = collectPhoneNumbers(data.companyPhoneNumbers);
          let resolvedNumber = typeof phoneNumber === "string" ? phoneNumber.trim() : null;

          if (!resolvedNumber) {
            const entries = normalizePhoneEntries(data.phoneNumberMap);
            const byId = entries.get(`id:${sid}`);
            if (byId && byId.phoneNumber) {
              resolvedNumber = byId.phoneNumber;
            }
          }

          if (resolvedNumber) {
            currentNumbers.delete(resolvedNumber);
          }

          const nextEntries = removePhoneEntry(data.phoneNumberMap, {
            sid,
            phoneNumber: resolvedNumber,
          }).map((entry) => {
            if (!entry) {
              return entry;
            }
            if (entry.id === sid && friendlyName === null) {
              const cloned = {...entry};
              delete cloned.friendlyName;
              return cloned;
            }
            if (entry.id === sid && friendlyName) {
              return {...entry, friendlyName};
            }
            return entry;
          });

          trx.set(
            companyRef,
            {
              companyPhoneNumbers: Array.from(currentNumbers),
              phoneNumberMap: nextEntries,
            },
            {merge: true},
          );
        });
      } catch (updateError) {
        logger.error(
          `Failed to remove phone number from company ${companyId}`,
          updateError,
        );
      }
    }

    res.status(200).json({
      status: "success",
      sid,
      phoneNumber: phoneNumber || null,
    });
  } catch (error) {
    logger.error("Failed to release phone number", error);
    res.status(500).json({
      status: "error",
      message: "Failed to release phone number",
    });
  }
});

exports.placeCall = onRequest({...corsOptions, minInstances: 1, memory: "512MiB"}, async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  try {
    const payload = getJsonBody(req);

    const rawLeadNumber = payload.number || payload.leadPhone;
    // Normalize: strip spaces/dashes, add + if missing (e.g. 972... → +972...)
    const leadNumber = rawLeadNumber
      ? (() => {
          const stripped = String(rawLeadNumber).replace(/[\s\-()]/g, "");
          if (stripped.startsWith("+")) return stripped;
          if (stripped.startsWith("00")) return "+" + stripped.slice(2);
          // If starts with country code digits (e.g. 972, 1, 44) without +
          if (/^\d{10,15}$/.test(stripped)) return "+" + stripped;
          return stripped; // already formatted or short local number
        })()
      : null;
    if (!leadNumber) {
      res.status(400).json({
        status: "error",
        message: "Lead phone number is required.",
      });
      return;
    }

    let companyId = payload.companyId || null;
    const assistantId = payload.assistantId || payload.assistant?.id || null;
    let rawAssistantDefinition = payload.assistantJson || payload.assistant || {};

    // If assistantId provided but definition incomplete, fetch from Firestore
    if (assistantId && (!rawAssistantDefinition.firstMessage && !rawAssistantDefinition.inboundmessage && !rawAssistantDefinition.outboundmessage)) {
      try {
        const db = getFirestore();
        const aDoc = await db.collection("assistants").doc(assistantId).get();
        if (aDoc.exists) {
          const aData = aDoc.data();
          // Merge fetched data; payload fields take precedence
          rawAssistantDefinition = { ...aData, ...(aData.definition || {}), ...rawAssistantDefinition };
          if (!companyId) companyId = aData.companyId || null;
        }
      } catch (fetchErr) {
        logger.warn("[placeCall] Could not fetch assistant doc", { assistantId, err: fetchErr.message });
      }
    }

    // Issue 7: Credit check — block BASIC users with exhausted credit
    const creditCheck = await checkUserCredit(companyId);
    if (!creditCheck.allowed) {
      res.status(402).json({
        status: "error",
        code: "credit_exhausted",
        message: "הקרדיט שלך נגמר. שדרג לחבילת Pro כדי להמשיך בשיחות.",
        messageEn: "Your free credit has been exhausted. Upgrade to Pro to continue placing calls.",
      });
      return;
    }

    // Check if company uses Asterisk
    const asteriskConfig = await asteriskService.getAsteriskConfig(companyId);
    const useAsterisk = asteriskConfig !== null;

    // Issue 6: Get effective Twilio credentials (company own → admin fallback → env)
    let effectiveTwilioClient = twilioClient;
    let effectiveFromNumber = TWILIO_DEFAULT_FROM;
    if (!useAsterisk) {
      const creds = await getEffectiveTwilioCredentials(companyId);
      if (!creds.accountSid || !creds.authToken) {
        res.status(400).json({
          status: "error",
          message: "Twilio credentials not configured. Add your Twilio keys in Settings or contact your administrator.",
        });
        return;
      }
      effectiveTwilioClient = twilio(creds.accountSid, creds.authToken);
      effectiveFromNumber = creds.defaultFrom;
    }

    const companyPhone =
      payload.companyPhone ||
      payload.companyPhoneNumber ||
      (useAsterisk ? asteriskConfig.defaultCallerId : effectiveFromNumber);

    if (!companyPhone) {
      res.status(400).json({
        status: "error",
        message: "Company phone number is required.",
      });
      return;
    }

    // Extract data for placeholder replacement
    const leadName = payload.name || payload.leadName || rawAssistantDefinition.leadName || "";
    const assistantName = rawAssistantDefinition.name || rawAssistantDefinition.assistantName || 
                          payload.metadata?.assistantName || "your assistant";
    const companyName = rawAssistantDefinition.companyName || 
                        payload.metadata?.company || "our company";
    
    // Replace placeholders in firstMessage
    const placeholderData = {
      leadName,
      assistantName,
      companyName,
    };
    
    const processedFirstMessage = replacePlaceholders(
      rawAssistantDefinition.firstMessage || "",
      placeholderData
    );
    
    // Create processed assistant definition with replaced placeholders
    // Strip undefined values to avoid Firestore write errors
    const rawMerged = {
      ...rawAssistantDefinition,
      firstMessage: processedFirstMessage,
      originalFirstMessage: rawAssistantDefinition.firstMessage || null,
    };
    const assistantDefinition = Object.fromEntries(
      Object.entries(rawMerged).filter(([, v]) => v !== undefined)
    );

    // Check for scenario-based call
    const scenarioId = payload.scenarioId || null;
    
    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc();
    const sessionId = sessionRef.id;

    // Build session data
    const sessionData = {
      id: sessionId,
      assistantId,
      assistantDefinition,
      leadName,
      leadNumber,
      companyId,
      companyPhone,
      companyName,
      assistantName,
      telephonyProvider: useAsterisk ? "asterisk" : "twilio",
      status: "initiated",
      metadata: payload.metadata || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // If scenario is specified, initialize scenario context
    if (scenarioId) {
      const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
      if (scenarioDoc.exists) {
        const scenario = scenarioDoc.data();
        const startNode = scenarioEngine.getStartNode({nodes: scenario.nodes});
        
        sessionData.scenarioId = scenarioId;
        sessionData.currentNodeId = startNode?.id || null;
        sessionData.scenarioContext = {
          variables: {},
          defaultVoice: scenario.settings?.defaultVoice || DEFAULT_HEBREW_VOICE,
          defaultLanguage: scenario.settings?.defaultLanguage || "he-IL",
          leadName,
          companyName,
          assistantName,
        };
        
        logger.info(`Using scenario ${scenarioId} for call session ${sessionId}`);
      }
    }

    await sessionRef.set(sessionData);

    // Route to appropriate provider
    if (useAsterisk) {
      // Use Asterisk Bridge
      logger.info(`Placing call via Asterisk for company ${companyId}`);
      
      const asteriskResult = await asteriskService.placeCallViaAsterisk(asteriskConfig, {
        leadNumber,
        leadName,
        companyName,
        assistantName,
        greeting: processedFirstMessage,
        companyPhone,
        callSessionId: sessionId,
        metadata: payload.metadata || {},
      });

      if (asteriskResult.success) {
        await sessionRef.set(
          {
            asteriskCallId: asteriskResult.callId,
            asteriskChannelId: asteriskResult.channelId,
            status: "dialing",
          },
          {merge: true},
        );

        res.status(201).json({
          status: "initiated",
          callId: asteriskResult.callId,
          callSessionId: sessionId,
          provider: "asterisk",
        });
      } else {
        await sessionRef.set({status: "failed", error: asteriskResult.error}, {merge: true});
        res.status(500).json({
          status: "error",
          message: asteriskResult.error || "Asterisk call failed",
          provider: "asterisk",
        });
      }
    } else {
      // Use Twilio
      logger.info(`Placing call via Twilio for company ${companyId}`);
      
      // Use scenario flow URL if scenario is configured, otherwise use default webhook
      const webhookUrl = scenarioId 
        ? `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${sessionId}`
        : `${TWILIO_VOICE_WEBHOOK}?callSessionId=${sessionId}`;
      
      const twilioCall = await effectiveTwilioClient.calls.create({
        to: leadNumber,
        from: companyPhone,
        url: webhookUrl,
        statusCallback: `${TWILIO_STATUS_WEBHOOK}?callSessionId=${sessionId}`,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      });

      await sessionRef.set(
        {
          twilioSid: twilioCall.sid,
          status: "dialing",
        },
        {merge: true},
      );

      res.status(201).json({
        status: "initiated",
        callSid: twilioCall.sid,
        callSessionId: sessionId,
        provider: "twilio",
      });
    }
  } catch (error) {
    logger.error("Failed to place call", error);
    res.status(500).json({
      status: "error",
      message: "Failed to place call",
    });
  }
});

exports.twilioVoiceWebhook = onRequest(
  {minInstances: 1, timeoutSeconds: 120, memory: "512MiB"},
  async (req, res) => {
  // CRITICAL: Log immediately using multiple methods to ensure visibility
  const logData = {
    method: req.method,
    query: req.query,
    bodyKeys: Object.keys(req.body || {}),
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    },
  };
  
  // Use console.log FIRST (most reliable for Cloud Logging)
  console.log("=== twilioVoiceWebhook CALLED ===");
  console.log(JSON.stringify(logData, null, 2));
  console.log("Request body:", JSON.stringify(req.body || {}, null, 2));
  console.log("Request query:", JSON.stringify(req.query || {}, null, 2));
  
  // Also try logger
  try {
    logger.info("twilioVoiceWebhook called", logData);
  } catch (logError) {
    console.error("Logger failed:", logError);
  }
  
  try {
    // Check if twilio and twilio.twiml are available
    if (!twilio || !twilio.twiml) {
      const errorMsg = "Twilio module not available";
      logger.error(errorMsg, {
        twilioAvailable: !!twilio,
        twimlAvailable: !!(twilio && twilio.twiml),
      });
      console.error(`[twilioVoiceWebhook] ${errorMsg}`, {twilioAvailable: !!twilio, twimlAvailable: !!(twilio && twilio.twiml)});
      
      try {
        const response = new (require("twilio").twiml.VoiceResponse)();
        response.say(
          {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
          "שלום. המערכת לא מוגדרת כראוי. אנא צור קשר עם התמיכה.",
        );
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      } catch (twilioError) {
        console.error("[twilioVoiceWebhook] Failed to create Twilio response", twilioError);
        res.set("Content-Type", "text/xml");
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">שלום. המערכת לא מוגדרת כראוי. אנא צור קשר עם התמיכה.</Say><Hangup/></Response>');
        return;
      }
    }
    
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    console.log("[twilioVoiceWebhook] callSessionId:", callSessionId);
    
    let response;
    try {
      response = new twilio.twiml.VoiceResponse();
      console.log("[twilioVoiceWebhook] Twilio response created successfully");
    } catch (twimlError) {
      logger.error("Failed to create Twilio TwiML response", {
        error: twimlError.message,
        stack: twimlError.stack,
      });
      console.error("[twilioVoiceWebhook] Failed to create TwiML response", twimlError);
      res.set("Content-Type", "text/xml");
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">שלום. המערכת לא מוגדרת כראוי. אנא צור קשר עם התמיכה.</Say><Hangup/></Response>');
      return;
    }
    
    const db = getFirestore();
    console.log("[twilioVoiceWebhook] Firestore initialized:", !!db);
    
    if (!db) {
      logger.error("Firestore not available");
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        "שלום. המערכת לא מוגדרת כראוי. אנא צור קשר עם התמיכה.",
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    let snapshot = null;
    let sessionId = callSessionId;
    
    // Get callSid early - needed for both inbound and outbound calls
    const callSid = req.body?.CallSid || req.query?.CallSid || "";
    
    // If no callSessionId, this is an incoming call - create session from phone number
    if (!callSessionId) {
      try {
        // Get incoming phone number from Twilio request
        const incomingNumber = req.body?.Called || req.body?.To || req.query?.To || "";
        const callerNumber = req.body?.From || req.body?.Caller || req.query?.From || "";
        
        if (!incomingNumber) {
          logger.warn("Incoming call but no phone number found in request", {body: req.body, query: req.query});
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            getMessage("contactSupport", "he-IL"),
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
          return;
        }
        
        // Find company by phone number
        // Normalize incoming number - try multiple formats
        const normalizePhone = (num) => {
          if (!num) return "";
          let normalized = String(num).replace(/\s+/g, "").replace(/-/g, "").replace(/\(/g, "").replace(/\)/g, "");
          // Keep + prefix for E.164 format matching
          return normalized;
        };
        
        // Create all possible variations of the incoming number
        const normalizedIncoming = normalizePhone(incomingNumber);
        const variations = [
          normalizedIncoming, // Original: +19179243285
          normalizedIncoming.replace(/^\+/, ""), // Without +: 19179243285
          normalizedIncoming.replace(/^\+1/, ""), // Without +1: 9179243285
          normalizedIncoming.replace(/^\+1/, "1"), // With 1 but no +: 19179243285
          incomingNumber, // Original from Twilio
        ];
        
        // Also add variations with/without leading 1
        if (normalizedIncoming.startsWith("+1")) {
          variations.push(normalizedIncoming.substring(2)); // 9179243285
          variations.push(`1${normalizedIncoming.substring(2)}`); // 19179243285
        }
        if (normalizedIncoming.startsWith("1") && !normalizedIncoming.startsWith("+")) {
          variations.push(`+${normalizedIncoming}`); // +19179243285
          variations.push(normalizedIncoming.substring(1)); // 9179243285
        }
        
        logger.info(`Searching for company with incoming number: ${incomingNumber} (normalized: ${normalizedIncoming})`);
        console.log(`[twilioVoiceWebhook] Searching for company with incoming number: ${incomingNumber} (normalized: ${normalizedIncoming})`);
        
        let companyDoc = null;
        
        // Search all companies (since Firestore doesn't support complex queries on phoneNumberMap)
        console.log("[twilioVoiceWebhook] Fetching all companies from Firestore...");
        let allCompanies;
        try {
          allCompanies = await db.collection("Company").get();
          console.log(`[twilioVoiceWebhook] Found ${allCompanies.size} companies`);
        } catch (firestoreError) {
          logger.error("Failed to fetch companies from Firestore", {
            error: firestoreError.message,
            stack: firestoreError.stack,
          });
          console.error("[twilioVoiceWebhook] Failed to fetch companies", firestoreError);
          throw firestoreError;
        }
        
        for (const company of allCompanies.docs) {
          const companyData = company.data();
          
          // Check phoneNumberMap (array of objects with phoneNumber field)
          const phoneNumberMap = companyData.phoneNumberMap || [];
          const hasNumberInMap = phoneNumberMap.some((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const entryNumber = entry.phoneNumber || "";
            const normalizedEntry = normalizePhone(entryNumber);
            
            // Check all variations
            return variations.some((variant) => {
              const normalizedVariant = normalizePhone(variant);
              return normalizedEntry === normalizedVariant || 
                     entryNumber === variant ||
                     normalizedEntry === variant ||
                     entryNumber === normalizedVariant;
            });
          });
          
          // Also check companyPhoneNumbers (array of strings)
          const companyPhoneNumbers = companyData.companyPhoneNumbers || [];
          const hasNumberInList = companyPhoneNumbers.some((num) => {
            if (!num) return false;
            const normalizedNum = normalizePhone(num);
            
            // Check all variations
            return variations.some((variant) => {
              const normalizedVariant = normalizePhone(variant);
              return normalizedNum === normalizedVariant || 
                     num === variant ||
                     normalizedNum === variant ||
                     num === normalizedVariant;
            });
          });
          
          if (hasNumberInMap || hasNumberInList) {
            companyDoc = {id: company.id, ...companyData};
            logger.info(`Found company ${company.id} (${companyData.name || 'unnamed'}) for incoming number ${incomingNumber}`);
            break;
          }
        }
        
        if (!companyDoc) {
          logger.warn(`No company found for incoming number: ${incomingNumber} (tried variations: ${variations.join(', ')})`);
          logger.info(`Total companies checked: ${allCompanies.size}`);
          
          // Try to find a company with assistant configuration and auto-assign the number
          let companyToAssign = null;
          for (const company of allCompanies.docs) {
            const companyData = company.data();
            // Check if company has assistant configuration
            if (companyData.inboundmessage || companyData.assistantname) {
              companyToAssign = {id: company.id, ...companyData};
              logger.info(`Auto-assigning number ${incomingNumber} to company ${company.id} (${companyData.name || 'unnamed'})`);
              break;
            }
          }
          
          if (companyToAssign) {
            // Get Twilio SID for this number
            let twilioSid = null;
            if (twilioClient) {
              try {
                const twilioNumbers = await twilioClient.incomingPhoneNumbers.list({
                  phoneNumber: incomingNumber,
                  limit: 1,
                });
                if (twilioNumbers && twilioNumbers.length > 0) {
                  twilioSid = twilioNumbers[0].sid;
                }
              } catch (twilioError) {
                logger.warn(`Could not fetch Twilio SID for ${incomingNumber}:`, twilioError);
              }
            } else {
              logger.warn(`Twilio client not initialized, cannot fetch SID for ${incomingNumber}`);
            }
            
            // Add number to company
            try {
              const companyRef = db.collection("Company").doc(companyToAssign.id);
              await db.runTransaction(async (trx) => {
                const snapshot = await trx.get(companyRef);
                if (!snapshot.exists) {
                  return;
                }
                
                const data = snapshot.data() || {};
                const currentNumbers = collectPhoneNumbers(data?.companyPhoneNumbers || []);
                currentNumbers.add(incomingNumber);
                
                const phoneEntry = {
                  id: twilioSid || `auto-${Date.now()}`,
                  label: "inbound_outbound",
                  phoneNumber: incomingNumber,
                };
                
                const nextEntries = upsertPhoneEntry(data?.phoneNumberMap || [], phoneEntry);
                
                trx.set(
                  companyRef,
                  {
                    companyPhoneNumbers: Array.from(currentNumbers),
                    phoneNumberMap: nextEntries,
                  },
                  {merge: true},
                );
              });
              
              logger.info(`Successfully added number ${incomingNumber} to company ${companyToAssign.id}`);
              companyDoc = companyToAssign;
            } catch (assignError) {
              logger.error(`Failed to auto-assign number ${incomingNumber} to company:`, assignError);
            }
          }
          
          if (!companyDoc) {
            logger.error(`No company found and auto-assignment failed for number: ${incomingNumber}`);
            response.say(
              {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
              "שלום. המספר הזה לא משויך למערכת. אנא צור קשר עם התמיכה.",
            );
            response.hangup();
            res.set("Content-Type", "text/xml");
            res.status(200).send(response.toString());
            return;
          }
        }
        
        // Verify company has assistant configuration
        if (!companyDoc.inboundmessage && !companyDoc.assistantname) {
          logger.warn(`Company ${companyDoc.id} found but missing assistant configuration`);
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            "שלום. העוזר הווירטואלי לא מוגדר עבור מספר זה. אנא צור קשר עם התמיכה.",
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
          return;
        }
        
        // Create new call session for incoming call
        const sessionRef = db.collection("call_sessions").doc();
        sessionId = sessionRef.id;
        
        // Build assistant definition from company data
        const assistantName = companyDoc.assistantname || "העוזר הווירטואלי";
        const companyName = companyDoc.name || "החברה";
        const rawFirstMessage = companyDoc.inboundmessage || getMessage("defaultGreeting", "he-IL");
        
        // Replace placeholders in firstMessage
        const processedFirstMessage = replacePlaceholders(rawFirstMessage, {
          assistantName: assistantName,
          companyName: companyName,
          leadName: "", // No lead name for inbound calls
        });
        
        // Get STT provider from company settings
        const sttProvider = companyDoc.transcriber?.provider || companyDoc.sttProvider || "twilio";
        const sttModel = companyDoc.transcriber?.model || companyDoc.sttModel || "nova-2";
        
        const assistantDefinition = {
          name: assistantName,
          assistantName: assistantName,
          companyName: companyName,
          firstMessage: processedFirstMessage,
          voice: companyDoc.voice || DEFAULT_HEBREW_VOICE,
          language: companyDoc.language || "he-IL",
          transcriber: {
            provider: sttProvider,
            model: sttModel,
            language: companyDoc.language || "he-IL",
          },
          sttProvider: sttProvider,
          sttModel: sttModel,
        };
        
        // Create session data
        const sessionData = {
          id: sessionId,
          companyId: companyDoc.id,
          assistantDefinition,
          leadNumber: callerNumber,
          companyPhone: incomingNumber,
          companyName: companyDoc.name || "החברה",
          assistantName: companyDoc.assistantname || "העוזר הווירטואלי",
          telephonyProvider: "twilio",
          status: "in-progress",
          twilioSid: callSid,
          callType: "inbound",
          conversationHistory: [],
          metadata: {
            callType: "inbound",
            callerNumber: callerNumber,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        
        await sessionRef.set(sessionData);
        logger.info(`Created inbound call session ${sessionId} for company ${companyDoc.id}`);
        
        // Get the session we just created
        snapshot = await sessionRef.get();
      } catch (incomingError) {
        // CRITICAL: Log with maximum detail
        const errorDetails = {
          error: incomingError.message,
          stack: incomingError.stack,
          name: incomingError.name,
          code: incomingError.code,
          errno: incomingError.errno,
          syscall: incomingError.syscall,
          incomingNumber: req.body?.Called || req.body?.To || req.query?.To,
          callerNumber: req.body?.From || req.body?.Caller || req.query?.From,
          callSid: callSid,
          body: req.body,
          query: req.query,
        };
        
        console.error("[twilioVoiceWebhook] INCOMING CALL ERROR:", JSON.stringify(errorDetails, null, 2));
        logger.error("Failed to handle incoming call", errorDetails);
        
        try {
          response.say(
            {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
            "אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.",
          );
          response.hangup();
          res.set("Content-Type", "text/xml");
          res.status(200).send(response.toString());
        } catch (responseError) {
          console.error("[twilioVoiceWebhook] Failed to send error response", responseError);
          // Last resort: send raw XML
          res.set("Content-Type", "text/xml");
          res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.</Say><Hangup/></Response>');
        }
        return;
      }
    } else {
      // Existing session (outbound call)
      snapshot = await db.collection("call_sessions").doc(String(callSessionId)).get();
      
      if (!snapshot.exists) {
        response.say(
          {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
          getMessage("assistantNotFound", "he-IL"),
        );
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      }
    }

    const data = snapshot.data();
    
    // Validate that we have session data
    if (!data) {
      console.error("[twilioVoiceWebhook] Session data is null or undefined", {sessionId, callSessionId});
      logger.error("Session data is null or undefined", {sessionId, callSessionId});
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        getMessage("assistantNotFound", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    // Check if this session uses a scenario flow
    // IMPORTANT: Inbound calls ALWAYS use dynamic LLM, never scenario flow
    // Only outbound calls with explicit scenarioId should use scenario flow
    const isInboundCall = data.callType === "inbound" || !callSessionId;
    if (data.scenarioId && !isInboundCall) {
      // Redirect to scenario flow execution (only for outbound calls with scenario)
      console.log("[twilioVoiceWebhook] Using scenario flow for outbound call", {scenarioId: data.scenarioId, sessionId});
      logger.info("Using scenario flow for outbound call", {scenarioId: data.scenarioId, sessionId});
      response.redirect(
        `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${sessionId}`
      );
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    // For inbound calls, always use dynamic LLM (even if scenarioId exists)
    if (isInboundCall) {
      console.log("[twilioVoiceWebhook] Using dynamic LLM for inbound call", {sessionId, hasScenarioId: !!data.scenarioId});
      logger.info("Using dynamic LLM for inbound call", {sessionId, hasScenarioId: !!data.scenarioId});
    }
    
    const assistant = data.assistantDefinition || {};
    
    // Validate assistant definition
    if (!assistant || Object.keys(assistant).length === 0) {
      console.error("[twilioVoiceWebhook] Assistant definition is missing or empty", {sessionId, callSessionId, hasData: !!data});
      logger.error("Assistant definition is missing or empty", {sessionId, callSessionId, hasData: !!data});
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        getMessage("assistantNotFound", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    // Get voice settings from assistant definition
    const language = assistant.language || "he-IL";
    const voiceId = resolveVoiceForLanguage(assistant.voice, language);
    
    // Get the processed greeting (placeholders already replaced in placeCall)
    console.log("[twilioVoiceWebhook] Getting greeting...");
    const greeting =
      assistant.firstMessage ||
      assistant.greeting ||
      getMessage("defaultGreeting", language);
    
    // Validate greeting
    if (!greeting || !greeting.trim()) {
      console.error("[twilioVoiceWebhook] Greeting is empty", {sessionId, callSessionId, assistant});
      logger.error("Greeting is empty", {sessionId, callSessionId, assistant});
      // Use default greeting
      const defaultGreeting = getMessage("defaultGreeting", language);
      response.say(
        {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
        defaultGreeting,
      );
    } else {
      console.log("[twilioVoiceWebhook] Greeting:", greeting?.substring(0, 50) + "...");
    }

    // Initialize conversation history if not exists
    console.log("[twilioVoiceWebhook] Initializing conversation history...");
    const conversationHistory = data.conversationHistory || [];
    if (conversationHistory.length === 0) {
      console.log("[twilioVoiceWebhook] Adding greeting to conversation history...");
      // Add greeting to history as first assistant message
      // Note: Cannot use FieldValue.serverTimestamp() inside array, use Date instead
      conversationHistory.push({
        role: "assistant",
        content: greeting,
        timestamp: new Date(),
      });
      
      // Save initial history
      console.log("[twilioVoiceWebhook] Saving conversation history to Firestore...");
      await snapshot.ref.set({
        conversationHistory,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      console.log("[twilioVoiceWebhook] Conversation history saved");
    }

    // Ensure language is full code (he-IL) for Twilio Say
    const sayLanguage = language === "he" ? "he-IL" : language;
    console.log("[twilioVoiceWebhook] Saying greeting with voice:", voiceId, "language:", sayLanguage);

    // Use sessionId (which is either callSessionId for outbound or newly created for inbound)
    const finalSessionId = sessionId || callSessionId;

    // ── Speech Recognition Setup ─────────────────────────────────────────
    // NOTE: Twilio Media Streams (Deepgram) requires WebSocket (wss://) which
    // Firebase Cloud Functions (onRequest) cannot handle. WebSocket support
    // requires a separate Cloud Run service deployment.
    // Using Twilio Gather as the primary STT provider.
    // Gather with nested <Say> provides automatic barge-in (interruption).
    const gatherLanguage = language === "he" ? "he-IL" : (language || "he-IL");

    // Hebrew speech hints for improved recognition quality
    const hebrewHints = language?.startsWith("he")
      ? "שלום,כן,לא,תודה,אני,מעוניין,לא מעוניין,בבקשה,מה,איך,מתי,למה,עזרה,שירות,מידע,להתראות,טוב,בסדר,נכון,אוקיי,רגע,שנייה"
      : "";

    try {
      const greetingToSay = greeting || getMessage("defaultGreeting", language);
      const isHebrew = gatherLanguage?.startsWith("he");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${finalSessionId}`;

      if (isHebrew) {
        // HEBREW: Use Twilio Media Streams → Cloud Run WebSocket → Deepgram real-time STT
        // This provides sub-second STT latency (vs 7-8s with <Record>).
        // The Cloud Run service at /stream/:callSessionId handles all subsequent turns
        // via Twilio REST API TwiML updates — no callbacks needed.
        // Stream persists for the full call; we do NOT re-include <Start><Stream> in updates.
        const streamUrl = `${CLOUD_RUN_WSS}/stream/${finalSessionId}`;
        logger.info("[twilioVoiceWebhook] Hebrew streaming URL", {streamUrl, callSessionId: finalSessionId});
        const start = response.start();
        start.stream({url: streamUrl});
        response.say({voice: voiceId, language: sayLanguage}, wrapSSML(greetingToSay, language));
        response.pause({length: "120"}); // Keep call alive; Cloud Run handles all further interaction
      } else {
        // NON-HEBREW: Use Gather with nested Say for barge-in
        const gather = response.gather({
          input: "speech",
          action: callbackUrl,
          method: "POST",
          timeout: 10,
          speechTimeout: 2,
          language: gatherLanguage,
        });
        gather.say({voice: voiceId, language: sayLanguage}, greetingToSay);
      }

      logger.info("Voice webhook greeting set up", {
        callSid: callSid || "unknown",
        callSessionId: finalSessionId,
        language: gatherLanguage,
        mode: isHebrew ? "mediastream+deepgram-realtime" : "gather",
        greetingLength: greetingToSay.length,
      });
    } catch (gatherError) {
      console.error("[twilioVoiceWebhook] Failed to create greeting", gatherError);
      logger.error("Failed to create greeting", {
        error: gatherError.message,
        callSessionId: finalSessionId,
      });
      // Fallback: Say greeting without interaction
      try {
        response.say(
          {voice: voiceId || DEFAULT_HEBREW_VOICE, language: sayLanguage || "he-IL"},
          greeting || getMessage("defaultGreeting", "he-IL"),
        );
      } catch (fallbackSayError) {
        response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("defaultGreeting", "he-IL"));
      }
    }

    // Safety net: Only for non-Hebrew (Gather timeout fallback).
    // Hebrew uses <Start><Stream> → Cloud Run WebSocket handles all turns directly.
    // A redirect here would interfere with the stream. Use gatherLanguage (outer scope).
    if (!gatherLanguage?.startsWith("he")) {
      response.redirect({method: "POST"},
        `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${finalSessionId}`);
    }

    // Update session status
    try {
      await snapshot.ref.set(
        {
          status: "in-progress",
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    } catch (updateError) {
      console.error("[twilioVoiceWebhook] Failed to update session status", updateError);
      logger.warn("Failed to update session status", {error: updateError.message, sessionId});
      // Continue anyway - the response is already built
    }

    // Send response
    try {
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      console.log("[twilioVoiceWebhook] Response sent successfully");
    } catch (sendError) {
      console.error("[twilioVoiceWebhook] Failed to send response", sendError);
      logger.error("Failed to send response", {error: sendError.message});
      // Response might already be sent, but log the error
    }
  } catch (error) {
    // Log detailed error information - use console.error as backup
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      query: req.query,
      bodyKeys: Object.keys(req.body || {}),
      callSessionId: req.query.callSessionId || req.body?.callSessionId,
      incomingNumber: req.body?.Called || req.body?.To || req.query?.To,
      twilioAvailable: !!twilio,
      twimlAvailable: !!(twilio && twilio.twiml),
    };
    
    try {
      logger.error("Twilio voice webhook failed", errorDetails);
    } catch (logError) {
      console.error("[twilioVoiceWebhook] Failed to log error:", logError);
    }
    
    console.error("[twilioVoiceWebhook] ERROR:", JSON.stringify(errorDetails, null, 2));
    
    // Try to create response, but handle if twilio is not available
    let response;
    try {
      response = new twilio.twiml.VoiceResponse();
    } catch (twilioError) {
      console.error("[twilioVoiceWebhook] Failed to create Twilio response in error handler", twilioError);
      // Fallback: return simple XML
      res.set("Content-Type", "text/xml");
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.he-IL-Wavenet-D" language="he-IL">אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.</Say><Hangup/></Response>');
      return;
    }
    
    response.say(
      {voice: DEFAULT_HEBREW_VOICE, language: "he-IL"},
      "אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.",
    );
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle speech results from Twilio Gather OR Record+Deepgram
 * When source=record (Hebrew), downloads recording and transcribes via Deepgram API.
 * When source is not set (non-Hebrew), uses Twilio's built-in STT result.
 */
exports.twilioGatherCallback = onRequest(async (req, res) => {
  const startTime = Date.now();

  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const isRecordSource = req.query?.source === "record" || !!req.body?.RecordingUrl;
    let speechResult = req.body?.SpeechResult || "";
    let speechConfidence = req.body?.Confidence || 0;

    // ── DEEPGRAM TRANSCRIPTION (Hebrew Record mode) ─────────────────────
    if (isRecordSource && req.body?.RecordingUrl) {
      const recordingUrl = req.body.RecordingUrl;
      const recordingSid = req.body?.RecordingSid || "unknown";
      const recordingDuration = req.body?.RecordingDuration || 0;

      logger.info("Record callback - transcribing with Deepgram", {
        callSessionId, recordingSid, recordingDuration, recordingUrl,
      });

      // ALWAYS try to transcribe — even duration=0 recordings may contain
      // short words like "כן" / "לא" that Twilio rounds down to 0 seconds
      try {
        // Download recording from Twilio
        const audioResponse = await axios.get(`${recordingUrl}.mp3`, {
          auth: {username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN},
          responseType: "arraybuffer",
          timeout: 5000,
        });

        // Transcribe with Deepgram REST API (nova-3 supports Hebrew natively)
        const dgResponse = await axios.post(
          "https://api.deepgram.com/v1/listen?language=he&model=nova-2&smart_format=true&punctuate=true",
          audioResponse.data,
          {
            headers: {
              "Authorization": `Token ${DEEPGRAM_API_KEY}`,
              "Content-Type": "audio/mpeg",
            },
            timeout: 5000,
          },
        );

        speechResult = dgResponse.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
        speechConfidence = dgResponse.data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

        logger.info("Deepgram transcription success", {
          callSessionId,
          transcript: speechResult,
          confidence: speechConfidence,
          recordingDuration,
          deepgramTimeMs: Date.now() - startTime,
        });
      } catch (dgError) {
        logger.error("Deepgram transcription failed", {
          callSessionId,
          error: dgError.message,
          status: dgError.response?.status,
        });
        speechResult = "";
        speechConfidence = 0;
      }
    }
    // ── END DEEPGRAM TRANSCRIPTION ──────────────────────────────────────

    console.log("=== twilioGatherCallback CALLED ===");
    console.log("callSessionId:", callSessionId);
    console.log("source:", isRecordSource ? "record+deepgram" : "gather+twilio");
    console.log("speechResult:", speechResult || "(empty)");
    console.log("speechConfidence:", speechConfidence);

    logger.info("Speech callback processed", {
      callSessionId,
      source: isRecordSource ? "record+deepgram" : "gather+twilio",
      speechResult: speechResult || "(empty)",
      speechResultLength: speechResult?.length || 0,
      speechConfidence,
      hasSpeechResult: !!speechResult && speechResult.trim().length > 0,
      processingTimeMs: Date.now() - startTime,
    });
    
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const data = snapshot.data();
    const assistant = data.assistantDefinition || {};
    // Ensure language is always set to he-IL for Hebrew (not just "he")
    let language = assistant.language || "he-IL";
    if (language === "he") {
      language = "he-IL";
    }
    const voiceId = resolveVoiceForLanguage(assistant.voice, language);
    const leadId = data.metadata?.leadId || null;
    const companyId = data.companyId || null;
    
    // Start company data fetch EARLY (non-blocking) - runs in parallel
    // while we process speech and check for empty results
    const companyDataPromise = companyId
      ? db.collection("Company").doc(companyId).get().catch((err) => {
          logger.warn(`Could not fetch company data for ${companyId}:`, err);
          return null;
        })
      : Promise.resolve(null);

    // Initialize conversation history
    const conversationHistory = data.conversationHistory || [];
    const isFirstMessage = conversationHistory.length === 0;
    
    // Log if speechResult is empty
    const hasSpeechResult = speechResult && speechResult.trim();
    
    if (!hasSpeechResult) {
      // Track how many times we got empty speech (prevent infinite loop)
      const emptyCount = (data.emptyResultCount || 0) + 1;

      logger.warn("Empty speech result received", {
        callSessionId,
        body: req.body,
        query: req.query,
        isFirstMessage,
        emptyCount,
      });

      // Update empty count in Firestore (fire-and-forget)
      sessionRef.set({emptyResultCount: emptyCount}, {merge: true}).catch(() => {});

      const sayLanguage = language === "he" ? "he-IL" : (language || "he-IL");
      const gatherLanguage = language === "he" ? "he-IL" : (language || "he-IL");
      const isHebrew = language?.startsWith("he");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`;

      // After 3 empty attempts, say goodbye instead of looping forever
      if (emptyCount >= 3) {
        const goodbyeMsg = isHebrew
          ? "נראה שיש בעיית קליטה. ניצור קשר בזמן אחר. יום טוב!"
          : "It seems we're having connection issues. We'll try again later. Goodbye!";
        response.say({voice: voiceId, language: sayLanguage}, goodbyeMsg);
        response.hangup();
        res.set("Content-Type", "text/xml");
        res.status(200).send(response.toString());
        return;
      }

      // Vary the "didn't hear" message to sound more natural
      const repeatMessages = isHebrew
        ? [
            "לא שמעתי, אפשר לחזור על זה?",
            "סליחה, לא קלטתי. מה נאמר?",
            "רגע, לא שמעתי טוב. אפשר שוב?",
          ]
        : [
            "Sorry, I didn't catch that. Could you repeat?",
            "I didn't hear that. Could you say it again?",
            "Sorry, could you repeat that?",
          ];
      const repeatMessage = repeatMessages[emptyCount - 1] || repeatMessages[0];

      if (isHebrew) {
        response.say({voice: voiceId, language: sayLanguage}, repeatMessage);
        response.record({
          action: `${callbackUrl}&source=record`,
          method: "POST",
          maxLength: 30,
          timeout: 2,
          playBeep: false,
          trim: "do-not-trim",
          transcribe: false,
        });
      } else {
        const gather = response.gather({
          input: "speech",
          action: callbackUrl,
          method: "POST",
          timeout: 10,
          speechTimeout: 2,
          language: gatherLanguage,
        });
        gather.say({voice: voiceId, language: sayLanguage}, repeatMessage);
      }

      // Safety fallback
      response.redirect({method: "POST"}, callbackUrl);

      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Reset empty count on successful speech
    if (data.emptyResultCount > 0) {
      sessionRef.set({emptyResultCount: 0}, {merge: true}).catch(() => {});
    }

    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: speechResult,
      timestamp: new Date(),
    });
    
    // Get LLM response with retry logic
    let aiResponse = "";
    let shouldContinue = true;
    let shouldHangup = false;
    
    // Resolve company data (was fetched in parallel earlier)
    const companySnapshot = await companyDataPromise;
    const companyData = companySnapshot?.exists ? companySnapshot.data() : {};

    const MAX_RETRIES = 2; // Reduced from 3 for faster voice response
    let retryCount = 0;
    let llmSuccess = false;
    let lastError = null;

    while (retryCount < MAX_RETRIES && !llmSuccess) {
      try {
        // Build system prompt with company context and language
        const systemPrompt = llmService.buildSystemPrompt(assistant, companyData, language);
        
        // Get conversation history for LLM
        const llmHistory = llmService.getConversationHistory({conversationHistory: conversationHistory});
        
        logger.info("Calling LLM", {
          callSessionId,
          attempt: retryCount + 1,
          maxRetries: MAX_RETRIES,
          userMessageLength: speechResult.length,
          historyLength: llmHistory.length,
        });
        
        // Call LLM with the actual speech result
        const llmResult = await llmService.getLLMResponse(
            systemPrompt,
            speechResult,
            llmHistory,
            {
              model: "gpt-4o-mini", // Fastest and most cost-effective for real-time
              maxTokens: 100, // Voice: 1-2 sentences max (shorter = faster response)
              temperature: 0.7, // Balanced natural + accurate
            },
        );
        
        aiResponse = llmResult.text;
        llmSuccess = true;
        
        logger.info("LLM call successful", {
          callSessionId,
          attempt: retryCount + 1,
          responseLength: aiResponse.length,
          tokensUsed: llmResult.tokensUsed,
        });
        
        // Check if conversation should end - CONSERVATIVE detection
        // Only end when it's clearly a goodbye, not mid-conversation "תודה"
        const responseLower = aiResponse.toLowerCase();
        const userMessageLower = speechResult.toLowerCase().trim();

        // User explicitly wants to end (strict matching - short farewell messages only)
        const userExplicitEnd = [
          "להתראות", "ביי", "bye", "goodbye", "סיימתי", "זה הכל",
        ];
        // "תודה" alone (not part of longer message) = might be ending
        const userThanksOnly = ["תודה רבה", "תודה", "thanks", "thank you"];

        // User wants to end ONLY if:
        // 1. They said an explicit farewell word, OR
        // 2. They ONLY said "תודה" (short message, < 15 chars) without asking anything else
        const isExplicitEnd = userExplicitEnd.some((kw) => userMessageLower.includes(kw));
        const isThanksOnly = userThanksOnly.some((kw) => userMessageLower.includes(kw)) &&
                             userMessageLower.length < 15 &&
                             !userMessageLower.includes("?") &&
                             !userMessageLower.includes("רוצה") &&
                             !userMessageLower.includes("אני") &&
                             !userMessageLower.includes("עוד");
        const userWantsToEnd = isExplicitEnd || isThanksOnly;

        // AI is ending ONLY if it says farewell phrases (not just "תודה" mid-sentence)
        const aiEndPhrases = ["להתראות", "יום נעים", "יום נפלא", "נקבע בהצלחה", "תודה שבחרת"];
        const aiIsEnding = aiEndPhrases.some((kw) => responseLower.includes(kw));

        shouldHangup = userWantsToEnd || aiIsEnding;

        logger.info("End-of-call detection", {
          callSessionId,
          userWantsToEnd,
          aiIsEnding,
          shouldHangup,
          userMessageLength: userMessageLower.length,
          isExplicitEnd,
          isThanksOnly,
        });
        
        // Add AI response to history
        // Note: Cannot use FieldValue.serverTimestamp() inside array, use Date instead
        conversationHistory.push({
          role: "assistant",
          content: aiResponse,
          timestamp: new Date(),
        });
        
        logger.info("LLM response generated", {
          callSessionId,
          responseLength: aiResponse.length,
          tokensUsed: llmResult.tokensUsed,
          shouldHangup,
        });
      } catch (llmError) {
        retryCount++;
        lastError = llmError;
        
        const errorType = llmError.errorType || (llmError.response?.status 
          ? `HTTP_${llmError.response.status}` 
          : llmError.code || "UNKNOWN");
        const isRetryable = llmError.isRetryable !== undefined 
          ? llmError.isRetryable
          : (!llmError.response || 
             (llmError.response.status >= 500) || 
             (llmError.response.status === 429) ||
             (llmError.code === "ECONNRESET" || llmError.code === "ETIMEDOUT"));
        
        logger.warn("LLM call failed", {
          callSessionId,
          attempt: retryCount,
          maxRetries: MAX_RETRIES,
          error: llmError.message,
          errorType,
          isRetryable,
          status: llmError.response?.status,
          willRetry: isRetryable && retryCount < MAX_RETRIES,
        });
        
        // If retryable and haven't exceeded max retries, wait and retry
        if (isRetryable && retryCount < MAX_RETRIES) {
          // Fast backoff: 100ms, 200ms (voice latency is critical)
          const delayMs = Math.min(100 * Math.pow(2, retryCount - 1), 500);
          logger.info("Retrying LLM call after delay", {
            callSessionId,
            delayMs,
            nextAttempt: retryCount + 1,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // Retry
        }
        
        // If not retryable or max retries exceeded, break and use fallback
        if (!isRetryable || retryCount >= MAX_RETRIES) {
          logger.error("LLM call failed after all retries, using fallback", {
            callSessionId,
            totalAttempts: retryCount,
            lastError: lastError.message,
            errorType,
          });
          break; // Exit retry loop and use fallback
        }
      }
    }
    
    // If LLM failed after all retries, use fallback
    if (!llmSuccess) {
      logger.warn("Using keyword matching fallback", {
        callSessionId,
        totalRetries: retryCount,
        lastError: lastError?.message,
      });
      
      // Fallback to keyword matching if LLM fails
      const speechLower = speechResult.toLowerCase().trim();
      const keywords = getKeywords(language);
      const isPositive = keywords.positive.some((kw) => speechLower.includes(kw));
      const isNegative = keywords.negative.some((kw) => speechLower.includes(kw));
      
      if (isPositive) {
        aiResponse = getMessage("positiveResponse", language);
      } else if (isNegative) {
        aiResponse = getMessage("negativeResponse", language);
      } else {
        // Don't use unclearResponse - try to continue conversation naturally
        aiResponse = language?.startsWith("he") 
          ? "אני מבין. איך אוכל לעזור לך עוד?"
          : "I understand. How else can I help you?";
      }
      
      // Don't hangup on fallback - only if user explicitly says farewell
      const farewellWords = ["להתראות", "ביי", "bye", "goodbye", "סיימתי"];
      const userWantsToEnd = farewellWords.some((kw) => speechLower.includes(kw));
      shouldHangup = userWantsToEnd;
      
      logger.info("Fallback response generated", {
        callSessionId,
        aiResponse,
        shouldHangup,
        isPositive,
        isNegative,
      });
    }
    
    // Update session with conversation history and status
    const updateData = {
      conversationHistory,
      lastSpeechResult: speechResult,
      lastAIResponse: aiResponse,
      responseAnalyzed: true,
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    // LATENCY OPTIMIZATION: Write Firestore and Lead updates as fire-and-forget
    // This saves ~80-150ms by not waiting for write confirmations before responding
    const writePromises = [];

    writePromises.push(
      sessionRef.set(updateData, {merge: true}).catch((err) => {
        logger.warn("Failed to update session", {callSessionId, error: err.message});
      }),
    );

    if (leadId && shouldHangup) {
      const conversationText = conversationHistory.map((m) => m.content).join(" ");
      const textLower = conversationText.toLowerCase();
      let leadStatus = "Contacted";
      if (textLower.includes("כן") || textLower.includes("מתאים") || textLower.includes("yes")) {
        leadStatus = "Interested";
      } else if (textLower.includes("לא") || textLower.includes("no") || textLower.includes("לא מעוניין")) {
        leadStatus = "Not Interested";
      }
      writePromises.push(
        db.collection("Lead").doc(leadId).update({
          callStatus: leadStatus,
          lastContactDate: FieldValue.serverTimestamp(),
          callNotes: `Conversation: ${conversationText.substring(0, 500)}`,
        }).catch((err) => logger.warn(`Could not update Lead ${leadId}:`, err)),
      );
    }

    // Don't await writes - respond to Twilio immediately!
    // Writes happen in background
    Promise.all(writePromises).catch(() => {});

    const processingTime = Date.now() - startTime;
    logger.info("twilioGatherCallback processing complete", {
      callSessionId,
      processingTimeMs: processingTime,
      aiResponseLength: aiResponse.length,
      shouldHangup,
      conversationHistoryLength: conversationHistory.length,
    });

    // Prepend a Hebrew filler so the response sounds immediate and natural.
    // The Record→Deepgram→LLM pipeline takes ~4-6s; starting with a short
    // acknowledgment bridges the silence and avoids sounding like the system
    // didn't hear the user.
    if (language?.startsWith("he") && aiResponse && !shouldHangup) {
      const heFillers = ["כן, ", "אוקיי! ", "הבנתי — ", "בסדר! ", "רגע, "];
      const alreadyStartsWithFiller = heFillers.some((f) =>
        aiResponse.startsWith(f.trimEnd()) || aiResponse.startsWith(f.trim())
      );
      if (!alreadyStartsWithFiller) {
        const filler = heFillers[Math.floor(Math.random() * heFillers.length)];
        aiResponse = filler + aiResponse;
      }
    }

    // Say the AI response
    // Ensure language is full code (he-IL) for Twilio Say
    const sayLanguage = language === "he" ? "he-IL" : language;
    const gatherLanguage = language === "he" ? "he-IL" : language;
    
    // Continue conversation or hang up
    if (shouldHangup) {
      // Say the final AI response and hang up
      if (aiResponse) {
        console.log("Saying final AI response:", aiResponse.substring(0, 100) + "...");
        response.say({voice: voiceId, language: sayLanguage}, wrapSSML(aiResponse, language));
      }
      console.log("Hanging up call", {callSessionId, reason: "shouldHangup=true"});
      logger.info("Ending call", {callSessionId, reason: "shouldHangup=true"});
      response.hangup();
    } else {
      const isHebrew = language?.startsWith("he");
      const callbackUrl = `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`;

      logger.info("Continuing conversation", {
        callSessionId,
        mode: isHebrew ? "record+deepgram" : "gather",
        language: gatherLanguage,
        aiResponseLength: aiResponse?.length || 0,
      });

      if (isHebrew) {
        // Hebrew: Say response then Record (Deepgram STT)
        if (aiResponse) {
          response.say({voice: voiceId, language: sayLanguage}, wrapSSML(aiResponse, language));
        }
        response.record({
          action: `${callbackUrl}&source=record`,
          method: "POST",
          maxLength: 30,
          timeout: 2,
          playBeep: false,
          trim: "do-not-trim",
          transcribe: false,
        });
      } else {
        // Non-Hebrew: Gather with barge-in
        const gather = response.gather({
          input: "speech",
          action: callbackUrl,
          method: "POST",
          timeout: 10,
          speechTimeout: 2,
          language: gatherLanguage,
        });
        if (aiResponse) {
          gather.say({voice: voiceId, language: sayLanguage}, aiResponse);
        }
      }

      // Safety net: redirect back to keep conversation alive
      response.redirect({method: "POST"}, callbackUrl);
    }

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
    
    const totalTime = Date.now() - startTime;
    console.log("twilioGatherCallback completed", {
      callSessionId,
      totalTimeMs: totalTime,
      shouldHangup,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      callSessionId: req.query?.callSessionId || req.body?.callSessionId,
      processingTimeMs: totalTime,
    };
    
    console.error("=== twilioGatherCallback ERROR ===");
    console.error(JSON.stringify(errorDetails, null, 2));
    
    logger.error("Twilio gather callback failed", errorDetails);
    
    const response = new twilio.twiml.VoiceResponse();
    // Default to bilingual message on error
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, getMessage("willBeInTouch", "he-IL"));
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

exports.twilioStatusCallback = onRequest(async (req, res) => {
  try {
    const body = req.body || {};
    const callSessionId =
      req.query.callSessionId ||
      body.callSessionId ||
      body.CallSessionId ||
      null;

    if (!callSessionId) {
      res.status(200).end();
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    
    // Update call_sessions
    const callStatus = (body.CallStatus || body.CallEvent || "completed").toLowerCase();
    await sessionRef.set(
      {
        status: callStatus,
        twilioStatus: body,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // When call is completed, also save to Call collection for dashboard
    if (callStatus === "completed" || callStatus === "busy" || callStatus === "no-answer" || callStatus === "failed" || callStatus === "canceled") {
      try {
        const sessionSnapshot = await sessionRef.get();
        const sessionData = sessionSnapshot.exists ? sessionSnapshot.data() : {};
        
        // Extract phone numbers as integers (remove non-digits)
        const extractNumber = (str) => {
          if (!str) return 0;
          const digits = String(str).replace(/\D/g, "");
          return digits ? parseInt(digits.slice(-10), 10) : 0;
        };
        
        // Calculate duration from Twilio data
        const duration = body.CallDuration || body.Duration || "0";
        
        // Determine success based on status
        const isSuccess = callStatus === "completed" && parseInt(duration, 10) > 0;
        
        // Create Call record
        const callRecord = {
          id: sessionData.twilioSid || body.CallSid || callSessionId,
          duration: String(duration),
          dateTime: sessionData.createdAt || FieldValue.serverTimestamp(),
          fromName: sessionData.leadName || "",
          fromNumber: extractNumber(sessionData.companyPhone || body.From),
          toName: sessionData.leadName || "",
          toNumber: extractNumber(sessionData.leadNumber || body.To),
          success: isSuccess,
          callType: "outbound",
          endCallReason: body.SipResponseCode || callStatus,
          company: sessionData.companyId || "",
          recording: body.RecordingUrl || "",
          summary: "",
          requestType: "ai_call",
        };
        
        await db.collection("Call").doc(callRecord.id).set(callRecord);
        logger.info(`Call record saved: ${callRecord.id}`);
        
        // Update Lead record if we have a leadId
        const leadId = sessionData.metadata?.leadId;
        if (leadId) {
          try {
            const leadStatus = sessionData.leadStatus || 
                               (isSuccess ? "Contacted" : "No Answer");
            const callbackRequested = sessionData.callbackRequested || false;
            
            await db.collection("Lead").doc(leadId).update({
              callStatus: leadStatus,
              lastContactDate: FieldValue.serverTimestamp(),
              callNotes: sessionData.speechResult || `Call ${callStatus}`,
              callbackRequested,
            });
            logger.info(`Lead ${leadId} updated with status: ${leadStatus}`);
          } catch (leadError) {
            logger.warn(`Could not update Lead ${leadId}:`, leadError);
          }
        }
      } catch (callError) {
        logger.error("Failed to save Call record", callError);
      }
    }

    res.status(200).end();
  } catch (error) {
    logger.error("Failed to process Twilio status callback", error);
    res.status(200).end();
  }
});

/**
 * Execute a scenario flow from a specific node
 * This is the main entry point for scenario-based calls
 */
exports.scenarioFlowExecute = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const nodeId = req.query.nodeId || req.body?.nodeId;
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const sessionData = sessionSnapshot.data();
    const scenarioId = sessionData.scenarioId;

    if (!scenarioId) {
      // Fall back to non-scenario flow
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "לא הוגדר תרחיש. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Get the scenario
    const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
    if (!scenarioDoc.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "התרחיש לא נמצא. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};
    
    // Determine which node to execute
    let targetNodeId = nodeId || sessionData.currentNodeId;
    
    // If no node specified, start from the beginning
    if (!targetNodeId) {
      const startNode = scenarioEngine.getStartNode(scenario);
      if (startNode) {
        // Move to the node after start
        const nextNodes = scenarioEngine.findNextNodes(scenario, startNode.id);
        targetNodeId = nextNodes[0]?.node?.id || startNode.id;
      }
    }

    if (!targetNodeId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "שגיאה בהגדרות התרחיש. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Build context from session data
    const context = {
      ...sessionData.scenarioContext,
      leadName: sessionData.leadName,
      leadPhone: sessionData.leadNumber,
      leadId: sessionData.metadata?.leadId,
      companyId: sessionData.companyId,
      companyName: sessionData.companyName,
      companyPhone: sessionData.companyPhone,
      assistantName: sessionData.assistantName,
      scenarioId,
      variables: sessionData.scenarioContext?.variables || {},
    };

    // Process the node
    const result = await scenarioEngine.processNode(
      targetNodeId,
      scenario,
      context,
      callSessionId
    );

    // Update session with new state
    await sessionRef.set({
      currentNodeId: result.lastNodeId,
      scenarioContext: {
        ...sessionData.scenarioContext,
        variables: result.context?.variables || {},
      },
      status: result.finalStatus || sessionData.status,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    res.set("Content-Type", "text/xml");
    res.status(200).send(result.twiml);
  } catch (error) {
    logger.error("Scenario flow execution failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "אירעה שגיאה. אנא נסה שוב מאוחר יותר.");
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle callbacks from Gather nodes in scenarios
 * Processes speech/DTMF input and continues the flow
 */
exports.scenarioFlowCallback = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const nodeId = req.query.nodeId || req.body?.nodeId;
    const speechResult = req.body?.SpeechResult || "";
    const digits = req.body?.Digits || "";
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId || !nodeId) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "שגיאה בשיחה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const sessionData = sessionSnapshot.data();
    const scenarioId = sessionData.scenarioId;

    // Get the scenario
    const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
    if (!scenarioDoc.exists) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "התרחיש לא נמצא. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};
    const gatherNode = scenario.nodes.find((n) => n.id === nodeId);

    if (!gatherNode) {
      response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "שגיאה בתרחיש. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Analyze the input
    const inputResult = speechResult || digits;
    const condition = scenarioEngine.analyzeSpeechForConditions(inputResult, gatherNode);

    // Update session with speech result
    await sessionRef.set({
      speechResult: inputResult,
      lastGatherResult: {
        nodeId,
        input: inputResult,
        condition,
        timestamp: FieldValue.serverTimestamp(),
      },
      scenarioContext: {
        ...sessionData.scenarioContext,
        speechResult: inputResult,
        lastInput: inputResult,
        variables: {
          ...(sessionData.scenarioContext?.variables || {}),
          lastSpeechResult: inputResult,
          lastDigits: digits,
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    // Find the next node based on the condition
    let nextNodes = scenarioEngine.findNextNodes(scenario, nodeId, condition);
    
    // If no matching condition, try default
    if (nextNodes.length === 0) {
      const defaultNode = scenarioEngine.findDefaultNextNode(scenario, nodeId);
      if (defaultNode) {
        nextNodes = [{node: defaultNode}];
      }
    }

    const nextNodeId = nextNodes[0]?.node?.id;

    if (nextNodeId) {
      // Redirect to execute the next node
      response.redirect(
        `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${callSessionId}&nodeId=${nextNodeId}`
      );
    } else {
      // No next node - end the call
      const voice = resolveVoiceForLanguage(sessionData.scenarioContext?.defaultVoice, "he-IL");
      response.say({voice, language: "he-IL"}, "תודה על הזמן. להתראות.");
      response.hangup();
    }

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  } catch (error) {
    logger.error("Scenario flow callback failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say({voice: DEFAULT_HEBREW_VOICE, language: "he-IL"}, "אירעה שגיאה. להתראות.");
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle recording callbacks from scenario Record nodes
 */
exports.scenarioRecordingCallback = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const recordingUrl = req.body?.RecordingUrl || "";
    const recordingSid = req.body?.RecordingSid || "";
    const transcriptionText = req.body?.TranscriptionText || "";

    if (callSessionId) {
      const db = getFirestore();
      const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
      
      await sessionRef.set({
        recordings: FieldValue.arrayUnion({
          sid: recordingSid,
          url: recordingUrl,
          transcription: transcriptionText,
          timestamp: new Date().toISOString(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      logger.info(`Recording saved for session ${callSessionId}: ${recordingSid}`);
    }

    res.status(200).end();
  } catch (error) {
    logger.error("Recording callback failed", error);
    res.status(200).end();
  }
});

