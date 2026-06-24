"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PromptCoach } from "@/components/PromptCoach";
import VoiceCloneRecorder from "@/components/voice-clone/VoiceCloneRecorder";
import {
  assistantsGet, assistantsUpdate, assistantTestChat,
  knowledgeListFiles, knowledgeProcessFile, knowledgeDeleteFile,
  knowledgeProcessUrl, knowledgeSync, knowledgeProcessText, knowledgeCrawlReport,
  knowledgeClearAll, knowledgeGetSource, customToolTest,
  getCostConfig, scenariosList, scenariosCreate, scenarioWizardChat, scenarioWizardGenerate,
  toolPresetsList,
  type Assistant, type KnowledgeFile, type RateCard, type ScenarioDoc, type WizardMessage, type CrawlReport,
  type ToolPresetPack,
} from "@/lib/firebase-functions";
import { storage, auth } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft, BookOpen, ChevronDown, FileText, Link2, Loader2,
  MessageSquare, Mic, Mic2, Pencil, Play, Plus, RefreshCw, Save, Send, Settings,
  Sparkles, Square, Trash2, Type, Upload, Volume2, Wrench, X, Zap,
} from "lucide-react";

const ScenarioPhoneSimulator = dynamic(
  () => import("@/app/(dashboard)/scenarios/edit/_components/shared/ScenarioPhoneSimulator"),
  { ssr: false }
);

// ── Voice options ─────────────────────────────────────────────────────
// IMPORTANT: Every voice listed here must be Twilio-compatible for the Standard
// (STT→GPT→TTS) pipeline. Only Google.* and Polly.* voices are valid Twilio
// <Say> voices. The openai:* prefix voices are handled by the Cloud Run TTS
// wrapper and are only suitable for languages where Google/Polly have limited
// support (e.g. Hebrew). DO NOT add openai:* voices to Arabic — OpenAI TTS
// is English-optimised and produces degraded Arabic pronunciation.
//
// Each language group is STRICTLY scoped — the dropdown only ever shows voices
// for the assistant's configured language, preventing cross-language mismatches.
const VOICES_BY_LANG: Record<string, { value: string; label: string }[]> = {
  "en-US": [
    { value: "Google.en-US-Neural2-F", label: "🇺🇸 Google Neural2-F (Female)" },
    { value: "Google.en-US-Neural2-J", label: "🇺🇸 Google Neural2-J (Male)" },
    { value: "Google.en-US-Neural2-C", label: "🇺🇸 Google Neural2-C (Female)" },
    { value: "Google.en-US-Neural2-I", label: "🇺🇸 Google Neural2-I (Male)" },
    { value: "Polly.Joanna",           label: "🇺🇸 Polly Joanna (Female)" },
    { value: "Polly.Matthew",          label: "🇺🇸 Polly Matthew (Male)" },
    { value: "Polly.Amy",              label: "🇬🇧 Polly Amy (Female, UK)" },
  ],
  "en-GB": [
    { value: "Google.en-GB-Neural2-A", label: "🇬🇧 Google Neural2-A (Female)" },
    { value: "Google.en-GB-Neural2-B", label: "🇬🇧 Google Neural2-B (Male)" },
    { value: "Polly.Amy",              label: "🇬🇧 Polly Amy (Female)" },
    { value: "Polly.Brian",            label: "🇬🇧 Polly Brian (Male)" },
  ],
  "en-AU": [
    { value: "Google.en-AU-Neural2-A", label: "🇦🇺 Google Neural2-A (Female)" },
    { value: "Google.en-AU-Neural2-B", label: "🇦🇺 Google Neural2-B (Male)" },
    { value: "Google.en-AU-Neural2-C", label: "🇦🇺 Google Neural2-C (Female)" },
    { value: "Google.en-AU-Neural2-D", label: "🇦🇺 Google Neural2-D (Male)" },
    { value: "Polly.Olivia",           label: "🇦🇺 Polly Olivia (Female, Neural)" },
    { value: "Polly.Russell",          label: "🇦🇺 Polly Russell (Male)" },
  ],
  "he-IL": [
    // ElevenLabs multilingual (Turbo v2.5) — best natural Hebrew voice + best
    // understanding when paired with Deepgram-he STT. Recommended default.
    { value: "elevenlabs:21m00Tcm4TlvDq8ikWAM", label: "🇮🇱 ElevenLabs Rachel (Female, Recommended)" },
    { value: "elevenlabs:XB0fDUnXU5powFXDhCwa", label: "🇮🇱 ElevenLabs Charlotte (Female, Warm)" },
    { value: "elevenlabs:pNInz6obpgDQGcFmaJgB", label: "🇮🇱 ElevenLabs Adam (Male)" },
    { value: "elevenlabs:TxGEqnHWrfWFTfGW9XjX", label: "🇮🇱 ElevenLabs Josh (Male, Deep)" },
    { value: "openai:nova",                    label: "🇮🇱 OpenAI Nova (Female)" },
    { value: "openai:alloy",                   label: "🇮🇱 OpenAI Alloy (Neutral)" },
    { value: "openai:shimmer",                 label: "🇮🇱 OpenAI Shimmer (Female)" },
    { value: "openai:echo",                    label: "🇮🇱 OpenAI Echo (Male)" },
    { value: "openai:onyx",                    label: "🇮🇱 OpenAI Onyx (Male, Deep)" },
    { value: "Google.he-IL-Chirp3-HD-Achird",  label: "🇮🇱 Google Chirp3 Achird (Male)" },
    { value: "Google.he-IL-Chirp3-HD-Kore",    label: "🇮🇱 Google Chirp3 Kore (Female)" },
    { value: "Google.he-IL-Wavenet-D",         label: "🇮🇱 Google Wavenet-D (Male)" },
    { value: "Google.he-IL-Wavenet-A",         label: "🇮🇱 Google Wavenet-A (Female)" },
    { value: "Google.he-IL-Wavenet-B",         label: "🇮🇱 Google Wavenet-B (Male)" },
    { value: "Google.he-IL-Wavenet-C",         label: "🇮🇱 Google Wavenet-C (Female)" },
  ],
  // Arabic voices — all Twilio-compatible Google or Polly voices.
  // Wavenet = higher quality (neural). Standard = cheaper, still clear on phone.
  // OpenAI TTS is NOT listed here: it has no Arabic training data and produces
  // broken pronunciation that confuses Arabic-speaking callers.
  "ar": [
    { value: "Google.ar-XA-Wavenet-B",   label: "🇸🇦 Arabic Wavenet-B (Male, Recommended)" },
    { value: "Google.ar-XA-Wavenet-A",   label: "🇸🇦 Arabic Wavenet-A (Female)" },
    { value: "Google.ar-XA-Wavenet-C",   label: "🇸🇦 Arabic Wavenet-C (Male)" },
    { value: "Google.ar-XA-Wavenet-D",   label: "🇸🇦 Arabic Wavenet-D (Female)" },
    { value: "Google.ar-XA-Standard-B",  label: "🇸🇦 Arabic Standard-B (Male)" },
    { value: "Google.ar-XA-Standard-A",  label: "🇸🇦 Arabic Standard-A (Female)" },
    { value: "Google.ar-XA-Standard-C",  label: "🇸🇦 Arabic Standard-C (Male)" },
    { value: "Google.ar-XA-Standard-D",  label: "🇸🇦 Arabic Standard-D (Female)" },
    { value: "Polly.Zeina",              label: "🇸🇦 Polly Zeina (Female, MSA)" },
  ],
  "el-GR": [
    { value: "Google.el-GR-Wavenet-A", label: "🇬🇷 Greek Wavenet-A (Female, Recommended)" },
    { value: "openai:alloy",           label: "🇬🇷 OpenAI Alloy (Neutral)" },
    { value: "openai:nova",            label: "🇬🇷 OpenAI Nova (Female)" },
    { value: "openai:echo",            label: "🇬🇷 OpenAI Echo (Male)" },
    { value: "openai:shimmer",         label: "🇬🇷 OpenAI Shimmer (Female)" },
    { value: "openai:onyx",            label: "🇬🇷 OpenAI Onyx (Male, Deep)" },
  ],
  "en-ZA": [
    { value: "Google.en-ZA-Standard-A", label: "🇿🇦 SA English Standard-A (Female, Recommended)" },
    { value: "Google.en-ZA-Standard-B", label: "🇿🇦 SA English Standard-B (Male)" },
    { value: "Google.en-ZA-Standard-C", label: "🇿🇦 SA English Standard-C (Female)" },
    { value: "Google.en-ZA-Standard-D", label: "🇿🇦 SA English Standard-D (Male)" },
    { value: "openai:alloy",            label: "🇿🇦 OpenAI Alloy (Neutral)" },
    { value: "openai:shimmer",          label: "🇿🇦 OpenAI Shimmer (Female)" },
  ],
  "af-ZA": [
    { value: "Google.af-ZA-Standard-B", label: "🇿🇦 Afrikaans Standard-B (Male, Recommended)" },
    { value: "Google.af-ZA-Standard-A", label: "🇿🇦 Afrikaans Standard-A (Female)" },
    { value: "openai:alloy",            label: "🇿🇦 OpenAI Alloy (Neutral)" },
    { value: "openai:nova",             label: "🇿🇦 OpenAI Nova (Female)" },
    { value: "openai:echo",             label: "🇿🇦 OpenAI Echo (Male)" },
    { value: "openai:onyx",             label: "🇿🇦 OpenAI Onyx (Male, Deep)" },
  ],
  "zu-ZA": [
    // No native Google/Twilio Zulu TTS — Realtime (V2V) mode strongly recommended.
    // Standard mode system phrases fall back to SA English TTS.
    { value: "openai:shimmer",          label: "🇿🇦 OpenAI Shimmer (Female, Recommended)" },
    { value: "openai:alloy",            label: "🇿🇦 OpenAI Alloy (Neutral)" },
    { value: "openai:nova",             label: "🇿🇦 OpenAI Nova (Female)" },
    { value: "openai:echo",             label: "🇿🇦 OpenAI Echo (Male)" },
    { value: "openai:onyx",             label: "🇿🇦 OpenAI Onyx (Male, Deep)" },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────
type BuiltinToolType = "knowledge_search" | "save_lead" | "tag_call" | "check_availability" | "send_link" | "schedule_callback" | "verbal_contract" | "voice_commerce" | "agent_network";

interface CustomTool {
  id: string;
  name: string;
  description: string;
  type?: BuiltinToolType | "api_call";   // "api_call" is default
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  parameters?: Array<{
    name: string;
    type: "string" | "number" | "boolean";
    description: string;
    required: boolean;
  }>;
}

interface SheetColumn { id: string; name: string; }
interface SheetRow    { id: string; cells: Record<string, string>; }

// ── Built-in tool definitions ──────────────────────────────────────────
const BUILTIN_TOOLS: Array<{
  type: BuiltinToolType; id: string; name: string;
  emoji: string; label: string; desc: string; info: string;
  colorOn: string; colorBg: string; colorBorder: string; colorText: string;
}> = [
  {
    type: "knowledge_search", id: "builtin_kb_search", name: "search_knowledge_base",
    emoji: "🔍", label: "Search Knowledge Base",
    desc: "AI queries your KB during the call — on demand, not pre-loaded",
    info: "Best for large knowledge bases. The AI calls this whenever it needs to look up products, prices, FAQs, or company info.",
    colorOn: "bg-violet-500", colorBg: "bg-violet-50", colorBorder: "border-violet-400", colorText: "text-violet-700",
  },
  {
    type: "save_lead", id: "builtin_save_lead", name: "save_lead",
    emoji: "📋", label: "Save Lead",
    desc: "Capture caller info (name, phone, email, interest) into your Leads",
    info: "The assistant saves lead data to your Leads dashboard mid-call — great for inbound sales flows.",
    colorOn: "bg-blue-500", colorBg: "bg-blue-50", colorBorder: "border-blue-400", colorText: "text-blue-700",
  },
  {
    type: "tag_call", id: "builtin_tag_call", name: "tag_call",
    emoji: "🏷️", label: "Tag Call",
    desc: "Label the call (hot_lead, complaint, needs_followup…) for filtering",
    info: "Tags appear in call history and let you segment and filter calls by outcome.",
    colorOn: "bg-amber-500", colorBg: "bg-amber-50", colorBorder: "border-amber-400", colorText: "text-amber-700",
  },
  {
    type: "check_availability", id: "builtin_check_avail", name: "check_availability",
    emoji: "📅", label: "Check Availability",
    desc: "Query your appointments calendar for open slots on a given date",
    info: "The assistant checks existing bookings before offering or confirming a time slot.",
    colorOn: "bg-green-500", colorBg: "bg-green-50", colorBorder: "border-green-400", colorText: "text-green-700",
  },
  {
    type: "send_link", id: "builtin_send_link", name: "send_link_sms",
    emoji: "📱", label: "Send Link via SMS",
    desc: "Text a URL to the caller during the conversation",
    info: "Useful for sending booking pages, product links, or confirmation URLs mid-call.",
    colorOn: "bg-sky-500", colorBg: "bg-sky-50", colorBorder: "border-sky-400", colorText: "text-sky-700",
  },
  {
    type: "schedule_callback", id: "builtin_callback", name: "schedule_callback",
    emoji: "⏰", label: "Schedule Callback",
    desc: "Book a callback request with preferred date/time",
    info: "When callers ask to be called back later, this saves a callback record to your CRM.",
    colorOn: "bg-orange-500", colorBg: "bg-orange-50", colorBorder: "border-orange-400", colorText: "text-orange-700",
  },
  {
    type: "verbal_contract", id: "builtin_verbal_contract", name: "initiate_verbal_contract",
    emoji: "📜", label: "Verbal Contract",
    desc: "Read contract terms aloud and record legally-binding caller agreement",
    info: "When enabled, the AI can present contract terms and record a SHA-256 tamper-proof verbal agreement. Configure a template in Contracts → Templates.",
    colorOn: "bg-purple-600", colorBg: "bg-purple-50", colorBorder: "border-purple-400", colorText: "text-purple-700",
  },
  {
    type: "voice_commerce", id: "builtin_voice_commerce", name: "lookup_product",
    emoji: "🛒", label: "Voice Commerce",
    desc: "Let the AI sell products over the call — catalog lookup, cart, Stripe payment link",
    info: "Requires products configured in Voice Commerce. The AI can look up products, build a cart, and send a Stripe payment link to the caller by SMS.",
    colorOn: "bg-emerald-600", colorBg: "bg-emerald-50", colorBorder: "border-emerald-400", colorText: "text-emerald-700",
  },
  {
    type: "agent_network", id: "builtin_agent_network", name: "call_agent",
    emoji: "🌐", label: "Agent Network",
    desc: "Connect to other AI agents for specialized tasks (billing, scheduling, etc.)",
    info: "The AI can route specific requests to other registered agents in your network — e.g. a billing agent, a scheduling agent, or a technical support agent.",
    colorOn: "bg-blue-600", colorBg: "bg-blue-50", colorBorder: "border-blue-400", colorText: "text-blue-700",
  },
];

// ── Scenario quick-wizard modal ────────────────────────────────────────
function ScenarioQuickWizardModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const [messages, setMessages] = useState<WizardMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<"chat" | "generating" | "done">("chat");
  const [genStatus, setGenStatus] = useState("Generating scenario…");
  const [resultName, setResultName] = useState("");
  const [resultId, setResultId] = useState("");
  const [summaryRef, setSummaryRef] = useState<Record<string, string> | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const GEN_STATUSES = ["Designing your scenario…", "Building the flow nodes…", "Adding decision branches…", "Finalising edges & labels…", "Almost done…"];
  let genInterval: ReturnType<typeof setInterval>;

  useEffect(() => {
    // Kick off with opening question
    setMessages([{ role: "assistant", content: "Hi! I'll help you build a call scenario. What's the main goal of this call — what should the assistant achieve by the end?" }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const updated: WizardMessage[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setSending(true);
    try {
      const res = await scenarioWizardChat(updated);
      const next: WizardMessage[] = [...updated, { role: "assistant", content: res.message }];
      setMessages(next);
      if (res.ready) {
        setSummaryRef(res.summary);
        await generate(next, res.summary);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    } finally {
      setSending(false);
    }
  }

  async function generate(msgs: WizardMessage[], summary?: Record<string, string>) {
    setPhase("generating");
    let i = 0;
    genInterval = setInterval(() => {
      i = (i + 1) % GEN_STATUSES.length;
      setGenStatus(GEN_STATUSES[i]);
    }, 1800);
    try {
      const gen = await scenarioWizardGenerate(msgs, summary);
      const created = await scenariosCreate({
        name: gen.name,
        description: gen.description,
        nodes: gen.nodes,
        edges: gen.edges,
      });
      clearInterval(genInterval);
      setResultName(created.name || gen.name);
      setResultId(created.id || "");
      setPhase("done");
    } catch {
      clearInterval(genInterval);
      setPhase("chat");
      setMessages((m) => [...m, { role: "assistant", content: "Generation failed — please try again." }]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">AI Scenario Wizard</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        {phase === "chat" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-neutral-800 text-white rounded-br-sm" : "bg-neutral-100 text-neutral-800 rounded-bl-sm"
                  }`}>{m.content}</div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-neutral-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                    <div className="flex gap-1">{[0,1,2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}</div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-neutral-100">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Type your answer…"
                  disabled={sending}
                  className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                />
                <button onClick={send} disabled={sending || !input.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1.5 text-center">Answer a few questions — AI generates the full scenario</p>
            </div>
          </>
        )}

        {phase === "generating" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <p className="text-sm font-medium text-neutral-700">{genStatus}</p>
            <div className="flex gap-1">{[0,1,2,3].map((i) => (
              <div key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}</div>
          </div>
        )}

        {phase === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800 mb-1">Scenario created!</p>
              <p className="text-xs text-neutral-500">"{resultName}" has been saved and assigned to this assistant.</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => onCreated(resultId, resultName)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors">
                Use this scenario
              </button>
              {resultId && (
                <a href={`/scenarios/edit?id=${resultId}`} target="_blank"
                  className="px-4 py-2 border border-neutral-200 hover:border-neutral-400 text-neutral-700 text-sm font-medium rounded-lg transition-colors">
                  Open Editor ↗
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AssistantExtended extends Assistant {
  systemPrompt?: string;
  feedbackCallEnabled?: boolean;
  llmModel?: string;
  temperature?: number;
  maxTokens?: number;
  sttModel?: string;
  speechSpeed?: number;
  voiceStability?: number;
  realtimeEnabled?: boolean;
  realtimeVoice?: string;
  realtimeVadMode?: "semantic" | "server";
  realtimeVadSensitivity?: "low" | "medium" | "high";
  realtimeScenarioId?: string;
  voiceProvider?: "classic" | "openai-realtime" | "gemini-live" | "gemini-hybrid" | "nlpearl";
  // Telephony carrier — separate from the AI voice provider. Determines
  // whether outbound goes via Twilio REST or via our Asterisk+SIP bridge.
  telephonyProvider?: "twilio" | "sip" | "voximplant";
  nlpearlPearlId?: string | null;
  nlpearlPhoneNumberId?: string | null;
  assistantVibe?: "professional" | "friendly" | "energetic" | "empathetic" | "direct" | "sales";
  callerGender?: "neutral" | "ask" | "male" | "female";
  voiceAccent?: "native-il" | "neutral" | "default" | "msa" | "levantine" | "gulf" | "egyptian";
  customTools?: CustomTool[];
  conversationFlow?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: import("@/lib/firebase-functions").TestChatToolCall[];
}

// ── Constants ─────────────────────────────────────────────────────────
const VIBE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "friendly",     label: "😊 Friendly",      desc: "Warm, conversational — the default" },
  { value: "professional", label: "👔 Professional",   desc: "Polished, formal, business-like" },
  { value: "energetic",    label: "⚡ Energetic",      desc: "Upbeat, enthusiastic, high-energy" },
  { value: "empathetic",   label: "🤝 Empathetic",     desc: "Calm, caring, never rushed" },
  { value: "direct",       label: "🎯 Direct",         desc: "One sentence max, no small talk" },
  { value: "sales",        label: "💰 Sales-focused",  desc: "Persuasive, handles objections" },
];

const REALTIME_VOICES = [
  { value: "ash",     label: "Ash — Male, warm" },
  { value: "alloy",   label: "Alloy — Neutral" },
  { value: "ballad",  label: "Ballad — Expressive" },
  { value: "coral",   label: "Coral — Female, natural" },
  { value: "echo",    label: "Echo — Male, deep" },
  { value: "sage",    label: "Sage — Female, calm" },
  { value: "shimmer", label: "Shimmer — Female, bright" },
  { value: "verse",   label: "Verse — Male, authoritative" },
];

const CLOUD_RUN = "https://voiceflow-mediastream-900818829902.me-west1.run.app";

type Tab = "settings" | "tools" | "knowledge" | "test";

// ── Helpers ───────────────────────────────────────────────────────────
function PriceLabel({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "ok" }) {
  const color =
    tone === "warn" ? "bg-orange-50 text-orange-600 border-orange-200"
    : tone === "ok" ? "bg-emerald-50 text-emerald-600 border-emerald-200"
    : "bg-neutral-50 text-neutral-500 border-neutral-200";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${color} ml-2`}>
      {children}
    </span>
  );
}

function estimateLlmTurnCost(rateCard: RateCard | null, modelId: string): string {
  const base = rateCard?.openai ?? { costPerPromptToken1K: 0.00015, costPerCompletionToken1K: 0.0006, costPerTtsChar1K: 0.015 };
  const mul = modelId === "gpt-4o" ? 25 : modelId === "gpt-4-turbo" ? 20 : modelId === "gpt-3.5-turbo" ? 2.5 : 1;
  const cost = (200 / 1000 * base.costPerPromptToken1K * mul) + (150 / 1000 * base.costPerCompletionToken1K * mul);
  return `~$${cost.toFixed(4)}/turn`;
}

// ── NLPearl Pearl picker + status panel (used when voiceProvider === "nlpearl") ────
const NLP_FN_BASE = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

interface NLPearlPearl { id: string; name: string; type?: number; status?: number; }
interface NLPearlVoiceLang { language?: string; voices?: Array<{id?: string; name?: string; gender?: string} & Record<string, unknown>>; }
interface NLPearlAnalytics {
  callsStatusOverview?: { total?: number; success?: number; notSuccessful?: number; [k: string]: unknown };
  callsAverageTimeLine?: Array<{ averageDurationSeconds?: number }>;
  [k: string]: unknown;
}

function NLPearlConfig({ pearlId, onChange }: { pearlId: string; onChange: (id: string) => void }) {
  const [pearls, setPearls]     = React.useState<NLPearlPearl[]>([]);
  const [voices, setVoices]     = React.useState<NLPearlVoiceLang[]>([]);
  const [ongoing, setOngoing]   = React.useState<{totalOngoingCalls?: number; totalOnQueue?: number} | null>(null);
  const [analytics, setAnalytics] = React.useState<NLPearlAnalytics | null>(null);
  const [loading, setLoading]   = React.useState(true);
  const [err, setErr]           = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState(false);
  const [paused, setPaused]     = React.useState(false);

  // 1) Load Pearls + Voices on mount
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${NLP_FN_BASE}/nlpearlListPearls`).then((r) => r.json()),
      fetch(`${NLP_FN_BASE}/nlpearlListVoices`).then((r) => r.json()),
    ])
      .then(([pearlData, voiceData]) => {
        if (cancelled) return;
        setPearls(Array.isArray(pearlData) ? pearlData : []);
        setVoices(Array.isArray(voiceData) ? voiceData : []);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setErr(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // 2) When pearlId changes — load ongoing calls + analytics for that Pearl
  React.useEffect(() => {
    if (!pearlId) { setOngoing(null); setAnalytics(null); return; }
    let cancelled = false;
    const load = () => {
      fetch(`${NLP_FN_BASE}/nlpearlOngoingCalls?pearlId=${encodeURIComponent(pearlId)}`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setOngoing(d); })
        .catch(() => {});
    };
    load();
    fetch(`${NLP_FN_BASE}/nlpearlAnalytics?pearlId=${encodeURIComponent(pearlId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAnalytics(d); })
      .catch(() => {});
    const t = setInterval(load, 15000); // refresh ongoing every 15s
    return () => { cancelled = true; clearInterval(t); };
  }, [pearlId]);

  // 3) Pause/resume — derive paused state from selected pearl
  React.useEffect(() => {
    const p = pearls.find((x) => x.id === pearlId);
    // NLPearl status: 1 = active, 2 = paused (approximated; toggling will reflect actual state)
    setPaused(p ? p.status === 2 : false);
  }, [pearlId, pearls]);

  const togglePause = async () => {
    if (!pearlId) return;
    setToggling(true);
    try {
      const r = await fetch(`${NLP_FN_BASE}/nlpearlSetActive`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({pearlId, isActive: paused /* if paused → reactivate */}),
      });
      if (r.ok) setPaused(!paused);
    } catch { /* ignore */ }
    finally { setToggling(false); }
  };

  const selectedPearl = pearls.find((p) => p.id === pearlId);
  const totalCalls    = (analytics?.callsStatusOverview as { total?: number } | undefined)?.total ?? 0;
  const successCalls  = (analytics?.callsStatusOverview as { success?: number } | undefined)?.success ?? 0;
  const successRate   = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
  const avgDuration   = (() => {
    const tl = analytics?.callsAverageTimeLine || [];
    if (tl.length === 0) return 0;
    const sum = tl.reduce((a, b) => a + (b.averageDurationSeconds || 0), 0);
    return Math.round(sum / tl.length);
  })();
  const isLive = (ongoing?.totalOngoingCalls || 0) > 0;

  return (
    <div className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/40">
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-emerald-800 uppercase tracking-wide">NLPearl Pearl</label>
        {pearlId && (
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-white px-1.5 py-0.5 rounded-full border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE · {ongoing?.totalOngoingCalls} call{(ongoing?.totalOngoingCalls || 0) > 1 ? "s" : ""}
              </span>
            )}
            <button
              type="button"
              onClick={togglePause}
              disabled={toggling}
              className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${
                paused
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
              } disabled:opacity-50`}
            >
              {toggling ? "…" : paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}
      </div>

      {loading && <p className="text-xs text-neutral-500">Loading pearls…</p>}
      {err && <p className="text-xs text-red-600">Failed to load: {err}</p>}
      {!loading && pearls.length === 0 && !err && (
        <p className="text-xs text-neutral-500">No Pearls found. Create one at <a href="https://platform.nlpearl.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">platform.nlpearl.ai</a>.</p>
      )}
      {pearls.length > 0 && (
        <select
          value={pearlId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          <option value="">— Select a Pearl —</option>
          {pearls.map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.type === 1 ? "(inbound)" : p.type === 2 ? "(outbound)" : ""}</option>
          ))}
        </select>
      )}

      {/* Analytics — last 30 days */}
      {pearlId && analytics && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-white border border-emerald-100 rounded-md p-2">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Total Calls (30d)</div>
            <div className="text-lg font-semibold text-emerald-700">{totalCalls}</div>
          </div>
          <div className="bg-white border border-emerald-100 rounded-md p-2">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Success Rate</div>
            <div className="text-lg font-semibold text-emerald-700">{successRate}%</div>
          </div>
          <div className="bg-white border border-emerald-100 rounded-md p-2">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Avg Duration</div>
            <div className="text-lg font-semibold text-emerald-700">{avgDuration > 0 ? `${Math.floor(avgDuration/60)}:${String(avgDuration%60).padStart(2,"0")}` : "—"}</div>
          </div>
        </div>
      )}

      {/* Voice list (read-only — voice must be set in the NLPearl dashboard) */}
      {selectedPearl && voices.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-emerald-800 cursor-pointer select-none">Available voices ({voices.reduce((a, l) => a + (l.voices?.length || 0), 0)})</summary>
          <div className="mt-1.5 max-h-32 overflow-y-auto text-[11px] text-neutral-600 space-y-0.5 pl-2">
            {voices.map((lang, i) => (
              <div key={i}>
                <span className="font-semibold text-emerald-700">{lang.language || "—"}:</span>{" "}
                {(lang.voices || []).map((v) => v.name).filter(Boolean).join(", ") || "—"}
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-[11px] text-neutral-500 mt-2">System prompt, voice, and KB are configured in the NLPearl dashboard for this Pearl.</p>
    </div>
  );
}

// ── Custom API Tools editor ───────────────────────────────────────────
function CustomApiToolsEditor({ tools, onChange }: { tools: CustomTool[]; onChange: (t: CustomTool[]) => void }) {
  const activeTypes = new Set(tools.map((t) => t.type).filter(Boolean));

  // ── Global preset packs (code-defined, available to every assistant) ──
  const [presetPacks, setPresetPacks] = useState<ToolPresetPack[]>([]);
  const [openPackPrompt, setOpenPackPrompt] = useState<string | null>(null);

  // Per-tool API test ("check the API of a tool"): open panel, enter sample
  // args, fire the real request, show status + response.
  const [testToolId, setTestToolId] = useState<string | null>(null);
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; ms: number; result: string; url?: string } | null>(null);

  const openTest = (tool: CustomTool) => {
    if (testToolId === tool.id) { setTestToolId(null); return; }
    setTestToolId(tool.id);
    setTestResult(null);
    const seed: Record<string, string> = {};
    (tool.parameters || []).forEach((p) => { seed[p.name] = ""; });
    setTestArgs(seed);
  };
  const runToolTest = async (tool: CustomTool) => {
    setTestRunning(true); setTestResult(null);
    try {
      // Coerce numeric-looking values so number params send as numbers.
      const args: Record<string, unknown> = {};
      Object.entries(testArgs).forEach(([k, v]) => {
        if (v === "") return;
        args[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      });
      const r = await customToolTest({ tool, sampleArgs: args });
      setTestResult(r);
    } catch (e: unknown) {
      setTestResult({ ok: false, status: 0, ms: 0, result: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTestRunning(false);
    }
  };
  useEffect(() => {
    toolPresetsList()
      .then((r) => setPresetPacks(r.packs || []))
      .catch(() => setPresetPacks([]));
  }, []);

  // Add (or refresh) a pack's tools. Tools are matched by name: any existing
  // tool with the same name as a pack tool is REPLACED with the latest preset
  // definition — so clicking again pulls fixes (e.g. a corrected endpoint URL)
  // into an assistant that added the pack earlier. Unrelated custom tools are
  // left untouched.
  const addPack = (pack: ToolPresetPack) => {
    const mapType = (t?: string): "string" | "number" | "boolean" =>
      t === "boolean" ? "boolean" : (t === "number" || t === "integer") ? "number" : "string";
    const packNames = new Set((pack.tools || []).map((pt) => pt.name));
    const fresh: CustomTool[] = (pack.tools || []).map((pt) => ({
      id: `preset_${pack.id}_${pt.name}`,
      name: pt.name,
      type: "api_call" as const,
      description: pt.description,
      method: (pt.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
      url: pt.url,
      headers: pt.headers || {},
      parameters: (pt.parameters || []).map((p) => ({
        name: p.name,
        type: mapType(p.type),
        description: p.description || "",
        required: !!p.required,
      })),
    }));
    const others = tools.filter((t) => !packNames.has(t.name));   // keep non-pack tools
    onChange([...fresh, ...others]);
  };
  const packAdded = (pack: ToolPresetPack) =>
    (pack.tools || []).every((pt) => tools.some((t) => t.name === pt.name));

  const toggleBuiltin = (def: typeof BUILTIN_TOOLS[0]) => {
    if (activeTypes.has(def.type)) {
      onChange(tools.filter((t) => t.type !== def.type));
    } else {
      onChange([
        { id: def.id, name: def.name, type: def.type,
          description: def.desc, method: "GET", url: "", headers: {}, parameters: [] },
        ...tools,
      ]);
    }
  };

  const addTool = () => {
    onChange([...tools, {
      id: `tool_${Date.now()}`,
      name: "new_tool",
      description: "",
      method: "POST",
      url: "",
      headers: {},
      parameters: [],
    }]);
  };
  const updateTool = (idx: number, updates: Partial<CustomTool>) =>
    onChange(tools.map((t, i) => i === idx ? { ...t, ...updates } : t));
  const removeTool = (idx: number) => onChange(tools.filter((_, i) => i !== idx));

  const BUILTIN_TYPES = new Set(["knowledge_search","save_lead","tag_call","check_availability","send_link","schedule_callback","verbal_contract","voice_commerce","agent_network"]);
  const apiTools = tools.filter((t) => !t.type || !BUILTIN_TYPES.has(t.type));

  return (
    <div className="space-y-3">
      {/* ── Built-in tools ── */}
      <div className="border border-neutral-200 rounded-lg p-3 bg-white">
        <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Built-in Tools</div>
        <div className="space-y-1.5">
          {BUILTIN_TOOLS.map((def) => {
            const on = activeTypes.has(def.type);
            return (
              <div key={def.type}>
                <div
                  onClick={() => toggleBuiltin(def)}
                  className={`flex items-center justify-between p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                    on ? `${def.colorBorder} ${def.colorBg}` : "border-neutral-200 hover:border-neutral-300 bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-base ${on ? def.colorBg : "bg-neutral-100"}`}>{def.emoji}</div>
                    <div>
                      <div className="text-xs font-semibold text-neutral-700">{def.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 leading-tight">{def.desc}</div>
                    </div>
                  </div>
                  <div className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${on ? def.colorOn : "bg-neutral-300"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                  </div>
                </div>
                {on && (
                  <>
                    <p className={`text-[11px] ${def.colorText} mt-1 ${def.colorBg} border ${def.colorBorder} rounded px-2 py-1`}>
                      💡 {def.info}
                    </p>
                    {/* Send Link via SMS — URL config field */}
                    {def.type === "send_link" && (
                      <div className="mt-1.5 px-1">
                        <label className="block text-[11px] font-medium text-neutral-500 mb-1">
                          Default URL to send <span className="text-neutral-400 font-normal">(optional — assistant can also use a URL from the conversation)</span>
                        </label>
                        <input
                          type="url"
                          placeholder="https://yoursite.com/booking"
                          value={(() => {
                            const t = tools.find((t) => t.type === "send_link");
                            return t?.url || "";
                          })()}
                          onChange={(e) => {
                            const idx = tools.findIndex((t) => t.type === "send_link");
                            if (idx !== -1) updateTool(idx, { url: e.target.value });
                          }}
                          className="w-full border border-neutral-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                        />
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          If set, the assistant sends this URL when no specific link is mentioned in the call. Leave blank to let the assistant determine the URL from context.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Preset tool packs (global library) ── */}
      {presetPacks.length > 0 && (
        <div className="border border-neutral-200 rounded-lg p-3 bg-white">
          <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Tool Packs</div>
          <p className="text-[11px] text-neutral-400 mb-2">Ready-made tool bundles. One click adds them to this assistant.</p>
          <div className="space-y-2">
            {presetPacks.map((pack) => {
              const added = packAdded(pack);
              return (
                <div key={pack.id} className="border border-neutral-200 rounded-lg p-2.5 bg-neutral-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-700" dir="auto">{pack.title}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight" dir="auto">{pack.description}</div>
                      <div className="text-[10px] text-neutral-400 mt-1">{pack.tools?.length || 0} tools</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addPack(pack)}
                      title={added ? "Refresh these tools to the latest definitions" : "Add these tools to this assistant"}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg flex-shrink-0 ${
                        added ? "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100" : "bg-[#F22F46] text-white hover:opacity-90"
                      }`}
                    >
                      {added ? "↻ Update pack" : "+ Add pack"}
                    </button>
                  </div>
                  {pack.systemPrompt && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenPackPrompt(openPackPrompt === pack.id ? null : pack.id)}
                        className="text-[11px] text-sky-600 hover:underline"
                      >
                        {openPackPrompt === pack.id ? "Hide" : "View"} recommended prompt
                      </button>
                      {openPackPrompt === pack.id && (
                        <div className="mt-1">
                          <textarea
                            readOnly
                            dir="auto"
                            value={pack.systemPrompt}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full h-28 border border-neutral-200 rounded-lg p-2 text-[11px] font-mono bg-white"
                          />
                          <p className="text-[10px] text-neutral-400 mt-0.5">Copy this into the assistant&apos;s instructions for best results.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Custom API tools ── */}
      <div className="border border-neutral-200 rounded-lg p-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Custom API Tools</div>
            <p className="text-[11px] text-neutral-400 mt-0.5">HTTP endpoints the assistant can call during the conversation</p>
          </div>
          <button type="button" onClick={addTool} className="text-xs text-[#F22F46] hover:underline font-medium">+ Add Tool</button>
        </div>
        {apiTools.length > 0 && (
          <div className="text-[10px] text-neutral-500 bg-amber-50 border border-amber-200 rounded p-2 mb-2 leading-relaxed">
            <strong className="text-amber-700">How it works:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><strong>Name</strong>: snake_case only. The model calls it by this name.</li>
              <li><strong>Description</strong>: tells the model <em>when</em> to call it — be specific.</li>
              <li><strong>URL / headers</strong>: use <code className="bg-white px-1 rounded">&#123;&#123;paramName&#125;&#125;</code> to inject values.</li>
              <li><strong>Parameters</strong>: extracted from conversation. Mark required ones.</li>
            </ul>
          </div>
        )}
        {apiTools.length === 0 ? (
          <p className="text-xs text-neutral-400 py-2 text-center">No custom API tools configured</p>
        ) : apiTools.map((tool) => {
          const idx = tools.indexOf(tool);
          return (
            <div key={tool.id || idx} className="border border-neutral-200 rounded-md p-3 mb-2 bg-neutral-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <input
                  value={tool.name}
                  onChange={(e) => updateTool(idx, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64) })}
                  placeholder="tool_name (snake_case)"
                  className="flex-1 text-sm font-mono border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-[#F22F46]"
                />
                <button onClick={() => removeTool(idx)} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
              <input
                value={tool.description}
                onChange={(e) => updateTool(idx, { description: e.target.value })}
                placeholder='When to call this (e.g. "When caller asks about stock or prices")'
                className={`w-full text-xs border rounded px-2 py-1 mb-2 focus:outline-none ${
                  !tool.description ? "border-red-200 bg-red-50 focus:border-red-400" : "border-neutral-200 focus:border-[#F22F46]"
                }`}
              />
              {!tool.description && (
                <p className="text-[10px] text-red-500 -mt-1 mb-2">⚠ Description required — tells the model when to call this tool</p>
              )}
              <div className="flex gap-2 mb-2">
                <select
                  value={tool.method}
                  onChange={(e) => updateTool(idx, { method: e.target.value as "GET" | "POST" })}
                  className="text-xs border border-neutral-200 rounded px-2 py-1"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
                <input
                  value={tool.url}
                  onChange={(e) => updateTool(idx, { url: e.target.value })}
                  placeholder="https://api.example.com/orders/{{orderId}}"
                  className="flex-1 text-xs font-mono border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:border-[#F22F46]"
                />
              </div>
              <div className="mb-2">
                <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Parameters</div>
                {(tool.parameters || []).map((p, pIdx) => (
                  <div key={pIdx} className="flex gap-1 mb-1">
                    <input
                      value={p.name}
                      onChange={(e) => {
                        const params = [...(tool.parameters || [])];
                        params[pIdx] = { ...params[pIdx], name: e.target.value };
                        updateTool(idx, { parameters: params });
                      }}
                      placeholder="paramName"
                      className="w-24 text-xs font-mono border border-neutral-200 rounded px-2 py-1"
                    />
                    <select
                      value={p.type}
                      onChange={(e) => {
                        const params = [...(tool.parameters || [])];
                        params[pIdx] = { ...params[pIdx], type: e.target.value as "string" | "number" | "boolean" };
                        updateTool(idx, { parameters: params });
                      }}
                      className="text-xs border border-neutral-200 rounded px-2 py-1"
                    >
                      <option value="string">str</option>
                      <option value="number">num</option>
                      <option value="boolean">bool</option>
                    </select>
                    <input
                      value={p.description}
                      onChange={(e) => {
                        const params = [...(tool.parameters || [])];
                        params[pIdx] = { ...params[pIdx], description: e.target.value };
                        updateTool(idx, { parameters: params });
                      }}
                      placeholder="What this param is"
                      className="flex-1 text-xs border border-neutral-200 rounded px-2 py-1"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-neutral-500">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(e) => {
                          const params = [...(tool.parameters || [])];
                          params[pIdx] = { ...params[pIdx], required: e.target.checked };
                          updateTool(idx, { parameters: params });
                        }}
                      />
                      req
                    </label>
                    <button
                      onClick={() => {
                        const params = [...(tool.parameters || [])];
                        params.splice(pIdx, 1);
                        updateTool(idx, { parameters: params });
                      }}
                      className="text-xs text-red-400 px-1"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const params = [...(tool.parameters || []), { name: "", type: "string" as const, description: "", required: false }];
                    updateTool(idx, { parameters: params });
                  }}
                  className="text-xs text-[#0066CC] hover:underline"
                >+ Add parameter</button>
              </div>
              <details className="mt-2">
                <summary className="text-[10px] font-semibold text-neutral-500 uppercase cursor-pointer">Headers (advanced)</summary>
                <textarea
                  value={JSON.stringify(tool.headers || {}, null, 2)}
                  onChange={(e) => {
                    try { updateTool(idx, { headers: JSON.parse(e.target.value) }); } catch { /* ignore */ }
                  }}
                  placeholder='{"Authorization": "Bearer YOUR_KEY"}'
                  rows={3}
                  className="w-full text-xs font-mono border border-neutral-200 rounded px-2 py-1 mt-1"
                />
              </details>

              {/* ── Test this tool's API ── */}
              <div className="mt-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => openTest(tool)}
                  disabled={!tool.url}
                  className="text-xs font-medium text-[#0066CC] hover:underline disabled:text-neutral-300"
                >
                  {testToolId === tool.id ? "▾ Hide test" : "▸ Test this API"}
                </button>
                {testToolId === tool.id && (
                  <div className="mt-2 bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 space-y-2">
                    {(tool.parameters || []).length > 0 ? (
                      (tool.parameters || []).map((p, pi) => (
                        <div key={pi} className="flex items-center gap-2">
                          <label className="text-[11px] text-neutral-500 w-28 truncate" title={p.name}>{p.name}{p.required ? " *" : ""}</label>
                          <input
                            value={testArgs[p.name] ?? ""}
                            onChange={(e) => setTestArgs((a) => ({ ...a, [p.name]: e.target.value }))}
                            placeholder={p.description || p.type}
                            className="flex-1 text-xs border border-neutral-200 rounded px-2 py-1"
                          />
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-neutral-400">No parameters — runs as-is.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => runToolTest(tool)}
                      disabled={testRunning}
                      className="text-xs font-medium bg-[#0066CC] text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {testRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Run request
                    </button>
                    {testResult && (
                      <div className={`text-[11px] rounded-lg border p-2 ${testResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <div className="font-mono text-neutral-700">{testResult.ok ? "✓" : "✗"} HTTP {testResult.status || "—"} · {testResult.ms}ms</div>
                        {testResult.url && <div className="font-mono text-[10px] text-neutral-400 break-all mt-0.5">{testResult.url}</div>}
                        <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-neutral-600 max-h-48 overflow-auto">{testResult.result}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
function AssistantEdit() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const [assistant, setAssistant] = useState<AssistantExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachCallIds, setCoachCallIds] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("settings");
  const [rateCard, setRateCard] = useState<RateCard | null>(null);

  // Knowledge Base state
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadStatus, setKbUploadStatus] = useState("");
  const [kbError, setKbError] = useState("");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [kbClearing, setKbClearing] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  // Crawl coverage report — per-page breakdown so the user can verify nothing was missed.
  const [reportFor, setReportFor] = useState<string | null>(null);   // sourceRoot currently expanded
  const [reportData, setReportData] = useState<CrawlReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  // Live crawl progress — polls the coverage report while a crawl is running so
  // pages appear in real time (the backend writes each page as it's embedded).
  const crawlPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  async function toggleCrawlReport(sourceRoot: string) {
    if (reportFor === sourceRoot) { setReportFor(null); setReportData(null); return; }
    setReportFor(sourceRoot); setReportData(null); setReportLoading(true);
    try { setReportData(await knowledgeCrawlReport(id, sourceRoot)); }
    catch { setReportData(null); }
    finally { setReportLoading(false); }
  }
  useEffect(() => () => { if (crawlPollRef.current) clearInterval(crawlPollRef.current); }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings sub-tab
  const [settingsTab, setSettingsTab] = useState<"identity" | "voice" | "behavior" | "advanced">("identity");

  // Advanced settings toggle (kept for compat, unused now)
  const [showAdvanced, setShowAdvanced] = useState(false);

  // TTS preview state
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cloned voices (ElevenLabs Instant Voice Cloning) — loaded once per page.
  const [customVoices, setCustomVoices] = useState<{ voiceId: string; name: string }[]>([]);
  const [voiceCloneOpen, setVoiceCloneOpen] = useState(false);
  const reloadCustomVoices = useCallback(async () => {
    try {
      const list = await import("@/lib/firebase-functions").then(m => m.elevenlabsListVoices());
      setCustomVoices(list.map(v => ({ voiceId: v.voiceId, name: v.name })));
    } catch { setCustomVoices([]); }
  }, []);
  useEffect(() => { reloadCustomVoices(); }, [reloadCustomVoices]);

  // Realtime voice preview state
  const [realtimePreviewPlaying, setRealtimePreviewPlaying] = useState(false);
  const realtimePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Scenario list for realtime scenario picker
  const [scenariosLoaded, setScenariosLoaded] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioDoc[]>([]);
  const [showScenarioWizard, setShowScenarioWizard] = useState(false);
  const [showScenarioTestSim, setShowScenarioTestSim] = useState(false);
  const [scenarioCreating, setScenarioCreating] = useState(false);

  // Test chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // URL / text KB state
  const [urlInput, setUrlInput] = useState("");
  const [urlAdding, setUrlAdding] = useState(false);
  const [syncingUrl, setSyncingUrl] = useState<string | null>(null);
  const [showTextForm, setShowTextForm] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textAdding, setTextAdding] = useState(false);

  // Sheet KB state
  const [showSheetForm, setShowSheetForm] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  const [sheetColumns, setSheetColumns] = useState<SheetColumn[]>([
    { id: "c1", name: "Name" }, { id: "c2", name: "Value" },
  ]);
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([
    { id: "r1", cells: { c1: "", c2: "" } },
  ]);
  const [sheetAdding, setSheetAdding] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    assistantsGet(id)
      .then((res) => { setAssistant(res as AssistantExtended); setHasUnsavedChanges(false); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getCostConfig()
      .then((cc) => setRateCard(cc.rateCard))
      .catch(() => {});
  }, []);

  // Load scenarios once (for the realtime scenario picker)
  useEffect(() => {
    if (scenariosLoaded) return;
    scenariosList()
      .then((res) => { setScenarios(Array.isArray(res?.scenarios) ? res.scenarios : []); setScenariosLoaded(true); })
      .catch(() => { setScenariosLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "knowledge" && id) loadKbFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  // Auto-scroll test chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Warn the browser (F5 / back button / close tab) when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  async function loadKbFiles() {
    setKbLoading(true);
    setKbError("");
    try {
      setKbFiles(await knowledgeListFiles(id));
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setKbLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.size > 5 * 1024 * 1024) { setKbError("File too large — maximum 5 MB"); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setKbError("Not authenticated"); return; }
    setKbUploading(true); setKbError(""); setKbUploadStatus("Uploading...");
    try {
      const fileId = Date.now().toString(36);
      const storagePath = `users/${uid}/knowledge/${id}/${fileId}_${file.name}`;
      await uploadBytes(ref(storage, storagePath), file);
      setKbUploadStatus("Processing & embedding...");
      const result = await knowledgeProcessFile({ assistantId: id, storagePath, fileName: file.name });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks created`);
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Upload failed");
      setKbUploadStatus("");
    } finally {
      setKbUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteFile(sourceFile: string) {
    if (!id) return;
    setDeletingFile(sourceFile); setKbError("");
    try {
      await knowledgeDeleteFile({ assistantId: id, sourceFile });
      setKbFiles((prev) => prev.filter((f) => f.sourceFile !== sourceFile));
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingFile(null);
    }
  }

  async function handleAddUrl() {
    const url = urlInput.trim();
    if (!url || !id) return;
    try { new URL(url); } catch { setKbError("Invalid URL — include https://"); return; }
    setUrlAdding(true); setKbError(""); setKbUploadStatus("Crawling site & embedding pages — this can take ~1 minute...");
    // Live progress: expand the coverage view for this URL and poll it while the
    // crawl runs. Each poll reflects pages already written, so the table fills
    // up live instead of staying empty until the whole crawl finishes.
    setReportFor(url); setReportData(null);
    if (crawlPollRef.current) clearInterval(crawlPollRef.current);
    // Poll every 4s, but never overlap requests — if the previous report is
    // still in flight, skip this tick. Overlapping polls were stacking up and
    // overloading the function (the 503/500 storm in the network tab).
    let inFlight = false;
    crawlPollRef.current = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const live = await knowledgeCrawlReport(id, url);
        setReportData(live);
        if (live?.totalPages) {
          setKbUploadStatus(`Crawling… ${live.totalPages} page${live.totalPages === 1 ? "" : "s"} indexed so far (${live.totalChunks} chunks)`);
        }
      } catch { /* report not ready yet — keep polling */ }
      finally { inFlight = false; }
    }, 4000);
    const stopPoll = () => { if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; } };
    try {
      const result = await knowledgeProcessUrl({ assistantId: id, url }) as { chunksCreated: number; pagesCrawled?: number; pagesWritten?: number; partial?: boolean };
      const written = result.pagesWritten ?? result.pagesCrawled;
      const pagesNote = written ? ` across ${written} page${written === 1 ? "" : "s"}` : "";
      setKbUploadStatus(result.partial
        ? `Partial — indexed ${result.chunksCreated} chunks${pagesNote} (crawl hit the time limit; click "view coverage" to see what was captured, then Re-sync for the rest)`
        : `Done — ${result.chunksCreated} chunks indexed${pagesNote}`);
      setUrlInput("");
      stopPoll();
      // Final authoritative report once the crawl completes.
      try { setReportData(await knowledgeCrawlReport(id, url)); } catch { /* keep last live snapshot */ }
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), result.partial ? 12000 : 4000);
    } catch (e: unknown) {
      // The crawl now writes pages incrementally, so even a timeout/dropped
      // connection usually leaves pages stored. Reload the list so the user
      // sees what was captured rather than assuming total failure.
      stopPoll();
      try { setReportData(await knowledgeCrawlReport(id, url)); } catch { /* keep last live snapshot */ }
      await loadKbFiles().catch(() => {});
      setKbError((e instanceof Error ? e.message : "Crawl interrupted") +
        " — some pages may still have been captured; check the list below and click \"view coverage\". Re-sync to finish.");
      setKbUploadStatus("");
    } finally {
      stopPoll();
      setUrlAdding(false);
    }
  }

  async function handleAddText() {
    const text = textContent.trim();
    const title = textTitle.trim() || "Text snippet";
    if (!text || !id) return;
    setTextAdding(true); setKbError(""); setKbUploadStatus("Processing text...");
    try {
      const result = await knowledgeProcessText({ assistantId: id, text, title });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks created`);
      setTextTitle(""); setTextContent(""); setShowTextForm(false);
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to add text");
      setKbUploadStatus("");
    } finally {
      setTextAdding(false);
    }
  }

  async function handleAddSheet() {
    const title = sheetTitle.trim() || "Sheet";
    if (!id || sheetColumns.length === 0) return;
    // Convert to markdown table
    const header = `| ${sheetColumns.map((c) => c.name || "Column").join(" | ")} |`;
    const divider = `| ${sheetColumns.map(() => "---").join(" | ")} |`;
    const rows = sheetRows
      .filter((r) => sheetColumns.some((c) => (r.cells[c.id] || "").trim()))
      .map((r) => `| ${sheetColumns.map((c) => r.cells[c.id] || "").join(" | ")} |`);
    const text = `# ${title}\n\n${header}\n${divider}\n${rows.join("\n")}`;
    setSheetAdding(true); setKbError(""); setKbUploadStatus("Processing sheet...");
    try {
      const result = await knowledgeProcessText({ assistantId: id, text, title });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks created`);
      setSheetTitle("");
      setSheetColumns([{ id: "c1", name: "Name" }, { id: "c2", name: "Value" }]);
      setSheetRows([{ id: "r1", cells: { c1: "", c2: "" } }]);
      setShowSheetForm(false);
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to add sheet");
      setKbUploadStatus("");
    } finally {
      setSheetAdding(false);
    }
  }

  async function handleSyncUrl(url: string) {
    if (!id) return;
    setSyncingUrl(url); setKbError("");
    // Live progress: open this URL's coverage panel and poll it (non-overlapping)
    // so pages re-appear in real time as the re-crawl writes them.
    setReportFor(url); setReportData(null);
    if (crawlPollRef.current) clearInterval(crawlPollRef.current);
    let inFlight = false;
    crawlPollRef.current = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const live = await knowledgeCrawlReport(id, url);
        setReportData(live);
        if (live?.totalPages) setKbUploadStatus(`Re-syncing… ${live.totalPages} page${live.totalPages === 1 ? "" : "s"} (${live.totalChunks} chunks)`);
      } catch { /* keep polling */ }
      finally { inFlight = false; }
    }, 4000);
    const stopPoll = () => { if (crawlPollRef.current) { clearInterval(crawlPollRef.current); crawlPollRef.current = null; } };
    try {
      const result = await knowledgeSync({ assistantId: id, url });
      const pagesNote = result.pagesCrawled ? ` across ${result.pagesCrawled} pages` : "";
      setKbUploadStatus(`Synced — ${result.chunksCreated} chunks updated${pagesNote}`);
      stopPoll();
      try { setReportData(await knowledgeCrawlReport(id, url)); } catch { /* keep last snapshot */ }
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      stopPoll();
      try { setReportData(await knowledgeCrawlReport(id, url)); } catch { /* keep last snapshot */ }
      setKbError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      stopPoll();
      setSyncingUrl(null);
    }
  }

  async function handleClearAllKb() {
    if (!id || kbFiles.length === 0) return;
    if (!confirm(`Delete the ENTIRE knowledge base (${kbFiles.length} source${kbFiles.length === 1 ? "" : "s"})? This cannot be undone.`)) return;
    setKbClearing(true); setKbError("");
    try {
      const r = await knowledgeClearAll({ assistantId: id });
      setKbFiles([]);
      setKbUploadStatus(`Knowledge base cleared — ${r.deleted} chunks removed`);
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to clear knowledge base");
    } finally {
      setKbClearing(false);
    }
  }

  // Load an existing text entry back into the Add-Text form for editing. Saving
  // re-uses the same title, so knowledgeProcessText replaces the old chunks.
  async function handleEditText(sourceFile: string) {
    if (!id) return;
    setEditingSource(sourceFile); setKbError("");
    try {
      const r = await knowledgeGetSource(id, sourceFile);
      setTextTitle(sourceFile);
      setTextContent(r.content || "");
      setShowTextForm(true);
      setShowSheetForm(false);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to load entry");
    } finally {
      setEditingSource(null);
    }
  }

  async function handleCreateBlankScenario() {
    setScenarioCreating(true);
    try {
      const result = await scenariosCreate({
        name: `${assistant?.name || "Assistant"} Scenario`,
        description: "",
        nodes: [{ id: "start-1", type: "start", position: { x: 250, y: 100 }, data: { trigger: "outbound", label: "Start", color: "#4CAF50" } }],
        edges: [],
      });
      set("realtimeScenarioId", result.id);
      // Refresh scenarios list
      scenariosList()
        .then((res) => setScenarios(Array.isArray(res?.scenarios) ? res.scenarios : []))
        .catch(() => {});
    } catch { /* ignore */ } finally {
      setScenarioCreating(false);
    }
  }

  const handleSave = async () => {
    if (!assistant) return;
    setSaving(true); setError("");
    try {
      // Drop incomplete custom API tools (e.g. a "+ Add Tool" row left empty) so
      // junk like an unfilled `new_tool` never reaches the assistant's tool list.
      const ax = assistant as AssistantExtended;
      const cleanedTools = (ax.customTools || []).filter(
        (t) => t.type || (t.name?.trim() && t.url?.trim()),
      );
      const payload = { ...assistant, customTools: cleanedTools } as typeof assistant;
      await assistantsUpdate({ ...payload, id });
      setSaved(true); setHasUnsavedChanges(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: unknown) => {
    setAssistant((prev) => prev ? { ...prev, [key]: value } : null);
    setHasUnsavedChanges(true);
  };

  // ── Voice preview (TTS) ───────────────────────────────────────────────
  const [previewError, setPreviewError] = useState<string>("");
  const playPreview = async (text?: string, voiceOverride?: string) => {
    if (previewPlaying && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    const sampleText = text || previewText || assistant?.firstMessage || "שלום! אני הבוט של החברה. איך אוכל לעזור לך היום?";
    const voice = voiceOverride || assistant?.voice || "openai:nova";
    setPreviewPlaying(true);
    setPreviewError("");
    try {
      // ElevenLabs cloned voices (encoded as "elevenlabs:VOICE_ID") route
      // through our Firebase Function which returns base64 MP3. Stock voices
      // go through the existing Cloud Run TTS proxy.
      let url: string;
      if (voice.startsWith("elevenlabs:")) {
        const voiceId = voice.slice("elevenlabs:".length);
        const r = await import("@/lib/firebase-functions").then(m => m.elevenlabsPreviewVoice({ voiceId, text: sampleText }));
        const bin = Uint8Array.from(atob(r.audioBase64), c => c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bin], { type: r.mimeType || "audio/mpeg" }));
      } else {
        const res = await fetch(`${CLOUD_RUN}/tts-preview?text=${encodeURIComponent(sampleText)}&voice=${encodeURIComponent(voice)}`);
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`TTS preview failed (${res.status}): ${errBody.slice(0, 200)}`);
        }
        url = URL.createObjectURL(await res.blob());
      }
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => {
        setPreviewError("Browser couldn't decode the audio. The TTS provider returned something invalid.");
        setPreviewPlaying(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
      setPreviewPlaying(false);
    }
  };

  // ── Voice preview (Realtime) ─────────────────────────────────────────
  const playRealtimePreview = async () => {
    if (realtimePreviewPlaying && realtimePreviewAudioRef.current) {
      realtimePreviewAudioRef.current.pause();
      realtimePreviewAudioRef.current = null;
      setRealtimePreviewPlaying(false);
      return;
    }
    const rtVoice = (assistant as AssistantExtended).realtimeVoice || "ash";
    const voice = `openai:${rtVoice}`;
    const sampleText = assistant?.firstMessage || "Hello! I'm your AI assistant. How can I help you today?";
    setRealtimePreviewPlaying(true);
    try {
      const res = await fetch(`${CLOUD_RUN}/tts-preview?text=${encodeURIComponent(sampleText)}&voice=${encodeURIComponent(voice)}`);
      if (!res.ok) throw new Error("TTS failed");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      realtimePreviewAudioRef.current = audio;
      audio.onended = () => { setRealtimePreviewPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setRealtimePreviewPlaying(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch { setRealtimePreviewPlaying(false); }
  };

  // ── Test chat ─────────────────────────────────────────────────────────
  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || !assistant) return;
    const newHistory: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newHistory);
    setChatInput("");
    setChatLoading(true);
    setChatError("");
    try {
      const result = await assistantTestChat({
        assistantId: id,
        message: msg,
        history: chatMessages, // history BEFORE the new message
        override: {
          systemPrompt: (assistant as AssistantExtended).systemPrompt,
          assistantVibe: (assistant as AssistantExtended).assistantVibe,
          callerGender: (assistant as AssistantExtended).callerGender,
          language: assistant.language,
          voiceAccent: (assistant as AssistantExtended).voiceAccent,
          conversationFlow: (assistant as AssistantExtended).conversationFlow,
          // Send the editor's current (possibly unsaved) tools so the sandbox fires them.
          customTools: (assistant as AssistantExtended).customTools || [],
        },
      });
      setChatMessages([...newHistory, { role: "assistant", content: result.reply, toolCalls: result.toolCalls }]);
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : "Failed to get reply");
    } finally {
      setChatLoading(false);
    }
  };

  const resetChat = () => {
    setChatMessages([]);
    setChatInput("");
    setChatError("");
  };

  // Confirm before switching away from Settings while there are unsaved changes
  const handleTabChange = (newTab: Tab) => {
    if (tab === "settings" && newTab !== "settings" && hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Switch tab without saving?")) return;
    }
    setTab(newTab);
  };

  const currentLang = assistant?.language || "en-US";
  const voiceOptions = VOICES_BY_LANG[currentLang] || VOICES_BY_LANG["en-US"];
  // "isRealtime" really means "the AI provider has its own built-in voice and
  // ignores the TTS Voice picker below". Both OpenAI Realtime AND Gemini Live
  // are single-stage architectures with baked-in voices, so the TTS Voice
  // section should be hidden for either.
  const isRealtime =
    !!(assistant as AssistantExtended)?.realtimeEnabled ||
    (assistant as AssistantExtended)?.voiceProvider === "openai-realtime" ||
    (assistant as AssistantExtended)?.voiceProvider === "gemini-live" ||
    (assistant as AssistantExtended)?.voiceProvider === "gemini-hybrid";

  if (loading) return <div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>;
  if (!assistant) return (
    <div className="p-8 text-center">
      <p className="text-neutral-400 text-sm">{error || "Assistant not found."}</p>
      <Link href="/assistants" className="text-[#0066CC] text-sm hover:underline mt-2 inline-block">← Back to assistants</Link>
    </div>
  );

  return (
    <div className="w-full">
      <Link
        href="/assistants"
        onClick={(e) => {
          if (hasUnsavedChanges && !confirm("You have unsaved changes. Leave without saving?")) {
            e.preventDefault();
          }
        }}
        className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Assistants
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{assistant.name || assistant.assistantName}</h2>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && tab !== "settings" && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
              Unsaved changes
            </span>
          )}
          <button
            onClick={() => setCoachOpen(true)}
            title="Open Prompt Coach — AI assistant for improving this prompt"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Prompt Coach
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              saved ? "bg-green-500 text-white"
              : hasUnsavedChanges ? "bg-[#F22F46] hover:bg-[#d9243b] text-white"
              : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Prompt Coach drawer */}
      {coachOpen && assistant && (
        <PromptCoach
          assistantId={assistant.id || ""}
          assistantName={assistant.name || assistant.assistantName || "Assistant"}
          currentPrompt={(assistant as {systemPrompt?: string}).systemPrompt || ""}
          callIds={coachCallIds}
          onPromptApplied={(newPrompt) => {
            set("systemPrompt", newPrompt);
            setHasUnsavedChanges(true);
          }}
          onClose={() => setCoachOpen(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-neutral-100 rounded-lg p-1">
        {([
          { key: "settings",  icon: Settings,      label: "Settings",        badge: null as number | null },
          { key: "tools",     icon: Wrench,         label: "Tools",           badge: ((assistant as AssistantExtended).customTools || []).length || null },
          { key: "knowledge", icon: BookOpen,       label: "Knowledge Base",  badge: kbFiles.length > 0 ? kbFiles.length : null },
          { key: "test",      icon: MessageSquare,  label: "Test Chat",       badge: null as number | null },
        ] as const).map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-1.5 px-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{label}</span>
            {badge != null && (
              <span className="ml-0.5 bg-[#F22F46] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none flex-shrink-0">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Settings Tab — sub-tabs ──────────────────────────────────── */}
      {tab === "settings" && (
        <>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">

            {/* ── Inner sub-tab bar ─────────────────────────────────── */}
            <div className="flex border-b border-neutral-100">
              {([
                { key: "identity", label: "Identity",  icon: "🪪" },
                { key: "voice",    label: "Voice",     icon: "🎙️" },
                { key: "behavior", label: "Behavior",  icon: "🧠" },
                { key: "advanced", label: "Advanced",  icon: "⚙️" },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSettingsTab(key)}
                  className={`flex items-center gap-1.5 flex-1 justify-center py-3 px-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    settingsTab === key
                      ? "border-[#F22F46] text-[#F22F46] bg-white"
                      : "border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span>{icon}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* ── Sub-tab content ───────────────────────────────────── */}
            <div className="p-5 space-y-5">

              {/* ════════════════ IDENTITY ════════════════ */}
              {settingsTab === "identity" && (
                <>
                  {/* Name + Company */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Assistant Name</label>
                      <input value={assistant.name || ""} onChange={(e) => set("name", e.target.value)}
                        placeholder="e.g. Alex"
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Company Name</label>
                      <input value={assistant.companyName || ""} onChange={(e) => set("companyName", e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]" />
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Language</label>
                    <select
                      value={currentLang}
                      onChange={(e) => {
                        const lang = e.target.value;
                        const defaultVoice = (VOICES_BY_LANG[lang] || VOICES_BY_LANG["en-US"])[0].value;
                        setAssistant((prev) => prev ? { ...prev, language: lang, voice: defaultVoice } : null);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="en-AU">English (Australian)</option>
                      <option value="en-ZA">English (South Africa)</option>
                      <option value="he-IL">Hebrew</option>
                      <option value="ar">Arabic</option>
                      <option value="el-GR">Greek</option>
                      <option value="af-ZA">Afrikaans</option>
                      <option value="zu-ZA">isiZulu</option>
                    </select>
                  </div>

                  {/* Opening Greeting */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Opening Greeting</label>
                    <p className="text-xs text-neutral-400 mb-1.5">First thing said when the call connects. Use {"{{leadName}}"}, {"{{companyName}}"} as placeholders.</p>
                    <textarea value={assistant.firstMessage || ""} onChange={(e) => set("firstMessage", e.target.value)} rows={3}
                      placeholder='e.g. "Hi {{leadName}}, this is Alex from {{companyName}}. How can I help you today?"'
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none" />
                  </div>
                </>
              )}

              {/* ════════════════ VOICE ════════════════ */}
              {settingsTab === "voice" && (
                <>
                  {/* Voice Provider — choose one of three pipelines */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">Voice Provider</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                      {(() => {
                        const provider = (assistant as AssistantExtended).voiceProvider
                          || ((assistant as AssistantExtended).realtimeEnabled ? "openai-realtime" : "classic");
                        const setProvider = (p: "classic" | "openai-realtime" | "gemini-live" | "gemini-hybrid" | "nlpearl") => {
                          set("voiceProvider", p);
                          // Backwards-compatibility: keep realtimeEnabled in sync
                          set("realtimeEnabled", p === "openai-realtime");
                          // Normalize the stored voice into the new provider's namespace so the
                          // correct picker shows a VALID selection. Gemini providers use Gemini
                          // voice names (Aoede/Charon…), OpenAI Realtime uses ash/alloy/etc.
                          // Preserve gender across the switch (male OpenAI → Charon, else Aoede).
                          const GEMINI_VOICES = ["Aoede","Kore","Puck","Charon","Fenrir","Orbit","Zephyr"];
                          const MALE_OPENAI = ["ash","echo","verse","ballad","cedar"];
                          const cur = (assistant as AssistantExtended).realtimeVoice || "";
                          if ((p === "gemini-live" || p === "gemini-hybrid") && !GEMINI_VOICES.includes(cur)) {
                            set("realtimeVoice", MALE_OPENAI.includes(cur.toLowerCase()) ? "Charon" : "Aoede");
                          } else if (p === "openai-realtime" && GEMINI_VOICES.includes(cur)) {
                            set("realtimeVoice", "ash");
                          }
                        };
                        const dg  = rateCard?.deepgram?.costPerMinute ?? 0.0043;
                        const tts = rateCard?.openai?.costPerTtsChar1K ?? 0.015;
                        const rtIn  = rateCard?.openaiRealtime?.costPerMinuteInput ?? 0.06;
                        const rtOut = rateCard?.openaiRealtime?.costPerMinuteOutput ?? 0.24;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setProvider("classic")}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                provider === "classic" ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <Mic className={`w-3.5 h-3.5 ${provider === "classic" ? "text-[#F22F46]" : "text-neutral-400"}`} />
                                <span className={`text-sm font-semibold ${provider === "classic" ? "text-[#F22F46]" : "text-neutral-700"}`}>Standard</span>
                              </div>
                              <p className="text-[11px] text-neutral-500 leading-snug">STT → GPT → TTS. ~1–2 s latency.</p>
                              <p className="text-[10px] text-neutral-400 mt-1">~${(dg + tts * 0.2).toFixed(3)}/min</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProvider("openai-realtime")}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                provider === "openai-realtime" ? "border-violet-500 bg-violet-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <Zap className={`w-3.5 h-3.5 ${provider === "openai-realtime" ? "text-violet-600" : "text-neutral-400"}`} />
                                <span className={`text-sm font-semibold ${provider === "openai-realtime" ? "text-violet-700" : "text-neutral-700"}`}>Voice-to-Voice</span>
                              </div>
                              <p className="text-[11px] text-neutral-500 leading-snug">OpenAI Realtime, ~300 ms latency.</p>
                              <p className="text-[10px] text-neutral-400 mt-1">~${((rtIn + rtOut) / 2).toFixed(2)}/min</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProvider("gemini-live")}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                provider === "gemini-live" ? "border-blue-500 bg-blue-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-sm ${provider === "gemini-live" ? "" : "grayscale opacity-60"}`}>✦</span>
                                <span className={`text-sm font-semibold ${provider === "gemini-live" ? "text-blue-700" : "text-neutral-700"}`}>Gemini Live</span>
                              </div>
                              <p className="text-[11px] text-neutral-500 leading-snug">Google end-to-end. ~10x cheaper than OpenAI. Hebrew STT can drift.</p>
                              <p className="text-[10px] text-neutral-400 mt-1">~$0.03/min</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProvider("gemini-hybrid")}
                              className={`text-left p-3 rounded-xl border-2 transition-all ${
                                provider === "gemini-hybrid" ? "border-emerald-500 bg-emerald-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-sm ${provider === "gemini-hybrid" ? "" : "grayscale opacity-60"}`}>✦</span>
                                <span className={`text-sm font-semibold ${provider === "gemini-hybrid" ? "text-emerald-700" : "text-neutral-700"}`}>Gemini Hybrid</span>
                              </div>
                              <p className="text-[11px] text-neutral-500 leading-snug">Deepgram ears + Gemini voice. Best Hebrew, low latency. (beta)</p>
                              <p className="text-[10px] text-neutral-400 mt-1">~$0.04/min</p>
                            </button>
                            {/* NLPearl provider removed — all NLPearl assistants
                                automatically migrated to Gemini Live. */}
                          </>
                        );
                      })()}
                    </div>

                    {/* Telephony carrier — independent of the AI provider above */}
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <label className="block text-xs font-medium text-neutral-700 uppercase tracking-wide mb-2">
                        Telephony Carrier
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(() => {
                          const tp = (assistant as AssistantExtended).telephonyProvider || "twilio";
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => set("telephonyProvider", "twilio")}
                                className={`text-left p-3 rounded-xl border-2 transition-all ${
                                  tp === "twilio" ? "border-indigo-500 bg-indigo-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                                }`}
                              >
                                <div className="text-sm font-semibold mb-1">Twilio</div>
                                <p className="text-[11px] text-neutral-500 leading-snug">Managed PSTN. Reliable, more expensive.</p>
                                <p className="text-[10px] text-neutral-400 mt-1">~$0.018/min</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => set("telephonyProvider", "voximplant")}
                                className={`text-left p-3 rounded-xl border-2 transition-all ${
                                  tp === "voximplant" ? "border-orange-500 bg-orange-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                                }`}
                              >
                                <div className="text-sm font-semibold mb-1">Voximplant</div>
                                <p className="text-[11px] text-neutral-500 leading-snug">Global carrier + orchestration. Partner network.</p>
                                <p className="text-[10px] text-neutral-400 mt-1">requires Voximplant creds on company</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => set("telephonyProvider", "sip")}
                                className={`text-left p-3 rounded-xl border-2 transition-all ${
                                  tp === "sip" ? "border-teal-500 bg-teal-50" : "border-neutral-200 hover:border-neutral-300 bg-white"
                                }`}
                              >
                                <div className="text-sm font-semibold mb-1">SIP Trunk</div>
                                <p className="text-[11px] text-neutral-500 leading-snug">Your own Asterisk + SIP operator. Cheapest.</p>
                                <p className="text-[10px] text-neutral-400 mt-1">~$0.003–0.005/min</p>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-2">
                        Inbound + outbound calls route via the chosen carrier. SIP falls back to Twilio if the bridge is unreachable; Voximplant falls back to Twilio if its scenario fails.
                      </p>
                    </div>
                  </div>

                  {/* Standard: TTS voice */}
                  {!isRealtime && (() => {
                    const selectedVoice = assistant.voice || voiceOptions[0].value;
                    const isOpenAI = selectedVoice.startsWith("openai:");
                    const oaRate = rateCard?.openai?.costPerTtsChar1K ?? 0.015;
                    const gRate = rateCard?.googleTts?.costPerChar1K ?? 0.016;

                    // Detect a voice↔language mismatch (e.g. English voice on Arabic assistant).
                    // ElevenLabs cloned voices are multilingual — they speak the language
                    // of the input text, so the warning doesn't apply to them.
                    const langKey = currentLang.split("-")[0]; // "ar", "he", "en", "el"
                    const voiceMatchesLang =
                      selectedVoice.startsWith("elevenlabs:") ||       // Cloned voices are multilingual
                      selectedVoice.startsWith("openai:") ||           // OpenAI wrapper handles any lang
                      selectedVoice.startsWith("Polly.Zeina") ||       // Arabic
                      (langKey === "ar" && selectedVoice.includes("ar-XA")) ||
                      (langKey === "he" && selectedVoice.includes("he-IL")) ||
                      (langKey === "en" && (selectedVoice.includes("en-US") || selectedVoice.includes("en-GB") || selectedVoice.includes("en-AU") || selectedVoice.includes("Polly."))) ||
                      (langKey === "el" && selectedVoice.includes("el-GR"));

                    const langLabels: Record<string, string> = {
                      "en-US": "🇺🇸 English (US)",
                      "en-GB": "🇬🇧 English (UK)",
                      "en-AU": "🇦🇺 English (AU)",
                      "he-IL": "🇮🇱 Hebrew",
                      "ar":    "🇸🇦 Arabic",
                      "el-GR": "🇬🇷 Greek",
                    };

                    return (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide">
                          TTS Voice
                          <PriceLabel>${(isOpenAI ? oaRate : gRate).toFixed(4)}/1K chars</PriceLabel>
                        </label>

                        {/* Language badge — makes the language↔voice link explicit */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-600">
                          <span className="font-medium">Voices for:</span>
                          <span className="font-semibold text-neutral-800">{langLabels[currentLang] ?? currentLang}</span>
                          <span className="text-neutral-400">· set in Identity tab</span>
                          {!voiceMatchesLang && (
                            <span className="ml-auto flex items-center gap-1 text-amber-600 font-semibold">
                              ⚠️ Language mismatch — change voice or update Identity language
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <select
                            value={selectedVoice}
                            onChange={(e) => set("voice", e.target.value)}
                            className={`flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 ${
                              !voiceMatchesLang
                                ? "border-amber-400 focus:border-amber-500 focus:ring-amber-400"
                                : "border-neutral-200 focus:border-[#F22F46] focus:ring-[#F22F46]"
                            }`}
                          >
                            {customVoices.length > 0 && (
                              <optgroup label="✨ Your Cloned Voices">
                                {customVoices.map((v) => (
                                  <option key={`elevenlabs:${v.voiceId}`} value={`elevenlabs:${v.voiceId}`}>
                                    {v.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="Stock voices">
                              {voiceOptions.map((v) => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          <button
                            type="button"
                            onClick={() => setVoiceCloneOpen(true)}
                            title="Clone a new voice"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Clone voice
                          </button>
                          <button type="button" onClick={() => playPreview()} title="Preview this voice"
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              previewPlaying ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                            }`}
                          >
                            {previewPlaying ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            {previewPlaying ? "Stop" : "Preview"}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)}
                            placeholder={assistant.firstMessage || "Type custom text to preview…"}
                            className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46]"
                          />
                        </div>
                        <p className="text-[10px] text-neutral-400">Leave empty to preview the opening greeting</p>
                        {previewError && (
                          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mt-1 flex items-start gap-1.5">
                            <span className="font-semibold flex-shrink-0">Preview failed:</span>
                            <span className="font-mono break-words">{previewError}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Gemini Live / Hybrid: voice selector (both run Gemini models → Gemini voices) */}
                  {((assistant as AssistantExtended).voiceProvider === "gemini-live" ||
                    (assistant as AssistantExtended).voiceProvider === "gemini-hybrid") && (
                    <div className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        Gemini Voice
                        <span className="ml-2 text-[10px] font-normal text-blue-500">native Hebrew · pick a male or female Gemini voice</span>
                      </label>
                      <select
                        value={(() => {
                          const rv = (assistant as AssistantExtended).realtimeVoice || "Aoede";
                          const GEMINI = ["Aoede","Kore","Puck","Charon","Fenrir","Orbit","Zephyr"];
                          if (GEMINI.includes(rv)) return rv;
                          // Stale OpenAI voice stored — show a gender-matched Gemini voice.
                          return ["ash","echo","verse","ballad","cedar"].includes(rv.toLowerCase()) ? "Charon" : "Aoede";
                        })()}
                        onChange={(e) => set("realtimeVoice", e.target.value)}
                        className="w-full border border-blue-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Aoede">Aoede — נשי, חם (Recommended)</option>
                        <option value="Kore">Kore — נשי, בהיר</option>
                        <option value="Puck">Puck — גברי, אנרגטי</option>
                        <option value="Charon">Charon — גברי, עמוק</option>
                        <option value="Fenrir">Fenrir — גברי, חזק</option>
                        <option value="Orbit">Orbit — גברי, ניטרלי</option>
                        <option value="Zephyr">Zephyr — נשי, רך</option>
                      </select>
                      <p className="text-[11px] text-blue-600">
                        ⚡ Requires <code className="font-mono bg-blue-100 px-1 rounded">GEMINI_API_KEY</code> on the Cloud Run service.
                        Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com/apikey</a>
                      </p>
                    </div>
                  )}

                  {/* Realtime tuning. Voice selector here is OpenAI-only; Gemini providers
                      use the Gemini voice picker above. VAD applies to all realtime paths. */}
                  {isRealtime && (
                    <div className="space-y-3 p-4 bg-violet-50 rounded-xl border border-violet-200">
                      {(assistant as AssistantExtended).voiceProvider === "openai-realtime" && (
                        <>
                          <label className="block text-xs font-semibold text-violet-700 uppercase tracking-wide">
                            Realtime Voice
                            <PriceLabel tone="warn">
                              ${(rateCard?.openaiRealtime?.costPerMinuteInput ?? 0.06).toFixed(2)} in / ${(rateCard?.openaiRealtime?.costPerMinuteOutput ?? 0.24).toFixed(2)} out /min
                            </PriceLabel>
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={(assistant as AssistantExtended).realtimeVoice || "ash"}
                              onChange={(e) => set("realtimeVoice", e.target.value)}
                              className="flex-1 border border-violet-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                            >
                              {REALTIME_VOICES.map((v) => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                              ))}
                            </select>
                            <button type="button" onClick={playRealtimePreview}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                realtimePreviewPlaying ? "bg-neutral-800 text-white border-neutral-800" : "border-violet-300 text-violet-600 hover:bg-violet-100"
                              }`}
                            >
                              {realtimePreviewPlaying ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                              {realtimePreviewPlaying ? "Stop" : "Preview"}
                            </button>
                          </div>
                        </>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-violet-600 mb-1 uppercase tracking-wide">Turn Detection</label>
                          <select
                            value={(assistant as AssistantExtended).realtimeVadMode || "semantic"}
                            onChange={(e) => set("realtimeVadMode", e.target.value)}
                            className="w-full border border-violet-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-violet-500"
                          >
                            <option value="semantic">Semantic (recommended)</option>
                            <option value="server">Energy-based (legacy)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-violet-600 mb-1 uppercase tracking-wide">Sensitivity</label>
                          <select
                            value={(assistant as AssistantExtended).realtimeVadSensitivity || "low"}
                            onChange={(e) => set("realtimeVadSensitivity", e.target.value)}
                            className="w-full border border-violet-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-violet-500"
                          >
                            <option value="low">Low — quiet env</option>
                            <option value="medium">Medium — balanced</option>
                            <option value="high">High — fast response</option>
                          </select>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Voice Accent / Dialect */}
                  {(currentLang.startsWith("he") || currentLang.startsWith("ar")) && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Voice Accent / Dialect</label>
                      <p className="text-xs text-neutral-400 mb-2">
                        {currentLang.startsWith("ar") ? "Choose the Arabic dialect for the assistant. " : "Controls how the assistant pronounces Hebrew. "}
                        {!isRealtime && currentLang.startsWith("he") && (
                          <span className="text-amber-600">In Standard mode, accent is mainly set by the TTS voice — Google <code className="font-mono bg-amber-50 px-0.5 rounded">he-IL</code> voices sound native; OpenAI voices sound American.</span>
                        )}
                        {isRealtime && <span>Voice-to-Voice: injected into the system prompt to guide pronunciation.</span>}
                      </p>
                      <div className={`grid gap-2 ${currentLang.startsWith("ar") ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3"}`}>
                        {(currentLang.startsWith("ar") ? [
                          { value: "default",   label: "⚙️ Default",          desc: "No dialect instruction" },
                          { value: "msa",       label: "📖 فصحى (MSA)",        desc: "Modern Standard Arabic" },
                          { value: "levantine", label: "🇱🇧 شامي (Levantine)",  desc: "Syria, Lebanon, Palestine, Jordan" },
                          { value: "gulf",      label: "🇦🇪 خليجي (Gulf)",       desc: "UAE, Saudi Arabia, Kuwait" },
                          { value: "egyptian",  label: "🇪🇬 مصري (Egyptian)",    desc: "Most widely understood colloquial" },
                        ] : [
                          { value: "default",   label: "⚙️ Default",           desc: "Voice's natural style" },
                          { value: "native-il", label: "🇮🇱 Native Israeli",   desc: "Sabra-style Hebrew" },
                          { value: "neutral",   label: "🌐 Neutral / Clear",   desc: "Accent-free pronunciation" },
                        ]).map((opt) => {
                          const active = ((assistant as AssistantExtended).voiceAccent || "default") === opt.value;
                          return (
                            <button key={opt.value} type="button" onClick={() => set("voiceAccent", opt.value)}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                active ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-400 bg-white"
                              }`}
                            >
                              <div className="text-sm font-semibold text-neutral-800">{opt.label}</div>
                              <div className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                      {!isRealtime && currentLang.startsWith("he") && (assistant as AssistantExtended).voiceAccent === "native-il" && (
                        <p className="text-[11px] text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          💡 For best results in Standard mode, choose a <strong>Google Chirp3 he-IL</strong> voice — it sounds naturally Israeli regardless of this setting.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ════════════════ BEHAVIOR ════════════════ */}
              {settingsTab === "behavior" && (
                <>
                  {/* Personality Vibe */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Personality Vibe</label>
                    <p className="text-xs text-neutral-400 mb-2">Sets tone and style — applied automatically, no need to repeat in the system prompt.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {VIBE_OPTIONS.map((v) => {
                        const active = ((assistant as AssistantExtended).assistantVibe || "friendly") === v.value;
                        return (
                          <button key={v.value} type="button" onClick={() => set("assistantVibe", v.value)}
                            className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                              active ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-400"
                            }`}
                          >
                            <div className="text-sm font-medium text-neutral-800">{v.label}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{v.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Caller Gender (Hebrew / Arabic) */}
                  {(currentLang.startsWith("he") || currentLang.startsWith("ar")) && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                        {currentLang.startsWith("ar") ? "Arabic Address Mode" : "Hebrew Address Mode"}
                      </label>
                      <p className="text-xs text-neutral-400 mb-2">
                        {currentLang.startsWith("ar")
                          ? "Arabic grammar is gendered. Choose how the assistant addresses callers."
                          : "Hebrew grammar is gendered. Choose how the assistant addresses callers."}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {(currentLang.startsWith("ar") ? [
                          { value: "neutral", label: "🌈 Gender-neutral", desc: "Rephrases to avoid gendered forms" },
                          { value: "ask",     label: "🙋 Ask the caller",  desc: 'Gently asks: "كيف تفضل أن أخاطبك؟"' },
                          { value: "male",    label: "👨 Male (مذكر)",      desc: "Always masculine" },
                          { value: "female",  label: "👩 Female (مؤنث)",    desc: "Always feminine" },
                        ] : [
                          { value: "neutral", label: "🌈 Gender-neutral", desc: "Rephrases to avoid gendered forms" },
                          { value: "ask",     label: "🙋 Ask the caller",  desc: 'Gently asks: "זכר, נקבה, או ניטרלי?"' },
                          { value: "male",    label: "👨 Male (זכר)",       desc: "Always masculine" },
                          { value: "female",  label: "👩 Female (נקבה)",    desc: "Always feminine" },
                        ]).map((opt) => {
                          const active = ((assistant as AssistantExtended).callerGender || "neutral") === opt.value;
                          return (
                            <button key={opt.value} type="button" onClick={() => set("callerGender", opt.value)}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                active ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-400 bg-white"
                              }`}
                            >
                              <div className="text-sm font-semibold text-neutral-800">{opt.label}</div>
                              <div className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* System Prompt */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Custom Instructions (System Prompt)</label>
                    <p className="text-xs text-neutral-400 mb-1.5">Define the assistant's goal and constraints. Vibe and address mode are injected automatically.</p>
                    <textarea
                      value={(assistant as AssistantExtended).systemPrompt || ""}
                      onChange={(e) => set("systemPrompt", e.target.value)}
                      rows={12}
                      placeholder={currentLang.startsWith("he")
                        ? "לדוגמה: אתה נציג שירות לקוחות של חברה. המטרה שלך היא לתאם פגישות. תמיד שאל קודם מה שם הלקוח."
                        : "e.g. You are a sales agent for a roofing company. Your goal is to schedule a free inspection. First ask what problem they're having. Keep replies to 1–2 sentences max."
                      }
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none font-mono text-xs"
                    />
                  </div>

                  {/* Scenario Flow */}
                  <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/60">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                        Scenario Flow
                      </label>
                      <span className="text-[11px] text-neutral-400 font-normal">optional</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mb-3">
                      {isRealtime
                        ? "Guide the voice session through a structured flow — the assistant follows nodes while still responding naturally."
                        : "Execute a TwiML scenario flow — guides the call through predefined steps and branches."}
                    </p>

                    {/* Selector row */}
                    <div className="flex gap-2 mb-2">
                      <select
                        value={(assistant as AssistantExtended).realtimeScenarioId || ""}
                        onChange={(e) => set("realtimeScenarioId", e.target.value || null)}
                        className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] bg-white"
                      >
                        <option value="">— No scenario (free conversation) —</option>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {(assistant as AssistantExtended).realtimeScenarioId && (
                        <>
                          <button
                            onClick={() => setShowScenarioTestSim(true)}
                            title="Test scenario"
                            className="w-9 h-9 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex-shrink-0"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/scenarios/edit?id=${(assistant as AssistantExtended).realtimeScenarioId}`}
                            target="_blank"
                            title="Open scenario editor"
                            className="w-9 h-9 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex-shrink-0 text-xs font-medium"
                          >
                            ✏️
                          </a>
                        </>
                      )}
                    </div>

                    {/* Create buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setShowScenarioWizard(true)}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white transition-all shadow-sm"
                      >
                        <Sparkles className="w-3 h-3" /> AI Wizard
                      </button>
                      <button
                        onClick={handleCreateBlankScenario}
                        disabled={scenarioCreating}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-400 bg-white text-neutral-700 transition-colors disabled:opacity-50"
                      >
                        {scenarioCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        New blank
                      </button>
                      <a href="/scenarios" target="_blank"
                        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 px-2 py-1.5 transition-colors">
                        View all ↗
                      </a>
                    </div>

                    {!scenariosLoaded && (
                      <p className="text-[11px] text-neutral-400 mt-2">Loading scenarios…</p>
                    )}
                  </div>

                  {/* Post-call Feedback */}
                  <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-800">Post-call Feedback</p>
                        <p className="text-xs text-neutral-400 mt-0.5">After each call, auto-place a short follow-up to collect a 1–5 quality rating.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => set("feedbackCallEnabled", !(assistant as AssistantExtended).feedbackCallEnabled)}
                        className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${
                          (assistant as AssistantExtended).feedbackCallEnabled ? "bg-[#F22F46]" : "bg-neutral-300"
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          (assistant as AssistantExtended).feedbackCallEnabled ? "translate-x-5" : "translate-x-0.5"
                        }`} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ════════════════ ADVANCED ════════════════ */}
              {settingsTab === "advanced" && (
                <div className="space-y-5">

                  {/* Tools moved to their own top-level "Tools" tab. */}

                  {/* LLM Model */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                      LLM Model
                      <PriceLabel>{estimateLlmTurnCost(rateCard, (assistant as AssistantExtended).llmModel || "gpt-4o-mini")}</PriceLabel>
                    </label>
                    <select
                      value={(assistant as AssistantExtended).llmModel || "gpt-4o-mini"}
                      onChange={(e) => set("llmModel", e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Fast &amp; cheap) — {estimateLlmTurnCost(rateCard, "gpt-4o-mini")}</option>
                      <option value="gpt-4o">gpt-4o (Highest quality) — {estimateLlmTurnCost(rateCard, "gpt-4o")}</option>
                      <option value="gpt-4-turbo">gpt-4-turbo (Balanced) — {estimateLlmTurnCost(rateCard, "gpt-4-turbo")}</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo (Fastest, cheapest) — {estimateLlmTurnCost(rateCard, "gpt-3.5-turbo")}</option>
                    </select>
                    <p className="text-xs text-neutral-400 mt-1">~200 prompt + 150 reply tokens per turn assumed.</p>
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                      Temperature <span className="text-neutral-400 font-normal normal-case">({(assistant as AssistantExtended).temperature ?? 0.8})</span>
                    </label>
                    <input type="range" min="0" max="1" step="0.1"
                      value={(assistant as AssistantExtended).temperature ?? 0.8}
                      onChange={(e) => set("temperature", parseFloat(e.target.value))}
                      className="w-full accent-[#F22F46]"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                      <span>Consistent</span><span>Creative</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                      Max Response Tokens <span className="text-neutral-400 font-normal normal-case">({(assistant as AssistantExtended).maxTokens ?? 150})</span>
                    </label>
                    <input type="range" min="50" max="500" step="10"
                      value={(assistant as AssistantExtended).maxTokens ?? 150}
                      onChange={(e) => set("maxTokens", parseInt(e.target.value))}
                      className="w-full accent-[#F22F46]"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                      <span>Short (50)</span><span>Long (500)</span>
                    </div>
                  </div>

                  {/* STT Model (Standard mode only) */}
                  {!isRealtime && (() => {
                    const dg = rateCard?.deepgram?.costPerMinute ?? 0.0043;
                    // FIX (Issue 1 secondary — labels now match backend logic):
                    // Hebrew uses nova-3 (excellent RTL accuracy).
                    // Arabic uses nova-2 (nova-3 does not support Arabic streaming).
                    // English uses nova-2 (fast and cost-effective).
                    const autoLabel = currentLang.startsWith("he")
                      ? "Auto — Nova-3 (recommended for Hebrew)"
                      : currentLang.startsWith("ar")
                      ? "Auto — Nova-2 (recommended for Arabic)"
                      : currentLang.startsWith("el")
                      ? "Auto — Nova-2 (recommended for Greek)"
                      : "Auto — Nova-2 (recommended for English)";
                    return (
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                          STT Model
                          <PriceLabel>~${dg.toFixed(4)}/min</PriceLabel>
                        </label>
                        <select
                          value={(assistant as AssistantExtended).sttModel || ""}
                          onChange={(e) => set("sttModel", e.target.value || "")}
                          className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                        >
                          <option value="">{autoLabel}</option>
                          <option value="nova-2">Nova-2 — fast, cost-effective</option>
                          <option value="nova-3">Nova-3 — higher accuracy</option>
                          <option value="whisper-large">Whisper Large — best multilingual</option>
                        </select>
                      </div>
                    );
                  })()}

                  {/* Speech Speed (Standard mode only) */}
                  {!isRealtime && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                        Speech Speed <span className="text-neutral-400 font-normal normal-case">({(assistant as AssistantExtended).speechSpeed ?? 1.0})</span>
                      </label>
                      <input type="range" min="0.5" max="2.0" step="0.1"
                        value={(assistant as AssistantExtended).speechSpeed ?? 1.0}
                        onChange={(e) => set("speechSpeed", parseFloat(e.target.value))}
                        className="w-full accent-[#F22F46]"
                      />
                      <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                        <span>Slower (0.5×)</span><span>Normal (1.0×)</span><span>Faster (2.0×)</span>
                      </div>
                    </div>
                  )}

                  {/* Voice Stability */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                      Voice Stability <span className="text-neutral-400 font-normal normal-case">({(assistant as AssistantExtended).voiceStability ?? 0.5})</span>
                    </label>
                    <input type="range" min="0" max="1" step="0.1"
                      value={(assistant as AssistantExtended).voiceStability ?? 0.5}
                      onChange={(e) => set("voiceStability", parseFloat(e.target.value))}
                      className="w-full accent-[#F22F46]"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                      <span>Expressive</span><span>Consistent</span>
                    </div>
                  </div>

                </div>
              )}

            </div>{/* ── end sub-tab content ── */}
          </div>{/* ── end settings card ── */}
        </>
      )}

      {/* ── Tools Tab ─────────────────────────────────────────────────── */}
      {tab === "tools" && (
        <div className="space-y-5">
          {/* Conversation flow / scenario — steers the bot per use case */}
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🗺️</span>
              <h3 className="text-sm font-semibold text-neutral-800">Conversation Flow</h3>
            </div>
            <p className="text-xs text-neutral-400 mb-2">
              Give the bot a playbook of the flow to aim for in different use cases (it adapts naturally; never reads it aloud). Works on all voice providers, including Gemini Live.
            </p>
            <textarea
              value={(assistant as AssistantExtended).conversationFlow || ""}
              onChange={(e) => set("conversationFlow", e.target.value)}
              dir="auto"
              rows={8}
              placeholder={"Example:\nMembership renewal:\n1. Verify the caller's ID number.\n2. Confirm their details.\n3. Ask: renew existing membership or register as new?\n4. If a clinical question comes up → offer to transfer to a human.\n\nAppointment booking:\n1. Ask specialty + preferred time …"}
              className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 font-mono leading-relaxed focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />
          </div>

          <CustomApiToolsEditor
            tools={(assistant as AssistantExtended).customTools || []}
            onChange={(tools) => set("customTools", tools)}
          />
        </div>
      )}

      {/* ── Knowledge Base Tab ────────────────────────────────────────── */}
      {tab === "knowledge" && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">Knowledge Sources</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Files and URLs embedded and used during calls.</p>
            </div>
            <div className="flex items-center gap-2">
              {kbFiles.length > 0 && (
                <button
                  onClick={handleClearAllKb}
                  disabled={kbClearing}
                  className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  title="Delete the entire knowledge base"
                >
                  {kbClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Clear all
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={kbUploading}
                className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                {kbUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload File
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={handleFileUpload} />
          </div>
          <div className="flex gap-2 mb-3">
            <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              placeholder="https://example.com/page" disabled={urlAdding}
              className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:opacity-60"
            />
            <button onClick={handleAddUrl} disabled={urlAdding || !urlInput.trim()}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              {urlAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Add URL
            </button>
          </div>
          {/* Input type buttons row */}
          {!showTextForm && !showSheetForm && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setShowTextForm(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800 border border-neutral-200 hover:border-neutral-400 px-3 py-2 rounded-lg transition-colors"
              >
                <Type className="w-3.5 h-3.5" />Add Text
              </button>
              <button onClick={() => setShowSheetForm(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800 border border-neutral-200 hover:border-neutral-400 px-3 py-2 rounded-lg transition-colors"
              >
                <span className="text-sm">📊</span>Add Sheet
              </button>
            </div>
          )}

          {/* Text form */}
          {showTextForm && (
            <div className="mb-4 border border-neutral-200 rounded-lg p-3 space-y-2">
              <input type="text" value={textTitle} onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46]"
              />
              <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste or type your text here..." rows={5}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowTextForm(false); setTextTitle(""); setTextContent(""); }}
                  className="text-xs text-neutral-500 hover:text-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-200 transition-colors"
                >Cancel</button>
                <button onClick={handleAddText} disabled={textAdding || !textContent.trim()}
                  className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {textAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Type className="w-3.5 h-3.5" />}
                  Save Text
                </button>
              </div>
            </div>
          )}

          {/* Sheet form */}
          {showSheetForm && (
            <div className="mb-4 border border-violet-200 rounded-lg p-3 bg-violet-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700">📊 New Sheet</span>
                <button onClick={() => setShowSheetForm(false)} className="text-xs text-neutral-400 hover:text-neutral-600">✕ Cancel</button>
              </div>
              <input type="text" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)}
                placeholder="Sheet title (e.g. Product Catalog, Price List)"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white"
              />
              {/* Column headers */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Columns</span>
                  <button type="button" onClick={() => {
                    const newCol: SheetColumn = { id: `c${Date.now()}`, name: "" };
                    setSheetColumns([...sheetColumns, newCol]);
                    setSheetRows(sheetRows.map((r) => ({ ...r, cells: { ...r.cells, [newCol.id]: "" } })));
                  }} className="text-[11px] text-violet-600 hover:underline">+ Add column</button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {sheetColumns.map((col, cIdx) => (
                    <div key={col.id} className="flex items-center gap-1 bg-white border border-neutral-200 rounded px-1.5 py-1">
                      <input
                        value={col.name}
                        onChange={(e) => setSheetColumns(sheetColumns.map((c, i) => i === cIdx ? { ...c, name: e.target.value } : c))}
                        placeholder={`Col ${cIdx + 1}`}
                        className="text-xs w-20 focus:outline-none bg-transparent"
                      />
                      {sheetColumns.length > 1 && (
                        <button type="button" onClick={() => {
                          setSheetColumns(sheetColumns.filter((_, i) => i !== cIdx));
                          setSheetRows(sheetRows.map((r) => {
                            const cells = { ...r.cells };
                            delete cells[col.id];
                            return { ...r, cells };
                          }));
                        }} className="text-neutral-300 hover:text-red-400 text-xs leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Rows */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Rows</span>
                  <button type="button" onClick={() => {
                    const cells: Record<string, string> = {};
                    sheetColumns.forEach((c) => { cells[c.id] = ""; });
                    setSheetRows([...sheetRows, { id: `r${Date.now()}`, cells }]);
                  }} className="text-[11px] text-violet-600 hover:underline">+ Add row</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-100">
                        {sheetColumns.map((col) => (
                          <th key={col.id} className="border border-neutral-200 px-2 py-1 text-left font-semibold text-neutral-600 whitespace-nowrap">
                            {col.name || "—"}
                          </th>
                        ))}
                        <th className="border border-neutral-200 w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.map((row, rIdx) => (
                        <tr key={row.id}>
                          {sheetColumns.map((col) => (
                            <td key={col.id} className="border border-neutral-200 p-0">
                              <input
                                value={row.cells[col.id] || ""}
                                onChange={(e) => setSheetRows(sheetRows.map((r, i) =>
                                  i === rIdx ? { ...r, cells: { ...r.cells, [col.id]: e.target.value } } : r
                                ))}
                                className="w-full px-2 py-1 focus:outline-none focus:bg-violet-50 bg-white text-xs min-w-[80px]"
                              />
                            </td>
                          ))}
                          <td className="border border-neutral-200 text-center">
                            {sheetRows.length > 1 && (
                              <button type="button" onClick={() => setSheetRows(sheetRows.filter((_, i) => i !== rIdx))}
                                className="text-neutral-300 hover:text-red-400 text-xs px-1">×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSheetForm(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-200 transition-colors bg-white"
                >Cancel</button>
                <button onClick={handleAddSheet} disabled={sheetAdding || sheetColumns.length === 0}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {sheetAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📊</span>}
                  Save Sheet
                </button>
              </div>
            </div>
          )}
          {kbUploadStatus && (
            <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-xs flex items-center gap-2">
              {(kbUploading || urlAdding || syncingUrl) && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
              {kbUploadStatus}
            </div>
          )}
          {kbError && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{kbError}</div>}
          {kbLoading ? (
            <div className="py-8 text-center text-neutral-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading sources...
            </div>
          ) : kbFiles.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
              <p className="text-neutral-400 text-sm">No sources added yet</p>
              <p className="text-neutral-300 text-xs mt-1">Upload a file or add a URL above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {kbFiles.map((file) => {
                const isUrl = file.sourceType === "url";
                const label = isUrl
                  ? (() => { try { return new URL(file.sourceFile).hostname + new URL(file.sourceFile).pathname; } catch { return file.sourceFile; } })()
                  : file.sourceFile;
                const pages = (file as KnowledgeFile & { pagesCount?: number }).pagesCount || 0;
                const open = reportFor === file.sourceFile;
                return (
                  <div key={file.sourceFile} className="border border-neutral-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-3 hover:bg-neutral-50 group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isUrl ? <Link2 className="w-4 h-4 text-blue-400 flex-shrink-0" /> : <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm text-neutral-700 truncate" title={file.sourceFile}>{label}</p>
                          <p className="text-xs text-neutral-400">
                            {isUrl && pages > 0
                              ? <>{pages} page{pages !== 1 ? "s" : ""} crawled · {file.chunkCount} chunks · <button onClick={() => toggleCrawlReport(file.sourceFile)} className="text-blue-500 hover:underline font-medium">{open ? "hide coverage" : "view coverage"}</button></>
                              : <>{file.chunkCount} chunk{file.chunkCount !== 1 ? "s" : ""}{isUrl ? " · URL" : ""}</>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3 opacity-60 group-hover:opacity-100 transition-opacity">
                        {isUrl && (
                          <button onClick={() => handleSyncUrl(file.sourceFile)} disabled={syncingUrl === file.sourceFile}
                            className="p-1.5 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-60" title="Re-sync URL"
                          >
                            {syncingUrl === file.sourceFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </button>
                        )}
                        {!isUrl && !file.storagePath && (
                          <button onClick={() => handleEditText(file.sourceFile)} disabled={editingSource === file.sourceFile}
                            className="p-1.5 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-60" title="Edit text"
                          >
                            {editingSource === file.sourceFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                          </button>
                        )}
                        <button onClick={() => handleDeleteFile(file.sourceFile)} disabled={deletingFile === file.sourceFile}
                          className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-60"
                          title={isUrl ? "Remove URL" : "Delete file"}
                        >
                          {deletingFile === file.sourceFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Crawl coverage — every page the crawler read + how much text each yielded */}
                    {open && (
                      <div className="border-t border-neutral-100 bg-neutral-50/60 px-3 py-2.5">
                        {reportLoading ? (
                          <div className="flex items-center gap-2 text-xs text-neutral-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building coverage report…</div>
                        ) : !reportData || reportData.pages.length === 0 ? (
                          <p className="text-xs text-neutral-400 py-2">No page data found for this source.</p>
                        ) : (() => {
                          const maxChars = Math.max(1, ...reportData.pages.map((p) => p.chars));
                          const thinCount = reportData.pages.filter((p) => p.chars < 200).length;
                          const live = (urlAdding || syncingUrl === file.sourceFile) && reportFor === file.sourceFile;
                          return (
                          <>
                            {/* Summary stat chips */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              {[
                                { label: "Pages read", value: reportData.totalPages.toLocaleString(), tone: "text-blue-600 bg-blue-50 border-blue-100" },
                                { label: "Chunks", value: reportData.totalChunks.toLocaleString(), tone: "text-violet-600 bg-violet-50 border-violet-100" },
                                { label: "Characters", value: reportData.totalChars.toLocaleString(), tone: "text-emerald-600 bg-emerald-50 border-emerald-100" },
                              ].map((s) => (
                                <div key={s.label} className={`border rounded-lg px-2.5 py-2 ${s.tone}`}>
                                  <div className="text-base font-bold tabular-nums leading-none">{s.value}</div>
                                  <div className="text-[10px] uppercase tracking-wide opacity-70 mt-1">{s.label}</div>
                                </div>
                              ))}
                            </div>
                            {live && <div className="flex items-center gap-1.5 text-[11px] text-blue-500 mb-2"><Loader2 className="w-3 h-3 animate-spin" /> Crawling live — pages appear here as they are read…</div>}

                            {/* Per-page drill-down: name, path, proportional text bar */}
                            <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-50">
                              {reportData.pages.map((p, idx) => {
                                let short = p.url;
                                try { const u = new URL(p.url); short = decodeURIComponent((u.pathname === "/" ? u.hostname : u.pathname)); } catch {}
                                const name = p.name || short;
                                const thin = p.chars < 200;   // flag near-empty pages
                                const pct = Math.round((p.chars / maxChars) * 100);
                                return (
                                  <div key={p.url} className="px-2.5 py-2 hover:bg-neutral-50/80 group/page">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] tabular-nums text-neutral-300 w-5 text-right flex-shrink-0">{idx + 1}</span>
                                        <div className="min-w-0">
                                          <a href={p.url} target="_blank" rel="noopener noreferrer" dir="auto"
                                            className="text-[13px] font-medium text-neutral-700 hover:text-blue-600 hover:underline truncate block" title={p.url}>
                                            {name}{thin && <span className="ml-1.5 text-amber-500" title="Very little text extracted — page may be image-only or JS-rendered">⚠</span>}
                                          </a>
                                          <span className="text-[10px] text-neutral-400 truncate block" dir="auto" title={p.url}>{short}</span>
                                        </div>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <div className={`text-xs tabular-nums font-medium ${thin ? "text-amber-600" : "text-neutral-600"}`}>{p.chars.toLocaleString()} ch</div>
                                        <div className="text-[10px] text-neutral-400 tabular-nums">{p.chunks} chunk{p.chunks !== 1 ? "s" : ""}</div>
                                      </div>
                                    </div>
                                    {/* proportional text-volume bar */}
                                    <div className="mt-1.5 ml-7 h-1 rounded-full bg-neutral-100 overflow-hidden">
                                      <div className={`h-full rounded-full ${thin ? "bg-amber-300" : "bg-blue-400"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-2">
                              Every page the crawler read is listed above — bar length = how much text was extracted.
                              {thinCount > 0 && <span className="text-amber-600"> {thinCount} page{thinCount !== 1 ? "s" : ""} yielded little text (⚠) — likely image-only or JS-rendered.</span>}
                              {" "}Re-sync after the site updates to refresh coverage.
                            </p>
                          </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-neutral-300 mt-3 text-center">TXT · MD · PDF · DOCX (max 5 MB) · Any public URL</p>
            </div>
          )}
        </div>
      )}

      {/* ── Test Chat Tab ─────────────────────────────────────────────── */}
      {tab === "test" && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col" style={{ height: "calc(100vh - 260px)", minHeight: 480 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex-shrink-0">
            <div>
              <p className="text-sm font-semibold text-neutral-800">
                Test: {assistant.name || "Assistant"}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Simulates the prompt &amp; knowledge base — no Twilio, no phone charges.
              </p>
              {((assistant as AssistantExtended).customTools || []).some((t) => t.url) && (
                <p className="text-[11px] text-amber-600 mt-0.5">
                  ⚠️ API tools fire for real here — they call their live endpoints (e.g. SMS/bookings actually send).
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={resetChat}
              className="text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-200 hover:border-neutral-400 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          </div>

          {/* Unsaved warning */}
          {hasUnsavedChanges && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs flex items-center justify-between flex-shrink-0">
              <span>⚠ You have unsaved changes — the test uses your current (unsaved) prompt settings.</span>
              <button onClick={handleSave} disabled={saving}
                className="ml-2 text-amber-700 underline hover:no-underline font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save now"}
              </button>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 py-10">
                <Mic2 className="w-10 h-10 text-neutral-200 mb-3" />
                <p className="text-sm font-medium text-neutral-500">Start a conversation</p>
                <p className="text-xs mt-1 max-w-xs">
                  Type a message below to test how the assistant responds using your current prompt and knowledge base.
                </p>
                {assistant.firstMessage && (
                  <div className="mt-4 max-w-xs w-full">
                    <div className="bg-neutral-100 text-neutral-600 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 text-left">
                      {assistant.firstMessage}
                    </div>
                    <p className="text-[10px] text-neutral-300 mt-1">Opening greeting (for reference)</p>
                  </div>
                )}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {/* Tool-call pills (sandbox): show each tool the assistant fired, its args + real result */}
                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="max-w-[85%] mb-1.5 space-y-1">
                    {msg.toolCalls.map((tc, j) => (
                      <details key={j} className={`text-[11px] rounded-lg border px-2 py-1 ${tc.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <summary className="cursor-pointer font-mono text-neutral-700 truncate">
                          🔧 {tc.name}({Object.entries(tc.args || {}).map(([k, v]) => `${k}=${String(v)}`).join(", ")}) {tc.ok ? "✓" : "✗"} {tc.status || ""} · {tc.ms}ms
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-neutral-600 max-h-48 overflow-auto">{tc.url ? tc.url + "\n\n" : ""}{tc.result}</pre>
                      </details>
                    ))}
                  </div>
                )}
                {msg.content && (
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#F22F46] text-white rounded-br-sm"
                      : "bg-neutral-100 text-neutral-800 rounded-bl-sm"
                  }`}>
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            {chatError && (
              <div className="text-center">
                <span className="inline-block bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full border border-red-200">{chatError}</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-neutral-100 bg-white">
            <form
              onSubmit={(e) => { e.preventDefault(); handleChatSend(); }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message…"
                disabled={chatLoading}
                className="flex-1 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-40 text-white transition-colors flex-shrink-0"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
            <p className="text-[10px] text-neutral-300 mt-1.5 text-center">
              Text simulation only — voice and phone behaviour may differ slightly
            </p>
          </div>
        </div>
      )}

      {/* ── Scenario test phone simulator ─────────────────────────────── */}
      {showScenarioTestSim && (assistant as AssistantExtended).realtimeScenarioId && (
        <ScenarioPhoneSimulator
          scenarioId={(assistant as AssistantExtended).realtimeScenarioId!}
          scenarioName={scenarios.find((s) => s.id === (assistant as AssistantExtended).realtimeScenarioId)?.name || "Scenario"}
          onClose={() => setShowScenarioTestSim(false)}
        />
      )}

      {/* ── AI scenario wizard modal ──────────────────────────────────── */}
      {showScenarioWizard && (
        <ScenarioQuickWizardModal
          onClose={() => setShowScenarioWizard(false)}
          onCreated={(newId, newName) => {
            set("realtimeScenarioId", newId);
            setShowScenarioWizard(false);
            scenariosList()
              .then((res) => setScenarios(Array.isArray(res?.scenarios) ? res.scenarios : []))
              .catch(() => {});
          }}
        />
      )}

      {/* ── Voice clone recorder modal ─────────────────────────────────── */}
      <VoiceCloneRecorder
        open={voiceCloneOpen}
        language={currentLang.startsWith("he") ? "he" : "en"}
        onClose={() => setVoiceCloneOpen(false)}
        onComplete={(v) => {
          // Auto-select the newly cloned voice and refresh the list
          set("voice", `elevenlabs:${v.voiceId}`);
          reloadCustomVoices();
        }}
      />
    </div>
  );
}

export default function AssistantEditPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>}>
      <AssistantEdit />
    </Suspense>
  );
}
