"use client";

import { useEffect, useState } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { releasePhoneNumber, listPhoneNumbers, configurePhoneNumber, assistantsList, type Assistant } from "@/lib/firebase-functions";
import Link from "next/link";
import { Phone, Plus, Trash2, RefreshCw, Loader2, Settings, X, Check } from "lucide-react";

interface PhoneNumberDoc {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  assistantId?: string;
  assistantName?: string;
  country?: string;
  sid?: string;
}

/** Detect country from phone number E.164 prefix when Twilio returns wrong data */
function detectCountry(phoneNumber: string, twilioCountry: string): string {
  if (phoneNumber.startsWith("+972")) return "IL";
  if (phoneNumber.startsWith("+44"))  return "GB";
  if (phoneNumber.startsWith("+49"))  return "DE";
  if (phoneNumber.startsWith("+33"))  return "FR";
  if (phoneNumber.startsWith("+61"))  return "AU";
  if (phoneNumber.startsWith("+55"))  return "BR";
  if (phoneNumber.startsWith("+91"))  return "IN";
  if (phoneNumber.startsWith("+1"))   return "US";
  return twilioCountry || "US";
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  // Configure assistant modal
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [configuring, setConfiguring] = useState<PhoneNumberDoc | null>(null);
  const [configAssistantId, setConfigAssistantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "phone_numbers"));
    const unsub = onSnapshot(q, (snap) => {
      setNumbers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PhoneNumberDoc)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const twilioNumbers = await listPhoneNumbers();
      await Promise.all(
        twilioNumbers.map((n) =>
          setDoc(doc(db, "phone_numbers", n.phoneNumber), {
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName || "",
            country: detectCountry(n.phoneNumber, n.country || "US"),
            sid: n.sid,
          }, { merge: true })
        )
      );
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleRelease = async (n: PhoneNumberDoc) => {
    if (!confirm(`Release ${n.phoneNumber}? This cannot be undone.`)) return;
    try {
      if (n.sid) await releasePhoneNumber({ phoneNumber: n.phoneNumber, sid: n.sid });
      await deleteDoc(doc(db, "phone_numbers", n.phoneNumber));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to release number");
    }
  };

  const openConfigure = async (n: PhoneNumberDoc) => {
    setConfiguring(n);
    setConfigAssistantId(n.assistantId || "");
    setSaveError("");
    if (assistants.length === 0) {
      try {
        const list = await assistantsList();
        setAssistants(Array.isArray(list) ? list : []);
      } catch {
        setAssistants([]);
      }
    }
  };

  const handleSaveConfigure = async () => {
    if (!configuring) return;
    setSaving(true);
    setSaveError("");
    try {
      await configurePhoneNumber({ phoneNumber: configuring.phoneNumber, assistantId: configAssistantId });
      const assistant = assistants.find((a) => a.id === configAssistantId);
      await setDoc(doc(db, "phone_numbers", configuring.phoneNumber), {
        assistantId: configAssistantId || "",
        assistantName: configAssistantId
          ? (assistant?.name || assistant?.assistantName || "")
          : "",
      }, { merge: true });
      setConfiguring(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Phone Numbers</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage your Twilio phone numbers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-600 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync from Twilio
          </button>
          <Link
            href="/phone-numbers/buy"
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buy Number
          </Link>
        </div>
      </div>

      {syncError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{syncError}</div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>
        ) : numbers.length === 0 ? (
          <div className="p-12 text-center">
            <Phone className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
            <p className="text-neutral-400 text-sm mb-3">No phone numbers yet</p>
            <p className="text-neutral-400 text-xs mb-4">
              If you already have Twilio numbers, click <strong>Sync from Twilio</strong> to import them.
            </p>
            <Link
              href="/phone-numbers/buy"
              className="inline-flex items-center gap-1.5 mt-1 text-[#0066CC] hover:underline text-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Buy your first number
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Number</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Friendly Name</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Assigned Assistant</th>
                <th className="px-5 py-3 text-left text-xs text-neutral-400 font-medium uppercase tracking-wide">Country</th>
                <th className="px-5 py-3 w-20 text-right text-xs text-neutral-400 font-medium uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {numbers.map((n) => (
                <tr key={n.id} className="hover:bg-neutral-50/50 transition-colors group">
                  <td className="px-5 py-3 text-sm font-mono text-neutral-800">{n.phoneNumber}</td>
                  <td className="px-5 py-3 text-sm text-neutral-600">{n.friendlyName || "—"}</td>
                  <td className="px-5 py-3 text-sm text-neutral-500">
                    {n.assistantName ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        {n.assistantName}
                      </span>
                    ) : (
                      <span className="text-neutral-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">{n.country || "US"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openConfigure(n)}
                        title="Assign assistant"
                        className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRelease(n)}
                        title="Release number"
                        className="w-7 h-7 flex items-center justify-center text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Configure Assistant Modal */}
      {configuring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Configure Number</h3>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">{configuring.phoneNumber}</p>
              </div>
              <button onClick={() => setConfiguring(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{saveError}</div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Assign Assistant</label>
              {assistants.length === 0 ? (
                <p className="text-sm text-neutral-400 py-2">No assistants found. <Link href="/assistants/new" className="text-[#0066CC] hover:underline">Create one first.</Link></p>
              ) : (
                <select
                  value={configAssistantId}
                  onChange={(e) => setConfigAssistantId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                >
                  <option value="">— Unassigned —</option>
                  {assistants.map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.assistantName}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveConfigure}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setConfiguring(null)}
                className="px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
