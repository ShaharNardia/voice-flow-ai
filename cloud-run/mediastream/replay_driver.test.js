/**
 * replay_driver.js tests.
 * Run: node --test cloud-run/mediastream/replay_driver.test.js
 *
 * Covers the pure audio plumbing (framing, WAV, conversation stitch) and an
 * end-to-end drive against a fake VAD-aware handler that greets and replies —
 * proving the synthetic caller audio reaches the handler and the bot's audio is
 * captured back into a single conversation recording, in the right order.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createReplayAdapter, driveConversation, buildConversation,
  pcm16ToMulawFrames, stripWavHeader, wavToPcm8kMono, pcmToWav, FRAME_BYTES, SILENCE_FRAME_B64,
} = require("./replay_driver.js");
const { pcm16ToMulawBase64 } = require("./voximplant_audio.js");

// A non-silent 20ms speech frame (constant tone — non-zero PCM).
function speechFrame() {
  const pcm = Buffer.alloc(FRAME_BYTES);
  for (let i = 0; i < FRAME_BYTES; i += 2) pcm.writeInt16LE(4000, i);
  return pcm16ToMulawBase64(pcm);
}
// Is a base64 µ-law frame pure silence? (silence µ-law byte is 0xFF.)
function isSilence(b64) {
  const buf = Buffer.from(b64, "base64");
  for (const byte of buf) if (byte !== 0xFF) return false;
  return true;
}

test("pcm16ToMulawFrames splits into 20ms frames", () => {
  const pcm = Buffer.alloc(FRAME_BYTES * 3 + 10);   // 3 full frames + a remainder
  const frames = pcm16ToMulawFrames(pcm);
  assert.equal(frames.length, 4, "3 full + 1 partial frame");
  assert.equal(Buffer.from(frames[0], "base64").length, FRAME_BYTES / 2, "µ-law is half of PCM16");
});

test("stripWavHeader removes a RIFF header, passes raw through", () => {
  const raw = Buffer.alloc(320, 7);
  const wav = pcmToWav(raw);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.deepEqual(stripWavHeader(wav), raw, "header stripped → original PCM");
  assert.deepEqual(stripWavHeader(raw), raw, "raw PCM passes through untouched");
});

// Build a WAV at an arbitrary sample rate (mono PCM16) for the resampler test.
function wavAtRate(rate, samples) {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

test("wavToPcm8kMono resamples 24kHz TTS down to 8kHz (fixes 3x-too-long bug)", () => {
  const wav24 = wavAtRate(24000, 2400);          // 0.1s @ 24kHz
  const pcm8 = wavToPcm8kMono(wav24);
  assert.equal(pcm8.length / 2, 800, "2400 samples @24k → 800 @8k (0.1s preserved)");
  // 8kHz input passes through unchanged (minus the header).
  const wav8 = wavAtRate(8000, 800);
  assert.equal(wavToPcm8kMono(wav8).length / 2, 800, "8kHz passes through");
  // Raw (headerless) buffer is returned as-is.
  const raw = Buffer.alloc(320, 3);
  assert.deepEqual(wavToPcm8kMono(raw), raw);
});

test("buildConversation concatenates frames in order and reports blocks", () => {
  const frame = (role, val) => {
    const pcm = Buffer.alloc(FRAME_BYTES); pcm.fill(val);
    return { role, pcm16: pcm };
  };
  const out = buildConversation([
    frame("bot", 1), frame("bot", 1),       // 40ms bot greeting
    frame("caller", 2),                      // 20ms caller
    frame("bot", 3),                         // 20ms bot reply
  ]);
  assert.equal(out.wav.toString("ascii", 0, 4), "RIFF");
  assert.deepEqual(out.blocks.map((b) => b.role), ["bot", "caller", "bot"], "blocks merge same-role runs");
  assert.equal(out.blocks[0].startMs, 0);
  assert.equal(out.blocks[0].durMs, 40, "two 20ms bot frames = 40ms");
  assert.equal(out.blocks[1].startMs, 40, "caller starts after the greeting");
  assert.equal(out.durationMs, 80, "40+20+20");
});

test("adapter captures bot audio, queues handshake until handler attaches", async () => {
  const adapter = createReplayAdapter("c1", { from: "+1", to: "+2" });
  const got = [];
  adapter.on("message", (j) => got.push(JSON.parse(j)));
  await new Promise((r) => setImmediate(r));        // handshake flush
  assert.equal(got[0].event, "connected");
  assert.equal(got[1].event, "start");
  assert.equal(got[1].start.mediaFormat.encoding, "audio/x-mulaw");

  adapter.send(JSON.stringify({ event: "media", media: { payload: speechFrame() } }));
  assert.equal(adapter.getState().outboundFrames, 1, "bot frame captured");
  assert.equal(adapter.getFrames()[0].role, "bot");
});

// ── Fake handler: greets on start, replies when the caller stops talking ─────
function attachFakeHandler(adapter, { greetingFrames = 4, replyFrames = 3 } = {}) {
  let wasSpeaking = false;
  let repliedThisTurn = false;
  const sendBot = (n) => { for (let i = 0; i < n; i++) adapter.send(JSON.stringify({ event: "media", media: { payload: speechFrame() } })); };
  adapter.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.event === "start") { sendBot(greetingFrames); return; }
    if (m.event === "media" && m.media && m.media.payload) {
      const silent = isSilence(m.media.payload);
      if (!silent) { wasSpeaking = true; repliedThisTurn = false; }
      else if (wasSpeaking && !repliedThisTurn) { repliedThisTurn = true; wasSpeaking = false; sendBot(replyFrames); }
    }
  });
}

test("driveConversation: greeting + 2 caller turns → captured conversation in order", async () => {
  const adapter = createReplayAdapter("c2", {});
  attachFakeHandler(adapter, { greetingFrames: 4, replyFrames: 3 });

  const callerTurns = [
    { text: "שלום", frames: [speechFrame(), speechFrame()] },
    { text: "מה שלומך", frames: [speechFrame(), speechFrame(), speechFrame()] },
  ];

  const res = await driveConversation(adapter, callerTurns, {
    frameMs: 4, trailingSilenceMs: 40, idleMs: 40, greetingMaxWaitMs: 600, maxTurnWaitMs: 800,
  });

  assert.equal(res.botSpoke, true, "the bot produced audio");
  assert.equal(res.wav.toString("ascii", 0, 4), "RIFF");

  const roles = res.blocks.map((b) => b.role);
  assert.equal(roles[0], "bot", "starts with the greeting");
  assert.ok(roles.includes("caller"), "caller audio captured");
  // Expect the alternating shape bot → caller → bot → caller → bot.
  assert.deepEqual(roles, ["bot", "caller", "bot", "caller", "bot"], `got ${roles.join(",")}`);

  // Caller blocks must total the 5 speech frames we fed (silence is not recorded).
  const callerFrames = res.blocks.filter((b) => b.role === "caller").reduce((n, b) => n + Math.round(b.durMs / 20), 0);
  assert.equal(callerFrames, 5, "all caller speech captured, silence excluded");
});

test("driveConversation: a silent bot still completes (botSpoke=false)", async () => {
  const adapter = createReplayAdapter("c3", {});
  // No handler attached at all → the bot never speaks.
  adapter.on("message", () => {});
  const res = await driveConversation(adapter, [{ text: "hi", frames: [speechFrame()] }], {
    frameMs: 4, trailingSilenceMs: 20, idleMs: 30, greetingMaxWaitMs: 120, maxTurnWaitMs: 120,
  });
  assert.equal(res.botSpoke, false, "no bot audio → flagged, not hung");
});
