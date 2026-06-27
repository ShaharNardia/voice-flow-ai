"use client";

/**
 * AI Scenario Wizard
 * Conversational interview → GPT generates a professional scenario → preview & save.
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft, ArrowRight, Bot, Check, GitBranch, Loader2,
  Play, RefreshCw, Send, Sparkles, User,
} from "lucide-react";
const ScenarioPhoneSimulator = dynamic(
  () => import("../edit/_components/shared/ScenarioPhoneSimulator"),
  { ssr: false }
);
import {
  scenarioWizardChat, scenarioWizardGenerate, scenariosCreate,
  type WizardMessage, type WizardGenerateResponse,
} from "@/lib/firebase-functions";
import { MarkerType, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";
import { NODE_TYPES_CONFIG, getOutputHandles } from "../edit/_lib/node-config";
import { Handle, Position, type NodeProps } from "reactflow";

// ── Dynamic React Flow ────────────────────────────────────────────────────────
const ReactFlow  = dynamic(() => import("reactflow").then(m => m.default), { ssr: false });
const Background = dynamic(() => import("reactflow").then(m => m.Background), { ssr: false });
const Controls   = dynamic(() => import("reactflow").then(m => m.Controls),  { ssr: false });
const MiniMap    = dynamic(() => import("reactflow").then(m => m.MiniMap),   { ssr: false });

// ── Preview node (read-only, full-color) ─────────────────────────────────────
function PreviewNode({ data, type }: NodeProps) {
  const typeKey = type || "say";
  const cfg = NODE_TYPES_CONFIG[typeKey];
  const color = (data.color as string) || cfg?.color || "#999";
  const label = (data.label as string) || cfg?.label || typeKey;
  const preview = String(data.text || data.prompt || data.message || data.url || data.destination || "").slice(0, 40);
  const outputHandles = getOutputHandles(typeKey, data as Record<string, unknown>);
  const isMultiOut = outputHandles.length > 1 || (outputHandles.length === 1 && outputHandles[0].id !== "default");

  return (
    <div>
      <div style={{
        width: 180,
        background: "white",
        borderRadius: 12,
        border: "1.5px solid #E2E8F0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        position: "relative",
        overflow: "hidden",
        cursor: "default",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: color, borderRadius: "12px 0 0 12px" }} />
        <Handle type="target" position={Position.Top} style={{ background: "white", border: `2px solid ${color}`, width: 8, height: 8 }} />
        <div style={{ padding: "10px 12px 10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {cfg?.label?.[0] || "?"}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          </div>
          {preview && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 148 }}>{preview}</div>}
        </div>
        {outputHandles.map((handle, i) => {
          const count = outputHandles.length;
          const leftPct = count === 1 ? 50 : ((i + 1) * 100) / (count + 1);
          return (
            <React.Fragment key={handle.id}>
              <Handle type="source" position={Position.Bottom} id={handle.id} style={{ left: `${leftPct}%`, background: "white", border: `2px solid ${color}`, width: 8, height: 8 }} />
              {isMultiOut && handle.label && (
                <div style={{ position: "absolute", bottom: -18, left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 9, fontWeight: 500, color: "#64748B", whiteSpace: "nowrap", pointerEvents: "none", background: "rgba(255,255,255,0.95)", padding: "1px 4px", borderRadius: 3 }}>
                  {handle.label}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const RF_NODE_TYPES: Record<string, React.ComponentType<NodeProps>> = {};
for (const key of Object.keys(NODE_TYPES_CONFIG)) RF_NODE_TYPES[key] = PreviewNode;

// ── Helper: build React Flow nodes/edges from scenario data ──────────────────
function buildRfGraph(data: WizardGenerateResponse): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = data.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    draggable: false,
    selectable: false,
    connectable: false,
    data: {
      ...n.data,
      label: (n.data as Record<string,unknown>).label || NODE_TYPES_CONFIG[n.type]?.label || n.type,
      color: NODE_TYPES_CONFIG[n.type]?.color || "#999",
    },
  }));
  const edges: Edge[] = (data.edges || []).map(e => ({
    id: e.id ?? `edge-${Math.random().toString(36).slice(2)}`,
    source: e.source,
    target: e.target,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sourceHandle: (e as any).sourceHandle as string | undefined,
    type: "default",
    style: { stroke: "#94A3B8", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8", width: 14, height: 14 },
  }));
  return { nodes, edges };
}

// ── Phase types ───────────────────────────────────────────────────────────────
type Phase = "interview" | "generating" | "preview";

const GENERATING_MESSAGES = [
  "Analysing your requirements…",
  "Designing the call flow…",
  "Building branches and conditions…",
  "Writing professional scripts…",
  "Finalising the scenario…",
];

// ── Main component ────────────────────────────────────────────────────────────
export default function ScenarioWizardPage() {
  const router = useRouter();

  // Phase
  const [phase, setPhase] = useState<Phase>("interview");

  // Chat
  const [messages, setMessages] = useState<WizardMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [summary, setSummary] = useState<Record<string, string> | undefined>();
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generation
  const [genMsgIdx, setGenMsgIdx] = useState(0);
  const [genError, setGenError] = useState("");

  // Preview
  const [scenario, setScenario] = useState<WizardGenerateResponse | null>(null);
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showSim, setShowSim] = useState(false);

  // ── Boot: first AI question ──────────────────────────────────────────────
  useEffect(() => {
    askNext([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Cycle generating messages ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "generating") return;
    const timer = setInterval(() => setGenMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length), 1800);
    return () => clearInterval(timer);
  }, [phase]);

  // ── Chat helpers ──────────────────────────────────────────────────────────
  async function askNext(history: WizardMessage[]) {
    setSending(true);
    setChatError("");
    try {
      const res = await scenarioWizardChat(history);
      const updated: WizardMessage[] = [...history, { role: "assistant", content: res.message }];
      setMessages(updated);
      if (res.ready) {
        setSummary(res.summary);
        setReadyToGenerate(true);
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Connection error — please try again");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const updated: WizardMessage[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    if (readyToGenerate) return; // already done interviewing
    await askNext(updated);
  }

  // ── Generation ────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setPhase("generating");
    setGenError("");
    try {
      const result = await scenarioWizardGenerate(messages, summary);
      const { nodes, edges } = buildRfGraph(result);
      setScenario(result);
      setRfNodes(nodes);
      setRfEdges(edges);
      setPhase("preview");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed — please try again");
      setPhase("interview"); // go back so they can retry
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!scenario) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await scenariosCreate({
        name: scenario.name,
        description: scenario.description,
        nodes: scenario.nodes,
        edges: scenario.edges,
      });
      router.push(`/scenarios/edit?id=${result.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link href="/scenarios" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Scenarios
      </Link>

      {/* ── INTERVIEW PHASE ── */}
      {phase === "interview" && (
        <div className="flex flex-col" style={{ height: "calc(100vh - 160px)", minHeight: 520 }}>
          {/* Header */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-neutral-900">AI Scenario Designer</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Answer a few questions — I&apos;ll build a professional call flow for you.</p>
            </div>
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${
                  i === 0 ? "bg-violet-500 scale-110" :
                  readyToGenerate ? "bg-violet-500" : "bg-neutral-200"
                }`} />
              ))}
            </div>
          </div>

          {/* Chat bubbles */}
          <div className="flex-1 overflow-y-auto space-y-4 px-1 pb-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "assistant"
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                    : "bg-neutral-100"
                }`}>
                  {msg.role === "assistant"
                    ? <Bot className="w-4 h-4 text-white" />
                    : <User className="w-4 h-4 text-neutral-500" />
                  }
                </div>
                {/* Bubble */}
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-white border border-neutral-200 text-neutral-800 rounded-tl-sm shadow-sm"
                    : "bg-violet-600 text-white rounded-tr-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-neutral-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Ready to generate banner */}
            {readyToGenerate && !sending && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">I have everything I need!</p>
                  <p className="text-xs text-green-600 mt-0.5">Click &quot;Generate Scenario&quot; to build your call flow.</p>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Error */}
          {(chatError || genError) && (
            <div className="mt-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
              <span>{chatError || genError}</span>
              <button onClick={() => { setChatError(""); setGenError(""); }} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* Input bar */}
          <div className="mt-3 flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={sending || readyToGenerate}
              placeholder={readyToGenerate ? "Ready to generate! ↓" : "Type your answer…"}
              className="flex-1 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            {!readyToGenerate ? (
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="w-12 h-12 flex items-center justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all shadow-md hover:shadow-lg whitespace-nowrap flex-shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                Generate Scenario
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Skip hint */}
          {messages.length >= 3 && !readyToGenerate && !sending && (
            <p className="text-center text-[11px] text-neutral-400 mt-2">
              Have enough? {" "}
              <button
                onClick={() => { setReadyToGenerate(true); }}
                className="text-violet-500 hover:underline font-medium"
              >
                Skip to generation →
              </button>
            </p>
          )}
        </div>
      )}

      {/* ── GENERATING PHASE ── */}
      {phase === "generating" && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl">
              <Sparkles className="w-9 h-9 text-white" />
            </div>
            <div className="absolute -inset-2 rounded-2xl border-2 border-violet-300 animate-ping opacity-30" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-neutral-800 mb-1">Building your scenario…</h3>
            <p className="text-sm text-neutral-500 transition-all duration-500">{GENERATING_MESSAGES[genMsgIdx]}</p>
          </div>
          <div className="flex gap-1.5">
            {GENERATING_MESSAGES.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === genMsgIdx ? "w-6 bg-violet-500" : "w-2 bg-neutral-200"}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── PREVIEW PHASE ── */}
      {phase === "preview" && scenario && (
        <div>
          {/* Success header */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-5 mb-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-neutral-900">{scenario.name}</h2>
              {scenario.description && <p className="text-sm text-neutral-500 mt-0.5">{scenario.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {scenario.nodes.length} nodes
                </span>
                <span>{scenario.edges.length} connections</span>
              </div>
            </div>
            <button
              onClick={() => { setPhase("interview"); setReadyToGenerate(true); }}
              title="Regenerate"
              className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 bg-white border border-violet-200 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          </div>

          {/* React Flow preview */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-5" style={{ height: 460 }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={RF_NODE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              panOnScroll
              zoomOnScroll
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#E2E8F0" gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={n => {
                  const cfg = NODE_TYPES_CONFIG[n.type as string];
                  return cfg?.color || "#94A3B8";
                }}
                maskColor="rgba(255,255,255,0.7)"
                style={{ borderRadius: 8 }}
              />
            </ReactFlow>
          </div>

          {/* Node summary chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            {scenario.nodes.map(n => {
              const cfg = NODE_TYPES_CONFIG[n.type];
              return (
                <span key={n.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: cfg?.color || "#94A3B8" }}>
                  {cfg?.label || n.type}
                </span>
              );
            })}
          </div>

          {/* Error */}
          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{saveError}</div>
          )}

          {/* CTA */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowSim(true)}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all shadow-md"
              title="Test in phone simulator"
            >
              <Play className="w-4 h-4" />
              Test
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition-all shadow-md"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save & Open in Editor"}
            </button>
            <Link
              href="/scenarios"
              className="px-5 py-3 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-xl transition-colors"
            >
              Cancel
            </Link>
          </div>
          <p className="text-center text-xs text-neutral-400 mt-3">
            You can edit every node and connection in the visual editor after saving.
          </p>

          {/* Phone simulator (uses generated nodes/edges directly — no save needed) */}
          {showSim && scenario && (
            <ScenarioPhoneSimulator
              scenarioId="preview"
              scenarioName={scenario.name}
              nodes={scenario.nodes as any}
              edges={scenario.edges as any}
              onClose={() => setShowSim(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
