/**
 * tool_executor.test.js — placeholder substitution, schema mapping, SSRF guard.
 * Run: node --test firebase/functions/tool_executor.test.js
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const te = require("./tool_executor.js");

test("substitutePlaceholders: {{}} and {} styles, query-encoded", () => {
  assert.equal(te.substitutePlaceholders("/x?station={{s}}&line={l}", { s: "32902", l: "5" }), "/x?station=32902&line=5");
  // missing {{}} → empty; unknown {} → left as-is
  assert.equal(te.substitutePlaceholders("/x?a={{a}}&b={b}", {}), "/x?a=&b={b}");
  // query value with a space gets URL-encoded (template has "?")
  assert.equal(te.substitutePlaceholders("/q?t={{t}}", { t: "a b" }), "/q?t=a%20b");
});

test("toolFnName sanitizes to snake_case ≤64", () => {
  assert.equal(te.toolFnName("get stop arrivals!"), "get_stop_arrivals_");
  assert.equal(te.toolFnName("x".repeat(80)).length, 64);
});

test("toOpenAiTool builds schema; skips non-HTTP/built-in", () => {
  assert.equal(te.toOpenAiTool({ name: "save_lead", type: "save_lead" }), null);   // built-in toggle
  assert.equal(te.toOpenAiTool({ name: "no_url" }), null);
  const t = te.toOpenAiTool({ name: "get_x", url: "https://api/x?s={{s}}", parameters: [{ name: "s", type: "integer", required: true }] });
  assert.equal(t.type, "function");
  assert.equal(t.function.name, "get_x");
  assert.equal(t.function.parameters.properties.s.type, "number");   // integer → number
  assert.deepEqual(t.function.parameters.required, ["s"]);
});

test("SSRF guard blocks internal/loopback/metadata hosts", () => {
  assert.ok(te.blockedReason("http://localhost/x"));
  assert.ok(te.blockedReason("http://127.0.0.1/x"));
  assert.ok(te.blockedReason("http://169.254.169.254/computeMetadata/v1/"));
  assert.ok(te.blockedReason("http://10.0.0.5/x"));
  assert.ok(te.blockedReason("http://192.168.1.1/x"));
  assert.ok(te.blockedReason("http://metadata.google.internal/x"));
  assert.ok(te.blockedReason("file:///etc/passwd"));
  assert.equal(te.blockedReason("https://api.lancelotech.com/Moran/services"), null);   // public → allowed
});

test("executeCustomApiTool refuses a blocked host without fetching", async () => {
  const r = await te.executeCustomApiTool({ url: "http://169.254.169.254/latest/meta-data/", method: "GET" }, {});
  assert.equal(r.ok, false);
  assert.match(r.result, /Blocked/);
});
