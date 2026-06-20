/**
 * observability.test.js — the Sentry wrapper must be a safe no-op without a DSN.
 * Run: node --test cloud-run/mediastream/observability.test.js
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const obs = require("./observability.js");

test("no DSN → init returns false and stays disabled", () => {
  delete process.env.SENTRY_DSN;
  assert.equal(obs.initSentry(), false);
  assert.equal(obs.isEnabled(), false);
});

test("capture helpers are no-ops (never throw) when disabled", () => {
  assert.doesNotThrow(() => obs.captureException(new Error("boom"), { a: 1 }));
  assert.doesNotThrow(() => obs.captureMessage("hi", "warning", { b: 2 }));
});

test("expressErrorHandler reports then calls next(err)", () => {
  let nexted = null;
  const handler = obs.expressErrorHandler();
  const err = new Error("x");
  handler(err, { path: "/p", method: "GET" }, {}, (e) => { nexted = e; });
  assert.equal(nexted, err);
});
