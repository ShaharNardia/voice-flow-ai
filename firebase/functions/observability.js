/**
 * observability.js — error reporting for Cloud Functions via
 * Google Cloud Error Reporting (GCER).
 *
 * Why GCER and not Sentry: the functions already run in GCP, so GCER needs no
 * external account, no DSN, and no SDK — error data stays inside the project
 * (calls can carry PII). GCER auto-ingests any structured log entry that
 * carries the ReportedErrorEvent `@type` with a stack trace in `message`, so we
 * just emit a single-line JSON log; no init, no credentials, no dependency.
 *
 * Importing NEVER throws and telemetry NEVER breaks a function. The exported
 * API (initSentry / captureError / isEnabled) is unchanged, so no call site
 * changes. Disable with OBS_DISABLED=1 if ever needed.
 */
"use strict";

const REPORTED_ERROR_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

let enabled = !process.env.OBS_DISABLED;

function serviceContext() {
  return {
    // K_SERVICE/FUNCTION_TARGET identify the function on gen2; fall back otherwise.
    service: process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.GCLOUD_PROJECT || "voiceflow-functions",
    version: process.env.K_REVISION || undefined,
  };
}

/** Kept for API compatibility — GCER needs no init. */
function initSentry() {
  if (!enabled) return false;
  console.log(`[OBS] Google Cloud Error Reporting active (service=${serviceContext().service})`);
  return true;
}

/** Report an error with optional context (e.g. {fn:"twilioVoiceWebhook", companyId}). */
function captureError(err, context) {
  if (!enabled) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const message = e.stack || `${e.name || "Error"}: ${e.message}`;
    const entry = {
      severity: "ERROR",
      "@type": REPORTED_ERROR_TYPE,
      message,
      serviceContext: serviceContext(),
    };
    if (context && typeof context === "object") entry.context = context;
    console.log(JSON.stringify(entry));   // single-line JSON → structured log → GCER
  } catch (_) { /* telemetry must never break a function */ }
}

function isEnabled() { return enabled; }

module.exports = { initSentry, captureError, isEnabled };
