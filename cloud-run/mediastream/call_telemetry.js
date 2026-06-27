/**
 * Super-admin call telemetry collector
 *
 * Tracks every meaningful event, timing milestone, tool call, and error
 * throughout a call session.  At call-end, computes performance insights
 * and writes a single document to Firestore:
 *
 *   super_admin_call_logs/{callSessionId}
 *
 * Only super-admin users can read from this collection (enforced at the
 * Firebase Function + Firestore rules level).
 */

"use strict";

class CallTelemetry {
  /**
   * @param {object} opts
   * @param {string}  opts.callSessionId
   * @param {string}  opts.mode          "realtime" | "standard"
   * @param {string}  [opts.assistantId]
   * @param {string}  [opts.ownerId]
   * @param {string}  [opts.language]
   * @param {string}  [opts.voice]
   * @param {object}  opts.db            Firestore instance
   */
  constructor({callSessionId, mode, assistantId, ownerId, language, voice, db}) {
    this._db        = db;
    this._startMs   = Date.now();
    this._turnOpen  = null;  // ms of last speech_started
    this._speechEndMs = null;
    this._firstAudioAfterSpeech = null; // ms when first bot audio arrived post-speech
    this._toolInFlight = {}; // id → startMs

    this.data = {
      callSessionId,
      assistantId:  assistantId  || null,
      ownerId:      ownerId      || null,
      mode,
      language:     language     || null,
      voice:        voice        || null,
      startAt:      new Date(),
      endAt:        null,
      durationMs:   null,

      // ── Timing milestones (offset from call start, in ms) ──────────
      milestones: {
        // wsOpen: 0 (implicit)
        // bridgeReady: <n>
        // streamStarted: <n>
        // firstUserSpeech: <n>
        // firstBotAudio: <n>
        // callEnd: <n>
      },

      // ── Counters ────────────────────────────────────────────────────
      turnCount:       0,
      bargeInCount:    0,
      stallCount:      0,
      truncationCount: 0,
      toolCallCount:   0,
      errorCount:      0,
      audioPacketsIn:  0,
      audioPacketsOut: 0,

      // ── Per-turn breakdown ──────────────────────────────────────────
      turns: [],

      // ── Tool call log ───────────────────────────────────────────────
      toolCalls: [],

      // ── Chronological event timeline ────────────────────────────────
      events: [],

      // ── Errors ──────────────────────────────────────────────────────
      errors: [],

      // ── Computed insights (filled at finalize) ───────────────────────
      insights: {},

      // ── Cost (copied from existing cost tracker at call end) ────────
      costs: null,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  _now() { return Date.now() - this._startMs; }

  _push(e, d) {
    const entry = {t: this._now(), e};
    if (d !== undefined && d !== null) entry.d = d;
    this.data.events.push(entry);
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Record a named milestone (fires once, idempotent after first call) */
  milestone(name) {
    if (this.data.milestones[name] !== undefined) return;
    this.data.milestones[name] = this._now();
    this._push(name);
  }

  /** Generic event (anything not already covered by a specific method) */
  event(name, detail) { this._push(name, detail); }

  // ── Turn lifecycle ────────────────────────────────────────────────────

  /** Call when VAD detects user started speaking */
  speechStarted() {
    this._turnOpen = Date.now();
    this._firstAudioAfterSpeech = null;
    if (!this.data.milestones.firstUserSpeech) this.milestone("firstUserSpeech");
    this._push("speech_started");
  }

  /** Call when VAD detects user stopped speaking */
  speechStopped() {
    this._speechEndMs = Date.now();
    this._push("speech_stopped");
  }

  /**
   * Call when the first bot audio packet is sent AFTER a user turn.
   * This is the "response-start latency" — time from speech end to first audio out.
   */
  firstBotAudioAfterTurn() {
    if (this._firstAudioAfterSpeech !== null) return; // already recorded
    this._firstAudioAfterSpeech = Date.now();
    if (!this.data.milestones.firstBotAudio) this.milestone("firstBotAudio");
    const latMs = this._speechEndMs ? this._firstAudioAfterSpeech - this._speechEndMs : null;
    this._push("first_bot_audio", {rtLatencyMs: latMs});
  }

  /**
   * Record a completed conversation turn.
   * In RT mode: pass rtLatencyMs (speech_stopped → first audio).
   * In standard mode: pass sttMs, llmMs, ttsMs individually.
   */
  turnDone({userText, assistantText, sttMs, llmMs, ttsMs, rtLatencyMs, bargedIn, toolNames = []}) {
    const totalMs = sttMs != null
      ? (sttMs || 0) + (llmMs || 0) + (ttsMs || 0)  // standard: sum of stages
      : (rtLatencyMs != null ? rtLatencyMs : null);  // RT: end-to-end

    const turn = {
      i:      this.data.turnCount,
      tOffset: this._now(),
      user:   (userText    || "").slice(0, 200),
      bot:    (assistantText || "").slice(0, 200),
      totalMs,
      ...(sttMs != null ? {sttMs, llmMs, ttsMs} : {}),
      ...(rtLatencyMs != null ? {rtLatencyMs} : {}),
      bargedIn: !!bargedIn,
      tools:  toolNames,
    };
    this.data.turns.push(turn);
    this.data.turnCount++;
    this._push("turn_done", {i: turn.i, ms: totalMs, bargedIn: turn.bargedIn});
    return turn;
  }

  // ── Tool calls ────────────────────────────────────────────────────────

  toolStart(name) {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this._toolInFlight[id] = Date.now();
    this.data.toolCallCount++;
    this._push("tool_start", {name});
    return id;
  }

  toolDone(id, name, success, resultLen) {
    const startMs = this._toolInFlight[id];
    delete this._toolInFlight[id];
    const latencyMs = startMs ? Date.now() - startMs : null;
    this.data.toolCalls.push({name, latencyMs, success, resultLen: resultLen || 0});
    this._push("tool_done", {name, ms: latencyMs, ok: success});
  }

  // ── Reliability events ────────────────────────────────────────────────

  bargeIn()     { this.data.bargeInCount++;    this._push("barge_in"); }
  stall()       { this.data.stallCount++;      this._push("stall"); }
  truncation()  { this.data.truncationCount++; this._push("truncation"); }

  error(code, message) {
    this.data.errorCount++;
    this.data.errors.push({t: this._now(), code, msg: (message || "").slice(0, 400)});
    this._push("error", {code});
  }

  // ── Audio counters ────────────────────────────────────────────────────

  countAudioIn(n = 1)  { this.data.audioPacketsIn  += n; }
  countAudioOut(n = 1) { this.data.audioPacketsOut += n; }

  // ── Finalize ──────────────────────────────────────────────────────────

  /**
   * Compute insights and persist to Firestore.
   * Call this once at the end of the call (ws.on("close")).
   * @param {object} [costs]  The costs object already computed by the call handler
   */
  async finalize(costs) {
    this.data.endAt   = new Date();
    this.data.durationMs = Date.now() - this._startMs;
    this.data.milestones.callEnd = this._now();
    this._push("call_end");

    if (costs) this.data.costs = costs;

    // ── Compute insights ────────────────────────────────────────────
    const turns = this.data.turns;
    const n     = turns.length;
    const ins   = {};

    if (n > 0) {
      const latencies   = turns.map(t => t.totalMs).filter(v => v != null);
      const sorted      = [...latencies].sort((a, b) => a - b);
      ins.avgTurnLatencyMs  = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
      ins.minTurnLatencyMs  = sorted[0] ?? null;
      ins.maxTurnLatencyMs  = sorted[sorted.length - 1] ?? null;
      ins.p50TurnLatencyMs  = sorted[Math.floor(sorted.length * 0.50)] ?? null;
      ins.p75TurnLatencyMs  = sorted[Math.floor(sorted.length * 0.75)] ?? null;
      ins.p95TurnLatencyMs  = sorted[Math.floor(sorted.length * 0.95)] ?? null;

      if (this.data.mode === "standard") {
        const sttVals = turns.map(t => t.sttMs).filter(v => v != null);
        const llmVals = turns.map(t => t.llmMs).filter(v => v != null);
        const ttsVals = turns.map(t => t.ttsMs).filter(v => v != null);
        ins.avgSttMs = sttVals.length ? Math.round(sttVals.reduce((a,b)=>a+b,0)/sttVals.length) : null;
        ins.avgLlmMs = llmVals.length ? Math.round(llmVals.reduce((a,b)=>a+b,0)/llmVals.length) : null;
        ins.avgTtsMs = ttsVals.length ? Math.round(ttsVals.reduce((a,b)=>a+b,0)/ttsVals.length) : null;
      }

      ins.bargeInRate   = +(this.data.bargeInCount  / n).toFixed(2);
      ins.stallRate     = +(this.data.stallCount     / n).toFixed(2);
    }

    ins.greetingLatencyMs = this.data.milestones.firstBotAudio ?? null;
    ins.setupLatencyMs    = this.data.milestones.bridgeReady   ?? null;
    ins.streamStartMs     = this.data.milestones.streamStarted ?? null;

    const toolOk = this.data.toolCalls.filter(t => t.success).length;
    ins.toolCallSuccessRate = this.data.toolCallCount > 0
      ? +(toolOk / this.data.toolCallCount).toFixed(2) : null;

    ins.health = this._computeHealth(ins);
    this.data.insights = ins;

    // ── Persist ─────────────────────────────────────────────────────
    try {
      await this._db.collection("super_admin_call_logs").doc(this.data.callSessionId).set(this.data);
      console.log(`[TELEMETRY] Written for ${this.data.callSessionId} — health=${ins.health}`);
    } catch (e) {
      console.error(`[TELEMETRY] Failed to write: ${e.message}`);
    }
  }

  _computeHealth(ins) {
    const issues = [];
    if ((ins.avgTurnLatencyMs || 0) > 3500) issues.push("HIGH_LATENCY");
    if ((ins.p95TurnLatencyMs || 0) > 8000) issues.push("LATENCY_SPIKES");
    if (this.data.stallCount > 0)           issues.push("STALLS");
    if (this.data.errorCount > 1)           issues.push("ERRORS");
    if ((ins.bargeInRate || 0) > 0.4)       issues.push("EXCESSIVE_BARGE_IN");
    if ((ins.greetingLatencyMs || 0) > 5000) issues.push("SLOW_GREETING");
    if ((ins.toolCallSuccessRate || 1) < 0.7) issues.push("TOOL_FAILURES");
    return issues.length === 0 ? "good"
         : issues.length <= 2  ? "warn"
         :                       "critical";
  }
}

module.exports = {CallTelemetry};
