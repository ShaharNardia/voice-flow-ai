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
  if (!language) return "en"; // Default to English

  const lang = language.toLowerCase();
  if (lang.startsWith("he")) return "he";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ar")) return "ar";
  if (lang.startsWith("el")) return "el";
  if (lang.startsWith("af")) return "af";
  if (lang.startsWith("zu")) return "zu";

  // Default to English for unknown languages
  return "en";
}

/**
 * Create a Deepgram WebSocket connection for real-time STT
 * @param {string} language - Language code (e.g., "he", "he-IL", "en", "en-US")
 * @param {string} model - Deepgram model (e.g., "nova-2", "nova-3")
 * @param {Function} onTranscript - Callback when transcript is received
 * @param {Function} onError - Error callback
 * @returns {Object} Deepgram connection object
 */
function createDeepgramConnection(language = "en", model = null, onTranscript, onError) {
  if (!DEEPGRAM_API_KEY) {
    logger.error("DEEPGRAM_API_KEY is not set");
    throw new Error("DEEPGRAM_API_KEY is required");
  }

  // Normalize language code for Deepgram (he-IL → he, en-US → en)
  const deepgramLanguage = normalizeLanguageForDeepgram(language);

  // Language-specific model and VAD settings for optimal latency
  // English: nova-3 (most accurate), tighter VAD for faster turn-taking
  // Hebrew: nova-2 (nova-3 causes APPLICATION ERROR with he-IL on Twilio)
  const resolvedModel = model || (deepgramLanguage === "en" ? "nova-3" : "nova-2");
  // Relaxed VAD settings to prevent cutting off natural speech pauses
  // Previous values were too aggressive and dropped words during hesitations
  const utteranceEndMs = deepgramLanguage === "en" ? 800 : 1000;
  const vadTurnoff = deepgramLanguage === "en" ? 500 : 700;

  const deepgram = createClient(DEEPGRAM_API_KEY);

  // Create WebSocket connection with AGGRESSIVE low-latency settings
  // Tuned for premium real-time voice bot experience
  const connection = deepgram.listen.live({
    model: resolvedModel,
    language: deepgramLanguage,
    smart_format: true,
    interim_results: true, // Critical for barge-in detection
    utterance_end_ms: utteranceEndMs, // English: 600ms, Hebrew: 800ms
    endpointing: 300, // End of speech detection (ms) - balanced: captures full utterances without long delay (was 150)
    vad_events: true, // Voice activity detection – enables barge-in
    vad_turnoff: vadTurnoff, // English: 300ms, Hebrew: 500ms
    punctuate: true, // Better accuracy with punctuation
    diarize: false, // Single speaker – no need
    multichannel: false, // Single channel audio
    encoding: "mulaw", // Twilio sends mulaw audio
    sample_rate: 8000, // Twilio sends 8kHz audio
    channels: 1, // Mono audio
  });

  // Track connection readiness and buffer early audio
  let isReady = false;
  const audioBuffer = [];

  connection.on("open", () => {
    isReady = true;
    logger.info("Deepgram connection READY — flushing buffered audio", {
      bufferedChunks: audioBuffer.length,
    });
    // Flush any audio that arrived before connection was ready
    while (audioBuffer.length > 0) {
      const chunk = audioBuffer.shift();
      if (connection.send) connection.send(chunk);
    }
  });

  // Return a wrapper that tracks state without monkey-patching the SDK object
  const wrapper = {
    connection,
    isReady: () => isReady,
    buffer: audioBuffer,
    send: (chunk) => connection.send ? connection.send(chunk) : null,
    finish: () => connection.finish ? connection.finish() : null,
  };

  logger.info("Deepgram connection created (waiting for open event)", {
    originalLanguage: language,
    deepgramLanguage,
    model: resolvedModel,
    utteranceEndMs,
    vadTurnoff,
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

  return wrapper;
}

/**
 * Process audio chunk through Deepgram
 * @param {Object} wrapper - Deepgram connection wrapper (from createDeepgramConnection)
 * @param {Buffer} audioChunk - Audio data chunk
 */
function sendAudioToDeepgram(wrapper, audioChunk) {
  if (!wrapper) {
    logger.warn("Deepgram wrapper is null");
    return;
  }
  // If connection not ready yet, buffer the audio (prevents losing first words)
  if (wrapper.isReady && !wrapper.isReady()) {
    wrapper.buffer.push(audioChunk);
    return;
  }
  if (wrapper.send) {
    wrapper.send(audioChunk);
  } else {
    logger.warn("Deepgram wrapper has no send method");
  }
}

/**
 * Close Deepgram connection
 * @param {Object} connection - Deepgram connection object
 */
function closeDeepgramConnection(wrapper) {
  if (wrapper && wrapper.finish) {
    wrapper.finish();
  }
}

module.exports = {
  createDeepgramConnection,
  sendAudioToDeepgram,
  closeDeepgramConnection,
};
