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

const asteriskService = require("./asterisk_service");
const scenarioEngine = require("./scenario_engine");

const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

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
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  } else {
    res.set("Access-Control-Allow-Origin", "*");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
}

// Bilingual messages support (Hebrew & English)
const MESSAGES = {
  "he-IL": {
    defaultGreeting: "שלום, כאן העוזר הווירטואלי שלכם. תודה שענית לשיחה.",
    askAvailability: "האם את/ה זמין/ה לשיחה? אנא אמור/י כן או לא.",
    noResponse: "אין בעיה. ניצור איתך קשר בהקדם. יום נעים!",
    positiveResponse: "מצוין! תודה על ההתעניינות. אחד מאנשי הצוות שלנו יחזור אליך בהקדם. יום נפלא!",
    negativeResponse: "אני מבין/ה. תודה על הזמן. אם תשנה/י דעתך, אל תהסס/י ליצור איתנו קשר. יום נעים!",
    unclearResponse: "תודה על התגובה. מישהו מהצוות שלנו יחזור אליך בהקדם. יום נעים!",
    thankYouGoodbye: "תודה על הזמן. להתראות.",
    errorOccurred: "אירעה שגיאה. אנא נסה שוב מאוחר יותר.",
    sessionNotFound: "השיחה לא נמצאה. להתראות.",
    scenarioNotFound: "התרחיש לא נמצא. להתראות.",
    flowError: "שגיאה בתרחיש. להתראות.",
    contactSupport: "שלום. לא הצלחנו לאתר את השיחה שלך. אנא צור קשר עם התמיכה.",
    assistantNotFound: "שלום. לא הצלחנו לאתר את פרטי העוזר. להתראות.",
    willBeInTouch: "תודה על הזמן. ניצור קשר בהקדם. להתראות.",
  },
  "en-US": {
    defaultGreeting: "Hello, this is your virtual assistant. Thank you for taking our call.",
    askAvailability: "Are you available to speak with us? Please say yes or no.",
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
};

// Get message based on language (defaults to Hebrew)
function getMessage(key, language = "he-IL") {
  const lang = language?.startsWith("he") ? "he-IL" : "en-US";
  return MESSAGES[lang]?.[key] || MESSAGES["en-US"][key] || "";
}

// Get positive/negative keywords based on language
function getKeywords(language = "he-IL") {
  const isHebrew = language?.startsWith("he");
  return {
    positive: isHebrew 
      ? ["כן", "בטח", "מעוניין", "מעוניינת", "זמין", "זמינה", "בסדר", "אוקיי", "yes", "yeah", "sure", "ok", "okay", "available", "interested"]
      : ["yes", "yeah", "sure", "ok", "okay", "available", "interested", "כן", "בטח", "מעוניין"],
    negative: isHebrew
      ? ["לא", "עסוק", "עסוקה", "אחר כך", "לא מעוניין", "לא מעוניינת", "no", "nope", "not", "busy", "later"]
      : ["no", "nope", "not", "busy", "later", "לא", "עסוק", "אחר כך"],
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

  try {
    const payload = getJsonBody(req);
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
        "en",
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
        name: data.name,
        firstMessage: data.firstMessage,
        language: data.language,
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

    res.status(201).json({
      id: target.sid,
      number: target.phoneNumber,
      status: "configured",
      voiceUrl: TWILIO_VOICE_WEBHOOK,
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

exports.placeCall = onRequest(corsOptions, async (req, res) => {
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

    const leadNumber = payload.number || payload.leadPhone;
    if (!leadNumber) {
      res.status(400).json({
        status: "error",
        message: "Lead phone number is required.",
      });
      return;
    }

    const companyId = payload.companyId || null;
    const assistantId = payload.assistantId || payload.assistant?.id || null;
    const rawAssistantDefinition = payload.assistantJson || payload.assistant || {};
    
    // Check if company uses Asterisk
    const asteriskConfig = await asteriskService.getAsteriskConfig(companyId);
    const useAsterisk = asteriskConfig !== null;
    
    // For Twilio, require Twilio credentials
    if (!useAsterisk && !requireTwilio(res)) {
      return;
    }
    
    const companyPhone =
      payload.companyPhone ||
      payload.companyPhoneNumber ||
      (useAsterisk ? asteriskConfig.defaultCallerId : TWILIO_DEFAULT_FROM);

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
    const assistantDefinition = {
      ...rawAssistantDefinition,
      firstMessage: processedFirstMessage,
      originalFirstMessage: rawAssistantDefinition.firstMessage,
    };

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
          defaultVoice: scenario.settings?.defaultVoice || "Polly.Joanna",
          defaultLanguage: scenario.settings?.defaultLanguage || "en-US",
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
      
      const twilioCall = await twilioClient.calls.create({
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

exports.twilioVoiceWebhook = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      // No language context available, use Hebrew as default
      response.say(
        {voice: "Polly.Joanna"},
        getMessage("contactSupport", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const snapshot = await db.collection("call_sessions").doc(String(callSessionId)).get();

    if (!snapshot.exists) {
      response.say(
        {voice: "Polly.Joanna"},
        getMessage("assistantNotFound", "he-IL"),
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const data = snapshot.data();
    
    // Check if this session uses a scenario flow
    if (data.scenarioId) {
      // Redirect to scenario flow execution
      response.redirect(
        `${BASE_FUNCTION_URL}/scenarioFlowExecute?callSessionId=${callSessionId}`
      );
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }
    
    const assistant = data.assistantDefinition || {};
    
    // Get voice settings from assistant definition
    const voiceId = assistant.voice || "Polly.Joanna";
    const language = assistant.language || "he-IL";
    
    // Get the processed greeting (placeholders already replaced in placeCall)
    const greeting =
      assistant.firstMessage ||
      assistant.greeting ||
      getMessage("defaultGreeting", language);

    // Speak the personalized greeting
    response.say({voice: voiceId, language: language}, greeting);

    // Use Gather to collect lead response via speech recognition
    const gather = response.gather({
      input: "speech",
      action: `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      language: language,
    });
    
    // Prompt for response while gathering
    gather.say(
      {voice: voiceId, language: language},
      getMessage("askAvailability", language),
    );

    // If no response received, schedule callback and hangup
    response.say(
      {voice: voiceId, language: language},
      getMessage("noResponse", language),
    );
    response.hangup();

    // Update session status
    await snapshot.ref.set(
      {
        status: "in-progress",
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  } catch (error) {
    logger.error("Twilio voice webhook failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      {voice: "Polly.Joanna"},
      "אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.",
    );
    response.hangup();
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  }
});

/**
 * Handle speech recognition results from Twilio Gather
 * Processes lead responses and updates their status accordingly
 */
exports.twilioGatherCallback = onRequest(async (req, res) => {
  try {
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;
    const speechResult = req.body?.SpeechResult || "";
    const response = new twilio.twiml.VoiceResponse();

    if (!callSessionId) {
      response.say({voice: "Polly.Joanna"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      response.say({voice: "Polly.Joanna"}, getMessage("thankYouGoodbye", "he-IL"));
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const data = snapshot.data();
    const assistant = data.assistantDefinition || {};
    const voiceId = assistant.voice || "Polly.Joanna";
    const language = assistant.language || "he-IL";
    const leadId = data.metadata?.leadId || null;
    
    // Analyze speech result
    const speechLower = speechResult.toLowerCase().trim();
    
    // Get keywords based on language (supports both Hebrew and English)
    const keywords = getKeywords(language);
    
    const isPositive = keywords.positive.some(kw => speechLower.includes(kw));
    const isNegative = keywords.negative.some(kw => speechLower.includes(kw));
    
    let leadStatus = "contacted";
    let callbackRequested = false;
    let responseMessage = "";
    
    if (isPositive) {
      leadStatus = "interested";
      callbackRequested = true;
      responseMessage = getMessage("positiveResponse", language);
    } else if (isNegative) {
      leadStatus = "not_interested";
      callbackRequested = false;
      responseMessage = getMessage("negativeResponse", language);
    } else {
      // Unclear response - schedule callback anyway
      leadStatus = "callback_requested";
      callbackRequested = true;
      responseMessage = getMessage("unclearResponse", language);
    }
    
    // Update session with response data
    await sessionRef.set(
      {
        speechResult,
        leadStatus,
        callbackRequested,
        responseAnalyzed: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    
    // Update Lead record if we have a leadId
    if (leadId) {
      try {
        await db.collection("Lead").doc(leadId).update({
          callStatus: leadStatus === "interested" ? "Interested" : 
                      leadStatus === "not_interested" ? "Not Interested" : "Contacted",
          lastContactDate: FieldValue.serverTimestamp(),
          callNotes: `Speech result: ${speechResult}`,
        });
      } catch (leadError) {
        logger.warn(`Could not update Lead ${leadId}:`, leadError);
      }
    }
    
    // Say the response and hang up
    response.say({voice: voiceId, language: language}, responseMessage);
    response.hangup();
    
    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  } catch (error) {
    logger.error("Twilio gather callback failed", error);
    const response = new twilio.twiml.VoiceResponse();
    // Default to bilingual message on error
    response.say({voice: "Polly.Joanna"}, getMessage("willBeInTouch", "he-IL"));
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
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const sessionData = sessionSnapshot.data();
    const scenarioId = sessionData.scenarioId;

    if (!scenarioId) {
      // Fall back to non-scenario flow
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "לא הוגדר תרחיש. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    // Get the scenario
    const scenarioDoc = await db.collection("scenarios").doc(scenarioId).get();
    if (!scenarioDoc.exists) {
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "התרחיש לא נמצא. להתראות.");
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
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "שגיאה בהגדרות התרחיש. להתראות.");
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
    response.say({voice: "Polly.Joanna", language: "he-IL"}, "אירעה שגיאה. אנא נסה שוב מאוחר יותר.");
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
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "שגיאה בשיחה. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const sessionSnapshot = await sessionRef.get();

    if (!sessionSnapshot.exists) {
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "השיחה לא נמצאה. להתראות.");
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
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "התרחיש לא נמצא. להתראות.");
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const scenario = {id: scenarioDoc.id, ...scenarioDoc.data()};
    const gatherNode = scenario.nodes.find((n) => n.id === nodeId);

    if (!gatherNode) {
      response.say({voice: "Polly.Joanna", language: "he-IL"}, "שגיאה בתרחיש. להתראות.");
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
      const voice = sessionData.scenarioContext?.defaultVoice || "Polly.Joanna";
      response.say({voice, language: "he-IL"}, "תודה על הזמן. להתראות.");
      response.hangup();
    }

    res.set("Content-Type", "text/xml");
    res.status(200).send(response.toString());
  } catch (error) {
    logger.error("Scenario flow callback failed", error);
    const response = new twilio.twiml.VoiceResponse();
    response.say({voice: "Polly.Joanna", language: "he-IL"}, "אירעה שגיאה. להתראות.");
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

