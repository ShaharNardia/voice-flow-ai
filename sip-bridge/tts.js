/**
 * tts.js
 * Text-to-Speech helper — converts <Say> text to mulaw-8kHz audio buffer.
 * Uses Google Cloud TTS (same provider as the rest of the system).
 */
const tts = require('@google-cloud/text-to-speech');
const client = new tts.TextToSpeechClient();

const LANGUAGE     = process.env.TTS_LANGUAGE || 'he-IL';
const VOICE_NAME   = process.env.TTS_VOICE    || 'he-IL-Wavenet-D';

// Simple in-memory cache — avoids re-synthesizing identical phrases
const cache = new Map();
const CACHE_MAX = 100;

/**
 * Returns raw mulaw (PCMU) 8kHz audio as a Buffer.
 */
async function synthesize(text, language = LANGUAGE, voiceName = VOICE_NAME) {
  const key = `${language}|${voiceName}|${text}`;
  if (cache.has(key)) return cache.get(key);

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: language, name: voiceName },
    audioConfig: {
      audioEncoding: 'MULAW',
      sampleRateHertz: 8000,
    },
  });

  const buf = Buffer.from(response.audioContent);

  // Evict oldest entry when cache is full
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, buf);
  return buf;
}

module.exports = { synthesize };
