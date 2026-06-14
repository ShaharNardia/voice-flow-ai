/**
 * Gemini Live bridge — Twilio Media Stream ↔ Google Gemini Live API.
 *
 * Gemini Live is Google's real-time multimodal conversation API.
 * Audio flows as raw PCM 16-bit at 16 kHz (input) and 24 kHz (output).
 * Twilio sends/receives G.711 µ-law at 8 kHz — we convert both ways inline.
 *
 * Cost: ~$0.02-0.04/min vs OpenAI Realtime ~$0.20-0.30/min (~10x cheaper).
 * Latency: ~350-600ms (comparable to OpenAI Realtime).
 * Hebrew quality: native — Google's multilingual LLM trained on Hebrew text.
 *
 * Events emitted (same interface as RealtimeBridge):
 *   "audio"        (base64MulawChunk)
 *   "transcript"   ({role, text})
 *   "barge_in"     ()
 *   "speech_started" ()
 *   "speech_stopped"  ()
 *   "response_done"   ()
 *   "ready"           ()  — session configured, greeting can fire
 *   "error"           (Error)
 *   "close"           ()
 */

"use strict";

const { EventEmitter } = require("events");
const WebSocket = require("ws");
const { spawn } = require("child_process");
// Audio resampling history: we tried 5 hand-rolled DSP approaches (boxcar,
// pure decimation, Hamming-windowed sinc FIR, etc.) and every one produced
// audible distortion. We now delegate to ffmpeg, which uses a polyphase
// resampler (libswresample) — the production reference used by every serious
// audio/telephony stack. One ffmpeg subprocess per call; chunks pipe through.

// Gemini Live model selection:
//
//   gemini-2.5-flash-native-audio-latest   — native audio. PROBLEM: this model
//                                            ALWAYS verbalizes its chain-of-thought
//                                            ("I've noted the user's 'Hello'...")
//                                            in English before the actual reply.
//                                            User hears English mumbling on every
//                                            turn — what was reported as "noisy /
//                                            robotic / distortion".
//
//   gemini-live-2.5-flash-preview          — CASCADE: LLM stage + separate TTS
//                                            stage. By construction the TTS only
//                                            sees the final user-facing text, so
//                                            thinking can never leak into audio.
//                                            Tradeoff: slightly higher latency.
//
// Override at runtime with GEMINI_LIVE_MODEL env var if needed.
//
// Verified available via Gemini API ListModels:
//   gemini-3.1-flash-live-preview             (Gemini 3.1 Live — newest)
//   gemini-2.5-flash-native-audio-latest      (verbalizes thinking — leak)
//   gemini-2.5-flash-native-audio-preview-12-2025
//   gemini-2.5-flash-native-audio-preview-09-2025
//
// Defaulting to Gemini 3.1 Live — likely improved over 2.5 native-audio for
// the thinking-leak issue. Auto-fallback to 2.5 native-audio if 3.1 errors.
const GEMINI_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
const GEMINI_MODEL_FALLBACK = "gemini-2.5-flash-native-audio-latest";

// ── Audio format conversion helpers ──────────────────────────────────────────
// Twilio Media Streams use G.711 µ-law 8 kHz mono (8-bit).
// Gemini Live expects PCM 16-bit 16 kHz mono.
// Gemini Live outputs PCM 16-bit 24 kHz mono.

/**
 * Parse sample rate from a MIME type string.
 * Handles: "audio/pcm;rate=24000", "audio/l16;rate=16000", "audio/pcm" (default 24k).
 */
function parseSampleRate(mimeType) {
  if (!mimeType) return 24000;
  const m = mimeType.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

/**
 * Build a forceful, front-loaded language lock for the system instruction.
 * Gemini Live's audio transcriber drifts off the target language when it
 * hears foreign-sounding proper nouns (place names) or short utterances; once
 * it flips, it stays flipped for the rest of the call. A soft appended hint
 * doesn't hold. This lock is explicit about the failure mode.
 *
 * For Hebrew we name the exact languages it wrongly drifts to so the model
 * has a concrete negative constraint.
 */
function buildLanguageLock(language) {
  // NOTE: plain prose only — no markdown (###, —, *, -). This text is FRONT-
  // LOADED as the very first thing in the system instruction, and native-audio
  // models are literal enough to SPEAK stray formatting characters at the start
  // of the first turn. Keep it character-clean.
  const isHebrew = /^he/i.test(language);
  if (isHebrew) {
    return [
      "ABSOLUTE LANGUAGE LOCK, HEBREW ONLY.",
      "This entire phone call is conducted in HEBREW (עברית). This is non-negotiable and applies to EVERY single turn for the whole call.",
      "The caller is ALWAYS speaking Hebrew, even when audio is unclear, short, or contains foreign-sounding words.",
      "City, airport, airline, and person names (Tel Aviv, London, Heathrow, El Al, and similar) often sound English or foreign. They are STILL part of a Hebrew conversation. Never let a foreign-sounding proper noun switch your language.",
      "You must NEVER transcribe or respond in English, Portuguese, Spanish, Italian, Arabic, or any non-Hebrew language. If a phrase genuinely sounds like another language, transcribe it phonetically in Hebrew script and continue in Hebrew.",
      "If you are even slightly unsure what language you heard, assume Hebrew.",
      "All of your spoken responses are in natural, native Hebrew. No exceptions.",
      "Speak fluent, grammatically correct Hebrew in complete well-formed sentences, as an educated native speaker would on the phone.",
      "NUMBERS: pronounce numbers as natural Hebrew number words, the way a person says them aloud. 510 is \"חמש מאות ועשר\", 231 is \"מאתיים שלושים ואחת\", 8 דקות is \"שמונה דקות\". NEVER read a number digit-by-digit (\"חמש אחת אפס\") unless it is a phone number or a code the caller must write down.",
      "",
      "",
    ].join("\n");
  }
  return [
    `LANGUAGE LOCK, ${language} ONLY.`,
    `This entire call is conducted in ${language}. The caller is always speaking ${language}, even when audio is short or unclear. Never switch languages mid-call. Always transcribe and respond in ${language}.`,
    "",
    "",
  ].join("\n");
}

/** µ-law decode table (ITU-T G.711) — local copy for input path 8k→16k. */
const MULAW_DECODE = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xFF;
    const sign = (mu & 0x80) ? -1 : 1;
    mu = mu & 0x7F;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0F;
    let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
    magnitude -= 0x84;
    t[i] = sign * magnitude;
  }
  return t;
})();

/**
 * Convert Twilio µ-law 8kHz → PCM16 16kHz (base64) for Gemini.
 * Gemini Live input format is PCM16 LE at 16kHz. Upsample 2x via linear interp.
 */
function twilioPcmToGemini(base64Mulaw) {
  const mulaw = Buffer.from(base64Mulaw, "base64");
  const n8 = mulaw.length;
  const out = Buffer.alloc(n8 * 4); // 2 samples × 2 bytes each
  for (let i = 0; i < n8; i++) {
    const s0 = MULAW_DECODE[mulaw[i]];
    const s1 = (i + 1 < n8) ? MULAW_DECODE[mulaw[i + 1]] : s0;
    out.writeInt16LE(s0, i * 4);
    out.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
  }
  return out.toString("base64");
}

/**
 * Spawn a long-running ffmpeg subprocess that converts PCM16-LE input at the
 * given rate to G.711 µ-law 8kHz output. Audio flows through stdin/stdout.
 *
 *   pipe:0  <─ raw PCM16 LE, mono, `inputRate` Hz (from Gemini)
 *   pipe:1  ─> raw mulaw bytes, mono, 8000 Hz (for Twilio)
 *
 * ffmpeg's libswresample uses a polyphase resampler — sound-engineering
 * reference quality, no hand-tuned filters required.
 *
 * @param {number} inputRate         - source sample rate (24000 typical)
 * @param {(b: Buffer) => void} onMulaw - callback fired with each mulaw chunk
 * @param {(e: Error) => void}  onError - error callback
 * @returns {ChildProcess}
 */
function spawnResampler(inputRate, onMulaw, onError) {
  const args = [
    "-loglevel", "error",
    "-hide_banner",
    // ── Low-latency flags ──────────────────────────────────────────────
    // For a long-running pipe-fed subprocess with raw input/output we want
    // ffmpeg to emit bytes as soon as it produces them rather than buffer
    // them into larger chunks. These shave ~20–80ms off TTS first-byte:
    "-fflags", "+nobuffer+flush_packets",     // no input buffering, flush packets immediately
    "-flags", "+low_delay",                    // disable extra frame delay
    "-probesize", "32",                        // don't pre-scan the (infinite) raw input
    "-analyzeduration", "0",                   // skip stream-analysis warmup
    "-flush_packets", "1",                     // duplicate of fflags but ensures the option binds
    // Input format: raw PCM16 LE, mono, at the given rate
    "-f", "s16le",
    "-ar", String(inputRate),
    "-ac", "1",
    "-i", "pipe:0",
    // Higher-quality resampler: SoXR with 28-bit precision (telephony grade).
    // Falls back to libswresample's default if SoXR isn't compiled in.
    // Also bandlimit at 3400Hz BEFORE downsample for clean telephone band.
    "-af", "aresample=resampler=soxr:precision=28:cutoff=0.97,lowpass=f=3400",
    // Output format: raw G.711 µ-law (PCMU), mono, 8000 Hz
    "-f", "mulaw",
    "-ar", "8000",
    "-ac", "1",
    "pipe:1",
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
  proc.stdout.on("data", onMulaw);
  proc.stderr.on("data", (chunk) => {
    // ffmpeg writes status info to stderr — only forward real errors.
    const msg = chunk.toString();
    if (/error|invalid|failed/i.test(msg)) onError(new Error(msg.trim()));
  });
  proc.on("error", onError);
  return proc;
}

// ── GeminiBridge class ────────────────────────────────────────────────────────

class GeminiBridge extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey          - Google Gemini API key
   * @param {string} opts.instructions    - System instructions
   * @param {string} [opts.voice]         - Gemini voice name (Aoede, Charon, Fenrir, Kore, Puck, Orbit, Zephyr)
   * @param {string} [opts.language]      - BCP-47 language code, e.g. "he-IL", "el-GR", "ar-XA"
   * @param {string} [opts.callSessionId] - For logging
   * @param {string} [opts.vadMode]       - "auto" | "sensitivity" (Gemini has its own VAD)
   */
  constructor({ apiKey, instructions, voice = "Aoede", language = "he-IL", callSessionId = "", tools = [], model = null, disableThinking = false }) {
    super();
    this._apiKey = apiKey;
    this._callSessionId = callSessionId;
    this._log = (msg) => console.log(`[${callSessionId}] [GL] ${msg}`);
    this._closed = false;
    this._ready  = false;
    this._ws     = null;
    this._suppressAudio = false;
    this._currentlyResponding = false;
    this._speechStartedAt = 0;
    this._voice = voice;
    this._language = language;
    this._instructions = instructions;
    this._tools = tools;
    this._pingInterval = null;
    this._loggedAudioFormat = false;
    // Output audio queue: Gemini delivers ~960ms blobs in single messages.
    // We CANNOT burst the entire response to Twilio — its 8kHz/20ms playback
    // buffer overruns and distorts. Queue µ-law chunks and drain at exactly
    // 20ms cadence via setInterval (one of the few low-jitter timers in Node).
    this._outQueue = [];             // array of base64 µ-law chunks (160 bytes each)
    this._drainInterval = null;
    // ffmpeg resampler subprocess + accumulator for tail bytes < 160
    this._ffmpeg = null;
    this._ffmpegRate = 0;
    this._mulawAccum = Buffer.alloc(0);
    // Per-turn meta-narration tracking. Gemini sends text and audio in
    // SEPARATE serverContent messages, so we must hold state across them.
    // Once we see meta text for this turn, ALL audio for this turn is dropped
    // and any audio already queued from this turn is flushed.
    this._turnHasMeta = false;
    this._turnText = "";
    // Active model + retry tracking. If the primary 404s, we retry once with
    // the fallback. Avoids an infinite loop when both are unavailable.
    this._modelName = model || GEMINI_MODEL;
    this._disableThinking = disableThinking;
    this._fallbackTried = false;
    // Session resumption: Gemini Live kills connections on a server deadline
    // ("1011 Deadline expired", observed ~2-3 min into call 1tsMnhqpQx8TahXScCtP)
    // — without resumption the whole phone call dies mid-sentence. We request
    // resumption handles in setup, store the latest, and on an unexpected
    // close reconnect with the handle: conversation context survives server-side.
    this._resumeHandle = null;
    this._resumeAttempts = 0;
    this._resumptionUnsupported = false;
    // Barge-in (hybrid): drop the REST of the current turn's audio. Distinct
    // from _suppressAudio, which the modelTurn handler resets on every chunk —
    // this one is reset ONLY at turnComplete, so a cut turn stays cut.
    this._dropTurnAudio = false;
    // Language-hint tracking. We send a BCP-47 languageCode on the input/
    // output transcription configs to force the caller's language. If the API
    // rejects with 1007 ("Cannot find field"), we retry without it. Without
    // the hint, Gemini auto-detects, which is unreliable on 8kHz phone Hebrew
    // (caller speaks Hebrew, transcript comes out as Italian/Portuguese/etc.)
    this._langHintFailed = false;
  }

  /** Lazily spawn ffmpeg once we know the input sample rate. */
  _ensureResampler(inputRate) {
    if (this._ffmpeg && this._ffmpegRate === inputRate) return;
    // Rate change or first audio — (re)spawn.
    if (this._ffmpeg) {
      try { this._ffmpeg.stdin.end(); } catch (_) {}
      try { this._ffmpeg.kill("SIGKILL"); } catch (_) {}
    }
    this._ffmpegRate = inputRate;
    this._log(`spawning ffmpeg resampler: ${inputRate}Hz PCM16LE → 8000Hz mulaw`);
    this._ffmpeg = spawnResampler(
      inputRate,
      (mulaw) => this._onMulawFromFfmpeg(mulaw),
      (err)   => this._log(`ffmpeg error: ${err.message}`),
    );
    this._ffmpeg.on("exit", (code, sig) => {
      this._log(`ffmpeg exited code=${code} sig=${sig}`);
      this._ffmpeg = null;
    });
  }

  /**
   * Called for each chunk of mulaw output ffmpeg produces. Slice into 160-byte
   * (20ms) chunks and push to the paced playback queue. Anything <160 bytes
   * is held in _mulawAccum until enough has arrived.
   */
  _onMulawFromFfmpeg(chunk) {
    this._mulawAccum = Buffer.concat([this._mulawAccum, chunk]);
    const CHUNK_SIZE = 160;
    while (this._mulawAccum.length >= CHUNK_SIZE) {
      const slice = this._mulawAccum.slice(0, CHUNK_SIZE);
      this._mulawAccum = this._mulawAccum.slice(CHUNK_SIZE);
      this._outQueue.push(slice.toString("base64"));
    }
    this._startDrain();
  }

  /** Start the 20ms drain pump (idempotent). */
  _startDrain() {
    if (this._drainInterval) return;
    this._drainInterval = setInterval(() => {
      if (this._closed) return;
      if (this._outQueue.length === 0) return;
      const chunk = this._outQueue.shift();
      if (!this._suppressAudio && !this._dropTurnAudio) this.emit("audio", chunk);
    }, 20);
  }

  /** Stop the drain pump and clear the queue (barge-in / close). */
  _flushQueue() {
    this._outQueue = [];
    this._mulawAccum = Buffer.alloc(0);
    if (this._drainInterval) {
      clearInterval(this._drainInterval);
      this._drainInterval = null;
    }
  }

  /** Tear down ffmpeg (call close or full bridge close). */
  _killResampler() {
    if (!this._ffmpeg) return;
    try { this._ffmpeg.stdin.end(); } catch (_) {}
    try { this._ffmpeg.kill("SIGKILL"); } catch (_) {}
    this._ffmpeg = null;
  }

  /**
   * Pre-warm — open the WebSocket without sending setup yet. Caller can do
   * other work (Firestore reads, etc.) while the TLS+WS handshake happens
   * in parallel. When ready, call commitSetup() (or just connect() to do
   * everything synchronously, which still works for callers that don't
   * need the overlap).
   *
   * Idempotent: connect() after prewarm() is a no-op for the socket open
   * but will trigger setup once the socket is up.
   */
  prewarm() {
    if (this._closed || this._ws) return;
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this._apiKey}`;
    this._log(`prewarming Gemini Live WS... url_prefix=${url.slice(0, 80)}`);
    this._prewarmedAt = Date.now();
    this._setupArmed = false;   // wait for commit
    this._ws = new WebSocket(url);
    this._attachWsHandlers();
  }

  /**
   * Update the instructions/tools/voice that will be sent in setup. Safe to
   * call after construction and before connect()/commitSetup(). Lets callers
   * pre-warm first and finalize instructions after Firestore reads.
   */
  updateConfig({ instructions, tools, voice, language } = {}) {
    if (instructions !== undefined) this._instructions = instructions;
    if (tools !== undefined) this._tools = tools;
    if (voice !== undefined) this._voice = voice;
    if (language !== undefined) this._language = language;
  }

  /**
   * Commit setup — arms _sendSetup. If the WS is already open, sends now;
   * otherwise the open handler will send when the socket comes up.
   */
  commitSetup() {
    if (this._closed) return;
    this._setupArmed = true;
    if (!this._ws) { this.connect(); return; }
    if (this._ws.readyState === WebSocket.OPEN && !this._setupSent) {
      this._setupSent = true;
      const dt = this._prewarmedAt ? `(prewarm overlap +${Date.now() - this._prewarmedAt}ms)` : "";
      this._log(`commitSetup → sending setup ${dt}`);
      this._sendSetup();
    }
  }

  connect() {
    if (this._closed) return;
    if (this._ws) {
      // Already prewarmed. Arm setup and, if the socket is already open,
      // fire setup now (otherwise the open handler will once it lands).
      this._setupArmed = true;
      if (this._ws.readyState === WebSocket.OPEN && !this._setupSent) {
        this._setupSent = true;
        const dt = this._prewarmedAt ? `(prewarm overlap +${Date.now() - this._prewarmedAt}ms)` : "";
        this._log(`connect() after prewarm → sending setup ${dt}`);
        this._sendSetup();
      }
      return;
    }
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this._apiKey}`;
    this._log(`connecting to Gemini Live... url_prefix=${url.slice(0, 80)}`);
    this._setupArmed = true;
    this._ws = new WebSocket(url);
    this._attachWsHandlers();
  }

  _attachWsHandlers() {
    this._ws.on("open", () => {
      this._log(`connected to Gemini Live (model=${this._modelName})`);
      if (this._setupArmed && !this._setupSent) {
        this._setupSent = true;
        this._sendSetup();
      } else {
        this._log("WS open but setup not yet committed — awaiting commitSetup()");
      }

      // Keepalive ping every 20s
      this._pingInterval = setInterval(() => {
        if (!this._closed && this._ws?.readyState === WebSocket.OPEN) {
          try { this._ws.ping(); } catch (_) {}
        }
      }, 20000);
    });

    this._ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleMessage(msg);
      } catch (e) {
        this._log(`parse error: ${e.message}`);
      }
    });

    this._ws.on("error", (err) => {
      this._log(`WS error: ${err.message}`);
      this.emit("error", err);
    });

    // Fires when the server responds to the WS upgrade with a non-101 status.
    // Without this handler the error is silently swallowed by the ws library.
    this._ws.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        this._log(`WS upgrade rejected: HTTP ${res.statusCode} — ${body.slice(0, 300)}`);
        this.emit("error", new Error(`Gemini WS rejected: ${res.statusCode} ${body.slice(0, 200)}`));
      });
    });

    this._ws.on("close", (code, reason) => {
      const reasonStr = reason?.toString() || "";
      this._log(`WS closed: ${code} ${reasonStr}`);
      if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }

      // Auto-fallback: if the primary model is unavailable (1008 + "not found"
      // or "not supported"), retry once with the verified-working model so the
      // call doesn't die just because we picked a name Google retired.
      const isModelMissing =
        code === 1008 &&
        /not found|not supported|unsupported model/i.test(reasonStr) &&
        !this._fallbackTried &&
        !this._closed;
      if (isModelMissing) {
        this._fallbackTried = true;
        this._modelName = GEMINI_MODEL_FALLBACK;
        this._log(`primary model unavailable — falling back to ${this._modelName} and reconnecting`);
        this._ws = null;
        this._ready = false;
        this._setupSent = false;  // without this the reconnect never re-sends setup
        // Re-enter connect on next tick so this close handler returns cleanly.
        setImmediate(() => { if (!this._closed) this.connect(); });
        return;
      }

      // Auto-retry without languageCode hint if the API rejected it. The
      // error path mentions input_audio_transcription / output_audio_transcription.
      const isLangHintRejected =
        code === 1007 &&
        !this._langHintFailed &&
        !this._closed &&
        /Cannot find field|Unknown name/i.test(reasonStr) &&
        /audio_transcription|languageCode/i.test(reasonStr);
      if (isLangHintRejected) {
        this._langHintFailed = true;
        this._log(`languageCode field rejected by API — reconnecting without language hint`);
        this._ws = null;
        this._ready = false;
        this._setupSent = false;
        setImmediate(() => { if (!this._closed) this.connect(); });
        return;
      }

      // Voice not available for this model (1007) — reconnect once with the
      // safe default voice instead of dropping the call. The voice clamp in
      // index.js should prevent this, but a model swap could reintroduce it.
      if (code === 1007 && !this._voiceFallbackTried && !this._closed &&
          /voice .*(not available|unsupported|unknown)/i.test(reasonStr)) {
        this._voiceFallbackTried = true;
        this._log(`voice "${this._voice}" rejected by model — retrying with Aoede`);
        this._voice = "Aoede";
        this._ws = null; this._ready = false; this._setupSent = false;
        setImmediate(() => { if (!this._closed) this.connect(); });
        return;
      }

      // If the API rejects the sessionResumption field itself, retry once without it.
      if (code === 1007 && !this._resumptionUnsupported && !this._closed &&
          /session_resumption|sessionResumption/i.test(reasonStr)) {
        this._resumptionUnsupported = true;
        this._log("sessionResumption field rejected — reconnecting without it");
        this._ws = null;
        this._ready = false;
        this._setupSent = false;
        setImmediate(() => { if (!this._closed) this.connect(); });
        return;
      }

      // Mid-call server kill (deadline / network / goAway). We didn't initiate
      // this close (_closed is only set by our close()), so if we hold a
      // resumption handle, reconnect and RESUME — the caller hears a brief
      // pause instead of a dead line. Capped at 3 attempts per call.
      if (!this._closed && this._resumeHandle && this._resumeAttempts < 3) {
        this._resumeAttempts++;
        this._log(`unexpected close (${code}) — resuming session, attempt ${this._resumeAttempts}/3`);
        this._ws = null;
        this._ready = false;
        this._setupSent = false;
        setImmediate(() => { if (!this._closed) this.connect(); });
        return;
      }

      this._closed = true;
      this.emit("close");
    });
  }

  // ── Private: send setup ────────────────────────────────────────────────────

  _sendSetup() {
    // Build tools list for Gemini format
    const geminiFunctions = this._tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    // Embed a strong language directive in the system instruction. The Live
    // API doesn't accept a languageCode field on inputAudioTranscription /
    // outputAudioTranscription / speechConfig (verified: 1007 "Cannot find
    // field" errors), and it doesn't accept a top-level language hint either.
    // The only reliable lever is the system prompt itself.
    //
    // Observed failure (call kvKjHYXSTdAthWaHQHv7): conversation starts in
    // Hebrew, caller says a transliterated place name ("Tel Aviv", "London"),
    // and Gemini's transcriber flips language mode — then keeps transcribing
    // subsequent Hebrew speech as English and even Portuguese, derailing the
    // whole call. The fix is a forceful, FRONT-LOADED lock (primacy beats a
    // soft appended hint) that explicitly anticipates foreign-sounding proper
    // nouns and short utterances.
    const langDirective = this._language
      ? buildLanguageLock(this._language)
      : "";

    const setup = {
      setup: {
        model: `models/${this._modelName}`,
        generationConfig: {
          responseModalities: ["audio"],
          temperature: 0.7,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this._voice,
              },
            },
          },
          // Native-audio "dialog" models can verbalize their chain-of-thought
          // ("I've noted the caller said…") in English before the real reply —
          // the caller hears English mumbling. Disabling thinking suppresses it
          // at the source, which lets us use the natural native-audio voice
          // instead of the TTS-grade cascade model. Only sent when requested so
          // models that reject the field (cascade) keep a clean handshake.
          ...(this._disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
        // NOTE: tried realtimeInputConfig.automaticActivityDetection with
        // silenceDurationMs: 250 to shave response latency. The Live API
        // accepted the field but it silently disabled user-speech recognition
        // — Gemini stopped emitting any user transcripts at all (call uJqJp...).
        // Reverted to Gemini's default VAD until we have a documented config
        // shape that's known to work. Delay-vs-recognition tradeoff: Gemini's
        // defaults are tuned for reliability over snappiness.
        // Enable transcripts for BOTH sides — required for Firestore history
        // and for our meta-narration detector. NOTE: tested with both
        // `languageCode` (singular) and `languageCodes` (array) — Gemini
        // 3.1-flash-live-preview rejects both as "Unknown name". Until the
        // API ships a documented language field, we send empty configs and
        // accept that Hebrew STT is auto-detected (and unreliable on 8kHz
        // phone audio). Trying the field still wastes ~100ms on the failing
        // handshake + reconnect — not worth it.
        outputAudioTranscription: {},
        inputAudioTranscription:  {},
        // Ask the server for resumption handles so a mid-call deadline kill
        // can be survived (see _resumeHandle in the constructor). With a stored
        // handle this RESUMES the previous session — context intact.
        ...(this._resumptionUnsupported ? {} : {
          sessionResumption: this._resumeHandle ? { handle: this._resumeHandle } : {},
        }),
        systemInstruction: {
          // langDirective goes FIRST (primacy) — a language lock buried at
          // the end of a long prompt loses to mid-call audio cues.
          parts: [{ text: langDirective + this._instructions }],
        },
        ...(geminiFunctions.length > 0 ? {
          tools: [{ functionDeclarations: geminiFunctions }],
        } : {}),
      },
    };

    this._ws.send(JSON.stringify(setup));
  }

  // ── Private: message handler ───────────────────────────────────────────────

  _handleMessage(msg) {
    // Setup confirmed
    if (msg.setupComplete) {
      this._log("setup confirmed — session ready");
      this._ready = true;
      this.emit("ready");
      return;
    }

    // Session-resumption handle updates — store the newest so an unexpected
    // close can resume with full context. GoAway warns the deadline is near.
    if (msg.sessionResumptionUpdate) {
      const u = msg.sessionResumptionUpdate;
      if (u.resumable && u.newHandle) this._resumeHandle = u.newHandle;
      return;
    }
    if (msg.goAway) {
      this._log(`goAway from server — timeLeft=${msg.goAway.timeLeft || "?"} (will resume on close)`);
      return;
    }

    // Tool calls arrive as a TOP-LEVEL toolCall message (BidiGenerateContentToolCall),
    // NOT inside serverContent. Missing this wedged whole calls: the model asked
    // for a tool, we silently dropped it, and it waited forever for a response —
    // no audio, no turnComplete, session dead (call 4SPtDfLzTTeIBKWLDDXp, the
    // "כל הקווים" turn). The legacy modelTurn.parts functionCall path below is
    // kept for older model variants.
    if (msg.toolCall?.functionCalls?.length) {
      for (const fc of msg.toolCall.functionCalls) {
        this._log(`tool call: ${fc.name}(${JSON.stringify(fc.args || {}).slice(0, 120)}) id=${fc.id || "-"}`);
        this.emit("tool_call", {
          name: fc.name,
          args: fc.args || {},
          callId: fc.id || fc.name,
        });
      }
      return;
    }
    if (msg.toolCallCancellation) {
      this._log(`tool call cancelled: ${JSON.stringify(msg.toolCallCancellation.ids || [])}`);
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    // Barge-in: model was interrupted
    if (sc.interrupted) {
      this._log("barge-in detected (model interrupted)");
      this._suppressAudio = true;
      this._currentlyResponding = false;
      this._turnHasMeta = false;
      this._turnText = "";
      // Drop everything queued — caller is talking now.
      this._flushQueue();
      this.emit("barge_in");
      return;
    }

    // Strip the model's chain-of-thought leakage from transcripts. Covers
    // both markdown headers (older variants) and full English narrator
    // sentences (current native-audio model). Keeps conversation history
    // clean even when the model leaks. If we successfully move to the
    // cascade model this becomes a belt-and-braces no-op.
    // CRITICAL: do NOT .trim() or collapse \s{2,} here — Gemini streams the
    // transcript in tiny chunks like "שלום" then " טוב" then " מאוד".
    // Trimming each chunk eats the leading space that separates the words,
    // producing "שלוםטובמאוד" in the accumulated turn (verified bug in call
    // vNTEOnT2qLcuZbSdq20X). Whitespace normalization happens once at turn
    // flush time in handleGeminiSession's flushTranscript().
    const stripMeta = (s) =>
      s
        // Markdown headers / bold "section labels" — safe on streaming chunks
        .replace(/\*\*[^*\n]+\*\*/g, "")
        .replace(/^\s*#{1,6}\s.*$/gm, "")
        // English narrator sentences at the start of a chunk
        .replace(/^\s*(I['']ve|I am|I will|I have|I'm|The user|Given (that|this)|While the|Noting|Acknowledging|Considering)\b[^֐-׿؀-ۿ一-鿿Ѐ-ӿ]*?[.!?](?=\s|$)/i, "");

    // Output transcript (model speech as text). With outputAudioTranscription
    // enabled in setup, Gemini sends the bot's spoken text here separately
    // from the audio inlineData.
    if (sc.outputTranscription?.text) {
      const cleaned = stripMeta(sc.outputTranscription.text);
      if (cleaned) this.emit("transcript", { role: "assistant", text: cleaned });
    }
    // Input transcript (caller speech as text) — for history + admin review.
    if (sc.inputTranscription?.text) {
      this.emit("transcript", { role: "user", text: sc.inputTranscription.text });
    }

    // Model turn — contains audio and/or (legacy) inline text parts.
    // NOTE: audio is now ALWAYS forwarded (no per-turn suppression). The
    // earlier suppression logic flushed the queue on meta detection, which
    // also killed the real Hebrew response that arrived right after in the
    // same turn. Letting all audio through is the lesser evil.
    if (sc.modelTurn?.parts) {
      this._currentlyResponding = true;
      this._suppressAudio = false;

      for (const part of sc.modelTurn.parts) {
        // Audio output — log the MIME type on first chunk so we know the actual format
        if (part.inlineData?.mimeType?.startsWith("audio/")) {
          if (!this._suppressAudio && !this._dropTurnAudio) {
            const mt = (part.inlineData.mimeType || "").toLowerCase();
            const rawB64 = part.inlineData.data;

            if (!this._loggedAudioFormat) {
              this._loggedAudioFormat = true;
              const bytes = Buffer.from(rawB64, "base64").length;
              this._log(`Output audio: mimeType="${part.inlineData.mimeType}" bytes=${bytes}`);
            }

            // Hand the raw PCM directly to ffmpeg. It handles the
            // resampling + µ-law encoding with libswresample's polyphase
            // filter. The on-data callback pushes 20ms slices into the
            // paced output queue.
            const inputRate = parseSampleRate(part.inlineData.mimeType);
            this._ensureResampler(inputRate);
            const pcmBuf = Buffer.from(rawB64, "base64");
            this._turnAudioBytes = (this._turnAudioBytes || 0) + pcmBuf.length;
            try { this._ffmpeg.stdin.write(pcmBuf); } catch (e) {
              this._log(`ffmpeg stdin write failed: ${e.message}`);
            }
          }
        }
        // Legacy text transcript path (some Gemini variants still inline text
        // in modelTurn.parts). Strip markdown meta-narration before emitting.
        if (part.text) {
          const cleaned = stripMeta(part.text);
          if (cleaned) this.emit("transcript", { role: "assistant", text: cleaned });
        }
      }
    }

    // Tool call
    if (sc.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.functionCall) {
          this.emit("tool_call", {
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            callId: part.functionCall.id || part.functionCall.name,
          });
        }
      }
    }

    // Generation complete (model finished generating; audio may still be
    // draining out of the paced queue). Distinct from turnComplete.
    if (sc.generationComplete) {
      this._log(`generation complete (turnAudioBytes=${this._turnAudioBytes || 0})`);
    }

    // Turn complete — reset per-turn meta tracking.
    if (sc.turnComplete) {
      this._currentlyResponding = false;
      this._suppressAudio = false;
      this._dropTurnAudio = false;  // barge-in cut ends with the turn
      this._turnHasMeta = false;
      this._turnText = "";
      // Diagnostic: did this turn actually produce audio? A turnComplete with
      // turnAudioBytes=0 means Gemini ended the turn WITHOUT speaking — the
      // root signature of the hybrid "no response" symptom.
      this._log(`turn complete (turnAudioBytes=${this._turnAudioBytes || 0})`);
      this._turnAudioBytes = 0;
      this.emit("response_done");
    }

    // Input transcription (user speech)
    if (msg.clientContent?.turns) {
      for (const turn of msg.clientContent.turns) {
        for (const part of (turn.parts || [])) {
          if (part.text && turn.role === "user") {
            this.emit("transcript", { role: "user", text: part.text });
          }
        }
      }
    }
  }

  // ── Public API (matches RealtimeBridge interface) ─────────────────────────

  /**
   * Send Twilio µ-law audio to Gemini.
   * Converts µ-law 8kHz → PCM 16kHz inline.
   *
   * IMPORTANT: Gemini Live's input format is `realtimeInput.audio` (singular
   * object), NOT `realtimeInput.mediaChunks` (legacy array). The mediaChunks
   * form is silently dropped by current Gemini Live — caller's voice never
   * reaches the model, so it sits there waiting and never responds. Stick to
   * the documented `audio` form.
   */
  sendAudio(base64Mulaw) {
    if (this._closed || !this._ready) return;
    const pcm16k = twilioPcmToGemini(base64Mulaw);
    this._ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: pcm16k,
        },
      },
    }));
  }

  /**
   * Inject a system instruction inline mid-call (e.g. "the caller has been
   * silent for 10 seconds — ask if they're still there in their language").
   * The model immediately produces an audio response.
   *
   * @param {string} text - what to tell the model to do/say next
   */
  promptModel(text) {
    if (this._closed || !this._ready) return;
    this._log(`promptModel → "${String(text).slice(0, 60)}" (expecting audio response)`);
    this._ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }

  /**
   * Barge-in (hybrid): silence the rest of the CURRENT turn — flush whatever
   * is queued for playback and drop any further audio chunks of this turn.
   * The model keeps "finishing" the turn server-side (its history stays
   * intact); the caller just stops hearing it. Auto-resets at turnComplete.
   */
  suppressTurn() {
    this._dropTurnAudio = true;
    this._flushQueue();
    this._log("suppressTurn — remaining audio of current turn dropped (barge-in)");
  }

  /**
   * Trigger a model response (e.g. after injecting tool results).
   */
  triggerResponse() {
    if (this._closed || !this._ready) return;
    // Gemini auto-responds when VAD detects end of user turn.
    // For explicit trigger (greeting, tool result), send empty text turn.
    this._ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: "" }] }],
        turnComplete: true,
      },
    }));
  }

  /**
   * Inject a tool result.
   */
  addConversationItem(item) {
    if (this._closed) return;
    // item.content is the function result string
    const content = typeof item.content === "string"
      ? item.content
      : JSON.stringify(item.content);
    this._log(`tool response → id=${item.tool_call_id || "-"} name=${item.name || "-"} (${content.length} chars)`);
    this._ws.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{
          id: item.tool_call_id || "tool_result",
          ...(item.name ? { name: item.name } : {}),
          response: { output: content },
        }],
      },
    }));
  }

  /**
   * Close the bridge cleanly.
   */
  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    this._flushQueue();
    this._killResampler();
    try { this._ws?.close(1000, "session ended"); } catch (_) {}
  }

  get started() { return this._ready; }
}

module.exports = { GeminiBridge };
