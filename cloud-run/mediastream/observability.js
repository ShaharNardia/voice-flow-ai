/**
 * observability.js — error reporting for the voice service via
 * Google Cloud Error Reporting (GCER).
 *
 * Why GCER and not Sentry: the whole SaaS runs on GCP (Cloud Run + Cloud
 * Functions), so GCER needs no external account, no DSN, and no SDK — and
 * error data never leaves the project (important: calls carry Hebrew PII).
 *
 * How it works: GCER automatically ingests any structured log entry that
 * carries the ReportedErrorEvent `@type` and a stack trace in `message`. So we
 * just emit a single-line JSON log to stdout; Cloud Logging parses it and
 * Error Reporting groups it by stack. No init, no credentials, no dependency.
 *
 * Design goals (unchanged from before):
 *   • Importing NEVER throws and telemetry NEVER breaks the call path.
 *   • The exported API is byte-for-byte the same as the old Sentry wrapper
 *     (initSentry / captureException / captureMessage / expressErrorHandler /
 *     isEnabled) so no call site changes.
 *
 * Disable with OBS_DISABLED=1 if ever needed.
 */
"use strict";

const REPORTED_ERROR_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

let enabled = !process.env.OBS_DISABLED;

function serviceContext() {
  return {
    // K_SERVICE/K_REVISION are set by Cloud Run; fall back for local runs.
    service: process.env.K_SERVICE || "voiceflow-mediastream",
    version: process.env.K_REVISION || process.env.SENTRY_ENV || undefined,
  };
}

/** Kept for API compatibility — GCER needs no init. Just announces the mode. */
function initSentry() {
  if (!enabled) return false;
  console.log(`[OBS] Google Cloud Error Reporting active (service=${serviceContext().service})`);
  return true;
}

/**
 * Report an exception to Error Reporting. `context` (e.g. {kind, callSessionId})
 * is attached as structured fields for filtering — keep it free of raw call
 * content / PII.
 */
function captureException(err, context) {
  if (!enabled) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    // GCER extracts the grouping + location from the stack trace in `message`.
    const message = e.stack || `${e.name || "Error"}: ${e.message}`;
    const entry = {
      severity: "ERROR",
      "@type": REPORTED_ERROR_TYPE,
      message,
      serviceContext: serviceContext(),
    };
    if (context && typeof context === "object") entry.context = context;
    console.log(JSON.stringify(entry));   // single-line JSON → structured log
  } catch (_) { /* never let telemetry break the call */ }
}

/**
 * Non-exception signal. Logged as a structured entry at the given severity but
 * WITHOUT the ReportedErrorEvent type, so it stays a log line and doesn't
 * pollute Error Reporting groups.
 */
function captureMessage(message, level, context) {
  if (!enabled) return;
  try {
    const severity = (level || "warning").toUpperCase();
    const entry = { severity, message: String(message), serviceContext: serviceContext() };
    if (context && typeof context === "object") entry.context = context;
    console.log(JSON.stringify(entry));
  } catch (_) { /* ignore */ }
}

/** Express error middleware: report, then pass through to the next handler. */
function expressErrorHandler() {
  return (err, req, res, next) => {
    captureException(err, { path: req.path, method: req.method });
    next(err);
  };
}

function isEnabled() { return enabled; }

module.exports = { initSentry, captureException, captureMessage, expressErrorHandler, isEnabled };
