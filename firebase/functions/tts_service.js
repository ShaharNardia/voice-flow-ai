const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const axios = require("axios");
const {TextToSpeechClient} = require("@google-cloud/text-to-speech");

const googleTtsClient = new TextToSpeechClient();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const PROVIDERS = new Set(["google", "azure", "elevenlabs"]);

let googleVoicesCache = null;
let azureVoicesCache = null;
let elevenVoicesCache = null;

function now() {
  return Date.now();
}

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (req.method === "GET") {
    return req.query || {};
  }
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      logger.warn("Failed to parse JSON body", error);
      return {};
    }
  }
  return req.body;
}

function validateProvider(provider) {
  if (!provider || !PROVIDERS.has(provider)) {
    throw new Error(
      `Unsupported provider. Expected one of: ${Array.from(PROVIDERS).join(", ")}.`,
    );
  }
  return provider;
}

function escapeSsml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function listGoogleVoices() {
  if (googleVoicesCache && googleVoicesCache.expiresAt > now()) {
    return googleVoicesCache.value;
  }
  const [response] = await googleTtsClient.listVoices();
  const voices = (response.voices || [])
    .filter((voice) => (voice.languageCodes || []).includes("he-IL"))
    .map((voice) => ({
      id: voice.name,
      name: voice.name,
      languageCode: "he-IL",
      gender: voice.ssmlGender || "NEUTRAL",
      naturalSampleRateHertz: voice.naturalSampleRateHertz || null,
      description: voice.name.includes("Wavenet")
        ? "Google Neural Wavenet voice"
        : "Google standard neural voice",
    }));
  googleVoicesCache = {
    value: voices,
    expiresAt: now() + CACHE_TTL_MS,
  };
  return voices;
}

async function listAzureVoices() {
  if (azureVoicesCache && azureVoicesCache.expiresAt > now()) {
    return azureVoicesCache.value;
  }
  const apiKey = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!apiKey || !region) {
    throw new Error(
      "Azure Text-to-Speech configuration missing. Set AZURE_TTS_KEY and AZURE_TTS_REGION.",
    );
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
  const response = await axios.get(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });
  const voices = (response.data || [])
    .filter((voice) =>
      typeof voice.Locale === "string" && voice.Locale.toLowerCase() === "he-il",
    )
    .map((voice) => ({
      id: voice.ShortName,
      name: voice.LocalName || voice.DisplayName || voice.ShortName,
      languageCode: voice.Locale,
      gender: voice.Gender,
      styleList: voice.StyleList || [],
      sampleRateHertz: voice.SampleRateHertz ? Number(voice.SampleRateHertz) : null,
    }));
  azureVoicesCache = {
    value: voices,
    expiresAt: now() + CACHE_TTL_MS,
  };
  return voices;
}

async function listElevenLabsVoices() {
  if (elevenVoicesCache && elevenVoicesCache.expiresAt > now()) {
    return elevenVoicesCache.value;
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is required.");
  }
  const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });
  const voicesRaw = response.data?.voices || response.data || [];
  const voices = voicesRaw
    .filter((voice) => {
      const languages = voice.available_languages || voice.languages || [];
      return languages.some((lang) => {
        const languageId = (lang.language_id || lang.id || lang).toLowerCase();
        return languageId.startsWith("he");
      });
    })
    .map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      languageCode: "he",
      category: voice.category || null,
      description:
        voice.description ||
        (Array.isArray(voice.labels)
          ? voice.labels.join(", ")
          : voice.labels?.language || "ElevenLabs neural voice"),
      previewUrl: voice.preview_url || null,
      settings: voice.settings || null,
    }));
  elevenVoicesCache = {
    value: voices,
    expiresAt: now() + CACHE_TTL_MS,
  };
  return voices;
}

async function synthesizeWithGoogle({text, voiceId, speakingRate, pitch}) {
  if (!voiceId) {
    throw new Error("voiceId is required for Google TTS synthesize.");
  }
  const request = {
    input: {text},
    voice: {
      languageCode: "he-IL",
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: speakingRate || 1.0,
      pitch: pitch || 0.0,
    },
  };
  const [response] = await googleTtsClient.synthesizeSpeech(request);
  return {
    audioContent: response.audioContent,
    audioEncoding: "mp3",
    sampleRateHertz: response.audioConfig?.sampleRateHertz || 24000,
  };
}

async function synthesizeWithAzure({text, voiceId, speakingRate, style}) {
  const apiKey = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!apiKey || !region) {
    throw new Error(
      "Azure Text-to-Speech configuration missing. Set AZURE_TTS_KEY and AZURE_TTS_REGION.",
    );
  }
  if (!voiceId) {
    throw new Error("voiceId is required for Azure TTS synthesize.");
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const prosodyAttrs = [];
  if (speakingRate) {
    prosodyAttrs.push(`rate='${speakingRate}'`);
  }
  const styleOpen = style ? `<mstts:express-as style='${style}'>` : "";
  const styleClose = style ? "</mstts:express-as>" : "";
  const ssml =
    "<speak version='1.0' xml:lang='he-IL' xmlns:mstts='https://www.w3.org/2001/mstts'>" +
    `<voice xml:lang='he-IL' name='${voiceId}'>` +
    (prosodyAttrs.length > 0
      ? `<prosody ${prosodyAttrs.join(" ")}>${styleOpen}${escapeSsml(text)}${styleClose}</prosody>`
      : `${styleOpen}${escapeSsml(text)}${styleClose}`) +
    "</voice></speak>";
  const response = await axios.post(url, ssml, {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    responseType: "arraybuffer",
  });
  return {
    audioContent: Buffer.from(response.data, "binary").toString("base64"),
    audioEncoding: "mp3",
    sampleRateHertz: 24000,
  };
}

async function synthesizeWithElevenLabs({text, voiceId, modelId, optimizeStreamingLatency, voiceSettings}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is required.");
  }
  if (!voiceId) {
    throw new Error("voiceId is required for ElevenLabs synthesize.");
  }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const payload = {
    text,
    model_id: modelId || "eleven_turbo_v2_5",
    optimize_streaming_latency: optimizeStreamingLatency ?? 1,
    voice_settings: voiceSettings || undefined,
    output_format: "mp3_22050_32",
  };
  const response = await axios.post(url, payload, {
    headers: {
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    },
    responseType: "arraybuffer",
  });
  return {
    audioContent: Buffer.from(response.data, "binary").toString("base64"),
    audioEncoding: "mp3",
    sampleRateHertz: 22050,
  };
}

exports.listTtsVoices = onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  try {
    const body = parseBody(req);
    const provider = validateProvider((body.provider || body.providerId || "").toLowerCase());
    let voices;
    let cached = false;
    if (provider === "google") {
      cached = !!(googleVoicesCache && googleVoicesCache.expiresAt > now());
      voices = await listGoogleVoices();
    } else if (provider === "azure") {
      cached = !!(azureVoicesCache && azureVoicesCache.expiresAt > now());
      voices = await listAzureVoices();
    } else {
      cached = !!(elevenVoicesCache && elevenVoicesCache.expiresAt > now());
      voices = await listElevenLabsVoices();
    }
    res.status(200).json({
      status: "success",
      provider,
      voices,
      count: voices.length,
      cached,
    });
  } catch (error) {
    logger.error("listTtsVoices failed", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to list voices",
    });
  }
});

exports.synthesizeTts = onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({
      status: "error",
      message: "Method not allowed. Use POST.",
    });
    return;
  }
  const startedAt = now();
  try {
    const body = parseBody(req);
    const provider = validateProvider((body.provider || body.providerId || "").toLowerCase());
    const voiceId = body.voiceId || body.voice || null;
    const text = body.text || "שלום! זהו קטע הדגמה של מערכת הטקסט לדיבור שלנו.";
    const options = body.options || {};

    let result;
    if (provider === "google") {
      result = await synthesizeWithGoogle({
        text,
        voiceId,
        speakingRate: body.speakingRate || options.speakingRate,
        pitch: body.pitch || options.pitch,
      });
    } else if (provider === "azure") {
      result = await synthesizeWithAzure({
        text,
        voiceId,
        speakingRate: body.speakingRate || options.speakingRate,
        style: body.style || options.style,
      });
    } else {
      result = await synthesizeWithElevenLabs({
        text,
        voiceId,
        modelId: body.modelId || options.modelId,
        optimizeStreamingLatency:
          body.optimizeStreamingLatency ?? options.optimizeStreamingLatency,
        voiceSettings: body.voiceSettings || options.voiceSettings,
      });
    }

    const elapsedMs = now() - startedAt;
    res.status(200).json({
      status: "success",
      provider,
      voiceId,
      audioEncoding: result.audioEncoding,
      audioContent: result.audioContent,
      sampleRateHertz: result.sampleRateHertz,
      latencyMs: elapsedMs,
    });
  } catch (error) {
    logger.error("synthesizeTts failed", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to synthesize speech",
    });
  }
});
