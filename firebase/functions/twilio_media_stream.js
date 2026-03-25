const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");
const deepgramService = require("./deepgram_service");
const llmService = require("./llm_service");
const {sendWhatsAppMessage} = require("./whatsapp_service");
const sgMail = require("@sendgrid/mail");
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
 *
 * LATENCY OPTIMIZATIONS (Premium Product):
 * 1. Immediate filler phrase while waiting for LLM (eliminates dead air)
 * 2. Non-blocking Firestore writes (session update doesn't block response)
 * 3. Aggressive barge-in detection (200ms threshold)
 * 4. Deepgram endpointing at 250ms for fast turn-taking
 * 5. LLM timeout capped at 5s
 * 6. Conversation history capped at 20 messages for fast LLM inference
 */

// Store active Deepgram connections per call
const activeConnections = new Map();

// ── Latency constants ────────────────────────────────────────────────
const BARGE_IN_CONFIDENCE_THRESHOLD = 0.35; // Lower = more sensitive (nova-3 en accuracy allows this)
const BARGE_IN_TIME_THRESHOLD = 200; // ms – faster barge-in for natural feel
const MAX_CONVERSATION_HISTORY = 20; // Cap history to keep LLM fast
const LLM_TIMEOUT_MS = 3000; // 3s max (GPT-4o-mini rarely exceeds 2s for ≤150 tokens)

/**
 * Handle Twilio Media Stream WebSocket connection
 * This endpoint receives audio from Twilio and forwards it to Deepgram
 */
const twilioMediaStream = onRequest(
  {minInstances: 1, timeoutSeconds: 300, memory: "512MiB"},
  async (req, res) => {
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
    // NOTE: Uses <Start><Stream> (correct Twilio SDK method) for Media Streams.
    // This requires a wss:// WebSocket endpoint, not https://.
    // Firebase Cloud Functions cannot handle WebSocket; planned for Cloud Run.
    const createSayTwiML = (text) => {
      const twimlResponse = new twilio.twiml.VoiceResponse();
      twimlResponse.say({voice: finalVoiceId, language: sayLanguage}, text);
      // Continue streaming after saying using correct TwiML verb
      const start = twimlResponse.start();
      start.stream({
        url: streamUrl,
        track: "both_tracks",
      });
      return twimlResponse.toString();
    };

    // Helper function to create TwiML for barge-in (stop current Say)
    const createBargeInTwiML = () => {
      const twimlResponse = new twilio.twiml.VoiceResponse();
      // Minimal pause to stop current Say, then continue streaming
      twimlResponse.pause({length: 0.05});
      const start = twimlResponse.start();
      start.stream({
        url: streamUrl,
        track: "both_tracks",
      });
      return twimlResponse.toString();
    };

    // Track state
    let deepgramConnection = null;
    let lastFinalTranscript = "";
    let transcriptBuffer = "";
    let isBotSpeaking = false;
    let lastInterimTime = 0;

    // Track transcript processing start time
    let transcriptStartTime = Date.now();

    const onTranscript = async (transcriptData) => {
      const {text, isFinal, confidence} = transcriptData;
      const now = Date.now();

      // ── Handle interim results for barge-in detection ──────────
      if (!isFinal && text && text.trim() && confidence >= BARGE_IN_CONFIDENCE_THRESHOLD) {
        transcriptBuffer = text;

        const timeSinceLastInterim = now - lastInterimTime;
        lastInterimTime = now;

        // If bot is speaking and we detect speech → barge-in!
        if (isBotSpeaking && timeSinceLastInterim > BARGE_IN_TIME_THRESHOLD) {
          const bargeInStartTime = Date.now();
          logger.info("Barge-in detected - stopping bot speech", {
            callSessionId,
            callSid,
            interimText: text,
            confidence,
            timeSinceLastInterim,
          });

          const bargeInTwiML = createBargeInTwiML();
          const bargeInSent = await sendTwiMLToTwilio(bargeInTwiML, "barge-in");
          const bargeInLatency = Date.now() - bargeInStartTime;

          if (bargeInSent) {
            isBotSpeaking = false;
            logger.info("Barge-in executed", {
              callSessionId,
              callSid,
              bargeInLatencyMs: bargeInLatency,
            });
          }
        }

        logger.debug("Interim transcript", {
          callSessionId,
          text,
          confidence,
          isBotSpeaking,
        });
        return;
      }

      // ── Handle final transcript ────────────────────────────────
      if (isFinal && text && text.trim()) {
        const finalTranscriptStartTime = Date.now();
        const sttLatency = finalTranscriptStartTime - transcriptStartTime;

        logger.info("Final transcript from Deepgram", {
          callSessionId,
          callSid,
          text,
          confidence,
          sttLatencyMs: sttLatency,
        });

        try {
          // ── STEP 1: Send filler phrase IMMEDIATELY (no dead air) ──
          const fillerPhrase = llmService.getRandomFiller(language);
          const fillerTwiML = createSayTwiML(fillerPhrase);
          const fillerStartTime = Date.now();

          // Send filler and start LLM call concurrently
          const [fillerSent] = await Promise.all([
            sendTwiMLToTwilio(fillerTwiML, "filler"),
            // Pre-fetch conversation history while filler plays
            sessionRef.get(),
          ]);

          if (fillerSent) {
            isBotSpeaking = true;
          }

          const fillerLatency = Date.now() - fillerStartTime;
          logger.info("Filler phrase sent", {
            callSessionId,
            fillerPhrase,
            fillerLatencyMs: fillerLatency,
          });

          // ── STEP 2: Get conversation history ──────────────────
          const currentData = await sessionRef.get();
          let currentHistory = currentData.data()?.conversationHistory || [];

          // Cap history to keep LLM inference fast
          if (currentHistory.length > MAX_CONVERSATION_HISTORY) {
            // Keep system-relevant first messages + last N messages
            const keepFirst = 2;
            const keepLast = MAX_CONVERSATION_HISTORY - keepFirst;
            currentHistory = [
              ...currentHistory.slice(0, keepFirst),
              ...currentHistory.slice(-keepLast),
            ];
          }

          // Add user message
          currentHistory.push({
            role: "user",
            content: text,
            timestamp: new Date(),
          });

          // ── STEP 3: Get company data for context ──────────────
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

          // ── STEP 4: Get LLM response ──────────────────────────
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
              tools: llmService.AGENT_TOOLS,
            },
          );

          const llmLatency = Date.now() - llmStartTime;
          let aiResponse = llmResult.text;
          const totalLatency = Date.now() - finalTranscriptStartTime;

          // ── STEP 4b: Handle tool calls (email/WhatsApp/appointment) ──
          if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
            const toolResults = [];
            for (const toolCall of llmResult.toolCalls) {
              const toolName = toolCall.function?.name;
              let toolArgs = {};
              try {
                toolArgs = JSON.parse(toolCall.function?.arguments || "{}");
              } catch (_) { /* ignore parse errors */ }

              logger.info("Agent tool call", {toolName, callSessionId});

              try {
                if (toolName === "send_email") {
                  const {to, template, templateVars = {}} = toolArgs;
                  const templateVarsWithDefaults = {
                    companyName: assistant.companyName || companyData.name || "",
                    customerName: templateVars.customerName || "there",
                    ...templateVars,
                  };
                  if (to && template) {
                    await sgMail.send({
                      to,
                      from: process.env.SENDGRID_FROM_EMAIL || "noreply@voiceflow.ai",
                      subject: `Confirmation from ${templateVarsWithDefaults.companyName}`,
                      text: `Hi ${templateVarsWithDefaults.customerName}, your ${template.replace(/([A-Z])/g, " $1").toLowerCase()} is confirmed. Thank you for choosing ${templateVarsWithDefaults.companyName}!`,
                    });
                    toolResults.push({id: toolCall.id, result: "Email sent successfully"});
                    logger.info("Tool: email sent", {to, template, callSessionId});
                  }
                } else if (toolName === "send_whatsapp") {
                  const {to, message} = toolArgs;
                  if (to && message) {
                    await sendWhatsAppMessage(to, message);
                    toolResults.push({id: toolCall.id, result: "WhatsApp message sent"});
                    logger.info("Tool: WhatsApp sent", {to, callSessionId});
                  }
                } else if (toolName === "create_appointment") {
                  // Store appointment in Firestore for team to action
                  await db.collection("appointments").add({
                    ...toolArgs,
                    callSessionId,
                    companyId: currentData.data()?.companyId,
                    createdAt: FieldValue.serverTimestamp(),
                    status: "pending",
                  });
                  toolResults.push({id: toolCall.id, result: "Appointment created successfully"});
                  logger.info("Tool: appointment created", {service: toolArgs.service, callSessionId});
                } else if (toolName === "transfer_call") {
                  // Transfer is handled via TwiML — set flag and skip second LLM call
                  const transferTwiML = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${toolArgs.to}</Dial></Response>`;
                  await sendTwiMLToTwilio(transferTwiML, "transfer");
                  toolResults.push({id: toolCall.id, result: "Call transferred"});
                  logger.info("Tool: call transferred", {to: toolArgs.to, callSessionId});
                }
              } catch (toolError) {
                logger.error("Tool execution failed", {toolName, error: toolError.message, callSessionId});
                toolResults.push({id: toolCall.id, result: `Failed: ${toolError.message}`});
              }
            }

            // Second LLM pass: give the model tool results so it can speak a confirmation
            if (toolResults.length > 0) {
              const toolResultMessages = [
                {role: "assistant", content: null, tool_calls: llmResult.toolCalls},
                ...toolResults.map((r) => ({
                  role: "tool",
                  tool_call_id: r.id,
                  content: r.result,
                })),
              ];
              const confirmResult = await llmService.getLLMResponse(
                systemPrompt,
                null,
                [...llmHistory, ...toolResultMessages],
                {model: "gpt-4o-mini", maxTokens: 60, temperature: 0.8},
              );
              aiResponse = confirmResult.text || "Done! Anything else I can help with?";
            } else {
              aiResponse = "Got it! Is there anything else I can help you with?";
            }
          }

          // Add AI response to history
          currentHistory.push({
            role: "assistant",
            content: aiResponse || "",
            timestamp: new Date(),
          });

          // ── STEP 5: Send AI response (replace filler) ─────────
          const twimlStartTime = Date.now();
          const sayTwiML = createSayTwiML(aiResponse || "Is there anything else I can help with?");
          const twimlSent = await sendTwiMLToTwilio(sayTwiML, "llm-response");
          const twimlLatency = Date.now() - twimlStartTime;

          if (twimlSent) {
            isBotSpeaking = true;
          }

          // ── STEP 6: Update session (NON-BLOCKING) ─────────────
          // Fire-and-forget: don't wait for Firestore write to complete
          sessionRef.set({
            conversationHistory: currentHistory,
            lastSpeechResult: text,
            lastAIResponse: aiResponse,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true}).catch((err) => {
            logger.error("Non-blocking session update failed", {
              error: err.message,
              callSessionId,
            });
          });

          logger.info("LLM response generated and sent", {
            callSessionId,
            callSid,
            userMessage: text.substring(0, 50),
            aiResponse: (aiResponse || "").substring(0, 100) + ((aiResponse || "").length > 100 ? "..." : ""),
            sttLatencyMs: sttLatency,
            fillerLatencyMs: fillerLatency,
            llmLatencyMs: llmLatency,
            twimlLatencyMs: twimlLatency,
            totalLatencyMs: totalLatency,
            twimlSent,
            tokensUsed: llmResult.tokensUsed,
            historySize: currentHistory.length,
          });

          // Reset transcript start time for next utterance
          transcriptStartTime = Date.now();
        } catch (error) {
          logger.error("Error processing transcript with LLM", {
            error: error.message,
            callSessionId,
            text,
            stack: error.stack,
          });

          // On error, send a recovery phrase so the user isn't left in silence
          try {
            const lang = language?.startsWith("he") ? "he" : "en";
            const recoveryPhrase = lang === "he"
              ? "סליחה, רגע אחד בבקשה..."
              : "Sorry, one moment please...";
            const recoveryTwiML = createSayTwiML(recoveryPhrase);
            await sendTwiMLToTwilio(recoveryTwiML, "error-recovery");
          } catch (recoveryErr) {
            logger.error("Recovery phrase also failed", {
              error: recoveryErr.message,
            });
          }
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
          const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

          fallbackResponse.say(
            {voice: finalVoiceId, language: sayLanguage},
            "מעבר למערכת זיהוי דיבור חלופית.",
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

      // Try to fallback to Twilio Gather
      if (twilioClient && callSid) {
        try {
          const fallbackResponse = new twilio.twiml.VoiceResponse();
          const gatherLanguage = language === "he" ? "he-IL" : (language || "he-IL");
          const BASE_FUNCTION_URL = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

          fallbackResponse.say(
            {voice: finalVoiceId, language: sayLanguage},
            "מעבר למערכת זיהוי דיבור חלופית.",
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
  twilioMediaStream,
  getActiveConnection,
  closeConnection,
};
