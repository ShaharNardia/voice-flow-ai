"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDuration, formatPhone } from "@/lib/utils";
import {
  PhoneCall,
  Bot,
  Clock,
  Users,
  TrendingUp,
  Circle,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { UsageMeter } from "@/components/ui/UsageMeter";
import { UpgradeModal } from "@/components/ui/UpgradeModal";
import { getUserPlan } from "@/lib/firebase-functions";
import { useUsersMap } from "@/hooks/useUsersMap";
import OwnerBadge from "@/components/OwnerBadge";
import WizardWelcomeBanner from "@/components/WizardWelcomeBanner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays } from "date-fns";

interface CallSession {
  id: string;
  leadNumber?: string;
  status: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  assistantDefinition?: { name?: string };
  conversationHistory?: unknown[];
  duration?: number;
  ownerId?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  color?: string;
  // #51 — when true, render shimmer placeholders instead of a hard "0" so the
  // dashboard doesn't briefly show all-zeros before the first Firestore
  // snapshot lands.
  loading?: boolean;
}

function StatCard({ label, value, icon: Icon, trend, color = "#F22F46", loading = false }: StatCardProps) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-neutral-500 text-sm font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "15" }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-neutral-200 rounded animate-pulse" aria-label="Loading…" />
      ) : (
        <div className="text-2xl font-bold text-neutral-900">{value}</div>
      )}
      {loading ? (
        <div className="mt-2 h-3 w-24 bg-neutral-100 rounded animate-pulse" />
      ) : (
        trend && <div className="text-xs text-neutral-400 mt-1">{trend}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    "in-progress": { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
    "completed": { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
    "failed": { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
    "initiated": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  };
  const style = map[status] || { bg: "bg-neutral-100", text: "text-neutral-500", dot: "bg-neutral-400" };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <Circle className={`w-1.5 h-1.5 fill-current ${status === "in-progress" ? "pulse-dot" : ""} ${style.dot}`} />
      {status === "in-progress" ? "Live" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// Build last 7 days chart data from call sessions
function buildChartData(sessions: CallSession[]) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: format(d, "MMM d"), dateKey: format(d, "yyyy-MM-dd"), calls: 0 };
  });

  sessions.forEach((s) => {
    if (!s.createdAt) return;
    const dayKey = format(s.createdAt.toDate(), "yyyy-MM-dd");
    const day = days.find((d) => d.dateKey === dayKey);
    if (day) day.calls++;
  });

  return days;
}

interface PlanUsage {
  minutesUsed: number;
  callCount: number;
  assistantCount: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { usersMap, isSuperAdmin } = useUsersMap();
  const { isBasic, loading: planLoading, limits } = usePlan();
  const [recentCalls, setRecentCalls] = useState<CallSession[]>([]);
  const [allCalls, setAllCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Live calls (real-time)
    const liveQ = isSuperAdmin
      ? query(collection(db, "call_sessions"), where("status", "==", "in-progress"), limit(10))
      : query(collection(db, "call_sessions"), where("ownerId", "==", user.uid), where("status", "==", "in-progress"), limit(10));

    // Recent calls for stats
    const recentQ = isSuperAdmin
      ? query(collection(db, "call_sessions"), orderBy("createdAt", "desc"), limit(50))
      : query(collection(db, "call_sessions"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"), limit(50));

    const unsubLive = onSnapshot(liveQ, (snap) => {
      const live = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession));
      setRecentCalls((prev) => {
        const nonLive = prev.filter((c) => c.status !== "in-progress");
        return [...live, ...nonLive].slice(0, 20);
      });
    }, () => {});

    const unsubRecent = onSnapshot(recentQ, (snap) => {
      const calls = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession));
      setAllCalls(calls);
      setRecentCalls(calls.slice(0, 10));
      setLoading(false);
    }, () => setLoading(false));

    return () => {
      unsubLive();
      unsubRecent();
    };
  }, [user, isSuperAdmin]);

  // Load plan usage for BASIC users (only after plan is confirmed loaded)
  useEffect(() => {
    if (!user || planLoading || !isBasic) return;
    getUserPlan().then((data) => {
      setPlanUsage(data.usage as PlanUsage);
    }).catch(() => {});
  }, [user, isBasic, planLoading]);

  const liveCalls = allCalls.filter((c) => {
    if (c.status !== "in-progress") return false;
    // Don't count sessions older than 5 minutes as "live" — they're stale
    // Twilio status callbacks are unreliable for inbound calls
    if (c.createdAt && c.createdAt.toDate) {
      const created = c.createdAt.toDate();
      if (Date.now() - created.getTime() > 5 * 60 * 1000) return false;
    }
    return true;
  }).length;
  const todayCalls = allCalls.filter((c) => {
    if (!c.createdAt) return false;
    const today = new Date();
    const d = c.createdAt.toDate();
    return d.toDateString() === today.toDateString();
  }).length;

  const avgDuration = useMemo(() => {
    const withDuration = allCalls.filter(c => c.duration && c.duration > 0);
    if (withDuration.length === 0) return "N/A";
    const avg = withDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / withDuration.length;
    return avg < 60 ? `${Math.round(avg)}s` : `${(avg / 60).toFixed(1)}m`;
  }, [allCalls]);

  const chartData = buildChartData(allCalls);

  const minutesPct = planUsage ? (planUsage.minutesUsed / 50) * 100 : 0;

  return (
    <div className="space-y-6">
      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />

      {/* First-run banner pointing to the voice-enabled wizard.
          Only decide visibility AFTER calls load — otherwise it flashes on
          for established tenants during the loading window (allCalls starts
          empty → looks like a new tenant → shows → hides ~1s later when the
          snapshot arrives). Gate on !loading so it never flickers. */}
      {!loading && <WizardWelcomeBanner assistantCount={allCalls.length > 0 ? 1 : 0} />}

      {/* ── BASIC upgrade banner ── */}
      {isBasic && planUsage && (
        <div className={`rounded-xl p-4 flex items-center gap-4 ${
          minutesPct >= 80
            ? "bg-red-50 border border-red-200"
            : "bg-gradient-to-r from-[#F22F46]/5 to-[#F22F46]/10 border border-[#F22F46]/20"
        }`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            minutesPct >= 80 ? "bg-red-100" : "bg-[#F22F46]/10"
          }`}>
            {minutesPct >= 80
              ? <AlertTriangle className="w-4 h-4 text-red-600" />
              : <Zap className="w-4 h-4 text-[#F22F46]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            {minutesPct >= 80 ? (
              <p className="text-sm font-semibold text-red-800">
                ⚠️ Running low — only {Math.max(0, 50 - planUsage.minutesUsed)} minutes left this month
              </p>
            ) : planUsage.callCount >= 3 ? (
              <p className="text-sm font-semibold text-neutral-800">
                🔥 You&apos;ve made {planUsage.callCount} calls! Run a campaign to 10x your reach
              </p>
            ) : (
              <p className="text-sm font-semibold text-neutral-800">
                You&apos;re on the BASIC plan · {planUsage.minutesUsed}/50 minutes used
              </p>
            )}
            <UsageMeter
              used={planUsage.minutesUsed}
              max={limits.minutesPerMonth}
              label="Call minutes this month"
              className="mt-2 max-w-xs"
            />
          </div>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="shrink-0 bg-[#F22F46] hover:bg-[#d9243b] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Upgrade to PRO →
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Live Calls"
          value={liveCalls}
          icon={PhoneCall}
          trend={liveCalls > 0 ? "Active right now" : "No active calls"}
          color="#F22F46"
          loading={loading}
        />
        <StatCard
          label="Calls Today"
          value={todayCalls}
          icon={TrendingUp}
          trend="Last 24 hours"
          color="#0066CC"
          loading={loading}
        />
        <StatCard
          label="Total Calls (50)"
          value={allCalls.length}
          icon={Bot}
          trend="Loaded"
          color="#22C55E"
          loading={loading}
        />
        <StatCard
          label="Avg Duration"
          value={avgDuration}
          icon={Clock}
          trend="Per call average"
          color="#F59E0B"
          loading={loading}
        />
      </div>

      {/* Chart + recent calls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume chart */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-neutral-800 text-sm">Call Volume — Last 7 Days</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F22F46" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F22F46" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1F2937", border: "none", borderRadius: 8, color: "#F9FAFB", fontSize: 12 }}
                cursor={{ stroke: "#F22F46", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="#F22F46"
                strokeWidth={2}
                fill="url(#callGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick stats */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold text-neutral-800 text-sm mb-4">Status Breakdown</h2>
          <div className="space-y-3">
            {[
              { label: "Completed", color: "bg-neutral-400", count: allCalls.filter((c) => c.status === "completed").length },
              { label: "Live", color: "bg-green-500", count: liveCalls },
              { label: "Failed", color: "bg-red-400", count: allCalls.filter((c) => c.status === "failed").length },
              { label: "Initiated", color: "bg-blue-400", count: allCalls.filter((c) => c.status === "initiated").length },
            ].map(({ label, color, count }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-neutral-600 text-sm">{label}</span>
                </div>
                <span className="text-neutral-800 font-semibold text-sm">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent calls table */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-800 text-sm">Recent Calls</h2>
          <a href="/calls" className="text-xs text-[#0066CC] hover:underline">View all →</a>
        </div>
        {loading ? (
          <div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>
        ) : recentCalls.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
            <p className="text-neutral-400 text-sm">No calls yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Caller</th>
                <th className="px-5 py-3 text-left">Assistant</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Turns</th>
                <th className="px-5 py-3 text-left">Duration</th>
                <th className="px-5 py-3 text-left">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {recentCalls.map((call) => {
                // Treat stale "in-progress" sessions (>5 min) as completed
                let effectiveStatus = call.status;
                if (call.status === "in-progress" && call.createdAt && call.createdAt.toDate) {
                  const age = Date.now() - call.createdAt.toDate().getTime();
                  if (age > 5 * 60 * 1000) effectiveStatus = "completed";
                }
                return (
                <tr key={call.id} className="hover:bg-neutral-50/50 transition-colors">
                  <td className="px-5 py-3 text-sm text-neutral-700 font-mono">
                    <div className="flex items-center gap-2">
                      <span>{call.leadNumber ? formatPhone(call.leadNumber) : "—"}</span>
                      {isSuperAdmin && <OwnerBadge ownerId={call.ownerId} usersMap={usersMap} />}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-600">
                    {call.assistantDefinition?.name || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={effectiveStatus} />
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-500">
                    {Math.floor((call.conversationHistory?.length || 0) / 2)}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-500">
                    {call.duration ? `${Math.round(call.duration)}s` : "\u2014"}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {call.createdAt ? formatDate(call.createdAt.toDate()) : "—"}
                  </td>
                </tr>
                ); })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
