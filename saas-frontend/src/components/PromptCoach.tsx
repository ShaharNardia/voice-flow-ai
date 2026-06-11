"use client";

/**
 * Prompt Coach — AI sidebar chatbot for improving assistant system prompts.
 *
 * Opens as a right-side drawer from the assistant editor.
 * Has full context of:
 *   - The assistant being edited
 *   - Recent call transcripts & analytics
 *   - Optional specific call IDs to review
 *
 * The coach can:
 *   - Diagnose failures in specific calls
 *   - Suggest prompt improvements
 *   - Apply prompt updates directly (looks for ```APPLY_PROMPT block)
 */

import React, { useEffect, useRef, useState } from "react";
import { X, Send, Bot, Loader, CheckCircle, AlertCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const FN = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PromptCoachProps {
  assistantId: string;
  assistantName: string;
  currentPrompt: string;
  onPromptApplied: (newPrompt: string) => void;
  onClose: () => void;
  /** Optional pre-loaded call IDs to analyse (e.g. from call detail page) */
  callIds?: string[];
}

// Strip the ```APPLY_PROMPT block from displayed text — show a pill instead
function stripApplyBlock(text: string): { display: string; extracted: string | null } {
  const match = text.match(/```APPLY_PROMPT\n([\s\S]*?)```/);
  if (!match) return { display: text, extracted: null };
  const display = text.replace(/```APPLY_PROMPT\n[\s\S]*?```/, "").trim();
  return { display, extracted: match[1].trim() };
}

export function PromptCoach({ assistantId, assistantName, currentPrompt, onPromptApplied, onClose, callIds }: PromptCoachProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [appliedSuccessfully, setAppliedSuccessfully] = useState(false);
  const [showCurrentPrompt, setShowCurrentPrompt] = useState(false);
  const [callIdInput, setCallIdInput] = useState(callIds?.join(", ") || "");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Initial greeting message on mount
  useEffect(() => {
    const callCtx = callIds && callIds.length > 0
      ? `I'll analyse **${callIds.length}** specific call(s) you've linked. `
      : "I'll analyse the most recent calls automatically. ";
    setMessages([{
      role: "assistant",
      content: `👋 Hi! I'm your Prompt Coach for **${assistantName}**.\n\n${callCtx}Tell me what you want to improve — e.g.:\n- "What went wrong in the last call?"\n- "The bot gives double responses — fix it"\n- "Rewrite the prompt to handle out-of-scope questions better"\n\nWhen you're happy with a suggested prompt, say **"apply"** to save it.`,
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    setAppliedSuccessfully(false);

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const ids = callIdInput.split(/[\s,]+/).filter(Boolean);
      const r = await fetch(`${FN}/promptCoachChat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          messages: newMessages,
          callIds: ids.length > 0 ? ids : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed"); return; }

      const { display, extracted } = stripApplyBlock(d.reply || "");
      setMessages([...newMessages, { role: "assistant", content: display || d.reply }]);

      if (d.appliedPatch) {
        setAppliedSuccessfully(true);
        if (d.suggestedPrompt) onPromptApplied(d.suggestedPrompt);
        setPendingPrompt(null);
      } else if (d.suggestedPrompt || extracted) {
        setPendingPrompt(d.suggestedPrompt || extracted);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const applyPrompt = async () => {
    if (!pendingPrompt) return;
    // Trigger by sending "apply" through the normal flow so it's logged
    setInput("apply");
    // Small hack — push it as user message and send
    await new Promise((r) => setTimeout(r, 50));
    send();
    setPendingPrompt(null);
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-neutral-200 shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-violet-50 to-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Prompt Coach</h3>
            <p className="text-[10px] text-neutral-500">{assistantName}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-lg p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Call IDs input */}
      <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide whitespace-nowrap">Calls to review:</label>
          <input
            type="text"
            value={callIdInput}
            onChange={(e) => setCallIdInput(e.target.value)}
            placeholder="paste call IDs (optional)"
            className="flex-1 text-xs font-mono bg-white border border-neutral-200 rounded px-2 py-1 text-neutral-700 min-w-0"
          />
        </div>
      </div>

      {/* Current prompt collapsible */}
      <div className="border-b border-neutral-100">
        <button
          onClick={() => setShowCurrentPrompt(!showCurrentPrompt)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          <span className="font-medium">Current system prompt</span>
          {showCurrentPrompt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showCurrentPrompt && (
          <div className="px-3 pb-2 max-h-40 overflow-y-auto">
            <pre className="text-[10px] text-neutral-600 whitespace-pre-wrap font-sans bg-neutral-50 rounded p-2">
              {currentPrompt || "(empty)"}
            </pre>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-violet-600 text-white"
                : "bg-neutral-100 text-neutral-800"
            }`}>
              {m.role === "assistant" ? (
                <MarkdownLite text={m.content} />
              ) : (
                <span>{m.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader className="w-3.5 h-3.5 animate-spin text-violet-600" />
              <span className="text-xs text-neutral-500">Analysing…</span>
            </div>
          </div>
        )}

        {/* Pending prompt apply card */}
        {pendingPrompt && !appliedSuccessfully && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Bot className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-xs font-semibold text-violet-800">New prompt ready to apply</span>
            </div>
            <pre className="text-[10px] text-violet-900 whitespace-pre-wrap font-sans bg-white border border-violet-100 rounded p-2 max-h-40 overflow-y-auto mb-2">
              {pendingPrompt}
            </pre>
            <div className="flex items-center gap-2">
              <button
                onClick={applyPrompt}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Apply to assistant
              </button>
              <button
                onClick={() => setPendingPrompt(null)}
                className="px-3 py-1.5 text-xs text-neutral-500 border border-neutral-200 rounded-lg hover:bg-neutral-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {appliedSuccessfully && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-xs text-emerald-800 font-medium">Prompt applied and saved ✓</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="e.g. what went wrong? / fix double responses / rewrite the prompt…"
            rows={2}
            className="flex-1 resize-none text-sm border border-neutral-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-9 h-9 flex items-center justify-center bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-1 text-center">Enter to send · Shift+Enter for new line · Say &quot;apply&quot; to save</p>
      </div>
    </div>
  );
}

// ── Minimal markdown renderer (bold, bullets, headers) ────────────────────────
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-semibold text-neutral-900 text-xs mt-1">{line.slice(4)}</p>;
        if (line.startsWith("## "))  return <p key={i} className="font-bold text-neutral-900 text-xs mt-1">{line.slice(3)}</p>;
        if (line.startsWith("# "))   return <p key={i} className="font-bold text-neutral-900 mt-1">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <div key={i} className="flex gap-1.5"><span className="text-violet-500 mt-0.5">•</span><span>{renderBold(line.slice(2))}</span></div>;
        }
        if (/^\d+\. /.test(line)) {
          const [num, ...rest] = line.split(". ");
          return <div key={i} className="flex gap-1.5"><span className="text-violet-500 font-mono">{num}.</span><span>{renderBold(rest.join(". "))}</span></div>;
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
