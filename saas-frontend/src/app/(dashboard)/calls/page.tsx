"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  collection, query, orderBy, limit, onSnapshot, getDocs,
  where, Timestamp, startAfter, QueryDocumentSnapshot,
} from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { formatPhone } from "@/lib/utils";
import Link from "next/link";
import {
  PhoneCall, Circle, ChevronRight, Plus, X, Loader2,
  PhoneOutgoing, Users, Search, User, Tag, Sparkles,
  Clock, Calendar, TrendingUp, UserCheck,
} from "lucide-react";
import { placeCall, assistantsList, type Assistant } from "@/lib/firebase-functions";
import { useUsersMap } from "@/hooks/useUsersMap";
import OwnerBadge from "@/components/OwnerBadge";
import { FeatureGate } from "@/components/FeatureGate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallSession {
  id: string;
  leadNumber?: string;
  status: string;
  createdAt?: Timestamp;
  endedAt?: Timestamp;
  duration?: number;
  assistantDefinition?: { name?: string; language?: string; assistantName?: string };
  assistantName?: string;
  assistantId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  lastAIResponse?: string;
  ownerId?: string;
  tags?: string[];
  callType?: string;
}

interface Lead {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
  notes?: string;
  gender?: string;
  status?: string;
  ownerId?: string;
}

interface PhoneNumberDoc {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  assistantId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(ts?: Timestamp): string {
  if (!ts) return "—";
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return ts.toDate().toLocaleDateString();
}

function callerInitials(name?: string, phone?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  return phone ? phone.slice(-2) : "??";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; dot: string; label: string }> = {
    "in-progress": { bg: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500 animate-pulse", label: "Live" },
    "completed":   { bg: "bg-neutral-100 text-neutral-600 border-neutral-200", dot: "bg-neutral-400", label: "Done" },
    "failed":      { bg: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-500", label: "Failed" },
    "initiated":   { bg: "bg-blue-50 text-blue-600 border-blue-200", dot: "bg-blue-500", label: "Ringing" },
    "no-answer":   { bg: "bg-amber-50 text-amber-600 border-amber-200", dot: "bg-amber-500", label: "No Answer" },
  };
  const s = map[status] || { bg: "bg-neutral-100 text-neutral-500 border-neutral-200", dot: "bg-neutral-400", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function GenderBadge({ gender }: { gender?: string }) {
  if (!gender) return <span className="text-neutral-300 text-xs">—</span>;
  const g = gender.toLowerCase();
  if (g === "male" || g === "זכר" || g === "m")
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">♂ Male</span>;
  if (g === "female" || g === "נקבה" || g === "f")
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100">♀ Female</span>;
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">{gender}</span>;
}

function TagChips({ tags }: { tags?: string[] }) {
  if (!tags?.length) return <span className="text-neutral-300 text-xs">—</span>;
  const colors: Record<string, string> = {
    hot_lead: "bg-red-50 text-red-600 border-red-200",
    cold_lead: "bg-blue-50 text-blue-500 border-blue-200",
    not_interested: "bg-neutral-100 text-neutral-500 border-neutral-200",
    needs_followup: "bg-amber-50 text-amber-600 border-amber-200",
    callback_requested: "bg-purple-50 text-purple-600 border-purple-200",
    appointment_booked: "bg-green-50 text-green-600 border-green-200",
    complaint: "bg-orange-50 text-orange-600 border-orange-200",
    wrong_number: "bg-neutral-100 text-neutral-400 border-neutral-200",
  };
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((t) => (
        <span key={t} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${colors[t] || "bg-neutral-100 text-neutral-500 border-neutral-200"}`}>
          {t.replace(/_/g, " ")}
        </span>
      ))}
      {tags.length > 3 && <span className="text-xs text-neutral-400">+{tags.length - 3}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function CallsPageInner() {
  const { user } = useAuth();
  const { usersMap, isSuperAdmin } = useUsersMap();

  const [calls, setCalls] = useState<CallSession[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<string, Lead>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [search, setSearch] = useState("");

  // Place Call modal state
  const [showPlace, setShowPlace] = useState(false);
  const [toNumber, setToNumber] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberDoc[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [placedSid, setPlacedSid] = useState("");

  // ── Load calls ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = isSuperAdmin
      ? query(collection(db, "call_sessions"), orderBy("createdAt", "desc"), limit(100))
      : query(collection(db, "call_sessions"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"), limit(100));

    const unsub = onSnapshot(q, async (snap) => {
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession));
      setCalls(results);
      setHasMore(results.length >= 100);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setLoading(false);

      // ── Enrich: batch-load leads by phone number ──────────────────────────
      const phoneSet = new Set<string>();
      results.forEach((c) => { if (c.leadNumber) phoneSet.add(c.leadNumber); });
      const phones = Array.from(phoneSet);
      if (phones.length === 0) return;

      // Query in batches of 10 (Firestore `in` limit)
      const batches = [];
      for (let i = 0; i < phones.length; i += 10) {
        batches.push(phones.slice(i, i + 10));
      }
      const allLeads: Lead[] = [];
      await Promise.all(batches.map(async (batch) => {
        try {
          const snap2 = await getDocs(
            query(collection(db, "leads"), where("phone", "in", batch)),
          );
          snap2.docs.forEach((d) => allLeads.push({ id: d.id, ...d.data() } as Lead));
        } catch { /* ignore */ }
      }));
      const map: Record<string, Lead> = {};
      allLeads.forEach((l) => { if (l.phone) map[l.phone] = l; });
      setLeadsMap(map);
    }, () => setLoading(false));
    return unsub;
  }, [user?.uid, isSuperAdmin]);

  const loadMore = useCallback(async () => {
    if (!user?.uid || !lastDoc) return;
    setLoadingMore(true);
    try {
      const moreQ = isSuperAdmin
        ? query(collection(db, "call_sessions"), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(100))
        : query(collection(db, "call_sessions"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(100));
      const snap = await getDocs(moreQ);
      const more = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession));
      setCalls((prev) => [...prev, ...more]);
      setHasMore(more.length >= 100);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }, [user?.uid, isSuperAdmin, lastDoc]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const live = calls.filter((c) => c.status === "in-progress").length;
    const identified = calls.filter((c) => c.leadNumber && leadsMap[c.leadNumber]?.name).length;
    const withDuration = calls.filter((c) => c.duration && c.duration > 0);
    const avgDuration = withDuration.length
      ? Math.round(withDuration.reduce((a, c) => a + (c.duration || 0), 0) / withDuration.length)
      : 0;
    return { total: calls.length, live, identified, avgDuration };
  }, [calls, leadsMap]);

  // ── Filtered calls ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return calls;
    const s = search.toLowerCase();
    return calls.filter((c) => {
      const lead = c.leadNumber ? leadsMap[c.leadNumber] : undefined;
      return (
        c.leadNumber?.includes(s) ||
        lead?.name?.toLowerCase().includes(s) ||
        lead?.interest?.toLowerCase().includes(s) ||
        c.tags?.some((t) => t.toLowerCase().includes(s)) ||
        (c.assistantDefinition?.name || c.assistantName || "").toLowerCase().includes(s)
      );
    });
  }, [calls, leadsMap, search]);

  // ── Place call modal ────────────────────────────────────────────────────────
  const openPlaceModal = useCallback(async () => {
    setShowPlace(true); setPlaceError(""); setPlacedSid("");
    try {
      const [list, numsSnap, leadsSnap] = await Promise.all([
        assistantsList().catch(() => [] as Assistant[]),
        getDocs(query(collection(db, "phone_numbers"))),
        user?.uid ? getDocs(query(collection(db, "leads"), where("ownerId", "==", user.uid), orderBy("createdAt", "desc"), limit(50))).catch(() => null) : Promise.resolve(null),
      ]);
      setAssistants(list);
      const pnums = numsSnap.docs.map((d) => ({ id: d.id, ...d.data(), phoneNumber: d.data().phoneNumber || d.id } as PhoneNumberDoc));
      setPhoneNumbers(pnums);
      if (list.length > 0) {
        const ap = pnums.find((p) => p.assistantId && list.some((a) => a.id === p.assistantId));
        const aw = list.find((a) => a.assignedPhoneNumbers?.length);
        if (ap) { setSelectedAssistantId(ap.assistantId!); setFromNumber(ap.phoneNumber); }
        else if (aw) { setSelectedAssistantId(aw.id); setFromNumber(aw.assignedPhoneNumbers![0]); }
        else { setSelectedAssistantId(list[0].id); if (pnums.length) setFromNumber(pnums[0].phoneNumber); }
      } else if (pnums.length) setFromNumber(pnums[0].phoneNumber);
      if (leadsSnap) setLeads(leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
    } catch { /* non-critical */ }
  }, [user?.uid]);

  const handlePlaceCall = useCallback(async () => {
    if (!toNumber.trim()) { setPlaceError("Destination number is required"); return; }
    const norm = (n: string) => { const t = n.trim().replace(/\s/g, ""); return t.startsWith("+") ? t : `+${t}`; };
    const ap = phoneNumbers.find((p) => p.assistantId === selectedAssistantId);
    const ast = assistants.find((a) => a.id === selectedAssistantId);
    const eff = ap?.phoneNumber || ast?.assignedPhoneNumbers?.[0] || fromNumber;
    if (!eff.trim()) { setPlaceError("From number is required"); return; }
    setPlacing(true); setPlaceError("");
    try {
      const r = await placeCall({ number: norm(toNumber), companyPhone: norm(eff), ...(selectedAssistantId ? { assistantId: selectedAssistantId } : {}) });
      setPlacedSid(r.callSid);
    } catch (e: unknown) { setPlaceError(e instanceof Error ? e.message : "Failed to place call"); }
    finally { setPlacing(false); }
  }, [toNumber, fromNumber, selectedAssistantId, phoneNumbers, assistants]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Caller Intelligence</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Call history · Caller profiles · Intent tracking</p>
        </div>
        <button
          onClick={openPlaceModal}
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />Place Call
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: PhoneCall, label: "Total Calls", value: stats.total, color: "text-neutral-700" },
          { icon: Circle, label: "Live Now", value: stats.live, color: stats.live > 0 ? "text-green-600" : "text-neutral-400" },
          { icon: UserCheck, label: "Identified", value: stats.identified, color: "text-blue-600" },
          { icon: Clock, label: "Avg Duration", value: formatDuration(stats.avgDuration), color: "text-neutral-700" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-xs text-neutral-400 font-medium">{label}</span>
            </div>
            <p className={`text-xl font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, tags, assistant, interest…"
          className="w-full pl-9 pr-4 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 text-neutral-300 animate-spin mx-auto mb-2" />
            <p className="text-sm text-neutral-400">Loading calls…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <PhoneCall className="w-8 h-8 text-neutral-200 mx-auto mb-3" />
            <p className="text-neutral-500 font-medium mb-1">{search ? "No calls match your search" : "No calls yet"}</p>
            <p className="text-neutral-400 text-sm">{search ? "Try different keywords" : "Calls will appear here once your assistant receives its first call"}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">Caller</th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">Gender</th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Intent / Tags</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />Interests</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">Assistant</th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Duration</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />When</span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-neutral-400 font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {filtered.map((call) => {
                    const lead = call.leadNumber ? leadsMap[call.leadNumber] : undefined;
                    const name = lead?.name;
                    const initials = callerInitials(name, call.leadNumber);
                    const assistantLabel = call.assistantDefinition?.name || call.assistantDefinition?.assistantName || call.assistantName || "—";
                    const interest = lead?.interest;
                    const isLive = call.status === "in-progress";

                    return (
                      <tr
                        key={call.id}
                        className="hover:bg-neutral-50/60 transition-colors group cursor-pointer"
                        onClick={() => window.location.href = `/calls/detail?id=${call.id}`}
                      >
                        {/* Caller */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              name ? "bg-[#F22F46]/10 text-[#F22F46]" : "bg-neutral-100 text-neutral-400"
                            }`}>
                              {name ? initials : <User className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              {name ? (
                                <p className="text-sm font-medium text-neutral-800 truncate">{name}</p>
                              ) : (
                                <p className="text-xs text-neutral-400 italic">Unknown caller</p>
                              )}
                              <p className="text-xs font-mono text-neutral-400">
                                {call.leadNumber ? formatPhone(call.leadNumber) : "—"}
                              </p>
                            </div>
                            {isSuperAdmin && <OwnerBadge ownerId={call.ownerId} usersMap={usersMap} />}
                          </div>
                        </td>

                        {/* Gender */}
                        <td className="px-4 py-3">
                          <GenderBadge gender={lead?.gender} />
                        </td>

                        {/* Intent / Tags */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <TagChips tags={call.tags} />
                        </td>

                        {/* Interests */}
                        <td className="px-4 py-3 max-w-[180px]">
                          {interest ? (
                            <span className="text-sm text-neutral-600 line-clamp-1" title={interest}>
                              {interest.length > 40 ? interest.slice(0, 40) + "…" : interest}
                            </span>
                          ) : (
                            <span className="text-neutral-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Assistant */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-600 truncate max-w-[120px] block">{assistantLabel}</span>
                        </td>

                        {/* Duration */}
                        <td className="px-4 py-3">
                          <span className="text-sm tabular-nums text-neutral-500">
                            {isLive ? (
                              <span className="text-green-600 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                                Live
                              </span>
                            ) : formatDuration(call.duration)}
                          </span>
                        </td>

                        {/* When */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-400" title={call.createdAt?.toDate().toLocaleString()}>
                            {timeAgo(call.createdAt)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={call.status} />
                        </td>

                        {/* Arrow */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/calls/detail?id=${call.id}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ChevronRight className="w-4 h-4 text-neutral-400" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="text-center py-4 border-t border-neutral-50">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-[#F22F46] hover:text-[#d9243b] font-medium disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                >
                  {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {loadingMore ? "Loading…" : "Load more calls"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Caller knowledge note */}
      {calls.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-blue-800">Caller Knowledge Base active — </span>
            <span className="text-blue-700">
              When a caller rings back, their name, gender, interests, and call history are automatically injected into the assistant&apos;s context so every repeat call feels personal.
            </span>
          </div>
        </div>
      )}

      {/* Place Call Modal */}
      {showPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PhoneOutgoing className="w-5 h-5 text-[#F22F46]" />
                <h3 className="text-base font-semibold text-neutral-900">Place Outbound Call</h3>
              </div>
              <button onClick={() => { setShowPlace(false); setToNumber(""); setFromNumber(""); setPlaceError(""); setPlacedSid(""); }} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            </div>

            {placedSid ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <PhoneOutgoing className="w-6 h-6 text-green-600" />
                </div>
                <p className="font-semibold text-neutral-800 mb-1">Call initiated!</p>
                <p className="text-sm text-neutral-500 mb-1">SID: <span className="font-mono text-xs">{placedSid}</span></p>
                <button onClick={() => { setShowPlace(false); setPlacedSid(""); }} className="mt-4 text-sm text-[#0066CC] hover:underline">Close</button>
              </div>
            ) : (
              <>
                {placeError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {placeError}
                    {(placeError.toLowerCase().includes("credit") || placeError.toLowerCase().includes("upgrade")) && (
                      <a href="/billing" className="block mt-1 text-xs font-medium text-[#F22F46] hover:underline">Upgrade to Pro →</a>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {leads.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide"><Users className="w-3 h-3 inline mr-1" />Select Lead</label>
                      <select value="" onChange={(e) => { const l = leads.find((x) => x.id === e.target.value); if (l?.phone) setToNumber(l.phone); }}
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]">
                        <option value="">— Choose from saved leads —</option>
                        {leads.map((l) => <option key={l.id} value={l.id}>{l.name || "No name"} — {l.phone || "No phone"}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">To (Lead Number) *</label>
                    <input autoFocus value={toNumber} onChange={(e) => setToNumber(e.target.value)} placeholder="+972501234567"
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]" />
                  </div>
                  {assistants.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Assistant</label>
                      <select value={selectedAssistantId} onChange={(e) => {
                        const aid = e.target.value; setSelectedAssistantId(aid);
                        const ap2 = phoneNumbers.find((p) => p.assistantId === aid);
                        const ast2 = assistants.find((a) => a.id === aid);
                        if (ap2) setFromNumber(ap2.phoneNumber);
                        else if (ast2?.assignedPhoneNumbers?.[0]) setFromNumber(ast2.assignedPhoneNumbers[0]);
                      }} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]">
                        {assistants.map((a) => <option key={a.id} value={a.id}>{a.name || a.assistantName}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">From (Twilio Number) *</label>
                    {(() => {
                      const ap2 = phoneNumbers.find((p) => p.assistantId === selectedAssistantId);
                      const ast2 = assistants.find((a) => a.id === selectedAssistantId);
                      const eff = ap2?.phoneNumber || ast2?.assignedPhoneNumbers?.[0] || null;
                      if (eff) return <div className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 text-sm font-mono text-green-800">{eff} <span className="text-xs text-green-600 font-sans">(assigned)</span></div>;
                      return phoneNumbers.length > 0
                        ? <select value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]">
                            {phoneNumbers.map((n) => <option key={n.id} value={n.phoneNumber}>{n.phoneNumber}</option>)}
                          </select>
                        : <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+12125551234" className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]" />;
                    })()}
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={handlePlaceCall} disabled={placing}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                    {placing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {placing ? "Calling…" : "Place Call"}
                  </button>
                  <button onClick={() => { setShowPlace(false); setToNumber(""); setFromNumber(""); setPlaceError(""); }}
                    className="px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallsPage() {
  return <FeatureGate featureId="module.calls"><CallsPageInner /></FeatureGate>;
}
