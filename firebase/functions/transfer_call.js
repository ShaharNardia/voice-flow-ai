const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  COLLECTION_MAP,
  buildSuccessResponse,
  buildNotFoundResponse,
  safeJsonParse,
} = require("./workflow_utils");

exports.transferCall = onRequest(async (req, res) => {
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

    const callSessionId = payload.call_session_id || payload.callSessionId;
    const jobId = payload.job_id || payload.jobId || null;
    const transferTo = payload.transfer_to || payload.transferTo;
    const transferReason = payload.transfer_reason || payload.transferReason || "";
    const technicianId = payload.technician_id || payload.technicianId || null;
    const assistantId = payload.assistant_id || payload.assistantId || null;

    if (!callSessionId) {
      res.status(400).json({
        status: "error",
        message: "call_session_id is required",
      });
      return;
    }

    if (!transferTo) {
      res.status(400).json({
        status: "error",
        message: "transfer_to is required",
      });
      return;
    }

    const db = getFirestore();
    const callSessionRef = db.collection(COLLECTION_MAP.callSessions[0]).doc(callSessionId);
    const callSessionDoc = await callSessionRef.get();

    if (!callSessionDoc.exists) {
      res.status(404).json(
        buildNotFoundResponse("Call session not found", {
          callSessionId,
        }),
      );
      return;
    }

    const now = FieldValue.serverTimestamp();
    const existingTransfers =
      callSessionDoc.get("transferHistory") && Array.isArray(callSessionDoc.get("transferHistory"))
        ? callSessionDoc.get("transferHistory")
        : [];

    const transferEntry = {
      transferId: callSessionDoc.ref.id + "_transfer_" + (existingTransfers.length + 1),
      to: transferTo,
      reason: transferReason,
      technicianId,
      assistantId,
      timestamp: now,
    };

    await callSessionRef.set(
      {
        transferStatus: "in_progress",
        transferredTo: transferTo,
        transferReason,
        transferMetadata: {
          technicianId,
          assistantId,
        },
        transferHistory: [...existingTransfers, transferEntry],
        updatedAt: now,
      },
      {merge: true},
    );

    const transferLogRef = db.collection(COLLECTION_MAP.transferLogs[0]).doc();
    await transferLogRef.set(
      {
        id: transferLogRef.id,
        callSessionId,
        jobId,
        transferTo,
        transferReason,
        technicianId,
        assistantId,
        createdAt: now,
      },
      {merge: true},
    );

    if (jobId) {
      await db
        .collection(COLLECTION_MAP.jobs[0])
        .doc(jobId)
        .set(
          {
            lastTransferAt: now,
            lastTransferTo: transferTo,
          },
          {merge: true},
        );
    }

    res.status(200).json(
      buildSuccessResponse({
        transferId: transferLogRef.id,
        callSessionId,
        jobId,
        transferStatus: "in_progress",
      }),
    );
  } catch (error) {
    logger.error("Failed to process call transfer", error);
    res.status(500).json({
      status: "error",
      message: "Failed to process call transfer",
    });
  }
});

