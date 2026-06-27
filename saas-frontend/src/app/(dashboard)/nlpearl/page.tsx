"use client";

import React, { useEffect, useState } from "react";
import { Upload, Trash2, Search, RefreshCw, Plus, ShieldOff, Edit3, Eraser, X, Users, FileSearch, AlertTriangle } from "lucide-react";

const FN = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

// NLPearl lead status code → label/colour
const LEAD_STATUS: Record<number, { label: string; cls: string }> = {
  1:   { label: "New",              cls: "bg-neutral-100 text-neutral-700" },
  10:  { label: "Need Retry",       cls: "bg-amber-100 text-amber-700" },
  20:  { label: "In Queue",         cls: "bg-blue-100 text-blue-700" },
  30:  { label: "Wrong Country",    cls: "bg-rose-100 text-rose-700" },
  40:  { label: "On Call",          cls: "bg-emerald-100 text-emerald-700" },
  70:  { label: "Voicemail Left",   cls: "bg-indigo-100 text-indigo-700" },
  100: { label: "Success",          cls: "bg-green-100 text-green-700" },
  110: { label: "Not Successful",   cls: "bg-red-100 text-red-700" },
  130: { label: "Completed",        cls: "bg-emerald-50 text-emerald-700" },
  150: { label: "Unreachable",      cls: "bg-stone-100 text-stone-700" },
  220: { label: "Blacklisted",      cls: "bg-zinc-200 text-zinc-700" },
  300: { label: "Queue Abandoned",  cls: "bg-orange-100 text-orange-700" },
  500: { label: "Error",            cls: "bg-red-200 text-red-800" },
};

interface Pearl { id: string; name: string; type?: number; }
interface Lead {
  id?: string;
  externalId?: string;
  phoneNumber?: string;
  status?: number;
  created?: string;
  timeZone?: string;
}
interface BlacklistEntry { id?: string; phoneNumber?: string; created?: string; }
interface SearchResult<T> { items?: T[]; total?: number; results?: T[]; data?: T[]; }

export default function NLPearlPage() {
  const [tab, setTab] = useState<"leads" | "blacklist" | "settings" | "compliance">("leads");
  const [pearls, setPearls] = useState<Pearl[]>([]);
  const [pearlId, setPearlId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming]   = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPearls = React.useCallback((preferId?: string) => {
    fetch(`${FN}/nlpearlListPearls`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setPearls(list);
        if (preferId && list.find((p: Pearl) => p.id === preferId)) setPearlId(preferId);
        else if (list.length > 0 && !pearlId) setPearlId(list[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadPearls(); }, [loadPearls]);

  const selectedPearl = pearls.find((p) => p.id === pearlId);

  const handleRename = async () => {
    if (!pearlId || !renameValue.trim()) { setRenaming(false); return; }
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlUpdatePearl`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, name: renameValue.trim()}),
      });
      if (r.ok) { setRenaming(false); loadPearls(pearlId); }
    } finally { setBusy(false); }
  };

  const handleResetMemory = async () => {
    if (!pearlId) return;
    if (!confirm("Reset memory for ALL callers on this Pearl? This forgets all conversation context.")) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlResetMemory`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId}),
      });
      if (r.ok) alert("Memory reset for all callers."); else alert("Reset failed: " + (await r.text()));
    } finally { setBusy(false); }
  };

  return (
    <div>
      {createOpen && <CreatePearlModal onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); loadPearls(id); }} />}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">NLPearl Management</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Pearls, outbound leads and global blacklist</p>
        </div>
        <div className="flex items-center gap-2">
          {renaming && selectedPearl ? (
            <>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
                autoFocus
                className="text-sm border border-emerald-300 rounded-lg px-3 py-2 bg-white w-48"
              />
              <button onClick={handleRename} disabled={busy} className="text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">Save</button>
              <button onClick={() => setRenaming(false)} className="text-xs px-2 py-2 text-neutral-500 hover:text-neutral-700">Cancel</button>
            </>
          ) : (
            <>
              <select
                value={pearlId}
                onChange={(e) => setPearlId(e.target.value)}
                className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">— Select Pearl —</option>
                {pearls.map((p) => <option key={p.id} value={p.id}>{p.name} {p.type === 1 ? "(in)" : p.type === 2 ? "(out)" : ""}</option>)}
              </select>
              {selectedPearl && (
                <>
                  <button
                    onClick={() => { setRenameValue(selectedPearl.name); setRenaming(true); }}
                    title="Rename Pearl"
                    className="w-9 h-9 inline-flex items-center justify-center text-neutral-500 hover:text-emerald-700 hover:bg-emerald-50 border border-neutral-200 rounded-lg"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleResetMemory}
                    title="Reset memory for all callers"
                    disabled={busy}
                    className="w-9 h-9 inline-flex items-center justify-center text-neutral-500 hover:text-amber-700 hover:bg-amber-50 border border-neutral-200 rounded-lg disabled:opacity-50"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                <Plus className="w-3.5 h-3.5" /> New Pearl
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-neutral-200">
        <button
          onClick={() => setTab("leads")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "leads" ? "border-emerald-500 text-emerald-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Leads
        </button>
        <button
          onClick={() => setTab("blacklist")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "blacklist" ? "border-emerald-500 text-emerald-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Blacklist
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "settings" ? "border-emerald-500 text-emerald-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Pearl Settings
        </button>
        <button
          onClick={() => setTab("compliance")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "compliance" ? "border-emerald-500 text-emerald-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Compliance
        </button>
      </div>

      {tab === "leads" && (
        <LeadsTab pearlId={pearlId} />
      )}
      {tab === "blacklist" && (
        <BlacklistTab />
      )}
      {tab === "settings" && (
        <PearlSettingsTab pearlId={pearlId} pearl={selectedPearl} />
      )}
      {tab === "compliance" && (
        <ComplianceTab />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function CreatePearlModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"inbound" | "outbound">("inbound");
  const [phones, setPhones] = useState<Array<{id: string; number: string; pearlId?: string | null}>>([]);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${FN}/nlpearlListPhones`).then((r) => r.json()).then((d) => setPhones(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr("Name is required"); return; }
    setCreating(true);
    try {
      const r = await fetch(`${FN}/nlpearlCreatePearl`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: name.trim(), kind, phoneNumberId: phoneNumberId || undefined}),
      });
      const d = await r.json();
      if (r.ok && d.result?.status === 200) {
        // After creation we need to look up the new Pearl's ID.  The API
        // doesn't always return it directly, so we trigger a list reload.
        const created = d.result?.body;
        onCreated(created?.id || created?.pearlId || "");
      } else {
        setErr(JSON.stringify(d.result?.body || d, null, 2));
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-neutral-900">Create a new Pearl</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Outreach"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("inbound")}
                className={`p-2 rounded-lg border-2 text-sm ${kind === "inbound" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-600"}`}
              >
                📥 Inbound
              </button>
              <button
                type="button"
                onClick={() => setKind("outbound")}
                className={`p-2 rounded-lg border-2 text-sm ${kind === "outbound" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-600"}`}
              >
                📤 Outbound
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Phone Number (optional)</label>
            <select
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— None (attach later) —</option>
              {phones.filter((p) => !p.pearlId).map((p) => (
                <option key={p.id} value={p.id}>{p.number}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 mt-1">Only unassigned phone numbers are shown.</p>
          </div>
          {err && <pre className="text-xs text-red-600 bg-red-50 rounded p-2 whitespace-pre-wrap">{err}</pre>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancel</button>
          <button
            onClick={submit}
            disabled={creating || !name.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> {creating ? "Creating…" : "Create Pearl"}
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 mt-3">After creation, configure the Pearl&apos;s system prompt, voice, and KB at <a href="https://platform.nlpearl.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">platform.nlpearl.ai</a>.</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function PearlSettingsTab({ pearlId, pearl }: { pearlId: string; pearl: Pearl | undefined }) {
  const [phones, setPhones] = useState<Array<{id: string; number: string}>>([]);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [transcriptOptions, setTranscriptOptions] = useState(1);
  const [recordingTrack, setRecordingTrack] = useState(3);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${FN}/nlpearlListPhones`).then((r) => r.json()).then((d) => setPhones(Array.isArray(d) ? d : []));
  }, []);

  if (!pearlId || !pearl) {
    return <div className="text-center text-sm text-neutral-500 py-12">Select a Pearl above to manage its settings.</div>;
  }

  const isOutbound = pearl.type === 2;

  const saveOutbound = async () => {
    setSaving(true); setMsg("");
    try {
      const settings: Record<string, unknown> = {
        totalAgents: 1,
        transcriptOptions,
        recordingTrack,
      };
      if (phoneNumberId) settings.phoneNumberId = phoneNumberId;
      const r = await fetch(`${FN}/nlpearlUpdateOutboundSettings`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, settings}),
      });
      setMsg(r.ok ? "Settings saved." : `Failed: ${await r.text()}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-xl">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-neutral-800">{pearl.name}</h3>
        <p className="text-xs text-neutral-500">
          {isOutbound ? "Outbound Pearl" : "Inbound Pearl"} · ID: <span className="font-mono">{pearl.id}</span>
        </p>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        System prompt, voice, knowledge base, and flow are configured in the NLPearl dashboard at{" "}
        <a href={`https://platform.nlpearl.ai`} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">platform.nlpearl.ai</a>.
      </p>

      {isOutbound ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Outbound caller-ID phone number</label>
            <select
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Keep current —</option>
              {phones.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Transcript option</label>
            <select
              value={transcriptOptions}
              onChange={(e) => setTranscriptOptions(Number(e.target.value))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value={1}>Full Transcript</option>
              <option value={2}>Sensitive Info Removed</option>
              <option value={3}>No Transcript</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Recording track</label>
            <select
              value={recordingTrack}
              onChange={(e) => setRecordingTrack(Number(e.target.value))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value={1}>Agent side only</option>
              <option value={2}>Customer side only</option>
              <option value={3}>Both sides</option>
              <option value={4}>None (no recording)</option>
            </select>
          </div>
          <button
            onClick={saveOutbound}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save outbound settings"}
          </button>
          {msg && <p className={`text-xs ${msg.startsWith("Settings") ? "text-emerald-700" : "text-red-600"} mt-1`}>{msg}</p>}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Inbound settings are managed via the Assistant editor (Voice tab → NLPearl section).</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function LeadsTab({ pearlId }: { pearlId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<number | "">("");
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  // Lookup state
  const [lookupKind, setLookupKind] = useState<"phone" | "external">("phone");
  const [lookupVal, setLookupVal] = useState("");
  const [lookupResult, setLookupResult] = useState<Lead | string | null>(null);
  // Delete by external IDs
  const [delExtText, setDelExtText] = useState("");

  // CSV upload
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [csvLeads, setCsvLeads] = useState<Array<{phoneNumber: string; name?: string; callData?: Record<string, string>}>>([]);
  const [csvError, setCsvError] = useState("");

  // Single-add inputs
  const [singlePhone, setSinglePhone] = useState("");
  const [singleName, setSingleName] = useState("");

  const load = React.useCallback(async () => {
    if (!pearlId) { setLeads([]); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        pearlId,
        limit: 100,
        sortProp: "created",
        isAscending: false,
        searchInput: searchInput || undefined,
      };
      if (statusFilter !== "") body.statuses = [Number(statusFilter)];
      const r = await fetch(`${FN}/nlpearlSearchLeads`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
      const d: SearchResult<Lead> & { totalCount?: number } = await r.json();
      const items = d.items || d.results || d.data || [];
      setLeads(items);
      setTotal(d.total ?? d.totalCount ?? items.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pearlId, searchInput, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const parseCsv = (text: string) => {
    setCsvError("");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) { setCsvError("Empty file"); return; }
    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const phoneIdx = header.findIndex((h) => /phone|number/.test(h));
    if (phoneIdx === -1) { setCsvError("No 'phone' or 'number' column found"); return; }
    const nameIdx  = header.findIndex((h) => /^name$/.test(h));
    const out: Array<{phoneNumber: string; name?: string; callData?: Record<string, string>}> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((s) => s.trim());
      const phone = cols[phoneIdx];
      if (!phone) continue;
      const callData: Record<string, string> = {};
      header.forEach((h, idx) => {
        if (idx !== phoneIdx && idx !== nameIdx && cols[idx]) callData[h] = cols[idx];
      });
      out.push({
        phoneNumber: phone,
        ...(nameIdx >= 0 && cols[nameIdx] ? {name: cols[nameIdx]} : {}),
        ...(Object.keys(callData).length > 0 ? {callData} : {}),
      });
    }
    setCsvLeads(out);
  };

  const uploadCsv = async () => {
    if (!pearlId || csvLeads.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlAddLeads`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, leads: csvLeads}),
      });
      if (r.ok) {
        setCsvLeads([]);
        if (fileRef.current) fileRef.current.value = "";
        await load();
      } else {
        const d = await r.json().catch(() => ({}));
        alert("Failed: " + JSON.stringify(d));
      }
    } finally {
      setBusy(false);
    }
  };

  const addSingle = async () => {
    if (!pearlId || !singlePhone.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlAddLeads`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          pearlId,
          leads: [{phoneNumber: singlePhone.trim(), ...(singleName ? {name: singleName.trim()} : {})}],
        }),
      });
      if (r.ok) { setSinglePhone(""); setSingleName(""); await load(); }
    } finally { setBusy(false); }
  };

  const deleteSelected = async () => {
    if (!pearlId || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} lead(s)?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlDeleteLeads`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, leadIds: Array.from(selected)}),
      });
      if (r.ok) { setSelected(new Set()); await load(); }
    } finally { setBusy(false); }
  };

  if (!pearlId) {
    return <div className="text-center text-sm text-neutral-500 py-12">Select a Pearl above to manage its leads.</div>;
  }

  return (
    <div>
      {/* Add single lead */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-800 mb-2">Add a lead</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="+972501234567"
            value={singlePhone}
            onChange={(e) => setSinglePhone(e.target.value)}
            className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={singleName}
            onChange={(e) => setSingleName(e.target.value)}
            className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={addSingle}
            disabled={busy || !singlePhone.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* CSV upload */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-800 mb-2">Bulk upload CSV</h3>
        <p className="text-xs text-neutral-500 mb-2">CSV with at least a <code className="font-mono">phone</code> or <code className="font-mono">number</code> column. Optional: <code>name</code>. Any other columns become call-data variables.</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) f.text().then(parseCsv);
            }}
            className="text-xs"
          />
          {csvLeads.length > 0 && (
            <>
              <span className="text-xs text-neutral-600">{csvLeads.length} leads parsed</span>
              <button
                onClick={uploadCsv}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" /> Upload {csvLeads.length}
              </button>
            </>
          )}
        </div>
        {csvError && <p className="text-xs text-red-600 mt-2">{csvError}</p>}
      </div>

      {/* Lookup + bulk-delete-by-external */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <h3 className="text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wide">Lookup lead</h3>
          <div className="flex items-center gap-1.5">
            <select value={lookupKind} onChange={(e) => setLookupKind(e.target.value as "phone" | "external")} className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 bg-white">
              <option value="phone">By phone</option>
              <option value="external">By external ID</option>
            </select>
            <input
              type="text"
              placeholder={lookupKind === "phone" ? "+972501234567" : "external-id-from-CRM"}
              value={lookupVal}
              onChange={(e) => setLookupVal(e.target.value)}
              className="flex-1 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-mono"
            />
            <button
              onClick={async () => {
                if (!pearlId || !lookupVal.trim()) return;
                setLookupResult(null);
                const path = lookupKind === "phone" ? "nlpearlFindLeadByPhone" : "nlpearlFindLeadByExternal";
                const param = lookupKind === "phone" ? "phoneNumber" : "externalId";
                try {
                  const r = await fetch(`${FN}/${path}?pearlId=${pearlId}&${param}=${encodeURIComponent(lookupVal.trim())}`);
                  if (r.ok) { setLookupResult(await r.json()); }
                  else setLookupResult(`Not found (HTTP ${r.status})`);
                } catch (e) { setLookupResult(String(e)); }
              }}
              className="px-2 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700"
            >Find</button>
          </div>
          {lookupResult !== null && (
            <pre className="mt-2 text-[10px] font-mono bg-neutral-50 border border-neutral-200 rounded p-2 max-h-32 overflow-auto">
              {typeof lookupResult === "string" ? lookupResult : JSON.stringify(lookupResult, null, 2)}
            </pre>
          )}
        </div>
        <div className="bg-white border border-red-200 rounded-xl p-3">
          <h3 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Delete by external IDs</h3>
          <textarea
            value={delExtText}
            onChange={(e) => setDelExtText(e.target.value)}
            placeholder="Paste external IDs (comma/space/newline)"
            rows={2}
            className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-mono mb-2"
          />
          <button
            onClick={async () => {
              const ids = delExtText.split(/[\s,]+/).filter(Boolean);
              if (!pearlId || ids.length === 0) return;
              if (!confirm(`Delete ${ids.length} lead(s) by external ID?`)) return;
              setBusy(true);
              try {
                const r = await fetch(`${FN}/nlpearlDeleteLeadsByExternal`, {
                  method: "POST",
                  headers: {"Content-Type": "application/json"},
                  body: JSON.stringify({pearlId, leadExternalIds: ids}),
                });
                if (r.ok) { setDelExtText(""); await load(); }
                else alert("Failed: " + (await r.text()));
              } finally { setBusy(false); }
            }}
            disabled={busy || !delExtText.trim()}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
          >Delete by external IDs</button>
        </div>
      </div>

      {/* Search + filter + actions toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by phone or external ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-200 rounded-lg"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value === "" ? "" : Number(e.target.value))}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="">All statuses</option>
          {Object.entries(LEAD_STATUS).map(([code, info]) => (
            <option key={code} value={code}>{info.label}</option>
          ))}
        </select>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        {selected.size > 0 && (
          <button onClick={deleteSelected} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}
          </button>
        )}
      </div>

      {/* Lead table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selected.size === leads.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(leads.map((l) => l.id || "").filter(Boolean)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Phone</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">External ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Created</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 uppercase">Edit</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400 text-xs">Loading…</td></tr>
            )}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-400 text-xs">No leads yet.</td></tr>
            )}
            {leads.map((l) => {
              const lid = l.id || "";
              const info = LEAD_STATUS[l.status ?? -1] || { label: String(l.status ?? "?"), cls: "bg-neutral-100 text-neutral-600" };
              return (
                <tr key={lid} className="border-t border-neutral-100 hover:bg-neutral-50/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(lid)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(lid); else next.delete(lid);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-800">{l.phoneNumber || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500 text-xs">{l.externalId || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>{info.label}</span>
                  </td>
                  <td className="px-3 py-2 text-neutral-500 text-xs">{l.created ? new Date(l.created).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(l)}
                      className="text-neutral-400 hover:text-emerald-700"
                      title="Edit lead"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-neutral-500 border-t border-neutral-100 bg-neutral-50">
          Showing {leads.length} of {total} total
        </div>
      </div>

      {editing && (
        <EditLeadModal
          pearlId={pearlId}
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function EditLeadModal({ pearlId, lead, onClose, onSaved }: { pearlId: string; lead: Lead; onClose: () => void; onSaved: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState(lead.phoneNumber || "");
  const [externalId, setExternalId]   = useState(lead.externalId || "");
  const [callDataText, setCallDataText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    let callData: Record<string, string> | undefined;
    if (callDataText.trim() && callDataText.trim() !== "{}") {
      try {
        const parsed = JSON.parse(callDataText);
        if (typeof parsed === "object" && parsed) callData = parsed as Record<string, string>;
        else { setErr("callData must be a JSON object"); return; }
      } catch { setErr("Invalid JSON for callData"); return; }
    }
    setBusy(true);
    try {
      const data: Record<string, unknown> = {};
      if (phoneNumber !== lead.phoneNumber) data.phoneNumber = phoneNumber;
      if (externalId  !== lead.externalId)  data.externalId  = externalId;
      if (callData) data.callData = callData;
      const r = await fetch(`${FN}/nlpearlUpdateLead`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, leadId: lead.id, data}),
      });
      if (r.ok) onSaved();
      else setErr(`Failed: ${await r.text()}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-neutral-900">Edit lead</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Phone</label>
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">External ID</label>
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Call Data (JSON object)</label>
            <textarea
              value={callDataText}
              onChange={(e) => setCallDataText(e.target.value)}
              rows={4}
              placeholder={'{"email":"joe@example.com","plan":"pro"}'}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <p className="text-[11px] text-neutral-400 mt-1">Available as variables in the Pearl&apos;s opening sentence / flow.</p>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function BlacklistTab() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${FN}/nlpearlBlacklistSearch`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({limit: 200, search: search || undefined}),
      });
      const d: SearchResult<BlacklistEntry> & { totalCount?: number } = await r.json();
      const items = d.items || d.results || d.data || [];
      setEntries(items);
      setTotal(d.total ?? d.totalCount ?? items.length);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newNumber.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlBlacklistAdd`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phoneNumbers: [newNumber.trim()]}),
      });
      if (r.ok) { setNewNumber(""); await load(); }
      else alert("Failed to add: " + (await r.text()));
    } finally { setBusy(false); }
  };

  const remove = async (phone: string) => {
    if (!confirm(`Remove ${phone} from blacklist?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${FN}/nlpearlBlacklistRemove`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phoneNumbers: [phone]}),
      });
      if (r.ok) await load();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-800 mb-1">Add to blacklist</h3>
        <p className="text-xs text-neutral-500 mb-2">Enter a full number (<code className="font-mono">+972501234567</code>) or a prefix to block a range (<code className="font-mono">+972</code>, <code className="font-mono">+97250</code>).</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="+972501234567 or +972…"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={add}
            disabled={busy || !newNumber.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            <ShieldOff className="w-3.5 h-3.5" /> Block
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search blacklist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-200 rounded-lg"
          />
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Phone / Prefix</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Added</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-neutral-400 text-xs">Loading…</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-neutral-400 text-xs">Blacklist is empty.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id || e.phoneNumber} className="border-t border-neutral-100 hover:bg-neutral-50/50">
                <td className="px-3 py-2 font-mono text-neutral-800">{e.phoneNumber}</td>
                <td className="px-3 py-2 text-neutral-500 text-xs">{e.created ? new Date(e.created).toLocaleString() : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(e.phoneNumber || "")}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-neutral-500 border-t border-neutral-100 bg-neutral-50">
          Showing {entries.length} of {total} total
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Audit log event-type codes from NLPearl OpenAPI
const AUDIT_EVENTS: Record<number, string> = {
  1: "Login Attempt", 2: "Login Successful",
  10: "Publish Pearl", 11: "Pearl Status", 18: "Transfer Pearl", 19: "Delete Pearl",
  30: "Create API Key", 31: "Delete API Key",
  40: "Purchase Agents", 41: "Delete Agent",
  50: "Set Billing", 51: "Set Payment Method", 52: "Set Subscription", 59: "Cancel Subscription",
  60: "Purchase Credits", 61: "Set Auto-Recharge",
  70: "Invite User", 71: "User Join", 72: "Invitation Canceled", 73: "Update User Role",
  74: "Update Account Info", 75: "Remove User", 76: "User Left Account",
  80: "Update Session TTL", 81: "Set 2FA",
};

interface NlpUser { id?: string; email?: string; name?: string; role?: string | number; created?: string; }
interface AuditEntry { id?: string; eventType?: number; userId?: string; userEmail?: string; created?: string; details?: string; }

function ComplianceTab() {
  const [section, setSection] = useState<"users" | "audit" | "deleteCalls">("users");
  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {[
          {key: "users", label: "Team Users", icon: Users},
          {key: "audit", label: "Audit Log", icon: FileSearch},
          {key: "deleteCalls", label: "Delete Calls", icon: AlertTriangle},
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key as "users" | "audit" | "deleteCalls")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              section === s.key ? "bg-emerald-50 text-emerald-700" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>
      {section === "users" && <UsersSection />}
      {section === "audit" && <AuditLogSection />}
      {section === "deleteCalls" && <DeleteCallsSection />}
    </div>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<NlpUser[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${FN}/nlpearlListUsers`)
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : (d.items || d.results || [])))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Role</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Created</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400 text-xs">Loading…</td></tr>}
          {!loading && users.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400 text-xs">No users found.</td></tr>}
          {users.map((u) => (
            <tr key={u.id || u.email} className="border-t border-neutral-100">
              <td className="px-3 py-2 font-mono text-xs text-neutral-700">{u.email || "—"}</td>
              <td className="px-3 py-2 text-neutral-700">{u.name || "—"}</td>
              <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">{String(u.role || "user")}</span></td>
              <td className="px-3 py-2 text-xs text-neutral-500">{u.created ? new Date(u.created).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventType, setEventType] = useState<string>("");
  const [days, setDays] = useState(30);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const body: Record<string, unknown> = { from: past.toISOString(), to: now.toISOString() };
      if (eventType) body.eventType = Number(eventType);
      const r = await fetch(`${FN}/nlpearlAuditLog`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setEntries(Array.isArray(d) ? d : (d.items || d.results || d.data || []));
    } finally {
      setLoading(false);
    }
  }, [eventType, days]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All events</option>
          {Object.entries(AUDIT_EVENTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">When</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Event</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">User</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400 text-xs">Loading…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400 text-xs">No events in this range.</td></tr>}
            {entries.map((e, i) => (
              <tr key={e.id || i} className="border-t border-neutral-100">
                <td className="px-3 py-2 text-xs text-neutral-500">{e.created ? new Date(e.created).toLocaleString() : "—"}</td>
                <td className="px-3 py-2 text-neutral-700">
                  <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                    {AUDIT_EVENTS[e.eventType ?? -1] || `Event ${e.eventType}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-600">{e.userEmail || e.userId || "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{e.details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeleteCallsSection() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ids = text.split(/[\s,]+/).filter(Boolean);

  const submit = async () => {
    if (ids.length === 0) { setMsg("Enter at least one call ID."); return; }
    if (!confirm(`Permanently delete ${ids.length} call(s) including recordings & transcripts? Cannot be undone.`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${FN}/nlpearlDeleteCalls`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({callIds: ids}),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Deleted ${ids.length} call(s).` : `Failed: ${JSON.stringify(d)}`);
      if (r.ok) setText("");
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-red-200 rounded-xl p-5 max-w-2xl">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-red-700">Bulk delete calls (GDPR)</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Permanently removes call transcripts, recordings, and metadata from NLPearl. Use for right-to-be-forgotten requests.</p>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste call IDs separated by commas, spaces, or new lines…"
        rows={5}
        className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs font-mono"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-neutral-500">{ids.length} ID(s) entered</p>
        <button
          onClick={submit}
          disabled={busy || ids.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" /> {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
      {msg && <p className={`text-xs mt-2 ${msg.startsWith("Deleted") ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
    </div>
  );
}
