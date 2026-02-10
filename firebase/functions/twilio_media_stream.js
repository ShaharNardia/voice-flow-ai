const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const deepgramService = require("./deepgram_service");
const llmService = require("./llm_service");

/**
 * Twilio Media Stream Handler
 * Receives audio from Twilio Media Streams and processes it through Deepgram STT
 */

// Store active Deepgram connections per call
const activeConnections = new Map();

/**
 * Handle Twilio Media Stream WebSocket connection
 * This endpoint receives audio from Twilio and forwards it to Deepgram
 */
exports.twilioMediaStream = onRequest(async (req, res) => {
  try {
    const callSid = req.query.callSid || req.body?.callSid;
    const callSessionId = req.query.callSessionId || req.body?.callSessionId;

    if (!callSid || !callSessionId) {
      logger.error("Missing callSid or callSessionId in media stream request");
      res.status(400).send("Missing callSid or callSessionId");
      return;
    }

    logger.info("Twilio Media Stream connection received", {
      callSid,
      callSessionId,
      method: req.method,
    });

    // Get session data
    const db = getFirestore();
    const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      logger.error("Call session not found", {callSessionId});
      res.status(404).send("Call session not found");
      return;
    }

    const data = snapshot.data();
    const assistant = data.assistantDefinition || {};
    const language = assistant.language || "he-IL";
    const sttModel = assistant.sttModel || "nova-2";

    // Create Deepgram connection
    let deepgramConnection = null;
    let lastFinalTranscript = "";
    let transcriptBuffer = "";

    const onTranscript = async (transcriptData) => {
      const {text, isFinal, confidence} = transcriptData;

      if (isFinal && text && text.trim()) {
        // Final transcript received - process with LLM
        logger.info("Final transcript received from Deepgram", {
          callSessionId,
          text,
          confidence,
        });

        try {
          // Update conversation history
          const currentData = await sessionRef.get();
          const currentHistory = currentData.data()?.conversationHistory || [];

          // Add user message
          currentHistory.push({
            role: "user",
            content: text,
            timestamp: new Date(),
          });

          // Get company data for context
          const companyId = currentData.data()?.companyId;
          let companyData = {};
          if (companyId) {
            try {
              const companyDoc = await db.collection("Company").doc(companyId).get();
              if (companyDoc.exists) {
                companyData = companyDoc.data();
              }
            } catch (companyError) {
              logger.warn(`Could not fetch company data: ${companyError.message}`);
            }
          }

          // Get LLM response
          const systemPrompt = llmService.buildSystemPrompt(assistant, companyData, language);
          const llmHistory = llmService.getConversationHistory({conversationHistory: currentHistory});
          
          const llmResult = await llmService.getLLMResponse(
            systemPrompt,
            text,
            llmHistory,
            {
              model: "gpt-4o-mini",
              maxTokens: 150,
              temperature: 0.8,
            },
          );

          const aiResponse = llmResult.text;

          // Add AI response to history
          currentHistory.push({
            role: "assistant",
            content: aiResponse,
            timestamp: new Date(),
          });

          // Update session
          await sessionRef.set({
            conversationHistory: currentHistory,
            lastSpeechResult: text,
            lastAIResponse: aiResponse,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});

          // Send response back to Twilio via TwiML
          // Note: This requires a separate mechanism to send TwiML back
          // For now, we'll log it and handle it in the main flow
          logger.info("LLM response generated", {
            callSessionId,
            userMessage: text,
            aiResponse,
          });

          // TODO: Send TwiML response back to Twilio
          // This requires storing the response and having twilioVoiceWebhook poll for it
          // Or using Twilio's REST API to update the call

        } catch (error) {
          logger.error("Error processing transcript with LLM", {
            error: error.message,
            callSessionId,
            text,
          });
        }
      } else if (text && text.trim()) {
        // Interim result - just log it
        transcriptBuffer = text;
        logger.debug("Interim transcript", {callSessionId, text});
      }
    };

    const onError = (error) => {
      logger.error("Deepgram error", {
        error: error.message,
        callSessionId,
      });
    };

    // Create Deepgram connection
    try {
      deepgramConnection = deepgramService.createDeepgramConnection(
        deepgramLanguage,
        sttModel,
        onTranscript,
        onError,
      );

      // Store connection
      activeConnections.set(callSid, {
        deepgramConnection,
        callSessionId,
        createdAt: new Date(),
      });

      logger.info("Deepgram connection created", {
        callSid,
        callSessionId,
        language: deepgramLanguage,
        model: sttModel,
      });
    } catch (error) {
      logger.error("Failed to create Deepgram connection", {
        error: error.message,
        callSid,
        callSessionId,
      });
      res.status(500).send("Failed to create Deepgram connection");
      return;
    }

    // Handle incoming audio data
    // Twilio Media Streams sends audio as binary data
    req.on("data", (chunk) => {
      if (deepgramConnection) {
        deepgramService.sendAudioToDeepgram(deepgramConnection, chunk);
      }
    });

    req.on("end", () => {
      logger.info("Media stream ended", {callSid, callSessionId});
      if (deepgramConnection) {
        deepgramService.closeDeepgramConnection(deepgramConnection);
        activeConnections.delete(callSid);
      }
    });

    req.on("error", (error) => {
      logger.error("Media stream error", {
        error: error.message,
        callSid,
        callSessionId,
      });
      if (deepgramConnection) {
        deepgramService.closeDeepgramConnection(deepgramConnection);
        activeConnections.delete(callSid);
      }
    });

    // Send 200 OK to Twilio
    res.status(200).send("OK");

  } catch (error) {
    logger.error("Twilio Media Stream handler failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).send("Internal server error");
  }
});

/**
 * Get active Deepgram connection for a call
 */
function getActiveConnection(callSid) {
  return activeConnections.get(callSid);
}

/**
 * Close Deepgram connection for a call
 */
function closeConnection(callSid) {
  const connection = activeConnections.get(callSid);
  if (connection && connection.deepgramConnection) {
    deepgramService.closeDeepgramConnection(connection.deepgramConnection);
    activeConnections.delete(callSid);
  }
}

module.exports = {
  getActiveConnection,
  closeConnection,
};
