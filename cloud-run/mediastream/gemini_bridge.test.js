/**
 * GeminiBridge — prewarm / connect / setup race tests.
 *
 * Run: node --test cloud-run/mediastream/gemini_bridge.test.js
 *
 * What's covered:
 *   1. prewarm → connect → open  (setup sent once, after open)
 *   2. prewarm → open → connect  (setup sent once, immediately on connect — the race I fixed)
 *   3. connect() solo (no prewarm) → setup sent once on open (legacy path)
 *
 * Strategy: inject a fake `ws` module into require.cache BEFORE loading
 * gemini_bridge.js. The fake WebSocket is an EventEmitter we drive manually
 * from each test, asserting on .send() calls.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const path = require("path");
const Module = require("module");

// ── Install fake `ws` module BEFORE gemini_bridge is required ────────────

let instances = [];

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  constructor(url) {
    super();
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    instances.push(this);
  }
  send(payload) { this.sent.push(payload); }
  ping() {}
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit("close", 1000, Buffer.from("")); }
  // Test helper — caller controls the "open" moment.
  __open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }
}

// Inject into require.cache so the `require("ws")` inside gemini_bridge
// resolves to FakeWebSocket. Node resolves "ws" via the local node_modules,
// so we mark that resolved path's cache entry with our fake.
const wsResolved = require.resolve("ws", { paths: [path.join(__dirname, "node_modules")] });
require.cache[wsResolved] = {
  id: wsResolved,
  filename: wsResolved,
  loaded: true,
  exports: FakeWebSocket,
};

// Now safe to load the unit under test.
const { GeminiBridge } = require("./gemini_bridge.js");

function makeBridge(overrides = {}) {
  return new GeminiBridge({
    apiKey: "fake-key",
    instructions: "be brief",
    voice: "Aoede",
    language: "en-US",
    callSessionId: "test-call-1",
    tools: [],
    ...overrides,
  });
}

function resetInstances() { instances = []; }

function setupPayloads(ws) {
  // Setup messages are the ones containing a top-level "setup" key.
  return ws.sent.filter((p) => {
    try { return !!JSON.parse(p).setup; } catch { return false; }
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

test("prewarm then connect then open: setup sent once, after open", () => {
  resetInstances();
  const bridge = makeBridge();

  bridge.prewarm();
  assert.equal(instances.length, 1, "prewarm should open exactly one WS");
  const ws = instances[0];
  assert.equal(setupPayloads(ws).length, 0, "no setup before WS open");

  bridge.connect();
  assert.equal(instances.length, 1, "connect after prewarm must NOT open a second WS");
  assert.equal(setupPayloads(ws).length, 0, "still no setup — socket not open yet");

  ws.__open();
  assert.equal(setupPayloads(ws).length, 1, "setup fires exactly once on open");
});

test("prewarm, WS opens BEFORE connect, then connect: setup fires once on connect (the race)", () => {
  resetInstances();
  const bridge = makeBridge();

  bridge.prewarm();
  const ws = instances[0];

  // Simulate the WS handshake finishing before the caller has assembled
  // their instructions and called connect(). This is the exact race that
  // the original prewarm implementation missed.
  ws.__open();
  assert.equal(setupPayloads(ws).length, 0, "no setup until connect() arms it");

  bridge.connect();
  assert.equal(setupPayloads(ws).length, 1, "setup fires when connect() arrives after open");

  // Idempotency: a second connect() must not re-send setup.
  bridge.connect();
  assert.equal(setupPayloads(ws).length, 1, "second connect() does not re-send setup");
});

test("connect() solo (no prewarm): legacy path still works, setup fires once on open", () => {
  resetInstances();
  const bridge = makeBridge();

  bridge.connect();
  assert.equal(instances.length, 1, "connect should open exactly one WS");
  const ws = instances[0];
  assert.equal(setupPayloads(ws).length, 0, "no setup before WS open");

  ws.__open();
  assert.equal(setupPayloads(ws).length, 1, "setup fires once on open");
});

test("setup payload reflects constructor config (voice, model, tools, instructions)", () => {
  resetInstances();
  const bridge = makeBridge({
    voice: "Puck",
    instructions: "respond in Hebrew",
    tools: [{
      type: "function",
      function: { name: "end_call", description: "Hang up", parameters: { type: "object", properties: {} } },
    }],
  });

  bridge.connect();
  instances[0].__open();

  const setupMsg = JSON.parse(setupPayloads(instances[0])[0]).setup;
  assert.ok(setupMsg, "setup envelope present");
  assert.match(setupMsg.model, /^models\//, "model has models/ prefix");
  assert.equal(
    setupMsg.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    "Puck",
  );
  const sysText = setupMsg.systemInstruction?.parts?.[0]?.text || "";
  assert.match(sysText, /respond in Hebrew/, "instructions embedded in systemInstruction");
  const fnNames = (setupMsg.tools?.[0]?.functionDeclarations || []).map((f) => f.name);
  assert.deepEqual(fnNames, ["end_call"], "tool surfaced in functionDeclarations");
});
