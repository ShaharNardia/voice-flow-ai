"use client";

/**
 * ScenarioPhoneSimulator
 *
 * Realistic phone-call simulator for scenario testing.
 * • Phone-shaped dark UI (feels like a real smartphone call)
 * • Bot messages spoken aloud via Web Speech API TTS
 * • User can type OR use mic (Web Speech Recognition)
 * • Runs the same node engine as LiveTestPanel
 * • Accessible from the scenarios list, wizard preview, and editor
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Mic, MicOff, PhoneOff, RotateCcw, Send, Volume2, VolumeX, X,
} from "lucide-react";
import type { Branch } from "../../_lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface ChatMsg {
  role: "bot" | "user" | "system";
  text: string;
}

type CallState = "idle" | "ringing" | "active" | "ended";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function formatTimer(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ── TTS via Web Speech API ────────────────────────────────────────────────────

let ttsEnabled = true;

function speak(text: string, lang = "en-US"): Promise<void> {
  if (!ttsEnabled || typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang.replace(/_/g, "-");
    utt.rate = 0.95;
    utt.pitch = 1.0;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ── Web Speech Recognition ────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (() => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!ctor) return null;
  return ctor as () => SpeechRecognitionInstance;
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  scenarioId: string;
  scenarioName?: string;
  onClose: () => void;
  // If nodes/edges are already available (e.g. from editor), pass them directly
  nodes?: RawNode[];
  edges?: RawEdge[];
}

export default function ScenarioPhoneSimulator({
  scenarioId, scenarioName, onClose,
  nodes: propNodes, edges: propEdges,
}: Props) {
  // ── Scenario data ─────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<RawNode[]>(propNodes || []);
  const [edges, setEdges] = useState<RawEdge[]>(propEdges || []);
  const [loadError, setLoadError] = useState("");
  const [scenName, setScenName] = useState(scenarioName || "");

  useEffect(() => {
    if (propNodes?.length) return; // already provided
    (async () => {
      try {
        const snap = await getDoc(doc(db, "scenarios", scenarioId));
        if (!snap.exists()) { setLoadError("Scenario not found"); return; }
        const d = snap.data();
        setNodes((d.nodes || []) as RawNode[]);
        setEdges((d.edges || []) as RawEdge[]);
        if (!scenarioName) setScenName(d.name || "Scenario");
      } catch { setLoadError("Failed to load scenario"); }
    })();
  }, [scenarioId, propNodes, propEdges, scenarioName]);

  // ── Call state ────────────────────────────────────────────────────────────
  const [callState, setCallState]   = useState<CallState>("idle");
  const [timer, setTimer]           = useState(0);
  const [messages, setMessages]     = useState<ChatMsg[]>([]);
  const [userInput, setUserInput]   = useState("");
  const [awaitingInput, setAwaiting] = useState(false);
  const [currentNodeLabel, setCurrentNodeLabel] = useState("");
  const [voiceOn, setVoiceOn]       = useState(true);
  const [listening, setListening]   = useState(false);

  // Expose setter for ttsEnabled
  useEffect(() => { ttsEnabled = voiceOn; }, [voiceOn]);

  const resumeRef   = useRef<((val: string) => void) | null>(null);
  const varsRef     = useRef<Record<string, string>>({});
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const recogRef    = useRef<SpeechRecognitionInstance | null>(null);

  // ── Edge / node lookups ───────────────────────────────────────────────────
  const edgesBySource = useMemo(() => {
    const map: Record<string, RawEdge[]> = {};
    for (const e of edges) {
      if (!map[e.source]) map[e.source] = [];
      map[e.source].push(e);
    }
    return map;
  }, [edges]);

  const nodeById = useMemo(() => {
    const map: Record<string, RawNode> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  const interpolate = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => varsRef.current[k] ?? `{{${k}}}`);

  function findNext(nodeId: string, handle?: string): string | null {
    const out = edgesBySource[nodeId] || [];
    if (handle) {
      const m = out.find(e => e.sourceHandle === handle);
      if (m) return m.target;
    }
    const def = out.find(e => !e.sourceHandle || e.sourceHandle === "default");
    return def?.target || out[0]?.target || null;
  }

  // ── Message helpers ───────────────────────────────────────────────────────
  const addMsg = useCallback((role: ChatMsg["role"], text: string) => {
    setMessages(m => [...m, { role, text }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Node processor ────────────────────────────────────────────────────────
  const processRef = useRef<(nodeId: string) => Promise<void>>();
  processRef.current = async function process(nodeId: string): Promise<void> {
    const node = nodeById[nodeId];
    if (!node) { setCallState("ended"); return; }
    const d = node.data;
    const typeLabel = String(d.label || node.type);
    setCurrentNodeLabel(typeLabel);

    switch (node.type) {
      case "start": {
        await sleep(300);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "say": {
        const text = interpolate(String(d.text || ""));
        addMsg("bot", text);
        await speak(text);
        await sleep(200);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "gather": {
        const prompt = interpolate(String(d.prompt || ""));
        if (prompt) {
          addMsg("bot", prompt);
          await speak(prompt);
        }
        setAwaiting(true);
        setTimeout(() => inputRef.current?.focus(), 80);
        const userReply = await new Promise<string>(resolve => {
          resumeRef.current = resolve;
        });
        addMsg("user", userReply);
        setAwaiting(false);
        const saveVar = String(d.saveResponseTo || "userInput");
        varsRef.current = { ...varsRef.current, [saveVar]: userReply, lastSpeechResult: userReply };
        await sleep(150);
        const next = findNext(nodeId, "success");
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "condition": {
        const condType = String(d.conditionType || "keywords");
        if (condType === "keywords") {
          const branches = (d.branches || []) as Branch[];
          const last = (varsRef.current.lastSpeechResult || "").toLowerCase();
          let matched: string | null = null;
          for (const b of branches) {
            for (const kw of (b.keywords || [])) {
              if (last.includes(kw.toLowerCase())) { matched = b.id; break; }
            }
            if (matched) break;
          }
          const name = matched ? branches.find(b => b.id === matched)?.name || matched : "Default";
          addMsg("system", `→ ${name}`);
          const next = findNext(nodeId, matched || "default");
          if (next) await processRef.current!(next); else setCallState("ended");
        } else {
          const variable  = String(d.variable || "");
          const operator  = String(d.operator || "equals");
          const value     = String(d.value || "");
          const actual    = varsRef.current[variable] ?? "";
          let ok = false;
          if (operator === "equals")      ok = actual === value;
          else if (operator === "notEquals")  ok = actual !== value;
          else if (operator === "contains")   ok = actual.toLowerCase().includes(value.toLowerCase());
          else if (operator === "greaterThan") ok = Number(actual) > Number(value);
          else if (operator === "lessThan")    ok = Number(actual) < Number(value);
          addMsg("system", `${variable} → ${ok ? "true" : "false"}`);
          const next = findNext(nodeId, ok ? "true" : "false");
          if (next) await processRef.current!(next); else setCallState("ended");
        }
        break;
      }
      case "setVariable": {
        const name = String(d.variableName || "");
        const val  = interpolate(String(d.value || ""));
        varsRef.current = { ...varsRef.current, [name]: val };
        addMsg("system", `Set ${name} = "${val}"`);
        await sleep(100);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "transfer": {
        if (d.announcement) {
          const ann = interpolate(String(d.announcement));
          addMsg("bot", ann);
          await speak(ann);
        }
        addMsg("system", `Transferring to ${d.destination || "agent"}…`);
        await sleep(400);
        setCallState("ended");
        break;
      }
      case "apiCall": {
        addMsg("system", `API ${d.method || "GET"} ${d.url || "?"}  →  200 OK`);
        if (d.saveResponseTo) {
          varsRef.current = { ...varsRef.current, [String(d.saveResponseTo)]: '{"status":"ok"}' };
        }
        await sleep(500);
        const next = findNext(nodeId, "success");
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "wait": {
        await sleep(Math.min(Number(d.duration || 1) * 1000, 3000));
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "scheduleCallback": {
        addMsg("system", "Callback scheduled ✓");
        await sleep(200);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "updateLead": {
        addMsg("system", `Lead updated → "${d.status || "?"}"`);
        await sleep(150);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
        break;
      }
      case "end": {
        const msg = interpolate(String(d.message || ""));
        if (msg) { addMsg("bot", msg); await speak(msg); }
        addMsg("system", "— Call ended —");
        setCallState("ended");
        break;
      }
      default: {
        addMsg("system", `[${node.type}]`);
        const next = findNext(nodeId);
        if (next) await processRef.current!(next); else setCallState("ended");
      }
    }
  };

  // ── Start / restart ───────────────────────────────────────────────────────
  function startCall() {
    stopSpeaking();
    setMessages([]);
    setAwaiting(false);
    setCurrentNodeLabel("");
    varsRef.current = {};
    resumeRef.current = null;
    setTimer(0);

    setCallState("ringing");
    setTimeout(() => {
      setCallState("active");
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);

      const startNode = nodes.find(n => n.type === "start");
      if (!startNode) {
        addMsg("system", "No Start node found — add one in the editor.");
        setCallState("ended");
        return;
      }
      processRef.current!(startNode.id).catch(err => {
        addMsg("system", `Error: ${err.message}`);
        setCallState("ended");
      });
    }, 1500);
  }

  function hangUp() {
    stopSpeaking();
    if (resumeRef.current) { resumeRef.current(""); resumeRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setAwaiting(false);
    setCallState("ended");
    addMsg("system", "— Call ended —");
  }

  // ── Clean up on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recogRef.current) try { recogRef.current.stop(); } catch {}
    };
  }, []);

  // ── Stop timer when call ends ─────────────────────────────────────────────
  useEffect(() => {
    if (callState === "ended" && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [callState]);

  // ── Send user reply ───────────────────────────────────────────────────────
  function handleSend() {
    const val = userInput.trim();
    if (!val || !awaitingInput || !resumeRef.current) return;
    setUserInput("");
    resumeRef.current(val);
    resumeRef.current = null;
  }

  // ── Mic / Speech Recognition ──────────────────────────────────────────────
  function toggleMic() {
    if (listening) {
      if (recogRef.current) try { recogRef.current.stop(); } catch {}
      setListening(false);
      return;
    }
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      alert("Speech recognition not supported in this browser.\nUse Chrome or Edge.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recog: SpeechRecognitionInstance = new (SpeechRec as any)();
    recog.lang = "he-IL"; // sensible default; can be derived from scenario nodes
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript && awaitingInput && resumeRef.current) {
        setUserInput(transcript);
        resumeRef.current(transcript);
        resumeRef.current = null;
        setAwaiting(false);
      }
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
    stopSpeaking(); // stop TTS so mic can hear the user
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl p-8 text-center shadow-2xl">
          <p className="text-red-500 mb-4">{loadError}</p>
          <button onClick={onClose} className="px-4 py-2 bg-neutral-100 rounded-lg text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">

      {/* Phone shell */}
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: 360,
          height: 680,
          background: "#0A0A0A",
          borderRadius: 44,
          border: "2px solid #2A2A2A",
          boxShadow: "0 40px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Dynamic Island / notch */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 120, height: 32, background: "#0A0A0A", borderRadius: 20, border: "1.5px solid #1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: callState === "active" ? "#22C55E" : callState === "ringing" ? "#F59E0B" : "#444" }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1A1A1A" }} />
          </div>
        </div>

        {/* Call info bar */}
        <div style={{ textAlign: "center", padding: "8px 0 12px", flexShrink: 0 }}>
          {callState === "idle" ? (
            <p style={{ color: "#666", fontSize: 13 }}>Press Call to begin</p>
          ) : callState === "ringing" ? (
            <>
              <p style={{ color: "#F59E0B", fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>CALLING…</p>
              <p style={{ color: "#888", fontSize: 11, marginTop: 2 }}>Connecting to scenario</p>
            </>
          ) : callState === "active" ? (
            <>
              <p style={{ color: "#22C55E", fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>CONNECTED</p>
              <p style={{ color: "#fff", fontSize: 26, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>
                {formatTimer(timer)}
              </p>
              {currentNodeLabel && (
                <p style={{ color: "#555", fontSize: 10, marginTop: 1 }}>{currentNodeLabel}</p>
              )}
            </>
          ) : (
            <>
              <p style={{ color: "#666", fontSize: 12, fontWeight: 600 }}>CALL ENDED</p>
              <p style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "monospace", marginTop: 2 }}>
                {formatTimer(timer)}
              </p>
            </>
          )}
          <p style={{ color: "#444", fontSize: 11, marginTop: 4 }}>{scenName || scenarioId}</p>
        </div>

        {/* Chat transcript */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2 space-y-2"
          style={{ minHeight: 0 }}
        >
          {callState === "idle" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
              <div style={{ fontSize: 48 }}>📱</div>
              <p style={{ color: "#555", fontSize: 13, textAlign: "center" }}>
                Tap the green button to<br />start your scenario test
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              if (msg.role === "system") {
                return (
                  <div key={i} style={{ textAlign: "center", margin: "4px 0" }}>
                    <span style={{ fontSize: 10, color: "#444", background: "#111", padding: "2px 8px", borderRadius: 10 }}>
                      {msg.text}
                    </span>
                  </div>
                );
              }
              const isBot = msg.role === "bot";
              return (
                <div key={i} style={{ display: "flex", justifyContent: isBot ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "78%",
                    padding: "10px 14px",
                    borderRadius: isBot ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
                    background: isBot ? "#1C1C1E" : "#2563EB",
                    color: isBot ? "#E5E7EB" : "#fff",
                    fontSize: 14,
                    lineHeight: 1.4,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  }}>
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}

          {/* Listening indicator */}
          {listening && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px" }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{
                    width: 3,
                    background: "#EF4444",
                    borderRadius: 2,
                    animation: `pulse-bar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                    height: `${8 + i * 4}px`,
                  }} />
                ))}
              </div>
              <span style={{ color: "#EF4444", fontSize: 11 }}>Listening…</span>
            </div>
          )}

          {/* Awaiting input indicator */}
          {awaitingInput && !listening && (
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 10, color: "#3B82F6", background: "#1D2B4A", padding: "3px 10px", borderRadius: 10 }}>
                Waiting for your response…
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Text input row (only when active and awaiting input) */}
        {callState === "active" && awaitingInput && (
          <div style={{ padding: "8px 12px", borderTop: "1px solid #1A1A1A", display: "flex", gap: 8, flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
              placeholder="Type your reply…"
              style={{
                flex: 1,
                background: "#1C1C1E",
                border: "1px solid #2A2A2A",
                borderRadius: 20,
                padding: "8px 14px",
                color: "#E5E7EB",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!userInput.trim()}
              style={{
                width: 36, height: 36,
                borderRadius: "50%",
                background: userInput.trim() ? "#2563EB" : "#222",
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: userInput.trim() ? "pointer" : "default",
                flexShrink: 0,
              }}
            >
              <Send style={{ width: 15, height: 15, color: userInput.trim() ? "#fff" : "#444" }} />
            </button>
          </div>
        )}

        {/* Bottom control bar */}
        <div style={{ padding: "16px 24px 28px", display: "flex", alignItems: "center", justifyContent: "space-around", flexShrink: 0 }}>

          {/* Mute TTS */}
          <button
            onClick={() => { setVoiceOn(v => !v); if (voiceOn) stopSpeaking(); }}
            style={{ width: 52, height: 52, borderRadius: "50%", background: "#1C1C1E", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            title={voiceOn ? "Mute voice" : "Unmute voice"}
          >
            {voiceOn
              ? <Volume2 style={{ width: 22, height: 22, color: "#E5E7EB" }} />
              : <VolumeX style={{ width: 22, height: 22, color: "#666" }} />
            }
          </button>

          {/* Main call button */}
          {callState === "idle" || callState === "ended" ? (
            <button
              onClick={() => nodes.length ? startCall() : undefined}
              disabled={!nodes.length}
              style={{
                width: 72, height: 72,
                borderRadius: "50%",
                background: nodes.length ? "#22C55E" : "#333",
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: nodes.length ? "pointer" : "default",
                boxShadow: nodes.length ? "0 0 24px rgba(34,197,94,0.4)" : "none",
                transition: "all 0.2s",
              }}
              title={callState === "ended" ? "Call again" : "Start call"}
            >
              {callState === "ended"
                ? <RotateCcw style={{ width: 28, height: 28, color: "white" }} />
                : <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
              }
            </button>
          ) : callState === "ringing" ? (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(245,158,11,0.5)", animation: "pulse 1s ease-in-out infinite" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </div>
          ) : (
            <button
              onClick={hangUp}
              style={{
                width: 72, height: 72,
                borderRadius: "50%",
                background: "#EF4444",
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(239,68,68,0.4)",
              }}
              title="Hang up"
            >
              <PhoneOff style={{ width: 28, height: 28, color: "white" }} />
            </button>
          )}

          {/* Mic */}
          <button
            onClick={toggleMic}
            disabled={!awaitingInput || callState !== "active"}
            style={{
              width: 52, height: 52,
              borderRadius: "50%",
              background: listening ? "#EF4444" : "#1C1C1E",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: awaitingInput && callState === "active" ? "pointer" : "default",
              opacity: awaitingInput && callState === "active" ? 1 : 0.4,
              boxShadow: listening ? "0 0 16px rgba(239,68,68,0.5)" : "none",
            }}
            title={listening ? "Stop listening" : "Speak your reply"}
          >
            {listening
              ? <MicOff style={{ width: 22, height: 22, color: "#fff" }} />
              : <Mic style={{ width: 22, height: 22, color: awaitingInput ? "#E5E7EB" : "#555" }} />
            }
          </button>
        </div>
      </div>

      {/* Close button outside the phone */}
      <button
        onClick={() => { stopSpeaking(); onClose(); }}
        className="absolute top-6 right-6 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        title="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Pulse animation for ringing */}
      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes pulse-bar { from { transform: scaleY(0.5); } to { transform: scaleY(1); } }
      `}</style>
    </div>
  );
}
