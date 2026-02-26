/**
 * Call the setupIsraeliPhone function
 */

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin
try {
  const serviceAccount = require(path.resolve(__dirname, "../../gleaming-idiom-475616-h8-1b5543a3a88e.json"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "voiceflow-ai-202509231639",
  });
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error.message);
  process.exit(1);
}

const functions = admin.functions();
const setupFunction = functions.httpsCallable("setupIsraeliPhone");

async function callSetup() {
  try {
    console.log("🚀 Calling setupIsraeliPhone function...\n");
    
    const result = await setupFunction({});
    
    if (result.data.success) {
      console.log("✅ Setup successful!\n");
      console.log("📋 Details:");
      console.log(`   Phone Number: ${result.data.phoneNumber}`);
      console.log(`   Company ID: ${result.data.companyId}`);
      console.log(`   Company Name: ${result.data.companyName}`);
      console.log(`   Twilio SID: ${result.data.twilioSid || "Not found"}`);
      console.log(`   Webhook Configured: ${result.data.webhookConfigured ? "Yes" : "No"}`);
      console.log(`\n🧪 Test by calling: ${result.data.phoneNumber}`);
      console.log(`\n✨ Ready to test!`);
    } else {
      console.error("❌ Setup failed:");
      console.error(`   Error: ${result.data.error}`);
      console.error(`   Message: ${result.data.message}`);
      if (result.data.foundNumbers) {
        console.log("\n📞 Found Israeli numbers:");
        result.data.foundNumbers.forEach((n, i) => {
          console.log(`   ${i + 1}. ${n.phoneNumber} (${n.companyName})`);
        });
      }
    }
  } catch (error) {
    console.error("❌ Error calling function:", error);
    process.exit(1);
  }
}

callSetup();
