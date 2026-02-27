const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const {sanitizeObject, isValidPhone} = require("./security_utils");

exports.createJob = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const data = sanitizeObject(request.data || {});
  const {
    userName,
    userEmail,
    title,
    jobDescription,
    userPhoneNumber,
    address,
    requestedTime,
    companyId,
  } = data;

  // Validate required fields
  if (!userName || !userPhoneNumber) {
    throw new HttpsError(
      "invalid-argument",
      "userName and userPhoneNumber are required.",
    );
  }

  if (!isValidPhone(userPhoneNumber)) {
    throw new HttpsError("invalid-argument", "Invalid phone number format.");
  }

  try {
    const db = getFirestore();

    // Get company reference
    let companyRef;
    if (companyId) {
      companyRef = db.collection("Company").doc(companyId);
    } else {
      const companySnapshot = await db
        .collection("Company")
        .where("companyPhoneNumbers", "array-contains", userPhoneNumber)
        .get();

      if (companySnapshot.empty) {
        throw new HttpsError(
          "not-found",
          "No company found for the provided phone number.",
        );
      }

      companyRef = companySnapshot.docs[0].ref;
    }

    // Create job record
    const jobRef = db.collection("Jobs").doc();
    const jobData = {
      id: jobRef.id,
      title: title || "Service Appointment",
      description: jobDescription || "",
      customerName: userName,
      customerEmail: userEmail || "",
      customerPhone: userPhoneNumber,
      address: address || "",
      requestedTime: requestedTime ? new Date(requestedTime) : new Date(),
      status: "Scheduled",
      company: companyRef,
      createdTime: new Date(),
      assignedTechnician: null,
      priority: "Medium",
      estimatedDuration: 60,
      notes: "Created via AI assistant",
      createdBy: request.auth.uid,
      createdByType: "AI Assistant",
    };

    await jobRef.set(jobData);

    logger.info(
      `Job created: ${jobRef.id} for customer: ${userName}`,
    );

    return {
      success: true,
      jobId: jobRef.id,
      message: "Job created successfully",
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Failed to create job:", error);
    throw new HttpsError(
      "internal",
      error.message || "Failed to create job.",
    );
  }
});
