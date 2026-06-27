"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PromptCoach } from "@/components/PromptCoach";
import CallDiagnostics from "@/components/CallDiagnostics";
import CallReplay from "@/components/CallReplay";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDate, formatPhone } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowLeft, Bot, User, PhoneIncoming, PhoneOutgoing, Clock, Hash, Mic,
  Brain, TrendingUp, ThumbsUp, Lightbulb, RotateCcw, Zap, Loader2, GitBranch,
  DollarSign, Activity, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight,
  Wrench, Radio, Timer, Copy, Check,
} from "lucide-react";
import { analyzeCall, CallAnalysis, adminGetCallTelemetry, CallTelemetryData } from "@/lib/firebase-functions";
import ExecutionTrace from "../../scenarios/edit/_components/shared/ExecutionTrace";
import ScenarioFlowReplay from "../../scenarios/edit/_components/shared/ScenarioFlowReplay";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  role: "user" | "assistant" | "tool";
  content?: string;
  // Tool-call entries (role === "tool") carry these extra fields
  name?: string;
  args?: Record<string, unknown>;
  result?: string;
  request?: string;        // resolved HTTP request, e.g. "GET https://api…/510/he/false"
  httpStatus?: number | null;
  responseBody?: string | null;  // raw API response (truncated server-side)
  timestamp?: { toDate?: () => Date } | string | Date;
  ts?: string;   // legacy field name written by older Gemini path; UI reads both
}

interface Recording {
  sid: string;
  url: string;
  transcription?: string;
  timestamp?: string;
}

interface CostBreakdown {
  twilio?: { minutes?: number; cost?: number };
  llm?: { promptTokens?: number; completionTokens?: number; turns?: number; cost?: number };
  stt?: { minutes?: number; cost?: number };
  tts?: { characters?: number; provider?: string; cost?: number };
  realtime?: { inputMinutes?: number; outputMinutes?: number; cost?: number };
  // Generic per-provider breakdown written by the Gemini Live close handler:
  // [{ provider: "gemini-live", label: "Gemini (...)", cost, detail }, ...]
  breakdown?: Array<{ provider?: string; label?: string; cost?: number; detail?: string }>;
  // Gemini-specific top-level fields (mirror the OpenAI/realtime shape so the
  // call detail page can show input/output split).
  provider?: string;        // "gemini-live" | "openai-realtime" | "classic"
  model?: string;
  inputCost?: number;
  outputCost?: number;
  twilioCost?: number;
  geminiCost?: number;
  durationSec?: number;
  totalCost?: number;
  customerCharge?: number;
  pricingModel?: string;
  pricingValue?: number;
  currency?: string;
  mode?: string;
}

interface CallSession {
  id?: string;
  leadNumber?: string;
  status: string;
  callType?: "inbound" | "outbound";
  duration?: number;
  twilioSid?: string;
  scenarioId?: string;
  executionLog?: Array<{
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    timestamp: string;
    output: Record<string, unknown> | null;
  }>;
  createdAt?: { toDate: () => Date };
  assistantId?: string;
  assistantDefinition?: { name?: string; language?: string; systemPrompt?: string };
  assistantName?: string;
  conversationHistory?: Message[];
  recordings?: Recording[];
  analysis?: CallAnalysis;
  costs?: CostBreakdown;
  // NLPearl-sourced calls populate these:
  telephonyProvider?: string;
  transcriptText?: string;
  nlpearlCallId?: string;
  nlpearlPearlId?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "in-progress": "bg-green-100 text-green-700",
    completed: "bg-neutral-100 text-neutral-600",
    failed: "bg-red-100 text-red-700",
    initiated: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-neutral-100 text-neutral-500"}`}>
      {status === "in-progress" ? "Live" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { color: string; label: string }> = {
    success: { color: "bg-green-100 text-green-700", label: "✓ Success" },
    partial: { color: "bg-yellow-100 text-yellow-700", label: "◑ Partial" },
    failed: { color: "bg-red-100 text-red-700", label: "✗ Failed" },
    no_answer: { color: "bg-neutral-100 text-neutral-500", label: "— No Answer" },
    unknown: { color: "bg-neutral-100 text-neutral-500", label: "? Unknown" },
  };
  const { color, label } = map[outcome] || map.unknown;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { color: string; emoji: string }> = {
    positive: { color: "bg-green-50 text-green-600", emoji: "😊" },
    neutral: { color: "bg-neutral-50 text-neutral-500", emoji: "😐" },
    negative: { color: "bg-red-50 text-red-600", emoji: "😞" },
    frustrated: { color: "bg-orange-50 text-orange-600", emoji: "😤" },
  };
  const { color, emoji } = map[sentiment] || map.neutral;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{emoji} {sentiment}</span>;
}

// ── Super-admin Telemetry Panel ───────────────────────────────────────────────

function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

function HealthBadge({ health }: { health: string }) {
  const cls = health === "good" ? "bg-green-50 text-green-700 border-green-200"
    : health === "warn" ? "bg-yellow-50 text-yellow-700 border-yellow-200"
    : "bg-red-50 text-red-700 border-red-200";
  const Icon = health === "good" ? CheckCircle : health === "warn" ? AlertTriangle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" />
      {health.toUpperCase()}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
      <div className="text-xs text-neutral-400 font-medium mb-1">{label}</div>
      <div className="text-lg font-bold text-neutral-900 tabular-nums leading-none">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Prompt generator ─────────────────────────────────────────────────────────
// Analyses telemetry data and produces a ready-to-paste Claude Code prompt
// describing every detected issue with precise metric values.
function generateFixPrompt(tel: CallTelemetryData): string | null {
  const ins = tel.insights;
  if (ins.health === "good") return null;

  const issues: string[] = [];
  const metrics: string[] = [];

  if (ins.greetingLatencyMs != null && ins.greetingLatencyMs > 3000) {
    issues.push("Slow greeting — caller waits too long before the bot speaks");
    metrics.push(`• Greeting latency: ${ms(ins.greetingLatencyMs)} (target < 3 000 ms)`);
  }
  if (ins.p95TurnLatencyMs != null && ins.p95TurnLatencyMs > 5000) {
    issues.push("High P95 turn latency — occasional severe lag spikes");
    metrics.push(`• P95 turn latency: ${ms(ins.p95TurnLatencyMs)} (target < 5 000 ms)`);
  }
  if (ins.avgTurnLatencyMs != null && ins.avgTurnLatencyMs > 3000) {
    issues.push("Consistently slow responses — avg turn latency above acceptable threshold");
    metrics.push(`• Avg turn latency: ${ms(ins.avgTurnLatencyMs)} (target < 3 000 ms)`);
  }
  if (ins.bargeInRate != null && ins.bargeInRate > 0.4) {
    issues.push("High barge-in rate — caller is frequently interrupting the bot mid-response, indicating responses are too long or VAD is too aggressive");
    metrics.push(`• Barge-in rate: ${(ins.bargeInRate * 100).toFixed(0)}% of turns (target < 40%)`);
  }
  if (tel.stallCount > 2) {
    issues.push("Repeated stalls — bot stopped producing audio mid-response multiple times");
    metrics.push(`• Stall count: ${tel.stallCount}`);
  }
  if (tel.truncationCount > 2) {
    issues.push("Repeated truncations — responses are hitting the max token limit and being cut off");
    metrics.push(`• Truncation count: ${tel.truncationCount}`);
  }
  if (ins.toolCallSuccessRate != null && ins.toolCallSuccessRate < 0.8) {
    const failed = Array.from(new Set(tel.toolCalls.filter(tc => !tc.success).map(tc => tc.name)));
    issues.push(`Tool call failures — ${(100 - ins.toolCallSuccessRate * 100).toFixed(0)}% of tool calls are failing`);
    metrics.push(`• Tool success rate: ${(ins.toolCallSuccessRate * 100).toFixed(0)}% (target > 80%)`);
    if (failed.length) metrics.push(`• Failing tools: ${failed.join(", ")}`);
  }
  if (tel.errorCount > 0) {
    const errorCodes = Array.from(new Set(tel.errors.map(e => e.code)));
    issues.push(`Runtime errors — ${tel.errorCount} error${tel.errorCount > 1 ? "s" : ""} recorded during the call`);
    metrics.push(`• Error count: ${tel.errorCount}`);
    metrics.push(`• Error codes: ${errorCodes.join(", ")}`);
    tel.errors.slice(0, 3).forEach(e => metrics.push(`  – ${e.code}: ${e.msg}`));
  }
  if (tel.mode === "standard") {
    if (ins.avgSttMs != null && ins.avgSttMs > 800) {
      issues.push("High STT latency — Deepgram transcription is slow");
      metrics.push(`• Avg STT (Deepgram): ${ms(ins.avgSttMs)} (target < 800 ms)`);
    }
    if (ins.avgLlmMs != null && ins.avgLlmMs > 2000) {
      issues.push("High LLM latency — GPT inference is slow, likely due to prompt length or model tier");
      metrics.push(`• Avg LLM: ${ms(ins.avgLlmMs)} (target < 2 000 ms)`);
    }
    if (ins.avgTtsMs != null && ins.avgTtsMs > 1000) {
      issues.push("High TTS latency — speech synthesis is slow");
      metrics.push(`• Avg TTS: ${ms(ins.avgTtsMs)} (target < 1 000 ms)`);
    }
  }

  if (issues.length === 0) return null;

  const mode = tel.mode === "realtime" ? "OpenAI Realtime V2V" : "Standard (Deepgram STT → GPT LLM → TTS)";
  const focusAreas = tel.mode === "realtime"
    ? [
        "– `cloud-run/mediastream/realtime_bridge.js`: VAD config, session keepalive, audio buffer handling",
        "– `cloud-run/mediastream/index.js` (RT handler): instruction length, session init payload, tool call handling",
        "– Check `realtimeVadMode` setting — semantic_vad is preferred for Hebrew/Arabic; server_vad for English only",
      ]
    : [
        "– `cloud-run/mediastream/index.js` (standard handler): Deepgram connection, OpenAI prompt, TTS provider config",
        "– Check STT language code matches assistant language",
        "– Check LLM model tier and prompt token count — trim KB injection if oversized",
      ];

  return [
    `## Call Performance Issues — Action Required`,
    ``,
    `**Call session ID:** \`${tel.callSessionId}\``,
    `**Mode:** ${mode}`,
    `**Language:** ${tel.language || "unknown"} · **Voice:** ${tel.voice || "unknown"}`,
    `**Health:** ${ins.health.toUpperCase()} · **Turns:** ${tel.turnCount}`,
    ``,
    `---`,
    ``,
    `### Issues Detected (${issues.length})`,
    issues.map((iss, i) => `${i + 1}. ${iss}`).join("\n"),
    ``,
    `### Measured Metrics`,
    metrics.join("\n"),
    ``,
    `---`,
    ``,
    `### What to Fix`,
    `Please investigate and resolve the issues above. Focus areas:`,
    focusAreas.join("\n"),
    ``,
    `Additional checks:`,
    `- Verify no unhandled promise rejections in the WS close handler`,
    `- Confirm tool error responses return a string (not throw) so the model can recover`,
    `- If barge-in rate is high: shorten system prompt rules, enforce one-sentence replies more strictly`,
    `- If stalls: check OpenAI Realtime session \`max_response_output_tokens\` and heartbeat interval`,
    ``,
    `**Repo:** \`voice-flow-ai\` · **Cloud Run service:** \`mediastream\``,
    `**Deploy after fix:** \`gcloud builds submit --tag gcr.io/voiceflow-ai-202509231639/mediastream cloud-run/mediastream && gcloud run deploy mediastream --image gcr.io/voiceflow-ai-202509231639/mediastream:latest --region us-central1\``,
  ].join("\n");
}

function TelemetryPanel({ tel }: { tel: CallTelemetryData }) {
  const ins = tel.insights;
  const [showEvents, setShowEvents] = useState(false);
  const [copied, setCopied] = useState(false);

  // Format milestone offset
  const m = (k: string) => tel.milestones[k] != null ? ms(tel.milestones[k]) : "—";

  // Latency bar (relative to p95)
  const maxBar = ins.p95TurnLatencyMs || 1;
  const barColor = (v: number | null) => {
    if (v == null) return "bg-neutral-200";
    if (v > 5000) return "bg-red-400";
    if (v > 2500) return "bg-yellow-400";
    return "bg-green-400";
  };

  return (
    <div className="p-5 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HealthBadge health={ins.health} />
          <span className="text-xs text-neutral-500">
            {tel.mode === "realtime" ? "🎙 Realtime (V2V)" : "📡 Standard (STT→LLM→TTS)"} ·{" "}
            {tel.language || "—"} · {tel.voice || "—"}
          </span>
        </div>
        <span className="text-xs text-neutral-400 font-mono">{tel.callSessionId}</span>
      </div>

      {/* Performance summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Turns" value={String(tel.turnCount)} />
        <StatCard label="Avg turn latency" value={ms(ins.avgTurnLatencyMs)} sub={`P50 ${ms(ins.p50TurnLatencyMs)} · P95 ${ms(ins.p95TurnLatencyMs)}`} />
        <StatCard label="Greeting latency" value={ms(ins.greetingLatencyMs)} sub="WS open → first bot audio" />
        <StatCard label="Setup latency" value={ms(ins.setupLatencyMs)} sub="WS open → bridge/Deepgram ready" />
      </div>

      {/* Stage breakdown (standard mode only) */}
      {tel.mode === "standard" && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Avg STT latency" value={ms(ins.avgSttMs)} sub="Deepgram" />
          <StatCard label="Avg LLM latency" value={ms(ins.avgLlmMs)} sub="GPT-4o-mini" />
          <StatCard label="Avg TTS latency" value={ms(ins.avgTtsMs)} sub="Google / OpenAI" />
        </div>
      )}

      {/* Reliability row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Barge-ins" value={String(tel.bargeInCount)}
          sub={ins.bargeInRate != null ? `${(ins.bargeInRate * 100).toFixed(0)}% of turns` : ""} />
        <StatCard label="Stalls" value={String(tel.stallCount)} />
        <StatCard label="Truncations" value={String(tel.truncationCount)} />
        <StatCard label="Errors" value={String(tel.errorCount)} />
      </div>

      {/* Audio packets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Audio in" value={tel.audioPacketsIn.toLocaleString()} sub="packets from caller" />
        <StatCard label="Audio out" value={tel.audioPacketsOut.toLocaleString()} sub="packets to caller" />
        <StatCard label="Tool calls" value={String(tel.toolCallCount)}
          sub={ins.toolCallSuccessRate != null ? `${(ins.toolCallSuccessRate * 100).toFixed(0)}% success` : ""} />
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
          <div className="text-xs text-neutral-400 font-medium mb-1">Stream latency</div>
          <div className="text-sm font-bold text-neutral-900">{m("streamStarted")}</div>
          <div className="text-xs text-neutral-400 mt-0.5">WS open → first media</div>
        </div>
      </div>

      {/* Per-turn breakdown table */}
      {tel.turns.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" />Per-turn breakdown
          </h3>
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">#</th>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">User</th>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">Bot</th>
                  {tel.mode === "standard" && <>
                    <th className="text-right px-3 py-2 text-neutral-400 font-medium">STT</th>
                    <th className="text-right px-3 py-2 text-neutral-400 font-medium">LLM</th>
                  </>}
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">Total</th>
                  <th className="text-center px-3 py-2 text-neutral-400 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tel.turns.map((t) => (
                  <tr key={t.i} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-neutral-500">{t.i + 1}</td>
                    <td className="px-3 py-2 text-neutral-600 max-w-[120px] truncate" title={t.user}>{t.user || "—"}</td>
                    <td className="px-3 py-2 text-neutral-600 max-w-[140px] truncate" title={t.bot}>{t.bot || "—"}</td>
                    {tel.mode === "standard" && <>
                      <td className="px-3 py-2 text-right font-mono text-neutral-500">{ms(t.sttMs ?? null)}</td>
                      <td className="px-3 py-2 text-right font-mono text-neutral-500">{ms(t.llmMs ?? null)}</td>
                    </>}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor(t.totalMs ?? null)}`}
                            style={{ width: `${Math.min(100, ((t.totalMs || 0) / maxBar) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-neutral-700 w-14 text-right">{ms(t.totalMs ?? null)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {t.bargedIn && <span title="Barged in" className="text-orange-400">⚡</span>}
                        {t.tools.length > 0 && <span title={t.tools.join(", ")} className="text-indigo-400 flex items-center"><Wrench className="w-3 h-3" /></span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tool call log */}
      {tel.toolCalls.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />Tool calls
          </h3>
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">Tool</th>
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">Latency</th>
                  <th className="text-right px-3 py-2 text-neutral-400 font-medium">Result size</th>
                  <th className="text-center px-3 py-2 text-neutral-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tel.toolCalls.map((tc, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 font-mono text-neutral-700">{tc.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-500">{ms(tc.latencyMs)}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{tc.resultLen} chars</td>
                    <td className="px-3 py-2 text-center">
                      {tc.success
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors */}
      {tel.errors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />Errors ({tel.errors.length})
          </h3>
          <div className="space-y-1.5">
            {tel.errors.map((e, i) => (
              <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
                <span className="font-mono text-red-400 shrink-0">+{ms(e.t)}</span>
                <span className="font-semibold text-red-600">{e.code}</span>
                <span className="text-red-500">{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event timeline (collapsible) */}
      <div>
        <button
          className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 hover:text-neutral-700 transition-colors"
          onClick={() => setShowEvents(v => !v)}
        >
          <Radio className="w-3.5 h-3.5" />
          Event timeline ({tel.events.length} events)
          {showEvents ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showEvents && (
          <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">+ms</th>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">Event</th>
                  <th className="text-left px-3 py-2 text-neutral-400 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tel.events.map((ev, i) => (
                  <tr key={i} className={`hover:bg-neutral-50 ${ev.e === "error" ? "bg-red-50" : ev.e === "barge_in" ? "bg-orange-50" : ""}`}>
                    <td className="px-3 py-1.5 font-mono text-neutral-400 shrink-0">{ms(ev.t)}</td>
                    <td className="px-3 py-1.5 font-mono text-neutral-700 font-medium">{ev.e}</td>
                    <td className="px-3 py-1.5 text-neutral-500 max-w-xs truncate">
                      {ev.d ? JSON.stringify(ev.d).slice(0, 80) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Suggested Fix Prompt ─────────────────────────────────────────── */}
      {(() => {
        const prompt = generateFixPrompt(tel);
        if (!prompt) return null;
        const handleCopy = () => {
          navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          });
        };
        return (
          <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-800">Suggested Fix Prompt</span>
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  Paste into Claude Code
                </span>
              </div>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  copied
                    ? "bg-green-100 border-green-300 text-green-700"
                    : "bg-white border-amber-300 text-amber-700 hover:bg-amber-100"
                }`}
              >
                {copied
                  ? <><Check className="w-3.5 h-3.5" />Copied!</>
                  : <><Copy className="w-3.5 h-3.5" />Copy prompt</>}
              </button>
            </div>
            <pre className="p-4 text-xs text-amber-900 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {prompt}
            </pre>
          </div>
        );
      })()}
    </div>
  );
}

function CostBreakdownCard({ costs }: { costs: CostBreakdown }) {
  const curr = costs.currency || "USD";
  const fmt = (n: number | undefined) => {
    if (n == null) return "—";
    const s = n.toFixed(n < 0.01 ? 6 : n < 1 ? 4 : 2);
    return curr === "USD" ? `$${s}` : `${s} ${curr}`;
  };
  const rows: Array<{ label: string; detail?: string; cost?: number }> = [];

  // New: generic per-provider breakdown — written by handleGeminiSession.
  // Each entry is already a {label, detail, cost} row so just spread it in.
  if (Array.isArray(costs.breakdown) && costs.breakdown.length > 0) {
    for (const b of costs.breakdown) {
      rows.push({
        label:  b.label || b.provider || "(unnamed)",
        detail: b.detail,
        cost:   typeof b.cost === "number" ? b.cost : undefined,
      });
    }
  }

  // Legacy/structured fields (OpenAI Realtime + Classic). Only include if NOT
  // already covered by breakdown to avoid double-counting.
  const hasBreakdown = rows.length > 0;
  if (!hasBreakdown) {
    if (costs.twilio?.cost != null) rows.push({ label: "Twilio (call minutes)", detail: `${costs.twilio.minutes?.toFixed(2) ?? "?"} min`, cost: costs.twilio.cost });
    if (costs.realtime?.cost != null) rows.push({ label: "OpenAI Realtime (voice-to-voice)", detail: `in ${costs.realtime.inputMinutes?.toFixed(2) ?? 0}m / out ${costs.realtime.outputMinutes?.toFixed(2) ?? 0}m`, cost: costs.realtime.cost });
    if (costs.llm?.cost) rows.push({ label: "LLM (OpenAI)", detail: `${(costs.llm.promptTokens ?? 0) + (costs.llm.completionTokens ?? 0)} tokens · ${costs.llm.turns ?? 0} turns`, cost: costs.llm.cost });
    if (costs.stt?.cost) rows.push({ label: "STT (Deepgram)", detail: `${costs.stt.minutes?.toFixed(2) ?? "?"} min`, cost: costs.stt.cost });
    if (costs.tts?.cost) rows.push({ label: `TTS (${costs.tts.provider || "?"})`, detail: `${costs.tts.characters ?? 0} chars`, cost: costs.tts.cost });
  }

  const total = costs.totalCost ?? 0;
  const charge = costs.customerCharge ?? 0;
  const profit = charge - total;
  const markupText = costs.pricingModel === "markup"
    ? `${costs.pricingValue ?? 0}% markup`
    : costs.pricingModel === "fixed"
      ? `$${costs.pricingValue ?? 0}/min flat`
      : "";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mt-4">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-neutral-800 text-sm">Cost Breakdown</h2>
          {costs.mode === "realtime" && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">REALTIME</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-400">Total cost</div>
          <div className="text-lg font-bold text-neutral-900">{fmt(total)}</div>
        </div>
      </div>
      <div className="p-5 space-y-2">
        {rows.length === 0 ? (
          <p className="text-neutral-400 text-sm text-center py-4">No cost data recorded for this call.</p>
        ) : rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex-1">
              <div className="text-neutral-700">{r.label}</div>
              {r.detail && <div className="text-xs text-neutral-400">{r.detail}</div>}
            </div>
            <div className="font-mono text-neutral-800 tabular-nums">{fmt(r.cost)}</div>
          </div>
        ))}
        {(charge > 0 || markupText) && (
          <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-neutral-700 font-medium">Customer charge</div>
                {markupText && <div className="text-xs text-neutral-400">{markupText}</div>}
              </div>
              <div className="font-mono text-emerald-600 font-semibold tabular-nums">{fmt(charge)}</div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="text-neutral-500">Profit</div>
              <div className={`font-mono tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(profit)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CallDetail() {
  const params = useSearchParams();
  const callId = params.get("id") || "";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [call, setCall] = useState<CallSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [telemetry, setTelemetry] = useState<CallTelemetryData | null>(null);
  const [telLoading, setTelLoading] = useState(false);
  const [telError, setTelError] = useState<string | null>(null);
  const [telExpanded, setTelExpanded] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // Turn-level feedback annotations
  interface TurnFeedbackDoc { turnIndex: number; rating: string | null; correction: string | null; }
  const [turnFeedback, setTurnFeedback] = useState<TurnFeedbackDoc[]>([]);
  // Inline prompt suggestion from coach based on feedback
  const [feedbackSuggestion, setFeedbackSuggestion] = useState<string | null>(null);
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  useEffect(() => {
    if (!callId) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "call_sessions", callId),
      (snap) => {
        if (snap.exists()) setCall({ id: snap.id, ...snap.data() } as CallSession);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [callId]);

  useEffect(() => {
    if (call?.analysis) setAnalysis(call.analysis as CallAnalysis);
  }, [call]);

  // Load turn-level feedback for this call (live-updating)
  useEffect(() => {
    if (!callId) return;
    const q = query(collection(db, "call_turn_feedback"), where("callId", "==", callId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => d.data() as TurnFeedbackDoc)
        .sort((a, b) => a.turnIndex - b.turnIndex);
      setTurnFeedback(items);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  async function handleAnalyze() {
    if (!callId) return;
    setAnalyzing(true);
    try {
      const result = await analyzeCall(callId);
      setAnalysis(result);
    } catch (err) {
      console.error("analyzeCall failed:", err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleLoadTelemetry() {
    if (telemetry || !callId) return;
    setTelLoading(true);
    setTelError(null);
    try {
      const result = await adminGetCallTelemetry(callId);
      setTelemetry(result);
      setTelExpanded(true);
    } catch (err: unknown) {
      setTelError(err instanceof Error ? err.message : "Failed to load telemetry");
    } finally {
      setTelLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-neutral-400 text-sm">Loading call...</div>;
  if (!call) return (
    <div className="p-8 text-center">
      <p className="text-neutral-400 text-sm">Call not found.</p>
      <Link href="/calls" className="text-[#0066CC] text-sm hover:underline mt-2 inline-block">← Back to calls</Link>
    </div>
  );

  const history = call.conversationHistory || [];
  const recordings = call.recordings || [];
  const assistantName = call.assistantDefinition?.name || call.assistantName || "—";
  const isOutbound = call.callType === "outbound";
  const isNlpearl = call.telephonyProvider === "nlpearl";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <Link href="/calls" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          All calls
        </Link>
        {call.assistantId && (
          <button
            onClick={() => setCoachOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs font-medium hover:bg-violet-100 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Improve this prompt
          </button>
        )}
      </div>

      {/* Prompt Coach — opens with this call pre-loaded */}
      {coachOpen && call.assistantId && (
        <PromptCoach
          assistantId={call.assistantId}
          assistantName={assistantName}
          currentPrompt={(call as {assistantDefinition?: {systemPrompt?: string}}).assistantDefinition?.systemPrompt || ""}
          callIds={[call.id || ""]}
          onPromptApplied={() => { /* saved server-side; toast would be nice */ }}
          onClose={() => setCoachOpen(false)}
        />
      )}

      {/* Provider badge */}
      <div className="mb-3">
        {isNlpearl ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            NLPearl
            {call.nlpearlCallId && <span className="font-mono text-[10px] opacity-60">· {call.nlpearlCallId.slice(0, 10)}</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-semibold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Twilio
          </span>
        )}
      </div>

      {/* Feedback summary panel — shows flagged turns + prompt suggestion */}
      {isAdmin && turnFeedback.length > 0 && (() => {
        const bad = turnFeedback.filter((f) => f.rating === "bad");
        const corrections = bad.filter((f) => f.correction);
        const generateSuggestion = async () => {
          if (!call.assistantId) return;
          setGeneratingSuggestion(true);
          setFeedbackSuggestion(null);
          setSuggestionApplied(false);
          try {
            const prompt = corrections.length > 0
              ? `Based on my turn feedback, suggest specific additions or changes to the system prompt to fix these issues:\n${corrections.map((f) => `- Turn ${f.turnIndex}: "${f.correction}"`).join("\n")}\n\nBe specific and concise. Show the exact text to add or change.`
              : `I flagged ${bad.length} turns as bad. Analyse the transcript and suggest specific prompt changes to prevent these failures.`;
            const r = await fetch(`${FN_BASE}/promptCoachChat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assistantId: call.assistantId,
                callIds: [callId],
                messages: [{ role: "user", content: prompt }],
              }),
            });
            const d = await r.json();
            setFeedbackSuggestion(d.reply || "No suggestion returned.");
          } finally {
            setGeneratingSuggestion(false);
          }
        };

        const applyInline = async () => {
          if (!feedbackSuggestion || !call.assistantId) return;
          setGeneratingSuggestion(true);
          try {
            const r = await fetch(`${FN_BASE}/promptCoachChat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assistantId: call.assistantId,
                callIds: [callId],
                messages: [
                  { role: "user", content: `Based on my feedback, suggest prompt changes.` },
                  { role: "assistant", content: feedbackSuggestion },
                  { role: "user", content: "apply" },
                ],
              }),
            });
            const d = await r.json();
            if (d.appliedPatch) setSuggestionApplied(true);
          } finally {
            setGeneratingSuggestion(false); }
        };

        return (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-amber-900">📝 Your feedback on this call</span>
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{bad.length} issue{bad.length !== 1 ? "s" : ""}</span>
                </div>
                {/* List of flagged turns */}
                <div className="space-y-1">
                  {bad.map((f) => (
                    <div key={f.turnIndex} className="flex items-start gap-2 text-xs text-amber-800">
                      <span className="font-mono text-amber-500 shrink-0">T{f.turnIndex}</span>
                      <span dir="auto">{f.correction ? `"${f.correction}"` : "Flagged as bad"}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 shrink-0">
                {!feedbackSuggestion && !suggestionApplied && (
                  <button
                    onClick={generateSuggestion}
                    disabled={generatingSuggestion || !call.assistantId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {generatingSuggestion ? (
                      <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                    ) : (
                      <>✨ What should change?</>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setCoachOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 bg-white text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 whitespace-nowrap"
                >
                  💬 Open full coach
                </button>
              </div>
            </div>

            {/* AI suggestion result */}
            {feedbackSuggestion && !suggestionApplied && (
              <div className="mt-3 border-t border-amber-200 pt-3">
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Suggested prompt changes:</p>
                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed" dir="auto">
                  {feedbackSuggestion}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {call.assistantId && (
                    <button
                      onClick={applyInline}
                      disabled={generatingSuggestion}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✓ Apply to assistant
                    </button>
                  )}
                  <button
                    onClick={() => { setFeedbackSuggestion(null); }}
                    className="px-3 py-1.5 text-xs text-neutral-500 border border-neutral-200 rounded-lg hover:bg-neutral-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => setCoachOpen(true)}
                    className="px-3 py-1.5 text-xs text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50"
                  >
                    Refine in chat →
                  </button>
                </div>
              </div>
            )}

            {suggestionApplied && (
              <div className="mt-3 border-t border-amber-200 pt-3 flex items-center gap-2 text-xs text-emerald-700 font-medium">
                <span>✅</span> Prompt updated and saved to assistant.
              </div>
            )}
          </div>
        );
      })()}

      {/* NLPearl raw transcript (when no conversationHistory present) */}
      {isNlpearl && (!history || history.length === 0) && call.transcriptText && (
        <div className="mb-6 bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold text-neutral-800 text-sm mb-2">Transcript</h2>
          <pre className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap font-sans">{call.transcriptText}</pre>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Caller</div>
          <div className="text-sm font-semibold text-neutral-800 font-mono">
            {call.leadNumber ? formatPhone(call.leadNumber) : "Unknown"}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Assistant</div>
          <div className="text-sm font-semibold text-neutral-800">{assistantName}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Status</div>
          <div className="mt-0.5"><StatusBadge status={call.status} /></div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Type</div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
            {isOutbound
              ? <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500" />
              : <PhoneIncoming className="w-3.5 h-3.5 text-green-500" />}
            {call.callType || "inbound"}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-1 text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">
            <Clock className="w-3 h-3" />Duration
          </div>
          <div className="text-sm font-semibold text-neutral-800">
            {call.duration != null ? formatDuration(call.duration) : "—"}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Started</div>
          <div className="text-sm font-semibold text-neutral-800">
            {call.createdAt ? formatDate(call.createdAt.toDate()) : "—"}
          </div>
        </div>
        {call.twilioSid && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:col-span-2">
            <div className="flex items-center gap-1 text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">
              <Hash className="w-3 h-3" />Call SID
            </div>
            <div className="text-xs font-semibold text-neutral-700 font-mono truncate">{call.twilioSid}</div>
          </div>
        )}
      </div>

      {/* Recordings */}
      {recordings.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl mb-4">
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#F22F46]" />
            <h2 className="font-semibold text-neutral-800 text-sm">Recordings ({recordings.length})</h2>
          </div>
          <div className="p-5 space-y-5">
            {recordings.map((rec, i) => {
              // Realtime/Gemini recordings (sid RT_/GL_) live in GCS and were
              // saved with a broken signed URL — serve them via the auth proxy.
              const isRealtime = typeof rec.sid === "string" && (rec.sid.startsWith("GL_") || rec.sid.startsWith("RT_"));
              const audioSrc = isRealtime
                ? `${FN_BASE}/getRealtimeRecording?id=${encodeURIComponent(rec.sid.slice(3))}`
                : rec.url;
              return (
              <div key={rec.sid || i} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-mono">{rec.sid}</span>
                  {rec.timestamp && <span>{new Date(rec.timestamp).toLocaleString()}</span>}
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={audioSrc} className="w-full h-10 rounded" />
                {rec.transcription && (
                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                    <p className="text-xs text-neutral-400 font-medium mb-1 uppercase tracking-wide">Transcription</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">{rec.transcription}</p>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scenario Flow Replay */}
      {call.scenarioId && Array.isArray(call.executionLog) && call.executionLog.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-neutral-800">Scenario Flow</h3>
            <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
              {call.executionLog.length} steps
            </span>
          </div>

          {/* Visual flow diagram */}
          <ScenarioFlowReplay
            scenarioId={call.scenarioId}
            executionLog={call.executionLog as any}
          />

          {/* Collapsible raw log */}
          <details className="mt-4">
            <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-600 select-none">
              Show raw execution log
            </summary>
            <div className="mt-2">
              <ExecutionTrace
                entries={call.executionLog as any}
                autoScroll={false}
                maxHeight="400px"
              />
            </div>
          </details>
        </div>
      )}

      {/* Transcript */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        <div className="px-5 py-4 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-800 text-sm">Transcript ({history.length} messages)</h2>
        </div>
        <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-neutral-400 text-sm text-center py-8">No conversation yet</p>
          ) : (
            history.map((msg, i) => {
              // Tool-call rows render differently — centered "API call" pill
              // showing name, args, and response preview.
              if (msg.role === "tool") {
                return (
                  <div key={i} className="flex flex-col items-center gap-1 my-2">
                    <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                      <span>⚡</span>
                      <span className="font-mono">API call · {msg.name}</span>
                      {msg.timestamp && (
                        <span>· {(() => {
                          try {
                            const ts = msg.timestamp as { toDate?: () => Date } | string | Date;
                            const d = ts && typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function"
                              ? ts.toDate()
                              : new Date(ts as string | number);
                            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                          } catch { return ""; }
                        })()}</span>
                      )}
                    </div>
                    <details className="max-w-[80%] w-full bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 text-xs">
                      <summary className="cursor-pointer text-violet-700 font-medium">
                        {msg.args && Object.keys(msg.args).length > 0 ? (
                          <>args: <span className="font-mono text-violet-600">{JSON.stringify(msg.args).slice(0, 80)}</span></>
                        ) : <>no arguments</>}
                        {typeof msg.httpStatus === "number" && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded font-mono text-[10px] ${
                            msg.httpStatus < 400 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}>HTTP {msg.httpStatus}</span>
                        )}
                      </summary>
                      {msg.request && (
                        <div className="mt-2">
                          <div className="text-[9px] uppercase tracking-wide text-violet-400 font-semibold">Request</div>
                          <pre className="text-[10px] text-neutral-700 whitespace-pre-wrap font-mono overflow-auto max-h-20 break-all" dir="ltr">{msg.request}</pre>
                        </div>
                      )}
                      {msg.responseBody && (
                        <div className="mt-2">
                          <div className="text-[9px] uppercase tracking-wide text-violet-400 font-semibold">Response</div>
                          <pre className="text-[10px] text-neutral-700 whitespace-pre-wrap font-mono overflow-auto max-h-40" dir="ltr">{(() => {
                            try { return JSON.stringify(JSON.parse(msg.responseBody!), null, 2); }
                            catch { return msg.responseBody; }
                          })()}</pre>
                        </div>
                      )}
                      <div className="mt-2">
                        <div className="text-[9px] uppercase tracking-wide text-violet-400 font-semibold">{msg.request ? "Result given to the model" : "Result"}</div>
                        <pre className="text-[10px] text-neutral-700 whitespace-pre-wrap font-mono overflow-auto max-h-40">
                          {msg.result || "(no result)"}
                        </pre>
                      </div>
                    </details>
                  </div>
                );
              }
              return (
              <div key={i} className={`flex flex-col ${msg.role !== "assistant" ? "items-end" : "items-start"}`}>
                <div className={`flex gap-3 ${msg.role !== "assistant" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "assistant" ? "bg-[#F22F46]/10" : "bg-neutral-100"
                  }`}>
                    {msg.role === "assistant"
                      ? <Bot className="w-3.5 h-3.5 text-[#F22F46]" />
                      : <User className="w-3.5 h-3.5 text-neutral-500" />
                    }
                  </div>
                  <div className={`max-w-[75%] flex flex-col ${msg.role === "assistant" ? "items-start" : "items-end"}`}>
                    {/* Timestamp — accept both modern `timestamp` and legacy `ts` */}
                    {(msg.timestamp || msg.ts) && (
                      <span className="text-[10px] text-neutral-400 mb-0.5 px-1">
                        {(() => {
                          try {
                            const ts = (msg.timestamp || msg.ts) as { toDate?: () => Date } | string | Date;
                            const d = ts && typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function"
                              ? ts.toDate()
                              : new Date(ts as string | number);
                            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                          } catch { return ""; }
                        })()}
                      </span>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "assistant"
                        ? "bg-neutral-100 text-neutral-800 rounded-tl-sm"
                        : "bg-[#0066CC] text-white rounded-tr-sm"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
                {/* Per-turn feedback — only on assistant turns, only for admins */}
                {msg.role === "assistant" && isAdmin && call.id && (
                  <TurnFeedback
                    callId={call.id}
                    turnIndex={i}
                  />
                )}
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cost Breakdown (admin + super admin) */}
      {isAdmin && call?.costs && <CostBreakdownCard costs={call.costs} />}

      {/* Per-call technical diagnostics (timeline of Cloud Run events) */}
      {call?.id && (
        <div className="mt-4">
          <CallDiagnostics callSessionId={call.id} />
        </div>
      )}

      {call?.id && call.assistantId && (call.conversationHistory || []).some((m) => m.role === "user") && (
        <div className="mt-4">
          <CallReplay assistantId={call.assistantId} history={call.conversationHistory || []} callSessionId={call.id} />
        </div>
      )}

      {/* Technical Log (admin + super admin) */}
      {isAdmin && (
        <div className="bg-white border border-neutral-200 rounded-xl mt-4">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left"
            onClick={() => {
              setTelExpanded(v => !v);
              if (!telemetry && !telLoading) handleLoadTelemetry();
            }}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h2 className="font-semibold text-neutral-800 text-sm">Technical Log</h2>
              <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">super admin</span>
              {telemetry && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  telemetry.insights.health === "good" ? "bg-green-50 text-green-700" :
                  telemetry.insights.health === "warn" ? "bg-yellow-50 text-yellow-700" :
                  "bg-red-50 text-red-700"
                }`}>
                  {telemetry.insights.health}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {telLoading && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
              {telExpanded ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
            </div>
          </button>

          {telExpanded && (
            <div className="border-t border-neutral-100">
              {telError && (
                <div className="px-5 py-4 text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {telError === "Telemetry log not found for this call"
                    ? "No telemetry log yet — data is written at call end (calls in progress or legacy calls won't have this)."
                    : telError}
                </div>
              )}
              {!telemetry && !telLoading && !telError && (
                <div className="px-5 py-8 text-center text-neutral-400 text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-neutral-200" />
                  Loading technical data…
                </div>
              )}
              {telemetry && <TelemetryPanel tel={telemetry} />}
            </div>
          )}
        </div>
      )}

      {/* AI Insights */}
      <div className="bg-white border border-neutral-200 rounded-xl mt-4">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" />
            <h2 className="font-semibold text-neutral-800 text-sm">AI Insights</h2>
            {analysis?.analyzedAt && (
              <span className="text-xs text-neutral-400">· {new Date(analysis.analyzedAt).toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {analyzing ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
            ) : analysis ? (
              <><RotateCcw className="w-3 h-3" /> Re-analyze</>
            ) : (
              <><Brain className="w-3 h-3" /> Analyze Call</>
            )}
          </button>
        </div>

        {!analysis && !analyzing && (
          <div className="p-8 text-center text-neutral-400 text-sm">
            <Brain className="w-8 h-8 mx-auto mb-2 text-neutral-200" />
            Click &quot;Analyze Call&quot; to get AI-powered insights — score, improvements &amp; approach recommendations
          </div>
        )}

        {analyzing && (
          <div className="p-8 text-center text-neutral-400 text-sm">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
            Analyzing conversation...
          </div>
        )}

        {analysis && !analyzing && (
          <div className="p-5 space-y-5">
            {/* Score + Summary row */}
            <div className="flex gap-4">
              {/* Score circle */}
              <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border-2 ${
                analysis.score >= 8 ? "border-green-200 bg-green-50" :
                analysis.score >= 5 ? "border-yellow-200 bg-yellow-50" :
                "border-red-200 bg-red-50"
              }`}>
                <span className={`text-3xl font-bold ${
                  analysis.score >= 8 ? "text-green-600" :
                  analysis.score >= 5 ? "text-yellow-600" :
                  "text-red-600"
                }`}>{analysis.score}</span>
                <span className="text-xs text-neutral-400">/ 10</span>
              </div>
              {/* Summary */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <OutcomeBadge outcome={analysis.outcome} />
                  <SentimentBadge sentiment={analysis.sentiment} />
                </div>
                <p className="text-sm text-neutral-700 leading-relaxed">{analysis.summary}</p>
                <p className="text-xs text-neutral-400 mt-1 italic">{analysis.scoreReason}</p>
              </div>
            </div>

            {/* 3-column grid: Strengths | Improvements | Recommended Approach */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Strengths */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Strengths</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-green-800 flex gap-1.5">
                      <span className="text-green-400 flex-shrink-0">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">To Improve</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.improvements.map((imp, i) => (
                    <li key={i} className="text-xs text-orange-800 flex gap-1.5">
                      <span className="text-orange-400 flex-shrink-0">→</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Approach */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Next Time</span>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">{analysis.recommendedApproach}</p>
              </div>
            </div>

            {/* Key Moments */}
            {analysis.keyMoments?.length > 0 && (
              <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Key Moments</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.keyMoments.map((moment, i) => (
                    <span key={i} className="text-xs bg-white border border-neutral-200 rounded-full px-2.5 py-1 text-neutral-600">{moment}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>}>
      <CallDetail />
    </Suspense>
  );
}

// ── Per-turn feedback widget (shown below every assistant bubble) ─────────────
const FN_BASE = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

function TurnFeedback({ callId, turnIndex, initialRating, initialCorrection }: {
  callId: string;
  turnIndex: number;
  initialRating?: "good" | "bad" | null;
  initialCorrection?: string | null;
}) {
  const [rating, setRating] = useState<"good" | "bad" | null>(initialRating || null);
  const [correction, setCorrection] = useState(initialCorrection || "");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (newRating: "good" | "bad" | null, newCorrection?: string) => {
    setSaving(true);
    try {
      await fetch(`${FN_BASE}/saveTurnFeedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          turnIndex,
          rating: newRating,
          correction: newCorrection !== undefined ? newCorrection : correction,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };

  const handleRating = (r: "good" | "bad") => {
    const next = rating === r ? null : r;
    setRating(next);
    if (next === "bad") setOpen(true); // auto-open correction when thumbs down
    else { setOpen(false); save(next); }
  };

  return (
    <div className="mt-1 ml-10">
      <div className="flex items-center gap-1">
        {/* Thumbs up */}
        <button
          onClick={() => handleRating("good")}
          title="Good response"
          className={`w-5 h-5 rounded flex items-center justify-center text-sm transition-colors ${
            rating === "good" ? "bg-emerald-100 text-emerald-600" : "text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100"
          }`}
        >👍</button>
        {/* Thumbs down */}
        <button
          onClick={() => handleRating("bad")}
          title="Bad response — add correction"
          className={`w-5 h-5 rounded flex items-center justify-center text-sm transition-colors ${
            rating === "bad" ? "bg-red-100 text-red-600" : "text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100"
          }`}
        >👎</button>
        {/* Show correction if exists */}
        {correction && rating === "bad" && (
          <button
            onClick={() => setOpen(!open)}
            className="text-[10px] text-red-500 hover:underline ml-1 max-w-[160px] truncate text-left"
            title={correction}
          >
            ✏️ {correction.length > 30 ? correction.slice(0, 30) + "…" : correction}
          </button>
        )}
        {saved && <span className="text-[10px] text-emerald-600 ml-1">Saved ✓</span>}
      </div>

      {/* Correction input — only when thumbs-down and open */}
      {open && rating === "bad" && (
        <div className="mt-1.5 flex items-center gap-1.5 max-w-sm">
          <input
            type="text"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { save("bad", correction); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
            placeholder="What should the bot have said?"
            autoFocus
            dir="auto"
            className="flex-1 text-xs border border-red-200 rounded-lg px-2 py-1.5 bg-red-50 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-red-300"
          />
          <button
            onClick={() => { save("bad", correction); setOpen(false); }}
            disabled={saving}
            className="px-2 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
