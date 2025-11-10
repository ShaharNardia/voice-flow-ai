const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  normalizePhoneNumber,
  findCompanyByPhone,
  findLeadByPhone,
  createLeadIfMissing,
  getActiveJobForLead,
  getAssistantConfigFromDocuments,
  createCallSessionRecord,
  buildSuccessResponse,
  buildNotFoundResponse,
  safeJsonParse,
} = require("./workflow_utils");

exports.assignAssistant = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({
        status: "error",
        message: "Method not allowed. Expected POST.",
      });
      return;
    }

    const payload = safeJsonParse(req.body);
    const phoneNumber = payload.phone_number || payload.phoneNumber;
    const isFromAssistant = !!payload.is_from_assistant;
    const callerId = payload.caller_id || null;

    if (!phoneNumber) {
      res.status(400).json({
        status: "error",
        message: "phone_number is required",
      });
      return;
    }

    const companyResult = await findCompanyByPhone(phoneNumber);
    if (!companyResult) {
      res.status(404).json(
        buildNotFoundResponse("No company associated with phone number.", {
          phoneNumber,
        }),
      );
      return;
    }

    const companyDoc = companyResult.doc;
    const db = getFirestore();
    let leadResult = await findLeadByPhone(phoneNumber);
    let leadDoc = leadResult ? leadResult.doc : null;

    if (!leadDoc && !isFromAssistant) {
      const newLeadRef = await createLeadIfMissing({
        companyId: companyDoc.id,
        phoneNumber: normalizePhoneNumber(phoneNumber) || phoneNumber,
        name: payload.caller_name || payload.name || "",
        email: payload.email || "",
        source: "inbound_call",
      });
      leadDoc = await newLeadRef.get();
      leadResult = {doc: leadDoc, collectionName: newLeadRef.parent.id};
    } else if (leadDoc && !isFromAssistant) {
      await leadDoc.ref.set(
        {
          lastContactDate: FieldValue.serverTimestamp(),
          callStatus: "In Progress",
        },
        {merge: true},
      );
    }

    const jobResult = leadDoc ? await getActiveJobForLead(leadDoc.id) : null;
    const assistantConfig = getAssistantConfigFromDocuments({
      companyDoc,
      leadDoc,
    });

    const callSessionRef = await createCallSessionRecord({
      callSessionData: {
        assistantId: assistantConfig.assistantId,
        leadId: leadDoc ? leadDoc.id : null,
        companyId: companyDoc.id,
        jobId: jobResult ? jobResult.doc.id : null,
        phoneNumber: normalizePhoneNumber(phoneNumber) || phoneNumber,
        status: "initiating",
        metadata: {
          callerId,
          isFromAssistant,
          workflow: "assignAssistant",
        },
      },
    });

    const response = buildSuccessResponse({
      companyId: companyDoc.id,
      assistant: assistantConfig,
      leadId: leadDoc ? leadDoc.id : null,
      jobId: jobResult ? jobResult.doc.id : null,
      callSessionId: callSessionRef.id,
      isFromAssistant,
      leadCollection: leadResult ? leadResult.collectionName : null,
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error("Failed to assign assistant", error);
    res.status(500).json({
      status: "error",
      message: "Failed to assign assistant",
    });
  }
});

