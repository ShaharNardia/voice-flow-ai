/**
 * Anomaly logger — Cloud Run twin of firebase/functions/anomaly_service.js.
 *
 * Writes to the `anomaly_logs` Firestore collection. Fire-and-forget,
 * never throws. Uses the already-initialized firebase-admin SDK from
 * index.js (caller passes the Firestore `db` instance).
 */

/**
 * Create a logAnomaly function bound to a given Firestore instance.
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {import("firebase-admin/firestore").FieldValue} FieldValue
 */
function makeLogAnomaly(db, FieldValue) {
  return async function logAnomaly({
    severity = "warn",
    category = "other",
    code = "UNKNOWN",
    message = "",
    source = "cloud-run-mediastream",
    callSessionId = null,
    callSid = null,
    ownerId = null,
    assistantId = null,
    details = {},
  } = {}) {
    try {
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

      await db.collection("anomaly_logs").add({
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
      console.error(`[anomaly] Failed to write ${code}:`, err.message);
    }
  };
}

module.exports = {makeLogAnomaly};
