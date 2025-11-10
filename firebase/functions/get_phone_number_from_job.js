const {onCall} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  COLLECTION_MAP,
  normalizePhoneNumber,
  buildSuccessResponse,
  buildNotFoundResponse,
} = require("./workflow_utils");

exports.getPhoneNumberFromJob = onCall(async (request) => {
  try {
    const data = request.data || {};
    const jobId = data.job_id || data.jobId;

    if (!jobId) {
      throw new Error("job_id is required");
    }

    const db = getFirestore();
    const jobDoc = await db.collection(COLLECTION_MAP.jobs[0]).doc(jobId).get();

    if (!jobDoc.exists) {
      return buildNotFoundResponse("Job not found", {jobId});
    }

    const jobData = jobDoc.data() || {};
    let leadPhone = jobData.customerPhone || null;
    const leadId = jobData.leadId || jobData.lead_id || null;

    if (!leadPhone && leadId) {
      const leadDoc = await db.collection(COLLECTION_MAP.leads[0]).doc(leadId).get();
      if (leadDoc.exists) {
        leadPhone =
          leadDoc.get("phoneNumber") ||
          leadDoc.get("phone") ||
          leadDoc.get("customerPhone") ||
          null;
      }
    }

    if (!leadPhone) {
      return buildNotFoundResponse("Phone number not found for job", {
        jobId,
        leadId,
      });
    }

    return buildSuccessResponse({
      status: "found",
      jobId,
      leadId,
      phoneNumber: normalizePhoneNumber(leadPhone) || leadPhone,
    });
  } catch (error) {
    logger.error("Failed to retrieve phone number from job", error);
    throw new Error(error.message || "Failed to retrieve phone number");
  }
});

