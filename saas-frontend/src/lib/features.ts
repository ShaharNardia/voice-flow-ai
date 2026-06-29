"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, type AuthRole } from "@/hooks/useAuth";

/**
 * Canonical feature registry. Keep in sync with firebase/functions/features.js.
 */
export interface FeatureDef {
  id: string;
  label: string;
  defaultOn: boolean;
  kind: "nav" | "cap";
}

export const FEATURES: readonly FeatureDef[] = [
  { id: "module.dashboard", label: "Dashboard", defaultOn: true, kind: "nav" },
  { id: "module.assistants", label: "Assistants", defaultOn: true, kind: "nav" },
  { id: "module.phoneNumbers", label: "Phone Numbers", defaultOn: true, kind: "nav" },
  { id: "module.calls", label: "Calls", defaultOn: true, kind: "nav" },
  { id: "module.leads", label: "Leads", defaultOn: true, kind: "nav" },
  // Campaigns / Calendar / Analytics ship visible-by-default so BASIC users
  // see them as "locked → Upgrade" nudges in the sidebar (Sidebar's lockedFor
  // logic). Setting these to defaultOn:false hides them entirely and the
  // upgrade affordance never fires — that was the #52 inconsistency.
  { id: "module.campaigns", label: "Campaigns", defaultOn: true, kind: "nav" },
  { id: "module.followups", label: "Follow-ups & Escalations", defaultOn: true, kind: "nav" },
  { id: "module.calendar", label: "Calendar", defaultOn: true, kind: "nav" },
  { id: "module.scenarios", label: "Scenarios", defaultOn: true, kind: "nav" },
  { id: "module.analytics", label: "Analytics", defaultOn: true, kind: "nav" },
  // Internal benchmarking rig — not a customer feature. Hidden by default
  // (super_admin still sees it; flip on per-account if ever needed).
  { id: "module.bench", label: "Bench (STT/TTS benchmark)", defaultOn: false, kind: "nav" },
  { id: "module.billing", label: "Billing", defaultOn: true, kind: "nav" },
  { id: "module.settings", label: "Settings", defaultOn: true, kind: "nav" },
  { id: "cap.customApiTools", label: "Custom API Tools (assistant)", defaultOn: false, kind: "cap" },
  { id: "cap.knowledgeBase", label: "Knowledge Base upload", defaultOn: true, kind: "cap" },
  { id: "cap.assistantWizard", label: "AI assistant wizard", defaultOn: true, kind: "cap" },
  { id: "cap.appointments", label: "Assistant booking tool", defaultOn: false, kind: "cap" },
  { id: "cap.calendarInvites", label: "Send ICS/calendar invites", defaultOn: true, kind: "cap" },
  { id: "cap.scheduleReminders", label: "Lesson/appointment reminders", defaultOn: true, kind: "cap" },
  { id: "cap.pwaPush", label: "PWA install + push notifications", defaultOn: true, kind: "cap" },
  { id: "cap.sipTrunks", label: "SIP Trunk integration", defaultOn: true, kind: "cap" },
  // ── Enterprise extras — HIDDEN by default (kept behind a flag, not deleted).
  // These are niche/heavy add-ons that clutter the core phonebot product; a
  // super_admin still sees them, and any account can be opted in per-feature.
  // Co-Pilot stays visible (required now). See [base+ cleanup].
  { id: "module.compliance", label: "Compliance Intelligence (TCPA/GDPR)", defaultOn: false, kind: "nav" },
  { id: "module.contracts", label: "Verbal Contracts", defaultOn: false, kind: "nav" },
  { id: "module.voiceCommerce", label: "Voice Commerce", defaultOn: false, kind: "nav" },
  { id: "module.agentDirectory", label: "Agent-to-Agent Network", defaultOn: false, kind: "nav" },
  { id: "module.copilot", label: "AI Co-Pilot for Agents", defaultOn: true, kind: "nav" },
  { id: "cap.verbalContract", label: "Verbal Contract engine (assistant)", defaultOn: false, kind: "cap" },
  { id: "cap.voiceCommerce", label: "Voice Commerce engine (assistant)", defaultOn: false, kind: "cap" },
  { id: "cap.agentNetwork", label: "Agent-to-Agent calling (assistant)", defaultOn: false, kind: "cap" },
  { id: "cap.translationMode", label: "Multilingual translation mode", defaultOn: true, kind: "cap" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

/**
 * Resolve effective feature flags for a user.
 *   super_admin → everything on (bypasses config)
 *   otherwise  → user override → role default → built-in defaultOn
 */
export function resolveFeatures(
  role: AuthRole,
  defaults: { user?: Record<string, boolean>; admin?: Record<string, boolean> } | null,
  overrides: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (role === "super_admin") {
    for (const f of FEATURES) out[f.id] = true;
    return out;
  }
  const roleDefaults = (role === "admin" ? defaults?.admin : defaults?.user) || {};
  for (const f of FEATURES) {
    if (Object.prototype.hasOwnProperty.call(overrides, f.id)) {
      out[f.id] = overrides[f.id];
    } else if (Object.prototype.hasOwnProperty.call(roleDefaults, f.id)) {
      out[f.id] = roleDefaults[f.id];
    } else {
      out[f.id] = f.defaultOn;
    }
  }
  return out;
}

// Module-level cache so every hook consumer shares one Firestore subscription.
let cachedDefaults: { user: Record<string, boolean>; admin: Record<string, boolean> } | null = null;
let defaultsSubscribed = false;
const listeners = new Set<() => void>();

function subscribeDefaults() {
  if (defaultsSubscribed) return;
  defaultsSubscribed = true;
  try {
    onSnapshot(
      doc(db, "config", "featureDefaults"),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        cachedDefaults = {
          user: (data.user as Record<string, boolean>) || {},
          admin: (data.admin as Record<string, boolean>) || {},
        };
        listeners.forEach((l) => l());
      },
      () => {
        // Read denied or error — fall back to empty defaults so built-in
        // `defaultOn` values apply.
        cachedDefaults = { user: {}, admin: {} };
        listeners.forEach((l) => l());
      },
    );
  } catch {
    cachedDefaults = { user: {}, admin: {} };
  }
}

/**
 * Hook: returns `has(featureId)` + loading state for the current user.
 */
export function useFeatures() {
  const { role, featureOverrides, loading: authLoading } = useAuth();
  const [defaults, setDefaults] = useState(cachedDefaults);

  useEffect(() => {
    subscribeDefaults();
    const l = () => setDefaults(cachedDefaults);
    listeners.add(l);
    if (cachedDefaults) setDefaults(cachedDefaults);
    return () => { listeners.delete(l); };
  }, []);

  const resolved = resolveFeatures(role, defaults, featureOverrides || {});
  return {
    loading: authLoading || defaults === null,
    has: (id: string) => resolved[id] !== false,   // unknown ids treated as enabled
    all: resolved,
  };
}
