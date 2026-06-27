/**
 * WP0 — healthcare_compliance scaffold tests.
 * Run: node --test firebase/functions/healthcare_config.test.js
 *
 * Verifies the per-tenant config resolver's normalize logic (pure, no Firestore):
 *   • absent/garbage config → today's behavior (everything OFF)
 *   • partial config merges over defaults without losing untouched sub-flags
 *   • subEnabled requires BOTH master + sub `enabled`
 */

"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");

const { _internal, subEnabled, defaultHealthcareConfig } = require("./healthcare_config.js");
const { normalizeHealthcareConfig } = _internal;

// ── absent / garbage → all OFF (flag-off = identical to today) ─────────────
test("normalize: absent config → all defaults OFF", () => {
  for (const input of [undefined, null, "nope", 42, []]) {
    const c = normalizeHealthcareConfig(input);
    assert.equal(c.enabled, false);
    assert.equal(c.zdrMode, false);
    assert.equal(c.clinicalSafety.enabled, false);
    assert.equal(c.dataForwarding.enabled, false);
    assert.equal(c.crm.enabled, false);
    assert.equal(c.evaluation.enabled, false);
    assert.deepEqual(c.providers, { stt: "cloud", llm: "cloud", tts: "cloud", endpoints: {} });
  }
});

// ── partial config merges, untouched groups stay default ───────────────────
test("normalize: partial config merges over defaults", () => {
  const c = normalizeHealthcareConfig({
    enabled: true,
    clinicalSafety: { enabled: true, transferTarget: "+972500000000" },
    // zdrMode, dataForwarding, crm, providers, evaluation all omitted
  });
  assert.equal(c.enabled, true);
  assert.equal(c.clinicalSafety.enabled, true);
  assert.equal(c.clinicalSafety.transferTarget, "+972500000000");
  assert.deepEqual(c.clinicalSafety.redFlags, []);       // default preserved
  assert.equal(c.zdrMode, false);                        // untouched → default
  assert.equal(c.dataForwarding.enabled, false);
  assert.equal(c.providers.stt, "cloud");
});

test("normalize: provider override flips only what's set", () => {
  const c = normalizeHealthcareConfig({ enabled: true, providers: { llm: "local", endpoints: { llm: "http://x" } } });
  assert.equal(c.providers.llm, "local");
  assert.equal(c.providers.stt, "cloud");                // untouched
  assert.equal(c.providers.endpoints.llm, "http://x");
});

// ── subEnabled gating ──────────────────────────────────────────────────────
test("subEnabled: needs BOTH master + sub enabled", () => {
  const masterOff = normalizeHealthcareConfig({ enabled: false, clinicalSafety: { enabled: true } });
  assert.equal(subEnabled(masterOff, "clinicalSafety"), false);   // master off → off

  const subOff = normalizeHealthcareConfig({ enabled: true, clinicalSafety: { enabled: false } });
  assert.equal(subEnabled(subOff, "clinicalSafety"), false);

  const bothOn = normalizeHealthcareConfig({ enabled: true, clinicalSafety: { enabled: true } });
  assert.equal(subEnabled(bothOn, "clinicalSafety"), true);
});

test("defaultHealthcareConfig is a fresh object each call (no shared mutation)", () => {
  const a = defaultHealthcareConfig();
  a.clinicalSafety.redFlags.push("x");
  const b = defaultHealthcareConfig();
  assert.deepEqual(b.clinicalSafety.redFlags, []);
});
