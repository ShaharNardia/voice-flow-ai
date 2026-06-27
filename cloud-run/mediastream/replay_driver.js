/**
 * replay_driver.js — drive the REAL voice pipeline with synthetic caller audio
 * and capture the bot's real audio, so a past call can be "re-run as a live
 * voice call" against the assistant's CURRENT prompt/flow/tools/KB.
 *
 * How it works (same trick as voximplant_bridge.js): we hand the existing
 * handleRealtimeSession / handleGeminiSession a wrapper object that QUACKS like
 * a Twilio express-ws socket — it synthesizes the connected/start handshake,
 * lets the handler attach its message listener via markSetupComplete, captures
 * every outbound `media` frame (the bot's µ-law audio), and lets us inject
 * inbound `media` frames (the caller's µ-law audio).
 *
 * A continuous 20ms "pump" feeds the stream exactly like Twilio does: real
 * caller speech when queued, otherwise silence — so server-side VAD sees the
 * energy drop at the end of each caller turn and closes it naturally. After
 * each caller turn we wait for the bot to go idle (no outbound audio for
 * idleMs) before feeding the next turn.
 *
 * The captured caller + bot frames are concatenated in real add-order into a
 * single mono PCM16 8 kHz timeline and wrapped as a WAV — a faithful recording
 * of the conversation you can listen to.
 *
 * This module is pure (no network, no Firestore). The endpoint supplies the
 * TTS'd caller frames and runs the real handler; everything here is unit
 * testable with a fake handler.
 */

"use strict";

const { EventEmitter } = require("events");
const { pcm16ToMulawBase64, mulawBase64ToPcm16 } = require("./voximplant_audio.js");

const SAMPLE_RATE = 8000;
const FRAME_SAMPLES = 160;             // 20 ms @ 8 kHz
const FRAME_BYTES = FRAME_SAMPLES * 2; // PCM16 = 2 bytes/sample
const SILENCE_FRAME_B64 = pcm16ToMulawBase64(Buffer.alloc(FRAME_BYTES)); // 20ms of µ-law silence

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip a RIFF/WAV header (if present) and return raw PCM16 bytes. Google TTS
 * LINEAR16 output is wrapped in a WAV container; the live mic path is raw.
 */
function stripWavHeader(buf) {
  if (buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF") {
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === "data") return buf.slice(off + 8, Math.min(off + 8 + size, buf.length));
      off += 8 + size + (size & 1);
    }
  }
  return buf;
}

/** PCM16 8 kHz buffer → array of 20 ms µ-law base64 frames (Twilio media payloads). */
function pcm16ToMulawFrames(pcm16) {
  const frames = [];
  for (let i = 0; i + 2 <= pcm16.length; i += FRAME_BYTES) {
    frames.push(pcm16ToMulawBase64(pcm16.slice(i, Math.min(i + FRAME_BYTES, pcm16.length))));
  }
  return frames;
}

/** Wrap a mono PCM16 buffer as a WAV file. */
function pcmToWav(pcm, sampleRate = SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                 // PCM
  header.writeUInt16LE(1, 22);                 // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);    // byte rate
  header.writeUInt16LE(2, 32);                 // block align
  header.writeUInt16LE(16, 34);                // bits/sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Build the conversation WAV + per-block offsets from captured frames.
 * Frames are concatenated in add-order (chronological); consecutive same-role
 * frames merge into one block so the UI can show "caller / bot" turn offsets.
 *
 * @param {{role:string, pcm16:Buffer}[]} frames
 * @returns {{ wav: Buffer, durationMs: number, blocks: {role,startMs,durMs}[] }}
 */
function buildConversation(frames) {
  const parts = [];
  const blocks = [];
  let sample = 0;     // running sample offset
  let cur = null;
  for (const f of frames) {
    parts.push(f.pcm16);
    const n = f.pcm16.length >> 1;
    if (!cur || cur.role !== f.role) {
      if (cur) blocks.push(cur);
      cur = { role: f.role, startMs: Math.round((sample / SAMPLE_RATE) * 1000), durMs: 0, _samples: 0 };
    }
    cur._samples += n;
    cur.durMs = Math.round((cur._samples / SAMPLE_RATE) * 1000);
    sample += n;
  }
  if (cur) blocks.push(cur);
  for (const b of blocks) delete b._samples;
  const pcm = Buffer.concat(parts);
  return { wav: pcmToWav(pcm), durationMs: Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000), blocks };
}

/**
 * Create a Twilio-shaped wrapper the session handlers can drive. Captures the
 * bot's outbound audio and lets the caller's audio be injected frame by frame.
 *
 * @param {string} callSessionId
 * @param {object} opts  { from, to, clock? }  clock() → ms (injectable for tests)
 */
function createReplayAdapter(callSessionId, opts = {}) {
  const adapter = new EventEmitter();
  adapter.readyState = 1;                       // OPEN
  Object.defineProperty(adapter, "OPEN", { value: 1 });

  const clock = opts.clock || (() => Date.now());
  const frames = [];                            // { role:"caller"|"bot", pcm16:Buffer } in add-order
  const pending = [];
  let handlerAttached = false;
  let lastOutboundAt = 0;
  let firstOutboundAt = 0;
  let outboundFrames = 0;

  function deliver(json) {
    if (handlerAttached) adapter.emit("message", json);
    else pending.push(json);
  }
  const origOn = adapter.on.bind(adapter);
  adapter.on = (event, fn) => {
    origOn(event, fn);
    if (event === "message" && !handlerAttached) {
      handlerAttached = true;
      setImmediate(() => { for (const j of pending.splice(0)) adapter.emit("message", j); });
    }
    return adapter;
  };

  // Synthesized Twilio handshake — queued, flushed when the handler attaches.
  deliver(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  deliver(JSON.stringify({
    event: "start",
    streamSid: callSessionId,
    start: {
      streamSid: callSessionId,
      callSid: callSessionId,
      from: opts.from || "",
      to: opts.to || "",
      accountSid: "replay",
      customParameters: { provider: "replay" },
      mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
    },
  }));

  // Outbound: the bot's audio (and control frames we ignore).
  adapter.send = (data) => {
    if (typeof data !== "string") return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.event === "media" && msg.media && msg.media.payload) {
      const now = clock();
      if (!firstOutboundAt) firstOutboundAt = now;
      lastOutboundAt = now;
      outboundFrames++;
      frames.push({ role: "bot", pcm16: mulawBase64ToPcm16(msg.media.payload) });
    }
    // "clear" (barge-in) / "mark" — no wire equivalent here; ignored.
  };

  adapter.close = () => { adapter.readyState = 3; adapter.emit("close"); };

  /** Inject one 20ms caller µ-law frame (counts toward the recording only if real speech). */
  adapter.feedFrame = (mulawB64, isSilence = false) => {
    if (!isSilence) frames.push({ role: "caller", pcm16: mulawBase64ToPcm16(mulawB64) });
    deliver(JSON.stringify({ event: "media", streamSid: callSessionId, media: { payload: mulawB64, track: "inbound" } }));
  };

  adapter.getState = () => ({ lastOutboundAt, firstOutboundAt, outboundFrames });
  adapter.getFrames = () => frames;
  return adapter;
}

/**
 * Drive a full synthetic conversation through `adapter`. Feeds a continuous
 * 20ms stream (caller speech when queued, else silence), waiting for the bot to
 * finish greeting and to reply after each caller turn.
 *
 * @param {EventEmitter} adapter  from createReplayAdapter
 * @param {{text:string, frames:string[]}[]} callerTurns  caller turns, pre-framed to µ-law
 * @param {object} opts
 * @returns {Promise<{wav:Buffer, durationMs:number, blocks:object[], botSpoke:boolean}>}
 */
async function driveConversation(adapter, callerTurns, opts = {}) {
  const frameMs = opts.frameMs ?? 20;
  const trailingSilenceMs = opts.trailingSilenceMs ?? 700;   // let VAD close the caller turn
  const idleMs = opts.idleMs ?? 1200;                        // bot done = no outbound for this long
  const maxTurnWaitMs = opts.maxTurnWaitMs ?? 18000;
  const greetingMaxWaitMs = opts.greetingMaxWaitMs ?? 12000;
  const now = opts.clock || (() => Date.now());

  let queue = [];   // pending caller frames (speech + trailing silence)
  const pump = setInterval(() => {
    const f = queue.length ? queue.shift() : SILENCE_FRAME_B64;
    // Only real speech is recorded into the conversation; silence (trailing or
    // comfort-noise) keeps the stream alive for VAD but isn't part of the audio.
    adapter.feedFrame(f, f === SILENCE_FRAME_B64);
  }, frameMs);

  const waitForBotIdle = async (maxWaitMs) => {
    const started = now();
    const base = adapter.getState().outboundFrames;
    let sawAudio = false;
    while (now() - started < maxWaitMs) {
      const st = adapter.getState();
      if (st.outboundFrames > base) sawAudio = true;
      const sinceLast = st.lastOutboundAt ? now() - st.lastOutboundAt : Infinity;
      if (sawAudio && sinceLast > idleMs && queue.length === 0) break;
      await sleep(Math.max(20, frameMs * 2));
    }
    return sawAudio;
  };

  let botSpoke = false;
  try {
    botSpoke = await waitForBotIdle(greetingMaxWaitMs) || botSpoke;   // initial greeting
    for (const turn of callerTurns) {
      queue.push(...turn.frames);
      const nSilence = Math.max(1, Math.round(trailingSilenceMs / frameMs));
      for (let i = 0; i < nSilence; i++) queue.push(SILENCE_FRAME_B64);
      while (queue.length) await sleep(frameMs);                       // wait until the caller finishes
      botSpoke = await waitForBotIdle(maxTurnWaitMs) || botSpoke;      // wait for the reply
    }
  } finally {
    clearInterval(pump);
  }
  adapter.close();
  const built = buildConversation(adapter.getFrames());
  return { ...built, botSpoke };
}

module.exports = {
  createReplayAdapter,
  driveConversation,
  buildConversation,
  pcm16ToMulawFrames,
  stripWavHeader,
  pcmToWav,
  SAMPLE_RATE,
  FRAME_BYTES,
  SILENCE_FRAME_B64,
};
