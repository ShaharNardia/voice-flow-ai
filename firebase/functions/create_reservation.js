const {onCall} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  COLLECTION_MAP,
  normalizePhoneNumber,
  findLeadByPhone,
  buildSuccessResponse,
} = require("./workflow_utils");

exports.createReservation = onCall(async (request) => {
  try {
    const data = request.data || {};

    const clientId = data.client_id || data.clientId;
    const serviceDate = data.service_date || data.serviceDate;
    const serviceType = data.service_type || data.serviceType || "general";
    const leadId = data.lead_id || data.leadId || null;
    const contactInfo = data.contact_info || data.contactInfo || {};
    const contactPhone = contactInfo.phone || data.phone || null;
    const contactName = contactInfo.name || data.name || "";
    const contactEmail = contactInfo.email || data.email || "";

    if (!clientId) {
      throw new Error("client_id is required");
    }

    if (!serviceDate) {
      throw new Error("service_date is required");
    }

    let resolvedLeadId = leadId;
    let leadDoc = null;
    const db = getFirestore();
    const leadCollectionName = COLLECTION_MAP.leads[0];

    if (resolvedLeadId) {
      const doc = await db
        .collection(leadCollectionName)
        .doc(resolvedLeadId)
        .get();
      if (doc.exists) {
        leadDoc = doc;
      }
    }

    if (!leadDoc && contactPhone) {
      const leadResult = await findLeadByPhone(contactPhone);
      if (leadResult) {
        leadDoc = leadResult.doc;
        resolvedLeadId = leadDoc.id;
      }
    }

    if (!leadDoc && contactPhone) {
      const normalized = normalizePhoneNumber(contactPhone) || contactPhone;
      const newLeadRef = db.collection(leadCollectionName).doc();
      await newLeadRef.set(
        {
          id: newLeadRef.id,
          name: contactName,
          email: contactEmail,
          phoneNumber: normalized,
          status: "active",
          source: data.source || "reservation_webhook",
          createdAt: FieldValue.serverTimestamp(),
          lastContactDate: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      leadDoc = await newLeadRef.get();
      resolvedLeadId = newLeadRef.id;
    }

    if (!leadDoc) {
      throw new Error("Lead could not be resolved for reservation creation");
    }

    const jobCollectionName = COLLECTION_MAP.jobs[0];
    const jobCollection = db.collection(jobCollectionName);

    let existingJobDoc = null;
    const exclusionStatuses = ["cancelled", "Cancelled", "canceled"];

    const snapshot = await jobCollection
      .where("leadId", "==", resolvedLeadId)
      .limit(5)
      .get();

    snapshot.forEach((doc) => {
      const status = (doc.get("status") || "").toLowerCase();
      if (!exclusionStatuses.includes(status)) {
        existingJobDoc = doc;
      }
    });

    const jobPayload = {
      leadId: resolvedLeadId,
      clientId,
      serviceDate: new Date(serviceDate),
      serviceType,
      status: data.status || "pending",
      reservationDetails: data.reservation_details || data.reservationDetails || {},
      contact: {
        name: contactName,
        phone: normalizePhoneNumber(contactPhone) || contactPhone,
        email: contactEmail,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    let jobRef = null;
    let action = "created";

    if (existingJobDoc) {
      jobRef = existingJobDoc.ref;
      await jobRef.set(jobPayload, {merge: true});
      action = "updated";
    } else {
      jobRef = jobCollection.doc();
      await jobRef.set(
        {
          id: jobRef.id,
          createdAt: FieldValue.serverTimestamp(),
          ...jobPayload,
        },
        {merge: true},
      );
    }

    await leadDoc.ref.set(
      {
        lastContactDate: FieldValue.serverTimestamp(),
        status: "active",
        lastJobId: jobRef.id,
        jobHistory: FieldValue.arrayUnion(jobRef.id),
      },
      {merge: true},
    );

    const response = buildSuccessResponse({
      status: action,
      jobId: jobRef.id,
      leadId: resolvedLeadId,
      clientId,
    });

    return response;
  } catch (error) {
    logger.error("Failed to create or update reservation", error);
    throw new Error(error.message || "Reservation creation failed");
  }
});

