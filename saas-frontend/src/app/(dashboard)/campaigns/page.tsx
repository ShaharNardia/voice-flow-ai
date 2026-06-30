"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useUsersMap, type UserInfo } from "@/hooks/useUsersMap";
import OwnerBadge from "@/components/OwnerBadge";
import { FeatureGate } from "@/components/FeatureGate";
import { formatDate } from "@/lib/utils";
import {
  campaignsList,
  campaignsCreate,
  campaignsUpdate,
  campaignStart,
  campaignPause,
  leadsBatchCreate,
  assistantsList,
  listPhoneNumbers,
  type Campaign,
  type Assistant,
} from "@/lib/firebase-functions";
import * as XLSX from "xlsx";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  CheckCircle,
  XCircle,
  Phone,
  Loader2,
  FileSpreadsheet,
  Zap,
} from "lucide-react";
import Link from "next/link";

type LeadRow = {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  [key: string]: string | undefined;
};

type WizardStep = 1 | 2 | 3;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  running: { label: "Running", className: "bg-green-100 text-green-700" },
  paused: { label: "Paused", className: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completed", className: "bg-blue-100 text-blue-700" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{pct}% complete</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CampaignCard({
  campaign,
  onStart,
  onPause,
  loadingId,
  isSuperAdmin,
  usersMap,
}: {
  campaign: Campaign & { id: string };
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  loadingId: string | null;
  isSuperAdmin: boolean;
  usersMap: Map<string, UserInfo>;
}) {
  const called = campaign.calledCount ?? 0;
  const total = campaign.leadCount ?? 0;
  const success = campaign.successCount ?? 0;
  const failed = campaign.failedCount ?? 0;
  const remaining = total - called;
  const isLoading = loadingId === campaign.id;
  const [autoDial, setAutoDialState] = useState(campaign.autoDial === true);
  const [savingAutoDial, setSavingAutoDial] = useState(false);

  async function toggleAutoDial() {
    const next = !autoDial;
    setAutoDialState(next);          // optimistic; onSnapshot reconciles
    setSavingAutoDial(true);
    try {
      await campaignsUpdate({ campaignId: campaign.id, autoDial: next });
    } catch {
      setAutoDialState(!next);       // revert on failure
    } finally {
      setSavingAutoDial(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
            {isSuperAdmin && <OwnerBadge ownerId={campaign.ownerId} usersMap={usersMap} />}
          </div>
          {campaign.assistantId && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{campaign.assistantId}</p>
          )}
        </div>
        <StatusBadge status={campaign.status ?? "draft"} />
      </div>

      <ProgressBar value={called} max={total} />

      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-4 h-4" />
          {success}
        </span>
        <span className="flex items-center gap-1 text-red-500">
          <XCircle className="w-4 h-4" />
          {failed}
        </span>
        <span className="flex items-center gap-1 text-gray-500">
          <Phone className="w-4 h-4" />
          {remaining} left
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        {(campaign.status === "draft" || campaign.status === "paused") && (
          <button
            onClick={() => onStart(campaign.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-colors"
            style={{ backgroundColor: "#F22F46" }}
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Start
          </button>
        )}
        {campaign.status === "running" && (
          <button
            onClick={() => onPause(campaign.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-60 transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
            Pause
          </button>
        )}
        <button
          onClick={toggleAutoDial}
          disabled={savingAutoDial}
          title={autoDial ? "Auto-dialing on a schedule — click to turn off" : "Turn on scheduled auto-dialing"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
            autoDial ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "text-gray-500 bg-gray-100 hover:bg-gray-200"
          }`}
        >
          <Zap className="w-3.5 h-3.5" /> Auto-dial {autoDial ? "on" : "off"}
        </button>
        <Link
          href={`/campaigns/detail?id=${campaign.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors ml-auto"
        >
          View Details <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <p className="text-xs text-gray-400">
        Created {campaign.createdAt ? formatDate(campaign.createdAt as string) : "—"}
      </p>
    </div>
  );
}

function detectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());

  const phoneKeys = ["phone", "mobile", "cell", "telephone", "tel", "number"];
  const nameKeys = ["name", "full name", "fullname", "contact", "first name", "firstname"];
  const emailKeys = ["email", "e-mail", "mail"];
  const companyKeys = ["company", "organization", "org", "business", "employer"];

  lower.forEach((h, i) => {
    if (phoneKeys.some((k) => h.includes(k))) mapping.phone = headers[i];
    else if (nameKeys.some((k) => h.includes(k)) && !mapping.name) mapping.name = headers[i];
    else if (emailKeys.some((k) => h.includes(k))) mapping.email = headers[i];
    else if (companyKeys.some((k) => h.includes(k))) mapping.company = headers[i];
  });

  return mapping;
}

function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{ sid: string; phoneNumber: string; friendlyName: string; country: string }>>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Step 1 fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  // Scheduled auto-dialer (Phase B)
  const [autoDial, setAutoDial] = useState(false);
  const [windowStart, setWindowStart] = useState(9);
  const [windowEnd, setWindowEnd] = useState(20);

  // Step 2 fields
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [aList, pList] = await Promise.all([assistantsList(), listPhoneNumbers()]);
        setAssistants(aList ?? []);
        setPhoneNumbers(pList ?? []);
        if (aList?.length) setAssistantId(aList[0].id);
        if (pList?.length) setFromNumber(pList[0].phoneNumber);
      } catch {
        // non-blocking
      } finally {
        setLoadingMeta(false);
      }
    }
    load();
  }, []);

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      if (!json.length) return;
      const hdrs = Object.keys(json[0]);
      const mapping = detectColumns(hdrs);
      setHeaders(hdrs);
      setColMap(mapping);
      setRawRows(json);
      const mapped: LeadRow[] = json.map((row) => ({
        phone: row[mapping.phone ?? ""] ?? "",
        name: mapping.name ? row[mapping.name] : undefined,
        email: mapping.email ? row[mapping.email] : undefined,
        company: mapping.company ? row[mapping.company] : undefined,
      }));
      setLeads(mapped.filter((l) => l.phone));
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function step1Valid() {
    return name.trim() && assistantId && fromNumber;
  }

  async function handleSubmit(startNow: boolean) {
    setIsSubmitting(true);
    setError("");
    try {
      const result = await campaignsCreate({
        name: name.trim(), assistantId, fromNumber, description: description.trim(),
        autoDial, callWindowStart: windowStart, callWindowEnd: windowEnd,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem",
      });
      const campaignId = result?.id;
      if (!campaignId) throw new Error("Failed to create campaign");
      if (leads.length) {
        await leadsBatchCreate({ campaignId, leads });
      }
      if (startNow) {
        await campaignStart({ campaignId, batchSize: 10 });
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedAssistant = assistants.find((a) => a.id === assistantId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">New Campaign</h2>
            <p className="text-xs text-gray-500">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 pt-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  s < step
                    ? "bg-green-500 text-white"
                    : s === step
                    ? "text-white"
                    : "bg-gray-100 text-gray-400"
                }`}
                style={s === step ? { backgroundColor: "#F22F46" } : undefined}
              >
                {s < step ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 mx-1 ${s < step ? "bg-green-500" : "bg-gray-100"}`} />
              )}
            </div>
          ))}
          <div className="ml-3 text-sm text-gray-600">
            {step === 1 ? "Setup" : step === 2 ? "Upload Leads" : "Review & Create"}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q1 Outreach 2026"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assistant <span className="text-red-500">*</span>
                </label>
                {loadingMeta ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </div>
                ) : (
                  <select
                    value={assistantId}
                    onChange={(e) => setAssistantId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  >
                    {assistants.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    {!assistants.length && <option value="">No assistants available</option>}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Number <span className="text-red-500">*</span>
                </label>
                {loadingMeta ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </div>
                ) : (
                  <select
                    value={fromNumber}
                    onChange={(e) => setFromNumber(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  >
                    {phoneNumbers.map((p) => (
                      <option key={p.phoneNumber} value={p.phoneNumber}>
                        {p.friendlyName || p.phoneNumber}
                      </option>
                    ))}
                    {!phoneNumbers.length && <option value="">No numbers available</option>}
                  </select>
                )}
              </div>

              {/* Scheduled auto-dialer (Phase B) */}
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
                  Auto-dial leads on a schedule
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  When on, the system dials the lead list automatically in small batches during the hours below — no need to press Start each time. Calls only happen inside the window.
                </p>
                {autoDial && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <span className="text-gray-600">Call between</span>
                    <input type="number" min={0} max={23} value={windowStart}
                      onChange={(e) => setWindowStart(Number(e.target.value))}
                      className="w-16 border border-gray-200 rounded px-2 py-1" />
                    <span className="text-gray-600">and</span>
                    <input type="number" min={1} max={24} value={windowEnd}
                      onChange={(e) => setWindowEnd(Number(e.target.value))}
                      className="w-16 border border-gray-200 rounded px-2 py-1" />
                    <span className="text-gray-400 text-xs">:00 ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">
                  {leads.length ? `${leads.length} leads loaded — click to replace` : "Drop your XLSX/CSV file here"}
                </p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
              </div>

              {/* Column mapping */}
              {headers.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-gray-700">Column Mapping</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["phone", "name", "email", "company"] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-xs text-gray-500 mb-1 capitalize">
                          {field} {field === "phone" && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          value={colMap[field] ?? ""}
                          onChange={(e) => {
                            const newMap = { ...colMap, [field]: e.target.value };
                            setColMap(newMap);
                            const mapped: LeadRow[] = rawRows.map((row) => ({
                              phone: row[newMap.phone ?? ""] ?? "",
                              name: newMap.name ? row[newMap.name] : undefined,
                              email: newMap.email ? row[newMap.email] : undefined,
                              company: newMap.company ? row[newMap.company] : undefined,
                            }));
                            setLeads(mapped.filter((l) => l.phone));
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
                        >
                          <option value="">— skip —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Preview */}
                  {leads.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Preview (first 5 rows)</p>
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Phone</th>
                              <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Name</th>
                              <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Email</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leads.slice(0, 5).map((l, i) => (
                              <tr key={i} className="border-t border-gray-50">
                                <td className="px-2 py-1.5 text-gray-700">{l.phone}</td>
                                <td className="px-2 py-1.5 text-gray-500">{l.name ?? "—"}</td>
                                <td className="px-2 py-1.5 text-gray-500 truncate max-w-[120px]">{l.email ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{leads.length} leads ready to import</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">Review your campaign before creating it.</p>
              <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Campaign Name</span>
                  <span className="font-medium text-gray-800">{name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Assistant</span>
                  <span className="font-medium text-gray-800">{selectedAssistant?.name ?? assistantId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">From Number</span>
                  <span className="font-medium text-gray-800">{fromNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Leads</span>
                  <span className="font-medium text-gray-800">{leads.length} contacts</span>
                </div>
                {description && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Description</span>
                    <span className="font-medium text-gray-800 text-right max-w-[60%]">{description}</span>
                  </div>
                )}
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as WizardStep)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 && (
            <button
              onClick={() => setStep((s) => (s + 1) as WizardStep)}
              disabled={step === 1 && !step1Valid()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors ml-auto"
              style={{ backgroundColor: "#F22F46" }}
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 3 && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save as Draft
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: "#F22F46" }}
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Create &amp; Start Now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignsPageInner() {
  const { user } = useAuth();
  const { usersMap, isSuperAdmin } = useUsersMap();
  const uid = user?.uid;
  const [campaigns, setCampaigns] = useState<(Campaign & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const q = isSuperAdmin
      ? query(
          collection(db, "campaigns"),
          orderBy("createdAt", "desc")
        )
      : query(
          collection(db, "campaigns"),
          where("ownerId", "==", uid),
          orderBy("createdAt", "desc")
        );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => { const c = d.data() as Campaign; return { ...c, id: d.id }; });
      setCampaigns(docs);
      setLoading(false);
    });
    return () => unsub();
  }, [uid, refreshKey, isSuperAdmin]);

  async function handleStart(campaignId: string) {
    setLoadingId(campaignId);
    setActionError("");
    try {
      await campaignStart({ campaignId, batchSize: 10 });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to start campaign");
    } finally {
      setLoadingId(null);
    }
  }

  async function handlePause(campaignId: string) {
    setLoadingId(campaignId);
    setActionError("");
    try {
      await campaignPause({ campaignId });
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Failed to pause campaign");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-sm text-gray-500 mt-1">Manage outbound calling campaigns</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#F22F46" }}
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError("")} className="text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && campaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Megaphone className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">No campaigns yet</h3>
            <p className="text-sm text-gray-400 max-w-xs">
              Create your first campaign to start calling leads
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#F22F46" }}
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        )}

        {/* Grid */}
        {!loading && campaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onStart={handleStart}
                onPause={handlePause}
                loadingId={loadingId}
                isSuperAdmin={isSuperAdmin}
                usersMap={usersMap}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewCampaignModal
          onClose={() => setShowModal(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return <FeatureGate featureId="module.campaigns"><CampaignsPageInner /></FeatureGate>;
}
