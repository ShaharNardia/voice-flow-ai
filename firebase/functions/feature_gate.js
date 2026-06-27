/**
 * Backend feature-flag resolver. Mirrors the frontend logic in
 * saas-frontend/src/lib/features.ts — used by endpoints to reject calls
 * from users who don't have a given capability enabled.
 *
 * Resolution: super_admin bypass → user override → role default → built-in defaultOn.
 */

const {getFirestore} = require("firebase-admin/firestore");
const {FEATURES, isValidFeatureId} = require("./features");
const {getUserDoc} = require("./security_utils");

const FEATURE_BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

// Small memoized cache for role defaults — refreshes every 60s. Keeps per-call
// latency low while still picking up admin changes within a minute.
let cachedDefaults = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

async function loadDefaults(db) {
  if (cachedDefaults && Date.now() - cachedAt < CACHE_MS) return cachedDefaults;
  const snap = await db.collection("config").doc("featureDefaults").get();
  cachedDefaults = snap.exists ? snap.data() : {};
  cachedAt = Date.now();
  return cachedDefaults;
}

/**
 * Resolve whether a given user has a feature enabled.
 * @param {string} uid
 * @param {string} featureId
 * @returns {Promise<boolean>}
 */
async function featureEnabledForUser(uid, featureId) {
  if (!isValidFeatureId(featureId)) return true; // unknown IDs treated as open (don't break prod)
  const def = FEATURE_BY_ID[featureId];
  const db = getFirestore();
  const userSnap = await getUserDoc(db, uid);
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = userData.role || "user";
  if (role === "super_admin") return true;

  const overrides = userData.featureOverrides || {};
  if (Object.prototype.hasOwnProperty.call(overrides, featureId)) {
    return Boolean(overrides[featureId]);
  }
  const defaults = await loadDefaults(db);
  const roleDefaults = (role === "admin" ? defaults.admin : defaults.user) || {};
  if (Object.prototype.hasOwnProperty.call(roleDefaults, featureId)) {
    return Boolean(roleDefaults[featureId]);
  }
  return Boolean(def.defaultOn);
}

/**
 * Express-style guard: sends 403 if the feature is off. Returns true if OK
 * to proceed, false if a response was already sent.
 */
async function requireFeature(req, res, uid, featureId) {
  const ok = await featureEnabledForUser(uid, featureId);
  if (!ok) {
    res.status(403).json({status: "error", message: `Feature '${featureId}' is not enabled for this account.`});
    return false;
  }
  return true;
}

module.exports = {featureEnabledForUser, requireFeature};
