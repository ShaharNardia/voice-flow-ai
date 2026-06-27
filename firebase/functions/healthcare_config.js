/**
 * healthcare_config.js — per-tenant "Clalit mode" configuration resolver.
 *
 * The authoritative switch for the healthcare-compliance feature set lives on
 * the Company record: `Company.healthcareCompliance`. This module normalizes
 * that (possibly absent / partial) object into a complete config with safe
 * defaults, so every downstream work package (clinical safety, ZDR, data
 * forwarding, provider abstraction, CRM, evaluation) reads ONE shape.
 *
 * HARD RULE: when the config is absent or `enabled` is false, every sub-flag
 * resolves to today's behavior (all OFF). Adding this module changes NO existing
 * code path — nothing calls it until a WP wires it in behind its own sub-flag.
 *
 * Backward-compat: `Company.healthcareCompliance` is a NEW optional field. The
 * Company contract is unchanged for every existing tenant (field simply absent).
 */

"use strict";

const { getFirestore } = require("firebase-admin/firestore");

// Default config = "system behaves exactly like today". Each WP gates on its
// own sub-object's `enabled`, never on the top-level alone, so partial rollout
// is possible (e.g. clinical safety on, ZDR off).
function defaultHealthcareConfig() {
  return {
    enabled: false,
    // WP2 — Zero Data Retention (no persistence; forward + purge).
    zdrMode: false,
    // WP1 — Clinical safety guardrails (the 50% pass/fail gate).
    clinicalSafety: {
      enabled: false,
      disclosureByLang: {},      // { he: "...", ar: "...", ru: "...", en: "..." }
      redFlags: [],              // extra tenant-specific red-flag phrases
      transferTarget: null,      // phone/SIP/queue for human escalation
    },
    // WP3 — Data forwarding to Clalit sink.
    dataForwarding: { enabled: false, sink: null, config: {} },
    // WP5 — Bi-directional CRM (Dynamics / Salesforce).
    crm: { enabled: false, provider: null, config: {} },
    // WP4 — Pluggable STT/LLM/TTS providers (cloud | local).
    providers: { stt: "cloud", llm: "cloud", tts: "cloud", endpoints: {} },
    // WP6 — Evaluation / LLM-as-judge.
    evaluation: { enabled: false, mode: "off", sampleRate: 1 },
  };
}

// Shallow-merge a stored sub-object over its defaults (one level deep is enough
// for these flat config groups; arrays/scalars from storage replace defaults).
function mergeGroup(def, stored) {
  if (!stored || typeof stored !== "object") return def;
  return { ...def, ...stored };
}

/**
 * Pure normalizer: stored `healthcareCompliance` object → complete config.
 * Extracted so it can be unit-tested without Firestore (matches the repo's
 * pure-function test pattern). Absent/partial/garbage input → safe defaults.
 */
function normalizeHealthcareConfig(stored) {
  const def = defaultHealthcareConfig();
  if (!stored || typeof stored !== "object") return def;
  return {
    enabled: Boolean(stored.enabled),
    zdrMode: Boolean(stored.zdrMode),
    clinicalSafety: mergeGroup(def.clinicalSafety, stored.clinicalSafety),
    dataForwarding: mergeGroup(def.dataForwarding, stored.dataForwarding),
    crm: mergeGroup(def.crm, stored.crm),
    providers: mergeGroup(def.providers, stored.providers),
    evaluation: mergeGroup(def.evaluation, stored.evaluation),
  };
}

/**
 * Resolve the normalized healthcare config for a tenant.
 * @param {string} companyId
 * @returns {Promise<object>} complete config (never null)
 */
async function getHealthcareConfig(companyId) {
  if (!companyId) return defaultHealthcareConfig();
  try {
    const snap = await getFirestore().collection("Company").doc(String(companyId)).get();
    const stored = snap.exists ? (snap.data() || {}).healthcareCompliance : null;
    return normalizeHealthcareConfig(stored);
  } catch (_) {
    return defaultHealthcareConfig();   // never let a config read break a call
  }
}

/** Convenience: is the whole feature set on for this tenant? */
async function isHealthcareEnabled(companyId) {
  const cfg = await getHealthcareConfig(companyId);
  return cfg.enabled === true;
}

/**
 * Whether a specific sub-feature is active. A sub-feature requires BOTH the
 * top-level `enabled` AND its own `enabled` (so flipping the master switch off
 * disables everything at once).
 * @param {object} cfg  result of getHealthcareConfig
 * @param {"clinicalSafety"|"dataForwarding"|"crm"|"evaluation"} group
 */
function subEnabled(cfg, group) {
  return Boolean(cfg && cfg.enabled && cfg[group] && cfg[group].enabled);
}

module.exports = {
  getHealthcareConfig, isHealthcareEnabled, subEnabled, defaultHealthcareConfig,
  // Pure helpers exposed for unit tests (no Firestore).
  _internal: { normalizeHealthcareConfig },
};
