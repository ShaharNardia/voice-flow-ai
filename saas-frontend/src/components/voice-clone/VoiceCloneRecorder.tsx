"use client";

/**
 * VoiceCloneRecorder — a modal that captures the two recordings ElevenLabs
 * needs to clone a voice, plus a written attestation of ownership.
 *
 * Flow:
 *   1. Name the voice
 *   2. Read + record the legal consent phrase (5-10s)
 *   3. Read + record the natural-speech sample (60-90s)
 *   4. Check the ownership attestation box
 *   5. Submit — uploads both Blobs as multipart to /elevenlabsCloneVoice
 *
 * Key UX:
 *   - Live waveform during recording (Web Audio API analyser, no extra deps)
 *   - Playback both recordings before submit so customer can re-record if bad
 *   - Submit disabled until: name set, both recordings ≥ minimum length, both
 *     attestations checked. Eliminates a whole class of upload failures.
 */

import { useEffect, useRef, useState } from "react";
import {
  Mic, Square, Play, Pause, Trash2, Loader2, Check, AlertTriangle, X,
  CheckCircle2, ShieldCheck,
} from "lucide-react";
import { elevenlabsCloneVoice, type CustomVoice } from "@/lib/firebase-functions";

const CONSENT_PHRASE_EN = `I, [say your full name], am the owner of this voice. I authorize VoiceFlow AI to clone my voice and use it to speak on my behalf in AI-handled phone calls placed by my account. I understand that this voice clone can be deleted at any time on request.`;

const CONSENT_PHRASE_HE = `אני, [שם מלא], בעל הקול הזה. אני מאשר ל-VoiceFlow AI לשכפל את הקול שלי ולהשתמש בו במענה אוטומטי בשיחות טלפון מטעם החשבון שלי. אני מבין שאוכל למחוק את שכפול הקול בכל עת.`;

const SAMPLE_PROMPT_EN = `Read this paragraph naturally, as if explaining something to a friend. Vary your pitch and pacing — don't read it like a robot.

"Hello, my name is [your name] and I'm recording this so an AI can speak with my voice. The weather today is nice. I had coffee this morning at the small place around the corner, and then I went to the office. Tonight I'll probably watch a movie or read a book — I haven't decided yet. The number I'm thinking of is forty-two."`;

const SAMPLE_PROMPT_HE = `קרא את הפסקה הזאת באופן טבעי, כאילו אתה מסביר משהו לחבר. שנה את האינטונציה והקצב — לא לקרוא כמו רובוט.

"שלום, קוראים לי [השם שלך] ואני מקליט את זה כדי שבינה מלאכותית תוכל לדבר עם הקול שלי. מזג האוויר היום נחמד. שתיתי קפה הבוקר בפינה הקטנה ליד הבית, ואחר כך הלכתי למשרד. הערב אני כנראה אצפה בסרט או אקרא ספר — עוד לא החלטתי. המספר שאני חושב עליו הוא ארבעים ושתיים."`;

const MIN_CONSENT_MS = 5_000;    // 5s
const MIN_SAMPLE_MS  = 60_000;   // 60s
const MAX_SAMPLE_MS  = 120_000;  // 120s — ElevenLabs Instant cap is ~5min but we keep it tight

export interface VoiceCloneRecorderProps {
  open: boolean;
  language?: "en" | "he";
  onClose: () => void;
  onComplete: (voice: { voiceId: string; name: string }) => void;
}

type Stage = "consent" | "sample" | "review";

export default function VoiceCloneRecorder({ open, language = "en", onClose, onComplete }: VoiceCloneRecorderProps) {
  const [stage,     setStage]     = useState<Stage>("consent");
  const [name,      setName]      = useState("");
  const [attestOwn, setAttestOwn] = useState(false);
  const [attestUse, setAttestUse] = useState(false);

  // Recording state — separate per stage
  const [consentBlob, setConsentBlob] = useState<Blob | null>(null);
  const [consentMs,   setConsentMs]   = useState(0);
  const [sampleBlob,  setSampleBlob]  = useState<Blob | null>(null);
  const [sampleMs,    setSampleMs]    = useState(0);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  const consentText = language === "he" ? CONSENT_PHRASE_HE : CONSENT_PHRASE_EN;
  const samplePrompt = language === "he" ? SAMPLE_PROMPT_HE : SAMPLE_PROMPT_EN;

  // Reset on close so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setStage("consent");
      setName(""); setAttestOwn(false); setAttestUse(false);
      setConsentBlob(null); setSampleBlob(null);
      setConsentMs(0); setSampleMs(0);
      setUploading(false); setUploadErr("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!consentBlob || !sampleBlob) return;
    setUploading(true); setUploadErr("");
    try {
      const result = await elevenlabsCloneVoice({
        sampleFile: sampleBlob,
        consentFile: consentBlob,
        name: name.trim(),
        consentAttestation: consentText.replace(/\s+/g, " ").trim(),
        description: `Owner attests ownership + authorized use. Language: ${language}.`,
      });
      onComplete({ voiceId: result.voiceId, name: result.name });
      onClose();
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = !!name.trim() && !!consentBlob && !!sampleBlob && attestOwn && attestUse && !uploading;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <Mic className="w-5 h-5 text-purple-600" /> Clone Your Voice
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stage progress */}
        <div className="px-6 py-3 border-b border-neutral-100 flex items-center gap-2 text-xs flex-shrink-0">
          <StageDot active={stage === "consent"} done={!!consentBlob}    label="1. Consent" />
          <Sep />
          <StageDot active={stage === "sample"}  done={!!sampleBlob}     label="2. Sample"  />
          <Sep />
          <StageDot active={stage === "review"}  done={false}            label="3. Review"  />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {stage === "consent" && (
            <ConsentStage
              consentText={consentText}
              name={name} onName={setName}
              blob={consentBlob} ms={consentMs}
              onComplete={(blob, ms) => { setConsentBlob(blob); setConsentMs(ms); }}
              onRetake={() => { setConsentBlob(null); setConsentMs(0); }}
            />
          )}
          {stage === "sample" && (
            <SampleStage
              prompt={samplePrompt}
              blob={sampleBlob} ms={sampleMs}
              onComplete={(blob, ms) => { setSampleBlob(blob); setSampleMs(ms); }}
              onRetake={() => { setSampleBlob(null); setSampleMs(0); }}
            />
          )}
          {stage === "review" && (
            <ReviewStage
              name={name} consentMs={consentMs} sampleMs={sampleMs}
              attestOwn={attestOwn} setAttestOwn={setAttestOwn}
              attestUse={attestUse} setAttestUse={setAttestUse}
              uploadErr={uploadErr}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => {
              if (stage === "sample")  setStage("consent");
              if (stage === "review")  setStage("sample");
            }}
            disabled={stage === "consent" || uploading}
            className="text-sm px-3 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-30"
          >
            Back
          </button>

          {stage === "consent" && (
            <button
              onClick={() => setStage("sample")}
              disabled={!name.trim() || !consentBlob || consentMs < MIN_CONSENT_MS}
              className="flex items-center gap-1.5 text-sm px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Next: Voice Sample
            </button>
          )}
          {stage === "sample" && (
            <button
              onClick={() => setStage("review")}
              disabled={!sampleBlob || sampleMs < MIN_SAMPLE_MS}
              className="flex items-center gap-1.5 text-sm px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Next: Review &amp; Submit
            </button>
          )}
          {stage === "review" && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 text-sm px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {uploading ? "Cloning…" : "Clone My Voice"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-purple-700 font-semibold" : done ? "text-green-700" : "text-neutral-400"}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        done   ? "bg-green-100 text-green-700" :
        active ? "bg-purple-600 text-white" :
                 "bg-neutral-100 text-neutral-400"
      }`}>
        {done ? <Check className="w-3 h-3" /> : label[0]}
      </div>
      {label}
    </div>
  );
}
function Sep() { return <div className="flex-1 h-px bg-neutral-200" />; }

// ── Stage 1: Consent ─────────────────────────────────────────────────────────

function ConsentStage({
  consentText, name, onName, blob, ms, onComplete, onRetake,
}: {
  consentText: string;
  name: string;
  onName: (n: string) => void;
  blob: Blob | null;
  ms: number;
  onComplete: (blob: Blob, ms: number) => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">Voice Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="e.g. Dani's voice"
          maxLength={80}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm font-semibold text-amber-900">Legal consent phrase</div>
        </div>
        <p className="text-xs text-amber-800 mb-3">
          Read the following <strong>out loud, exactly as written</strong>. This is a legal requirement —
          it&apos;s archived as proof you authorized the voice clone, and ElevenLabs verifies consent before processing the sample.
        </p>
        <div className="bg-white border border-amber-200 rounded-lg p-3 text-sm text-neutral-800 leading-relaxed">
          &quot;{consentText}&quot;
        </div>
      </div>

      <Recorder
        minMs={MIN_CONSENT_MS}
        maxMs={30_000}
        blob={blob}
        ms={ms}
        onComplete={onComplete}
        onRetake={onRetake}
      />
    </div>
  );
}

// ── Stage 2: Sample ──────────────────────────────────────────────────────────

function SampleStage({ prompt, blob, ms, onComplete, onRetake }: {
  prompt: string;
  blob: Blob | null;
  ms: number;
  onComplete: (blob: Blob, ms: number) => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-purple-900 mb-2">Voice sample</div>
        <p className="text-xs text-purple-800 mb-3">
          We need <strong>60–120 seconds</strong> of natural speech to capture your voice quality.
          Speak as you normally would — avoid reading mechanically. A bit of variety (different sentence types, some emotion)
          dramatically improves the clone.
        </p>
        <div className="bg-white border border-purple-200 rounded-lg p-3 text-sm text-neutral-800 leading-relaxed whitespace-pre-line">
          {prompt}
        </div>
      </div>

      <Recorder
        minMs={MIN_SAMPLE_MS}
        maxMs={MAX_SAMPLE_MS}
        blob={blob}
        ms={ms}
        onComplete={onComplete}
        onRetake={onRetake}
      />

      <div className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
        <strong>Tips for a great clone:</strong>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li>Record in a quiet room — no background music, no other voices</li>
          <li>Speak at a normal conversational distance from the mic (~15-30cm)</li>
          <li>Vary your tone — questions, statements, slight emphasis on words</li>
          <li>Don&apos;t whisper or shout. Just talk like you do on a regular call.</li>
        </ul>
      </div>
    </div>
  );
}

// ── Stage 3: Review ──────────────────────────────────────────────────────────

function ReviewStage({
  name, consentMs, sampleMs, attestOwn, setAttestOwn, attestUse, setAttestUse, uploadErr,
}: {
  name: string; consentMs: number; sampleMs: number;
  attestOwn: boolean; setAttestOwn: (b: boolean) => void;
  attestUse: boolean; setAttestUse: (b: boolean) => void;
  uploadErr: string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-neutral-50 rounded-xl p-4">
        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Review</div>
        <div className="space-y-1.5 text-sm">
          <div><span className="text-neutral-500">Voice name:</span> <strong>{name}</strong></div>
          <div><span className="text-neutral-500">Consent recording:</span> {Math.round(consentMs / 1000)}s</div>
          <div><span className="text-neutral-500">Voice sample:</span> {Math.round(sampleMs / 1000)}s</div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-sm font-semibold text-amber-900">Required attestations</div>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={attestOwn}
            onChange={(e) => setAttestOwn(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500"
          />
          <span className="text-amber-900">
            I am the owner of this voice. I am not cloning a public figure, a celebrity, or anyone else who did not personally record this consent.
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={attestUse}
            onChange={(e) => setAttestUse(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500"
          />
          <span className="text-amber-900">
            I understand the cloned voice will be used to speak on AI-handled phone calls placed from my account, and that I can delete it at any time.
          </span>
        </label>
      </div>

      {uploadErr && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{uploadErr}</span>
        </div>
      )}
    </div>
  );
}

// ── Recorder primitive ───────────────────────────────────────────────────────
/**
 * Handles MediaRecorder lifecycle + live volume bar.
 * Emits the final Blob + duration in ms via onComplete.
 */
function Recorder({
  minMs, maxMs, blob, ms, onComplete, onRetake,
}: {
  minMs: number;
  maxMs: number;
  blob: Blob | null;
  ms: number;
  onComplete: (blob: Blob, ms: number) => void;
  onRetake: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error,     setError]     = useState("");
  const [level,     setLevel]     = useState(0); // 0..1
  const [playing,   setPlaying]   = useState(false);

  const mediaRef    = useRef<MediaRecorder | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const startedRef  = useRef<number>(0);
  const timerRef    = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef      = useRef<number | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const audioElRef  = useRef<HTMLAudioElement | null>(null);

  // Pick the best audio MIME type the browser supports.
  const pickMimeType = (): string => {
    const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (const m of opts) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "audio/webm";
  };

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } });
      streamRef.current = stream;

      // Volume meter
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      // Recorder
      const mr = new MediaRecorder(stream, { mimeType: pickMimeType() });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mr.mimeType });
        const elapsed = Date.now() - startedRef.current;
        onComplete(finalBlob, elapsed);
        teardown();
      };
      mr.start(250);  // gather chunks every 250ms
      startedRef.current = Date.now();
      setRecording(true);
      setElapsedMs(0);

      timerRef.current = window.setInterval(() => {
        const e = Date.now() - startedRef.current;
        setElapsedMs(e);
        if (e >= maxMs) stop();
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not access microphone");
      teardown();
    }
  };

  const stop = () => {
    setRecording(false);
    try { mediaRef.current?.stop(); } catch {}
  };

  const teardown = () => {
    if (timerRef.current)  { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  };

  useEffect(() => () => teardown(), []);

  const playBack = () => {
    if (!blob) return;
    const el = audioElRef.current!;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.src = URL.createObjectURL(blob);
      el.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const fmt = (ms: number) => `${Math.floor(ms / 1000)}s`;

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
      {/* Visual: live volume bar (recording) or playback bar (playback) */}
      <div className="h-12 bg-neutral-900 rounded-lg overflow-hidden flex items-end gap-0.5 p-1 mb-3">
        {Array.from({ length: 40 }).map((_, i) => {
          const t = (i + 1) / 40;
          const lit = level >= t * 0.6;
          return (
            <div
              key={i}
              className={`flex-1 transition-all ${
                lit ? (t > 0.9 ? "bg-red-500" : t > 0.7 ? "bg-amber-400" : "bg-green-500") : "bg-neutral-700"
              }`}
              style={{ height: `${Math.min(100, t * 100)}%` }}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          {recording
            ? <span className="text-red-600 font-mono font-semibold animate-pulse">● REC {fmt(elapsedMs)} / {fmt(maxMs)}</span>
            : blob
              ? <span className="font-mono">{fmt(ms)} recorded {ms < minMs && <span className="text-red-500">(need ≥ {fmt(minMs)})</span>}</span>
              : <span>Minimum {fmt(minMs)}, max {fmt(maxMs)}</span>}
        </div>

        <div className="flex items-center gap-2">
          {!recording && !blob && (
            <button onClick={start} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors">
              <Mic className="w-3.5 h-3.5" /> Start recording
            </button>
          )}
          {recording && (
            <button onClick={stop} className="flex items-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-900 text-white text-sm font-semibold rounded-lg transition-colors">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          {blob && !recording && (
            <>
              <button onClick={playBack} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-sm rounded-lg transition-colors">
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={onRetake} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-300 hover:bg-red-50 text-red-600 text-sm rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Re-record
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <audio ref={audioElRef} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}

// Re-export the public type for callers who want to type their onComplete handler
export type { CustomVoice };
