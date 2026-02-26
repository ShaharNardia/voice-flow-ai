/**
 * Setup Script for LENCELOTECH Agent 1
 * 
 * This script creates or updates the Company record in Firestore
 * for LENCELOTECH with all required settings for the "Tiger Lily"
 * Chinese restaurant scenario.
 * 
 * Usage:
 *   node setup_lencelotech_agent.js [companyId]
 * 
 * If companyId is not provided, it will create a new Company record.
 * If companyId is provided, it will update the existing Company record.
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
  console.error("Make sure the service account file exists at: ../../gleaming-idiom-475616-h8-1b5543a3a88e.json");
  process.exit(1);
}

const db = admin.firestore();

/**
 * LENCELOTECH Agent 1 Configuration
 */
const LENCELOTECH_CONFIG = {
  // Basic Information
  name: "LENCELOTECH",
  assistantname: "העוזר הווירטואלי",
  industry: "מסעדות",
  timeZone: "Asia/Jerusalem",
  companyLink: "", // Add website if available
  
  // TTS Settings (11labs - fastest + best quality)
  agent: "11labs",                    // TTS Provider
  modelvoice: "eleven_flash_v2_5",     // TTS Model (fastest)
  voice: "rachel",                    // Voice ID (Hebrew)
  
  // Alternative TTS (if 11labs not available):
  // agent: "google",
  // voice: "Google.he-IL-Wavenet-A",
  // modelvoice: "", // Not needed for Google
  
  // STT Settings (Deepgram - most accurate + fast)
  provider: "deepgram",               // STT Provider
  modelname: "nova-2",                // STT Model (fastest + most accurate)
  language: "he-IL",                  // Language code
  
  // Messages
  inboundmessage: "שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
  outboundmessage: "שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
  
  // Additional Instructions - Tiger Lily Restaurant Scenario
  additionalInsturctions: "אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'. תפקידך הוא לקבל הזמנות טלפוניות. שאל את הלקוח מה הוא רוצה להזמין, כמה מנות, מתי הוא רוצה לאסוף, ופרטי יצירת קשר.",
  
  // Permissions
  offerFreeEstimation: true,
  createJobPermission: true,
  reshedulePermission: true,
  cancelPermission: true,
  addNotePermission: true,
  
  // Restrictions
  priceRestriction: false,
  legalRestriction: false,
  medicalRestriction: false,
  personalQuestion: false,
  additionalRestrictionTopics: "",
  
  // Call Handling
  aiHandleInbound: true,
  outboundCallHandling: true,
  isTwentyFourBySeven: true,
  emailOutbound: false,
  smsNotification: false,
  leaveMessagePermission: true,
  
  // Phone Numbers
  // NOTE: You need to add phoneNumberMap manually after running this script
  // phoneNumberMap should be an array like:
  // [
  //   {
  //     id: "twilio_sid_xxx",
  //     phoneNumber: "+1234567890",
  //     label: "inbound_outbound",
  //     primary: true,
  //     assistant: "agent1"
  //   }
  // ]
  
  // Other settings
  fallBackNumber: "",
  promptType: "ai",
  credits: 0,
  minutes: 0,
  companyMinutesRate: 0,
  
  // Telephony Provider
  telephonyProvider: "twilio", // or "asterisk" if using Asterisk
};

/**
 * Main function
 */
async function setupLencelotechAgent(companyId = null) {
  try {
    console.log("🚀 Starting LENCELOTECH Agent 1 setup...\n");
    
    let companyRef;
    let isNew = false;
    
    if (companyId) {
      // Update existing company
      companyRef = db.collection("Company").doc(companyId);
      const existingDoc = await companyRef.get();
      
      if (!existingDoc.exists) {
        console.error(`❌ Company with ID ${companyId} does not exist!`);
        console.log("💡 Creating a new Company record instead...\n");
        companyRef = db.collection("Company").doc();
        isNew = true;
      } else {
        console.log(`📝 Updating existing Company: ${companyId}`);
        console.log(`   Current name: ${existingDoc.data().name || "N/A"}\n`);
      }
    } else {
      // Create new company
      companyRef = db.collection("Company").doc();
      isNew = true;
      console.log("✨ Creating new Company record...\n");
    }
    
    // Prepare data with timestamps
    const data = {
      ...LENCELOTECH_CONFIG,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (isNew) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    
    // Update or create the document
    await companyRef.set(data, { merge: true });
    
    console.log("✅ Successfully saved Company record!");
    console.log(`\n📋 Company ID: ${companyRef.id}`);
    console.log(`   Name: ${data.name}`);
    console.log(`   Assistant: ${data.assistantname}`);
    console.log(`   Language: ${data.language}`);
    console.log(`   TTS Provider: ${data.agent}`);
    console.log(`   TTS Voice: ${data.voice}`);
    console.log(`   STT Provider: ${data.provider}`);
    console.log(`   STT Model: ${data.modelname}`);
    console.log(`\n⚠️  IMPORTANT: You need to add phoneNumberMap manually!`);
    console.log(`   Go to Firestore Console and add your phone number:`);
    console.log(`   Collection: Company`);
    console.log(`   Document: ${companyRef.id}`);
    console.log(`   Field: phoneNumberMap (array)`);
    console.log(`\n   Example:`);
    console.log(`   [{`);
    console.log(`     "id": "twilio_sid_xxx",`);
    console.log(`     "phoneNumber": "+1234567890",`);
    console.log(`     "label": "inbound_outbound",`);
    console.log(`     "primary": true,`);
    console.log(`     "assistant": "agent1"`);
    console.log(`   }]`);
    console.log(`\n📞 To find your phone number:`);
    console.log(`   1. Go to Twilio Console`);
    console.log(`   2. Navigate to Phone Numbers`);
    console.log(`   3. Copy the phone number you want to use`);
    console.log(`   4. Add it to phoneNumberMap in Firestore`);
    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Add phoneNumberMap to the Company record`);
    console.log(`   2. Configure the phone number in Twilio:`);
    console.log(`      - Voice URL: https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook`);
    console.log(`      - HTTP Method: POST`);
    console.log(`   3. Test the agent by calling the phone number`);
    console.log(`\n✨ Setup complete!`);
    
  } catch (error) {
    console.error("❌ Error setting up LENCELOTECH Agent:", error);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Get company ID from command line arguments
const companyId = process.argv[2] || null;

// Run the setup
setupLencelotechAgent(companyId)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  });
