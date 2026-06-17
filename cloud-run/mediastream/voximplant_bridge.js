/**
 * voximplant_bridge.js — adapter that lets the existing Twilio-shaped
 * `handleGeminiSession(ws, ctx)` work over a Voximplant WebSocket.
 *
 * Approach: rather than fork the entire Gemini session handler (call
 * tracking, KB injection, tool execution, telemetry, recording — ~500
 * lines), we hand it a wrapper object that QUACKS like a Twilio ws but
 * speaks Voximplant's binary PCM16 protocol on the wire.
 *
 * Wire format on the real Voximplant ws:
 *   • Text frames  — JSON metadata (hello, ack, etc.)
 *   • Binary frames — raw PCM16LE @ 8 kHz, both directions
 *
 * Wire format the handler expects (Twilio-style):
 *   • String frames: JSON envelopes {event: "connected"|"start"|"media"|"stop", ...}
 *   • media event:   { event:"media", media:{payload:"<base64 mulaw 8k>"} }
 *   • outgoing:      handler calls ws.send(JSON.stringify({event:"media", streamSid, media:{payload}}))
 *
 * The adapter translates between these:
 *   inbound  voxWs binary PCM16  →  encode µ-law  →  synthesize Twilio
 *                                                       "media" event
 *   outbound handler sends "media" with µ-law payload → decode µ-law →
 *                                                       binary PCM16 to voxWs
 *
 * `connected` and `start` events are synthesized by the adapter at
 * construction time — the handler needs them to know setup is complete
 * and to capture the streamSid/callSid (we substitute the callSessionId
 * for both since Voximplant doesn't use Twilio's identifiers).
 */

"use strict";

const { EventEmitter } = require("events");
const { pcm16ToMulawBase64, mulawBase64ToPcm16 } = require("./voximplant_audio.js");

/**
 * Create a Twilio-shaped ws wrapper from a real Voximplant ws.
 *
 * @param {WebSocket} voxWs   — the actual express-ws socket connected to VoxEngine.
 * @param {string}   callSessionId — synthesized as streamSid/callSid in start event.
 * @param {object}  opts      — { from, to, greeting } from the scenario hello frame.
 * @returns {EventEmitter & { send: Function, close: Function, readyState: number }}
 */
function createAdapter(voxWs, callSessionId, opts = {}) {
  const adapter = new EventEmitter();

  // Mirror express-ws ws shape that handleGeminiSession reads.
  adapter.readyState = 1;            // OPEN
  Object.defineProperty(adapter, "OPEN", { value: 1 });

  // ── Delivery queue ──────────────────────────────────────────────────
  // handleGeminiSession attaches its message handler LATE — only after
  // several awaited Firestore reads (policy, KB) — via the route's
  // markSetupComplete → adapter.on("message", handler). Anything emitted
  // before that (the synthesized handshake, early caller audio) would
  // vanish. Queue until the first "message" listener attaches, then flush
  // in order.
  const pendingToHandler = [];
  let handlerAttached = false;
  // Frame counters — log the FIRST inbound (caller→us) and outbound (us→caller)
  // audio frame so a silent call can be diagnosed: which direction is dead.
  let inAudioFrames = 0;
  let outAudioFrames = 0;
  const _seenEventKeys = new Set();

  function deliver(json) {
    if (handlerAttached) adapter.emit("message", json);
    else pendingToHandler.push(json);
  }

  const origOn = adapter.on.bind(adapter);
  adapter.on = (event, fn) => {
    origOn(event, fn);
    if (event === "message" && !handlerAttached) {
      handlerAttached = true;
      // Flush on next tick so the caller finishes its own wiring first.
      setImmediate(() => {
        for (const json of pendingToHandler.splice(0)) adapter.emit("message", json);
      });
    }
    return adapter;
  };

  // ── Synthesize the Twilio handshake events ─────────────────────────
  // Queued immediately; delivered as soon as the handler attaches.
  deliver(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  deliver(JSON.stringify({
    event: "start",
    streamSid: callSessionId,            // Twilio uses different IDs; we reuse our session id
    start: {
      streamSid: callSessionId,
      callSid:   callSessionId,
      from:      opts.from || "",
      to:        opts.to   || "",
      accountSid: "voximplant",
      customParameters: { provider: "voximplant" },
      mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
    },
  }));

  // ── Inbound: Voximplant JSON "media" frames → Twilio-shaped "media" events ─
  // CONFIRMED wire format (diagnostic 2026-06-15): Voximplant sends ALL audio as
  // JSON TEXT frames, NOT raw binary:
  //   {"event":"media","sequenceNumber":N,"media":{"timestamp":T,"payload":"<b64>"}}
  // The payload is base64 PCM16LE @ 8 kHz (encoding PCM8 — Voximplant's default).
  // Our Gemini handler expects Twilio-style media events carrying µ-law base64, so
  // we transcode PCM16→µ-law here. (Earlier the adapter treated these JSON frames
  // as "text/hello" and discarded every one → caller audio never reached the bot.)
  voxWs.on("message", (raw, isBinary) => {
    let obj;
    try { obj = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw)); }
    catch (_) { return; }   // Voximplant audio is always JSON text; ignore anything else

    if (obj.event === "media" && obj.media && obj.media.payload) {
      // base64 PCM16LE 8 kHz → µ-law base64 (both 8 kHz, no resample needed).
      const pcm16 = Buffer.from(obj.media.payload, "base64");
      const mulawB64 = pcm16ToMulawBase64(pcm16);
      if (++inAudioFrames === 1) {
        console.log(`[VOX-WS] first INBOUND audio frame: ${pcm16.length}B PCM16 → µ-law (session ${callSessionId})`);
      }
      deliver(JSON.stringify({
        event: "media",
        streamSid: callSessionId,
        media: { payload: mulawB64, track: "inbound" },
      }));
    } else if (obj.event === "dtmf" && obj.dtmf) {
      // Scenario forwards caller key presses (CallEvents.ToneReceived) as a
      // Twilio-shaped dtmf frame — pass straight through to the handler.
      deliver(JSON.stringify({ event: "dtmf", streamSid: callSessionId, dtmf: { digit: obj.dtmf.digit } }));
    } else if (obj.type === "voximplant.hello") {
      console.log(`[VOX-WS] hello from session ${obj.callSessionId || callSessionId}: from=${obj.from} to=${obj.to}`);
    } else {
      // Log the FIRST occurrence of every other event/structure Voximplant sends
      // — this surfaces any error/ack it returns about our OUTBOUND playback
      // frames (which would explain why the caller hears nothing).
      const key = obj.event || obj.type || Object.keys(obj).join(",");
      if (!_seenEventKeys.has(key)) {
        _seenEventKeys.add(key);
        console.log(`[VOX-WS] non-media frame key="${key}": ${JSON.stringify(obj).slice(0, 200)}`);
      }
    }
  });

  voxWs.on("close", () => {
    adapter.readyState = 3;            // CLOSED
    adapter.emit("close");
  });

  voxWs.on("error", (err) => {
    console.warn(`[VOX-WS] underlying ws error: ${err && err.message ? err.message : err}`);
    adapter.emit("error", err);
  });

  // ── Outbound: handler "media" (µ-law b64) → Voximplant JSON "media" (PCM16 b64) ─
  // Voximplant plays audio sent back as JSON in the SAME shape it sends, with a
  // base64 PCM16LE @ 8 kHz payload. The handler hands us µ-law base64 (Twilio
  // shape), so decode µ-law → PCM16 → base64 and wrap in a JSON media frame.
  // (Earlier we sent raw BINARY PCM, which Voximplant's JSON socket ignored →
  // caller heard silence.)
  let _outSeq = 0;
  let _outTs = 0;        // sample clock — Voximplant inbound frames carry media.timestamp
  adapter.send = (data) => {
    if (typeof data !== "string") return;   // handler only sends JSON envelopes
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }

    if (msg.event === "media" && msg.media && msg.media.payload) {
      const pcmBuf = mulawBase64ToPcm16(msg.media.payload);   // µ-law b64 → PCM16 buffer
      const pcmB64 = pcmBuf.toString("base64");
      const samples = pcmBuf.length >> 1;   // 2 bytes/sample @ 8kHz
      if (++outAudioFrames === 1) {
        console.log(`[VOX-WS] first OUTBOUND audio frame → JSON media, ${pcmBuf.length}B PCM16 (session ${callSessionId})`);
      }
      try {
        // Mirror Voximplant's OWN inbound frame shape exactly, including
        // media.timestamp (a running sample count). The earlier omission of
        // timestamp is the most likely reason playback was silently dropped.
        voxWs.send(JSON.stringify({
          event: "media",
          sequenceNumber: ++_outSeq,
          media: { timestamp: _outTs, payload: pcmB64 },
        }));
        _outTs += samples;
      } catch (e) { console.warn(`[VOX-WS] send media to voxWs failed: ${e.message}`); }
    }
    // mark/clear control events — Voximplant has no equivalent; ignore.
  };

  adapter.close = (code, reason) => {
    try { voxWs.close(code, reason); } catch (_) {}
  };

  return adapter;
}

module.exports = { createAdapter };
