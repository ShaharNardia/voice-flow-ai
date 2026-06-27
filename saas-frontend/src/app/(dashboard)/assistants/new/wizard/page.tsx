"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  wizardChat,
  wizardSTT,
  wizardTTS,
  assistantsCreate,
  type WizardState,
  type WizardAssistantConfig,
} from "@/lib/firebase-functions";
import { Sparkles, Send, Loader2, Check, ArrowLeft, Bot, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function AssistantWizardInner() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hi! I'll help you build a phone-bot in a few questions. What's the business, and what do you want the phone bot to do on calls?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<WizardState>({});
  const [config, setConfig] = useState<WizardAssistantConfig | null>(null);
  const [done, setDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Voice mode
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const speak = async (text: string) => {
    if (muted || !text) return;
    try {
      setSpeaking(true);
      const blob = await wizardTTS({ text });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (e) {
      console.warn("TTS failed", e);
      setSpeaking(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text || sending) return;
    setError("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    try {
      const res = await wizardChat({ sessionId, userMessage: text, voiceMode });
      setSessionId(res.sessionId);
      setState(res.state);
      setConfig(res.assistantConfig);
      setDone(res.done);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (voiceMode) speak(res.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setSending(false);
    }
  };

  const send = () => sendMessage(input.trim());

  const startRecording = async () => {
    if (recording || transcribing) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); setSpeaking(false); }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (!chunksRef.current.length) return;
        const blob = new Blob(chunksRef.current, { type: mime });
        const audioBase64 = await blobToBase64(blob);
        setTranscribing(true);
        try {
          const r = await wizardSTT({ audioBase64, mimeType: mime, language: state.basics?.language });
          const text = (r.transcript || "").trim();
          if (text) sendMessage(text);
          else setError("Didn't catch that — try again.");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic access denied");
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const toggleVoiceMode = () => {
    const next = !voiceMode;
    setVoiceMode(next);
    if (!next) {
      stopRecording();
      if (audioRef.current) { audioRef.current.pause(); setSpeaking(false); }
    }
  };

  const createAssistant = async () => {
    if (!config) return;
    setCreating(true);
    setError("");
    try {
      const created = await assistantsCreate({
        name: config.name,
        assistantName: config.assistantName,
        companyName: config.companyName,
        language: config.language,
        firstMessage: config.firstMessage,
        voice: config.voice,
        systemPrompt: config.systemPrompt,
        // Pass enabled tools so the finalizer-created assistant is fully wired.
        ...(config.tools && config.tools.length ? { enabledTools: config.tools } : {}),
      } as Parameters<typeof assistantsCreate>[0]);
      router.push(`/assistants/${created.id || ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/assistants" className="text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#F22F46]" />
              AI Wizard
            </h1>
            <p className="text-sm text-neutral-500">
              {voiceMode ? "Talk to the wizard — tap the mic and speak." : "Describe your business. I'll configure the phone-bot for you."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            disabled={!voiceMode}
            title={muted ? "Unmute replies" : "Mute replies"}
            className="p-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleVoiceMode}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              voiceMode
                ? "bg-[#F22F46] border-[#F22F46] text-white"
                : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            <Mic className="w-4 h-4" />
            {voiceMode ? "Voice on" : "Voice off"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Chat pane */}
        <div className="bg-white border border-neutral-200 rounded-xl flex flex-col h-[70vh]">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "bg-[#F22F46] text-white px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[80%] text-sm leading-relaxed"
                      : "bg-neutral-100 text-neutral-800 px-4 py-2.5 rounded-2xl rounded-bl-sm max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {(sending || transcribing) && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 px-4 py-2.5 rounded-2xl text-sm text-neutral-500 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {transcribing ? "Transcribing…" : "Thinking…"}
                </div>
              </div>
            )}
            {speaking && (
              <div className="flex justify-start">
                <div className="bg-violet-50 border border-violet-200 text-violet-700 px-4 py-2 rounded-2xl text-xs flex items-center gap-2">
                  <Volume2 className="w-3 h-3" /> Speaking…
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {error && (
            <div className="mx-5 mb-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{error}</div>
          )}
          <div className="border-t border-neutral-200 p-3 flex gap-2">
            {voiceMode ? (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={sending || transcribing}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium select-none ${
                  recording
                    ? "bg-red-600 text-white animate-pulse"
                    : "bg-[#F22F46] hover:bg-[#d9243b] text-white disabled:opacity-50"
                }`}
              >
                {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {recording ? "Release to send" : "Hold to talk"}
              </button>
            ) : (
              <>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Type your answer…"
                  disabled={sending}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:opacity-60"
                />
                <button
                  onClick={send}
                  disabled={sending || !input.trim()}
                  className="bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </>
            )}
          </div>
        </div>

        {/* Preview pane */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 h-fit sticky top-6">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-violet-600" />
            <h2 className="font-semibold text-neutral-900">Preview</h2>
          </div>
          <div className="space-y-3 text-sm">
            <Row label="Name" value={state.basics?.name} />
            <Row label="Company" value={state.basics?.companyName} />
            <Row label="Language" value={state.basics?.language} />
            <Row label="Voice" value={state.personality?.voice} />
            <Row label="Tone" value={state.personality?.tone} />
            <Row label="Greeting" value={state.basics?.firstMessage} multiline />
            <Row label="Tools" value={(state.tools || []).map((t) => t.toolId).join(", ")} />
            {state.personality?.systemPrompt && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">System prompt</div>
                <div className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {state.personality.systemPrompt}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={createAssistant}
            disabled={!done || creating}
            className="mt-5 w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {creating ? "Creating…" : done ? "Create this assistant" : "Keep chatting to finalize"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">{label}</div>
      <div className={`text-neutral-800 ${multiline ? "text-xs whitespace-pre-wrap" : "truncate"}`}>
        {value || <span className="text-neutral-300 italic">—</span>}
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export default function AssistantWizardPage() {
  return (
    <FeatureGate featureId="cap.assistantWizard">
      <AssistantWizardInner />
    </FeatureGate>
  );
}
