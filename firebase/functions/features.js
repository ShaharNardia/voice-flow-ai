/**
 * Shared feature registry — canonical IDs used by both backend (validation)
 * and frontend (gating + admin UI). Keep in sync with
 * saas-frontend/src/lib/features.ts
 */

const FEATURES = [
  // Navigation modules (1:1 with sidebar entries)
  {id: "module.dashboard", label: "Dashboard", defaultOn: true, kind: "nav"},
  {id: "module.assistants", label: "Assistants", defaultOn: true, kind: "nav"},
  {id: "module.phoneNumbers", label: "Phone Numbers", defaultOn: true, kind: "nav"},
  {id: "module.calls", label: "Calls", defaultOn: true, kind: "nav"},
  {id: "module.leads", label: "Leads", defaultOn: true, kind: "nav"},
  {id: "module.campaigns", label: "Campaigns", defaultOn: false, kind: "nav"},
  {id: "module.calendar", label: "Calendar", defaultOn: false, kind: "nav"},
  {id: "module.scenarios", label: "Scenarios", defaultOn: true, kind: "nav"},
  {id: "module.analytics", label: "Analytics", defaultOn: false, kind: "nav"},
  {id: "module.billing", label: "Billing", defaultOn: true, kind: "nav"},
  {id: "module.settings", label: "Settings", defaultOn: true, kind: "nav"},
  // Capability-level (non-nav)
  {id: "cap.customApiTools", label: "Custom API Tools (assistant)", defaultOn: false, kind: "cap"},
  {id: "cap.knowledgeBase", label: "Knowledge Base upload", defaultOn: true, kind: "cap"},
  {id: "cap.assistantWizard", label: "AI assistant wizard", defaultOn: true, kind: "cap"},
  {id: "cap.appointments", label: "Assistant booking tool", defaultOn: false, kind: "cap"},
  {id: "cap.calendarInvites", label: "Send ICS/calendar invites", defaultOn: true, kind: "cap"},
  {id: "cap.scheduleReminders", label: "Lesson/appointment reminders", defaultOn: true, kind: "cap"},
  {id: "cap.pwaPush", label: "PWA install + push notifications", defaultOn: false, kind: "cap"},
  {id: "cap.sipTrunks", label: "SIP Trunk integration", defaultOn: true, kind: "cap"},
  // Clalit / healthcare tender. Per-USER gate for the admin UI; the per-TENANT
  // source of truth is Company.healthcareCompliance.enabled (see
  // healthcare_config.js). Default OFF — behavior is unchanged unless a tenant
  // explicitly opts in.
  {id: "cap.healthcareCompliance", label: "Healthcare Compliance (Clalit mode)", defaultOn: false, kind: "cap"},
];

const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

function isValidFeatureId(id) {
  return FEATURE_IDS.has(id);
}

module.exports = {FEATURES, FEATURE_IDS, isValidFeatureId};
