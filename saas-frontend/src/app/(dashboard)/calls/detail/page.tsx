"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDate, formatPhone } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowLeft, Bot, User, PhoneIncoming, PhoneOutgoing, Clock, Hash, Mic,
  Brain, TrendingUp, ThumbsUp, Lightbulb, RotateCcw, Zap, Loader2,
} from "lucide-react";
import { analyzeCall, CallAnalysis } from "@/lib/firebase-functions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Recording {
  sid: string;
  url: string;
  transcription?: string;
  timestamp?: string;
}

interface CallSession {
  leadNumber?: string;
  status: string;
  callType?: "inbound" | "outbound";
  duration?: number;
  twilioSid?: string;
  scenarioId?: string;
  createdAt?: { toDate: () => Date };
  assistantDefinition?: { name?: string; language?: string };
  assistantName?: string;
  conversationHistory?: Message[];
  recordings?: Recording[];
  analysis?: CallAnalysis;
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

function CallDetail() {
  const params = useSearchParams();
  const callId = params.get("id") || "";
  const [call, setCall] = useState<CallSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!callId) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "call_sessions", callId),
      (snap) => {
        if (snap.exists()) setCall(snap.data() as CallSession);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [callId]);

  useEffect(() => {
    if (call?.analysis) setAnalysis(call.analysis as CallAnalysis);
  }, [call]);

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

  return (
    <div>
      <Link href="/calls" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        All calls
      </Link>

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
            {recordings.map((rec, i) => (
              <div key={rec.sid || i} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-mono">{rec.sid}</span>
                  {rec.timestamp && <span>{new Date(rec.timestamp).toLocaleString()}</span>}
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={rec.url} className="w-full h-10 rounded" />
                {rec.transcription && (
                  <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                    <p className="text-xs text-neutral-400 font-medium mb-1 uppercase tracking-wide">Transcription</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">{rec.transcription}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
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
            history.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role !== "assistant" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "assistant" ? "bg-[#F22F46]/10" : "bg-neutral-100"
                }`}>
                  {msg.role === "assistant"
                    ? <Bot className="w-3.5 h-3.5 text-[#F22F46]" />
                    : <User className="w-3.5 h-3.5 text-neutral-500" />
                  }
                </div>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-neutral-100 text-neutral-800 rounded-tl-sm"
                    : "bg-[#0066CC] text-white rounded-tr-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
