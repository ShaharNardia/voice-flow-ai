"use client";

/**
 * Admin → Logs — live log tail with filters (service, severity, call session,
 * free text, time window). Replaces "gcloud logging tail" workflows.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ScrollText, RefreshCw, Loader2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { adminLogsQuery, type LogEntry } from "@/lib/firebase-functions";

const SEVERITY_COLOR: Record<string, string> = {
  DEBUG:    "bg-neutral-100 text-neutral-500",
  INFO:     "bg-blue-100 text-blue-700",
  NOTICE:   "bg-blue-100 text-blue-700",
  WARNING:  "bg-amber-100 text-amber-700",
  ERROR:    "bg-red-100 text-red-700",
  CRITICAL: "bg-red-200 text-red-800",
  DEFAULT:  "bg-neutral-100 text-neutral-500",
};

export default function LogsPage() {
  const [service,       setService]       = useState<"mediastream" | "functions" | "sip-bridge" | "all">("mediastream");
  const [severity,      setSeverity]      = useState<"" | "INFO" | "WARNING" | "ERROR">("");
  const [hours,         setHours]         = useState(1);
  const [search,        setSearch]        = useState("");
  const [callSessionId, setCallSessionId] = useState("");
  const [autoRefresh,   setAutoRefresh]   = useState(false);
  const [entries,       setEntries]       = useState<LogEntry[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [filter,        setFilter]        = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await adminLogsQuery({
        service,
        severity: severity || undefined,
        search,
        callSessionId,
        hours,
        limit: 500,
      });
      setEntries(r.entries);
      setFilter(r.filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* on first render only */ }, []);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(load, 15_000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current); timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, service, severity, hours, search, callSessionId]);

  // Try to detect a callSessionId pattern in a log line for the "jump to call" button
  function detectCallId(msg: string): string | null {
    const m = msg.match(/\[([A-Za-z0-9]{16,})\]/);
    return m ? m[1] : null;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-blue-600" /> Logs
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Live tail of Cloud Run / Firebase Functions logs with filtering. Last 24 hours retained.
        </p>
      </header>

      {/* Filter bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Service">
            <select value={service} onChange={(e) => setService(e.target.value as "mediastream" | "functions" | "sip-bridge" | "all")} className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm">
              <option value="mediastream">mediastream</option>
              <option value="functions">functions</option>
              <option value="sip-bridge">sip-bridge</option>
              <option value="all">all</option>
            </select>
          </Field>
          <Field label="Severity (min)">
            <select value={severity} onChange={(e) => setSeverity(e.target.value as "" | "INFO" | "WARNING" | "ERROR")} className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm">
              <option value="">all</option>
              <option value="INFO">INFO+</option>
              <option value="WARNING">WARNING+</option>
              <option value="ERROR">ERROR+</option>
            </select>
          </Field>
          <Field label="Time window">
            <select value={hours} onChange={(e) => setHours(parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm">
              <option value={0.25}>15 min</option>
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
            </select>
          </Field>
          <Field label="Search text">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ffmpeg" className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm" />
          </Field>
          <Field label="Call Session ID">
            <input value={callSessionId} onChange={(e) => setCallSessionId(e.target.value)} placeholder="e.g. z3vZRiQ..." className="w-full px-2 py-1.5 border border-neutral-200 rounded text-sm font-mono" />
          </Field>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="w-3.5 h-3.5" />
            Auto-refresh every 15s
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run query
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      <div className="text-xs text-neutral-500 mb-2 flex items-center justify-between">
        <span>{entries.length} entries</span>
        {filter && <span className="font-mono truncate max-w-[60%]" title={filter}>{filter.slice(0, 100)}…</span>}
      </div>

      {/* Log table */}
      <div className="bg-[#0D1117] rounded-xl overflow-hidden border border-neutral-200">
        {entries.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 text-sm">
            {loading ? "Loading…" : "No log entries match the filters."}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto font-mono text-[11px]">
            {entries.map((e, i) => {
              const cid = detectCallId(e.message);
              return (
                <div key={i} className="flex items-start gap-3 px-3 py-1.5 border-b border-neutral-800/40 hover:bg-white/5">
                  <span className="text-neutral-500 flex-shrink-0">{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${SEVERITY_COLOR[e.severity] || SEVERITY_COLOR.DEFAULT}`}>{e.severity}</span>
                  <span className="text-[10px] text-neutral-500 flex-shrink-0">{e.service.slice(0, 18)}</span>
                  <span className="text-neutral-200 break-all flex-1">{e.message}</span>
                  {cid && (
                    <Link href={`/calls/detail/?id=${cid}`} className="text-blue-400 hover:text-blue-300 flex-shrink-0" title="Jump to call detail">
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}
