const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const axios = require("axios").default;
const {
  COLLECTION_MAP,
  findLeadByPhone,
  buildSuccessResponse,
  buildNotFoundResponse,
  safeJsonParse,
  normalizePhoneNumber,
} = require("./workflow_utils");
const {sanitizeObject, applyRateLimit} = require("./security_utils");

exports.endOfCallLog = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({
        status: "error",
        message: "Method not allowed. Expected POST.",
      });
      return;
    }

    // Rate limit: 120 requests per minute (high traffic webhook)
    if (!applyRateLimit(req, res, {maxRequests: 120, windowMs: 60000})) {
      return;
    }

    const payload = sanitizeObject(safeJsonParse(req.body));

    const callSessionId = payload.call_session_id || payload.callSessionId;
    const jobId = payload.job_id || payload.jobId || null;
    const leadId = payload.lead_id || payload.leadId || null;
    const companyId = payload.company_id || payload.companyId || null;
    const callDuration = Number(payload.call_duration || payload.duration || 0);
    const callStatus = payload.call_status || payload.status || "completed";
    const callRecordingUrl = payload.call_recording_url || payload.recordingUrl || null;
    const transcript = payload.transcript || null;
    const summary = payload.summary || null;
    const customerNumber = payload.customer_phone || payload.phone_number || null;

    if (!callSessionId) {
      res.status(400).json({
        status: "error",
        message: "call_session_id is required",
      });
      return;
    }

    const db = getFirestore();
    let companyDoc = null;
    if (companyId) {
      const companyRef = db.collection(COLLECTION_MAP.companies[0]).doc(companyId);
      const companySnapshot = await companyRef.get();
      if (companySnapshot.exists) {
        companyDoc = companySnapshot;
      }
    }

    let leadDoc = null;
    if (leadId) {
      const leadRef = db.collection(COLLECTION_MAP.leads[0]).doc(leadId);
      const leadSnapshot = await leadRef.get();
      if (leadSnapshot.exists) {
        leadDoc = leadSnapshot;
      }
    }

    if (!leadDoc && customerNumber) {
      const leadResult = await findLeadByPhone(customerNumber);
      if (leadResult) {
        leadDoc = leadResult.doc;
      }
    }

    if (!leadDoc) {
      res.status(404).json(
        buildNotFoundResponse("Lead not found for call completion event.", {
          callSessionId,
        }),
      );
      return;
    }

    const callLogCollection = db.collection(COLLECTION_MAP.callLogs[0]);
    const callLogRef = callLogCollection.doc();
    const now = FieldValue.serverTimestamp();

    // ── PARALLEL WRITES: Execute all independent Firestore writes concurrently ──
    const writePromises = [];

    // 1. Create call log entry
    writePromises.push(
      callLogRef.set(
        {
          id: callLogRef.id,
          callSessionId,
          jobId,
          leadId: leadDoc.id,
          companyId: companyDoc ? companyDoc.id : null,
          duration: callDuration,
          status: callStatus,
          recordingUrl: callRecordingUrl,
          transcript,
          summary,
          createdAt: now,
          endedAt: now,
        },
        {merge: true},
      ),
    );

    // 2. Update lead record
    writePromises.push(
      leadDoc.ref.set(
        {
          lastCallDate: now,
          lastCallDuration: callDuration,
          lastCallSummary: summary || "",
          lastCallRecording: callRecordingUrl || "",
          status: callStatus === "completed" ? "contacted" : "active",
          totalCalls: FieldValue.increment(1),
          totalCallDuration: FieldValue.increment(callDuration),
        },
        {merge: true},
      ),
    );

    // 3. Update job if exists
    if (jobId) {
      writePromises.push(
        db
          .collection(COLLECTION_MAP.jobs[0])
          .doc(jobId)
          .set(
            {
              status: callStatus === "completed" ? "completed" : callStatus,
              updatedAt: now,
              lastCallSessionId: callSessionId,
            },
            {merge: true},
          ),
      );
    }

    // 4. Update company credits & notify webhook if exists
    if (companyDoc) {
      const companyData = companyDoc.data() || {};
      const creditRate = Number(companyData.companyMinutesRate || companyData.creditRate || 1);
      const minutesUsed = callDuration > 0 ? callDuration / 60 : 0;
      const creditDelta = minutesUsed * creditRate * -1;

      writePromises.push(
        companyDoc.ref.set(
          {
            credits: FieldValue.increment(creditDelta),
            minutes: FieldValue.increment(minutesUsed),
            lastCallTime: now,
          },
          {merge: true},
        ),
      );

      if (
        (companyData.creditsThreshold || companyData.creditThreshold) &&
        companyData.credits !== undefined
      ) {
        const threshold = Number(companyData.creditsThreshold || companyData.creditThreshold);
        if (companyData.credits + creditDelta < threshold) {
          logger.warn(
            `Company ${companyDoc.id} credits fell below threshold (${threshold}).`,
          );
        }
      }

      const webhookUrl =
        companyData.webhookUrl ||
        companyData.webhook_url ||
        companyData.callWebhookUrl ||
        null;

      // Validate webhook URL to prevent SSRF attacks
      const isValidWebhookUrl = (url) => {
        try {
          const parsed = new URL(url);
          return (
            (parsed.protocol === "https:" || parsed.protocol === "http:") &&
            !parsed.hostname.match(/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/) &&
            !parsed.hostname.endsWith(".local")
          );
        } catch {
          return false;
        }
      };

      if (webhookUrl && isValidWebhookUrl(webhookUrl)) {
        // Webhook is fire-and-forget – don't block the response
        writePromises.push(
          axios.post(
            webhookUrl,
            {
              event: "call_completed",
              call_log_id: callLogRef.id,
              call_session_id: callSessionId,
              job_id: jobId,
              lead_id: leadDoc.id,
              duration: callDuration,
              transcript,
              summary,
              recording_url: callRecordingUrl,
              timestamp: new Date().toISOString(),
            },
            {timeout: 5000},
          ).catch((webhookError) => {
            logger.error("Failed to notify external webhook", webhookError);
          }),
        );
      }
    }

    // Execute all writes in parallel
    await Promise.all(writePromises);

    res.status(200).json(
      buildSuccessResponse({
        callLogId: callLogRef.id,
        callSessionId,
        leadId: leadDoc.id,
        jobId,
        companyId: companyDoc ? companyDoc.id : null,
        normalizedPhone: normalizePhoneNumber(customerNumber) || customerNumber || null,
      }),
    );
  } catch (error) {
    logger.error("Failed to process end-of-call webhook", error);
    res.status(500).json({
      status: "error",
      message: "Failed to log call completion",
    });
  }
});

