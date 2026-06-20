"use client";

/**
 * SentryInit — client-side error reporting for the dashboard.
 *
 * No-op unless NEXT_PUBLIC_SENTRY_DSN is set, so this is safe to ship before the
 * Sentry project exists. This is a STATIC EXPORT (next.config `output: "export"`)
 * — there is no Node server to instrument, so we initialize Sentry only in the
 * browser via @sentry/react (no withSentryConfig webpack changes → zero build
 * risk). Mounted once from the root layout.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/react";

let initialized = false;

export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn || initialized) return;
    initialized = true;
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENV || "production",
      // Conservative defaults — error reporting only, no perf/replay sampling
      // until explicitly enabled (keeps quota + payload small).
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  }, []);
  return null;
}
