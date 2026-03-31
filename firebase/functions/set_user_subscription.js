const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

class BootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function applySubscription(data, authUid) {
  const {
    uid,
    subscribed = true,
    stripeStatus = "active",
    secret,
    companyId,
    companyName,
    role,
    status,
  } = data || {};

  // SECURITY: No hardcoded fallback – secret MUST be set via env var.
  // Set with: firebase functions:secrets:set ADMIN_PROVISION_SECRET
  const configSecret = process.env.ADMIN_PROVISION_SECRET || "";
  if (!configSecret) {
    logger.warn(
      "ADMIN_PROVISION_SECRET is not set – secret-based auth is disabled.",
    );
  }

  let callerIsAdmin = false;

  if (authUid) {
    const callerDoc = await getFirestore()
      .collection("user")
      .doc(authUid)
      .get();
    callerIsAdmin = callerDoc.exists && callerDoc.get("role") === "admin";
  }

  const usingSecret =
    configSecret &&
    configSecret.length >= 16 && // Enforce minimum secret length
    typeof secret === "string" &&
    secret.length > 0 &&
    secret === configSecret;

  if (!callerIsAdmin && !usingSecret) {
    throw new BootstrapError(
      "permission-denied",
      "Unauthorized to update subscription state.",
    );
  }

  if (!uid) {
    throw new BootstrapError(
      "invalid-argument",
      "The target uid is required.",
    );
  }

  // Validate uid format (Firebase UIDs are alphanumeric, max 128 chars)
  if (typeof uid !== "string" || uid.length > 128 || !/^[\w-]+$/.test(uid)) {
    throw new BootstrapError(
      "invalid-argument",
      "Invalid uid format.",
    );
  }

  // Whitelist allowed roles to prevent privilege escalation
  const ALLOWED_ROLES = ["user", "admin", "technician", "agent"];
  if (role && !ALLOWED_ROLES.includes(role)) {
    throw new BootstrapError(
      "invalid-argument",
      `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`,
    );
  }

  const db = getFirestore();
  const userRef = db.collection("user").doc(uid);

  // Issue 7: On first BASIC signup, grant signup credit (configurable in SystemSettings/billing)
  let creditUpdate = {};
  const existingDoc = await userRef.get();
  const isNewUser = !existingDoc.exists;
  const planRequested = data?.plan || stripeStatus;
  const isBasicPlan = planRequested === "basic" || (!subscribed && stripeStatus !== "active");
  const alreadyGranted = existingDoc.exists && existingDoc.get("creditGranted") === true;
  if (isBasicPlan && !alreadyGranted) {
    try {
      const billingSettings = await db.collection("SystemSettings").doc("billing").get();
      const bs = billingSettings.exists ? billingSettings.data() : {};
      const creditCents = bs.signupCreditCents || 1000; // default $10 = 1000 cents
      const creditDays = bs.signupCreditDays || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + creditDays);
      creditUpdate = {
        creditBalance: creditCents,
        creditGranted: true,
        creditExpiresAt: expiresAt,
        subscriptionPlan: "basic",
      };
      logger.info(`Granting signup credit: $${(creditCents / 100).toFixed(2)} to uid=${uid}`);
    } catch (creditErr) {
      logger.warn("Failed to read billing settings for credit grant:", creditErr.message);
    }
  }

  await userRef.set(
    {
      subscribed,
      stripe_subscription_status: stripeStatus,
      profile_completed: true,
      ...(role ? {role} : {}),
      ...(status ? {status} : {}),
      ...creditUpdate,
    },
    {merge: true},
  );

  let companyRef = null;
  if (companyId) {
    companyRef = db.collection("Company").doc(String(companyId));
    await companyRef.set(
      {
        name: companyName || "VoiceFlow AI Customer",
        companyPhoneNumbers: [],
        phoneNumberMap: [],
        userId: userRef,
      },
      {merge: true},
    );
    await userRef.set(
      {
        company: companyRef,
      },
      {merge: true},
    );
  }

  const updatedSnapshot = await userRef.get();
  return {
    status: "ok",
    data: {
      ...(updatedSnapshot.data() || {}),
      ...(companyRef ? {companyPath: companyRef.path} : {}),
    },
  };
}

exports.setUserSubscription = onCall(async (request) => {
  try {
    return await applySubscription(request.data || {}, request.auth?.uid);
  } catch (error) {
    if (error instanceof BootstrapError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error("setUserSubscription error", error);
    throw new HttpsError("unknown", error.message || "Unknown error");
  }
});

exports.bootstrapAdminUser = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Expected POST.",
    });
    return;
  }

  try {
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const result = await applySubscription(payload, null);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof BootstrapError) {
      const statusCode =
        error.code === "invalid-argument"
          ? 400
          : error.code === "permission-denied"
            ? 403
            : 500;
      res.status(statusCode).json({
        status: "error",
        code: error.code,
        message: error.message,
      });
      return;
    }
    logger.error("bootstrapAdminUser error", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Unexpected error",
    });
  }
});
