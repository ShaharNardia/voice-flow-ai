"use client";

/**
 * Admin → System Policies — admin-editable Gemini Live behavior rules.
 *
 * What's editable here propagates to every Gemini Live call within 60 seconds
 * (Cloud Run caches the policy doc with that TTL). Defaults are loaded from
 * the backend so the form is never blank — admin sees "this is what the
 * system is doing right now" and can tweak from there.
 */

import { useEffect, useState } from "react";
import {
  Loader2, Save, RotateCcw, AlertTriangle, Check, ChevronDown, ChevronUp,
  Mic2, MessageSquare, Clock, BookOpen, Wrench, Eye,
} from "lucide-react";
import { getSystemPolicies, updateSystemPolicies, type SystemPolicy } from "@/lib/firebase-functions";

export default function SystemPoliciesPage() {
  const [policy,   setPolicy]   = useState<SystemPolicy | null>(null);
  const [defaults, setDefaults] = useState<SystemPolicy | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [error,    setError]    = useState("");
  const [expanded, setExpanded] = useState<string | null>("voice");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await getSystemPolicies();
      setPolicy(r.policy);
      setDefaults(r.defaults);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function save(patch: Partial<SystemPolicy>) {
    setSaving(true);
    setError("");
    try {
      const r = await updateSystemPolicies(patch);
      setPolicy(r.policy);
      setSavedKeys(r.updated);
      setTimeout(() => setSavedKeys([]), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault(keys: (keyof SystemPolicy)[]) {
    if (!defaults) return;
    if (!confirm(`Reset ${keys.join(", ")} to default?`)) return;
    const patch: Partial<SystemPolicy> = {};
    for (const k of keys) patch[k] = defaults[k] as never;
    await save(patch);
  }

  if (loading) {
    return <div className="p-8 text-neutral-400 flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading policies…</div>;
  }
  if (!policy || !defaults) {
    return <div className="p-8 text-red-600 text-sm">{error || "Could not load policies."}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">System Policies</h1>
        <p className="text-sm text-neutral-500 mt-1">
          These rules control how every Gemini Live assistant behaves on calls.
          Changes propagate within 60 seconds — no redeploy needed.
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />{error}
        </div>
      )}
      {savedKeys.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-start gap-2">
          <Check className="w-4 h-4 mt-0.5" />Saved: {savedKeys.join(", ")} — takes effect on next call within 60s.
        </div>
      )}

      <Section
        id="voice" icon={<Mic2 className="w-4 h-4" />} title="Voice Header"
        description="The system prompt prefix sent to every Gemini Live assistant. Controls anti-meta-narration, anti-call-back rules, and the natural-filler vocabulary."
        expanded={expanded} setExpanded={setExpanded}
      >
        <VoiceHeaderEditor policy={policy} defaults={defaults} onSave={(v) => save({ voiceHeader: v })} onReset={() => resetToDefault(["voiceHeader"])} saving={saving} />
      </Section>

      <Section
        id="silence" icon={<Clock className="w-4 h-4" />} title="Silence Watchdog"
        description="When the caller goes quiet, how long before the bot asks 'are you there?' and after how many unanswered prompts to end the call."
        expanded={expanded} setExpanded={setExpanded}
      >
        <SilenceEditor policy={policy} defaults={defaults} onSave={save} onReset={(k) => resetToDefault(k)} saving={saving} />
      </Section>

      <Section
        id="goodbye" icon={<MessageSquare className="w-4 h-4" />} title="Goodbye Detection"
        description="Per-language regex patterns that trigger automatic call hangup when the bot says them at the end of a turn. Bare politeness (תודה רבה alone) should not trigger — require an explicit goodbye suffix."
        expanded={expanded} setExpanded={setExpanded}
      >
        <GoodbyeEditor policy={policy} defaults={defaults} onSave={save} onReset={(k) => resetToDefault(k)} saving={saving} />
      </Section>

      <Section
        id="kb" icon={<BookOpen className="w-4 h-4" />} title="Knowledge Base & Limits"
        description="Caps on KB chars injected into the prompt (longer = slower model response) and max call duration safety cap."
        expanded={expanded} setExpanded={setExpanded}
      >
        <LimitsEditor policy={policy} defaults={defaults} onSave={save} onReset={(k) => resetToDefault(k)} saving={saving} />
      </Section>

      <Section
        id="display" icon={<Eye className="w-4 h-4" />} title="Display Toggles"
        description="Affect what the call detail UI shows. Pure cosmetics — safe to flip."
        expanded={expanded} setExpanded={setExpanded}
      >
        <DisplayToggles policy={policy} defaults={defaults} onSave={save} saving={saving} />
      </Section>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  id, icon, title, description, expanded, setExpanded, children,
}: {
  id: string; icon: React.ReactNode; title: string; description: string;
  expanded: string | null; setExpanded: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = expanded === id;
  return (
    <div className="mb-4 bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <button
        onClick={() => setExpanded(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">{icon}</div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900">{title}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>
      {isOpen && <div className="border-t border-neutral-100 p-5">{children}</div>}
    </div>
  );
}

// ── Voice Header ─────────────────────────────────────────────────────────────

function VoiceHeaderEditor({ policy, defaults, onSave, onReset, saving }: {
  policy: SystemPolicy; defaults: SystemPolicy;
  onSave: (v: string) => void;
  onReset: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(policy.voiceHeader ?? defaults.voiceHeader ?? "");
  const isDirty = draft !== (policy.voiceHeader ?? defaults.voiceHeader ?? "");
  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={16}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-teal-500"
      />
      <div className="text-xs text-neutral-500 mt-1">{draft.length} chars. Minimum 50 to apply.</div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !isDirty || draft.length < 50}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={onReset}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:bg-neutral-50 text-sm rounded-lg disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to default
        </button>
      </div>
    </div>
  );
}

// ── Silence ──────────────────────────────────────────────────────────────────

function SilenceEditor({ policy, defaults, onSave, onReset, saving }: {
  policy: SystemPolicy; defaults: SystemPolicy;
  onSave: (p: Partial<SystemPolicy>) => void;
  onReset: (k: (keyof SystemPolicy)[]) => void;
  saving: boolean;
}) {
  const [ms,        setMs]        = useState(policy.silenceThresholdMs ?? defaults.silenceThresholdMs ?? 12000);
  const [checks,    setChecks]    = useState(policy.silenceMaxChecks   ?? defaults.silenceMaxChecks   ?? 3);
  const [checkInHe, setCheckInHe] = useState(policy.silenceCheckIn?.hebrew  ?? defaults.silenceCheckIn?.hebrew  ?? "");
  const [checkInEn, setCheckInEn] = useState(policy.silenceCheckIn?.english ?? defaults.silenceCheckIn?.english ?? "");
  const [byeHe,     setByeHe]     = useState(policy.silenceFarewell?.hebrew  ?? defaults.silenceFarewell?.hebrew  ?? "");
  const [byeEn,     setByeEn]     = useState(policy.silenceFarewell?.english ?? defaults.silenceFarewell?.english ?? "");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Silence threshold (ms)" hint="Time from last user speech to first 'are you there?'. Default 12000.">
          <input type="number" value={ms} onChange={(e) => setMs(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
        </Field>
        <Field label="Max check-ins before hangup" hint="After this many unanswered check-ins, the bot says goodbye and ends the call.">
          <input type="number" value={checks} onChange={(e) => setChecks(parseInt(e.target.value, 10) || 1)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
        </Field>
      </div>
      <Field label="Check-in phrase (Hebrew)">
        <input type="text" value={checkInHe} onChange={(e) => setCheckInHe(e.target.value)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <Field label="Check-in phrase (English)">
        <input type="text" value={checkInEn} onChange={(e) => setCheckInEn(e.target.value)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <Field label="Farewell phrase (Hebrew)">
        <input type="text" value={byeHe} onChange={(e) => setByeHe(e.target.value)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <Field label="Farewell phrase (English)">
        <input type="text" value={byeEn} onChange={(e) => setByeEn(e.target.value)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => onSave({
            silenceThresholdMs: ms,
            silenceMaxChecks:   checks,
            silenceCheckIn:  { hebrew: checkInHe, english: checkInEn, arabic: policy.silenceCheckIn?.arabic },
            silenceFarewell: { hebrew: byeHe,     english: byeEn,     arabic: policy.silenceFarewell?.arabic },
          })}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={() => onReset(["silenceThresholdMs", "silenceMaxChecks", "silenceCheckIn", "silenceFarewell"])}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:bg-neutral-50 text-sm rounded-lg disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
    </div>
  );
}

// ── Goodbye ──────────────────────────────────────────────────────────────────

function GoodbyeEditor({ policy, defaults, onSave, onReset, saving }: {
  policy: SystemPolicy; defaults: SystemPolicy;
  onSave: (p: Partial<SystemPolicy>) => void;
  onReset: (k: (keyof SystemPolicy)[]) => void;
  saving: boolean;
}) {
  const [he, setHe] = useState(policy.goodbyePatterns?.hebrew  ?? defaults.goodbyePatterns?.hebrew  ?? "");
  const [ar, setAr] = useState(policy.goodbyePatterns?.arabic  ?? defaults.goodbyePatterns?.arabic  ?? "");
  const [en, setEn] = useState(policy.goodbyePatterns?.english ?? defaults.goodbyePatterns?.english ?? "");
  const [es, setEs] = useState(policy.goodbyePatterns?.spanish ?? defaults.goodbyePatterns?.spanish ?? "");
  const validate = (s: string) => { try { new RegExp(s); return true; } catch { return false; } };
  const allValid = validate(he) && validate(ar) && validate(en) && validate(es);
  return (
    <div className="space-y-3">
      <Field label="Hebrew regex" hint="Bare 'תודה רבה' must NOT match — include a goodbye suffix.">
        <input type="text" value={he} onChange={(e) => setHe(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${validate(he) ? "border-neutral-200" : "border-red-300 bg-red-50"}`} />
      </Field>
      <Field label="Arabic regex">
        <input type="text" value={ar} onChange={(e) => setAr(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${validate(ar) ? "border-neutral-200" : "border-red-300 bg-red-50"}`} />
      </Field>
      <Field label="English regex" hint="Tested case-insensitively (/i flag added automatically).">
        <input type="text" value={en} onChange={(e) => setEn(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${validate(en) ? "border-neutral-200" : "border-red-300 bg-red-50"}`} />
      </Field>
      <Field label="Spanish regex">
        <input type="text" value={es} onChange={(e) => setEs(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${validate(es) ? "border-neutral-200" : "border-red-300 bg-red-50"}`} />
      </Field>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => onSave({ goodbyePatterns: { hebrew: he, arabic: ar, english: en, spanish: es } })}
          disabled={saving || !allValid}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={() => onReset(["goodbyePatterns"])}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:bg-neutral-50 text-sm rounded-lg disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
      {!allValid && (
        <div className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> One or more regex strings is invalid — save is blocked until fixed.
        </div>
      )}
    </div>
  );
}

// ── Limits ───────────────────────────────────────────────────────────────────

function LimitsEditor({ policy, defaults, onSave, onReset, saving }: {
  policy: SystemPolicy; defaults: SystemPolicy;
  onSave: (p: Partial<SystemPolicy>) => void;
  onReset: (k: (keyof SystemPolicy)[]) => void;
  saving: boolean;
}) {
  const [kb,  setKb]  = useState(policy.maxKbChars        ?? defaults.maxKbChars        ?? 8000);
  const [dur, setDur] = useState(policy.maxCallDurationSec ?? defaults.maxCallDurationSec ?? 1800);
  return (
    <div className="space-y-3">
      <Field label="Max KB chars injected" hint="Higher = bot knows more, but each turn is slower (~150-300ms per 8K chars).">
        <input type="number" value={kb} onChange={(e) => setKb(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <Field label="Max call duration (sec)" hint="Safety cap — bot is force-disconnected if a call runs longer.">
        <input type="number" value={dur} onChange={(e) => setDur(parseInt(e.target.value, 10) || 60)} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
      </Field>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => onSave({ maxKbChars: kb, maxCallDurationSec: dur })}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={() => onReset(["maxKbChars", "maxCallDurationSec"])}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:bg-neutral-50 text-sm rounded-lg disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
    </div>
  );
}

// ── Display Toggles ──────────────────────────────────────────────────────────

function DisplayToggles({ policy, defaults, onSave, saving }: {
  policy: SystemPolicy; defaults: SystemPolicy;
  onSave: (p: Partial<SystemPolicy>) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2">
      <Toggle
        label="Show tool calls (⚡ pills) in conversation transcript"
        hint="Off = transcript looks cleaner to callers/admins but hides what the bot was actually doing."
        value={policy.showToolCallsInTranscript ?? defaults.showToolCallsInTranscript ?? true}
        onChange={(v) => onSave({ showToolCallsInTranscript: v })}
        disabled={saving}
      />
      <Toggle
        label="Strip meta-narration from transcripts"
        hint="On = removes any `**markdown**` headers or English narrator sentences the model leaks. Off = useful for debugging what model emits raw."
        value={policy.stripMetaEnabled ?? defaults.stripMetaEnabled ?? true}
        onChange={(v) => onSave({ stripMetaEnabled: v })}
        disabled={saving}
      />
    </div>
  );
}

function Toggle({ label, hint, value, onChange, disabled }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border border-neutral-200 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-800">{label}</div>
        {hint && <div className="text-xs text-neutral-500 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${value ? "bg-teal-600" : "bg-neutral-300"} disabled:opacity-50`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} style={{ marginTop: 2 }} />
      </button>
    </div>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}
