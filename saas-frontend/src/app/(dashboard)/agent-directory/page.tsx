"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  agentMyListings, agentDirectory, agentRegister, agentUpdate,
  agentUnregister, agentRotateKey, agentSearch,
  type AgentRegistration,
} from "@/lib/firebase-functions";
import {
  Network, Plus, RefreshCw, Loader2, Copy, Key, Trash2, Globe, Check,
  Zap, Search, Settings, AlertCircle, X,
} from "lucide-react";

const CAPABILITY_OPTIONS = [
  "scheduling", "billing", "customer-support", "sales", "technical-support",
  "lead-qualification", "appointment-booking", "order-management", "translation",
  "compliance-check", "knowledge-base", "escalation",
];

// ── Agent card ────────────────────────────────────────────────────────────────
function AgentCard({ agent, own, onRotate, onUnregister }: {
  agent: AgentRegistration;
  own?: boolean;
  onRotate?: (id: string) => void;
  onUnregister?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Network className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">{agent.agentName}</h3>
            <p className="text-xs text-neutral-500">{agent.callsReceived} calls received</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${agent.status === "active" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
          {agent.status}
        </span>
      </div>

      {agent.description && (
        <p className="text-xs text-neutral-600 leading-relaxed">{agent.description}</p>
      )}

      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.map(c => (
            <span key={c} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{c}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Zap className="w-3 h-3" />
        <span className="font-mono truncate">{agent.id}</span>
        <button onClick={() => copy(agent.id)} className="ml-auto text-neutral-400 hover:text-neutral-600">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {own && (
        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
          <button onClick={() => onRotate?.(agent.id)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-blue-600">
            <Key className="w-3.5 h-3.5" /> Rotate API Key
          </button>
          <button onClick={() => onUnregister?.(agent.id)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-600 ml-auto">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Register modal ────────────────────────────────────────────────────────────
function RegisterModal({ onClose, onSave }: { onClose: () => void; onSave: (apiKey: string, agentId: string) => void }) {
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleCap = (c: string) =>
    setSelectedCaps(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const submit = async () => {
    if (!agentName.trim()) { alert("Agent name is required."); return; }
    if (!webhookUrl.trim()) { alert("Webhook URL is required."); return; }
    if (selectedCaps.length === 0) { alert("Select at least one capability."); return; }
    setBusy(true);
    try {
      const r = await agentRegister({
        agentName: agentName.trim(),
        description: description.trim() || undefined,
        webhookUrl: webhookUrl.trim(),
        capabilities: selectedCaps,
      });
      onSave(r.apiKey, r.agentId);
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">Register Agent</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-neutral-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Agent Name *</label>
            <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Billing Agent"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="What does this agent do?"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Webhook URL * (where to send inter-agent calls)</label>
            <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-agent.example.com/webhook"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-2">Capabilities *</label>
            <div className="flex flex-wrap gap-1.5">
              {CAPABILITY_OPTIONS.map(c => (
                <button key={c} onClick={() => toggleCap(c)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${selectedCaps.includes(c) ? "bg-[#F22F46] text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 text-sm bg-[#F22F46] text-white rounded-lg disabled:opacity-50 hover:bg-[#d41f35] flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

// ── API key reveal modal ──────────────────────────────────────────────────────
function ApiKeyRevealModal({ apiKey, agentId, onClose }: { apiKey: string; agentId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(apiKey); setCopied(true); };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle className="w-5 h-5" />
          <h2 className="text-base font-bold">Save Your API Key</h2>
        </div>
        <p className="text-sm text-neutral-600">
          This key is shown <strong>only once</strong>. Copy it now — you cannot retrieve it again.
        </p>
        <div className="bg-neutral-900 rounded-lg p-3 flex items-center gap-2">
          <code className="text-xs text-green-400 flex-1 break-all">{apiKey}</code>
          <button onClick={copy} className="shrink-0 text-neutral-400 hover:text-white">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-neutral-400">Agent ID: <span className="font-mono">{agentId}</span></p>
        <button onClick={onClose}
          className="w-full px-4 py-2 text-sm bg-neutral-900 text-white rounded-lg hover:bg-neutral-700">
          I've saved my key — Close
        </button>
      </div>
    </div>
  );
}

export default function AgentDirectoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"directory" | "my-agents">("directory");
  const [myAgents, setMyAgents] = useState<AgentRegistration[]>([]);
  const [dirAgents, setDirAgents] = useState<AgentRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [revealKey, setRevealKey] = useState<{ key: string; agentId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [my, dir] = await Promise.all([agentMyListings(), agentDirectory()]);
      setMyAgents(my.agents || []);
      setDirAgents(dir.agents || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) { await load(); return; }
    setLoading(true);
    try {
      const r = await agentSearch({ query: searchQuery });
      setDirAgents(r.agents || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleRotate = async (agentId: string) => {
    if (!confirm("Rotate API key? The old key will stop working immediately.")) return;
    setBusy(true);
    try {
      const r = await agentRotateKey({ agentId });
      setRevealKey({ key: r.apiKey, agentId });
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleUnregister = async (agentId: string) => {
    if (!confirm("Unregister this agent? This cannot be undone.")) return;
    setBusy(true);
    try { await agentUnregister({ agentId }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            Agent-to-Agent Network
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">Register, discover, and connect AI agents across your platform</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowRegister(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#F22F46] text-white rounded-lg hover:bg-[#d41f35]">
            <Plus className="w-3.5 h-3.5" /> Register Agent
          </button>
        </div>
      </div>

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSave={(key, agentId) => { setShowRegister(false); setRevealKey({ key, agentId }); load(); }}
        />
      )}
      {revealKey && <ApiKeyRevealModal apiKey={revealKey.key} agentId={revealKey.agentId} onClose={() => { setRevealKey(null); }} />}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {(["directory","my-agents"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
            {t === "directory" ? `Directory (${dirAgents.length})` : `My Agents (${myAgents.length})`}
          </button>
        ))}
      </div>

      {/* Search (directory only) */}
      {tab === "directory" && (
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search by name, capability..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <button onClick={handleSearch} className="px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">Search</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
      ) : (
        <>
          {tab === "directory" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dirAgents.length === 0 ? (
                <div className="col-span-3 bg-white rounded-xl border border-neutral-200 px-4 py-12 text-center">
                  <Globe className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No agents in the directory yet</p>
                </div>
              ) : (
                dirAgents.map(a => <AgentCard key={a.id} agent={a} />)
              )}
            </div>
          )}

          {tab === "my-agents" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAgents.length === 0 ? (
                <div className="col-span-3 bg-white rounded-xl border border-neutral-200 px-4 py-12 text-center">
                  <Network className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">You haven't registered any agents yet</p>
                  <button onClick={() => setShowRegister(true)}
                    className="mt-4 px-4 py-2 text-sm bg-[#F22F46] text-white rounded-lg hover:bg-[#d41f35] inline-flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Register your first agent
                  </button>
                </div>
              ) : (
                myAgents.map(a => (
                  <AgentCard key={a.id} agent={a} own onRotate={handleRotate} onUnregister={handleUnregister} />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
