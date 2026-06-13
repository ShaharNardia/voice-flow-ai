"use client";

import { useEffect, useState } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { releasePhoneNumber, listPhoneNumbers, configurePhoneNumber, assistantsList, type Assistant } from "@/lib/firebase-functions";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Phone, Plus, Trash2, RefreshCw, Loader2, Settings, X, Check, Server, PencilLine } from "lucide-react";

interface PhoneNumberDoc {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  assistantId?: string;
  assistantName?: string;
  country?: string;
  sid?: string;
  provider?: "twilio" | "sip" | "voximplant";
}

/** Provider badge — keep in sync with the assistant editor's carrier colors. */
function ProviderBadge({ provider }: { provider?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sip:        { label: "SIP",        cls: "bg-teal-50 text-teal-700" },
    voximplant: { label: "Voximplant", cls: "bg-orange-50 text-orange-700" },
    twilio:     { label: "Twilio",     cls: "bg-red-50 text-red-700" },
  };
  const { label, cls } = map[provider || "twilio"] || map.twilio;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>{label}</span>
  );
}

/** Detect country from phone number E.164 prefix when Twilio returns wrong data */
function detectCountry(phoneNumber: string, twilioCountry: string): string {
  if (!phoneNumber) return twilioCountry || "US";
  if (phoneNumber.startsWith("+972")) return "IL";
  if (phoneNumber.startsWith("+971")) return "AE";
  if (phoneNumber.startsWith("+357")) return "CY";
  if (phoneNumber.startsWith("+30"))  return "GR";
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
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const [numbers, setNumbers] = useState<PhoneNumberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  // Manual add modal (admin only) — for registering a SIP DID or any number
  // that didn't come from a Twilio sync.
  const [showAdd, setShowAdd] = useState(false);
  const [addNumber, setAddNumber] = useState("");
  const [addName, setAddName] = useState("");
  const [addProvider, setAddProvider] = useState<"sip" | "twilio" | "voximplant">("sip");
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Configure assistant modal
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [configuring, setConfiguring] = useState<PhoneNumberDoc | null>(null);
  const [configAssistantId, setConfigAssistantId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "phone_numbers"));
    const unsub = onSnapshot(q, (snap) => {
      setNumbers(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, phoneNumber: data.phoneNumber || d.id } as PhoneNumberDoc;
      }));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  // Auto-sync from Twilio on page load so newly provisioned numbers appear immediately
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleSync(); }, []);

  // Load assistants for name resolution
  useEffect(() => {
    assistantsList().then(setAssistants).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      const allNumbers = await listPhoneNumbers();
      await Promise.all(
        allNumbers.map((n) => {
          const provider = (n as { provider?: string }).provider || "twilio";
          const nlpId    = (n as { id?: string }).id;
          return setDoc(doc(db, "phone_numbers", n.phoneNumber), {
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName || "",
            country: detectCountry(n.phoneNumber, n.country || "US"),
            sid: n.sid || null,
            provider,
            // NLPearl provisioning removed — only Twilio + SIP supported now.
          }, { merge: true });
        })
      );
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddManual = async () => {
    setAddError("");
    // Normalize to E.164: keep leading +, strip spaces/dashes/parens.
    const raw = addNumber.trim();
    const normalized = raw.startsWith("+")
      ? "+" + raw.slice(1).replace(/\D/g, "")
      : raw.replace(/\D/g, "");
    if (!/^\+?\d{6,15}$/.test(normalized)) {
      setAddError("Enter a valid number in E.164 format, e.g. +972747054946");
      return;
    }
    const e164 = normalized.startsWith("+") ? normalized : `+${normalized}`;
    if (numbers.some((n) => n.phoneNumber === e164)) {
      setAddError("That number already exists in the list.");
      return;
    }
    setAddSaving(true);
    try {
      await setDoc(doc(db, "phone_numbers", e164), {
        phoneNumber: e164,
        friendlyName: addName.trim(),
        country: detectCountry(e164, "US"),
        provider: addProvider,
        sid: null,
        manualEntry: true,
      }, { merge: true });
      setShowAdd(false);
      setAddNumber("");
      setAddName("");
      setAddProvider("sip");
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to add number");
    } finally {
      setAddSaving(false);
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
      // Configure Twilio webhooks (best-effort — may fail if per-company creds not available)
      try {
        await configurePhoneNumber({ phoneNumber: configuring.phoneNumber, assistantId: configAssistantId });
      } catch (twilioErr) {
        // Twilio webhook config is only needed on first setup; if it fails,
        // the number likely already has correct webhooks from purchase/sync.
        console.warn("Twilio webhook config skipped:", twilioErr);
      }
      // Save assistant assignment to phone_numbers collection (used by outbound/UI)
      const assistant = assistants.find((a) => a.id === configAssistantId);
      await setDoc(doc(db, "phone_numbers", configuring.phoneNumber), {
        assistantId: configAssistantId || "",
        assistantName: configAssistantId
          ? (assistant?.name || assistant?.assistantName || "")
          : "",
      }, { merge: true });

      // Also update ALL Company phoneNumberMap entries for this number (used by inbound calls)
      // This ensures inbound calls route to the correct assistant
      try {
        const companiesSnap = await getDocs(query(collection(db, "Company")));
        for (const companyDoc of companiesSnap.docs) {
          const data = companyDoc.data();
          const phoneMap: Array<{ phoneNumber?: string; assistantId?: string; [key: string]: unknown }> = data.phoneNumberMap || [];
          const idx = phoneMap.findIndex((e: { phoneNumber?: string }) =>
            e.phoneNumber && (e.phoneNumber === configuring.phoneNumber || e.phoneNumber.replace(/\D/g, "") === configuring.phoneNumber.replace(/\D/g, ""))
          );
          if (idx >= 0) {
            // Update the assistantId in the matching entry
            const updated = [...phoneMap];
            updated[idx] = { ...updated[idx], assistantId: configAssistantId || "" };
            await setDoc(doc(db, "Company", companyDoc.id), { phoneNumberMap: updated }, { merge: true });
          }
        }
      } catch (companyErr) {
        console.warn("Company phoneNumberMap sync skipped:", companyErr);
        // Non-critical — don't fail the whole operation
      }

      setConfiguring(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Phone Numbers</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage PSTN numbers and SIP trunks</p>
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
          {isAdmin && (
            <button
              onClick={() => { setAddError(""); setShowAdd(true); }}
              title="Manually register a number (e.g. a SIP DID)"
              className="flex items-center gap-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <PencilLine className="w-4 h-4" />
              Add Manually
            </button>
          )}
          <Link
            href="/phone-numbers/buy"
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buy Number
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 mb-6">
        <Link
          href="/phone-numbers"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors border-[#F22F46] text-[#F22F46]"
        >
          <Phone className="w-4 h-4" />
          PSTN Numbers
        </Link>
        <Link
          href="/phone-numbers/sip"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
        >
          <Server className="w-4 h-4" />
          SIP Trunks
        </Link>
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
                  <td className="px-5 py-3 text-sm font-mono text-neutral-800">
                    <div className="flex items-center gap-2">
                      <span>{n.phoneNumber}</span>
                      <ProviderBadge provider={n.provider} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-600">{n.friendlyName || "—"}</td>
                  <td className="px-5 py-3 text-sm text-neutral-500">
                    {(() => {
                      const name = n.assistantName || (n.assistantId ? assistants.find((a) => a.id === n.assistantId)?.name : null);
                      return name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          {name}
                        </span>
                      ) : n.assistantId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                          {n.assistantId.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-neutral-400">Not assigned</span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">{detectCountry(n.phoneNumber, n.country || "US")}</td>
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

      {/* Manual Add Modal (admin only) */}
      {showAdd && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Add Number Manually</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Register a SIP DID or any number not synced from Twilio.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{addError}</div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Phone Number (E.164)</label>
              <input
                value={addNumber}
                onChange={(e) => setAddNumber(e.target.value)}
                placeholder="+972747054946"
                autoFocus
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Friendly Name (optional)</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Jerusalem main line"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Provider</label>
              <div className="flex gap-2">
                {([
                  { id: "sip",        label: "SIP Trunk",  on: "border-teal-400 bg-teal-50 text-teal-700" },
                  { id: "voximplant", label: "Voximplant", on: "border-orange-400 bg-orange-50 text-orange-700" },
                  { id: "twilio",     label: "Twilio",     on: "border-red-400 bg-red-50 text-red-700" },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAddProvider(p.id)}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      addProvider === p.id ? p.on : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddManual}
                disabled={addSaving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {addSaving ? "Adding..." : "Add Number"}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-3">After adding, click the ⚙ to assign an assistant.</p>
          </div>
        </div>
      )}

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
