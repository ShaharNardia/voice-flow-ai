"use client";

/**
 * CallDiagnostics — collapsible "Technical Diagnostics" panel on the call detail
 * page. Renders a chronological timeline of structured events parsed from
 * Cloud Run logs (bridge handshakes, tool calls, model fallbacks, language
 * hint failures, ffmpeg events, barge-ins, silences, errors).
 *
 * Replaces the "ask Claude to grep the logs" workflow.
 */

import { useEffect, useState } from "react";
import {
  Activity, Loader2, AlertTriangle, AlertCircle, CheckCircle2, Info,
  ChevronDown, ChevronUp, RefreshCw, Zap, Phone, Mic, Headphones,
  Brain, Wrench, Clock, DollarSign, X,
} from "lucide-react";
import { getCallDiagnostics, type DiagnosticEvent } from "@/lib/firebase-functions";

// Icon + color per event type
const TYPE_META: Record<string, { icon: React.ReactNode; color: string }> = {
  twilio_ws_connect:    { icon: <Phone   className="w-3.5 h-3.5" />, color: "neutral" },
  ari_inbound:          { icon: <Phone   className="w-3.5 h-3.5" />, color: "neutral" },
  ari_outbound:         { icon: <Phone   className="w-3.5 h-3.5" />, color: "neutral" },
  session_start:        { icon: <Mic     className="w-3.5 h-3.5" />, color: "blue"   },
  kb_injected:          { icon: <Brain   className="w-3.5 h-3.5" />, color: "violet" },
  tools_registered:     { icon: <Wrench  className="w-3.5 h-3.5" />, color: "violet" },
  gemini_connected:     { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "green" },
  model_fallback:       { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "amber" },
  lang_hint_rejected:   { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "amber" },
  bridge_ready:         { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "green" },
  greeting:             { icon: <Headphones className="w-3.5 h-3.5" />, color: "blue"  },
  ffmpeg_spawn:         { icon: <Activity className="w-3.5 h-3.5" />, color: "neutral" },
  tool_call:            { icon: <Zap     className="w-3.5 h-3.5" />, color: "violet" },
  tool_error:           { icon: <X       className="w-3.5 h-3.5" />, color: "red"    },
  custom_api_response:  { icon: <Zap     className="w-3.5 h-3.5" />, color: "violet" },
  barge_in:             { icon: <Activity className="w-3.5 h-3.5" />, color: "blue"   },
  silence_check:        { icon: <Clock   className="w-3.5 h-3.5" />, color: "amber"  },
  silence_hangup:       { icon: <Clock   className="w-3.5 h-3.5" />, color: "amber"  },
  goodbye_detected:     { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "green" },
  meta_suppressed:      { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "amber" },
  audio_first:          { icon: <Mic     className="w-3.5 h-3.5" />, color: "neutral" },
  ws_closed:            { icon: <Activity className="w-3.5 h-3.5" />, color: "neutral" },
  ffmpeg_exit:          { icon: <Activity className="w-3.5 h-3.5" />, color: "neutral" },
  recording:            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "green"  },
  recording_skip:       { icon: <AlertCircle className="w-3.5 h-3.5" />, color: "amber"  },
  cost:                 { icon: <DollarSign className="w-3.5 h-3.5" />, color: "neutral" },
  auto_analysis:        { icon: <Brain   className="w-3.5 h-3.5" />, color: "violet" },
  raw:                  { icon: <Info    className="w-3.5 h-3.5" />, color: "neutral" },
};

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  green:   { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200"   },
  blue:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200"    },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200"  },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  red:     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200"     },
  neutral: { bg: "bg-neutral-50", text: "text-neutral-700", border: "border-neutral-200" },
};

const SEVERITY_BADGE: Record<DiagnosticEvent["severity"], string> = {
  debug:   "bg-neutral-100 text-neutral-500",
  info:    "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  error:   "bg-red-100 text-red-700",
};

export default function CallDiagnostics({ callSessionId }: { callSessionId: string }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [events,  setEvents]  = useState<DiagnosticEvent[]>([]);
  const [summary, setSummary] = useState<{ totalEvents: number; errors: number; warnings: number; toolCalls: number; modelFallbacks: number; langHintRejected: boolean } | null>(null);
  const [error,   setError]   = useState("");
  const [showDebug, setShowDebug] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await getCallDiagnostics(callSessionId, 24);
      setEvents(r.events);
      setSummary(r.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && events.length === 0 && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleEvents = showDebug ? events : events.filter((e) => e.severity !== "debug");

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-neutral-500" />
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900">Technical Diagnostics</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {summary
                ? `${summary.totalEvents} events · ${summary.errors} errors · ${summary.warnings} warnings · ${summary.toolCalls} tool calls`
                : "Bridge events, tool calls, model fallbacks — click to expand"}
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      {open && (
        <div className="border-t border-neutral-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-neutral-500">
              {summary?.langHintRejected && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] mr-2">
                  <AlertTriangle className="w-2.5 h-2.5" /> Language hint rejected by API
                </span>
              )}
              {summary?.modelFallbacks && summary.modelFallbacks > 0 ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] mr-2">
                  <AlertTriangle className="w-2.5 h-2.5" /> {summary.modelFallbacks} model fallback{summary.modelFallbacks > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-neutral-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDebug}
                  onChange={(e) => setShowDebug(e.target.checked)}
                  className="w-3 h-3"
                />
                Show debug events
              </label>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-xs rounded transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
            </div>
          )}

          {loading && events.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Querying Cloud Run logs…
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 text-sm">
              No events found. The call may be too old (logs retained 24h) or never reached Cloud Run.
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleEvents.map((e, i) => {
                const meta = TYPE_META[e.type] || TYPE_META.raw;
                const c = COLOR_CLASSES[meta.color];
                return (
                  <div key={i} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${c.bg} ${c.border}`}>
                    <span className={`flex-shrink-0 ${c.text}`}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${c.text}`}>{e.label}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${SEVERITY_BADGE[e.severity]} font-mono`}>{e.severity}</span>
                        <span className="text-[10px] text-neutral-400 font-mono ml-auto">
                          {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                      {e.detail && (
                        <div className="text-[11px] text-neutral-600 mt-0.5 font-mono break-all">{e.detail}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 text-[10px] text-neutral-400 italic">
            Sourced from Cloud Run logs (last 24h). Events older than 24h may be missing.
          </div>
        </div>
      )}
    </div>
  );
}
