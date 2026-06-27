/**
 * Bench service — Phase 1 validation harness for STT/TTS provider benchmarking.
 *
 * Endpoints:
 *   POST /benchSttRun       Run an audio clip through N STT providers in parallel
 *   POST /benchTtsGenerate  Generate the same text via N TTS providers/voices
 *   POST /benchScore        Persist a human rating (Naturalness / Intelligibility / Accent)
 *   GET  /benchUploadUrl    Get a GCS signed URL for direct browser uploads
 *
 * Data model (Firestore):
 *   bench_runs/{runId}      { kind:"stt"|"tts", language, audioUrl?, text?, results[], createdAt }
 *   bench_ratings/{id}      { runId, provider, voiceId?, dimension, score, listenerEmail, createdAt }
 *
 * All audio goes to GCS bucket `voiceflow-bench` under audio/{stt|tts}/{runId}/{provider}.{ext}.
 */

"use strict";

const {onRequest}     = require("firebase-functions/v2/https");
const {defineSecret}  = require("firebase-functions/params");
const {logger}        = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage}    = require("firebase-admin/storage");
const https           = require("https");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Keys come from .env (set via firebase deploy or local .env).
// Bench uses BENCH_* env var names to avoid colliding with the plain
// OPENAI_API_KEY / DEEPGRAM_API_KEY entries that other functions need.
// Add to firebase/functions/.env :
//    BENCH_OPENAI_KEY=sk-...
//    BENCH_ELEVEN_KEY=sk_...
//    BENCH_DEEPGRAM_KEY=...
// If a BENCH_* var is unset, we fall back to the plain key name so the bench
// works in dev without extra setup.
const getOpenAIKey   = () => process.env.BENCH_OPENAI_KEY   || process.env.OPENAI_API_KEY     || "";
const getElevenKey   = () => process.env.BENCH_ELEVEN_KEY   || process.env.ELEVENLABS_API_KEY || "";
const getDeepgramKey = () => process.env.BENCH_DEEPGRAM_KEY || process.env.DEEPGRAM_API_KEY   || "";

const REGION          = "us-central1";
const PROJECT_ID      = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
const BUCKET          = `${PROJECT_ID}.appspot.com`; // default Firebase Storage bucket

const FRONTEND_CORS = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────────────

/** Recursively strip undefined values so Firestore accepts the object. */
function stripUndefined(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
}

/**
 * Fetch a remote URL into a Buffer. Used to download user-uploaded clips
 * before forwarding to STT providers (most accept raw bytes, not URLs).
 */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        return fetchBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`fetch ${url} -> ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

/**
 * Multipart/form-data POST helper - some STT APIs require this (OpenAI Whisper,
 * ElevenLabs Scribe).  We build the body manually to avoid a heavy dep.
 */
function postMultipart(hostname, path, headers, fields, fileFieldName, fileName, fileBuffer, fileMime) {
  return new Promise((resolve, reject) => {
    const boundary = "----vfbench" + Date.now().toString(36);
    const parts = [];
    // text fields
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      parts.push(Buffer.from(`--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    // file field
    parts.push(Buffer.from(`--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: ${fileMime}\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const req = https.request({
      hostname, path, method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({status: res.statusCode, body: buf}));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** application/json POST */
function postJson(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({status: res.statusCode, body: Buffer.concat(chunks)}));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Upload a Buffer to GCS and return a public download URL (using v4 signed URL,
 * 7-day TTL).  Keeps audio retrievable for the listener panel.
 */
async function uploadToBucket(path, buffer, contentType) {
  const bucket = getStorage().bucket(BUCKET);
  const file = bucket.file(path);
  await file.save(buffer, { contentType, resumable: false });
  // 7-day signed URL is plenty for Phase 1 listener panels
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

// ────────────────────────────────────────────────────────────────────────────
// STT ADAPTERS — each returns {transcript, latencyMs, costEstimate}
// ────────────────────────────────────────────────────────────────────────────

/** Estimate audio duration in seconds from buffer size (mulaw 8kHz default). */
function estimateDurationSec(buf, mime) {
  // Rough: WAV PCM 16kHz mono ≈ 32KB/sec, mulaw 8kHz ≈ 8KB/sec, MP3 ≈ 12KB/sec
  if (/mulaw|pcmu/i.test(mime || "")) return buf.length / 8000;
  if (/mp3|mpeg/i.test(mime || "")) return buf.length / 12000;
  // Default to 16kHz PCM-16 assumption
  return buf.length / 32000;
}

async function sttElevenLabs(audioBuffer, mime, language) {
  const key = getElevenKey();
  if (!key) return {error: "ELEVENLABS_API_KEY not configured"};
  const t0 = Date.now();
  // ElevenLabs Scribe expects multipart with field "file"
  // Docs: POST /v1/speech-to-text   model_id=scribe_v1
  const res = await postMultipart(
    "api.elevenlabs.io",
    "/v1/speech-to-text",
    {"xi-api-key": key},
    {model_id: "scribe_v1", language_code: language || undefined, tag_audio_events: "false"},
    "file", "audio.wav", audioBuffer, mime || "audio/wav",
  );
  const latencyMs = Date.now() - t0;
  let body = {};
  try { body = JSON.parse(res.body); } catch (_) {}
  if (res.status !== 200) {
    return {error: `ElevenLabs ${res.status}: ${(res.body || "").slice(0, 200)}`, latencyMs};
  }
  // Cost: $0.40/hour audio = $0.0067/min
  const durSec = estimateDurationSec(audioBuffer, mime);
  return {
    transcript: body.text || "",
    latencyMs,
    costEstimate: (durSec / 60) * 0.0067,
    raw: {languageCode: body.language_code, languageProbability: body.language_probability},
  };
}

async function sttDeepgram(audioBuffer, mime, language) {
  const key = getDeepgramKey();
  if (!key) return {error: "DEEPGRAM_API_KEY not configured"};
  const t0 = Date.now();
  // Deepgram supports raw binary POST. Use nova-3 multilingual.
  // Pass language hint via query param if provided.
  const langParam = language ? `&language=${encodeURIComponent(language)}` : "&detect_language=true";
  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.deepgram.com",
      path: `/v1/listen?model=nova-3&smart_format=true${langParam}`,
      method: "POST",
      headers: {
        "Authorization": `Token ${key}`,
        "Content-Type": mime || "audio/wav",
        "Content-Length": audioBuffer.length,
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({status: res.statusCode, body: buf}));
    });
    req.on("error", reject);
    req.write(audioBuffer);
    req.end();
  });
  const latencyMs = Date.now() - t0;
  let body = {};
  try { body = JSON.parse(res.body); } catch (_) {}
  if (res.status !== 200) {
    return {error: `Deepgram ${res.status}: ${(res.body || "").slice(0, 200)}`, latencyMs};
  }
  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  const durSec = body.metadata?.duration || estimateDurationSec(audioBuffer, mime);
  // Cost: Nova-3 pay-as-you-go $0.0043/min
  return {
    transcript: alt?.transcript || "",
    latencyMs,
    costEstimate: (durSec / 60) * 0.0043,
    raw: {confidence: alt?.confidence, detectedLanguage: alt?.detected_language},
  };
}

async function sttOpenAIWhisper(audioBuffer, mime, language) {
  const key = getOpenAIKey();
  if (!key) return {error: "OPENAI_API_KEY not configured"};
  const t0 = Date.now();
  const res = await postMultipart(
    "api.openai.com",
    "/v1/audio/transcriptions",
    {"Authorization": `Bearer ${key}`},
    {model: "whisper-1", language: language || undefined, response_format: "verbose_json"},
    "file", "audio.wav", audioBuffer, mime || "audio/wav",
  );
  const latencyMs = Date.now() - t0;
  let body = {};
  try { body = JSON.parse(res.body); } catch (_) {}
  if (res.status !== 200) {
    return {error: `OpenAI Whisper ${res.status}: ${(res.body || "").slice(0, 200)}`, latencyMs};
  }
  const durSec = body.duration || estimateDurationSec(audioBuffer, mime);
  // Cost: whisper-1 = $0.006/min
  return {
    transcript: body.text || "",
    latencyMs,
    costEstimate: (durSec / 60) * 0.006,
    raw: {language: body.language, durationSec: body.duration},
  };
}

const STT_ADAPTERS = {
  elevenlabs: sttElevenLabs,
  deepgram:   sttDeepgram,
  openai:     sttOpenAIWhisper,
};

// ────────────────────────────────────────────────────────────────────────────
// TTS ADAPTERS — each returns {audioBuffer, mime, latencyMs, costEstimate}
// ────────────────────────────────────────────────────────────────────────────

async function ttsElevenLabs(text, voiceId, modelId) {
  const key = getElevenKey();
  if (!key) return {error: "ELEVENLABS_API_KEY not configured"};
  const t0 = Date.now();
  // Default to Aria (English) - caller should pass a language-appropriate voice.
  const vid = voiceId || "9BWtsMINqrJLrRacOk9x";
  const mid = modelId || "eleven_multilingual_v2";
  const res = await postJson(
    "api.elevenlabs.io",
    `/v1/text-to-speech/${vid}?output_format=mp3_44100_128`,
    {"xi-api-key": key, "Accept": "audio/mpeg"},
    {text, model_id: mid},
  );
  const latencyMs = Date.now() - t0;
  if (res.status !== 200) {
    return {error: `ElevenLabs ${res.status}: ${res.body.toString("utf8").slice(0, 200)}`, latencyMs};
  }
  // Cost: Multilingual v2 ≈ $0.18 per 1K chars (Creator tier) → $0.00018/char
  return {
    audioBuffer: res.body, mime: "audio/mpeg",
    latencyMs, costEstimate: text.length * 0.00018,
  };
}

async function ttsOpenAI(text, voice) {
  const key = getOpenAIKey();
  if (!key) return {error: "OPENAI_API_KEY not configured"};
  const t0 = Date.now();
  const res = await postJson(
    "api.openai.com",
    "/v1/audio/speech",
    {"Authorization": `Bearer ${key}`, "Accept": "audio/mpeg"},
    {model: "gpt-4o-mini-tts", voice: voice || "alloy", input: text, response_format: "mp3"},
  );
  const latencyMs = Date.now() - t0;
  if (res.status !== 200) {
    return {error: `OpenAI TTS ${res.status}: ${res.body.toString("utf8").slice(0, 200)}`, latencyMs};
  }
  // Cost: $0.015 per 1K chars for gpt-4o-mini-tts
  return {
    audioBuffer: res.body, mime: "audio/mpeg",
    latencyMs, costEstimate: text.length * 0.000015,
  };
}

const TTS_ADAPTERS = {
  elevenlabs: ttsElevenLabs,
  openai:     ttsOpenAI,
};

// ────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /benchSttRun
 * Body: { audioUrl, language?, providers: ["elevenlabs","deepgram","openai"] }
 * Returns: { runId, results: [{provider, transcript, latencyMs, costEstimate, error?}] }
 */
exports.benchSttRun = onRequest(
  {region: REGION, ...FRONTEND_CORS, memory: "512MiB", timeoutSeconds: 300, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const {audioUrl, language, providers, mime} = req.body || {};
      if (!audioUrl) { res.status(400).json({error: "audioUrl required"}); return; }
      const want = Array.isArray(providers) && providers.length > 0 ? providers : Object.keys(STT_ADAPTERS);

      // Fetch audio once, share across adapters
      const audioBuffer = await fetchBuffer(audioUrl);
      const audioMime = mime || (audioUrl.endsWith(".mp3") ? "audio/mpeg" : "audio/wav");

      const results = await Promise.all(
        want.map(async (name) => {
          const adapter = STT_ADAPTERS[name];
          if (!adapter) return {provider: name, error: "unknown provider"};
          try {
            const out = await adapter(audioBuffer, audioMime, language);
            return {provider: name, ...out};
          } catch (e) {
            return {provider: name, error: e.message};
          }
        })
      );

      const db = getFirestore();
      const ref = db.collection("bench_runs").doc();
      await ref.set({
        kind: "stt",
        language: language || null,
        audioUrl,
        audioBytes: audioBuffer.length,
        durationSecEstimate: estimateDurationSec(audioBuffer, audioMime),
        results: stripUndefined(results),
        createdAt: FieldValue.serverTimestamp(),
      });
      res.json({runId: ref.id, results});
    } catch (err) {
      logger.error("benchSttRun error", err);
      res.status(500).json({error: err.message});
    }
  },
);

/**
 * POST /benchTtsGenerate
 * Body: { text, language?, items: [{provider, voiceId?, modelId?, label?}] }
 * Returns: { runId, results: [{provider, voiceId, audioUrl, latencyMs, costEstimate, error?}] }
 */
exports.benchTtsGenerate = onRequest(
  {region: REGION, ...FRONTEND_CORS, memory: "512MiB", timeoutSeconds: 300, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const {text, language, items} = req.body || {};
      if (!text || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({error: "text + items[] required"}); return;
      }
      const db = getFirestore();
      const ref = db.collection("bench_runs").doc();
      const runId = ref.id;

      const results = await Promise.all(
        items.map(async (it) => {
          const adapter = TTS_ADAPTERS[it.provider];
          if (!adapter) return {provider: it.provider, voiceId: it.voiceId, error: "unknown provider"};
          try {
            const out = await adapter(text, it.voiceId, it.modelId);
            if (out.error) return {provider: it.provider, voiceId: it.voiceId, label: it.label, error: out.error, latencyMs: out.latencyMs};
            // Upload audio to GCS, return signed URL
            const ext = out.mime.includes("mpeg") ? "mp3" : "wav";
            const safeProv = it.provider.replace(/[^a-z0-9]/gi, "");
            const safeVoice = (it.voiceId || "default").replace(/[^a-z0-9_-]/gi, "");
            const path = `bench/tts/${runId}/${safeProv}_${safeVoice}.${ext}`;
            const audioUrl = await uploadToBucket(path, out.audioBuffer, out.mime);
            return {
              provider: it.provider, voiceId: it.voiceId || null, label: it.label || null,
              audioUrl, mime: out.mime,
              latencyMs: out.latencyMs, costEstimate: out.costEstimate,
            };
          } catch (e) {
            return {provider: it.provider, voiceId: it.voiceId, error: e.message};
          }
        })
      );

      await ref.set({
        kind: "tts",
        language: language || null,
        text,
        items: stripUndefined(items),
        results: stripUndefined(results),
        createdAt: FieldValue.serverTimestamp(),
      });
      res.json({runId, results});
    } catch (err) {
      logger.error("benchTtsGenerate error", err);
      res.status(500).json({error: err.message});
    }
  },
);

/**
 * POST /benchScore
 * Body: { runId, provider, voiceId?, dimension, score, listenerEmail? }
 *   dimension ∈ { "naturalness", "intelligibility", "accent" }
 *   score ∈ [1, 5]
 */
exports.benchScore = onRequest(
  {region: REGION, ...FRONTEND_CORS, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const {runId, provider, voiceId, dimension, score, listenerEmail} = req.body || {};
      if (!runId || !provider || !dimension || typeof score !== "number") {
        res.status(400).json({error: "runId + provider + dimension + numeric score required"}); return;
      }
      if (!["naturalness", "intelligibility", "accent"].includes(dimension)) {
        res.status(400).json({error: "dimension must be naturalness|intelligibility|accent"}); return;
      }
      if (score < 1 || score > 5) {
        res.status(400).json({error: "score must be 1..5"}); return;
      }
      const db = getFirestore();
      const ref = await db.collection("bench_ratings").add({
        runId, provider, voiceId: voiceId || null,
        dimension, score, listenerEmail: listenerEmail || null,
        createdAt: FieldValue.serverTimestamp(),
        userAgent: (req.headers["user-agent"] || "").toString().slice(0, 200),
      });
      res.json({ok: true, id: ref.id});
    } catch (err) {
      logger.error("benchScore error", err);
      res.status(500).json({error: err.message});
    }
  },
);

/**
 * GET /benchUploadUrl?filename=foo.wav
 * Returns: { uploadUrl, publicUrl, gcsPath }
 * Browser PUTs the file directly to GCS; backend then uses publicUrl for STT.
 */
exports.benchUploadUrl = onRequest(
  {region: REGION, ...FRONTEND_CORS, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const filename = (req.query.filename || "audio.wav").toString().replace(/[^a-zA-Z0-9._-]/g, "_");
      const contentType = (req.query.contentType || "audio/wav").toString();
      const path = `bench/uploads/${Date.now()}_${filename}`;
      const bucket = getStorage().bucket(BUCKET);
      const file = bucket.file(path);
      const [uploadUrl] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType,
      });
      const [publicUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      res.json({uploadUrl, publicUrl, gcsPath: path, contentType});
    } catch (err) {
      logger.error("benchUploadUrl error", err);
      res.status(500).json({error: err.message});
    }
  },
);

/** GET /benchListRuns?limit=50  — recent runs for the Results tab */
exports.benchListRuns = onRequest(
  {region: REGION, ...FRONTEND_CORS, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const db = getFirestore();
      const snap = await db.collection("bench_runs").orderBy("createdAt", "desc").limit(limit).get();
      const items = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          kind: x.kind,
          language: x.language,
          text: x.text,
          createdAt: x.createdAt?.toMillis?.() || null,
          providerCount: Array.isArray(x.results) ? x.results.length : 0,
          providers: Array.isArray(x.results) ? x.results.map((r) => r.provider) : [],
        };
      });
      res.json(items);
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  },
);

/** GET /benchListRatings?runId=... — aggregate ratings for one run */
exports.benchListRatings = onRequest(
  {region: REGION, ...FRONTEND_CORS, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    try {
      const runId = req.query.runId;
      if (!runId) { res.status(400).json({error: "runId required"}); return; }
      const db = getFirestore();
      const snap = await db.collection("bench_ratings").where("runId", "==", runId).get();
      const ratings = snap.docs.map((d) => d.data());
      // Aggregate by (provider, voiceId, dimension)
      const agg = {};
      for (const r of ratings) {
        const key = `${r.provider}|${r.voiceId || ""}|${r.dimension}`;
        if (!agg[key]) agg[key] = {provider: r.provider, voiceId: r.voiceId, dimension: r.dimension, scores: []};
        agg[key].scores.push(r.score);
      }
      const summary = Object.values(agg).map((a) => ({
        provider: a.provider, voiceId: a.voiceId, dimension: a.dimension,
        n: a.scores.length,
        mean: a.scores.reduce((s, x) => s + x, 0) / a.scores.length,
        scores: a.scores,
      }));
      res.json({ratings, summary});
    } catch (err) {
      res.status(500).json({error: err.message});
    }
  },
);
