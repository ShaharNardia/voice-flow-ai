"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatPhone, truncate } from "@/lib/utils";
import {
  leadsBatchCreate,
  leadsUpdate,
  leadsDelete,
  campaignsList,
  campaignsCreate,
  assistantsList,
  listPhoneNumbers,
  type Lead,
  type Campaign,
  type Assistant,
} from "@/lib/firebase-functions";
import * as XLSX from "xlsx";
import {
  Users,
  Upload,
  Plus,
  Search,
  Phone,
  Edit2,
  Trash2,
  ChevronRight,
  X,
  Loader2,
  Filter,
  Download,
  RefreshCw,
  Mail,
  Building2,
  FileText,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadStatus = "new" | "queued" | "calling" | "completed" | "callback" | "failed" | "dnc";

type ParsedRow = {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  notes?: string;
  [key: string]: string | undefined;
};

type ColumnMapping = {
  [xlsxHeader: string]: "phone" | "name" | "email" | "company" | "notes" | "skip";
};

type WizardStep = 1 | 2 | 3;

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; pulse?: boolean }
> = {
  new: { label: "New", bg: "bg-blue-50", text: "text-blue-700" },
  queued: { label: "Queued", bg: "bg-yellow-50", text: "text-yellow-700" },
  calling: { label: "Calling", bg: "bg-green-50", text: "text-green-700", pulse: true },
  completed: { label: "Completed", bg: "bg-neutral-100", text: "text-neutral-600" },
  callback: { label: "Callback", bg: "bg-orange-50", text: "text-orange-700" },
  failed: { label: "Failed", bg: "bg-red-50", text: "text-red-700" },
  dnc: { label: "Do Not Call", bg: "bg-gray-100", text: "text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    bg: "bg-gray-100",
    text: "text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
      {cfg.label}
    </span>
  );
}

// ── Auto-detect column mapping ────────────────────────────────────────────────

function autoDetect(header: string): ColumnMapping[string] {
  const h = header.toLowerCase();
  if (/phone|tel|mobile|טלפון/.test(h)) return "phone";
  if (/name|שם/.test(h)) return "name";
  if (/email|mail/.test(h)) return "email";
  if (/company|חברה|org/.test(h)) return "company";
  if (/note|הערה/.test(h)) return "notes";
  return "skip";
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportLeadsCsv(leads: Lead[]) {
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Company",
    "Status",
    "Campaign",
    "Call Count",
    "Last Call",
    "Last Outcome",
    "Notes",
  ];
  const rows = leads.map((l) => [
    l.name ?? "",
    l.phone,
    l.email ?? "",
    l.company ?? "",
    l.status,
    l.campaignId ?? "",
    String(l.callCount ?? 0),
    l.lastCallDate
      ? formatDate(
          typeof l.lastCallDate === "object" &&
            "toDate" in (l.lastCallDate as object)
            ? (l.lastCallDate as { toDate(): Date }).toDate()
            : (l.lastCallDate as string | number)
        )
      : "",
    l.lastCallOutcome ?? "",
    l.notes ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Upload XLSX Modal ─────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onImported: () => void;
  campaigns: Campaign[];
}

function UploadModal({ onClose, onImported, campaigns }: UploadModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [campaignId, setCampaignId] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<
    Array<{ sid: string; phoneNumber: string; friendlyName: string; country: string }>
  >([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignAssistant, setNewCampaignAssistant] = useState("");
  const [newCampaignPhone, setNewCampaignPhone] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(campaigns);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 3) {
      assistantsList().then(setAssistants).catch(() => {});
      listPhoneNumbers().then(setPhoneNumbers).catch(() => {});
    }
  }, [step]);

  function parseFile(f: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
      if (!raw.length) return;
      const hdrs = (raw[0] as unknown[]).map((h) => String(h ?? ""));
      const dataRows = (raw.slice(1) as unknown[][]).map((r) =>
        hdrs.map((_, i) => String((r as unknown[])[i] ?? ""))
      );
      setHeaders(hdrs);
      setRows(dataRows);
      const auto: ColumnMapping = {};
      hdrs.forEach((h) => {
        auto[h] = autoDetect(h);
      });
      setMapping(auto);
      setFile(f);
      setStep(2);
    };
    reader.readAsArrayBuffer(f);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  }

  function getMappedLeads(): ParsedRow[] {
    const phoneCol = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];
    if (!phoneCol) return [];
    const phoneIdx = headers.indexOf(phoneCol);
    return rows
      .filter((r) => r[phoneIdx]?.trim())
      .map((r) => {
        const row: ParsedRow = { phone: r[phoneIdx].trim() };
        Object.entries(mapping).forEach(([hdr, target]) => {
          if (target === "skip" || target === "phone") return;
          const idx = headers.indexOf(hdr);
          if (r[idx]?.trim()) row[target] = r[idx].trim();
        });
        return row;
      });
  }

  async function handleCreateCampaign() {
    if (!newCampaignName || !newCampaignAssistant || !newCampaignPhone) return;
    setCreatingCampaign(true);
    try {
      const created = await campaignsCreate({
        name: newCampaignName,
        assistantId: newCampaignAssistant,
        fromNumber: newCampaignPhone,
      });
      setLocalCampaigns((prev) => [...prev, created]);
      setCampaignId(created.id);
      setShowNewCampaign(false);
      setNewCampaignName("");
      setNewCampaignAssistant("");
      setNewCampaignPhone("");
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function handleImport() {
    const leadsToImport = getMappedLeads();
    if (!leadsToImport.length) return;
    setImporting(true);
    try {
      const result = await leadsBatchCreate({
        campaignId: campaignId || undefined,
        leads: leadsToImport,
      });
      setImportedCount(result.created);
      onImported();
    } finally {
      setImporting(false);
    }
  }

  const mappedLeadsCount = getMappedLeads().length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Upload Leads</h2>
            <p className="text-sm text-neutral-500">
              Step {step} of 3 &mdash;{" "}
              {step === 1
                ? "Select file"
                : step === 2
                ? "Map columns"
                : "Assign campaign"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 py-3 gap-2">
          {([1, 2, 3] as WizardStep[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-[#F22F46]" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: File upload */}
          {step === 1 && importedCount === null && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#F22F46] bg-red-50"
                    : "border-neutral-300 hover:border-neutral-400 bg-neutral-50"
                }`}
              >
                <Upload size={36} className="mx-auto mb-3 text-neutral-400" />
                <p className="font-medium text-neutral-700">
                  Drag &amp; drop your file here
                </p>
                <p className="text-sm text-neutral-500 mt-1">
                  or click to browse — .xlsx, .xls, .csv supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>
          )}

          {/* Step 2: Column mapping */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Map each column from your file to a lead field.
              </p>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200">
                      <th className="text-left px-4 py-2 font-medium text-neutral-700">
                        Column
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-700">
                        Maps to
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-700">
                        Preview
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((hdr, idx) => (
                      <tr
                        key={hdr}
                        className="border-b border-neutral-100 last:border-0"
                      >
                        <td className="px-4 py-2 font-medium text-neutral-800">
                          {hdr}
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={mapping[hdr] ?? "skip"}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [hdr]: e.target.value as ColumnMapping[string],
                              }))
                            }
                            className="text-sm border border-neutral-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                          >
                            <option value="phone">Phone (required)</option>
                            <option value="name">Name</option>
                            <option value="email">Email</option>
                            <option value="company">Company</option>
                            <option value="notes">Notes</option>
                            <option value="skip">Skip</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-neutral-500 text-xs">
                          {rows
                            .slice(0, 3)
                            .map((r) => r[idx])
                            .filter(Boolean)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview table */}
              {rows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                    File preview (first 5 rows)
                  </p>
                  <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                          {headers.map((h) => (
                            <th
                              key={h}
                              className="text-left px-3 py-2 font-medium text-neutral-600 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-neutral-100 last:border-0"
                          >
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                className="px-3 py-1.5 text-neutral-700 whitespace-nowrap"
                              >
                                {truncate(cell, 30)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-sm font-medium text-neutral-700">
                {mappedLeadsCount > 0 ? (
                  <span className="text-green-700">
                    {mappedLeadsCount} lead{mappedLeadsCount !== 1 ? "s" : ""} found
                  </span>
                ) : (
                  <span className="text-red-600">
                    No leads found — make sure a column is mapped to Phone
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Step 3: Campaign assignment */}
          {step === 3 && importedCount === null && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Assign to campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                >
                  <option value="">No campaign (standalone leads)</option>
                  {localCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCampaign((v) => !v)}
                  className="mt-2 text-sm text-[#F22F46] hover:underline"
                >
                  {showNewCampaign ? "Cancel" : "+ Create new campaign"}
                </button>
              </div>

              {showNewCampaign && (
                <div className="border border-neutral-200 rounded-xl p-4 space-y-3 bg-neutral-50">
                  <p className="text-sm font-semibold text-neutral-800">
                    New Campaign
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Campaign name
                    </label>
                    <input
                      value={newCampaignName}
                      onChange={(e) => setNewCampaignName(e.target.value)}
                      placeholder="e.g. Q1 Outreach"
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Assistant
                    </label>
                    <select
                      value={newCampaignAssistant}
                      onChange={(e) => setNewCampaignAssistant(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                    >
                      <option value="">Select assistant…</option>
                      {assistants.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.assistantName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      From number
                    </label>
                    <select
                      value={newCampaignPhone}
                      onChange={(e) => setNewCampaignPhone(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                    >
                      <option value="">Select number…</option>
                      {phoneNumbers.map((p) => (
                        <option key={p.sid} value={p.phoneNumber}>
                          {p.friendlyName || p.phoneNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleCreateCampaign}
                    disabled={
                      creatingCampaign ||
                      !newCampaignName ||
                      !newCampaignAssistant ||
                      !newCampaignPhone
                    }
                    className="w-full py-2 rounded-lg bg-[#F22F46] text-white text-sm font-medium hover:bg-[#d42840] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creatingCampaign && <Loader2 size={14} className="animate-spin" />}
                    Create Campaign
                  </button>
                </div>
              )}

              <div className="bg-neutral-50 rounded-lg p-3 text-sm text-neutral-600">
                Ready to import{" "}
                <span className="font-semibold text-neutral-900">
                  {mappedLeadsCount}
                </span>{" "}
                lead{mappedLeadsCount !== 1 ? "s" : ""}
                {campaignId
                  ? ` into "${localCampaigns.find((c) => c.id === campaignId)?.name ?? campaignId}"`
                  : " as standalone leads"}
                .
              </div>
            </div>
          )}

          {/* Success state */}
          {importedCount !== null && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                <Users size={28} className="text-green-600" />
              </div>
              <p className="text-lg font-semibold text-neutral-900">
                {importedCount} lead{importedCount !== 1 ? "s" : ""} imported!
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                Your leads are now available in the table.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {importedCount === null && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200">
            <button
              onClick={() => {
                if (step === 1) onClose();
                else setStep((s) => (s - 1) as WizardStep);
              }}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
            >
              {step === 1 ? "Cancel" : "Back"}
            </button>
            {step === 1 && (
              <p className="text-xs text-neutral-400">
                Select a file to continue
              </p>
            )}
            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                disabled={mappedLeadsCount === 0}
                className="px-4 py-2 rounded-lg bg-[#F22F46] text-white text-sm font-medium hover:bg-[#d42840] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Next <ChevronRight size={15} />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleImport}
                disabled={importing || mappedLeadsCount === 0}
                className="px-4 py-2 rounded-lg bg-[#F22F46] text-white text-sm font-medium hover:bg-[#d42840] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                Import {mappedLeadsCount} Lead{mappedLeadsCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}
        {importedCount !== null && (
          <div className="flex justify-end px-6 py-4 border-t border-neutral-200">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Lead Modal ────────────────────────────────────────────────────────────

interface AddLeadModalProps {
  onClose: () => void;
  campaigns: Campaign[];
}

function AddLeadModal({ onClose, campaigns }: AddLeadModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    notes: "",
    campaignId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const leadData: Record<string, unknown> = {
        phone: form.phone.trim(),
        status: "new",
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (form.name.trim()) leadData.name = form.name.trim();
      if (form.email.trim()) leadData.email = form.email.trim();
      if (form.company.trim()) leadData.company = form.company.trim();
      if (form.notes.trim()) leadData.notes = form.notes.trim();
      if (form.campaignId) leadData.campaignId = form.campaignId;
      await addDoc(collection(db, "leads"), leadData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Add Lead</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="John Smith"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="john@example.com"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Company
            </label>
            <input
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Acme Corp"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              placeholder="Any notes…"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Campaign
            </label>
            <select
              value={form.campaignId}
              onChange={(e) => update("campaignId", e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
            >
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#F22F46] text-white text-sm font-medium hover:bg-[#d42840] disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Add Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Lead Detail Panel ─────────────────────────────────────────────────────────

interface LeadPanelProps {
  lead: Lead;
  campaigns: Campaign[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updated: Partial<Lead>) => void;
}

interface CallSession {
  id: string;
  leadNumber?: string;
  status?: string;
  outcome?: string;
  createdAt?: unknown;
  duration?: number;
  summary?: string;
}

function LeadPanel({ lead, campaigns, onClose, onDeleted, onUpdated }: LeadPanelProps) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: lead.name ?? "",
    phone: lead.phone,
    email: lead.email ?? "",
    company: lead.company ?? "",
    notes: lead.notes ?? "",
    status: lead.status,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "call_sessions"),
      where("leadNumber", "==", lead.phone),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsub = onSnapshot(q, (snap) => {
      setCallHistory(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallSession))
      );
    });
    return unsub;
  }, [lead.phone, user]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const updates: Partial<Lead> & { id: string } = { id: lead.id, ...form };
      await leadsUpdate(updates);
      onUpdated(form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await leadsDelete({ id: lead.id });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  function getCallDate(cs: CallSession): string {
    if (!cs.createdAt) return "";
    const d =
      typeof cs.createdAt === "object" && "toDate" in (cs.createdAt as object)
        ? (cs.createdAt as { toDate(): Date }).toDate()
        : new Date(cs.createdAt as string | number);
    return formatDate(d);
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex-1 min-w-0">
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Unnamed lead"
              className="text-lg font-semibold text-neutral-900 bg-transparent border-0 outline-none w-full truncate"
            />
            <p className="text-sm text-neutral-500 mt-0.5">{formatPhone(lead.phone)}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Action buttons */}
          <div className="flex gap-2">
            <Link
              href={`/calls?phone=${encodeURIComponent(lead.phone)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F22F46] text-white text-sm font-medium hover:bg-[#d42840]"
            >
              <PhoneCall size={14} />
              Place Call
            </Link>
          </div>

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {saveError}
            </p>
          )}

          {/* Edit form */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Lead Details
            </p>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Phone
              </label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={form.email}
                  type="email"
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                  placeholder="—"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Company
              </label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={form.company}
                  onChange={(e) => update("company", e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
                  placeholder="—"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
              >
                {Object.keys(STATUS_CONFIG).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Notes
              </label>
              <div className="relative">
                <FileText size={14} className="absolute left-3 top-3 text-neutral-400" />
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                  className="w-full border border-neutral-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30 resize-none"
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Call history */}
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
              Call History
            </p>
            {callHistory.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No calls yet.</p>
            ) : (
              <div className="space-y-2">
                {callHistory.map((cs) => (
                  <Link
                    key={cs.id}
                    href={`/calls/detail?id=${cs.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-800">
                        {getCallDate(cs)}
                      </p>
                      {cs.summary && (
                        <p className="text-xs text-neutral-500 truncate mt-0.5">
                          {truncate(cs.summary, 60)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {cs.outcome && (
                        <span className="text-xs text-neutral-500 capitalize">
                          {cs.outcome}
                        </span>
                      )}
                      {cs.status && <StatusBadge status={cs.status} />}
                      <ChevronRight
                        size={14}
                        className="text-neutral-400 group-hover:text-neutral-600"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600">Delete this lead?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Firestore real-time listener
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "leads"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
        setLoading(false);
      },
      (err) => {
        console.error("Leads query failed:", err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, refreshToken]);

  // Campaigns list
  useEffect(() => {
    campaignsList()
      .then(setCampaigns)
      .catch(() => {});
  }, [refreshToken]);

  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]));

  // Filtered leads
  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    if (q) {
      const name = (l.name ?? "").toLowerCase();
      const phone = l.phone.toLowerCase();
      const company = (l.company ?? "").toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !company.includes(q)) return false;
    }
    if (statusFilter && l.status !== statusFilter) return false;
    if (campaignFilter && l.campaignId !== campaignFilter) return false;
    return true;
  });

  function getLastCallDate(l: Lead): string {
    if (!l.lastCallDate) return "—";
    const d =
      typeof l.lastCallDate === "object" && "toDate" in (l.lastCallDate as object)
        ? (l.lastCallDate as { toDate(): Date }).toDate()
        : new Date(l.lastCallDate as string | number);
    return formatDate(d);
  }

  function handleLeadUpdated(updated: Partial<Lead>) {
    if (!selectedLead) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === selectedLead.id ? { ...l, ...updated } : l))
    );
    setSelectedLead((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  function handleLeadDeleted() {
    if (!selectedLead) return;
    setLeads((prev) => prev.filter((l) => l.id !== selectedLead.id));
    setSelectedLead(null);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-neutral-200">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Leads</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Manage and track your leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportLeadsCsv(filteredLeads)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-neutral-200 rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Upload size={14} />
              Upload XLSX
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-[#F22F46] text-white font-medium hover:bg-[#d42840] transition-colors"
            >
              <Plus size={14} />
              Add Lead
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mt-5">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, company…"
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-neutral-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-neutral-200 rounded-lg px-2.5 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="border border-neutral-200 rounded-lg px-2.5 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#F22F46]/30"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {(search || statusFilter || campaignFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setCampaignFilter("");
              }}
              className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
            >
              <X size={13} />
              Clear
            </button>
          )}
          <button
            onClick={() => setRefreshToken((t) => t + 1)}
            className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-neutral-400" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
              <Users size={24} className="text-neutral-400" />
            </div>
            <p className="text-base font-semibold text-neutral-700">
              {leads.length === 0 ? "No leads yet" : "No leads match your filters"}
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              {leads.length === 0
                ? "Upload an XLSX file to get started"
                : "Try adjusting your search or filters"}
            </p>
            {leads.length === 0 && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Upload size={14} />
                Upload XLSX
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Name / Phone
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Company
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Status
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Campaign
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Last Call
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Outcome
                </th>
                <th className="text-left px-5 py-3 font-medium text-neutral-600 whitespace-nowrap">
                  Calls
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedLead(lead)}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-neutral-900">
                      {lead.name ? truncate(lead.name, 30) : (
                        <span className="text-neutral-400 italic">Unnamed</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                      <Phone size={11} />
                      {formatPhone(lead.phone)}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {lead.company ? (
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-neutral-400" />
                        {truncate(lead.company, 25)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {lead.campaignId && campaignMap[lead.campaignId] ? (
                      truncate(campaignMap[lead.campaignId], 22)
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-500 text-xs whitespace-nowrap">
                    {getLastCallDate(lead)}
                  </td>
                  <td className="px-5 py-3">
                    {lead.lastCallOutcome ? (
                      <span className="text-xs text-neutral-600 capitalize">
                        {lead.lastCallOutcome}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-700 text-center">
                    {lead.callCount ?? 0}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 text-neutral-500"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lead count footer */}
      {!loading && filteredLeads.length > 0 && (
        <div className="px-5 py-3 border-t border-neutral-200 text-xs text-neutral-500">
          Showing {filteredLeads.length} of {leads.length} lead
          {leads.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          campaigns={campaigns}
          onClose={() => setShowUpload(false)}
          onImported={() => {
            setRefreshToken((t) => t + 1);
          }}
        />
      )}
      {showAdd && (
        <AddLeadModal
          campaigns={campaigns}
          onClose={() => setShowAdd(false)}
        />
      )}
      {selectedLead && (
        <LeadPanel
          lead={selectedLead}
          campaigns={campaigns}
          onClose={() => setSelectedLead(null)}
          onDeleted={handleLeadDeleted}
          onUpdated={handleLeadUpdated}
        />
      )}
    </div>
  );
}
