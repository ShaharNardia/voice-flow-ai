"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatPhone, truncate } from "@/lib/utils";
import {
  campaignStart,
  campaignPause,
  placeCall,
  type Campaign,
  type Lead,
} from "@/lib/firebase-functions";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  Play,
  Pause,
  Phone,
  Download,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LEAD_STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-700",
    icon: <Clock className="w-3 h-3" />,
  },
  queued: {
    label: "Queued",
    className: "bg-yellow-100 text-yellow-700",
    icon: <Clock className="w-3 h-3" />,
  },
  calling: {
    label: "Calling",
    className: "bg-blue-100 text-blue-700",
    icon: <PhoneCall className="w-3 h-3 animate-pulse" />,
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  callback: {
    label: "Callback",
    className: "bg-orange-100 text-orange-700",
    icon: <PhoneOff className="w-3 h-3" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-600",
    icon: <XCircle className="w-3 h-3" />,
  },
  dnc: {
    label: "DNC",
    className: "bg-gray-100 text-gray-600",
    icon: <PhoneMissed className="w-3 h-3" />,
  },
};

const CAMPAIGN_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  running: { label: "Running", className: "bg-green-100 text-green-700" },
  paused: { label: "Paused", className: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completed", className: "bg-blue-100 text-blue-700" },
};

function CampaignStatusBadge({ status }: { status: string }) {
  const cfg = CAMPAIGN_STATUS_BADGE[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function LeadStatusBadge({ status }: { status: string }) {
  const cfg = LEAD_STATUS_BADGE[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
    icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function FullProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <span className="font-medium">Overall Progress</span>
        <span className="text-gray-400">
          {value} of {max} called ({pct}%)
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "queued", label: "Queued" },
  { value: "calling", label: "Calling" },
  { value: "completed", label: "Completed" },
  { value: "callback", label: "Callback" },
  { value: "failed", label: "Failed" },
  { value: "dnc", label: "DNC" },
];

function CampaignDetailContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("id") ?? "";

  const [campaign, setCampaign] = useState<(Campaign & { id: string }) | null>(null);
  const [leads, setLeads] = useState<(Lead & { id: string })[]>([]);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [callError, setCallError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Load campaign once
  useEffect(() => {
    if (!campaignId) return;
    getDoc(doc(db, "campaigns", campaignId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data() as Campaign; setCampaign({ ...d, id: snap.id });
      }
      setLoadingCampaign(false);
    });
  }, [campaignId]);

  // Real-time leads
  useEffect(() => {
    if (!campaignId) return;
    const q = query(
      collection(db, "leads"),
      where("campaignId", "==", campaignId),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => { const ld = d.data() as Lead; return { ...ld, id: d.id }; }));
    });
    return () => unsub();
  }, [campaignId]);

  // Also keep campaign status in sync via leads snapshot-triggered state
  useEffect(() => {
    if (!campaignId) return;
    const unsub = onSnapshot(doc(db, "campaigns", campaignId), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Campaign; setCampaign({ ...d, id: snap.id });
      }
    });
    return () => unsub();
  }, [campaignId]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch =
        !search ||
        (l.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.phone ?? "").includes(search);
      const matchesStatus = !statusFilter || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const called = leads.filter((l) => l.status && l.status !== "new").length;
    const success = leads.filter((l) => l.status === "completed").length;
    const failed = leads.filter((l) => l.status === "failed").length;
    const remaining = leads.filter((l) => !l.status || l.status === "new").length;
    return { total, called, success, failed, remaining };
  }, [leads]);

  const handleStart = useCallback(async () => {
    if (!campaign) return;
    setActionLoading(true);
    setCallError("");
    try {
      await campaignStart({ campaignId: campaign.id, batchSize: 10 });
    } catch (e: unknown) {
      setCallError(e instanceof Error ? e.message : "Failed to start campaign");
    } finally {
      setActionLoading(false);
    }
  }, [campaign]);

  const handlePause = useCallback(async () => {
    if (!campaign) return;
    setActionLoading(true);
    try {
      await campaignPause({ campaignId: campaign.id });
    } catch (e: unknown) {
      setCallError(e instanceof Error ? e.message : "Failed to pause campaign");
    } finally {
      setActionLoading(false);
    }
  }, [campaign]);

  const handleCallAllRemaining = useCallback(async () => {
    if (!campaign) return;
    setActionLoading(true);
    setCallError("");
    try {
      await campaignStart({ campaignId: campaign.id, batchSize: 50 });
    } catch (e: unknown) {
      setCallError(e instanceof Error ? e.message : "Failed to start calls");
    } finally {
      setActionLoading(false);
    }
  }, [campaign]);

  const handleCallLead = useCallback(
    async (lead: Lead & { id: string }) => {
      if (!campaign) return;
      setCallingLeadId(lead.id);
      setCallError("");
      try {
        await placeCall({
          number: lead.phone,
          companyPhone: campaign.fromNumber,
          assistantId: campaign.assistantId,
        });
      } catch (e: unknown) {
        setCallError(e instanceof Error ? e.message : "Failed to place call");
      } finally {
        setCallingLeadId(null);
      }
    },
    [campaign]
  );

  const handleExportCSV = useCallback(() => {
    if (!leads.length) return;
    const rows = leads.map((l) => ({
      Name: l.name ?? "",
      Phone: l.phone ?? "",
      Email: l.email ?? "",
      Company: l.company ?? "",
      Status: l.status ?? "",
      "Last Call": l.lastCallDate ? formatDate(l.lastCallDate as string) : "",
      Outcome: l.lastCallOutcome ?? "",
      Summary: l.lastCallSummary ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `${campaign?.name ?? "campaign"}_results.csv`);
  }, [leads, campaign]);

  if (loadingCampaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">Campaign not found.</p>
        <Link href="/campaigns" className="text-sm text-blue-600 hover:underline">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  const isRunning = campaign.status === "running";
  const canStart = campaign.status === "draft" || campaign.status === "paused";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        {/* Back */}
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Campaigns
        </Link>

        {/* Campaign header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status ?? "draft"} />
          </div>
          <div className="flex items-center gap-2">
            {canStart && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-colors shadow-sm hover:opacity-90"
                style={{ backgroundColor: "#F22F46" }}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Start Campaign
              </button>
            )}
            {isRunning && (
              <button
                onClick={handlePause}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-60 transition-colors"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
                Pause
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Leads" value={stats.total} />
          <StatCard label="Called" value={stats.called} color="text-blue-600" />
          <StatCard label="Success" value={stats.success} color="text-green-600" />
          <StatCard label="Failed" value={stats.failed} color="text-red-500" />
          <StatCard label="Remaining" value={stats.remaining} color="text-gray-500" />
        </div>

        {/* Progress */}
        <FullProgressBar value={stats.called} max={stats.total} />

        {/* Table section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Table toolbar */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <button
                onClick={handleCallAllRemaining}
                disabled={actionLoading || stats.remaining === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                style={{ backgroundColor: "#F22F46" }}
              >
                <Phone className="w-4 h-4" />
                Call All Remaining
              </button>
              <button
                onClick={handleExportCSV}
                disabled={leads.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Call error banner */}
          {callError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{callError}</span>
              <button onClick={() => setCallError("")} className="text-red-400 hover:text-red-600">
                <span className="sr-only">Dismiss</span>&times;
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Last Call
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Outcome
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Summary
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                      {leads.length === 0 ? "No leads in this campaign." : "No leads match your filters."}
                    </td>
                  </tr>
                )}
                {filteredLeads.map((lead) => {
                  const isCallingThis = callingLeadId === lead.id;
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {lead.name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {lead.phone ? formatPhone(lead.phone) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <LeadStatusBadge status={lead.status ?? "new"} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {lead.lastCallDate ? formatDate(lead.lastCallDate as string) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {lead.lastCallOutcome ? (
                          <span className="capitalize">{lead.lastCallOutcome}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px]">
                        {lead.lastCallSummary ? (
                          <span title={lead.lastCallSummary}>{truncate(lead.lastCallSummary, 60)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleCallLead(lead)}
                          disabled={isCallingThis}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60 transition-colors hover:opacity-90"
                          style={{ backgroundColor: "#F22F46" }}
                          title={`Call ${lead.name ?? lead.phone}`}
                        >
                          {isCallingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Phone className="w-3.5 h-3.5" />
                          )}
                          Call
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {filteredLeads.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filteredLeads.length} of {leads.length} lead{leads.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading...</div>}>
      <CampaignDetailContent />
    </Suspense>
  );
}
