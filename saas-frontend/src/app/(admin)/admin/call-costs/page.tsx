"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { CostBreakdownCard, type CostBreakdown } from "@/components/CostBreakdownCard";
import { ArrowLeft, Loader2 } from "lucide-react";

interface CallCostDoc {
  id: string;
  costs?: CostBreakdown;
  assistantName?: string;
  assistantId?: string;
  fromNumber?: string;
  toNumber?: string;
  durationSeconds?: number;
  createdAt?: { toDate?: () => Date } | string | number;
}

function CallCostsInner() {
  const params = useSearchParams();
  const callId = params.get("id") || "";
  const { role, loading: authLoading } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [call, setCall] = useState<CallCostDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!callId || !isSuperAdmin) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "call_sessions", callId),
      (snap) => { setCall(snap.exists() ? ({ id: snap.id, ...snap.data() } as CallCostDoc) : null); setLoading(false); },
      () => setLoading(false),
    );
    return () => unsub();
  }, [callId, isSuperAdmin]);

  if (authLoading) return null;

  // Real cost + profit is platform-operator-only. Tenant admins (allowed into the
  // rest of /admin) must not see it, so re-gate to super_admin here.
  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-neutral-500">This page is restricted to the platform operator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Call costs</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Operator-only. Provider cost &amp; profit for a single call.</p>
        </div>
        {callId && (
          <Link href={`/calls/detail?id=${callId}`} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-lg px-3 py-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to call
          </Link>
        )}
      </div>

      {!callId ? (
        <p className="text-sm text-neutral-500">No call selected. Open a call and use “View call costs (admin)”.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !call ? (
        <p className="text-sm text-neutral-500">Call not found.</p>
      ) : (
        <>
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600 space-y-1">
            <div><span className="text-neutral-400">Call:</span> <span className="font-mono">{call.id}</span></div>
            {call.assistantName && <div><span className="text-neutral-400">Assistant:</span> {call.assistantName}</div>}
            {typeof call.durationSeconds === "number" && <div><span className="text-neutral-400">Duration:</span> {call.durationSeconds}s</div>}
            {(call.fromNumber || call.toNumber) && <div><span className="text-neutral-400">Numbers:</span> {call.fromNumber || "?"} → {call.toNumber || "?"}</div>}
          </div>
          {call.costs
            ? <CostBreakdownCard costs={call.costs} />
            : <p className="text-sm text-neutral-400 mt-4">No cost data recorded for this call.</p>}
        </>
      )}
    </div>
  );
}

export default function CallCostsPage() {
  return (
    <Suspense fallback={null}>
      <CallCostsInner />
    </Suspense>
  );
}
