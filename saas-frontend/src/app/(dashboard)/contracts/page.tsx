"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  contractTemplateList, contractTemplateCreate, contractTemplateDelete,
  contractList, contractVoid,
  type ContractTemplate, type VerbalContract,
} from "@/lib/firebase-functions";
import { FileText, Plus, Trash2, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, Lock } from "lucide-react";

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-green-100 text-green-700",
    voided:    "bg-red-100 text-red-700",
    disputed:  "bg-orange-100 text-orange-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || "bg-neutral-100 text-neutral-600"}`}>{s}</span>;
}

// ── Template editor modal ─────────────────────────────────────────────────────
function TemplateModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState("");
  const [termsText, setTermsText] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const terms = termsText.split("\n").map(t => t.trim()).filter(Boolean);
    if (!name.trim() || terms.length === 0) { alert("Name and at least one term are required."); return; }
    setBusy(true);
    try {
      await contractTemplateCreate({ name: name.trim(), terms, language });
      onSave();
      onClose();
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl space-y-4 p-6">
        <h2 className="text-base font-bold text-neutral-900">New Contract Template</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Service Agreement"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Terms (one per line)</label>
            <p className="text-xs text-neutral-400 mb-1.5">Supports: &#123;&#123;partyName&#125;&#125;, &#123;&#123;date&#125;&#125;, &#123;&#123;time&#125;&#125;, &#123;&#123;companyName&#125;&#125;</p>
            <textarea value={termsText} onChange={e => setTermsText(e.target.value)}
              placeholder={"I, {{partyName}}, agree to the service terms on {{date}}.\nPayment of $50 is due within 7 days."}
              rows={5} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]">
              <option value="en">English</option>
              <option value="he">Hebrew</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-2 text-sm bg-[#F22F46] text-white rounded-lg disabled:opacity-50 hover:bg-[#d41f35] flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Contract detail expander ───────────────────────────────────────────────────
function ContractRow({ contract, onVoid }: { contract: VerbalContract; onVoid: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-neutral-50 last:border-0">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50/50"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <StatusBadge s={contract.status} />
          <div>
            <p className="text-sm font-medium text-neutral-800">{contract.partyName || "Unknown party"}</p>
            <p className="text-xs text-neutral-500">{contract.templateName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">{contract.confirmedAt ? new Date(contract.confirmedAt).toLocaleString() : "—"}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 bg-neutral-50/30">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-neutral-500">Phone: </span><span className="text-neutral-800">{contract.partyPhone || "—"}</span></div>
            <div><span className="text-neutral-500">Call Session: </span><span className="font-mono text-neutral-700">{contract.callSessionId.slice(-8)}</span></div>
            <div className="col-span-2">
              <span className="text-neutral-500">Hash: </span>
              <span className="font-mono text-neutral-600 break-all">{contract.contractHash}</span>
            </div>
          </div>
          {contract.terms.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-600 mb-1.5">Agreed Terms:</p>
              <ol className="space-y-1.5 text-xs text-neutral-700 list-decimal list-inside">
                {contract.terms.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>
          )}
          {contract.confirmedTranscriptSnippet && (
            <div className="bg-white rounded-lg border border-neutral-200 p-2.5">
              <p className="text-xs font-medium text-neutral-600 mb-1">Confirmation snippet:</p>
              <p className="text-xs text-neutral-700 italic">"{contract.confirmedTranscriptSnippet}"</p>
            </div>
          )}
          {contract.status === "confirmed" && (
            <button onClick={() => onVoid(contract.id)}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Void this contract
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContractsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"contracts" | "templates">("contracts");
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contracts, setContracts] = useState<VerbalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tmpls, ctrs] = await Promise.all([contractTemplateList(), contractList()]);
      setTemplates(tmpls.templates || []);
      setContracts(ctrs.contracts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template? Existing contracts will not be affected.")) return;
    setBusy(true);
    try { await contractTemplateDelete({ id }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const voidContract = async (id: string) => {
    const reason = prompt("Reason for voiding (optional):");
    if (reason === null) return; // cancelled
    setBusy(true);
    try { await contractVoid({ id, reason: reason || undefined }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Verbal Contracts
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">SHA-256 tamper-proof verbal agreement records captured during calls</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {tab === "templates" && (
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#F22F46] text-white rounded-lg hover:bg-[#d41f35]">
              <Plus className="w-3.5 h-3.5" /> New Template
            </button>
          )}
        </div>
      </div>

      {showModal && <TemplateModal onClose={() => setShowModal(false)} onSave={load} />}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {(["contracts","templates"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
            {t === "contracts" ? `Contracts (${contracts.length})` : `Templates (${templates.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
      ) : (
        <>
          {/* ── Contracts list ──────────────────────── */}
          {tab === "contracts" && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              {contracts.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Lock className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No verbal contracts recorded yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Contracts are created automatically when callers agree during AI calls</p>
                </div>
              ) : (
                <div>
                  {contracts.map(c => <ContractRow key={c.id} contract={c} onVoid={voidContract} />)}
                </div>
              )}
            </div>
          )}

          {/* ── Templates list ──────────────────────── */}
          {tab === "templates" && (
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 px-4 py-12 text-center">
                  <FileText className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No contract templates yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Create templates to use with assistants in calls</p>
                </div>
              ) : (
                templates.map(t => (
                  <div key={t.id} className="bg-white rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-neutral-800">{t.name}</h3>
                          <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 text-xs rounded">v{t.version}</span>
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">{t.language}</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">{t.terms.length} term{t.terms.length > 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400">{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}</span>
                        <button onClick={() => deleteTemplate(t.id)} disabled={busy}
                          className="text-neutral-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <ol className="mt-3 space-y-1 text-xs text-neutral-600 list-decimal list-inside">
                      {t.terms.slice(0, 3).map((term, i) => <li key={i} className="truncate">{term}</li>)}
                      {t.terms.length > 3 && <li className="text-neutral-400">+{t.terms.length - 3} more terms...</li>}
                    </ol>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
