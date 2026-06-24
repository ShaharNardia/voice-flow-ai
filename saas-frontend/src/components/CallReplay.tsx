"use client";

/**
 * CallReplay — re-run a finished call's questions against the assistant's CURRENT
 * prompt / conversation-flow / tools and show OLD vs NEW answers side by side, so
 * you can see whether a fix actually changed the outcome.
 *
 * Pure client-side: replays each recorded USER turn through assistantTestChat
 * (which resolves the live saved assistant config + fires its tools). An optional
 * override lets you A/B a different prompt/flow before saving it.
 */

import { useMemo, useState } from "react";
import { Loader2, Play, Wand2, AlertTriangle } from "lucide-react";
import { assistantTestChat, type TestChatToolCall } from "@/lib/firebase-functions";

interface Turn { role: "user" | "assistant" | "tool"; content?: string; }
interface Pair { user: string; oldAnswer: string; }
interface Row extends Pair { newAnswer: string; toolCalls?: TestChatToolCall[]; pending?: boolean; }

const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

export default function CallReplay({
  assistantId,
  history,
}: {
  assistantId?: string;
  history: Turn[];
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [ovPrompt, setOvPrompt] = useState("");
  const [ovFlow, setOvFlow] = useState("");

  // Pair each recorded user turn with the assistant answer(s) that followed it.
  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    let cur: Pair | null = null;
    for (const m of history || []) {
      if (m.role === "user") {
        if (cur) out.push(cur);
        cur = { user: m.content || "", oldAnswer: "" };
      } else if (m.role === "assistant" && cur) {
        cur.oldAnswer += (cur.oldAnswer ? " " : "") + (m.content || "");
      }
    }
    if (cur) out.push(cur);
    return out.filter((p) => p.user.trim());
  }, [history]);

  async function runReplay() {
    if (!assistantId || pairs.length === 0) return;
    setRunning(true); setError(""); setRows([]);
    const override: Record<string, string> = {};
    if (ovPrompt.trim()) override.systemPrompt = ovPrompt.trim();
    if (ovFlow.trim()) override.conversationFlow = ovFlow.trim();

    const convo: { role: "user" | "assistant"; content: string }[] = [];
    const acc: Row[] = [];
    try {
      for (let i = 0; i < pairs.length; i++) {
        setProgress({ i: i + 1, n: pairs.length });
        const p = pairs[i];
        const res = await assistantTestChat({
          assistantId,
          message: p.user,
          history: convo,
          override: Object.keys(override).length ? override : undefined,
        });
        convo.push({ role: "user", content: p.user }, { role: "assistant", content: res.reply });
        acc.push({ ...p, newAnswer: res.reply, toolCalls: res.toolCalls });
        setRows([...acc]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Replay failed");
    } finally {
      setRunning(false); setProgress(null);
    }
  }

  if (!assistantId) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">🔁</div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900">Re-run &amp; Compare</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Replay this call against the assistant&apos;s current prompt, flow &amp; tools — see if the fix worked.
            </div>
          </div>
        </div>
        <span className="text-neutral-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-neutral-100 p-5 space-y-4">
          {pairs.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">No caller turns recorded for this call to replay.</p>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={runReplay}
                    disabled={running}
                    className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {running ? (progress ? `Re-running… ${progress.i}/${progress.n}` : "Re-running…") : `Re-run ${pairs.length} turn${pairs.length === 1 ? "" : "s"}`}
                  </button>
                  <button
                    onClick={() => setShowOverride((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> {showOverride ? "Hide" : "Test a different prompt/flow"}
                  </button>
                </div>
                <span className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Tools fire for real
                </span>
              </div>

              {showOverride && (
                <div className="space-y-2 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                  <p className="text-[11px] text-neutral-500">Leave blank to use the saved assistant. Fill to A/B a hypothetical fix without saving it.</p>
                  <textarea value={ovPrompt} onChange={(e) => setOvPrompt(e.target.value)} dir="auto" rows={3}
                    placeholder="Override system prompt (optional)…"
                    className="w-full text-xs border border-neutral-200 rounded px-2 py-1.5 font-mono" />
                  <textarea value={ovFlow} onChange={(e) => setOvFlow(e.target.value)} dir="auto" rows={3}
                    placeholder="Override conversation flow (optional)…"
                    className="w-full text-xs border border-neutral-200 rounded px-2 py-1.5 font-mono" />
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>
              )}

              {/* Side-by-side comparison */}
              {rows.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 px-1">
                    <div>Before — recorded on this call</div>
                    <div>After — current settings</div>
                  </div>
                  {rows.map((r, i) => {
                    const changed = norm(r.oldAnswer) !== norm(r.newAnswer);
                    return (
                      <div key={i} className="rounded-lg border border-neutral-200 overflow-hidden">
                        <div className="bg-neutral-50 px-3 py-2 text-xs text-neutral-600 flex items-center gap-2" dir="auto">
                          <span className="text-neutral-400 font-mono">#{i + 1}</span>
                          <span className="font-medium">🗣️ {r.user}</span>
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${changed ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {changed ? "✏ changed" : "≈ same"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-neutral-100">
                          <div className="p-3 text-sm text-neutral-700 bg-neutral-50/40" dir="auto">
                            {r.oldAnswer || <span className="text-neutral-300 italic">— (no answer recorded)</span>}
                          </div>
                          <div className="p-3 text-sm text-neutral-800 bg-violet-50/40" dir="auto">
                            {r.newAnswer || <span className="text-neutral-300 italic">—</span>}
                            {r.toolCalls && r.toolCalls.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {r.toolCalls.map((tc, j) => (
                                  <div key={j} className={`text-[10px] font-mono rounded border px-1.5 py-0.5 ${tc.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                                    🔧 {tc.name}({Object.entries(tc.args || {}).map(([k, v]) => `${k}=${String(v)}`).join(", ")}) {tc.ok ? "✓" : "✗"} {tc.status || ""}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
