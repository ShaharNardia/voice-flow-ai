const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");

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

  const configSecret =
    process.env.ADMIN_PROVISION_SECRET || "temp-secret-20251109";
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

  const db = getFirestore();
  const userRef = db.collection("user").doc(uid);
  await userRef.set(
    {
      subscribed,
      stripe_subscription_status: stripeStatus,
      profile_completed: true,
      ...(role ? {role} : {}),
      ...(status ? {status} : {}),
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
    res.status(500).json({
      status: "error",
      message: error.message || "Unexpected error",
    });
  }
});

