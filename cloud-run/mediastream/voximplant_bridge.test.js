/**
 * Adapter tests — the Twilio-shaped wrapper around a Voximplant ws.
 * Run: node --test cloud-run/mediastream/voximplant_bridge.test.js
 *
 * Covers the three failure modes found during review:
 *   1. Handshake fired before the handler attached → lost "start" → no greeting
 *   2. JSON hello text frame misclassified as PCM audio
 *   3. Outbound media envelope → binary PCM on the vox ws
 */

"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const { createAdapter } = require("./voximplant_bridge.js");
const { pcm16ToMulawBase64 } = require("./voximplant_audio.js");

class FakeVoxWs extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit("close"); }
}

function tick() { return new Promise((r) => setImmediate(r)); }

test("handshake (connected + start) is delivered even when the handler attaches late", async () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-1", { from: "+972501234567", to: "+12025550199" });

  // Simulate handleGeminiSession's async delay before markSetupComplete.
  await tick(); await tick(); await tick();

  const received = [];
  adapter.on("message", (json) => received.push(JSON.parse(json)));
  await tick();   // queue flush happens on next tick

  assert.equal(received.length, 2, "connected + start delivered");
  assert.equal(received[0].event, "connected");
  assert.equal(received[1].event, "start");
  assert.equal(received[1].start.from, "+972501234567");
  assert.equal(received[1].start.callSid, "sess-1");
});

test("early caller audio is queued and delivered after the handler attaches, in order", async () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-2", {});

  // Voximplant sends audio as JSON "media" text frames (base64 PCM16 8k), NOT
  // raw binary. Two arrive BEFORE the handler attaches → must be queued.
  const pcmB64 = Buffer.alloc(320).toString("base64");   // 20ms PCM16 silence
  const mediaFrame = Buffer.from(JSON.stringify({ event: "media", media: { payload: pcmB64 } }));
  voxWs.emit("message", mediaFrame, false);
  voxWs.emit("message", mediaFrame, false);

  const received = [];
  adapter.on("message", (json) => received.push(JSON.parse(json)));
  await tick();

  assert.equal(received.length, 4, "connected, start, then 2 media frames");
  assert.equal(received[2].event, "media");
  assert.equal(received[3].event, "media");
  assert.ok(received[2].media.payload.length > 0, "media carries transcoded µ-law payload");
});

test("JSON hello text frame is NOT transcoded as audio", async () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-3", {});
  const received = [];
  adapter.on("message", (json) => received.push(JSON.parse(json)));
  await tick();

  // ws@8 delivers text frames as Buffers with isBinary=false.
  const hello = Buffer.from(JSON.stringify({ type: "voximplant.hello", callSessionId: "sess-3" }));
  voxWs.emit("message", hello, false);
  await tick();

  const mediaEvents = received.filter((m) => m.event === "media");
  assert.equal(mediaEvents.length, 0, "hello frame must not become a media event");
});

test("non-JSON binary frame is ignored (Voximplant audio is always JSON text)", async () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-4", {});
  const received = [];
  adapter.on("message", (json) => received.push(JSON.parse(json)));
  await tick();

  const pcm = Buffer.alloc(320, 0x55);       // raw bytes, not JSON
  voxWs.emit("message", pcm, undefined);
  await tick();

  assert.equal(received.filter((m) => m.event === "media").length, 0,
    "raw binary is not parseable JSON → no media event");
});

test("outbound Twilio media envelope → Voximplant JSON media frame (PCM16 b64)", () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-5", {});

  // Build a µ-law payload from 10ms of PCM silence, ship it back through.
  const mulawB64 = pcm16ToMulawBase64(Buffer.alloc(160));   // 160B PCM16 → 80 µ-law bytes
  adapter.send(JSON.stringify({ event: "media", streamSid: "x", media: { payload: mulawB64 } }));

  assert.equal(voxWs.sent.length, 1, "one JSON frame sent to vox ws");
  const out = voxWs.sent[0];
  assert.equal(typeof out, "string", "Voximplant frames are JSON text, not raw binary");
  const frame = JSON.parse(out);
  assert.equal(frame.event, "media");
  assert.equal(typeof frame.sequenceNumber, "number");
  assert.ok(frame.media && typeof frame.media.timestamp === "number", "carries sample-clock timestamp");
  const pcm = Buffer.from(frame.media.payload, "base64");
  assert.equal(pcm.length, 160, "80 µ-law bytes → 160 PCM16 bytes");
});

test("clear/mark events are ignored, close propagates both ways", () => {
  const voxWs = new FakeVoxWs();
  const adapter = createAdapter(voxWs, "sess-6", {});

  adapter.send(JSON.stringify({ event: "clear", streamSid: "x" }));
  adapter.send(JSON.stringify({ event: "mark",  streamSid: "x" }));
  assert.equal(voxWs.sent.length, 0, "control events don't hit the wire");

  let closed = false;
  adapter.on("close", () => { closed = true; });
  voxWs.close();
  assert.equal(closed, true, "vox ws close surfaces on the adapter");
  assert.equal(adapter.readyState, 3);
});
