/**
 * Asterisk Service
 * 
 * Firebase Functions module for routing calls through Asterisk Bridge
 * instead of Twilio when configured.
 */

const {logger} = require("firebase-functions");
const axios = require("axios");
const {getFirestore} = require("firebase-admin/firestore");

/**
 * Check if a company is configured to use Asterisk
 */
async function isAsteriskEnabled(companyId) {
  if (!companyId) return false;
  
  try {
    const db = getFirestore();
    const companyDoc = await db.collection("Company").doc(companyId).get();
    
    if (!companyDoc.exists) return false;
    
    const data = companyDoc.data();
    return data.telephonyProvider === "asterisk" && data.asteriskBridgeUrl;
  } catch (error) {
    logger.error("Failed to check Asterisk config:", error);
    return false;
  }
}

/**
 * Get Asterisk Bridge configuration for a company
 */
async function getAsteriskConfig(companyId) {
  if (!companyId) return null;
  
  try {
    const db = getFirestore();
    const companyDoc = await db.collection("Company").doc(companyId).get();
    
    if (!companyDoc.exists) return null;
    
    const data = companyDoc.data();
    
    if (data.telephonyProvider !== "asterisk") return null;
    
    return {
      bridgeUrl: data.asteriskBridgeUrl,
      bridgeSecret: data.asteriskBridgeSecret,
      defaultCallerId: data.asteriskCallerId || data.defaultDdi,
      sipTrunkName: data.sipTrunkName,
    };
  } catch (error) {
    logger.error("Failed to get Asterisk config:", error);
    return null;
  }
}

/**
 * Place a call via Asterisk Bridge
 */
async function placeCallViaAsterisk(config, callData) {
  const {
    bridgeUrl,
    bridgeSecret,
    defaultCallerId,
  } = config;

  const {
    leadNumber,
    leadName,
    companyName,
    assistantName,
    greeting,
    companyPhone,
    callSessionId,
    metadata,
  } = callData;

  try {
    const response = await axios.post(
      `${bridgeUrl}/call`,
      {
        leadNumber,
        leadName,
        companyName,
        assistantName,
        greeting,
        callerId: companyPhone || defaultCallerId,
        callSessionId,
        metadata,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Bridge-Secret": bridgeSecret,
        },
        timeout: 30000,
      }
    );

    logger.info("Asterisk call initiated:", response.data);
    
    return {
      success: true,
      callId: response.data.callId,
      channelId: response.data.channelId,
      provider: "asterisk",
    };
  } catch (error) {
    logger.error("Asterisk call failed:", error.response?.data || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      provider: "asterisk",
    };
  }
}

/**
 * Get call status from Asterisk Bridge
 */
async function getCallStatus(config, callId) {
  const {bridgeUrl, bridgeSecret} = config;

  try {
    const response = await axios.get(
      `${bridgeUrl}/call/${callId}`,
      {
        headers: {
          "X-Bridge-Secret": bridgeSecret,
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    logger.error("Failed to get Asterisk call status:", error.message);
    return null;
  }
}

/**
 * Hangup a call via Asterisk Bridge
 */
async function hangupCall(config, callId) {
  const {bridgeUrl, bridgeSecret} = config;

  try {
    const response = await axios.post(
      `${bridgeUrl}/call/${callId}/hangup`,
      {},
      {
        headers: {
          "X-Bridge-Secret": bridgeSecret,
        },
        timeout: 10000,
      }
    );

    return {success: true, ...response.data};
  } catch (error) {
    logger.error("Failed to hangup Asterisk call:", error.message);
    return {success: false, error: error.message};
  }
}

/**
 * Check bridge health
 */
async function checkBridgeHealth(bridgeUrl) {
  try {
    const response = await axios.get(
      `${bridgeUrl}/health`,
      {timeout: 5000}
    );
    
    return {
      healthy: response.data.status === "ok",
      asteriskConnected: response.data.asteriskConnected,
      activeCalls: response.data.activeCalls,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

module.exports = {
  isAsteriskEnabled,
  getAsteriskConfig,
  placeCallViaAsterisk,
  getCallStatus,
  hangupCall,
  checkBridgeHealth,
};

