const {onCall} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

exports.createAgent = onCall(async (request) => {
  const data = request.data;
  const email = data.email;
  const password = data.password;
  const role = data.role;
  const status = data.status;
  const name = data.name;
  const permission = data.permission;
  const phonenumber = data.phonenumber;
  const company = data.company;

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
        role,
        status,
        display_name: name,
        permission,
        phone_number: phonenumber,
        company: getFirestore().doc(`Company/${company}`),
      });

    return {uid: userRecord?.uid, message: "Agent created successfully."};
  } catch (error) {
    console.log("Detailed Error:", error);
    return {invalid: error.message};
  }
});
