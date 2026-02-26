const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");
const deepgramService = require("./deepgram_service");
const llmService = require("./llm_service");

// Initialize Twilio client
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

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
    const voiceId = assistant.voice || "Google.he-IL-Wavenet-A";
    const sayLanguage = language === "he" ? "he-IL" : (language || "he-IL");

    // Helper function to resolve voice for language
    const resolveVoiceForLanguage = (voice, lang) => {
      if (!lang) lang = "he-IL";
      const langLower = lang.toLowerCase();
      if (langLower.startsWith("he") && voice && voice.includes("he-IL")) {
        return voice;
      }
      if (langLower.startsWith("he")) {
        return "Google.he-IL-Wavenet-A";
      }
      return voice || "Google.en-US-Wavenet-A";
    };

    const finalVoiceId = resolveVoiceForLanguage(voiceId, language);

    // Helper function to send TwiML to Twilio
    const sendTwiMLToTwilio = async (twimlXml, reason = "response") => {
      if (!twilioClient || !callSid) {
        logger.warn("Cannot send TwiML - missing Twilio client or callSid", {
          hasClient: !!twilioClient,
          hasCallSid: !!callSid,
        });
        return false;
      }

      try {
        await twilioClient.calls(callSid).update({
          twiml: twimlXml,
        });
        logger.info("TwiML sent to Twilio", {
          callSid,
          callSessionId,
          reason,
          twimlLength: twimlXml.length,
        });
        return true;
      } catch (error) {
        logger.error("Failed to send TwiML to Twilio", {
          error: error.message,
          callSid,
          callSessionId,
          reason,
        });
        return false;
      }
    };

    // Constants for stream URL
    const REGION = "us-central1";
    const PROJECT_ID = process.env.GCLOUD_PROJECT;
    const streamUrl = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/twilioMediaStream?callSid=${callSid}&callSessionId=${callSessionId}`;

    // Helper function to create TwiML for Say
    const createSayTwiML = (text) => {
      const response = new twilio.twiml.VoiceResponse();
      response.say({voice: finalVoiceId, language: sayLanguage}, text);
      // Continue streaming after saying
      response.stream({
        url: streamUrl,
        track: "both_tracks",
      });
      return response.toString();
    };

    // Helper function to create TwiML for barge-in (stop current Say)
    const createBargeInTwiML = () => {
      const response = new twilio.twiml.VoiceResponse();
      // Pause briefly to stop current Say, then continue streaming
      response.pause({length: 0.1});
      response.stream({
        url: streamUrl,
        track: "both_tracks",
      });
      return response.toString();
    };

    // Track state
    let deepgramConnection = null;
    let lastFinalTranscript = "";
    let transcriptBuffer = "";
    let isBotSpeaking = false; // Track if bot is currently speaking
    let lastInterimTime = 0;
    const BARGE_IN_CONFIDENCE_THRESHOLD = 0.5; // Minimum confidence for barge-in
    const BARGE_IN_TIME_THRESHOLD = 500; // ms - minimum time between interim results to trigger barge-in

    // Track transcript processing start time
    let transcriptStartTime = Date.now();
    
    const onTranscript = async (transcriptData) => {
      const {text, isFinal, confidence} = transcriptData;
      const now = Date.now();

      // Handle interim results for barge-in detection
      if (!isFinal && text && text.trim() && confidence >= BARGE_IN_CONFIDENCE_THRESHOLD) {
        transcriptBuffer = text;
        
        // Check if this is a new interim result (not just an update)
        const timeSinceLastInterim = now - lastInterimTime;
        lastInterimTime = now;

        // If bot is speaking and we have a confident interim result, trigger barge-in
        if (isBotSpeaking && timeSinceLastInterim > BARGE_IN_TIME_THRESHOLD) {
          const bargeInStartTime = Date.now();
          logger.info("Barge-in detected - stopping bot speech", {
            callSessionId,
            callSid,
            interimText: text,
            confidence,
            timeSinceLastInterim,
            timestamp: new Date().toISOString(),
          });

          // Stop current Say by sending barge-in TwiML
          const bargeInTwiML = createBargeInTwiML();
          const bargeInSent = await sendTwiMLToTwilio(bargeInTwiML, "barge-in");
          const bargeInLatency = Date.now() - bargeInStartTime;
          
          if (bargeInSent) {
            isBotSpeaking = false;
            logger.info("Barge-in TwiML sent successfully", {
              callSessionId,
              callSid,
              bargeInLatencyMs: bargeInLatency,
            });
          } else {
            logger.warn("Failed to send barge-in TwiML", {
              callSessionId,
              callSid,
              bargeInLatencyMs: bargeInLatency,
            });
          }
        }

        logger.debug("Interim transcript received", {
          callSessionId,
          callSid,
          text,
          confidence,
          isBotSpeaking,
          textLength: text.length,
        });
        return;
      }

      // Handle final transcript
      if (isFinal && text && text.trim()) {
        const finalTranscriptStartTime = Date.now();
        
        // Final transcript received - process with LLM
        logger.info("Final transcript received from Deepgram", {
          callSessionId,
          callSid,
          text,
          textLength: text.length,
          confidence,
          sttProcessingTimeMs: sttProcessingTime,
          timestamp: new Date().toISOString(),
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
          const llmStartTime = Date.now();
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

          const llmLatency = Date.now() - llmStartTime;
          const aiResponse = llmResult.text;
          const totalLatency = Date.now() - finalTranscriptStartTime;

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

          // Send TwiML response back to Twilio
          const twimlStartTime = Date.now();
          const sayTwiML = createSayTwiML(aiResponse);
          const twimlSent = await sendTwiMLToTwilio(sayTwiML, "llm-response");
          const twimlLatency = Date.now() - twimlStartTime;
          
          if (twimlSent) {
            isBotSpeaking = true; // Mark that bot is now speaking
          }

          logger.info("LLM response generated and sent", {
            callSessionId,
            callSid,
            userMessage: text,
            userMessageLength: text.length,
            aiResponse: aiResponse.substring(0, 100) + (aiResponse.length > 100 ? "..." : ""),
            aiResponseLength: aiResponse.length,
            llmLatencyMs: llmLatency,
            twimlLatencyMs: twimlLatency,
            totalLatencyMs: totalLatency,
            sttProcessingTimeMs: llmStartTime - finalTranscriptStartTime,
            twimlSent,
            tokensUsed: llmResult.tokensUsed,
            timestamp: new Date().toISOString(),
          });

        } catch (error) {
          logger.error("Error processing transcript with LLM", {
            error: error.message,
            callSessionId,
            text,
            stack: error.stack,
          });
        }
      }
    };

    const onError = (error) => {
      logger.error("Deepgram error", {
        error: error.message,
        stack: error.stack,
        callSessionId,
        callSid,
      });
      
      // If Deepgram connection fails critically, try to fallback
      // Note: This is a best-effort fallback - the call may need to be redirected
      if (deepgramConnection) {
        try {
          deepgramService.closeDeepgramConnection(deepgramConnection);
          activeConnections.delete(callSid);
        } catch (closeError) {
          logger.warn("Error closing Deepgram connection on error", {
            error: closeError.message,
          });
        }
      }
    };

    // Check if DEEPGRAM_API_KEY is available
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
    if (!DEEPGRAM_API_KEY) {
      logger.error("DEEPGRAM_API_KEY is not set - cannot use Deepgram STT", {
        callSid,
        callSessionId,
      });
      
      // Fallback to Twilio Gather
      if (twilioClient && callSid) {
        try {
          const fallbackResponse = new twilio.twiml.VoiceResponse();
          const gatherLanguage = language === "he" ? "he-IL" : (language || "he-IL");
          const REGION = "us-central1";
          const PROJECT_ID = process.env.GCLOUD_PROJECT;
          const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;
          
          fallbackResponse.say(
            {voice: finalVoiceId, language: sayLanguage},
            "מעבר למערכת זיהוי דיבור חלופית."
          );
          
          const gather = fallbackResponse.gather({
            input: "speech",
            action: `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`,
            method: "POST",
            timeout: 10,
            speechTimeout: "auto",
            language: gatherLanguage,
            hints: "",
            profanityFilter: false,
            enhanced: true,
          });
          
          gather.say({voice: finalVoiceId, language: sayLanguage}, "");
          
          await twilioClient.calls(callSid).update({
            twiml: fallbackResponse.toString(),
          });
          
          logger.info("Fallback to Twilio Gather - DEEPGRAM_API_KEY not set", {
            callSid,
            callSessionId,
          });
          
          res.status(200).send("OK - Fallback to Twilio Gather");
          return;
        } catch (fallbackError) {
          logger.error("Failed to fallback to Twilio Gather", {
            error: fallbackError.message,
            callSid,
            callSessionId,
          });
          res.status(500).send("Failed to initialize STT");
          return;
        }
      } else {
        res.status(500).send("DEEPGRAM_API_KEY not set and cannot fallback");
        return;
      }
    }

    // Normalize language for Deepgram (he-IL → he)
    const deepgramLanguage = language === "he" || language?.startsWith("he") ? "he" : 
                            language === "en" || language?.startsWith("en") ? "en" : 
                            language === "ar" || language?.startsWith("ar") ? "ar" : "he";

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
        stack: error.stack,
        callSid,
        callSessionId,
        hasApiKey: !!process.env.DEEPGRAM_API_KEY,
      });
      
      // Try to fallback to Twilio Gather by redirecting the call
      // Note: This requires updating the call via REST API
      if (twilioClient && callSid) {
        try {
          const twilio = require("twilio");
          const fallbackResponse = new twilio.twiml.VoiceResponse();
          const gatherLanguage = language === "he" ? "he-IL" : (language || "he-IL");
          const REGION = "us-central1";
          const PROJECT_ID = process.env.GCLOUD_PROJECT;
          const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;
          
          fallbackResponse.say(
            {voice: finalVoiceId, language: sayLanguage},
            "מעבר למערכת זיהוי דיבור חלופית."
          );
          
          const gather = fallbackResponse.gather({
            input: "speech",
            action: `${BASE_FUNCTION_URL}/twilioGatherCallback?callSessionId=${callSessionId}`,
            method: "POST",
            timeout: 10,
            speechTimeout: "auto",
            language: gatherLanguage,
            hints: "",
            profanityFilter: false,
            enhanced: true,
          });
          
          gather.say({voice: finalVoiceId, language: sayLanguage}, "");
          
          await twilioClient.calls(callSid).update({
            twiml: fallbackResponse.toString(),
          });
          
          logger.info("Fallback to Twilio Gather after Deepgram failure", {
            callSid,
            callSessionId,
          });
          
          res.status(200).send("OK - Fallback to Twilio Gather");
          return;
        } catch (fallbackError) {
          logger.error("Failed to fallback to Twilio Gather", {
            error: fallbackError.message,
            callSid,
            callSessionId,
          });
        }
      }
      
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
        stack: error.stack,
        callSid,
        callSessionId,
      });
      if (deepgramConnection) {
        try {
          deepgramService.closeDeepgramConnection(deepgramConnection);
        } catch (closeError) {
          logger.warn("Error closing Deepgram connection", {
            error: closeError.message,
            callSid,
          });
        }
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
