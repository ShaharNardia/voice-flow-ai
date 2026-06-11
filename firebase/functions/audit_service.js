/**
 * Audit Service â€” centralized activity logging and retrieval.
 * All user actions are logged here for super_admin visibility.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest, getUserDoc} = require("./security_utils");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

/**
 * Log an activity to the audit_logs collection.
 * This is fire-and-forget â€” it never blocks the caller or throws.
 *
 * @param {object} params
 * @param {string} params.userId - Who performed the action
 * @param {string} params.userEmail - Email of the user
 * @param {string} params.action - Action identifier (e.g., "user.create", "scenario.update")
 * @param {string} params.category - Category (user, scenario, assistant, call, phone, lead, campaign, settings, billing)
 * @param {string} [params.resourceType] - Type of resource affected
 * @param {string} [params.resourceId] - ID of the resource affected
 * @param {object} [params.details] - Action-specific details
 * @param {string} [params.status] - "success" or "failed"
 */
async function logActivity({userId, userEmail, action, category, resourceType, resourceId, details, status}) {
  try {
    const db = getFirestore();
    await db.collection("audit_logs").add({
      timestamp: FieldValue.serverTimestamp(),
      userId: userId || "unknown",
      userEmail: userEmail || "unknown",
      action: action || "unknown",
      category: category || "other",
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      details: details || {},
      status: status || "success",
    });
  } catch (err) {
    // Never throw â€” audit logging must not break the main operation
    logger.error("Failed to write audit log", {action, error: err.message});
  }
}

/**
 * Helper to get user email from UID (for logging when email isn't available)
 */
async function getEmailForUid(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    return user.email || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Verify the caller is a super_admin. Returns uid or sends 401/403 and returns null.
 */
async function requireSuperAdmin(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  const db = getFirestore();
  const doc = await getUserDoc(db, uid);
  const role = doc.exists ? doc.data().role : null;
  if (role !== "super_admin") {
    res.status(403).json({status: "error", message: "Forbidden. Super admin only."});
    return null;
  }
  return uid;
}

/**
 * GET /adminGetActivityLog?limit=50&startAfter=docId&category=user&userId=xxx&action=user.create
 * Super admin only. Returns paginated activity log entries.
 */
exports.adminGetActivityLog = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const startAfter = req.query.startAfter || null;
    const categoryFilter = req.query.category || null;
    const userIdFilter = req.query.userId || null;
    const actionFilter = req.query.action || null;

    let query = db.collection("audit_logs").orderBy("timestamp", "desc");

    if (categoryFilter) {
      query = query.where("category", "==", categoryFilter);
    }
    if (userIdFilter) {
      query = query.where("userId", "==", userIdFilter);
    }
    if (actionFilter) {
      query = query.where("action", "==", actionFilter);
    }

    // Cursor-based pagination
    if (startAfter) {
      const cursor = await db.collection("audit_logs").doc(startAfter).get();
      if (cursor.exists) {
        query = query.startAfter(cursor);
      }
    }

    query = query.limit(limit + 1); // Fetch one extra to check if there's a next page

    const snapshot = await query.get();
    const docs = snapshot.docs;

    const hasMore = docs.length > limit;
    const entries = docs.slice(0, limit).map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : null,
        userId: data.userId,
        userEmail: data.userEmail,
        action: data.action,
        category: data.category,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        details: data.details || {},
        status: data.status,
      };
    });

    res.status(200).json({
      entries,
      nextCursor: hasMore ? docs[limit - 1].id : null,
      total: entries.length,
    });
  } catch (error) {
    logger.error("adminGetActivityLog failed", error);
    res.status(500).json({status: "error", message: "Failed to fetch activity log"});
  }
});

// Export the helper for use by other services
exports.logActivity = logActivity;
exports.getEmailForUid = getEmailForUid;
