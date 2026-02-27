const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {sanitizeObject, isValidEmail} = require("./security_utils");

exports.createAgent = onCall(async (request) => {
  // Require authentication
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const data = sanitizeObject(request.data || {});
  const email = data.email;
  const password = data.password;
  const role = data.role;
  const status = data.status;
  const name = data.name;
  const permission = data.permission;
  const phonenumber = data.phonenumber;
  const company = data.company;

  // Validate required fields
  if (!email || !password) {
    throw new HttpsError(
      "invalid-argument",
      "Email and password are required.",
    );
  }

  if (!isValidEmail(email)) {
    throw new HttpsError("invalid-argument", "Invalid email format.");
  }

  if (typeof password !== "string" || password.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "Password must be at least 8 characters.",
    );
  }

  // Validate role to prevent privilege escalation
  const ALLOWED_ROLES = ["user", "admin", "technician", "agent"];
  if (role && !ALLOWED_ROLES.includes(role)) {
    throw new HttpsError(
      "invalid-argument",
      `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`,
    );
  }

  try {
    const userRecord = await getAuth().createUser({
      email,
      password,
    });

    await getFirestore()
      .collection("user")
      .doc(userRecord.uid)
      .set({
        email,
        created_time: FieldValue.serverTimestamp(),
        role: role || "agent",
        status: status || "active",
        display_name: name || "",
        permission: permission || "",
        phone_number: phonenumber || "",
        company: company
          ? getFirestore().doc(`Company/${company}`)
          : null,
      });

    logger.info(`Agent created: ${userRecord.uid} (${email})`);

    return {uid: userRecord.uid, message: "Agent created successfully."};
  } catch (error) {
    logger.error("Failed to create agent:", error);
    throw new HttpsError(
      "internal",
      error.message || "Failed to create agent.",
    );
  }
});
