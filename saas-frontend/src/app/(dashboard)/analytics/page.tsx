"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useUsersMap } from "@/hooks/useUsersMap";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { FeatureGate } from "@/components/FeatureGate";

interface CallSession {
  id: string;
  status: string;
  createdAt?: Timestamp;
  conversationHistory?: unknown[];
  duration?: number;
}

function buildDailyData(calls: CallSession[], days = 14) {
  const result = Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return { date: format(d, "MMM d"), dateKey: format(d, "yyyy-MM-dd"), calls: 0, completed: 0, failed: 0 };
  });

  calls.forEach((c) => {
    if (!c.createdAt) return;
    const key = format(c.createdAt.toDate(), "yyyy-MM-dd");
    const day = result.find((d) => d.dateKey === key);
    if (!day) return;
    day.calls++;
    if (c.status === "completed") day.completed++;
    if (c.status === "failed") day.failed++;
  });

  return result;
}

function AnalyticsPageInner() {
  const { user } = useAuth();
  const { isSuperAdmin } = useUsersMap();
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(14);

  useEffect(() => {
    if (!user?.uid) return;
    const q = isSuperAdmin
      ? query(collection(db, "call_sessions"), orderBy("createdAt", "desc"), limit(500))
      : query(collection(db, "call_sessions"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      setCalls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user?.uid, isSuperAdmin]);

  // Filter calls within selected date range
  const filteredCalls = calls.filter((c) => {
    if (!c.createdAt) return false;
    const cutoff = subDays(new Date(), dateRange);
    return c.createdAt.toDate() >= cutoff;
  });

  const chartData = buildDailyData(filteredCalls, dateRange);
  const totalCalls = filteredCalls.length;
  const completedRate = totalCalls > 0 ? Math.round(filteredCalls.filter((c) => c.status === "completed").length / totalCalls * 100) : 0;
  const avgTurns = totalCalls > 0 ? (filteredCalls.reduce((acc, c) => acc + Math.floor((c.conversationHistory?.length || 0) / 2), 0) / totalCalls).toFixed(1) : "0";
  const avgDuration = (() => {
    const withDuration = filteredCalls.filter(c => c.duration && c.duration > 0);
    if (withDuration.length === 0) return "N/A";
    const avg = withDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / withDuration.length;
    return avg < 60 ? `${Math.round(avg)}s` : `${(avg / 60).toFixed(1)}m`;
  })();

  if (loading) return <div className="p-8 text-center text-neutral-400 text-sm">Loading analytics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Analytics</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Last {dateRange} days</p>
        </div>
        <select value={dateRange} onChange={(e) => setDateRange(Number(e.target.value))}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Total Calls", value: totalCalls },
          { label: "Completion Rate", value: `${completedRate}%` },
          { label: "Avg Turns/Call", value: avgTurns },
          { label: "Avg Duration", value: avgDuration },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-2">{label}</div>
            <div className="text-2xl font-bold text-neutral-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h3 className="font-semibold text-neutral-800 text-sm mb-4">Daily Call Volume</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#F9FAFB", fontSize: 12 }} />
              <Bar dataKey="calls" fill="#F22F46" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h3 className="font-semibold text-neutral-800 text-sm mb-4">Completed vs Failed</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#F9FAFB", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="completed" stroke="#22C55E" strokeWidth={2} dot={false} name="Completed" />
              <Line type="monotone" dataKey="failed" stroke="#EF4444" strokeWidth={2} dot={false} name="Failed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return <FeatureGate featureId="module.analytics"><AnalyticsPageInner /></FeatureGate>;
}
