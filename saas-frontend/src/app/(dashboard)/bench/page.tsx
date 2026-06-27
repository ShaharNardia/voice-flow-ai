"use client";

/**
 * Phase 1 Validation Bench — STT/TTS provider A/B harness.
 *
 * Three tabs:
 *   - STT: upload audio → side-by-side transcripts from all providers → WER vs reference
 *   - TTS: input text → generate with multiple providers/voices → 5-star rating widget
 *   - Results: filterable history of every run
 */

import React, { useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, RefreshCw, Star, Trash2, Plus, X } from "lucide-react";

const FN = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

// ────────────────────────────────────────────────────────────────────────────
// WER (word-error-rate) via Levenshtein on tokenized words
// Returns substitution/insertion/deletion percentage * 100
// ────────────────────────────────────────────────────────────────────────────
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    // Normalize Hebrew nikud, Arabic diacritics, Greek tonos to base chars
    .normalize("NFD")
    .replace(/[֑-ׇً-ْ̀-ͯ]/g, "")
    // Strip punctuation but keep alpha (including non-Latin scripts)
    .replace(/[.,!?;:"'()[\]{}\-—–]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function wer(reference: string, hypothesis: string): { wer: number; cer: number; ref: number; hyp: number } {
  const r = tokenize(reference);
  const h = tokenize(hypothesis);
  if (r.length === 0) return { wer: hypothesis ? 1 : 0, cer: 0, ref: 0, hyp: h.length };
  // Word-level Levenshtein
  const dp: number[][] = Array.from({ length: r.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) dp[i][0] = i;
  for (let j = 0; j <= h.length; j++) dp[0][j] = j;
  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      if (r[i - 1] === h[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const editDist = dp[r.length][h.length];

  // Char-level
  const rc = reference.normalize("NFD").replace(/[֑-ׇً-ْ̀-ͯ]/g, "").replace(/\s+/g, "");
  const hc = hypothesis.normalize("NFD").replace(/[֑-ׇً-ْ̀-ͯ]/g, "").replace(/\s+/g, "");
  // For perf, skip CER if too long
  let cer = 0;
  if (rc.length > 0 && rc.length < 2000 && hc.length < 2000) {
    const cdp: number[][] = Array.from({ length: rc.length + 1 }, () => new Array(hc.length + 1).fill(0));
    for (let i = 0; i <= rc.length; i++) cdp[i][0] = i;
    for (let j = 0; j <= hc.length; j++) cdp[0][j] = j;
    for (let i = 1; i <= rc.length; i++) {
      for (let j = 1; j <= hc.length; j++) {
        cdp[i][j] = rc[i - 1] === hc[j - 1] ? cdp[i - 1][j - 1] : 1 + Math.min(cdp[i - 1][j - 1], cdp[i - 1][j], cdp[i][j - 1]);
      }
    }
    cer = cdp[rc.length][hc.length] / rc.length;
  }

  return { wer: editDist / r.length, cer, ref: r.length, hyp: h.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level page
// ────────────────────────────────────────────────────────────────────────────
export default function BenchPage() {
  const [tab, setTab] = useState<"stt" | "tts" | "results">("stt");

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Bench — Phase 1 STT/TTS Validation</h2>
        <p className="text-sm text-neutral-500 mt-0.5">A/B test transcription accuracy and voice quality across providers</p>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-neutral-200">
        {(["stt", "tts", "results"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-blue-500 text-blue-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t === "stt" ? "STT Tests" : t === "tts" ? "TTS Tests" : "Results"}
          </button>
        ))}
      </div>

      {tab === "stt" && <SttTab />}
      {tab === "tts" && <TtsTab />}
      {tab === "results" && <ResultsTab />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STT Tab
// ────────────────────────────────────────────────────────────────────────────
type SttResult = { provider: string; transcript?: string; error?: string; latencyMs?: number; costEstimate?: number };

const STT_PROVIDERS = ["elevenlabs", "deepgram", "openai"] as const;
const LANGUAGES = [
  { code: "", label: "Auto-detect" },
  { code: "he", label: "Hebrew" },
  { code: "el", label: "Greek" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
];

function SttTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioName, setAudioName] = useState<string>("");
  const [language, setLanguage] = useState("");
  const [reference, setReference] = useState("");
  const [providers, setProviders] = useState<string[]>(STT_PROVIDERS.slice());
  const [results, setResults] = useState<SttResult[] | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onFile = async (f: File) => {
    setErr(""); setResults(null);
    setBusy(true);
    try {
      // Get signed upload URL
      const u = await fetch(`${FN}/benchUploadUrl?filename=${encodeURIComponent(f.name)}&contentType=${encodeURIComponent(f.type || "audio/wav")}`).then((r) => r.json());
      // PUT the file directly
      await fetch(u.uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type || "audio/wav" } });
      setAudioUrl(u.publicUrl);
      setAudioName(f.name);
    } catch (e) {
      setErr("Upload failed: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!audioUrl) { setErr("Upload audio first"); return; }
    setBusy(true); setErr(""); setResults(null);
    try {
      const r = await fetch(`${FN}/benchSttRun`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl, language: language || undefined, providers }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Failed"); return; }
      setResults(d.results || []);
      setRunId(d.runId || "");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left column — inputs */}
      <div className="lg:col-span-1 space-y-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Audio</h3>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            className="text-xs w-full"
          />
          {audioName && <p className="text-[11px] text-neutral-500 mt-1.5 truncate">📁 {audioName}</p>}
          {audioUrl && (
            <audio controls src={audioUrl} className="w-full mt-2" />
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Language hint</h3>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 bg-white">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Providers</h3>
          {STT_PROVIDERS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={providers.includes(p)}
                onChange={(e) => setProviders(e.target.checked ? [...providers, p] : providers.filter((x) => x !== p))}
              />
              <span className="capitalize">{p}</span>
            </label>
          ))}
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Reference transcript (for WER)</h3>
          <textarea
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            rows={5}
            placeholder="Paste the ground-truth transcription here…"
            className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5"
            dir="auto"
          />
        </div>

        <button
          onClick={run}
          disabled={busy || !audioUrl}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {busy ? "Working…" : "Run benchmark"}
        </button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      {/* Right column — results */}
      <div className="lg:col-span-2 space-y-3">
        {!results && <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-neutral-400 text-sm">Run a benchmark to see results</div>}
        {results && results.map((r) => {
          const m = reference && r.transcript ? wer(reference, r.transcript) : null;
          return (
            <div key={r.provider} className="bg-white border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold capitalize text-neutral-800">{r.provider}</h3>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  {r.latencyMs && <span>⏱ {r.latencyMs} ms</span>}
                  {r.costEstimate !== undefined && <span>💰 ${r.costEstimate.toFixed(5)}</span>}
                  {m && (
                    <>
                      <span className={`font-semibold ${m.wer < 0.1 ? "text-green-700" : m.wer < 0.2 ? "text-amber-700" : "text-red-700"}`}>
                        WER {(m.wer * 100).toFixed(1)}%
                      </span>
                      <span>CER {(m.cer * 100).toFixed(1)}%</span>
                    </>
                  )}
                </div>
              </div>
              {r.error ? (
                <p className="text-xs text-red-600 bg-red-50 rounded p-2 whitespace-pre-wrap">{r.error}</p>
              ) : (
                <p className="text-sm text-neutral-700 whitespace-pre-wrap" dir="auto">{r.transcript}</p>
              )}
            </div>
          );
        })}
        {runId && <p className="text-[11px] text-neutral-400 text-center">Run ID: <span className="font-mono">{runId}</span></p>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TTS Tab
// ────────────────────────────────────────────────────────────────────────────
type TtsItem = { provider: string; voiceId: string; label: string };
type TtsResult = { provider: string; voiceId?: string | null; label?: string | null; audioUrl?: string; error?: string; latencyMs?: number; costEstimate?: number };

// Curated voices per provider — extend as you discover good ones during bench
const PRESET_VOICES: Record<string, Record<string, TtsItem[]>> = {
  he: {
    elevenlabs: [
      { provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x", label: "Aria (EN-multi)" },
      { provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (EN-multi)" },
      { provider: "elevenlabs", voiceId: "FGY2WhTYpPnrIDTdsKH5", label: "Laura (EN-multi)" },
    ],
    openai: [
      { provider: "openai", voiceId: "alloy", label: "Alloy" },
      { provider: "openai", voiceId: "shimmer", label: "Shimmer" },
      { provider: "openai", voiceId: "nova", label: "Nova" },
    ],
  },
  el: {
    elevenlabs: [
      { provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x", label: "Aria (multi)" },
      { provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (multi)" },
    ],
    openai: [
      { provider: "openai", voiceId: "alloy", label: "Alloy" },
      { provider: "openai", voiceId: "shimmer", label: "Shimmer" },
    ],
  },
  ar: {
    elevenlabs: [
      { provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x", label: "Aria (multi — likely MSA)" },
      { provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (multi)" },
    ],
    // OpenAI gpt-4o-mini-tts has no Arabic support documented; skip
  },
  en: {
    elevenlabs: [
      { provider: "elevenlabs", voiceId: "9BWtsMINqrJLrRacOk9x", label: "Aria" },
    ],
    openai: [
      { provider: "openai", voiceId: "alloy", label: "Alloy" },
    ],
  },
};

function TtsTab() {
  const [language, setLanguage] = useState("he");
  const [text, setText] = useState("שלום, הגעתם לכללית סמייל. איך אפשר לעזור?");
  const [items, setItems] = useState<TtsItem[]>([]);
  const [results, setResults] = useState<TtsResult[] | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listenerEmail, setListenerEmail] = useState("");

  // Pre-populate items when language changes
  useEffect(() => {
    const presets = PRESET_VOICES[language] || {};
    const all: TtsItem[] = [];
    for (const p of Object.values(presets)) all.push(...p);
    setItems(all);
    setResults(null);
  }, [language]);

  const addCustom = () => {
    setItems([...items, { provider: "elevenlabs", voiceId: "", label: "Custom" }]);
  };

  const run = async () => {
    if (!text.trim() || items.length === 0) { setErr("text + at least one voice required"); return; }
    setBusy(true); setErr(""); setResults(null);
    try {
      const r = await fetch(`${FN}/benchTtsGenerate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), language, items: items.filter((it) => it.voiceId.trim()) }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Failed"); return; }
      setResults(d.results || []);
      setRunId(d.runId || "");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Language</h3>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="he">Hebrew</option>
            <option value="el">Greek</option>
            <option value="ar">Arabic (Levantine target)</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Text to speak</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5"
            dir="auto"
          />
          <p className="text-[10px] text-neutral-400 mt-1">{text.length} chars · ~{Math.ceil(text.length / 15)}s spoken</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-800">Voices to test ({items.length})</h3>
            <button onClick={addCustom} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-1 text-xs">
                <select
                  value={it.provider}
                  onChange={(e) => { const next = [...items]; next[i] = { ...it, provider: e.target.value }; setItems(next); }}
                  className="border border-neutral-200 rounded px-1 py-1 bg-white"
                >
                  <option value="elevenlabs">elevenlabs</option>
                  <option value="openai">openai</option>
                </select>
                <input
                  type="text"
                  value={it.voiceId}
                  onChange={(e) => { const next = [...items]; next[i] = { ...it, voiceId: e.target.value }; setItems(next); }}
                  placeholder="voice id"
                  className="flex-1 border border-neutral-200 rounded px-1 py-1 font-mono"
                />
                <input
                  type="text"
                  value={it.label}
                  onChange={(e) => { const next = [...items]; next[i] = { ...it, label: e.target.value }; setItems(next); }}
                  placeholder="label"
                  className="w-20 border border-neutral-200 rounded px-1 py-1"
                />
                <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Listener email (optional)</h3>
          <input
            type="email"
            value={listenerEmail}
            onChange={(e) => setListenerEmail(e.target.value)}
            placeholder="listener@example.com"
            className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-1.5"
          />
          <p className="text-[10px] text-neutral-400 mt-1">Captured with each rating you submit below</p>
        </div>

        <button
          onClick={run}
          disabled={busy || !text.trim() || items.length === 0}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {busy ? "Generating…" : `Generate ${items.length} samples`}
        </button>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      <div className="lg:col-span-2 space-y-3">
        {!results && <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-neutral-400 text-sm">Generate samples to start rating</div>}
        {results && results.map((r, idx) => (
          <TtsResultCard key={idx} result={r} runId={runId} listenerEmail={listenerEmail} />
        ))}
        {runId && <p className="text-[11px] text-neutral-400 text-center">Run ID: <span className="font-mono">{runId}</span></p>}
      </div>
    </div>
  );
}

function TtsResultCard({ result, runId, listenerEmail }: { result: TtsResult; runId: string; listenerEmail: string }) {
  const [scores, setScores] = useState<{ naturalness?: number; intelligibility?: number; accent?: number }>({});
  const [savedDims, setSavedDims] = useState<Set<string>>(new Set());

  const submit = async (dimension: "naturalness" | "intelligibility" | "accent", score: number) => {
    setScores({ ...scores, [dimension]: score });
    try {
      const r = await fetch(`${FN}/benchScore`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, provider: result.provider, voiceId: result.voiceId, dimension, score, listenerEmail: listenerEmail || undefined }),
      });
      if (r.ok) { const next = new Set(savedDims); next.add(dimension); setSavedDims(next); }
    } catch { /* ignore */ }
  };

  if (result.error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold capitalize">{result.provider} · {result.label || result.voiceId}</span>
        </div>
        <p className="text-xs text-red-600 bg-red-50 rounded p-2">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold capitalize text-neutral-800">{result.provider} · {result.label || "—"}</h3>
          <p className="text-[11px] text-neutral-400 font-mono">{result.voiceId}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          {result.latencyMs && <span>⏱ {result.latencyMs} ms</span>}
          {result.costEstimate !== undefined && <span>💰 ${result.costEstimate.toFixed(5)}</span>}
        </div>
      </div>
      {result.audioUrl && <audio controls src={result.audioUrl} className="w-full mb-2" />}

      <div className="grid grid-cols-3 gap-2 mt-2">
        {(["naturalness", "intelligibility", "accent"] as const).map((dim) => (
          <div key={dim} className="bg-neutral-50 rounded-lg p-2">
            <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">{dim}</p>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => submit(dim, n)}
                  className={`w-5 h-5 ${(scores[dim] || 0) >= n ? "text-amber-500" : "text-neutral-300"} hover:text-amber-600`}
                >
                  <Star className="w-4 h-4 fill-current" />
                </button>
              ))}
              {savedDims.has(dim) && <span className="text-[10px] text-emerald-700 ml-1">✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Results Tab
// ────────────────────────────────────────────────────────────────────────────
interface RunRow { id: string; kind: string; language: string | null; text?: string; createdAt: number | null; providerCount: number; providers: string[]; }

function ResultsTab() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [filter, setFilter] = useState<"all" | "stt" | "tts">("all");
  const [loading, setLoading] = useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${FN}/benchListRuns?limit=100`);
      const d = await r.json();
      setRuns(Array.isArray(d) ? d : []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? runs : runs.filter((r) => r.kind === filter);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          {(["all", "stt", "tts"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-lg ${filter === f ? "bg-blue-50 text-blue-700" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">When</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Kind</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Lang</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Providers</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">Text/ID</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400 text-xs">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400 text-xs">No runs yet.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-3 py-2 text-xs text-neutral-500">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.kind === "stt" ? "bg-purple-50 text-purple-700" : "bg-cyan-50 text-cyan-700"}`}>{r.kind?.toUpperCase()}</span>
                </td>
                <td className="px-3 py-2 text-xs">{r.language || "—"}</td>
                <td className="px-3 py-2 text-xs">{r.providers.join(", ")}</td>
                <td className="px-3 py-2 text-xs text-neutral-600 max-w-md truncate font-mono">{r.text || r.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
