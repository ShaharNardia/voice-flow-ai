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

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Wand2, AlertTriangle, Headphones, Download } from "lucide-react";
import { assistantTestChat, assistantVoiceReplay, type TestChatToolCall, type VoiceReplayResult } from "@/lib/firebase-functions";

interface Turn { role: "user" | "assistant" | "tool"; content?: string; }
interface Pair { user: string; oldAnswer: string; }
interface Row extends Pair { newAnswer: string; toolCalls?: TestChatToolCall[]; pending?: boolean; }

const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

export default function CallReplay({
  assistantId,
  history,
  callSessionId,
}: {
  assistantId?: string;
  history: Turn[];
  callSessionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [ovPrompt, setOvPrompt] = useState("");
  const [ovFlow, setOvFlow] = useState("");

  // ── Live voice replay (run as a real call, hear the conversation) ──────
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceResult, setVoiceResult] = useState<VoiceReplayResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");

  // Revoke the blob URL when it changes or the component unmounts.
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function runVoiceReplay() {
    if (!assistantId || !callSessionId) return;
    setVoiceRunning(true); setVoiceErr(""); setVoiceResult(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(""); }
    try {
      const res = await assistantVoiceReplay({ callSessionId, assistantId, maxTurns: 6 });
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: res.audioMime || "audio/wav" }));
      setAudioUrl(url);
      setVoiceResult(res);
    } catch (e: unknown) {
      setVoiceErr(e instanceof Error ? e.message : "Voice replay failed");
    } finally {
      setVoiceRunning(false);
    }
  }

  // Build a readable chat transcript from the replay: greeting, then each caller
  // turn paired with the bot's reply (best-effort ordering).
  const voiceConvo = useMemo(() => {
    if (!voiceResult) return [] as { role: "bot" | "caller"; text: string }[];
    const out: { role: "bot" | "caller"; text: string }[] = [];
    const bot = voiceResult.botTranscript || [];
    const callers = voiceResult.callerTurns || [];
    let bi = 0;
    if (bot[bi]) out.push({ role: "bot", text: bot[bi++] });
    for (const c of callers) {
      out.push({ role: "caller", text: c });
      if (bot[bi]) out.push({ role: "bot", text: bot[bi++] });
    }
    while (bi < bot.length) out.push({ role: "bot", text: bot[bi++] });
    return out;
  }, [voiceResult]);

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
                    onClick={runVoiceReplay}
                    disabled={voiceRunning || !callSessionId}
                    title={!callSessionId ? "Call id unavailable" : "Re-run as a real voice call and listen to the conversation"}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {voiceRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Headphones className="w-4 h-4" />}
                    {voiceRunning ? "Running live call…" : "Run as live voice call"}
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

              {/* ── Live voice replay result ─────────────────────────── */}
              {voiceErr && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{voiceErr}</div>
              )}
              {voiceRunning && !voiceResult && (
                <div className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Running a real voice call against the current settings — speaking each caller turn into the live pipeline and recording the bot. This can take up to a minute…
                </div>
              )}
              {voiceResult && audioUrl && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-semibold text-indigo-800 flex items-center gap-1">
                      <Headphones className="w-3.5 h-3.5" /> Live voice replay
                    </span>
                    <span className="text-neutral-500">· {voiceResult.provider}</span>
                    <span className="text-neutral-500">· {(voiceResult.durationMs / 1000).toFixed(1)}s</span>
                    {!voiceResult.botSpoke && (
                      <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> bot produced no audio</span>
                    )}
                    {voiceResult.truncated && (
                      <span className="text-neutral-400">· first {voiceResult.callerTurns.length} of {voiceResult.totalCallerTurns} turns</span>
                    )}
                    <a
                      href={audioUrl}
                      download={`replay-${callSessionId || "call"}.wav`}
                      className="ml-auto flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" /> Download WAV
                    </a>
                  </div>
                  <audio controls src={audioUrl} className="w-full" />
                  <p className="text-[11px] text-neutral-400">
                    This is a real run through the live voice pipeline with the assistant&apos;s current prompt, flow &amp; tools. The caller is a synthesized stand-in; SMS / email / transfer actions are simulated, not sent.
                  </p>
                  {voiceConvo.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {voiceConvo.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "caller" ? "justify-start" : "justify-end"}`}>
                          <div
                            dir="auto"
                            className={`max-w-[80%] text-sm rounded-2xl px-3 py-1.5 ${
                              m.role === "caller"
                                ? "bg-white border border-neutral-200 text-neutral-700 rounded-bl-sm"
                                : "bg-indigo-600 text-white rounded-br-sm"
                            }`}
                          >
                            <span className="text-[10px] opacity-60 block">{m.role === "caller" ? "🗣️ caller" : "🤖 bot"}</span>
                            {m.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
