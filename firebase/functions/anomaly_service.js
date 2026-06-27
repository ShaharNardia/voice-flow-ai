/**
 * Anomaly Service — fire-and-forget runtime anomaly logging.
 *
 * Writes to the `anomaly_logs` Firestore collection so super_admins can
 * investigate runtime issues (latency spikes, non-2xx HTTP, user
 * frustration cues, recording failures, etc.) after the fact without
 * digging through Cloud Run / Functions stdout.
 *
 * NEVER throws — wrapped in try/catch so it can't break the caller.
 */

const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

/**
 * Log a runtime anomaly.
 *
 * @param {object} params
 * @param {"warn"|"error"|"critical"} [params.severity="warn"]
 * @param {"latency"|"http"|"transcript"|"audio"|"llm"|"tts"|"stt"|"recording"|"other"} [params.category="other"]
 * @param {string} params.code - Short machine code, e.g. "TWILIO_RECORDING_FAIL"
 * @param {string} params.message - Human-readable one-liner
 * @param {string} [params.source="firebase-functions"]
 * @param {string} [params.callSessionId]
 * @param {string} [params.callSid]
 * @param {string} [params.ownerId]
 * @param {string} [params.assistantId]
 * @param {object} [params.details] - Freeform extra context
 */
async function logAnomaly({
  severity = "warn",
  category = "other",
  code = "UNKNOWN",
  message = "",
  source = "firebase-functions",
  callSessionId = null,
  callSid = null,
  ownerId = null,
  assistantId = null,
  details = {},
} = {}) {
  try {
    // Sanitize details: cap size, strip undefineds, avoid circular refs.
    let safeDetails = {};
    try {
      safeDetails = JSON.parse(JSON.stringify(details || {}));
      const s = JSON.stringify(safeDetails);
      if (s.length > 8000) {
        safeDetails = {_truncated: true, preview: s.slice(0, 8000)};
      }
    } catch (_e) {
      safeDetails = {_unserializable: true};
    }

    await getFirestore().collection("anomaly_logs").add({
      timestamp: FieldValue.serverTimestamp(),
      severity,
      category,
      source,
      code,
      message: String(message || "").slice(0, 1000),
      callSessionId: callSessionId || null,
      callSid: callSid || null,
      ownerId: ownerId || null,
      assistantId: assistantId || null,
      details: safeDetails,
    });
  } catch (err) {
    // Swallow — anomaly logging must never break the main flow.
    logger.error("Failed to write anomaly log", {code, error: err.message});
  }
}

module.exports = {logAnomaly};
