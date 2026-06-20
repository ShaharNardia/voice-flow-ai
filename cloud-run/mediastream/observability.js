/**
 * observability.js — optional Sentry error reporting for the voice service.
 *
 * Design goals:
 *   • ZERO behavior change unless SENTRY_DSN is set. No DSN ⇒ every function
 *     here is a no-op, so this is safe to ship before the Sentry project exists.
 *   • Importing this file NEVER throws — even if @sentry/node isn't installed
 *     (the require is wrapped), so a missing dep degrades to "no telemetry"
 *     rather than crashing the call path.
 *
 * Activate by setting SENTRY_DSN (and optionally SENTRY_ENV) on the Cloud Run
 * service. K_REVISION (set by Cloud Run) is used as the release tag.
 */
"use strict";

let Sentry = null;
let enabled = false;

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;            // not configured → stay a no-op
  try {
    Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || process.env.NODE_ENV || "production",
      release: process.env.K_REVISION || undefined,   // Cloud Run revision id
      tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE || 0),
      sampleRate: 1.0,
    });
    enabled = true;
    // NOTE: process-level unhandledRejection/uncaughtException handlers already
    // exist in index.js; they call captureException directly. We do not register
    // duplicates here.
    console.log(`[SENTRY] initialized (env=${process.env.SENTRY_ENV || process.env.NODE_ENV || "production"})`);
  } catch (e) {
    console.warn(`[SENTRY] init skipped: ${e && e.message ? e.message : e}`);
  }
  return enabled;
}

function captureException(err, context) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (context && typeof context === "object") scope.setExtras(context);
      Sentry.captureException(err);
    });
  } catch (_) { /* never let telemetry break the call */ }
}

function captureMessage(message, level, context) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (context && typeof context === "object") scope.setExtras(context);
      Sentry.captureMessage(message, level || "warning");
    });
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
