"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { FeatureGate } from "@/components/FeatureGate";
import {
  followupsList,
  escalationsList,
  escalationResolve,
  type FollowupItem,
  type EscalationItem,
} from "@/lib/firebase-functions";
import { RefreshCw, Loader2, Phone, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Firestore Timestamp serializes to {_seconds}; also accept ISO/number.
function fmtTime(v: FollowupItem["nextAttemptAt"]): string {
  if (!v) return "—";
  let ms: number | null = null;
  if (typeof v === "object" && v && "_seconds" in v && typeof v._seconds === "number") ms = v._seconds * 1000;
  else if (typeof v === "number") ms = v;
  else if (typeof v === "string") { const t = +new Date(v); ms = isNaN(t) ? null : t; }
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function FollowupsInner() {
  const { user } = useAuth();
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [queue, setQueue] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const [esc, q] = await Promise.all([escalationsList(), followupsList()]);
      setEscalations(esc); setQueue(q);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function resolve(leadId: string) {
    const notes = window.prompt("Optional note for this hand-off (who took it, outcome)…") ?? undefined;
    setResolving(leadId);
    try {
      await escalationResolve({ leadId, notes });
      setEscalations((prev) => prev.filter((e) => e.leadId !== leadId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally { setResolving(null); }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Follow-ups &amp; Escalations</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Leads the bot is auto-redialing, and the ones it gave up on that need a human.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-sm border border-neutral-200 rounded-lg px-3 py-2 hover:bg-neutral-50 disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>}

      {/* ── Needs a human (open escalations) ─────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 bg-red-50/50">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h2 className="text-sm font-semibold text-neutral-900">Needs a human</h2>
          <span className="ml-auto text-xs text-neutral-500">{escalations.length} open</span>
        </div>
        {escalations.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-neutral-400 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Nothing waiting — the bot is handling everything.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Phone</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-left px-3 py-2 font-medium">Attempts</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {escalations.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50/60">
                  <td className="px-5 py-3 font-mono text-neutral-800 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-neutral-400" />{e.phone || "—"}</td>
                  <td className="px-3 py-3 text-neutral-600">{e.reason === "followup_exhausted" ? "No answer after retries" : e.reason}</td>
                  <td className="px-3 py-3 text-neutral-600">{e.attempts ?? "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => resolve(e.leadId)} disabled={resolving === e.leadId}
                      className="text-xs bg-neutral-900 hover:bg-neutral-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-60">
                      {resolving === e.leadId ? "…" : "Mark handled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Auto-redial queue ────────────────────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-100 bg-neutral-50/60">
          <Clock className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-neutral-900">Auto-redial queue</h2>
          <span className="ml-auto text-xs text-neutral-500">{queue.length} scheduled</span>
        </div>
        {queue.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-neutral-400">No follow-up calls scheduled.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-neutral-400 border-b border-neutral-100">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Phone</th>
                <th className="text-left px-3 py-2 font-medium">Attempt</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Next attempt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {queue.map((f) => (
                <tr key={f.id} className="hover:bg-neutral-50/60">
                  <td className="px-5 py-3 font-mono text-neutral-800">{f.phone || "—"}</td>
                  <td className="px-3 py-3 text-neutral-600">{f.attemptCount}/{f.maxAttempts}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${f.status === "calling" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                      {f.status === "calling" ? "calling now" : "waiting"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-neutral-500">{fmtTime(f.nextAttemptAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default function FollowupsPage() {
  return (
    <FeatureGate featureId="module.followups">
      <FollowupsInner />
    </FeatureGate>
  );
}
