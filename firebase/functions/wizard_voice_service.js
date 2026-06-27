/**
 * Voice Wizard — speech I/O wrapper around the existing wizardChat brain.
 *
 * Endpoints:
 *   POST /wizardSTT  { audioBase64, mimeType?, language? }  → { transcript }
 *   POST /wizardTTS  { text, voiceId?, language? }          → audio/mpeg bytes
 *
 * The conversational logic (LLM, tool calls, draft state, finalize) stays in
 * wizardChat — these endpoints just bridge browser audio to text and back.
 * Frontend flow: mic → wizardSTT → wizardChat → wizardTTS → speaker.
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const axios = require("axios");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const REGION = "us-central1";

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

function normalizeDeepgramLang(language) {
  if (!language) return "multi";
  const lang = String(language).toLowerCase();
  if (lang.startsWith("he")) return "he";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ar")) return "ar";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("de")) return "de";
  return "multi";
}

// Default ElevenLabs voice — Rachel, multilingual.
const DEFAULT_ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM";

// ── STT: Deepgram prerecorded transcription ──────────────────────────────

exports.wizardSTT = onRequest(
  { region: REGION, timeoutSeconds: 30, ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

    const uid = await extractUidFromRequest(req).catch(() => null);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { audioBase64, mimeType, language } = req.body || {};
    if (!audioBase64) { res.status(400).json({ error: "audioBase64 required" }); return; }

    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) { res.status(500).json({ error: "DEEPGRAM_API_KEY not configured" }); return; }

    try {
      const audio = Buffer.from(audioBase64, "base64");
      const lang = normalizeDeepgramLang(language);
      const params = new URLSearchParams({
        model: "nova-2",
        smart_format: "true",
        punctuate: "true",
        language: lang,
      });
      const r = await axios.post(
        `https://api.deepgram.com/v1/listen?${params}`,
        audio,
        {
          headers: {
            Authorization: `Token ${key}`,
            "Content-Type": mimeType || "audio/webm",
          },
          timeout: 25_000,
          maxContentLength: 10 * 1024 * 1024,
        },
      );
      const transcript = r.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      const confidence = r.data?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? null;
      res.json({ transcript, confidence, language: lang });
    } catch (e) {
      logger.error("wizardSTT failed", e?.response?.data || e.message);
      res.status(500).json({ error: e.message, details: e?.response?.data });
    }
  },
);

// ── TTS: ElevenLabs streaming ────────────────────────────────────────────

exports.wizardTTS = onRequest(
  { region: REGION, timeoutSeconds: 30, ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

    const uid = await extractUidFromRequest(req).catch(() => null);
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { text, voiceId, modelId } = req.body || {};
    if (!text) { res.status(400).json({ error: "text required" }); return; }

    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) { res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" }); return; }

    try {
      const voice = voiceId || DEFAULT_ELEVEN_VOICE;
      const model = modelId || "eleven_multilingual_v2";
      const r = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
        {
          text: String(text).slice(0, 4000),
          model_id: model,
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1 },
        },
        {
          headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          responseType: "arraybuffer",
          timeout: 25_000,
        },
      );
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(Buffer.from(r.data));
    } catch (e) {
      const detail = e?.response?.data
        ? Buffer.isBuffer(e.response.data) ? e.response.data.toString("utf8") : e.response.data
        : null;
      logger.error("wizardTTS failed", detail || e.message);
      res.status(500).json({ error: e.message, details: detail });
    }
  },
);
