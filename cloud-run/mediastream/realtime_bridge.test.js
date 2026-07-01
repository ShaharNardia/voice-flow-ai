/**
 * RealtimeBridge — mid-call WS reconnect tests (the "don't disappear" lock).
 *
 * Run: node --test cloud-run/mediastream/realtime_bridge.test.js
 *
 * What's covered — the resilience path added so an OpenAI Realtime socket that
 * drops mid-call recovers SILENTLY on the SAME voice instead of killing the call:
 *   1. session.updated → "ready" fires exactly once (first config applied)
 *   2. unexpected close → reconnect (new WS), and the 2nd session.updated emits
 *      "reconnected" (NOT a second "ready" — host must not re-greet)
 *   3. reconnect respects MAX_RT_RECONNECT — after the budget it emits "close"
 *   4. an intentional close() never reconnects
 *
 * Strategy mirrors gemini_bridge.test.js: inject a fake `ws` into require.cache
 * BEFORE loading realtime_bridge, and drive the reconnect setTimeout with the
 * node:test mock timer.
 */

"use strict";

const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const path = require("path");

// ── Install fake `ws` module BEFORE realtime_bridge is required ────────────

let instances = [];

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  constructor(url, opts) {
    super();
    this.url = url;
    this.opts = opts;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    instances.push(this);
  }
  send(payload) { this.sent.push(payload); }
  ping() {}
  close() { this.readyState = FakeWebSocket.CLOSED; this.emit("close", 1000, Buffer.from("")); }
  // Test helpers — caller drives the socket lifecycle.
  __open() { this.readyState = FakeWebSocket.OPEN; this.emit("open"); }
  __sessionUpdated() {
    // Minimal envelope that drives _handleEvent down the session.updated branch.
    this.emit("message", Buffer.from(JSON.stringify({ type: "session.updated", session: { id: "sess_x" } })));
  }
  __drop(code = 1011) { this.readyState = FakeWebSocket.CLOSED; this.emit("close", code, Buffer.from("server error")); }
}

const wsResolved = require.resolve("ws", { paths: [path.join(__dirname, "node_modules")] });
require.cache[wsResolved] = { id: wsResolved, filename: wsResolved, loaded: true, exports: FakeWebSocket };

const { RealtimeBridge, phantomThresholdMs } = require("./realtime_bridge.js");

// Emit a typed Realtime event envelope into the bridge.
function evt(ws, type, extra = {}) {
  ws.emit("message", Buffer.from(JSON.stringify({ type, ...extra })));
}
function cancelCount(ws) {
  return ws.sent.filter((p) => { try { return JSON.parse(p).type === "response.cancel"; } catch { return false; } }).length;
}

// Track bridges so we can close() them — the constructor arms ping + hang-check
// setIntervals that otherwise keep the event loop alive and hang the runner.
const _bridges = [];
function makeBridge(overrides = {}) {
  const b = new RealtimeBridge({
    apiKey: "fake-key",
    instructions: "be brief",
    voice: "ash",
    callSessionId: "rt-test-1",
    tools: [],
    ...overrides,
  });
  _bridges.push(b);
  return b;
}
after(() => { for (const b of _bridges) { try { b.close(); } catch (_) {} } });

function resetInstances() { instances = []; }
function lastWs() { return instances[instances.length - 1]; }

// ── Tests ────────────────────────────────────────────────────────────────

test("first session.updated emits 'ready' exactly once", () => {
  resetInstances();
  const bridge = makeBridge();
  let ready = 0, reconnected = 0;
  bridge.on("ready", () => ready++);
  bridge.on("reconnected", () => reconnected++);

  assert.equal(instances.length, 1, "constructor opens one WS");
  lastWs().__open();
  // open → session.update is sent; "ready" only after OpenAI confirms config.
  assert.equal(ready, 0, "no ready before session.updated");
  lastWs().__sessionUpdated();
  assert.equal(ready, 1, "ready fires once on first session.updated");
  assert.equal(reconnected, 0, "no reconnected on the first config");

  // A duplicate session.updated must not re-fire ready (idempotent).
  lastWs().__sessionUpdated();
  assert.equal(ready, 1, "ready does not re-fire");
});

test("unexpected mid-call close → reconnects on a fresh WS and emits 'reconnected' (not a 2nd 'ready')", (t) => {
  resetInstances();
  const bridge = makeBridge({ voice: "ash" });
  let ready = 0, reconnected = 0, closed = false;
  bridge.on("ready", () => ready++);
  bridge.on("reconnected", () => reconnected++);
  bridge.on("close", () => { closed = true; });

  lastWs().__open();
  lastWs().__sessionUpdated();
  assert.equal(ready, 1);

  t.mock.timers.enable({ apis: ["setTimeout"] });   // the reconnect backoff is a setTimeout
  lastWs().__drop(1011);                              // server kills the socket mid-call
  assert.equal(closed, false, "must NOT surface close while a reconnect is pending");
  t.mock.timers.tick(500);                            // first backoff is 400ms
  assert.equal(instances.length, 2, "a fresh WS was opened");

  // The reconnected socket re-applies the SAME session config (same voice).
  lastWs().__open();
  const setup = JSON.parse(lastWs().sent.find((p) => JSON.parse(p).type === "session.update"));
  assert.equal(setup.session.audio.output.voice, "ash", "reconnect keeps the SAME voice — no voice switch");

  lastWs().__sessionUpdated();
  assert.equal(ready, 1, "no SECOND ready — host must not re-greet");
  assert.equal(reconnected, 1, "reconnected fires so the host knows the line is live again");
  assert.equal(closed, false, "call stays up");
});

test("reconnect budget is bounded by MAX_RT_RECONNECT, then the call closes", (t) => {
  resetInstances();
  const bridge = makeBridge();
  let closed = false;
  bridge.on("close", () => { closed = true; });

  lastWs().__open();
  lastWs().__sessionUpdated();   // _everReady = true

  t.mock.timers.enable({ apis: ["setTimeout"] });
  // MAX_RT_RECONNECT = 3. Each drop (without a recovering session.updated to
  // reset the budget) consumes one attempt; the 4th drop exhausts it.
  for (let i = 0; i < 3; i++) {
    lastWs().__drop(1011);
    t.mock.timers.tick(2000);   // clear whatever backoff this attempt used
    lastWs().__open();          // socket reconnects but never re-confirms config
  }
  assert.equal(closed, false, "still trying within budget");
  lastWs().__drop(1011);        // 4th unexpected close — budget exhausted
  assert.equal(closed, true, "after the cap the call closes cleanly instead of looping forever");
});

test("intentional close() never reconnects", (t) => {
  resetInstances();
  const bridge = makeBridge();
  lastWs().__open();
  lastWs().__sessionUpdated();

  t.mock.timers.enable({ apis: ["setTimeout"] });
  bridge.close();                 // host tears the call down on purpose
  t.mock.timers.tick(5000);
  assert.equal(instances.length, 1, "no reconnect after an intentional close()");
});

// ── Phantom-response guard: short real answers must survive (the "bot ignores
//    my first 'כן'/'לא'" bug) while true sub-threshold noise bursts still die ──

test("phantomThresholdMs is mode-aware (semantic=150ms, server/default=300ms)", () => {
  assert.equal(phantomThresholdMs("semantic"), 150);
  assert.equal(phantomThresholdMs("server"), 300);
  assert.equal(phantomThresholdMs(undefined), 300, "unknown mode falls back to the strict server floor");
});

test("semantic VAD keeps a short real answer (~250ms) but cancels a sub-150ms noise blip", (t) => {
  resetInstances();
  const bridge = makeBridge({ vadMode: "semantic" });
  assert.equal(bridge._phantomThresholdMs, 150, "semantic bridge uses the low floor");
  lastWs().__open();
  lastWs().__sessionUpdated();

  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000000 });
  const ws = lastWs();
  // The one-time greeting response consumes the _allowEmptyResponse bypass.
  evt(ws, "response.created", { response: { id: "resp_greet" } });

  // A short but REAL one-word answer (~250ms) — must NOT be cancelled.
  const base = cancelCount(ws);
  evt(ws, "input_audio_buffer.speech_started");
  t.mock.timers.tick(250);
  evt(ws, "input_audio_buffer.speech_stopped");
  evt(ws, "response.created", { response: { id: "resp_real" } });
  assert.equal(cancelCount(ws), base, "250ms answer under semantic VAD is NOT cancelled");

  // A sub-150ms burst (click/echo/breath) — must be cancelled as a phantom.
  evt(ws, "input_audio_buffer.speech_started");
  t.mock.timers.tick(90);
  evt(ws, "input_audio_buffer.speech_stopped");
  evt(ws, "response.created", { response: { id: "resp_noise" } });
  assert.equal(cancelCount(ws), base + 1, "sub-150ms noise blip IS cancelled");
});

test("server VAD keeps the stricter 300ms floor (energy VAD is noisier)", (t) => {
  resetInstances();
  const bridge = makeBridge({ vadMode: "server" });
  assert.equal(bridge._phantomThresholdMs, 300);
  lastWs().__open();
  lastWs().__sessionUpdated();

  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000000 });
  const ws = lastWs();
  evt(ws, "response.created", { response: { id: "resp_greet" } });

  // A 250ms burst under server_vad is below the 300ms floor → cancelled.
  const base = cancelCount(ws);
  evt(ws, "input_audio_buffer.speech_started");
  t.mock.timers.tick(250);
  evt(ws, "input_audio_buffer.speech_stopped");
  evt(ws, "response.created", { response: { id: "resp_x" } });
  assert.equal(cancelCount(ws), base + 1, "250ms under server_vad is below the 300ms floor");
});
