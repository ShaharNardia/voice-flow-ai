const {logger} = require("firebase-functions");
const {createClient} = require("@deepgram/sdk");

/**
 * Deepgram STT Service
 * Handles real-time speech-to-text using Deepgram WebSocket API
 */

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Convert language code to Deepgram format
 * Deepgram uses base language codes (he, en, ar) not full codes (he-IL, en-US)
 * @param {string} language - Language code (e.g., "he-IL", "en-US", "he", "en")
 * @returns {string} Base language code for Deepgram (e.g., "he", "en", "ar")
 */
function normalizeLanguageForDeepgram(language) {
  if (!language) return "he"; // Default to Hebrew
  
  const lang = language.toLowerCase();
  if (lang.startsWith("he")) return "he";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ar")) return "ar";
  
  // Default to Hebrew for unknown languages
  return "he";
}

/**
 * Create a Deepgram WebSocket connection for real-time STT
 * @param {string} language - Language code (e.g., "he", "he-IL", "en", "en-US")
 * @param {string} model - Deepgram model (e.g., "nova-2", "nova-3")
 * @param {Function} onTranscript - Callback when transcript is received
 * @param {Function} onError - Error callback
 * @returns {Object} Deepgram connection object
 */
function createDeepgramConnection(language = "he", model = "nova-2", onTranscript, onError) {
  if (!DEEPGRAM_API_KEY) {
    logger.error("DEEPGRAM_API_KEY is not set");
    throw new Error("DEEPGRAM_API_KEY is required");
  }

  // Normalize language code for Deepgram (he-IL → he, en-US → en)
  const deepgramLanguage = normalizeLanguageForDeepgram(language);

  const deepgram = createClient(DEEPGRAM_API_KEY);

  // Create WebSocket connection with optimized settings for low latency and barge-in
  const connection = deepgram.listen.live({
    model: model,
    language: deepgramLanguage,
    smart_format: true,
    interim_results: true,
    endpointing: 300, // End of speech detection (ms) - lower = faster detection
    vad_events: true, // Voice activity detection - enables barge-in detection
    punctuate: true, // Add punctuation for better accuracy
    diarize: false, // Speaker diarization not needed for single speaker
    multichannel: false, // Single channel audio
  });

  logger.info("Deepgram connection created", {
    originalLanguage: language,
    deepgramLanguage,
    model,
  });

  // Handle transcript events
  connection.on("transcript", (data) => {
    try {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const isFinal = data.is_final || false;
      const confidence = data.channel?.alternatives?.[0]?.confidence || 0;

      if (transcript && transcript.trim()) {
        logger.info("Deepgram transcript received", {
          transcript,
          isFinal,
          confidence,
        });

        if (onTranscript) {
          onTranscript({
            text: transcript,
            isFinal,
            confidence,
          });
        }
      }
    } catch (error) {
      logger.error("Error processing Deepgram transcript", error);
      if (onError) {
        onError(error);
      }
    }
  });

  // Handle errors
  connection.on("error", (error) => {
    logger.error("Deepgram connection error", error);
    if (onError) {
      onError(error);
    }
  });

  // Handle close
  connection.on("close", () => {
    logger.info("Deepgram connection closed");
  });

  return connection;
}

/**
 * Process audio chunk through Deepgram
 * @param {Object} connection - Deepgram connection object
 * @param {Buffer} audioChunk - Audio data chunk
 */
function sendAudioToDeepgram(connection, audioChunk) {
  if (connection && connection.send) {
    connection.send(audioChunk);
  } else {
    logger.warn("Deepgram connection not ready or invalid");
  }
}

/**
 * Close Deepgram connection
 * @param {Object} connection - Deepgram connection object
 */
function closeDeepgramConnection(connection) {
  if (connection && connection.finish) {
    connection.finish();
  }
}

module.exports = {
  createDeepgramConnection,
  sendAudioToDeepgram,
  closeDeepgramConnection,
};
