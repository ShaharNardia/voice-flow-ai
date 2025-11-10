const {onCall} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  COLLECTION_MAP,
  normalizePhoneNumber,
  createCallSessionRecord,
  getAssistantConfigFromDocuments,
  buildSuccessResponse,
} = require("./workflow_utils");

exports.outboundLeadTest = onCall(async (request) => {
  try {
    const data = request.data || {};

    const companyId = data.company_id || data.companyId;
    const leadName = data.lead_name || data.leadName || "";
    const leadPhone = data.lead_phone || data.leadPhone;
    const leadEmail = data.lead_email || data.leadEmail || "";
    const source = data.source || "outbound_test";
    const messageContent = data.message_content || data.messageContent || null;

    if (!companyId) {
      throw new Error("company_id is required");
    }

    if (!leadPhone) {
      throw new Error("lead_phone is required");
    }

    const db = getFirestore();
    const companyRef = db.collection(COLLECTION_MAP.companies[0]).doc(companyId);
    const companyDoc = await companyRef.get();

    if (!companyDoc.exists) {
      throw new Error("Company not found");
    }

    const leadCollection = db.collection(COLLECTION_MAP.leads[0]);
    const leadRef = leadCollection.doc();
    const now = FieldValue.serverTimestamp();

    const normalizedPhone = normalizePhoneNumber(leadPhone) || leadPhone;

    const leadPayload = {
      id: leadRef.id,
      companyId,
      name: leadName,
      phoneNumber: normalizedPhone,
      email: leadEmail,
      status: "new",
      source,
      createdAt: now,
      lastContactDate: now,
      assignedAssistantId: companyDoc.get("defaultAssistantId") || null,
      messageAnalysis: null,
      rawMessage: messageContent || "",
    };

    if (messageContent) {
      leadPayload.messageAnalysis = {
        sentiment: "pending",
        summary: messageContent.slice(0, 280),
        analyzedAt: now,
      };
    }

    await leadRef.set(leadPayload, {merge: true});

    const assistantConfig = getAssistantConfigFromDocuments({
      companyDoc,
      leadDoc: await leadRef.get(),
    });

    const callSessionRef = await createCallSessionRecord({
      callSessionData: {
        assistantId: assistantConfig.assistantId,
        leadId: leadRef.id,
        companyId,
        phoneNumber: normalizedPhone,
        status: "initiated",
        metadata: {
          workflow: "outboundLeadTest",
          source,
        },
      },
    });

    await companyRef.set(
      {
        lastOutboundCallAt: now,
        outboundCallCount: FieldValue.increment(1),
      },
      {merge: true},
    );

    return buildSuccessResponse({
      leadId: leadRef.id,
      callSessionId: callSessionRef.id,
      assistant: assistantConfig,
      companyId,
    });
  } catch (error) {
    logger.error("Failed to process outbound lead test", error);
    throw new Error(error.message || "Failed to process outbound lead test");
  }
});

