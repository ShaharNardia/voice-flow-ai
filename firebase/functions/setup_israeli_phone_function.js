/**
 * Firebase Function to setup Israeli phone number for LENCELOTECH
 * 
 * This function:
 * 1. Finds Israeli phone number (+972) in Firestore
 * 2. Updates LENCELOTECH Company with the phone number
 * 3. Returns the phone number for verification
 */

const {onCall, onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const twilio = require("twilio");

const db = getFirestore();

// Initialize Twilio client
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
let twilioClient = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
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
 * Get Twilio SID for phone number
 */
async function getTwilioSid(phoneNumber) {
  if (!twilioClient) {
    logger.warn("Twilio client not available");
    return null;
  }
  
  try {
    // Try exact match first
    let numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber,
      limit: 1,
    });
    
    if (numbers && numbers.length > 0) {
      return numbers[0].sid;
    }
    
    // Try without + prefix
    const numberWithoutPlus = phoneNumber.replace(/^\+/, "");
    numbers = await twilioClient.incomingPhoneNumbers.list({
      phoneNumber: numberWithoutPlus,
      limit: 1,
    });
    
    if (numbers && numbers.length > 0) {
      return numbers[0].sid;
    }
    
    // Try listing all and finding manually
    logger.info("Searching all Twilio numbers for Israeli number");
    const allNumbers = await twilioClient.incomingPhoneNumbers.list({limit: 100});
    const normalizedTarget = normalizePhone(phoneNumber);
    
    for (const num of allNumbers) {
      const normalizedNum = normalizePhone(num.phoneNumber);
      if (normalizedNum === normalizedTarget || 
          normalizedNum === normalizedTarget.replace(/^\+/, "") ||
          normalizedNum.replace(/^\+/, "") === normalizedTarget) {
        logger.info(`Found Twilio number: ${num.phoneNumber} (SID: ${num.sid})`);
        return num.sid;
      }
    }
    
    return null;
  } catch (error) {
    logger.warn(`Could not fetch Twilio SID for ${phoneNumber}:`, error.message);
    return null;
  }
}

/**
 * Configure Twilio webhook
 */
async function configureTwilioWebhook(phoneNumber, twilioSid = null) {
  if (!twilioClient) {
    logger.warn("Twilio client not available");
    return false;
  }
  
  try {
    let numberSid = twilioSid;
    
    // If SID not provided, find it
    if (!numberSid) {
      numberSid = await getTwilioSid(phoneNumber);
      if (!numberSid) {
        logger.warn(`Phone number ${phoneNumber} not found in Twilio`);
        return false;
      }
    }
    
    const webhookUrl = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/twilioVoiceWebhook";
    
    // Update voice webhook
    await twilioClient.incomingPhoneNumbers(numberSid).update({
      voiceUrl: webhookUrl,
      voiceMethod: "POST",
    });
    
    logger.info(`Configured Twilio webhook for ${phoneNumber} (SID: ${numberSid})`);
    return true;
    
  } catch (error) {
    logger.error(`Failed to configure Twilio webhook:`, error);
    return false;
  }
}

exports.setupIsraeliPhone = onCall(async (request) => {
  try {
    const companyId = request.data?.companyId || null;
    
    logger.info("Starting Israeli phone number setup", {companyId});
    
    // Step 1: Find Israeli phone number
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
      return {
        success: false,
        error: "No Israeli phone numbers found in Firestore",
        message: "Please add an Israeli phone number (+972) to a Company in Firestore first"
      };
    }
    
    // Use the first one (or primary if exists)
    const israeliPhone = israeliNumbers.find(item => item.phoneEntry?.primary) || israeliNumbers[0];
    
    logger.info("Found Israeli phone number", {
      phoneNumber: israeliPhone.phoneNumber,
      currentCompany: israeliPhone.companyName
    });
    
    // Step 2: Find LENCELOTECH Company
    let lencelotechCompanyId = companyId;
    
    if (!lencelotechCompanyId) {
      const lencelotechSnapshot = await db.collection("Company")
        .where("name", "==", "LENCELOTECH")
        .limit(1)
        .get();
      
      if (lencelotechSnapshot.empty) {
        return {
          success: false,
          error: "LENCELOTECH Company not found",
          message: "Please create LENCELOTECH Company first using setup_lencelotech_agent.js",
          foundNumbers: israeliNumbers.map(n => ({
            phoneNumber: n.phoneNumber,
            companyName: n.companyName,
            companyId: n.companyId
          }))
        };
      }
      
      lencelotechCompanyId = lencelotechSnapshot.docs[0].id;
    }
    
    // Step 3: Update LENCELOTECH Company with phone number
    const companyRef = db.collection("Company").doc(lencelotechCompanyId);
    const companyDoc = await companyRef.get();
    
    if (!companyDoc.exists) {
      return {
        success: false,
        error: `Company ${lencelotechCompanyId} does not exist`
      };
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
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("Updated LENCELOTECH Company with phone number", {
      companyId: lencelotechCompanyId,
      phoneNumber: phoneNumber
    });
    
    // Step 4: Configure Twilio webhook (with SID if found)
    const webhookConfigured = await configureTwilioWebhook(phoneNumber, twilioSid);
    
    return {
      success: true,
      phoneNumber: phoneNumber,
      companyId: lencelotechCompanyId,
      companyName: data.name || "LENCELOTECH",
      twilioSid: twilioSid,
      webhookConfigured: webhookConfigured,
      message: `Successfully configured ${phoneNumber} for LENCELOTECH`
    };
    
  } catch (error) {
    logger.error("Failed to setup Israeli phone number:", error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
});

// Also export as HTTP function for easier calling
exports.setupIsraeliPhoneHttp = onRequest(async (req, res) => {
  try {
    const companyId = req.query.companyId || req.body?.companyId || null;
    
    logger.info("Starting Israeli phone number setup (HTTP)", {companyId});
    
    // Step 1: Find Israeli phone number
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
      res.status(404).json({
        success: false,
        error: "No Israeli phone numbers found in Firestore",
        message: "Please add an Israeli phone number (+972) to a Company in Firestore first"
      });
      return;
    }
    
    // Use the first one (or primary if exists)
    const israeliPhone = israeliNumbers.find(item => item.phoneEntry?.primary) || israeliNumbers[0];
    
    logger.info("Found Israeli phone number", {
      phoneNumber: israeliPhone.phoneNumber,
      currentCompany: israeliPhone.companyName
    });
    
    // Step 2: Find or create LENCELOTECH Company
    let lencelotechCompanyId = companyId;
    let companyDoc = null;
    let isNewCompany = false;
    
    if (!lencelotechCompanyId) {
      const lencelotechSnapshot = await db.collection("Company")
        .where("name", "==", "LENCELOTECH")
        .limit(1)
        .get();
      
      if (lencelotechSnapshot.empty) {
        // Create new LENCELOTECH Company
        logger.info("Creating new LENCELOTECH Company");
        const newCompanyRef = db.collection("Company").doc();
        lencelotechCompanyId = newCompanyRef.id;
        
        const newCompanyData = {
          name: "LENCELOTECH",
          assistantname: "העוזר הווירטואלי",
          industry: "מסעדות",
          language: "he-IL",
          timeZone: "Asia/Jerusalem",
          agent: "11labs",
          modelvoice: "eleven_flash_v2_5",
          voice: "rachel",
          provider: "deepgram",
          modelname: "nova-2",
          inboundmessage: "שלום! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
          outboundmessage: "שלום {{leadName}}! זה {{assistantName}} מ-{{companyName}}. איך אני יכול לעזור לך היום?",
          additionalInsturctions: "אתה עובד במסעדה סינית דמיונית בשם 'טייגר לילי'. תפקידך הוא לקבל הזמנות טלפוניות. שאל את הלקוח מה הוא רוצה להזמין, כמה מנות, מתי הוא רוצה לאסוף, ופרטי יצירת קשר.",
          offerFreeEstimation: true,
          createJobPermission: true,
          reshedulePermission: true,
          cancelPermission: true,
          addNotePermission: true,
          priceRestriction: false,
          legalRestriction: false,
          medicalRestriction: false,
          personalQuestion: false,
          aiHandleInbound: true,
          outboundCallHandling: true,
          isTwentyFourBySeven: true,
          leaveMessagePermission: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        
        await newCompanyRef.set(newCompanyData);
        companyDoc = {exists: () => true, data: () => newCompanyData};
        isNewCompany = true;
        logger.info("Created new LENCELOTECH Company", {companyId: lencelotechCompanyId});
      } else {
        lencelotechCompanyId = lencelotechSnapshot.docs[0].id;
        companyDoc = lencelotechSnapshot.docs[0];
      }
    } else {
      const doc = await db.collection("Company").doc(lencelotechCompanyId).get();
      if (!doc.exists) {
        res.status(404).json({
          success: false,
          error: `Company ${lencelotechCompanyId} does not exist`
        });
        return;
      }
      companyDoc = doc;
    }
    
    // Step 3: Update LENCELOTECH Company with phone number
    const companyRef = db.collection("Company").doc(lencelotechCompanyId);
    
    if (!isNewCompany) {
      companyDoc = await companyRef.get();
      if (!companyDoc.exists) {
        res.status(404).json({
          success: false,
          error: `Company ${lencelotechCompanyId} does not exist`
        });
        return;
      }
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
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("Updated LENCELOTECH Company with phone number", {
      companyId: lencelotechCompanyId,
      phoneNumber: phoneNumber
    });
    
    // Step 4: Configure Twilio webhook (with SID if found)
    const webhookConfigured = await configureTwilioWebhook(phoneNumber, twilioSid);
    
    res.json({
      success: true,
      phoneNumber: phoneNumber,
      companyId: lencelotechCompanyId,
      companyName: data.name || "LENCELOTECH",
      twilioSid: twilioSid,
      webhookConfigured: webhookConfigured,
      message: `Successfully configured ${phoneNumber} for LENCELOTECH`
    });
    
  } catch (error) {
    logger.error("Failed to setup Israeli phone number:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});
