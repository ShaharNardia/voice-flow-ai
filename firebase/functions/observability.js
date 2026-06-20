/**
 * observability.js — optional Sentry error reporting for Cloud Functions.
 *
 * No-op unless SENTRY_DSN is set, and importing never throws even if
 * @sentry/node is absent. Init once at the top of index.js; call captureError
 * from catch blocks in the services that matter (webhooks first).
 *
 * Activate by setting the SENTRY_DSN secret/env on the functions deployment.
 */
"use strict";

let Sentry = null;
let enabled = false;

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || process.env.GCLOUD_PROJECT || "production",
      release: process.env.K_REVISION || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE || 0),
      sampleRate: 1.0,
    });
    enabled = true;
    process.on("unhandledRejection", (reason) => captureError(reason, { kind: "unhandledRejection" }));
    console.log(`[SENTRY] functions telemetry initialized (env=${process.env.SENTRY_ENV || process.env.GCLOUD_PROJECT})`);
  } catch (e) {
    console.warn(`[SENTRY] init skipped: ${e && e.message ? e.message : e}`);
  }
  return enabled;
}

/** Report an error with optional context (e.g. {fn:"twilioVoiceWebhook", companyId}). */
function captureError(err, context) {
  if (!enabled || !Sentry) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    Sentry.withScope((scope) => {
      if (context && typeof context === "object") scope.setExtras(context);
      Sentry.captureException(e);
    });
  } catch (_) { /* telemetry must never break a function */ }
}

function isEnabled() { return enabled; }

module.exports = { initSentry, captureError, isEnabled };
