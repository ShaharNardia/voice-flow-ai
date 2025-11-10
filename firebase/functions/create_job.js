const {onCall} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");

exports.createJob = onCall(async (request) => {
  try {
    if (!request.auth?.uid) {
      return { error: "Unauthorized" };
    }

    const data = request.data;
    const {
      userName,
      userEmail,
      title,
      jobDescription,
      userPhoneNumber,
      address,
      requestedTime,
      companyId
    } = data;

    // Validate required fields
    if (!userName || !userPhoneNumber) {
      return { error: "Missing required fields: userName and userPhoneNumber are required" };
    }

    const db = getFirestore();

    // Get company reference
    let companyRef;
    if (companyId) {
      companyRef = db.collection("Company").doc(companyId);
    } else {
      // If no companyId provided, try to find company by phone number
      const companySnapshot = await db.collection("Company")
        .where("companyPhoneNumbers", "array-contains", userPhoneNumber)
        .get();

      if (companySnapshot.empty) {
        return { error: "No company found for the provided phone number" };
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
      estimatedDuration: 60, // Default 1 hour
      notes: "Created via AI assistant",
      createdBy: request.auth.uid,
      createdByType: "AI Assistant"
    };

    await jobRef.set(jobData);

    console.log(`Job created successfully: ${jobRef.id} for customer: ${userName}`);

    return { 
      success: true, 
      jobId: jobRef.id,
      message: "Job created successfully" 
    };

  } catch (error) {
    console.error("Error creating job:", error);
    return { 
      error: error.message || "Failed to create job" 
    };
  }
});

