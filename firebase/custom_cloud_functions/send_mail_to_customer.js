const functions = require("firebase-functions");
const admin = require("firebase-admin");
nodemailer = require("nodemailer");
// To avoid deployment errors, do not call admin.initializeApp() in your code

exports.sendMailToCustomer = functions.https.onCall(async (data, context) => {
  if (!context.auth.uid) {
    return;
  }
  const email = data.email;
  const subject = data.subject;
  const body = data.body;
  const userName = data.userName;
  const password = data.password;
  const host = data.host;
  const port = data.port;
  // Write your code below!

  const transporter = nodemailer.createTransport({
    host: host, // "server353.web-hosting.com",
    port: port, //465, // SMTP SSL Port
    secure: port === 465 ? true : false, // true for 465, false for other ports
    auth: {
      user: userName,
      pass: password,
    },
  });

  const mailOptions = {
    from: userName, // Sender address
    to: email, // Recipient address
    subject: subject,
    html: body,
  };

  try {
    // Send email using Nodemailer
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully: " + info.response);

    // Return a JSON response with success message
    return "Success";
  } catch (error) {
    console.error("Error sending email:", error);

    // Return a JSON response with error message
    return "Error";
  }

  // Write your code above!
});
