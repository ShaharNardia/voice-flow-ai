/**
 * Features Service â€” super_admin endpoints for managing per-role feature
 * defaults and per-user feature overrides.
 *
 * Storage:
 *   config/featureDefaults  â†’ { user: {id:bool}, admin: {id:bool} }
 *   users/{uid}.featureOverrides â†’ { id: bool | null }
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const {requireSuperAdmin} = require("./admin_service");
const {FEATURES, isValidFeatureId} = require("./features");

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
 * GET /adminGetFeatureConfig
 * Returns the role-level defaults + the canonical feature registry.
 */
exports.adminGetFeatureConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();
    const snap = await db.collection("config").doc("featureDefaults").get();
    const defaults = snap.exists ? snap.data() : {};
    res.status(200).json({
      status: "ok",
      defaults: {
        user: defaults.user || {},
        admin: defaults.admin || {},
      },
      featureRegistry: FEATURES,
    });
  } catch (error) {
    logger.error("adminGetFeatureConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to load feature config"});
  }
});

/**
 * POST /adminSetFeatureConfig  { role: "user"|"admin", featureId, enabled }
 * Merge-writes a single flag into the role defaults doc.
 */
exports.adminSetFeatureConfig = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = req.body || {};
    const {role, featureId, enabled} = body;
    if (!["user", "admin"].includes(role)) {
      res.status(400).json({status: "error", message: "role must be 'user' or 'admin'"});
      return;
    }
    if (!isValidFeatureId(featureId)) {
      res.status(400).json({status: "error", message: "Unknown featureId"});
      return;
    }
    if (typeof enabled !== "boolean") {
      res.status(400).json({status: "error", message: "enabled must be boolean"});
      return;
    }
    const db = getFirestore();
    await db.collection("config").doc("featureDefaults").set({
      [role]: {[featureId]: enabled},
    }, {merge: true});
    res.status(200).json({status: "ok"});
  } catch (error) {
    logger.error("adminSetFeatureConfig failed", error);
    res.status(500).json({status: "error", message: "Failed to save feature config"});
  }
});

/**
 * POST /adminSetUserFeatures  { uid, featureOverrides: { id: bool | null } }
 * Merge-writes onto users/{uid}.featureOverrides. null = delete override (inherit).
 */
exports.adminSetUserFeatures = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = req.body || {};
    const {uid, featureOverrides} = body;
    if (!uid || typeof featureOverrides !== "object" || featureOverrides === null) {
      res.status(400).json({status: "error", message: "uid and featureOverrides required"});
      return;
    }

    // Validate every key and value
    const cleaned = {};
    const admin = require("firebase-admin");
    for (const [fid, val] of Object.entries(featureOverrides)) {
      if (!isValidFeatureId(fid)) {
        res.status(400).json({status: "error", message: `Unknown featureId: ${fid}`});
        return;
      }
      if (val === null) {
        cleaned[fid] = admin.firestore.FieldValue.delete();
      } else if (typeof val === "boolean") {
        cleaned[fid] = val;
      } else {
        res.status(400).json({status: "error", message: `featureOverrides.${fid} must be boolean or null`});
        return;
      }
    }

    const db = getFirestore();
    // Merge into nested field. Use dotted paths so FieldValue.delete works.
    const update = {};
    for (const [fid, val] of Object.entries(cleaned)) {
      update[`featureOverrides.${fid}`] = val;
    }
    // Mirror to both collections (users + legacy user) â€” same pattern as adminSetRole
    await Promise.all([
      db.collection("users").doc(uid).set({}, {merge: true}).then(() => db.collection("users").doc(uid).update(update)),
      db.collection("user").doc(uid).set({}, {merge: true}).then(() => db.collection("user").doc(uid).update(update)).catch(() => null),
    ]);
    res.status(200).json({status: "ok"});
  } catch (error) {
    logger.error("adminSetUserFeatures failed", error);
    res.status(500).json({status: "error", message: "Failed to save user features"});
  }
});
