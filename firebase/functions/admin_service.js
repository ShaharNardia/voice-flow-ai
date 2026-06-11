/**
 * Admin Service â€” user management endpoints (admin-only).
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest, handleCorsSafe, getUserDoc} = require("./security_utils");
const {logActivity} = require("./audit_service");

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
 * Read the caller's role from Firestore. Returns {uid, role} or null.
 */
async function getCallerRole(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  const db = getFirestore();
  const doc = await getUserDoc(db, uid);
  const role = doc.exists ? doc.data().role : null;
  return {uid, role};
}

/**
 * Verify the caller is an admin (admin or super_admin).
 * Returns uid or sends 401/403 and returns null.
 */
async function requireAdmin(req, res) {
  const caller = await getCallerRole(req, res);
  if (!caller) return null;
  if (caller.role !== "admin" && caller.role !== "super_admin") {
    res.status(403).json({status: "error", message: "Forbidden. Admin only."});
    return null;
  }
  return caller.uid;
}

/**
 * Verify the caller is a super_admin.
 * Returns uid or sends 401/403 and returns null.
 */
async function requireSuperAdmin(req, res) {
  const caller = await getCallerRole(req, res);
  if (!caller) return null;
  if (caller.role !== "super_admin") {
    res.status(403).json({status: "error", message: "Forbidden. Super admin only."});
    return null;
  }
  return caller.uid;
}

/**
 * List all users with their Firestore profile and assistant count.
 * GET /adminListUsers
 */
exports.adminListUsers = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const db = getFirestore();

    // Fetch Firebase Auth users (up to 1000)
    const listResult = await admin.auth().listUsers(1000);
    const authUsers = listResult.users;

    // Fetch all Firestore user docs
    const userDocs = await db.collection("users").get();
    const userMap = {};
    userDocs.forEach((d) => { userMap[d.id] = d.data(); });

    // Count assistants per owner
    const assistantsSnap = await db.collection("assistants").get();
    const assistantCounts = {};
    assistantsSnap.forEach((d) => {
      const oid = d.data().ownerId;
      if (oid) assistantCounts[oid] = (assistantCounts[oid] || 0) + 1;
    });

    const users = authUsers.map((authUser) => {
      const profile = userMap[authUser.uid] || {};
      return {
        uid: authUser.uid,
        email: authUser.email || "",
        displayName: profile.displayName || authUser.displayName || "",
        role: profile.role || "user",
        status: profile.status || (authUser.disabled ? "suspended" : "active"),
        disabled: authUser.disabled || false,
        createdAt: profile.createdAt || authUser.metadata.creationTime,
        assistantCount: assistantCounts[authUser.uid] || 0,
        plan: profile.plan || (profile.subscribed === true ? "pro" : "basic"),
      };
    });

    // Sort: super_admin first, then admins, then by email
    const rolePriority = {super_admin: 0, admin: 1, user: 2};
    users.sort((a, b) => {
      const pa = rolePriority[a.role] ?? 2;
      const pb = rolePriority[b.role] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.email.localeCompare(b.email);
    });

    res.status(200).json(users);
  } catch (error) {
    logger.error("adminListUsers failed", error);
    res.status(500).json({status: "error", message: "Failed to list users"});
  }
});

/**
 * Delete a user permanently from Firebase Auth + Firestore.
 * POST /adminDeleteUser  { uid }
 */
exports.adminDeleteUser = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {uid} = body;

    if (!uid) {
      res.status(400).json({status: "error", message: "uid required"});
      return;
    }
    if (uid === callerUid) {
      res.status(400).json({status: "error", message: "Cannot delete yourself"});
      return;
    }

    const db = getFirestore();
    await Promise.all([
      admin.auth().deleteUser(uid),
      db.collection("users").doc(uid).delete(),
      db.collection("user").doc(uid).delete(),
    ]);

    res.status(200).json({status: "success", uid});
    logActivity({ userId: callerUid, action: "user.delete", category: "user", resourceType: "user", resourceId: uid, details: {deletedUid: uid} }).catch(() => {});
  } catch (error) {
    logger.error("adminDeleteUser failed", error);
    res.status(500).json({status: "error", message: "Failed to delete user"});
  }
});

/**
 * Promote or demote a user's role.
 * POST /adminSetRole  { uid, role: "user" | "admin" | "super_admin" }
 *
 * Only super_admins can call this. A super_admin CAN grant super_admin to
 * others (no artificial cap). You can't change your own role â€” another
 * super_admin has to demote you.
 */
exports.adminSetRole = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {uid, role} = body;

    if (!uid || !["user", "admin", "super_admin"].includes(role)) {
      res.status(400).json({status: "error", message: "uid and role (user|admin|super_admin) required"});
      return;
    }
    if (uid === callerUid) {
      res.status(400).json({status: "error", message: "Cannot change your own role â€” ask another super admin."});
      return;
    }

    const db = getFirestore();
    await Promise.all([
      db.collection("users").doc(uid).set({role}, {merge: true}),
      db.collection("user").doc(uid).set({role}, {merge: true}),
    ]);

    res.status(200).json({status: "success", uid, role});
    logActivity({ userId: callerUid, action: "user.role_change", category: "user", resourceType: "user", resourceId: uid, details: {newRole: role} }).catch(() => {});
  } catch (error) {
    logger.error("adminSetRole failed", error);
    res.status(500).json({status: "error", message: "Failed to update role"});
  }
});

/**
 * Generate a password reset link for a user.
 * POST /adminResetPassword  { email }
 */
exports.adminResetPassword = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {email} = body;

    if (!email) {
      res.status(400).json({status: "error", message: "email required"});
      return;
    }

    const resetLink = await admin.auth().generatePasswordResetLink(email);
    res.status(200).json({status: "success", resetLink});
    logActivity({ userId: callerUid, action: "user.reset_password", category: "user", resourceType: "user", details: {email} }).catch(() => {});
  } catch (error) {
    logger.error("adminResetPassword failed", error);
    res.status(500).json({status: "error", message: "Failed to generate reset link"});
  }
});

/**
 * Create a new user account manually.
 * POST /adminCreateUser  { email, password, displayName?, role? }
 */
exports.adminCreateUser = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireSuperAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {email, password, displayName, role} = body;

    if (!email || !password) {
      res.status(400).json({status: "error", message: "email and password required"});
      return;
    }
    if (password.length < 6) {
      res.status(400).json({status: "error", message: "Password must be at least 6 characters"});
      return;
    }

    const userRole = ["user", "admin"].includes(role) ? role : "user";
    const authUser = await admin.auth().createUser({email, password, displayName: displayName || ""});

    const db = getFirestore();
    const {FieldValue} = require("firebase-admin/firestore");
    await db.collection("users").doc(authUser.uid).set({
      uid: authUser.uid,
      email,
      displayName: displayName || "",
      role: userRole,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({uid: authUser.uid, email, displayName: displayName || "", role: userRole, status: "active"});
    logActivity({ userId: callerUid, action: "user.create", category: "user", resourceType: "user", resourceId: authUser.uid, details: {email, role: userRole} }).catch(() => {});
  } catch (error) {
    logger.error("adminCreateUser failed", error);
    const msg = error.code === "auth/email-already-exists"
      ? "An account with this email already exists"
      : "Failed to create user";
    res.status(500).json({status: "error", message: msg});
  }
});

/**
 * Get detail for a single user (their assistants + recent calls).
 * GET /adminGetUserDetail?uid=...
 */
exports.adminGetUserDetail = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const uid = req.query.uid;
    if (!uid) {
      res.status(400).json({status: "error", message: "uid query param required"});
      return;
    }

    const db = getFirestore();
    // Use allSettled to prevent one missing index from breaking everything
    const results = await Promise.allSettled([
      db.collection("assistants").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("call_sessions").where("ownerId", "==", uid).orderBy("createdAt", "asc").limit(20).get(),
      db.collection("users").doc(uid).get(),
      db.collection("scenarios").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("leads").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("campaigns").where("ownerId", "==", uid).limit(50).get(),
      db.collection("phone_numbers").where("ownerId", "==", uid).limit(20).get(),
    ]);

    const snap = (i) => results[i].status === "fulfilled" ? results[i].value : null;
    const assistantsSnap = snap(0);
    const callsSnap = snap(1);
    const userSnap = snap(2);
    const scenariosSnap = snap(3);
    const leadsSnap = snap(4);
    const campaignsSnap = snap(5);
    const phoneSnap = snap(6);

    const userData = userSnap && userSnap.exists ? userSnap.data() : {};

    const assistants = (assistantsSnap ? assistantsSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, name: data.name || data.assistantName, language: data.language, voice: data.voice, createdAt: data.createdAt};
    });

    const recentCalls = (callsSnap ? callsSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, leadNumber: data.leadNumber, status: data.status, createdAt: data.createdAt, assistantName: data.assistantName, scenarioId: data.scenarioId || null, duration: data.duration || null};
    });

    const scenarios = (scenariosSnap ? scenariosSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, name: data.name, description: data.description, nodeCount: (data.nodes || []).length, isActive: data.isActive, createdAt: data.createdAt, updatedAt: data.updatedAt};
    });

    const leads = (leadsSnap ? leadsSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, name: data.name, phone: data.phone, email: data.email, status: data.status, createdAt: data.createdAt};
    });

    const campaigns = (campaignsSnap ? campaignsSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, name: data.name, status: data.status, leadCount: data.leadCount || 0, createdAt: data.createdAt};
    });

    const phoneNumbers = (phoneSnap ? phoneSnap.docs : []).map((d) => {
      const data = d.data();
      return {id: d.id, phoneNumber: data.phoneNumber || d.id, friendlyName: data.friendlyName, assistantId: data.assistantId || null};
    });

    res.status(200).json({
      assistants,
      recentCalls,
      scenarios,
      leads,
      campaigns,
      phoneNumbers,
      plan: userData.plan || (userData.subscribed === true ? "pro" : "basic"),
      stripeCustomerId: userData.stripe_customer_id || null,
      stripeStatus: userData.stripe_subscription_status || null,
      featureOverrides: userData.featureOverrides || {},
    });
  } catch (error) {
    logger.error("adminGetUserDetail failed", error);
    res.status(500).json({status: "error", message: "Failed to load user detail"});
  }
});

// Export auth helpers so other admin services can import them
exports.requireAdmin = requireAdmin;
exports.requireSuperAdmin = requireSuperAdmin;

/**
 * Activate or suspend a user.
 * POST /adminToggleUser  { uid, status: "active" | "suspended" }
 */
exports.adminToggleUser = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {uid, status} = body;

    if (!uid || !["active", "suspended"].includes(status)) {
      res.status(400).json({status: "error", message: "uid and status (active|suspended) required"});
      return;
    }

    if (uid === callerUid) {
      res.status(400).json({status: "error", message: "Cannot change your own status"});
      return;
    }

    const disabled = status === "suspended";
    const db = getFirestore();

    await Promise.all([
      admin.auth().updateUser(uid, {disabled}),
      db.collection("users").doc(uid).set({status}, {merge: true}),
    ]);

    res.status(200).json({status: "success", uid, newStatus: status});
    logActivity({ userId: callerUid, action: "user.toggle_status", category: "user", resourceType: "user", resourceId: uid, details: {newStatus: status} }).catch(() => {});
  } catch (error) {
    logger.error("adminToggleUser failed", error);
    res.status(500).json({status: "error", message: "Failed to update user"});
  }
});

/**
 * Bootstrap the super_admin role for the hardcoded owner email.
 * Can only be called by the owner themselves (shahar.nardia@gmail.com).
 * POST /bootstrapSuperAdmin
 */
const SUPER_ADMIN_EMAIL = "shahar.nardia@gmail.com";

/**
 * GET /adminGetCallTelemetry?callId=<callSessionId>
 * Super-admin only â€” returns the detailed technical log for a call session.
 * Written by Cloud Run at call end into: super_admin_call_logs/{callSessionId}
 */
exports.adminGetCallTelemetry = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireSuperAdmin(req, res);
  if (!uid) return;

  const callId = req.query.callId;
  if (!callId) {
    return res.status(400).json({status: "error", message: "callId query param required"});
  }

  try {
    const db = getFirestore();
    const doc = await db.collection("super_admin_call_logs").doc(String(callId)).get();
    if (!doc.exists) {
      return res.status(404).json({status: "error", message: "Telemetry log not found for this call"});
    }
    return res.json({status: "ok", data: doc.data()});
  } catch (err) {
    logger.error("adminGetCallTelemetry failed", err);
    return res.status(500).json({status: "error", message: err.message});
  }
});

/**
 * GET /adminListCallTelemetry?ownerId=<uid>&limit=50
 * Super-admin only â€” list recent telemetry records, optionally filtered by owner.
 */
exports.adminListCallTelemetry = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireSuperAdmin(req, res);
  if (!uid) return;

  try {
    const db = getFirestore();
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    let query = db.collection("super_admin_call_logs").orderBy("startAt", "desc").limit(limit);
    if (req.query.ownerId) query = query.where("ownerId", "==", req.query.ownerId);
    const snap = await query.get();
    const records = snap.docs.map((d) => {
      const {events, turns, toolCalls, ...summary} = d.data(); // strip bulk arrays from list view
      return {...summary, turnCount: (turns || []).length, id: d.id};
    });
    return res.json({status: "ok", data: records});
  } catch (err) {
    logger.error("adminListCallTelemetry failed", err);
    return res.status(500).json({status: "error", message: err.message});
  }
});

exports.bootstrapSuperAdmin = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return;
  }

  try {
    const authUser = await admin.auth().getUser(uid);
    if (authUser.email !== SUPER_ADMIN_EMAIL) {
      res.status(403).json({status: "error", message: "Forbidden. Only the platform owner can bootstrap super_admin."});
      return;
    }

    const db = getFirestore();
    await Promise.all([
      db.collection("users").doc(uid).set({role: "super_admin"}, {merge: true}),
      db.collection("user").doc(uid).set({role: "super_admin"}, {merge: true}),
    ]);

    res.status(200).json({status: "success", message: "Super admin role set.", uid});
    logActivity({ userId: uid, userEmail: authUser.email, action: "user.bootstrap_super_admin", category: "user", resourceType: "user", resourceId: uid }).catch(() => {});
  } catch (error) {
    logger.error("bootstrapSuperAdmin failed", error);
    res.status(500).json({status: "error", message: "Failed to bootstrap super admin"});
  }
});
