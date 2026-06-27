/**
 * observability.js — GCER structured-log contract tests.
 * Run: node --test cloud-run/mediastream/observability.test.js
 *
 * Locks the format Google Cloud Error Reporting needs to auto-ingest an error
 * from logs: a single-line JSON entry with severity=ERROR, the ReportedErrorEvent
 * @type, a stack trace in `message`, and serviceContext.service. If any of these
 * drift, errors silently stop showing up in Error Reporting.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const REPORTED = "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

// Capture console.log output for one call, return the parsed JSON line(s).
function capture(fn) {
  const orig = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(" "));
  try { fn(); } finally { console.log = orig; }
  return lines.map((l) => { try { return JSON.parse(l); } catch { return l; } });
}

function freshObs(env = {}) {
  delete require.cache[require.resolve("./observability.js")];
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  const obs = require("./observability.js");
  return { obs, restore() { for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } } };
}

test("captureException emits one GCER-shaped JSON log with stack + @type", () => {
  const { obs, restore } = freshObs({ K_SERVICE: "voiceflow-mediastream", K_REVISION: "rev-42" });
  try {
    const out = capture(() => obs.captureException(new Error("boom"), { kind: "zeroOutboundAudio", callSessionId: "c1" }));
    assert.equal(out.length, 1, "exactly one log line");
    const e = out[0];
    assert.equal(e.severity, "ERROR");
    assert.equal(e["@type"], REPORTED, "ReportedErrorEvent @type present → GCER ingests it");
    assert.match(e.message, /Error: boom/, "message carries the error");
    assert.match(e.message, /at /, "message carries a stack trace (GCER groups on it)");
    assert.equal(e.serviceContext.service, "voiceflow-mediastream");
    assert.equal(e.serviceContext.version, "rev-42");
    assert.equal(e.context.kind, "zeroOutboundAudio");
    assert.equal(e.context.callSessionId, "c1");
  } finally { restore(); }
});

test("non-Error argument is coerced and still carries a stack", () => {
  const { obs, restore } = freshObs();
  try {
    const out = capture(() => obs.captureException("just a string"));
    assert.equal(out[0]["@type"], REPORTED);
    assert.match(out[0].message, /just a string/);
    assert.match(out[0].message, /at /, "synthesized Error still has a stack");
  } finally { restore(); }
});

test("captureMessage logs a structured entry WITHOUT the error @type", () => {
  const { obs, restore } = freshObs();
  try {
    const out = capture(() => obs.captureMessage("heads up", "warning", { x: 1 }));
    assert.equal(out[0].severity, "WARNING");
    assert.equal(out[0]["@type"], undefined, "messages must NOT pollute Error Reporting groups");
    assert.equal(out[0].context.x, 1);
  } finally { restore(); }
});

test("expressErrorHandler reports then calls next(err)", () => {
  const { obs, restore } = freshObs();
  try {
    let nexted = null;
    const handler = obs.expressErrorHandler();
    const err = new Error("x");
    capture(() => handler(err, { path: "/p", method: "GET" }, {}, (e) => { nexted = e; }));
    assert.equal(nexted, err);
  } finally { restore(); }
});

test("OBS_DISABLED=1 makes everything a no-op", () => {
  const { obs, restore } = freshObs({ OBS_DISABLED: "1" });
  try {
    assert.equal(obs.isEnabled(), false);
    const out = capture(() => obs.captureException(new Error("x")));
    assert.equal(out.length, 0, "nothing logged when disabled");
  } finally { restore(); }
});
