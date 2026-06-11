"use client";

/**
 * Admin → System Health — single-pane status of every integration the system
 * depends on. Auto-refreshes every 30 seconds.
 */

import { useEffect, useRef, useState } from "react";
import {
  Heart, RefreshCw, Loader2, CheckCircle2, AlertTriangle, X, AlertCircle,
  Wifi, WifiOff, MinusCircle,
} from "lucide-react";
import { adminHealthCheck, type HealthCheck } from "@/lib/firebase-functions";

const STATUS_META: Record<HealthCheck["status"], { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  ok:           { color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200",   icon: <CheckCircle2 className="w-4 h-4" /> },
  degraded:     { color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   icon: <AlertTriangle className="w-4 h-4" /> },
  down:         { color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200",     icon: <X className="w-4 h-4" /> },
  unconfigured: { color: "text-neutral-500", bg: "bg-neutral-50", border: "border-neutral-200", icon: <MinusCircle className="w-4 h-4" /> },
};

export default function HealthPage() {
  const [data,    setData]    = useState<{
    overall: "ok" | "degraded" | "down";
    results: HealthCheck[];
    totalLatencyMs: number;
    checkedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await adminHealthCheck();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(load, 30_000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh]);

  const overallMeta = data ? STATUS_META[data.overall] : STATUS_META.unconfigured;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" /> System Health
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Every integration health check, run in parallel. Auto-refreshes every 30 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="w-3.5 h-3.5" />
            Auto-refresh
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-200 hover:bg-neutral-50 text-sm rounded-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Check now
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Overall summary bar */}
          <div className={`mb-5 rounded-xl border p-4 ${overallMeta.bg} ${overallMeta.border}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={overallMeta.color}>{overallMeta.icon}</span>
                <div>
                  <div className={`text-base font-semibold ${overallMeta.color}`}>
                    {data.overall === "ok"       && "All systems operational"}
                    {data.overall === "degraded" && "Some systems degraded"}
                    {data.overall === "down"     && "Critical systems down"}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Last checked {new Date(data.checkedAt).toLocaleTimeString()} · all checks in {data.totalLatencyMs}ms
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Pill label="OK"           count={data.results.filter((r) => r.status === "ok").length}           color="green" />
                <Pill label="Degraded"     count={data.results.filter((r) => r.status === "degraded").length}     color="amber" />
                <Pill label="Down"         count={data.results.filter((r) => r.status === "down").length}         color="red" />
                <Pill label="Unconfigured" count={data.results.filter((r) => r.status === "unconfigured").length} color="neutral" />
              </div>
            </div>
          </div>

          {/* Tile grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.results.map((r) => {
              const m = STATUS_META[r.status];
              return (
                <div key={r.id} className={`rounded-xl border p-4 ${m.bg} ${m.border}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={m.color}>{m.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">{r.label}</div>
                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{r.provider}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${m.color} ${m.bg}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-neutral-600 break-words">{r.detail}</div>
                  <div className="mt-2 text-[10px] text-neutral-400">checked in {r.latencyMs}ms</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ label, count, color }: { label: string; count: number; color: "green" | "amber" | "red" | "neutral" }) {
  const c = {
    green:   "bg-green-100 text-green-700",
    amber:   "bg-amber-100 text-amber-700",
    red:     "bg-red-100 text-red-700",
    neutral: "bg-neutral-100 text-neutral-500",
  }[color];
  return (
    <div className={`px-2 py-1 rounded font-mono ${c}`}>{count} {label}</div>
  );
}
