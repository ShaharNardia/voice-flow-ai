"use client";

import { useEffect, useState, useCallback } from "react";
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { formatDate, formatPhone, truncate } from "@/lib/utils";
import Link from "next/link";
import { PhoneCall, Circle, ChevronRight, Plus, X, Loader2, PhoneOutgoing, Users } from "lucide-react";
import { placeCall, assistantsList, type Assistant } from "@/lib/firebase-functions";

interface PhoneNumberDoc {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  assistantId?: string;
  assistantName?: string;
}

interface LeadDoc {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
}

interface CallSession {
  id: string;
  leadNumber?: string;
  status: string;
  createdAt?: Timestamp;
  assistantDefinition?: { name?: string; language?: string };
  conversationHistory?: Array<{ role: string; content: string }>;
  lastAIResponse?: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    "in-progress": { bg: "bg-green-50", text: "text-green-700" },
    "completed": { bg: "bg-neutral-100", text: "text-neutral-600" },
    "failed": { bg: "bg-red-50", text: "text-red-700" },
    "initiated": { bg: "bg-blue-50", text: "text-blue-700" },
  };
  const s = map[status] || { bg: "bg-neutral-100", text: "text-neutral-500" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Circle className={`w-1.5 h-1.5 fill-current ${status === "in-progress" ? "pulse-dot" : ""}`} />
      {status === "in-progress" ? "Live" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function CallsPage() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Place call modal
  const [showPlace, setShowPlace] = useState(false);
  const [toNumber, setToNumber] = useState("");
  const [leads, setLeads] = useState<LeadDoc[]>([]);
  const [fromNumber, setFromNumber] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberDoc[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [placedSid, setPlacedSid] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "call_sessions"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCalls(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const openPlaceModal = useCallback(async () => {
    setShowPlace(true);
    setPlaceError("");
    setPlacedSid("");
    try {
      const uid = user?.uid;
      const [list, numsSnap, leadsSnap] = await Promise.all([
        assistantsList().catch(() => [] as Assistant[]),
        getDocs(query(collection(db, "phone_numbers"))),
        uid ? getDocs(query(collection(db, "leads"), where("ownerId", "==", uid), orderBy("createdAt", "desc"), limit(50))).catch(() => null) : Promise.resolve(null),
      ]);
      setAssistants(list);
      const pnums = numsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PhoneNumberDoc));
      setPhoneNumbers(pnums);
      if (list.length > 0) {
        setSelectedAssistantId(list[0].id);
        // Auto-select assigned phone for the first assistant
        const assigned = pnums.find((p) => p.assistantId === list[0].id);
        if (assigned) setFromNumber(assigned.phoneNumber);
        else if (pnums.length > 0 && !fromNumber) setFromNumber(pnums[0].phoneNumber);
      } else if (pnums.length > 0 && !fromNumber) {
        setFromNumber(pnums[0].phoneNumber);
      }
      if (leadsSnap) {
        setLeads(leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadDoc)));
      }
    } catch {
      // non-critical — user can still type manually
    }
  }, [fromNumber, user]);

  /** Ensure phone number has + prefix (E.164 format) */
  const normalizePhone = (n: string) => {
    const t = n.trim().replace(/\s/g, "");
    return t.startsWith("+") ? t : `+${t}`;
  };

  const handlePlaceCall = useCallback(async () => {
    if (!toNumber.trim()) { setPlaceError("Destination number is required"); return; }
    if (!fromNumber.trim()) { setPlaceError("From number is required"); return; }
    setPlacing(true);
    setPlaceError("");
    try {
      const result = await placeCall({
        number: normalizePhone(toNumber),
        companyPhone: normalizePhone(fromNumber),
        ...(selectedAssistantId ? { assistantId: selectedAssistantId } : {}),
      });
      setPlacedSid(result.callSid);
    } catch (e: unknown) {
      setPlaceError(e instanceof Error ? e.message : "Failed to place call");
    } finally {
      setPlacing(false);
    }
  }, [toNumber, fromNumber, selectedAssistantId]);

  const closePlaceModal = useCallback(() => {
    setShowPlace(false);
    setToNumber("");
    setFromNumber("");
    setPlaceError("");
    setPlacedSid("");
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Calls</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Real-time and historical call log</p>
        </div>
        <button
          onClick={openPlaceModal}
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Place Call
        </button>
      </div>

      {/* Place Call Modal */}
      {showPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PhoneOutgoing className="w-5 h-5 text-[#F22F46]" />
                <h3 className="text-base font-semibold text-neutral-900">Place Outbound Call</h3>
              </div>
              <button onClick={closePlaceModal} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {placedSid ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <PhoneOutgoing className="w-6 h-6 text-green-600" />
                </div>
                <p className="font-semibold text-neutral-800 mb-1">Call initiated!</p>
                <p className="text-sm text-neutral-500 mb-1">SID: <span className="font-mono text-xs">{placedSid}</span></p>
                <button onClick={closePlaceModal} className="mt-4 text-sm text-[#0066CC] hover:underline">Close</button>
              </div>
            ) : (
              <>
                {placeError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    <p className="text-red-600">{placeError}</p>
                    {(placeError.toLowerCase().includes("credit") || placeError.toLowerCase().includes("upgrade")) && (
                      <a href="/billing" className="inline-block mt-2 text-xs font-medium text-[#F22F46] hover:underline">
                        Upgrade to Pro &rarr;
                      </a>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {leads.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                        <Users className="w-3 h-3 inline mr-1" />Select Lead
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          const lead = leads.find((l) => l.id === e.target.value);
                          if (lead?.phone) setToNumber(lead.phone);
                        }}
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                      >
                        <option value="">— Choose from saved leads —</option>
                        {leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name || "No name"} — {l.phone || "No phone"}{l.company ? ` (${l.company})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">To (Lead Number) *</label>
                    <input
                      autoFocus
                      value={toNumber}
                      onChange={(e) => setToNumber(e.target.value)}
                      placeholder="+972501234567"
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                    />
                  </div>
                  {assistants.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Assistant</label>
                      <select
                        value={selectedAssistantId}
                        onChange={(e) => {
                          const aid = e.target.value;
                          setSelectedAssistantId(aid);
                          // Auto-select assigned phone number for this assistant
                          const assigned = phoneNumbers.find((p) => p.assistantId === aid);
                          if (assigned) setFromNumber(assigned.phoneNumber);
                        }}
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                      >
                        {assistants.map((a) => (
                          <option key={a.id} value={a.id}>{a.name || a.assistantName}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">From (Twilio Number) *</label>
                    {(() => {
                      const assignedPhone = phoneNumbers.find((p) => p.assistantId === selectedAssistantId);
                      if (assignedPhone) {
                        return (
                          <div className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 text-sm font-mono text-green-800">
                            {assignedPhone.phoneNumber} <span className="text-xs text-green-600 font-sans">(assigned to this assistant)</span>
                          </div>
                        );
                      }
                      return phoneNumbers.length > 0 ? (
                        <select
                          value={fromNumber}
                          onChange={(e) => setFromNumber(e.target.value)}
                          className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                        >
                          {phoneNumbers.map((n) => (
                            <option key={n.id} value={n.phoneNumber}>{n.phoneNumber}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={fromNumber}
                          onChange={(e) => setFromNumber(e.target.value)}
                          placeholder="+12125551234"
                          className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                        />
                      );
                    })()}
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={handlePlaceCall}
                    disabled={placing}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                  >
                    {placing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {placing ? "Calling..." : "Place Call"}
                  </button>
                  <button
                    onClick={closePlaceModal}
                    className="px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-400 text-sm">Loading calls...</div>
        ) : calls.length === 0 ? (
          <div className="p-12 text-center">
            <PhoneCall className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
            <p className="text-neutral-400 text-sm">No calls yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Caller</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Assistant</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Turns</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Last Response</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Time</th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {calls.map((call) => {
                const turns = Math.floor((call.conversationHistory?.length || 0) / 2);
                return (
                  <tr key={call.id} className="hover:bg-neutral-50/50 transition-colors group cursor-pointer" onClick={() => window.location.href = `/calls/detail?id=${call.id}`}>
                    <td className="px-5 py-3 text-sm font-mono text-neutral-700">
                      {call.leadNumber ? formatPhone(call.leadNumber) : "Unknown"}
                    </td>
                    <td className="px-5 py-3 text-sm text-neutral-600">
                      {call.assistantDefinition?.name || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={call.status} />
                    </td>
                    <td className="px-5 py-3 text-sm text-neutral-500">{turns}</td>
                    <td className="px-5 py-3 text-sm text-neutral-400 max-w-[200px]">
                      {call.lastAIResponse ? truncate(call.lastAIResponse, 40) : "—"}
                    </td>
                    <td className="px-5 py-3 text-sm text-neutral-400">
                      {call.createdAt ? formatDate(call.createdAt.toDate()) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/calls/detail?id=${call.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="w-4 h-4 text-neutral-400" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
