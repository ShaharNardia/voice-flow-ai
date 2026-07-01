/**
 * OpenAI Realtime API bridge.
 *
 * Connects to wss://api.openai.com/v1/realtime and exposes a simple
 * event-emitter interface for the Twilio Media Stream handler.
 *
 * Events emitted:
 *   "audio"       (base64MulawChunk)   – send back to Twilio via WS
 *   "transcript"  ({role, text})        – for conversation history
 *   "tool_call"   ({name, args, callId}) – execute tool, feed result back
 *   "error"       (Error)
 *   "close"       ()
 *   "ready"       ()                    – session is configured, audio can flow
 */

const {EventEmitter} = require("events");
const WebSocket = require("ws");

const REALTIME_MODEL = "gpt-realtime";
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
const MAX_RT_RECONNECT = 3;   // mid-call WS reconnect attempts before giving up

/**
 * Build the `turn_detection` config for session.update based on user
 * preferences. Two modes:
 *
 *  - "semantic" (default) → uses the model's own understanding of speech
 *    to decide when the user is done. Dramatically better at ignoring
 *    background noise, breaths, and filler words.
 *  - "server" → energy-based VAD, tunable via sensitivity.
 *
 * Both modes set `interrupt_response: true` so the bot stops talking the
 * moment the caller starts speaking (barge-in), and `create_response: true`
 * so OpenAI auto-generates a reply once the caller finishes their turn.
 */
function buildTurnDetection(mode, sensitivity) {
  // Shared flags: enable barge-in + auto-respond after caller pauses.
  const common = {
    create_response: true,    // auto-generate a reply when user stops
    interrupt_response: true, // stop bot mid-sentence if user starts talking
  };
  if (mode === "server") {
    // Energy-based VAD.  For phone calls "high" sensitivity (low threshold,
    // short silence) makes barge-in feel snappy but is more prone to false
    // positives from background noise.  "low" is most robust to noise.
    //
    // Phone-call presets — tuned for barge-in responsiveness + noise tolerance.
    // threshold = how loud speech must be relative to noise floor (0..1)
    // silence_duration_ms = how long of silence ends the user's turn
    // prefix_padding_ms = audio kept BEFORE detected speech-start
    const presets = {
      low:    {threshold: 0.85, silence_duration_ms: 900, prefix_padding_ms: 350},
      medium: {threshold: 0.65, silence_duration_ms: 600, prefix_padding_ms: 300},
      high:   {threshold: 0.50, silence_duration_ms: 400, prefix_padding_ms: 250},
    };
    const p = presets[sensitivity] || presets.medium;
    return {type: "server_vad", ...p, ...common};
  }
  // semantic_vad — model-based, uses speech understanding to decide turns.
  // Strongly preferred for phone calls: it ignores coughs, throat-clears,
  // and ambient chatter that energy-based VAD would otherwise flag as speech.
  //   "auto"   → OpenAI chooses based on context (best general default)
  //   "low"    → waits for a clear, complete sentence (most noise-resistant)
  //   "medium" → balanced
  //   "high"   → triggers as soon as speech is detected (fastest barge-in,
  //              less noise-resistant)
  const eagerness =
    sensitivity === "high"   ? "high"   :
    sensitivity === "medium" ? "medium" :
    sensitivity === "low"    ? "low"    :
                               "auto";
  return {type: "semantic_vad", eagerness, ...common};
}

/**
 * Minimum caller-speech duration (ms) below which an auto-triggered response is
 * treated as a phantom (noise/echo/breath) and cancelled.
 *
 * This used to be a flat 350ms — but a short real answer like "כן" / "לא" /
 * "נכון" is ~200–350ms, so callers' first one-word replies were being dropped
 * as if they were noise (the bot appeared to "ignore" them). The fix is
 * mode-aware:
 *   - semantic_vad: the model already filters coughs/noise before it ever fires
 *     `speech_started`, so any burst it DOES report is very likely real speech.
 *     Use a low 150ms floor — kills only sub-150ms clicks/echo, keeps real words.
 *   - server_vad: energy-based and noisier, so keep a stricter 300ms floor.
 */
function phantomThresholdMs(vadMode) {
  return vadMode === "semantic" ? 150 : 300;
}

class RealtimeBridge extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey            - OpenAI API key
   * @param {string} opts.instructions      - System instructions for the session
   * @param {string} [opts.voice="alloy"]   - Realtime voice (alloy|ash|ballad|coral|echo|sage|shimmer|verse)
   * @param {Array}  [opts.tools=[]]        - Function-calling tools (OpenAI format)
   * @param {string} opts.callSessionId     - For logging
   * @param {string} [opts.inputLanguage]   - ISO 639-1 language hint for Whisper STT (e.g. "he", "en", "ar")
   *                                          Prevents Whisper from mis-detecting the caller's language.
   * @param {number} [opts.temperature]     - Model temperature (0.6–1.2). Default 0.8.
   * @param {number} [opts.maxResponseTokens] - Max output tokens per response. Default 500.
   */
  constructor({apiKey, instructions, voice = "alloy", tools = [], callSessionId = "", vadMode = "server", vadSensitivity = "medium", inputLanguage = null, temperature = 0.8, maxResponseTokens = 500}) {
    super();
    this._callSessionId = callSessionId;
    this._log = (msg) => console.log(`[${callSessionId}] [RT] ${msg}`);
    this._vadMode = vadMode;
    // Mode-aware phantom-response floor (see phantomThresholdMs). Prevents short
    // real answers ("כן"/"לא") from being cancelled as noise under semantic VAD.
    this._phantomThresholdMs = phantomThresholdMs(vadMode);
    this._closed = false;
    this._ready = false;
    this._currentResponseId = null;
    this._pendingToolCalls = new Map(); // callId → {name, args_buffer}
    // After a barge-in we suppress audio deltas until a new response starts.
    // This prevents the caller from hearing the bot keep talking for ~1s after
    // they interrupted (the tail of audio OpenAI already had queued up).
    this._suppressAudioUntilNextResponse = false;
    // Phantom-response guard: track last user-speech duration so we can cancel
    // responses auto-triggered by very short noise bursts (echo, breath, click).
    // Without this, OpenAI's `create_response: true` fires on any VAD-detected
    // burst even if it's not real speech — causing the bot to "double-respond"
    // and produce gibberish-overlapping audio.
    this._speechStartedAt = 0;
    this._lastSpeechDurationMs = 0;
    // Allow the very first response (initial greeting) - it has no prior speech.
    this._allowEmptyResponse = true;
    // Per-response hang detection — if audio deltas stop mid-response for 4s
    // without response.done firing, OpenAI has silently stalled. Cancel so
    // the session can accept a new response instead of hanging forever.
    this._lastDeltaAt = 0;
    this._hangCheck = setInterval(() => {
      if (this._currentResponseId && this._lastDeltaAt > 0 && Date.now() - this._lastDeltaAt > 4000) {
        this._log(`response stalled — no audio delta in ${Date.now() - this._lastDeltaAt}ms, cancelling`);
        try { this._send("response.cancel", {}); } catch (_) {}
        this._currentResponseId = null;
        this._lastDeltaAt = 0;
        this.emit("response_stalled");
      }
    }, 1500);

    // ── WebSocket keepalive: Issue 2 fix ──────────────────────────────
    // The OpenAI Realtime WebSocket has a server-side idle timeout.  During
    // long caller silences (the user is thinking, or the call is being placed
    // on hold) no data flows and OpenAI may close the socket.  A WS-level
    // ping every 20s is invisible to the model but keeps the TCP connection
    // alive through all NAT/load-balancer timeouts in the chain.
    this._pingInterval = setInterval(() => {
      if (!this._closed && this._ws?.readyState === WebSocket.OPEN) {
        try { this._ws.ping(); } catch (_) { /* ignore — ws may be transitioning */ }
      }
    }, 20000);

    // Connection config — captured so _connect() can re-establish the WS with
    // the SAME voice/instructions/tools on a mid-call reconnect (no voice change,
    // no provider switch).
    this._cfg = { apiKey, instructions, voice, tools, vadMode, vadSensitivity, inputLanguage, maxResponseTokens };
    this._reconnects = 0;
    this._everReady = false;
    this._connect();
  }

  // (Re)open the OpenAI Realtime WS and wire its handlers. On an UNEXPECTED
  // mid-call close, reconnect up to MAX with backoff and re-apply the SAME
  // session config (same voice) — so the bot never just "disappears". Note:
  // OpenAI sessions don't carry conversation state across sockets, so the live
  // turn history is lost on reconnect, but the persona/voice/tools continue.
  _connect() {
    const c = this._cfg;
    this._ws = new WebSocket(REALTIME_URL, { headers: { "Authorization": `Bearer ${c.apiKey}` } });

    this._ws.on("open", () => {
      this._log("connected to OpenAI Realtime");
      this._send("session.update", {
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          output_modalities: ["audio"],
          instructions: c.instructions,
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              noise_reduction: { type: "near_field" },
              transcription: { model: "whisper-1", ...(c.inputLanguage ? { language: c.inputLanguage } : {}) },
              turn_detection: buildTurnDetection(c.vadMode, c.vadSensitivity),
            },
            output: { format: { type: "audio/pcmu" }, voice: c.voice },
          },
          tools: c.tools.map((t) => ({
            type: "function",
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
          tool_choice: c.tools.length > 0 ? "auto" : "none",
          max_output_tokens: c.maxResponseTokens,
        },
      });
      // "ready" is emitted from _handleEvent on session.updated (config applied).
    });

    this._ws.on("message", (data) => {
      try { this._handleEvent(JSON.parse(data.toString())); }
      catch (e) { this._log(`parse error: ${e.message}`); }
    });

    this._ws.on("error", (err) => {
      this._log(`WS error: ${err.message}`);
      this.emit("error", err);
    });

    this._ws.on("close", (code, reason) => {
      this._log(`WS closed: ${code} ${reason}`);
      if (this._closed) { this.emit("close"); return; }   // intentional teardown
      if (this._reconnects < MAX_RT_RECONNECT) {
        this._reconnects++;
        this._ready = false;
        this._currentResponseId = null;
        const backoff = 400 * this._reconnects;
        this._log(`unexpected close (${code}) — reconnecting in ${backoff}ms (${this._reconnects}/${MAX_RT_RECONNECT})`);
        setTimeout(() => {
          if (this._closed) return;
          try { this._connect(); } catch (e) { this._log(`reconnect failed: ${e.message}`); }
        }, backoff);
      } else {
        this._log("reconnect exhausted — closing call");
        this._closed = true;
        this._clearTimers();    // give up cleanly — don't strand the keepalive intervals
        this.emit("close");
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Forward Twilio mulaw audio to OpenAI Realtime.
   * @param {string} base64Mulaw - Base64-encoded mulaw audio from Twilio
   */
  sendAudio(base64Mulaw) {
    if (this._closed || !this._ready) return;
    // Direct pass-through: Twilio and OpenAI both speak g711_ulaw @ 8kHz.
    this._send("input_audio_buffer.append", {audio: base64Mulaw});
  }

  /**
   * Inject a conversation item (e.g. tool result).
   */
  addConversationItem(item) {
    if (this._closed) return;
    this._send("conversation.item.create", {item});
  }

  /**
   * Trigger a response from the model (e.g. after injecting tool results).
   */
  triggerResponse() {
    if (this._closed) return;
    this._send("response.create", {});
  }

  /**
   * Co-Pilot: a live human supervisor injects guidance. Added as a system turn
   * (so the bot acts on it, not replies to it) then a response is triggered.
   * @returns {boolean} true if delivered to a live, ready session.
   */
  injectOperatorMessage(text) {
    if (this._closed || !this._ready) return false;
    this.addConversationItem({
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: `[Live supervisor instruction — do this now, naturally, do NOT mention the supervisor]: ${String(text).slice(0, 500)}` }],
    });
    this.triggerResponse();
    return true;
  }

  /**
   * Cleanly close the bridge.
   */
  close() {
    // Always release the keepalive/hang-check intervals, even if we were already
    // marked closed by an exhausted-reconnect teardown — otherwise they leak past
    // the call (the host calls close() on our "close" event, which would otherwise
    // early-return and strand both setIntervals).
    this._clearTimers();
    if (this._closed) return;
    this._closed = true;
    try {
      this._ws.close(1000, "session ended");
    } catch (_) {}
  }

  _clearTimers() {
    if (this._hangCheck)   { clearInterval(this._hangCheck);    this._hangCheck    = null; }
    if (this._pingInterval){ clearInterval(this._pingInterval); this._pingInterval = null; }
  }

  // ── Internal ───────────────────────────────────────────────────────

  _send(type, payload = {}) {
    if (this._closed || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify({type, ...payload}));
  }

  _handleEvent(evt) {
    switch (evt.type) {
      // ── Audio output from the model → already g711_ulaw, pass through ──
      // GA renamed: response.audio.delta → response.output_audio.delta
      case "response.audio.delta":
      case "response.output_audio.delta": {
        if (evt.delta) {
          this._lastDeltaAt = Date.now();
          // Hard barge-in: once the user has started speaking we stop
          // forwarding any more audio from the cancelled response,
          // even if OpenAI keeps streaming a few more chunks.
          if (this._suppressAudioUntilNextResponse) break;
          this.emit("audio", evt.delta);
        }
        break;
      }

      // ── Assistant speech transcript (for history logging) ──────────
      // GA renamed: response.audio_transcript.done → response.output_audio_transcript.done
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done": {
        if (evt.transcript) {
          this.emit("transcript", {role: "assistant", text: evt.transcript});
        }
        break;
      }

      // ── User speech transcript (input_audio_transcription) ─────────
      case "conversation.item.input_audio_transcription.completed": {
        if (evt.transcript) {
          this.emit("transcript", {role: "user", text: evt.transcript});
        }
        break;
      }

      // ── Tool call: arguments streaming done ─────────────────────────
      case "response.function_call_arguments.done": {
        const {call_id, name, arguments: argsStr} = evt;
        let args = {};
        try { args = JSON.parse(argsStr || "{}"); } catch (_) {}
        this.emit("tool_call", {name, args, callId: call_id});
        break;
      }

      // ── Response finished ──────────────────────────────────────────
      case "response.done": {
        const status = evt.response?.status || "unknown";
        const reason = evt.response?.status_details?.reason || evt.response?.status_details?.type || "";
        this._log(`response.done status=${status}${reason ? ` reason=${reason}` : ""}`);
        this._currentResponseId = null;
        this._lastDeltaAt = 0;
        if (status === "failed") {
          const errMsg = evt.response?.status_details?.error?.message || "Unknown Realtime API error";
          this._log(`response failed: ${errMsg}`);
          this.emit("error", new Error(errMsg));
        } else if (status === "incomplete" && reason === "max_output_tokens") {
          // Response got truncated. Let the host recover so the caller
          // hears a completed sentence instead of a cut-off word.
          this.emit("response_truncated");
          // Still flush any accumulated transcript — the partial response was spoken.
          this.emit("response_done");
        } else {
          // Response completed normally — signal host to flush accumulated transcript.
          this.emit("response_done");
        }
        break;
      }

      // ── Session events ─────────────────────────────────────────────
      case "session.created":
        this._log(`${evt.type}: id=${evt.session?.id || "?"}`);
        break;

      case "session.updated":
        this._log(`${evt.type}: id=${evt.session?.id || "?"}`);
        // Fire "ready" only AFTER OpenAI confirms session is configured.
        // This prevents triggerResponse() from racing the config.
        if (!this._ready) {
          this._ready = true;
          if (!this._everReady) {
            this._everReady = true;
            this.emit("ready");          // first time → host triggers the greeting
          } else {
            this._reconnects = 0;        // healthy again — reset the budget
            this._log("session re-established after reconnect (same voice) — no re-greeting");
            this.emit("reconnected");    // host need not act; caller's next turn continues
          }
        }
        break;

      // ── Speech detection ───────────────────────────────────────────
      case "input_audio_buffer.speech_started":
        // Track when user starts so we can measure burst duration below.
        this._speechStartedAt = Date.now();
        // GA: with `interrupt_response: true` in turn_detection, OpenAI
        // cancels the in-flight response server-side automatically.
        // We just hard-suppress our audio forwarding so the caller doesn't
        // hear queued tail audio before Twilio's WS catches up.
        // Do NOT send response.cancel here — by the time it arrives OpenAI
        // has already cancelled, producing "no active response found" errors.
        if (this._currentResponseId) {
          this._suppressAudioUntilNextResponse = true;
          this.emit("barge_in");
        }
        this.emit("speech_started");
        break;

      case "input_audio_buffer.speech_stopped":
        // Measure how long the user actually spoke.  Real speech is usually
        // > 350ms even for a single word.  Bursts shorter than that are
        // overwhelmingly noise, breath, or echo of our own audio.
        if (this._speechStartedAt) {
          this._lastSpeechDurationMs = Date.now() - this._speechStartedAt;
          this._speechStartedAt = 0;
        }
        this.emit("speech_stopped");
        break;

      case "response.created":
        this._currentResponseId = evt.response?.id || "pending";
        // Clear any barge-in audio suppression — new response, fresh audio.
        this._suppressAudioUntilNextResponse = false;
        // Phantom-response guard: if `create_response: true` fired off a
        // very short burst (< 350ms = noise/echo), cancel it immediately.
        // The initial greeting bypasses this since it has no prior speech.
        if (this._allowEmptyResponse) {
          this._allowEmptyResponse = false; // only the first one
        } else if (this._lastSpeechDurationMs > 0 && this._lastSpeechDurationMs < this._phantomThresholdMs) {
          this._log(`phantom response (speech ${this._lastSpeechDurationMs}ms < ${this._phantomThresholdMs}ms, vad=${this._vadMode}) - cancelling`);
          try { this._send("response.cancel", {}); } catch (_) {}
        }
        // Reset for next turn
        this._lastSpeechDurationMs = 0;
        break;

      // ── Transcription failure — log but don't crash ────────────────
      case "conversation.item.input_audio_transcription.failed":
        this._log(`input transcription failed: ${evt.error?.message || "unknown"}`);
        break;

      // ── Rate limit info ────────────────────────────────────────────
      case "rate_limits.updated":
        // Useful for monitoring but not critical
        break;

      // ── Error events ───────────────────────────────────────────────
      case "error": {
        const msg = evt.error?.message || JSON.stringify(evt.error || {});
        this._log(`API error: ${msg}`);
        this.emit("error", new Error(msg));
        break;
      }

      default:
        // Other events: response.created, response.output_item.added, etc.
        // Ignore silently — they're status updates we don't need to act on.
        break;
    }
  }
}

module.exports = {RealtimeBridge, buildTurnDetection, phantomThresholdMs};
