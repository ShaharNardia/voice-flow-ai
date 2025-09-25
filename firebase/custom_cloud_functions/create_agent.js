const functions = require("firebase-functions");
const admin = require("firebase-admin");
// To avoid deployment errors, do not call admin.initializeApp() in your code

exports.createAgent = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    const email = data.email;
    const password = data.password;
    const role = data.role;
    const status = data.status;
    const name = data.name;
    const permission = data.permission;
    const phonenumber = data.phonenumber;
    const company = data.company;

    // Write your code below

    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
      });

      await admin
        .firestore()
        .collection("user")
        .doc(userRecord.uid)
        .set({
          email,
          created_time: admin.firestore.FieldValue.serverTimestamp(),
          role,
          status,
          display_name: name,
          permission,
          phone_number: phonenumber,
          company: admin.firestore().doc(`Company/${company}`),
        });

      return { uid: userRecord?.uid, message: "Agent created successfully." };
    } catch (error) {
      console.log("Detailed Error:", error);
      return { invalid: error.message };
    }
    // Write your code above!
  });
