const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {HttpsError} = require("firebase-functions/v2/https");
const {v4: uuidv4} = require("uuid");

const COLLECTION_MAP = {
  companies: ["Company", "companies"],
  leads: ["Lead", "leads"],
  jobs: ["Jobs", "jobs"],
  assistants: ["Assistants", "assistants"],
  callSessions: ["CallSessions", "call_sessions"],
  callLogs: ["CallLogs", "call_logs"],
  clients: ["Clients", "clients"],
  transferLogs: ["TransferLogs", "transfer_logs"],
};

function normalizePhoneNumber(value) {
  if (!value) {
    return null;
  }
  const digits = `${value}`.replace(/[^\d+]/g, "");
  if (!digits) {
    return null;
  }
  if (digits.startsWith("+")) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function findFirstDocument(db, collectionNames, predicate) {
  for (const name of collectionNames) {
    const result = await predicate(db.collection(name));
    if (result) {
      return {...result, collectionName: name};
    }
  }
  return null;
}

async function findCompanyByPhone(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const rawVariants = [phoneNumber, normalized].filter(Boolean);
  const db = getFirestore();

  return findFirstDocument(db, COLLECTION_MAP.companies, async (collection) => {
    for (const candidate of rawVariants) {
      const snapshot = await collection
        .where("companyPhoneNumbers", "array-contains", candidate)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {doc};
      }
    }

    for (const candidate of rawVariants) {
      const snapshot = await collection
        .where("phoneNumber", "==", candidate)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {doc};
      }
    }
    return null;
  });
}

async function findLeadByPhone(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const variants = [phoneNumber, normalized].filter(Boolean);
  const db = getFirestore();

  return findFirstDocument(db, COLLECTION_MAP.leads, async (collection) => {
    for (const fieldName of ["phoneNumber", "phone", "customerPhone"]) {
      for (const candidate of variants) {
        const snapshot = await collection
          .where(fieldName, "==", candidate)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          return {doc, fieldName};
        }
      }
    }
    return null;
  });
}

async function createLeadIfMissing({companyId, phoneNumber, name, email, source}) {
  const db = getFirestore();
  const leadCollection = COLLECTION_MAP.leads[0];
  const leadRef = db.collection(leadCollection).doc();
  const now = FieldValue.serverTimestamp();

  const leadPayload = {
    id: leadRef.id,
    name: name || "",
    email: email || "",
    phoneNumber: phoneNumber,
    status: "new",
    source: source || "automation",
    company: companyId || null,
    callStatus: "Not Contacted",
    createdAt: now,
    lastContactDate: null,
  };

  await leadRef.set(leadPayload, {merge: true});
  return leadRef;
}

async function getActiveJobForLead(leadId) {
  if (!leadId) {
    return null;
  }
  const db = getFirestore();
  const activeStatuses = ["active", "pending", "scheduled", "in_progress", "in-progress", "Scheduled"];

  return findFirstDocument(db, COLLECTION_MAP.jobs, async (collection) => {
    const snapshot = await collection
      .where("leadId", "==", leadId)
      .where("status", "in", activeStatuses)
      .limit(1)
      .get()
      .catch((error) => {
        logger.warn("Active job lookup failed, attempting without status filter", error);
        return null;
      });

    if (snapshot && !snapshot.empty) {
      const doc = snapshot.docs[0];
      return {doc};
    }

    const fallbackSnapshot = await collection
      .where("leadId", "==", leadId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()
      .catch(() => null);

    if (fallbackSnapshot && !fallbackSnapshot.empty) {
      const doc = fallbackSnapshot.docs[0];
      return {doc};
    }
    return null;
  });
}

function getAssistantConfigFromDocuments({companyDoc, leadDoc}) {
  const companyData = companyDoc ? companyDoc.data() : {};
  const leadData = leadDoc ? leadDoc.data() : {};

  const assistantId =
    leadData?.assignedAssistantId ||
    leadData?.assistantId ||
    companyData?.defaultAssistantId ||
    companyData?.assistantId ||
    companyData?.assistantname ||
    null;

  const assistantName =
    leadData?.assignedAssistantName ||
    companyData?.assistantName ||
    companyData?.assistantname ||
    "Default Assistant";

  const assistantConfig = {
    assistantId,
    name: assistantName,
    voice: companyData?.voice || "en-US",
    language: companyData?.language || "en",
    systemPrompt:
      companyData?.inboundmessage ||
      companyData?.outboundmessage ||
      "You are a helpful virtual assistant.",
    firstMessage: companyData?.outboundmessage || "Hello, how can I help you today?",
    metadata: {
      companyId: companyDoc ? companyDoc.id : null,
      leadId: leadDoc ? leadDoc.id : null,
    },
  };

  return assistantConfig;
}

async function createCallSessionRecord({
  callSessionData,
  existingCallSessionRef,
}) {
  const db = getFirestore();
  const collectionName = COLLECTION_MAP.callSessions[0];
  const ref = existingCallSessionRef || db.collection(collectionName).doc();
  const payload = {
    callSessionId: callSessionData.callSessionId || ref.id,
    status: callSessionData.status || "initiating",
    leadId: callSessionData.leadId || null,
    assistantId: callSessionData.assistantId || null,
    companyId: callSessionData.companyId || null,
    jobId: callSessionData.jobId || null,
    phoneNumber: callSessionData.phoneNumber || null,
    startedAt: FieldValue.serverTimestamp(),
    metadata: callSessionData.metadata || {},
  };

  await ref.set(payload, {merge: true});
  return ref;
}

function ensureHttpsError(error, defaultMessage) {
  if (error instanceof HttpsError) {
    return error;
  }
  logger.error(defaultMessage, error);
  return new HttpsError("internal", defaultMessage);
}

function buildSuccessResponse(data) {
  return {
    status: "success",
    timestamp: new Date().toISOString(),
    ...data,
  };
}

function buildNotFoundResponse(message, extra = {}) {
  return {
    status: "not_found",
    message,
    ...extra,
  };
}

function safeJsonParse(body) {
  if (typeof body === "object") {
    return body;
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    return {};
  }
}

function generateId() {
  return uuidv4();
}

module.exports = {
  COLLECTION_MAP,
  normalizePhoneNumber,
  findCompanyByPhone,
  findLeadByPhone,
  createLeadIfMissing,
  getActiveJobForLead,
  getAssistantConfigFromDocuments,
  createCallSessionRecord,
  ensureHttpsError,
  buildSuccessResponse,
  buildNotFoundResponse,
  safeJsonParse,
  generateId,
};

