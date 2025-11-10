const {onCall} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  COLLECTION_MAP,
  createCallSessionRecord,
  getAssistantConfigFromDocuments,
  buildSuccessResponse,
} = require("./workflow_utils");

exports.getLeadDetails = onCall(async (request) => {
  try {
    const data = request.data || {};
    const leadId = data.lead_id || data.leadId || null;
    const companyId = data.company_id || data.companyId || null;
    const callType = data.call_type || data.callType || "outbound";

    if (!leadId && !companyId) {
      throw new Error("lead_id or company_id is required");
    }

    const db = getFirestore();
    const leadCollection = db.collection(COLLECTION_MAP.leads[0]);

    const leads = [];

    if (leadId) {
      const doc = await leadCollection.doc(leadId).get();
      if (doc.exists) {
        leads.push(doc);
      }
    } else if (companyId) {
      const snapshot = await leadCollection
        .where("companyId", "==", companyId)
        .orderBy("lastContactDate", "desc")
        .limit(data.limit || 25)
        .get()
        .catch(async (err) => {
          logger.warn("Lead query by companyId failed, using fallback field", err);
          return leadCollection
            .where("company", "==", companyId)
            .orderBy("lastContactDate", "desc")
            .limit(data.limit || 25)
            .get();
        });
      snapshot.forEach((doc) => leads.push(doc));
    }

    if (!leads.length) {
      return buildSuccessResponse({
        status: "empty",
        results: [],
      });
    }

    const companyDoc = companyId
      ? await db.collection(COLLECTION_MAP.companies[0]).doc(companyId).get()
      : null;

    const enrichedLeads = [];
    for (const leadDoc of leads) {
      const resolvedCompanyDoc =
        companyDoc ||
        (leadDoc.get("companyId")
          ? await db.collection(COLLECTION_MAP.companies[0]).doc(leadDoc.get("companyId")).get()
          : null) ||
        (leadDoc.get("company")
          ? await db.collection(COLLECTION_MAP.companies[0]).doc(leadDoc.get("company")).get()
          : null);

      const assistantConfig = getAssistantConfigFromDocuments({
        companyDoc: resolvedCompanyDoc && resolvedCompanyDoc.exists ? resolvedCompanyDoc : null,
        leadDoc,
      });

      const callSessionRef = await createCallSessionRecord({
        callSessionData: {
          assistantId: assistantConfig.assistantId,
          leadId: leadDoc.id,
          companyId: resolvedCompanyDoc && resolvedCompanyDoc.exists ? resolvedCompanyDoc.id : null,
          phoneNumber: leadDoc.get("phoneNumber") || leadDoc.get("phone") || null,
          status: "initiating",
          metadata: {
            callType,
            workflow: "getLeadDetails",
          },
        },
      });

      enrichedLeads.push({
        leadId: leadDoc.id,
        callSessionId: callSessionRef.id,
        assistant: assistantConfig,
        lead: {
          name: leadDoc.get("name") || "",
          phone: leadDoc.get("phoneNumber") || leadDoc.get("phone") || "",
          email: leadDoc.get("email") || "",
          status: leadDoc.get("status") || "",
          source: leadDoc.get("source") || "",
          address: leadDoc.get("address") || "",
          lastCallDate: leadDoc.get("lastCallDate") || null,
          companyId:
            (resolvedCompanyDoc && resolvedCompanyDoc.exists ? resolvedCompanyDoc.id : null) ||
            leadDoc.get("companyId") ||
            leadDoc.get("company") ||
            null,
        },
      });
    }

    return buildSuccessResponse({
      callType,
      results: enrichedLeads,
    });
  } catch (error) {
    logger.error("Failed to retrieve lead details", error);
    throw new Error(error.message || "Failed to retrieve lead details");
  }
});

