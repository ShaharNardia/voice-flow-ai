"use client";

/**
 * Admin → Tools — global custom-tool library that any assistant can opt into.
 *
 * Defines HTTP API tools once (name, URL, method, headers, parameter schema)
 * with a live test button. Cloud Run reads tool_library docs at call start
 * and merges them with per-assistant tools.
 */

import { useEffect, useState } from "react";
import {
  Wrench, Plus, Trash2, Edit2, Play, Loader2, AlertTriangle, X,
  CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  toolLibraryList, toolLibraryCreate, toolLibraryUpdate,
  toolLibraryDelete, toolLibraryTest, type LibraryTool,
} from "@/lib/firebase-functions";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export default function ToolsLibraryPage() {
  const [tools, setTools] = useState<LibraryTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<LibraryTool | null>(null);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<LibraryTool | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError("");
    try {
      const r = await toolLibraryList();
      setTools(r.tools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(t: LibraryTool) {
    if (!confirm(`Delete tool "${t.displayName || t.name}"?`)) return;
    try {
      await toolLibraryDelete({ id: t.id });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "Delete failed"); }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-violet-600" /> Tool Library
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Custom HTTP tools your assistants can call (lookup_flight, check_inventory, send_invoice, …).
            Define once, opt in per-assistant in the assistant editor.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg"
        >
          <Plus className="w-4 h-4" /> New tool
        </button>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-neutral-400 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : tools.length === 0 ? (
        <div className="py-12 text-center bg-white border border-neutral-200 rounded-xl">
          <Wrench className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
          <p className="text-sm text-neutral-400 mb-3">No tools yet</p>
          <button onClick={() => setCreating(true)} className="text-violet-700 hover:underline text-sm">+ Create your first tool</button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t}
              onTest={() => setTesting(t)}
              onEdit={() => setEditing(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ToolModal
          tool={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
      {testing && (
        <TestModal tool={testing} onClose={() => setTesting(null)} />
      )}
    </div>
  );
}

function ToolRow({ tool, onTest, onEdit, onDelete }: {
  tool: LibraryTool;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <Wrench className="w-4 h-4 text-violet-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900">{tool.displayName || tool.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded font-mono">{tool.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded font-mono uppercase">{tool.method || "POST"}</span>
            {tool.enabled === false && <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded">disabled</span>}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5 truncate">{tool.description || tool.url}</div>
        </div>
        <button onClick={onTest} title="Test" className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-xs rounded">
          <Play className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEdit} title="Edit" className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-xs rounded">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Delete" className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:bg-red-50 hover:text-red-600 text-xs rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setExpanded(!expanded)} className="px-2 text-neutral-400 hover:text-neutral-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-neutral-100 p-4 bg-neutral-50/50 text-xs space-y-2">
          <div><span className="text-neutral-500">URL:</span> <span className="font-mono">{tool.url}</span></div>
          {tool.parameters && tool.parameters.length > 0 && (
            <div>
              <span className="text-neutral-500">Parameters:</span>
              <div className="font-mono mt-1 space-y-0.5">
                {tool.parameters.map((p) => (
                  <div key={p.name}>• {p.name}{p.required && <span className="text-red-500">*</span>} <span className="text-neutral-400">({p.type || "string"})</span> {p.description && <span className="text-neutral-500">— {p.description}</span>}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool Create/Edit Modal ───────────────────────────────────────────────

function ToolModal({ tool, onClose, onSaved }: {
  tool: LibraryTool | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,        setName]        = useState(tool?.displayName || tool?.name || "");
  const [description, setDescription] = useState(tool?.description || "");
  const [url,         setUrl]         = useState(tool?.url || "");
  const [method,      setMethod]      = useState((tool?.method || "POST").toUpperCase());
  const [headersText, setHeadersText] = useState(tool?.headers ? JSON.stringify(tool.headers, null, 2) : "{}");
  const [params,      setParams]      = useState(tool?.parameters || [] as LibraryTool["parameters"]);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      let headers: Record<string, string> = {};
      try { headers = headersText.trim() ? JSON.parse(headersText) : {}; }
      catch { setError("Headers must be valid JSON"); setSaving(false); return; }

      const payload: Partial<LibraryTool> = {
        name,
        description,
        url,
        method,
        headers,
        parameters: params,
      };
      if (tool?.id) {
        await toolLibraryUpdate({ id: tool.id, ...payload });
      } else {
        await toolLibraryCreate(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addParam() {
    setParams([...(params || []), { name: "", type: "string", description: "", required: false }]);
  }
  function updateParam(i: number, patch: Partial<NonNullable<LibraryTool["parameters"]>[number]>) {
    const next = [...(params || [])];
    next[i] = { ...next[i], ...patch };
    setParams(next);
  }
  function removeParam(i: number) {
    setParams((params || []).filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tool ? "Edit tool" : "New tool"}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <Field label="Name (machine identifier)" hint="Becomes the function name the bot calls. Only letters, digits, underscore.">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="lookup_flight" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono" />
          </Field>
          <Field label="Description" hint="What the bot uses this for. Be specific — model picks tools based on this.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Look up live flights between two airports for a specific date" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm" />
          </Field>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Method">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-2 py-2 border border-neutral-200 rounded-lg text-sm">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <div className="col-span-3">
              <Field label="URL" hint="Supports {{paramName}} placeholders.">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/flights?from={{from}}&to={{to}}" className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono" />
              </Field>
            </div>
          </div>
          <Field label="Headers (JSON)" hint='e.g. {"Authorization": "Bearer xyz", "X-API-Key": "abc"}'>
            <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={3} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs font-mono" />
          </Field>
          <Field label="Parameters">
            <div className="space-y-2">
              {(params || []).map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                  <input value={p.name} onChange={(e) => updateParam(i, { name: e.target.value })} placeholder="paramName" className="col-span-3 px-2 py-1 border border-neutral-200 rounded text-xs font-mono" />
                  <select value={p.type || "string"} onChange={(e) => updateParam(i, { type: e.target.value })} className="col-span-2 px-2 py-1 border border-neutral-200 rounded text-xs">
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                  </select>
                  <input value={p.description || ""} onChange={(e) => updateParam(i, { description: e.target.value })} placeholder="description" className="col-span-5 px-2 py-1 border border-neutral-200 rounded text-xs" />
                  <label className="col-span-1 flex items-center gap-1 text-[10px] text-neutral-500">
                    <input type="checkbox" checked={p.required || false} onChange={(e) => updateParam(i, { required: e.target.checked })} />req
                  </label>
                  <button onClick={() => removeParam(i)} className="col-span-1 text-neutral-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              <button onClick={addParam} className="text-xs text-violet-700 hover:underline">+ Add parameter</button>
            </div>
          </Field>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name || !url} className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Test Modal ───────────────────────────────────────────────────────────

function TestModal({ tool, onClose }: { tool: LibraryTool; onClose: () => void }) {
  const [argsText, setArgsText] = useState(() => {
    const sample: Record<string, string> = {};
    (tool.parameters || []).forEach((p) => { sample[p.name] = ""; });
    return JSON.stringify(sample, null, 2);
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status?: number; latencyMs: number; body?: string; error?: string; url?: string } | null>(null);

  async function run() {
    setRunning(true); setResult(null);
    try {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(argsText); } catch { setResult({ ok: false, latencyMs: 0, error: "Sample args must be valid JSON" }); setRunning(false); return; }
      const r = await toolLibraryTest({ id: tool.id, sampleArgs: args });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, latencyMs: 0, error: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2"><Play className="w-4 h-4 text-violet-600" /> Test {tool.displayName || tool.name}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Field label="Sample arguments (JSON)" hint="These are sent as JSON body (or query string for GET).">
            <textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} rows={5} className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs font-mono" />
          </Field>

          {result && (
            <div className={`rounded-lg border p-3 text-xs ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className={`flex items-center gap-2 font-semibold mb-2 ${result.ok ? "text-green-800" : "text-red-800"}`}>
                {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                {result.ok ? `HTTP ${result.status}` : result.error || `HTTP ${result.status || "?"}`}
                <span className="text-neutral-500 font-normal">· {result.latencyMs}ms</span>
              </div>
              {result.url && <div className="text-[10px] font-mono text-neutral-500 mb-1">URL: {result.url}</div>}
              {result.body && <pre className="bg-white border border-neutral-200 rounded p-2 text-[11px] font-mono overflow-auto max-h-60">{result.body}</pre>}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Close</button>
          <button onClick={run} disabled={running} className="flex items-center gap-1.5 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run test
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}
