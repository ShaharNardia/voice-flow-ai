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

  // ── Inbound: voxWs binary frames → synthesize Twilio "media" events ─
  voxWs.on("message", (raw, isBinary) => {
    // ws@8 delivers TEXT frames as Buffers too (isBinary=false), so
    // Buffer.isBuffer alone misclassifies the JSON hello frame as audio.
    // Trust isBinary when present; otherwise sniff for a leading "{".
    const treatAsAudio = (isBinary === true) ||
      (isBinary === undefined && Buffer.isBuffer(raw) && raw.length > 0 && raw[0] !== 0x7B);
    if (treatAsAudio) {
      // Raw PCM16LE @ 8 kHz from VoxEngine. Encode to µ-law and feed the
      // handler as if it came from Twilio.
      const payload = pcm16ToMulawBase64(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
      deliver(JSON.stringify({
        event: "media",
        streamSid: callSessionId,
        media: { payload, track: "inbound" },
      }));
    } else {
      // Text frame — scenario hello / ack / control. Parse for telemetry.
      try {
        const obj = JSON.parse(raw.toString());
        if (obj.type === "voximplant.hello") {
          console.log(`[VOX-WS] hello from session ${obj.callSessionId}: from=${obj.from} to=${obj.to}`);
        }
      } catch (_) { /* ignore non-JSON text frames */ }
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

  // ── Outbound: handler.send(twilioJson) → binary PCM16 to voxWs ──────
  adapter.send = (data) => {
    if (typeof data !== "string") {
      // Handler shouldn't be sending binary in this direction, but if it
      // does, forward unchanged.
      try { voxWs.send(data); } catch (e) { console.warn(`[VOX-WS] forward binary failed: ${e.message}`); }
      return;
    }
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return; }    // unknown payload — drop

    if (msg.event === "media" && msg.media && msg.media.payload) {
      // The handler is shipping TTS audio. Decode µ-law to PCM16 and send
      // as binary on the Vox ws.
      const pcmBuf = mulawBase64ToPcm16(msg.media.payload);
      try { voxWs.send(pcmBuf, { binary: true }); }
      catch (e) { console.warn(`[VOX-WS] send pcm to voxWs failed: ${e.message}`); }
    }
    // Other events (mark, clear) are Twilio-specific control messages.
    // VoxEngine has no equivalent — silently ignore.
  };

  adapter.close = (code, reason) => {
    try { voxWs.close(code, reason); } catch (_) {}
  };

  return adapter;
}

module.exports = { createAdapter };
