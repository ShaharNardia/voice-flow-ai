/**
 * Setup Israeli Phone Number for LENCELOTECH Agent
 * 
 * This script:
 * 1. Finds the Israeli phone number (+972) in Firestore
 * 2. Updates LENCELOTECH Company with the phone number
 * 3. Verifies Twilio configuration
 * 
 * Usage:
 *   node setup_israeli_phone.js [companyId]
 */

const admin = require("firebase-admin");
const path = require("path");
const twilio = require("twilio");

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

const db = admin.firestore();

// Initialize Twilio client
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
let twilioClient = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
} else {
  console.warn("⚠️  Twilio credentials not found in environment variables");
  console.warn("   Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to configure Twilio");
}

/**
 * Normalize phone number
 */
function normalizePhone(num) {
  if (!num) return "";
  return String(num).replace(/\s+/g, "").replace(/-/g, "").replace(/\(/g, "").replace(/\)/g, "");
}

/**
 * Check if number is Israeli (+972)
 */
function isIsraeliNumber(phoneNumber) {
  if (!phoneNumber) return false;
  const normalized = normalizePhone(phoneNumber);
  return normalized.startsWith("+972") || normalized.startsWith("972");
}

/**
 * Find Israeli phone number in Firestore
 */
async function findIsraeliPhoneNumber() {
  console.log("🔍 Searching for Israeli phone number (+972) in Firestore...\n");
  
  try {
    const companiesSnapshot = await db.collection("Company").get();
    const israeliNumbers = [];
    
    for (const companyDoc of companiesSnapshot.docs) {
      const data = companyDoc.data();
      
      // Check phoneNumberMap
      const phoneNumberMap = data.phoneNumberMap || [];
      for (const entry of phoneNumberMap) {
        if (entry && entry.phoneNumber && isIsraeliNumber(entry.phoneNumber)) {
          israeliNumbers.push({
            companyId: companyDoc.id,
            companyName: data.name || "Unnamed",
            phoneNumber: entry.phoneNumber,
            phoneEntry: entry,
            source: "phoneNumberMap"
          });
        }
      }
      
      // Check companyPhoneNumbers
      const companyPhoneNumbers = data.companyPhoneNumbers || [];
      for (const num of companyPhoneNumbers) {
        if (isIsraeliNumber(num)) {
          israeliNumbers.push({
            companyId: companyDoc.id,
            companyName: data.name || "Unnamed",
            phoneNumber: num,
            phoneEntry: null,
            source: "companyPhoneNumbers"
          });
        }
      }
    }
    
    if (israeliNumbers.length === 0) {
      console.log("❌ No Israeli phone numbers found in Firestore");
      return null;
    }
    
    console.log(`✅ Found ${israeliNumbers.length} Israeli phone number(s):\n`);
    israeliNumbers.forEach((item, index) => {
      console.log(`${index + 1}. ${item.phoneNumber}`);
      console.log(`   Company: ${item.companyName} (${item.companyId})`);
      console.log(`   Source: ${item.source}\n`);
    });
    
    // Return the first one (or primary if exists)
    const primary = israeliNumbers.find(item => item.phoneEntry?.primary);
    return primary || israeliNumbers[0];
    
  } catch (error) {
    console.error("❌ Error searching for Israeli phone number:", error);
    throw error;
  }
}

/**
 * Get Twilio SID for phone number
 */
async function getTwilioSid(phoneNumber) {
  if (!twilioClient) {
    console.warn("⚠️  Twilio client not available, skipping SID lookup");
    return null;
  }
  
  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber,
      limit: 1,
    });
    
    if (numbers && numbers.length > 0) {
      return numbers[0].sid;
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️  Could not fetch Twilio SID for ${phoneNumber}:`, error.message);
    return null;
  }
}

/**
 * Configure Twilio webhook
 */
async function configureTwilioWebhook(phoneNumber) {
  if (!twilioClient) {
    console.warn("⚠️  Twilio client not available, skipping webhook configuration");
    return false;
  }
  
  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber,
      limit: 1,
    });
    
    if (!numbers || numbers.length === 0) {
      console.warn(`⚠️  Phone number ${phoneNumber} not found in Twilio`);
      return false;
    }
    
    const number = numbers[0];
    const webhookUrl = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook";
    
    // Update voice webhook
    await twilioClient.incomingPhoneNumbers(number.sid).update({
      voiceUrl: webhookUrl,
      voiceMethod: "POST",
    });
    
    console.log(`✅ Configured Twilio webhook for ${phoneNumber}`);
    console.log(`   Webhook URL: ${webhookUrl}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to configure Twilio webhook:`, error.message);
    return false;
  }
}

/**
 * Update LENCELOTECH Company with phone number
 */
async function updateLencelotechCompany(companyId, israeliPhone) {
  console.log(`\n📝 Updating LENCELOTECH Company (${companyId}) with Israeli phone number...\n`);
  
  try {
    const companyRef = db.collection("Company").doc(companyId);
    const companyDoc = await companyRef.get();
    
    if (!companyDoc.exists) {
      throw new Error(`Company ${companyId} does not exist`);
    }
    
    const data = companyDoc.data();
    const phoneNumber = israeliPhone.phoneNumber;
    const twilioSid = await getTwilioSid(phoneNumber);
    
    // Get existing phoneNumberMap
    const existingMap = data.phoneNumberMap || [];
    
    // Remove any existing primary numbers
    const updatedMap = existingMap.map(entry => ({
      ...entry,
      primary: false
    }));
    
    // Add or update Israeli number as primary
    const phoneEntry = {
      id: twilioSid || israeliPhone.phoneEntry?.id || `twilio-${Date.now()}`,
      phoneNumber: phoneNumber,
      label: "inbound_outbound",
      primary: true,
      assistant: "agent1"
    };
    
    // Check if number already exists in map
    const existingIndex = updatedMap.findIndex(
      entry => normalizePhone(entry.phoneNumber) === normalizePhone(phoneNumber)
    );
    
    if (existingIndex >= 0) {
      updatedMap[existingIndex] = { ...updatedMap[existingIndex], ...phoneEntry };
    } else {
      updatedMap.push(phoneEntry);
    }
    
    // Update companyPhoneNumbers array
    const existingNumbers = new Set(data.companyPhoneNumbers || []);
    existingNumbers.add(phoneNumber);
    
    // Update Company document
    await companyRef.update({
      phoneNumberMap: updatedMap,
      companyPhoneNumbers: Array.from(existingNumbers),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ Successfully updated Company with phone number: ${phoneNumber}`);
    console.log(`   Twilio SID: ${twilioSid || "Not found"}`);
    console.log(`   Primary: true`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to update Company:`, error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function setupIsraeliPhone(companyId = null) {
  try {
    console.log("🚀 Starting Israeli Phone Number Setup for LENCELOTECH...\n");
    
    // Step 1: Find Israeli phone number
    const israeliPhone = await findIsraeliPhoneNumber();
    
    if (!israeliPhone) {
      console.error("\n❌ No Israeli phone number found!");
      console.log("\n💡 To add an Israeli phone number:");
      console.log("   1. Purchase a number in Twilio Console");
      console.log("   2. Add it to a Company in Firestore");
      console.log("   3. Run this script again\n");
      process.exit(1);
    }
    
    console.log(`\n📞 Using phone number: ${israeliPhone.phoneNumber}`);
    console.log(`   Current Company: ${israeliPhone.companyName} (${israeliPhone.companyId})\n`);
    
    // Step 2: Find or create LENCELOTECH Company
    let lencelotechCompanyId = companyId;
    
    if (!lencelotechCompanyId) {
      console.log("🔍 Searching for LENCELOTECH Company...\n");
      const companiesSnapshot = await db.collection("Company")
        .where("name", "==", "LENCELOTECH")
        .limit(1)
        .get();
      
      if (companiesSnapshot.empty) {
        console.log("⚠️  LENCELOTECH Company not found. Creating new one...\n");
        // Create new company - we'll use the setup script for this
        console.log("💡 Please run: node setup_lencelotech_agent.js first");
        console.log("   Then run this script again with the Company ID\n");
        process.exit(1);
      } else {
        lencelotechCompanyId = companiesSnapshot.docs[0].id;
        console.log(`✅ Found LENCELOTECH Company: ${lencelotechCompanyId}\n`);
      }
    }
    
    // Step 3: Update LENCELOTECH Company with phone number
    await updateLencelotechCompany(lencelotechCompanyId, israeliPhone);
    
    // Step 4: Configure Twilio webhook
    console.log("\n🔧 Configuring Twilio webhook...\n");
    await configureTwilioWebhook(israeliPhone.phoneNumber);
    
    console.log("\n✅ Setup complete!");
    console.log(`\n📋 Summary:`);
    console.log(`   Phone Number: ${israeliPhone.phoneNumber}`);
    console.log(`   Company ID: ${lencelotechCompanyId}`);
    console.log(`   Company Name: LENCELOTECH`);
    console.log(`\n🧪 Next steps:`);
    console.log(`   1. Test by calling: ${israeliPhone.phoneNumber}`);
    console.log(`   2. Verify the bot answers in Hebrew`);
    console.log(`   3. Verify it mentions "טייגר לילי"`);
    console.log(`\n✨ Ready to test!`);
    
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Get company ID from command line arguments
const companyId = process.argv[2] || null;

// Run the setup
setupIsraeliPhone(companyId)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  });
