"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  complianceDashboard, complianceDncList, complianceDncAdd, complianceDncRemove,
  complianceDncBulkAdd, complianceConsentList, complianceConsentRevoke,
  complianceGetReport,
  type DncEntry, type ConsentRecord, type ComplianceViolation, type ComplianceDashboardResult,
} from "@/lib/firebase-functions";
import {
  ShieldCheck, ShieldAlert, PhoneOff, CheckCircle2, XCircle, AlertTriangle,
  Plus, Trash2, Upload, Loader2, RefreshCw,
} from "lucide-react";

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xl font-bold text-neutral-900">{value}</p>
        <p className="text-xs text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

// ── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-500" : "text-red-500";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Fair" : "At Risk";
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-col items-center justify-center gap-1">
      <div className={`text-4xl font-bold ${color}`}>{score}</div>
      <div className="text-xs text-neutral-500">Compliance Score</div>
      <div className={`text-xs font-medium ${color}`}>{label}</div>
    </div>
  );
}

// ── Severity badge ────────────────────────────────────────────────────────────
function SeverityBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high:     "bg-orange-100 text-orange-700",
    medium:   "bg-yellow-100 text-yellow-700",
    warning:  "bg-blue-100 text-blue-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || "bg-neutral-100 text-neutral-600"}`}>{s}</span>;
}

export default function CompliancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "dnc" | "consent" | "violations">("overview");
  const [dashboard, setDashboard] = useState<(ComplianceDashboardResult & { status: string }) | null>(null);
  const [dncEntries, setDncEntries] = useState<DncEntry[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // DNC add form
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, dnc, con, viol] = await Promise.all([
        complianceDashboard(),
        complianceDncList(),
        complianceConsentList(),
        complianceGetReport(),
      ]);
      setDashboard(dash);
      setDncEntries(dnc.entries || []);
      setConsents(con.consents || []);
      setViolations(viol.violations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const addDnc = async () => {
    if (!newPhone.trim()) return;
    setBusy(true);
    try {
      await complianceDncAdd({ phone: newPhone.trim(), reason: newReason.trim() || undefined });
      setNewPhone(""); setNewReason("");
      await load();
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const removeDnc = async (phone: string) => {
    if (!confirm(`Remove ${phone} from DNC list?`)) return;
    setBusy(true);
    try { await complianceDncRemove({ phone }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const bulkAdd = async () => {
    const phones = bulkText.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
    if (!phones.length) return;
    setBusy(true);
    try {
      const r = await complianceDncBulkAdd({ phones, reason: "Bulk import" });
      alert(`Added ${r.added} numbers. Skipped ${r.skipped} duplicates.`);
      setBulkText(""); setShowBulk(false);
      await load();
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const revokeConsent = async (phone: string) => {
    if (!confirm(`Revoke consent for ${phone}?`)) return;
    setBusy(true);
    try { await complianceConsentRevoke({ phone }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const d = dashboard;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Compliance Intelligence
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">TCPA · GDPR · HIPAA — DNC registry, consent management & violation monitoring</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {(["overview","dnc","consent","violations"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
            {t === "overview" ? "Overview" : t === "dnc" ? "DNC List" : t === "consent" ? "Consent Records" : "Violations"}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────── */}
      {tab === "overview" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreRing score={d.complianceScore} />
            <StatCard label="Total Calls" value={d.totalCalls} icon={CheckCircle2} color="bg-blue-500" />
            <StatCard label="Blocked Calls" value={d.blockedCalls} icon={PhoneOff} color="bg-red-500" />
            <StatCard label="DNC Numbers" value={d.dncCount} icon={XCircle} color="bg-neutral-500" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active Consents" value={d.activeConsents} icon={ShieldCheck} color="bg-green-500" />
            <StatCard label="Critical Violations" value={d.violations.critical} icon={ShieldAlert} color="bg-red-600" />
            <StatCard label="High Violations" value={d.violations.high} icon={AlertTriangle} color="bg-orange-500" />
            <StatCard label="Medium + Warnings" value={d.violations.medium + d.violations.warning} icon={AlertTriangle} color="bg-yellow-500" />
          </div>

          {/* Recent violations preview */}
          {violations.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-700">Recent Violations</h2>
                <button onClick={() => setTab("violations")} className="text-xs text-blue-600 hover:underline">View all</button>
              </div>
              <div className="divide-y divide-neutral-50">
                {violations.slice(0, 5).map(v => (
                  <div key={v.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <SeverityBadge s={v.severity} />
                      <span className="text-sm text-neutral-700">{v.violationType.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-xs text-neutral-400">{v.createdAt ? new Date(v.createdAt).toLocaleString() : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DNC List ─────────────────────────────────── */}
      {tab === "dnc" && (
        <div className="space-y-4">
          {/* Add number */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-700">Add to DNC List</h2>
            <div className="flex gap-2">
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 555 000 0000"
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
              <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Reason (optional)"
                className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
              <button onClick={addDnc} disabled={busy || !newPhone.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#F22F46] text-white rounded-lg disabled:opacity-50 hover:bg-[#d41f35]">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
            <button onClick={() => setShowBulk(!showBulk)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Upload className="w-3 h-3" /> Bulk import
            </button>
            {showBulk && (
              <div className="space-y-2">
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                  placeholder="One number per line, or comma-separated: +1555000001, +1555000002..."
                  rows={4} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
                <button onClick={bulkAdd} disabled={busy || !bulkText.trim()}
                  className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-lg disabled:opacity-50 hover:bg-neutral-700">
                  Import
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-700">DNC Registry ({dncEntries.length} numbers)</h2>
            </div>
            {dncEntries.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">No DNC entries yet</div>
            ) : (
              <div className="divide-y divide-neutral-50">
                {dncEntries.map(e => (
                  <div key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{e.phone}</p>
                      {e.reason && <p className="text-xs text-neutral-500">{e.reason}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-400">{e.addedAt ? new Date(e.addedAt).toLocaleDateString() : "—"}</span>
                      <button onClick={() => removeDnc(e.phone)} className="text-neutral-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Consent Records ──────────────────────────── */}
      {tab === "consent" && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <h2 className="text-sm font-semibold text-neutral-700">Consent Records ({consents.length})</h2>
          </div>
          {consents.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">No consent records yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    {["Phone","Channel","Purpose","Status","Consented At",""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {consents.map(c => (
                    <tr key={c.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-2.5 text-neutral-800">{c.phone}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{c.channel}</td>
                      <td className="px-4 py-2.5 text-neutral-500 max-w-xs truncate">{c.purpose || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "active" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-400 text-xs">{c.consentedAt ? new Date(c.consentedAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-2.5">
                        {c.status === "active" && (
                          <button onClick={() => revokeConsent(c.phone)}
                            className="text-xs text-red-500 hover:text-red-700">Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Violations ───────────────────────────────── */}
      {tab === "violations" && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <h2 className="text-sm font-semibold text-neutral-700">Violations Log ({violations.length})</h2>
          </div>
          {violations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">No violations recorded</div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {violations.map(v => (
                <div key={v.id} className="px-4 py-3 flex items-start gap-3">
                  <SeverityBadge s={v.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800">{v.violationType.replace(/_/g, " ")}</p>
                    {v.callSessionId && <p className="text-xs text-neutral-500">Session: {v.callSessionId}</p>}
                    {v.details && Object.keys(v.details).length > 0 && (
                      <p className="text-xs text-neutral-400 mt-0.5">{JSON.stringify(v.details).slice(0, 120)}</p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 shrink-0">{v.createdAt ? new Date(v.createdAt).toLocaleString() : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
