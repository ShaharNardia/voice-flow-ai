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

const REGION = "us-central1";
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

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

exports.searchPhoneNumbers = onRequest(async (req, res) => {
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

exports.purchasePhoneNumber = onRequest(async (req, res) => {
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

exports.assistantsCreate = onRequest(async (req, res) => {
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
      payload.metadata?.userId ||
      payload.ownerId ||
      payload.metadata?.ownerId ||
      null;
    const companyId =
      payload.metadata?.companyId || payload.companyId || payload.metadata?.orgId || null;

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

exports.assistantsUpdate = onRequest(async (req, res) => {
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

exports.assistantsDelete = onRequest(async (req, res) => {
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

exports.assistantsList = onRequest(async (req, res) => {
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

exports.assistantsGet = onRequest(async (req, res) => {
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

exports.configurePhoneNumber = onRequest(async (req, res) => {
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

exports.releasePhoneNumber = onRequest(async (req, res) => {
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

exports.placeCall = onRequest(async (req, res) => {
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

    const leadNumber = payload.number || payload.leadPhone;
    if (!leadNumber) {
      res.status(400).json({
        status: "error",
        message: "Lead phone number is required.",
      });
      return;
    }

    const assistantId = payload.assistantId || payload.assistant?.id || null;
    const assistantDefinition = payload.assistantJson || payload.assistant || {};
    const companyPhone =
      payload.companyPhone ||
      payload.companyPhoneNumber ||
      TWILIO_DEFAULT_FROM;

    if (!companyPhone) {
      res.status(400).json({
        status: "error",
        message:
          "Company phone number is required or set TWILIO_DEFAULT_FROM environment variable.",
      });
      return;
    }

    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc();
    const sessionId = sessionRef.id;

    await sessionRef.set({
      id: sessionId,
      assistantId,
      assistantDefinition,
      leadName: payload.name || payload.leadName || "",
      leadNumber,
      companyId: payload.companyId || null,
      companyPhone,
      status: "initiated",
      metadata: payload.metadata || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const twilioCall = await twilioClient.calls.create({
      to: leadNumber,
      from: companyPhone,
      url: `${TWILIO_VOICE_WEBHOOK}?callSessionId=${sessionId}`,
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
    });
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
      response.say(
        {
          voice: "Polly.Joanna",
        },
        "Hello. We could not locate your call session. Please contact support.",
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
        {
          voice: "Polly.Joanna",
        },
        "Hello. We could not locate your assistant information. Goodbye.",
      );
      response.hangup();
      res.set("Content-Type", "text/xml");
      res.status(200).send(response.toString());
      return;
    }

    const data = snapshot.data();
    const assistant = data.assistantDefinition || {};
    const greeting =
      assistant.firstMessage ||
      assistant.greeting ||
      "Hello, this is your virtual assistant. Thank you for taking our call.";

    response.say(
      {
        voice: "Polly.Joanna",
      },
      greeting,
    );

    response.pause({length: 1});
    response.say(
      {
        voice: "Polly.Joanna",
      },
      "Please hold while we connect you with the next available agent.",
    );

    const fallbackNumber =
      data.metadata?.fallbackNumber ||
      assistant.metadata?.fallbackNumber ||
      assistant?.fallbackNumber ||
      null;

    if (fallbackNumber) {
      response.dial(fallbackNumber);
    } else {
      response.say(
        {
          voice: "Polly.Joanna",
        },
        "No agent is available at the moment. We will call you back shortly. Goodbye.",
      );
      response.hangup();
    }

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
      {
        voice: "Polly.Joanna",
      },
      "An unexpected error occurred. Please try again later.",
    );
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
    await db
      .collection("call_sessions")
      .doc(String(callSessionId))
      .set(
        {
          status: (body.CallStatus || body.CallEvent || "completed").toLowerCase(),
          twilioStatus: body,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    res.status(200).end();
  } catch (error) {
    logger.error("Failed to process Twilio status callback", error);
    res.status(200).end();
  }
});

