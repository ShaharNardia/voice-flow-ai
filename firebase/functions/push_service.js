/**
 * Push notification helper — fans out to every FCM token stored on
 * `users/{uid}.fcmTokens[]`. Stale tokens (invalid / unregistered) are
 * pruned opportunistically so the array doesn't grow forever.
 */

const admin = require("firebase-admin");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {featureEnabledForUser} = require("./feature_gate");

/**
 * Send a push notification to every device registered for `uid`.
 * Silently no-ops if cap.pwaPush is disabled for the user or no tokens exist.
 */
async function sendPushToUser(uid, {title, body, data = {}, url}) {
  try {
    const enabled = await featureEnabledForUser(uid, "cap.pwaPush");
    if (!enabled) return 0;
    const db = getFirestore();
    const snap = await db.collection("users").doc(uid).get();
    const tokens = snap.exists ? (snap.data().fcmTokens || []) : [];
    if (tokens.length === 0) return 0;

    const payload = {
      notification: {title, body},
      data: Object.fromEntries(Object.entries({...data, url: url || "/"}).map(([k, v]) => [k, String(v)])),
      tokens,
    };

    const resp = await admin.messaging().sendEachForMulticast(payload);

    // Remove tokens that FCM reports as invalid
    const invalid = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
          invalid.push(tokens[i]);
        }
      }
    });
    if (invalid.length > 0) {
      await db.collection("users").doc(uid).set({
        fcmTokens: FieldValue.arrayRemove(...invalid),
      }, {merge: true}).catch(() => null);
    }
    return resp.successCount;
  } catch (err) {
    logger.warn("sendPushToUser failed", uid, err?.message);
    return 0;
  }
}

module.exports = {sendPushToUser};
