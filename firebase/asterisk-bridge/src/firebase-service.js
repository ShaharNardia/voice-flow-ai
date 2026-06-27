/**
 * Firebase Service
 * 
 * Handles communication with Firebase Firestore from the Asterisk Bridge.
 */

const admin = require('firebase-admin');
const path = require('path');

let db = null;
let initialized = false;

/**
 * Initialize Firebase Admin SDK
 */
async function initialize() {
  if (initialized) return;

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (serviceAccountPath) {
      // Use service account file
      const serviceAccount = require(path.resolve(serviceAccountPath));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use ADC (Application Default Credentials)
      admin.initializeApp({
        projectId,
      });
    } else {
      throw new Error('No Firebase credentials configured');
    }

    db = admin.firestore();
    initialized = true;
    console.log('[Firebase] Initialized successfully');
    
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error.message);
    throw error;
  }
}

/**
 * Get a call session document
 */
async function getCallSession(sessionId) {
  if (!db || !sessionId) return null;

  try {
    const doc = await db.collection('call_sessions').doc(sessionId).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error(`[Firebase] Failed to get call_session ${sessionId}:`, error.message);
    return null;
  }
}

/**
 * Update a call session document
 */
async function updateCallSession(sessionId, data) {
  if (!db || !sessionId) return;

  try {
    const sessionRef = db.collection('call_sessions').doc(sessionId);
    await sessionRef.set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    console.log(`[Firebase] Updated call_session: ${sessionId}`);
  } catch (error) {
    console.error(`[Firebase] Failed to update call_session ${sessionId}:`, error.message);
  }
}

/**
 * Update a Lead document
 */
async function updateLead(leadId, data) {
  if (!db || !leadId) return;

  try {
    const leadRef = db.collection('Lead').doc(leadId);
    await leadRef.update({
      ...data,
      lastContactDate: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`[Firebase] Updated Lead: ${leadId}`);
  } catch (error) {
    console.error(`[Firebase] Failed to update Lead ${leadId}:`, error.message);
  }
}

/**
 * Save a Call record
 */
async function saveCallRecord(callData) {
  if (!db) return;

  try {
    const callRef = db.collection('Call').doc(callData.id);
    await callRef.set({
      ...callData,
      dateTime: admin.firestore.FieldValue.serverTimestamp(),
      requestType: 'asterisk_call',
    });
    
    console.log(`[Firebase] Saved Call record: ${callData.id}`);
  } catch (error) {
    console.error(`[Firebase] Failed to save Call record:`, error.message);
  }
}

/**
 * Get company PBX configuration
 */
async function getCompanyPbxConfig(companyId) {
  if (!db || !companyId) return null;

  try {
    const companyRef = db.collection('Company').doc(companyId);
    const doc = await companyRef.get();
    
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      telephonyProvider: data.telephonyProvider || 'twilio',
      asteriskHost: data.asteriskHost,
      asteriskPort: data.asteriskPort,
      asteriskUser: data.asteriskUser,
      sipTrunkName: data.sipTrunkName,
      defaultDdi: data.defaultDdi,
    };
  } catch (error) {
    console.error(`[Firebase] Failed to get company config:`, error.message);
    return null;
  }
}

/**
 * Listen for new call requests (optional - for push-based architecture)
 */
function listenForCallRequests(callback) {
  if (!db) return null;

  const unsubscribe = db.collection('asterisk_call_queue')
    .where('status', '==', 'pending')
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const callRequest = {
            id: change.doc.id,
            ...change.doc.data(),
          };
          console.log('[Firebase] New call request:', callRequest.id);
          callback(callRequest);
        }
      });
    }, (error) => {
      console.error('[Firebase] Listener error:', error);
    });

  return unsubscribe;
}

/**
 * Mark a call request as processed
 */
async function markCallRequestProcessed(requestId, result) {
  if (!db || !requestId) return;

  try {
    await db.collection('asterisk_call_queue').doc(requestId).update({
      status: 'processed',
      result,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`[Firebase] Failed to mark request processed:`, error.message);
  }
}

module.exports = {
  initialize,
  getCallSession,
  updateCallSession,
  updateLead,
  saveCallRecord,
  getCompanyPbxConfig,
  listenForCallRequests,
  markCallRequestProcessed,
};

