/**
 * Admin Service — user management endpoints (admin-only).
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const {extractUidFromRequest, handleCorsSafe} = require("./security_utils");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
    /\.web\.app$/,
    /\.firebaseapp\.com$/,
  ],
};

/**
 * Verify the caller is an admin. Returns uid or sends 401/403 and returns null.
 */
async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  const db = getFirestore();
  // Check new `users` collection first, then legacy `user` collection
  let role = null;
  const newDoc = await db.collection("users").doc(uid).get();
  if (newDoc.exists) {
    role = newDoc.data().role;
  } else {
    const legacyDoc = await db.collection("user").doc(uid).get();
    if (legacyDoc.exists) role = legacyDoc.data().role;
  }
  if (role !== "admin") {
    res.status(403).json({status: "error", message: "Forbidden. Admin only."});
    return null;
  }
  return uid;
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

    // Sort: admins first, then by email
    users.sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (b.role === "admin" && a.role !== "admin") return 1;
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

  const callerUid = await requireAdmin(req, res);
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
  } catch (error) {
    logger.error("adminDeleteUser failed", error);
    res.status(500).json({status: "error", message: "Failed to delete user"});
  }
});

/**
 * Promote or demote a user's role.
 * POST /adminSetRole  { uid, role: "user" | "admin" }
 */
exports.adminSetRole = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "Method not allowed"}); return; }

  const callerUid = await requireAdmin(req, res);
  if (!callerUid) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const {uid, role} = body;

    if (!uid || !["user", "admin"].includes(role)) {
      res.status(400).json({status: "error", message: "uid and role (user|admin) required"});
      return;
    }
    if (uid === callerUid) {
      res.status(400).json({status: "error", message: "Cannot change your own role"});
      return;
    }

    const db = getFirestore();
    await Promise.all([
      db.collection("users").doc(uid).set({role}, {merge: true}),
      db.collection("user").doc(uid).set({role}, {merge: true}),
    ]);

    res.status(200).json({status: "success", uid, role});
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

  const callerUid = await requireAdmin(req, res);
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
    const [assistantsSnap, callsSnap, userSnap] = await Promise.all([
      db.collection("assistants").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection("call_sessions").where("ownerId", "==", uid).orderBy("createdAt", "desc").limit(5).get(),
      db.collection("users").doc(uid).get(),
    ]);

    const userData = userSnap.exists ? userSnap.data() : {};

    const assistants = assistantsSnap.docs.map((d) => {
      const data = d.data();
      return {id: d.id, name: data.name || data.assistantName, language: data.language, createdAt: data.createdAt};
    });

    const recentCalls = callsSnap.docs.map((d) => {
      const data = d.data();
      return {id: d.id, leadNumber: data.leadNumber, status: data.status, createdAt: data.createdAt, assistantName: data.assistantName};
    });

    res.status(200).json({
      assistants,
      recentCalls,
      plan: userData.plan || (userData.subscribed === true ? "pro" : "basic"),
      stripeCustomerId: userData.stripe_customer_id || null,
      stripeStatus: userData.stripe_subscription_status || null,
    });
  } catch (error) {
    logger.error("adminGetUserDetail failed", error);
    res.status(500).json({status: "error", message: "Failed to load user detail"});
  }
});

// Export requireAdmin so other admin services can import it
exports.requireAdmin = requireAdmin;

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
  } catch (error) {
    logger.error("adminToggleUser failed", error);
    res.status(500).json({status: "error", message: "Failed to update user"});
  }
});
