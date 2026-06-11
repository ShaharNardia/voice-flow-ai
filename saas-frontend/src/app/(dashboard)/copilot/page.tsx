"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { collection, query, orderBy, limit, onSnapshot, where, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { Bot, User, Mic, PhoneCall, TrendingUp, TrendingDown, Minus, Zap, Send, Circle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CallSession {
  id: string;
  status: string;
  leadName?: string;
  callerNumber?: string;
  assistantId?: string;
  createdAt?: Timestamp;
  lastAIResponse?: string;
  lastSpeechResult?: string;
}

interface CopilotEvent {
  type: "transcript" | "suggestion" | "sentiment" | "injection_ack" | "session_state" | "error";
  role?: string;
  text?: string;
  value?: string;
  message?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

const CLOUD_RUN_URL = process.env.NEXT_PUBLIC_CLOUD_RUN_URL || "https://mediastream-XXXXXXXX-uc.a.run.app";

// ── Sentiment icon ─────────────────────────────────────────────────────────────
function SentimentIcon({ value }: { value: string }) {
  if (value === "positive") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (value === "negative") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-neutral-400" />;
}

// ── Active session picker ─────────────────────────────────────────────────────
function SessionPicker({ sessions, selected, onSelect }: {
  sessions: CallSession[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-100">
        <p className="text-xs font-semibold text-neutral-600">Active Calls ({sessions.length})</p>
      </div>
      {sessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-neutral-400">No active calls right now</div>
      ) : (
        <div className="divide-y divide-neutral-50">
          {sessions.map(s => (
            <button key={s.id} onClick={() => onSelect(s.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors ${selected === s.id ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{s.leadName || s.callerNumber || "Unknown"}</p>
                <p className="text-xs text-neutral-400">{s.createdAt?.toDate?.()?.toLocaleTimeString() || "—"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transcript bubble ─────────────────────────────────────────────────────────
function TranscriptBubble({ role, text, timestamp }: { role: string; text: string; timestamp?: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-neutral-200" : "bg-[#F22F46]/10"}`}>
        {isUser ? <User className="w-3.5 h-3.5 text-neutral-600" /> : <Bot className="w-3.5 h-3.5 text-[#F22F46]" />}
      </div>
      <div className={`max-w-xs rounded-2xl px-3 py-2 ${isUser ? "bg-neutral-100 rounded-tr-sm" : "bg-white border border-neutral-200 rounded-tl-sm"}`}>
        <p className="text-xs text-neutral-700 leading-relaxed">{text}</p>
        {timestamp && <p className="text-[10px] text-neutral-400 mt-1">{new Date(timestamp).toLocaleTimeString()}</p>}
      </div>
    </div>
  );
}

// ── AI Suggestion card ────────────────────────────────────────────────────────
function SuggestionCard({ text, timestamp }: { text: string; timestamp?: string }) {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-blue-600" />
        <span className="text-xs font-semibold text-blue-700">AI Suggestion</span>
        {timestamp && <span className="text-[10px] text-blue-400 ml-auto">{new Date(timestamp).toLocaleTimeString()}</span>}
      </div>
      <p className="text-xs text-blue-800 leading-relaxed">{text}</p>
    </div>
  );
}

export default function CopilotPage() {
  const { user } = useAuth();
  const [activeSessions, setActiveSessions] = useState<CallSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<CopilotEvent[]>([]);
  const [currentSentiment, setCurrentSentiment] = useState<string>("neutral");
  const [latestSuggestion, setLatestSuggestion] = useState<CopilotEvent | null>(null);
  const [injectMsg, setInjectMsg] = useState("");
  const [connected, setConnected] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Watch active calls in Firestore
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "call_sessions"),
      where("status", "==", "in-progress"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(q, snap => {
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallSession)));
    });
    return unsub;
  }, [user]);

  // Connect to SSE stream when a session is selected
  useEffect(() => {
    if (!selectedSession) return;

    // Close previous connection
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }

    setEvents([]);
    setConnected(false);
    setCurrentSentiment("neutral");
    setLatestSuggestion(null);

    const sse = new EventSource(`${CLOUD_RUN_URL}/copilot-stream?sessionId=${encodeURIComponent(selectedSession)}`);
    sseRef.current = sse;

    sse.onopen = () => setConnected(true);

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as CopilotEvent;
        if (event.type === "session_state") {
          // Load initial history
          const history = (event.data?.conversationHistory || []) as Array<{role: string; content: string}>;
          setEvents(history.filter(h => h.role === "user" || h.role === "assistant")
            .map(h => ({ type: "transcript" as const, role: h.role, text: h.content, timestamp: new Date().toISOString() })));
        } else if (event.type === "transcript") {
          setEvents(prev => [...prev, event]);
        } else if (event.type === "sentiment") {
          setCurrentSentiment(event.value || "neutral");
        } else if (event.type === "suggestion") {
          setLatestSuggestion(event);
          setEvents(prev => [...prev, event]);
        }
      } catch {}
    };

    sse.onerror = () => { setConnected(false); };

    return () => { sse.close(); };
  }, [selectedSession]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const sendInjection = async () => {
    if (!selectedSession || !injectMsg.trim()) return;
    setInjecting(true);
    try {
      await fetch(`${CLOUD_RUN_URL}/copilot-inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSession, message: injectMsg.trim() }),
      });
      setInjectMsg("");
    } catch (e) { console.error(e); }
    finally { setInjecting(false); }
  };

  const transcriptEvents = events.filter(e => e.type === "transcript");
  const suggestionEvents = events.filter(e => e.type === "suggestion").slice(-5).reverse();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          AI Co-Pilot
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Real-time AI guidance for human agents during live calls
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-200px)]">
        {/* Left: active sessions */}
        <div className="col-span-3 space-y-4 overflow-auto">
          <SessionPicker sessions={activeSessions} selected={selectedSession} onSelect={setSelectedSession} />
          {selectedSession && (
            <div className="bg-white rounded-xl border border-neutral-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-neutral-600">Caller Sentiment</p>
              <div className="flex items-center gap-2">
                <SentimentIcon value={currentSentiment} />
                <span className="text-sm font-medium text-neutral-700 capitalize">{currentSentiment}</span>
                <div className={`ml-auto w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-neutral-300"}`} title={connected ? "Connected" : "Connecting..."} />
              </div>
            </div>
          )}
        </div>

        {/* Center: live transcript */}
        <div className="col-span-5 flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-neutral-400" />
              <p className="text-xs font-semibold text-neutral-600">Live Transcript</p>
            </div>
            {connected && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <Mic className="w-3 h-3" /> Live
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {!selectedSession ? (
              <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                Select an active call to monitor
              </div>
            ) : transcriptEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                Waiting for conversation...
              </div>
            ) : (
              transcriptEvents.map((e, i) => (
                <TranscriptBubble key={i} role={e.role || "user"} text={e.text || ""} timestamp={e.timestamp} />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
          {/* Injection input */}
          {selectedSession && (
            <div className="px-3 py-2.5 border-t border-neutral-100 flex gap-2">
              <input
                value={injectMsg}
                onChange={e => setInjectMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendInjection()}
                placeholder="Inject note to AI assistant..."
                className="flex-1 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#F22F46]"
              />
              <button onClick={sendInjection} disabled={injecting || !injectMsg.trim()}
                className="px-3 py-1.5 text-xs bg-[#F22F46] text-white rounded-lg disabled:opacity-50 hover:bg-[#d41f35]">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: AI suggestions */}
        <div className="col-span-4 flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-100">
            <p className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              AI Suggestions
            </p>
          </div>
          <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
            {!selectedSession ? (
              <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                Suggestions will appear here
              </div>
            ) : suggestionEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                Waiting for first suggestion...
              </div>
            ) : (
              suggestionEvents.map((e, i) => (
                <SuggestionCard key={i} text={e.text || ""} timestamp={e.timestamp} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
