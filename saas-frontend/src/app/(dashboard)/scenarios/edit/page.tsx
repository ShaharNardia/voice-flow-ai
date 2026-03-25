"use client";

import { Suspense, useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Save, Loader2, Trash2, Plus, Play, X, Send } from "lucide-react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "reactflow";
import { Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { scenariosGet, scenariosUpdate, type ScenarioNode, type ScenarioEdge } from "@/lib/firebase-functions";

// ── Dynamic ReactFlow components (SSR disabled for static export) ────────
const ReactFlow = dynamic(() => import("reactflow").then((m) => m.default), { ssr: false });
const Background = dynamic(() => import("reactflow").then((m) => m.Background), { ssr: false });
const Controls = dynamic(() => import("reactflow").then((m) => m.Controls), { ssr: false });
const MiniMap = dynamic(() => import("reactflow").then((m) => m.MiniMap), { ssr: false });

// ── Node type configuration (matches backend NODE_TYPES) ────────────────
const NODE_TYPES_CONFIG: Record<string, { label: string; color: string; defaultData: Record<string, unknown> }> = {
  start:            { label: "Start",              color: "#4CAF50", defaultData: { trigger: "outbound" } },
  say:              { label: "Say",                color: "#2196F3", defaultData: { text: "", voice: "Google.he-IL-Wavenet-A", language: "he-IL" } },
  gather:           { label: "Gather Input",       color: "#FF9800", defaultData: { inputType: "speech", prompt: "", timeout: 5 } },
  condition:        { label: "Condition",          color: "#9C27B0", defaultData: { conditionType: "keywords", variable: "", operator: "equals", value: "" } },
  setVariable:      { label: "Set Variable",       color: "#607D8B", defaultData: { variableName: "", value: "", valueType: "string" } },
  apiCall:          { label: "API Call",           color: "#00BCD4", defaultData: { url: "", method: "POST", headers: {}, body: "" } },
  transfer:         { label: "Transfer Call",      color: "#E91E63", defaultData: { destinationType: "number", destination: "", timeout: 30 } },
  record:           { label: "Record",             color: "#795548", defaultData: { action: "start", maxLength: 300, playBeep: true } },
  wait:             { label: "Wait",               color: "#9E9E9E", defaultData: { duration: 1 } },
  scheduleCallback: { label: "Schedule Callback",  color: "#3F51B5", defaultData: { delay: 3600, message: "" } },
  updateLead:       { label: "Update Lead",        color: "#8BC34A", defaultData: { status: "", notes: "" } },
  end:              { label: "End Call",            color: "#F44336", defaultData: { message: "תודה. להתראות!", status: "completed" } },
};

// ── Custom node renderer ────────────────────────────────────────────────
function FlowNode({ data, selected }: NodeProps) {
  const preview = data.text || data.prompt || data.message || data.url || data.destination || data.variableName || "";
  return (
    <div
      style={{
        background: (data.color as string) || "#999",
        color: "white",
        padding: "8px 14px",
        borderRadius: 8,
        border: selected ? "2px solid #111" : "2px solid transparent",
        minWidth: 130,
        textAlign: "center",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "rgba(255,255,255,0.7)" }} />
      <div>{data.label as string}</div>
      {preview ? (
        <div style={{ fontSize: 10, opacity: 0.85, marginTop: 3, fontWeight: 400 }}>
          {String(preview).slice(0, 28)}{String(preview).length > 28 ? "…" : ""}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} style={{ background: "rgba(255,255,255,0.7)" }} />
    </div>
  );
}

const RF_NODE_TYPES = Object.fromEntries(Object.keys(NODE_TYPES_CONFIG).map((k) => [k, FlowNode]));

// ── Properties panel ────────────────────────────────────────────────────
function PropertiesPanel({
  node,
  onUpdate,
  onDelete,
}: {
  node: Node;
  onUpdate: (key: string, value: unknown) => void;
  onDelete: () => void;
}) {
  const d = node.data as Record<string, unknown>;
  const typeKey = node.type || "say";

  const field = (label: string, key: string, type: "text" | "textarea" | "number" | "select", opts?: string[]) => (
    <div key={key} className="mb-3">
      <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">{label}</label>
      {type === "textarea" ? (
        <textarea
          rows={3}
          value={String(d[key] ?? "")}
          onChange={(e) => onUpdate(key, e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none"
        />
      ) : type === "number" ? (
        <input
          type="number"
          value={Number(d[key] ?? 0)}
          onChange={(e) => onUpdate(key, Number(e.target.value))}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
        />
      ) : type === "select" && opts ? (
        <select
          value={String(d[key] ?? opts[0])}
          onChange={(e) => onUpdate(key, e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
        >
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={String(d[key] ?? "")}
          onChange={(e) => onUpdate(key, e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
        />
      )}
    </div>
  );

  const fields: React.ReactNode[] = [];
  switch (typeKey) {
    case "start":
      fields.push(field("Trigger", "trigger", "select", ["outbound", "inbound"]));
      break;
    case "say":
      fields.push(field("Message Text", "text", "textarea"));
      break;
    case "gather":
      fields.push(field("Prompt", "prompt", "textarea"));
      fields.push(field("Timeout (sec)", "timeout", "number"));
      fields.push(field("Input Type", "inputType", "select", ["speech", "dtmf", "both"]));
      break;
    case "condition":
      fields.push(field("Variable", "variable", "text"));
      fields.push(field("Operator", "operator", "select", ["equals", "contains", "startsWith", "greaterThan", "lessThan"]));
      fields.push(field("Value", "value", "text"));
      break;
    case "setVariable":
      fields.push(field("Variable Name", "variableName", "text"));
      fields.push(field("Value", "value", "text"));
      fields.push(field("Type", "valueType", "select", ["string", "number", "boolean"]));
      break;
    case "apiCall":
      fields.push(field("URL", "url", "text"));
      fields.push(field("Method", "method", "select", ["GET", "POST", "PUT", "DELETE", "PATCH"]));
      fields.push(field("Save Response To", "saveResponseTo", "text"));
      break;
    case "transfer":
      fields.push(field("Destination Type", "destinationType", "select", ["number", "agent", "queue"]));
      fields.push(field("Destination", "destination", "text"));
      fields.push(field("Timeout (sec)", "timeout", "number"));
      break;
    case "record":
      fields.push(field("Action", "action", "select", ["start", "stop"]));
      fields.push(field("Max Length (sec)", "maxLength", "number"));
      break;
    case "wait":
      fields.push(field("Duration (sec)", "duration", "number"));
      break;
    case "scheduleCallback":
      fields.push(field("Delay (sec)", "delay", "number"));
      fields.push(field("Message", "message", "textarea"));
      break;
    case "updateLead":
      fields.push(field("Status", "status", "text"));
      fields.push(field("Notes", "notes", "textarea"));
      break;
    case "end":
      fields.push(field("Farewell Message", "message", "textarea"));
      fields.push(field("Status", "status", "text"));
      break;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: NODE_TYPES_CONFIG[typeKey]?.color || "#999" }} />
        <span className="text-sm font-semibold text-neutral-800">{NODE_TYPES_CONFIG[typeKey]?.label || typeKey}</span>
      </div>
      <div className="flex-1 overflow-y-auto pr-1">{fields}</div>
      <button
        onClick={onDelete}
        className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete Node
      </button>
    </div>
  );
}

// ── Live Test Panel ──────────────────────────────────────────────────────

interface TestMsg { role: "bot" | "user" | "system"; text: string; }

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function LiveTestPanel({
  nodes,
  edges,
  onClose,
}: {
  nodes: Node<Record<string, unknown>>[];
  edges: Edge[];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<TestMsg[]>([]);
  const [userInput, setUserInput] = useState("");
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const resumeRef = useRef<((val: string) => void) | null>(null);
  const varsRef = useRef<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMsg = useCallback((role: TestMsg["role"], text: string) => {
    setMessages((m) => [...m, { role, text }]);
  }, []);

  const edgesBySource = useMemo(() => {
    const map: Record<string, Edge[]> = {};
    for (const e of edges) { if (!map[e.source]) map[e.source] = []; map[e.source].push(e); }
    return map;
  }, [edges]);

  const nodeById = useMemo(() => {
    const map: Record<string, Node<Record<string, unknown>>> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  function getNextNode(nodeId: string): string | null {
    return (edgesBySource[nodeId] || [])[0]?.target ?? null;
  }

  const processNodeRef = useRef<(nodeId: string) => Promise<void>>();
  processNodeRef.current = async function processNode(nodeId: string): Promise<void> {
    const node = nodeById[nodeId];
    if (!node) { setDone(true); return; }
    const d = node.data;
    const vars = varsRef.current;
    const interpolate = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

    switch (node.type) {
      case "start": {
        await sleep(200);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "say": {
        const text = interpolate(String(d.text || "..."));
        addMsg("bot", text);
        await sleep(400);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "gather": {
        const prompt = interpolate(String(d.prompt || ""));
        if (prompt) addMsg("bot", prompt);
        setAwaitingInput(true);
        setTimeout(() => inputRef.current?.focus(), 50);
        const userReply = await new Promise<string>((resolve) => { resumeRef.current = resolve; });
        addMsg("user", userReply);
        setAwaitingInput(false);
        // Store as "userInput" variable or detect variable from node data
        const saveVar = String(d.saveResponseTo || d.variableName || "userInput");
        varsRef.current = { ...varsRef.current, [saveVar]: userReply };
        await sleep(200);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "condition": {
        const variable = String(d.variable || "");
        const operator = String(d.operator || "equals");
        const value = String(d.value || "");
        const actual = varsRef.current[variable] ?? "";
        let matches = false;
        if (operator === "equals") matches = actual === value;
        else if (operator === "contains") matches = actual.toLowerCase().includes(value.toLowerCase());
        else if (operator === "startsWith") matches = actual.toLowerCase().startsWith(value.toLowerCase());
        else if (operator === "greaterThan") matches = Number(actual) > Number(value);
        else if (operator === "lessThan") matches = Number(actual) < Number(value);
        addMsg("system", `Condition: ${variable || "?"} ${operator} "${value}" → ${matches ? "✅ true" : "❌ false"}`);
        const outEdges = edgesBySource[nodeId] || [];
        let target = outEdges.find((e) => e.sourceHandle === (matches ? "true" : "false"))?.target;
        if (!target) target = outEdges[matches ? 0 : Math.min(1, outEdges.length - 1)]?.target;
        if (target) await processNodeRef.current!(target); else setDone(true);
        break;
      }
      case "setVariable": {
        const varName = String(d.variableName || "");
        const val = interpolate(String(d.value || ""));
        varsRef.current = { ...varsRef.current, [varName]: val };
        addMsg("system", `Set ${varName} = "${val}"`);
        await sleep(100);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "wait": {
        addMsg("system", `⏳ Wait ${d.duration ?? 1}s (simulated)`);
        await sleep(300);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "transfer": {
        addMsg("system", `📞 Transfer → ${d.destination || "?"} (simulated)`);
        setDone(true);
        break;
      }
      case "apiCall": {
        addMsg("system", `🌐 API ${d.method || "GET"} ${d.url || "?"} (simulated)`);
        await sleep(200);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "record": {
        addMsg("system", `🎙️ Recording (simulated)`);
        await sleep(200);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "scheduleCallback": {
        addMsg("system", `📅 Callback scheduled: "${interpolate(String(d.message || ""))}" (simulated)`);
        await sleep(200);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "updateLead": {
        addMsg("system", `📋 Lead status → "${d.status || "?"}" (simulated)`);
        await sleep(150);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "end": {
        const msg = interpolate(String(d.message || ""));
        if (msg) addMsg("bot", msg);
        addMsg("system", "📞 Call ended.");
        setDone(true);
        break;
      }
      default: {
        addMsg("system", `[${node.type}] (unsupported in simulation)`);
        const next = getNextNode(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
      }
    }
  };

  function startTest() {
    setStarted(true);
    setMessages([]);
    setDone(false);
    varsRef.current = {};
    const startNode = nodes.find((n) => n.type === "start");
    if (!startNode) { addMsg("system", "⚠️ No Start node found. Add a Start node to run the test."); setDone(true); return; }
    addMsg("system", "▶ Simulation started");
    processNodeRef.current!(startNode.id).catch((err) => {
      addMsg("system", `Error: ${err.message}`);
      setDone(true);
    });
  }

  function handleSend() {
    const val = userInput.trim();
    if (!val || !awaitingInput) return;
    setUserInput("");
    if (resumeRef.current) { resumeRef.current(val); resumeRef.current = null; }
  }

  // Auto-scroll to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="w-80 flex-shrink-0 bg-white border border-neutral-200 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-green-500" />
          <span className="text-sm font-semibold text-neutral-800">Live Test</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {!started && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <Play className="w-8 h-8 text-neutral-300" />
            <p className="text-xs text-neutral-400 text-center">Click Start to simulate the scenario flow interactively.</p>
            <button
              onClick={startTest}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Start Test
            </button>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "system" ? (
              <span className="text-xs text-neutral-400 italic px-2">{msg.text}</span>
            ) : (
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === "bot"
                    ? "bg-neutral-100 text-neutral-800 rounded-tl-none"
                    : "bg-[#F22F46] text-white rounded-tr-none"
                }`}
              >
                {msg.text}
              </div>
            )}
          </div>
        ))}
        {done && started && (
          <div className="flex justify-center">
            <button
              onClick={startTest}
              className="text-xs text-neutral-400 hover:text-neutral-600 underline mt-1"
            >
              Restart
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {started && !done && (
        <div className="border-t border-neutral-100 p-3 flex-shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              disabled={!awaitingInput}
              placeholder={awaitingInput ? "Type your response..." : "Waiting for bot..."}
              className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <button
              onClick={handleSend}
              disabled={!awaitingInput || !userInput.trim()}
              className="p-2 bg-[#F22F46] text-white rounded-lg hover:bg-[#d9243b] disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main editor ─────────────────────────────────────────────────────────
function ScenarioEdit() {
  const params = useSearchParams();
  const id = params.get("id") || "";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Record<string, unknown>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<Record<string, unknown>> | null>(null);
  const [showTest, setShowTest] = useState(false);
  const nodeIdCounter = useRef(Date.now());

  // Load scenario
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    scenariosGet(id)
      .then((data) => {
        setName(data.name || "");
        setDescription(data.description || "");
        // Ensure color is baked into node data for the custom node renderer
        const enriched = (data.nodes || []).map((n: ScenarioNode) => ({
          ...n,
          data: {
            ...n.data,
            label: NODE_TYPES_CONFIG[n.type]?.label || n.type,
            color: NODE_TYPES_CONFIG[n.type]?.color || "#999",
          },
        }));
        setNodes(enriched as Node<Record<string, unknown>>[]);
        setEdges((data.edges || []) as Edge[]);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load scenario"))
      .finally(() => setLoading(false));
  }, [id, setNodes, setEdges]);

  // Add node from palette
  const addNode = useCallback((type: string) => {
    const cfg = NODE_TYPES_CONFIG[type];
    if (!cfg) return;
    const newId = `${type}-${++nodeIdCounter.current}`;
    const newNode: Node<Record<string, unknown>> = {
      id: newId,
      type,
      position: { x: 150 + Math.random() * 250, y: 150 + Math.random() * 200 },
      data: { ...cfg.defaultData, label: cfg.label, color: cfg.color },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  // Connect nodes
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  // Select node
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<Record<string, unknown>>) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // Update node data from properties panel
  const updateNodeData = useCallback((key: string, value: unknown) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id ? { ...n, data: { ...n.data, [key]: value } } : n,
      ),
    );
    setSelectedNode((prev) =>
      prev ? { ...prev, data: { ...prev.data, [key]: value } } : null,
    );
  }, [selectedNode, setNodes]);

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  // Save
  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError("Scenario name is required"); return; }
    setSaving(true);
    setError("");
    try {
      // Strip display-only fields (label, color) from node data before saving
      const cleanNodes = nodes.map((n) => {
        const { label: _l, color: _c, ...rest } = n.data;
        void _l; void _c;
        return { id: n.id, type: n.type || "say", position: n.position, data: rest };
      });
      const cleanEdges = edges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        animated: e.animated,
      }));
      await scenariosUpdate({ id, name, description, nodes: cleanNodes, edges: cleanEdges });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [id, name, description, nodes, edges]);

  if (loading) return <div className="p-8 text-center text-neutral-400 text-sm">Loading scenario...</div>;
  if (!id) return (
    <div className="p-8 text-center">
      <p className="text-neutral-400 text-sm">No scenario ID provided.</p>
      <Link href="/scenarios" className="text-[#0066CC] text-sm hover:underline mt-2 inline-block">← Back to scenarios</Link>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <Link href="/scenarios" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
          Scenarios
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Scenario name"
            className="text-base font-semibold text-neutral-900 border-0 border-b border-transparent hover:border-neutral-300 focus:border-[#F22F46] focus:outline-none px-1 py-0.5 bg-transparent min-w-0 flex-shrink"
            style={{ width: Math.max(180, name.length * 9 + 20) }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="text-sm text-neutral-500 border-0 border-b border-transparent hover:border-neutral-300 focus:border-neutral-400 focus:outline-none px-1 py-0.5 bg-transparent flex-1 min-w-0"
          />
        </div>
        <button
          onClick={() => setShowTest((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            showTest ? "bg-green-600 text-white" : "bg-green-500 hover:bg-green-600 text-white"
          }`}
        >
          <Play className="w-4 h-4" />
          {showTest ? "Close Test" : "Test"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            saved ? "bg-green-500 text-white" : "bg-[#F22F46] hover:bg-[#d9243b] text-white"
          } disabled:opacity-60`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex-shrink-0">{error}</div>
      )}

      {/* 3-column editor */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Node Palette */}
        <div className="w-44 flex-shrink-0 bg-white border border-neutral-200 rounded-xl p-3 overflow-y-auto">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Add Node</p>
          <div className="space-y-1">
            {Object.entries(NODE_TYPES_CONFIG).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-50 text-left transition-colors group"
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                <span className="text-xs font-medium text-neutral-700 group-hover:text-neutral-900 leading-tight">{cfg.label}</span>
                <Plus className="w-3 h-3 text-neutral-300 group-hover:text-neutral-500 ml-auto flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* ReactFlow Canvas */}
        <div className="flex-1 bg-white border border-neutral-200 rounded-xl overflow-hidden min-w-0">
          {typeof window !== "undefined" && ReactFlow && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={RF_NODE_TYPES}
              fitView
              deleteKeyCode="Delete"
            >
              {Background && <Background />}
              {Controls && <Controls />}
              {MiniMap && <MiniMap />}
            </ReactFlow>
          )}
        </div>

        {/* Live Test Panel or Properties Panel */}
        {showTest ? (
          <LiveTestPanel nodes={nodes} edges={edges} onClose={() => setShowTest(false)} />
        ) : selectedNode ? (
          <div className="w-60 flex-shrink-0 bg-white border border-neutral-200 rounded-xl p-4 overflow-y-auto">
            <PropertiesPanel
              node={selectedNode as Node}
              onUpdate={updateNodeData}
              onDelete={deleteSelectedNode}
            />
          </div>
        ) : (
          <div className="w-60 flex-shrink-0 bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-center">
            <p className="text-xs text-neutral-400 text-center">Click a node to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScenarioEditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>}>
      <ScenarioEdit />
    </Suspense>
  );
}
