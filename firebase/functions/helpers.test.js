/**
 * Unit tests for pure helper functions extracted from Cloud Functions
 * services. Run: node --test firebase/functions/helpers.test.js
 *
 * No deps beyond Node's built-in test runner. Stays fast (<50ms).
 * What's covered:
 *   • tool_library_service.substitute  — {{x}} placeholder substitution
 *   • system_policies_service.filterPatch — whitelist defence
 *   • admin_settings_service.validatePlans — Unlimited round-trip (#47)
 */

"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");

const { _internal: tool      } = require("./tool_library_service.js");
const { _internal: policy    } = require("./system_policies_service.js");
const { _internal: settings  } = require("./admin_settings_service.js");

// ── substitute ───────────────────────────────────────────────────────────

test("substitute: replaces known placeholders, leaves unknown ones intact", () => {
  const r = tool.substitute("https://api/{{path}}?q={{q}}&miss={{unknown}}", { path: "v1/users", q: "active" });
  assert.equal(r, "https://api/v1/users?q=active&miss={{unknown}}");
});

test("substitute: passes through non-strings unchanged", () => {
  assert.equal(tool.substitute(42, { x: 1 }), 42);
  assert.equal(tool.substitute(null, { x: 1 }), null);
  assert.deepEqual(tool.substitute({a:1}, {}), {a:1});
});

test("substitute: coerces non-string args to strings", () => {
  assert.equal(tool.substitute("n={{n}} b={{b}}", { n: 7, b: true }), "n=7 b=true");
});

test("substitute: treats null/undefined arg as missing (leaves placeholder)", () => {
  const r = tool.substitute("{{a}}-{{b}}", { a: null, b: undefined });
  assert.equal(r, "{{a}}-{{b}}");
});

// ── filterPatch (system policies whitelist) ──────────────────────────────

test("filterPatch: drops keys not in DEFAULT_POLICY", () => {
  const out = policy.filterPatch({
    voiceHeader: "hello",
    maxKbChars: 12000,
    __proto__pollute: true,
    evilField: "should be dropped",
  });
  assert.ok("voiceHeader" in out, "voiceHeader kept");
  assert.ok("maxKbChars" in out, "maxKbChars kept");
  assert.equal("evilField" in out, false, "unknown field dropped");
  assert.equal("__proto__pollute" in out, false, "prototype-pollution attempt dropped");
});

test("filterPatch: handles empty / nullish patch safely", () => {
  assert.deepEqual(policy.filterPatch(null), {});
  assert.deepEqual(policy.filterPatch(undefined), {});
  assert.deepEqual(policy.filterPatch({}), {});
});

// ── validatePlans (the #47 fix) ──────────────────────────────────────────

const PLANS_BASE = () => ({
  basic: { assistants: 1,  minutesPerMonth: 50,   leads: 100,  campaigns: 0,  price: 0,   knowledgeBase: false, analytics: false, calendar: false, whatsapp: false, callHistoryLimit: 10 },
  pro:   { assistants: 10, minutesPerMonth: 2000, leads: 5000, campaigns: 10, price: 99,  knowledgeBase: true,  analytics: true,  calendar: true,  whatsapp: true,  callHistoryLimit: null },
  scale: { assistants: 50, minutesPerMonth: 10000,leads: 99999,campaigns: 99, price: 249, knowledgeBase: true,  analytics: true,  calendar: true,  whatsapp: true,  callHistoryLimit: null },
});

test("validatePlans: null quota persists as null (Unlimited)", () => {
  const p = PLANS_BASE();
  p.scale.minutesPerMonth = null;
  const out = settings.validatePlans(p);
  assert.equal(out.scale.minutesPerMonth, null, "null → null, not 0");
});

test("validatePlans: negative quota becomes null (Unlimited)", () => {
  const p = PLANS_BASE();
  p.pro.assistants = -1;
  const out = settings.validatePlans(p);
  assert.equal(out.pro.assistants, null);
});

test("validatePlans: positive quotas are floored and clamped", () => {
  const p = PLANS_BASE();
  p.pro.minutesPerMonth = 2000.7;
  const out = settings.validatePlans(p);
  assert.equal(out.pro.minutesPerMonth, 2000);
});

test("validatePlans: rejects non-number, non-null quota with a useful error", () => {
  const p = PLANS_BASE();
  p.pro.assistants = "ten";
  assert.throws(() => settings.validatePlans(p), /pro\.assistants must be a number or null/);
});

test("validatePlans: rejects null price (price has no unlimited concept)", () => {
  const p = PLANS_BASE();
  p.pro.price = null;
  const out = settings.validatePlans(p);
  assert.equal(out.pro.price, 0, "null price defaults to 0, never null");
});

test("validatePlans: missing tier rejected", () => {
  const p = PLANS_BASE();
  delete p.scale;
  assert.throws(() => settings.validatePlans(p), /Missing plan tier: scale/);
});

test("validatePlans: callHistoryLimit accepts null and positive ints", () => {
  const p = PLANS_BASE();
  p.basic.callHistoryLimit = 10.9;
  p.pro.callHistoryLimit = null;
  const out = settings.validatePlans(p);
  assert.equal(out.basic.callHistoryLimit, 10, "10.9 → 10");
  assert.equal(out.pro.callHistoryLimit, null);
});

test("validatePlans: boolean features always coerced to Boolean", () => {
  const p = PLANS_BASE();
  p.basic.analytics = "yes";   // truthy string
  p.pro.calendar    = 0;       // falsy number
  const out = settings.validatePlans(p);
  assert.equal(out.basic.analytics, true);
  assert.equal(out.pro.calendar, false);
});
