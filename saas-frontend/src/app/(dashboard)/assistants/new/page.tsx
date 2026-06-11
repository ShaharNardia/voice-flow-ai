"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assistantsCreate } from "@/lib/firebase-functions";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

// ── Language & voice data (kept in sync with assistants/edit/page.tsx) ─

const LANGUAGES = [
  { value: "en-US", flag: "🇺🇸", label: "English (US)" },
  { value: "en-GB", flag: "🇬🇧", label: "English (UK)" },
  { value: "en-AU", flag: "🇦🇺", label: "English (AU)" },
  { value: "en-ZA", flag: "🇿🇦", label: "English (ZA)" },
  { value: "he-IL", flag: "🇮🇱", label: "Hebrew" },
  { value: "ar",    flag: "🇸🇦", label: "Arabic" },
  { value: "el-GR", flag: "🇬🇷", label: "Greek" },
  { value: "af-ZA", flag: "🇿🇦", label: "Afrikaans" },
  { value: "zu-ZA", flag: "🇿🇦", label: "isiZulu" },
];

const VOICES_BY_LANG: Record<string, { value: string; label: string }[]> = {
  "en-US": [
    { value: "Google.en-US-Neural2-F", label: "🇺🇸 Google Neural2-F (Female)" },
    { value: "Google.en-US-Neural2-J", label: "🇺🇸 Google Neural2-J (Male)" },
    { value: "Google.en-US-Neural2-C", label: "🇺🇸 Google Neural2-C (Female, Warm)" },
    { value: "Google.en-US-Neural2-I", label: "🇺🇸 Google Neural2-I (Male)" },
    { value: "Polly.Joanna",           label: "🇺🇸 Polly Joanna (Female)" },
    { value: "Polly.Matthew",          label: "🇺🇸 Polly Matthew (Male)" },
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
  ],
  "he-IL": [
    { value: "openai:nova",                   label: "🇮🇱 OpenAI Nova (Female, Recommended)" },
    { value: "openai:alloy",                  label: "🇮🇱 OpenAI Alloy (Neutral)" },
    { value: "openai:shimmer",                label: "🇮🇱 OpenAI Shimmer (Female)" },
    { value: "openai:echo",                   label: "🇮🇱 OpenAI Echo (Male)" },
    { value: "Google.he-IL-Chirp3-HD-Achird", label: "🇮🇱 Google Chirp3 Achird (Male)" },
    { value: "Google.he-IL-Chirp3-HD-Kore",   label: "🇮🇱 Google Chirp3 Kore (Female)" },
    { value: "Google.he-IL-Wavenet-D",        label: "🇮🇱 Google Wavenet-D (Male)" },
    { value: "Google.he-IL-Wavenet-A",        label: "🇮🇱 Google Wavenet-A (Female)" },
  ],
  "ar": [
    { value: "Google.ar-XA-Wavenet-B",  label: "🇸🇦 Arabic Wavenet-B (Male, Recommended)" },
    { value: "Google.ar-XA-Wavenet-A",  label: "🇸🇦 Arabic Wavenet-A (Female)" },
    { value: "Google.ar-XA-Wavenet-C",  label: "🇸🇦 Arabic Wavenet-C (Male)" },
    { value: "Google.ar-XA-Wavenet-D",  label: "🇸🇦 Arabic Wavenet-D (Female)" },
    { value: "Polly.Zeina",             label: "🇸🇦 Polly Zeina (Female, MSA)" },
  ],
  "el-GR": [
    { value: "Google.el-GR-Wavenet-A", label: "🇬🇷 Greek Wavenet-A (Female, Recommended)" },
    { value: "openai:alloy",           label: "🇬🇷 OpenAI Alloy (Neutral)" },
    { value: "openai:nova",            label: "🇬🇷 OpenAI Nova (Female)" },
    { value: "openai:echo",            label: "🇬🇷 OpenAI Echo (Male)" },
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
  ],
  "zu-ZA": [
    // No native Google/Twilio Zulu TTS — Realtime (V2V) mode is strongly recommended.
    // Standard mode falls back to SA English TTS for system phrases.
    { value: "openai:shimmer",          label: "🇿🇦 OpenAI Shimmer (Female, Recommended)" },
    { value: "openai:alloy",            label: "🇿🇦 OpenAI Alloy (Neutral)" },
    { value: "openai:nova",             label: "🇿🇦 OpenAI Nova (Female)" },
    { value: "openai:echo",             label: "🇿🇦 OpenAI Echo (Male)" },
    { value: "openai:onyx",             label: "🇿🇦 OpenAI Onyx (Male, Deep)" },
  ],
};

// First voice per language — used when switching language to auto-select a safe default
const DEFAULT_VOICE: Record<string, string> = Object.fromEntries(
  Object.entries(VOICES_BY_LANG).map(([lang, voices]) => [lang, voices[0].value])
);

// Language-appropriate greeting placeholder (uses {{companyName}} token)
const GREETING_PLACEHOLDER: Record<string, string> = {
  "en-US": "Hey there! Thanks for calling {{companyName}}. How can I help you today?",
  "en-GB": "Hello! Thank you for calling {{companyName}}. How may I help you today?",
  "en-AU": "G'day! Thanks for calling {{companyName}}. How can I help?",
  "he-IL": "שלום! תודה שצלצלת ל-{{companyName}}. איך אוכל לעזור לך היום?",
  "ar":    "مرحباً! شكراً لاتصالك بـ {{companyName}}. كيف يمكنني مساعدتك اليوم؟",
  "el-GR": "Γεια σας! Ευχαριστούμε που καλέσατε την {{companyName}}. Πώς μπορούμε να σας βοηθήσουμε;",
};

// System-prompt placeholder by language
const PROMPT_PLACEHOLDER: Record<string, string> = {
  "he-IL": "לדוגמה: אתה נציג שירות לקוחות. המטרה שלך לתאם פגישות לבדיקה חינמית. שאל תמיד את שם הלקוח לפני שממשיכים.",
  "ar":    "مثال: أنت وكيل خدمة عملاء. هدفك تحديد مواعيد تفتيش مجانية. اسأل دائماً عن اسم العميل أولاً.",
  "el-GR": "π.χ. Είσαι αντιπρόσωπος εξυπηρέτησης. Ο στόχος σου είναι να κλείνεις ραντεβού δωρεάν επιθεώρησης.",
};

// Default system prompt injected when Voice-to-Voice (Realtime) mode is selected.
// This is the exact authoritative version — covers noise filtering, anti-stall,
// bilingual Hebrew+English handling, and TTS optimisation hints.
// Users can edit it freely after the wizard — this is just the smart starting point.
const DEFAULT_V2V_SYSTEM_PROMPT = `# Phone Bot Agent – System Prompt

## Role & Identity

You are a voice-based conversational AI agent operating in a real-time Voice-to-Voice phone bot system. You conduct natural, fluid phone conversations — primarily in Hebrew, with the ability to seamlessly integrate English words, names, and terms when contextually appropriate.

---

## 1. Environmental Noise Filtering & Smart Interruption Detection

### Core Principle
**Your default assumption is ALWAYS that any audio event is background noise, NOT an intentional interruption.** You must prove to yourself that the user is deliberately talking TO YOU before stopping. When in doubt — keep talking.

### The Primary Gate: "Is the user talking TO ME?"
Before evaluating anything else, ask yourself this single question:
> *"Is this audio clearly directed at me, the phone assistant — or is it something else happening in the environment?"*

Only pass the gate if the answer is **yes, clearly**. Everything else is noise and must be ignored.

### Sounds to ALWAYS IGNORE (never stop for these):
- Coughing, sneezing, throat clearing, sighing
- Background conversations (TV, radio, people talking nearby — even if words are audible)
- Car horns, sirens, traffic, engine sounds
- Dog barking, cat meowing, any animal sound
- Door slamming, objects dropping, footsteps, keyboard typing
- Wind, static, microphone bumps, rustling
- Baby crying, children playing in background
- Music or audio playing in the background
- Phone notifications, ringtones, alert sounds
- The user talking to someone else in the room ("רגע, תחכה..." said to a third party)
- Any audio shorter than 2 seconds that does not contain a clear, complete word directed at you

### Signs that speech IS directed at you (all of these must be present):
1. **Direct address**: The speech is clearly aimed at you — not at a pet, a person nearby, or into the void
2. **Conversation-relevant content**: The words relate to the current phone call topic, or are explicit control words ("רגע", "עצור", "wait", "stop", "שאלה", "סליחה")
3. **Sustained and structured**: At least 2 full seconds of deliberate, sentence-like speech — not a burst, gasp, or single exclamation
4. **Primary speaker**: The voice matches the person you have been speaking with on this call, not a background voice

### Decision Logic (evaluate in order — stop at first match):
1. Audio is non-speech (bark, bang, cough, music, TV, etc.) → **IGNORE immediately, keep talking**
2. Audio is speech but from a background voice (not the primary caller) → **IGNORE, keep talking**
3. Audio is speech from the primary caller but directed at someone else in the room → **IGNORE, keep talking**
4. Audio is speech but shorter than 2 seconds with no complete recognizable word → **IGNORE, keep talking**
5. Audio contains explicit stop/pause keywords from the primary caller ("רגע" / "עצור" / "חכה" / "wait" / "stop" / "hold on") → **PAUSE and LISTEN**
6. Audio is sustained speech (2+ seconds) from the primary caller that is clearly addressed to you and relates to the conversation → **PAUSE and LISTEN**
7. If you are uncertain which rule applies → **default to IGNORE and keep talking**

### Behavior when ignoring noise:
- Continue your current response seamlessly — no pause, no stutter, no restart, no acknowledgement.
- **Never say** "I didn't catch that", "Could you repeat?", "Sorry about that", or anything that hints you noticed a sound. Silence is not golden here — words are.
- Treat it exactly as if the sound never happened.

### Behavior when detecting genuine interruption:
- Stop at the nearest natural pause point (end of a word or short phrase).
- Listen fully — wait for the user to finish speaking completely.
- Acknowledge briefly and naturally: "כן, בוודאי" / "אני שומע אותך" / "בטח, תגיד".
- Respond only to the new input. Do NOT resume or repeat pre-interruption content unless the user explicitly asks.

---

## 2. Anti-Stalling & Interruption Recovery

### Core Principle
You must NEVER get stuck, freeze, or produce silence mid-sentence — whether after an interruption, a noise event, or at any point in the conversation.

### Stalling Prevention Rules:

1. **After interruption recovery**: Once you detect a genuine interruption, fully process the user's input, then respond with a NEW, complete sentence. Never attempt to resume a half-finished sentence from before the interruption.

2. **After noise events (ignored)**: If you correctly ignored an environmental noise, your speech stream must continue without any gap, hesitation, or restart. The output buffer should keep flowing.

3. **Sentence completion guarantee**: Every sentence you begin MUST be completed. If for any reason you cannot complete a sentence, immediately start a fresh one rather than leaving silence.

4. **Silence timeout**: If you detect you have been silent for more than 2 seconds without the user speaking, immediately produce output — either continue your response or prompt the user (e.g., "אתה שומע אותי?" / "אני כאן, איך אפשר לעזור?").

5. **Recovery phrases** — if you sense a technical glitch or momentary confusion, use natural recovery phrases:
   - "אז כמו שאמרתי..." (So as I was saying...)
   - "בקיצור..." (In short...)
   - "אוקיי, אז..." (Okay, so...)
   - "חזרתי אלייך..." (I'm back with you...)

### Post-Interruption Flow:
1. User interrupts → STOP speaking
2. LISTEN to user's full input (wait for end of user speech)
3. PROCESS user's request
4. RESPOND with a fresh, complete reply
5. NEVER replay/resume the pre-interruption content unless explicitly asked

### Anti-Loop Protection:
If the same interruption→recovery cycle happens 3+ times in rapid succession, say: "נראה שיש קצת רעש ברקע. אני אמשיך ואם תרצה לעצור אותי, פשוט תגיד 'רגע' או 'עצור', בסדר?"

---

## 3. Bilingual Support – Hebrew + English Integration

### Core Principle
Your primary language is **Hebrew**. However, you must seamlessly integrate **English** words, terms, codes, names, and technical vocabulary when the context requires it — without switching your entire response to English.

### When to use English within Hebrew speech:
- Flight numbers: "מספר הטיסה הוא LY three one five (LY315)"
- Airport codes: "נחיתה ב-JFK שזה ניו יורק"
- Brand / product names: "המערכת רצה על Kubernetes ו-Docker"
- Technical terms: "תעשה restart ל-router"
- International names: "הנציג שלנו, Michael Johnson, יחזור אלייך"
- Email addresses: "שלח מייל ל-support at company dot com"
- URLs / domains: "תיכנס ל-www dot example dot com"
- Codes / serial numbers: "מספר ההזמנה שלך הוא AB dash seven four two nine"
- Status terms: "הסטטוס של הטיסה הוא on time"
- Industry acronyms: "ה-SLA שלנו מבטיח..."

### Pronunciation Rules for English within Hebrew:
- **Letters**: Spell out individually and clearly — "A, B, C" not "abc" as a blob
- **Numbers**: Within English codes, say numbers in English ("three one five" not "שלוש אחד חמש") to avoid confusion
- **Mixed codes**: For codes like LY315, say "L Y three one five" — letters in English, numbers in English
- **Technical terms**: Pronounce them in proper English pronunciation, not Hebraized — say "Kubernetes" correctly, not "קוברנטיס"
- **Transition smoothness**: Move between Hebrew and English without announcing the language switch. No need to say "באנגלית זה נקרא..." — just say it naturally.

### TTS Optimization for Bilingual Output:
- When outputting text for TTS, mark English segments clearly so the TTS engine can switch voice/pronunciation model.
- Use natural pausing (comma or short pause) before and after English segments to give the TTS engine transition time.
- For critical identifiers (flight numbers, order codes), repeat them once: "מספר הטיסה LY three one five, שוב, L... Y... three... one... five"

### Language Detection for User Input:
- If the user speaks in English, you may respond in English.
- If the user speaks in Hebrew, respond in Hebrew (with English terms as needed).
- If the user mixes languages, match their pattern.
- Default is always Hebrew unless the user indicates otherwise.

---

## General Conversation Guidelines

1. **Be natural**: Sound like a helpful human phone agent, not a robotic IVR.
2. **Be concise**: Phone conversations require brevity. Don't over-explain.
3. **Confirm critical info**: Repeat back important details (flight numbers, dates, order IDs) for accuracy.
4. **Handle "what did you say?"**: If the user asks you to repeat, rephrase slightly rather than playing back identical text.
5. **Graceful degradation**: If you truly cannot understand the user after 2-3 attempts, offer to transfer to a human agent or suggest an alternative channel.`;

// OpenAI Realtime voices (used when Voice-to-Voice mode is selected)
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

const STEPS = [
  { label: "Identity",        desc: "Name & company" },
  { label: "Voice",           desc: "Mode, language & greeting" },
  { label: "Behavior",        desc: "Instructions & permissions" },
  { label: "Review",          desc: "Confirm & create" },
];

// ── Types ─────────────────────────────────────────────────────────────

interface FormData {
  language: string;
  name: string;
  companyName: string;
  industry: string;
  isRealtime: boolean;
  voice: string;
  realtimeVoice: string;
  firstMessage: string;
  systemPrompt: string;
  createJobPermission: boolean;
  reschedulePermission: boolean;
  cancelPermission: boolean;
  offerFreeEstimation: boolean;
  priceRestriction: boolean;
}

const INITIAL_FORM: FormData = {
  language: "en-US",
  name: "",
  companyName: "",
  industry: "",
  isRealtime: false,
  voice: DEFAULT_VOICE["en-US"],
  realtimeVoice: "ash",
  firstMessage: "",
  systemPrompt: "",
  createJobPermission: true,
  reschedulePermission: false,
  cancelPermission: false,
  offerFreeEstimation: false,
  priceRestriction: false,
};

// ── Helpers ───────────────────────────────────────────────────────────

function langDisplay(value: string) {
  const l = LANGUAGES.find((x) => x.value === value);
  return l ? `${l.flag} ${l.label}` : value;
}

function voiceDisplay(value: string, lang: string) {
  return (VOICES_BY_LANG[lang] ?? []).find((v) => v.value === value)?.label ?? value;
}

const isRTL = (lang: string) => lang === "he-IL" || lang === "ar";

// ── Page ──────────────────────────────────────────────────────────────

export default function NewAssistantPage() {
  const router = useRouter();
  const [step, setStep]         = useState(0);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [form, setForm]         = useState<FormData>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Generic field setter — also clears that field's validation error
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  // Language change: auto-select the first (recommended) voice for the new language
  function changeLanguage(lang: string) {
    setForm((prev) => ({ ...prev, language: lang, voice: DEFAULT_VOICE[lang] ?? "" }));
    setFieldErrors((prev) => ({ ...prev, language: undefined, voice: undefined }));
  }

  // Toggle between Standard and Voice-to-Voice mode.
  // Turning on V2V pre-fills the system prompt with the default V2V instructions.
  // Turning off clears it ONLY if it still matches the default (user hasn't edited it).
  function toggleRealtime(on: boolean) {
    setForm((prev) => ({
      ...prev,
      isRealtime: on,
      systemPrompt: on
        ? DEFAULT_V2V_SYSTEM_PROMPT
        : prev.systemPrompt === DEFAULT_V2V_SYSTEM_PROMPT ? "" : prev.systemPrompt,
    }));
  }

  const voiceOptions = VOICES_BY_LANG[form.language] ?? [];
  const rtl = isRTL(form.language);

  // Per-step validation — returns true if the current step is valid
  function validate(s: number): boolean {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (s === 0) {
      if (!form.name.trim())        errs.name        = "Assistant name is required";
      if (!form.companyName.trim()) errs.companyName = "Company name is required";
    }
    // Step 1 voice is always auto-selected — nothing can be empty
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const goNext = () => { if (validate(step)) setStep((s) => s + 1); };
  const goTo   = (i: number) => { if (i < step) setStep(i); }; // only jump to completed steps

  // ── Create ────────────────────────────────────────────────────────────
  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await assistantsCreate({
        ...form,
        assistantName: form.name,
        // Pass realtime fields so the assistant is immediately ready for V2V calls
        realtimeEnabled: form.isRealtime,
        realtimeVoice: form.isRealtime ? form.realtimeVoice : undefined,
      } as any);
      router.replace("/assistants");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create assistant");
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg">
      <Link
        href="/assistants"
        className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Assistants
      </Link>

      <h2 className="text-lg font-semibold text-neutral-900 mb-0.5">New Assistant</h2>
      <p className="text-sm text-neutral-500 mb-6">Configure your AI phone agent in a few steps.</p>

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-0 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1">
            {/* Circle + label */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={i >= step}
                onClick={() => goTo(i)}
                title={i < step ? `Back to ${s.label}` : undefined}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all outline-none ${
                  i < step
                    ? "bg-[#F22F46] text-white cursor-pointer hover:bg-[#d9243b] ring-2 ring-[#F22F46]/20"
                    : i === step
                    ? "bg-[#F22F46]/10 text-[#F22F46] border-2 border-[#F22F46]"
                    : "bg-neutral-100 text-neutral-400 cursor-default"
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </button>
              <span className={`text-[10px] mt-1 font-semibold whitespace-nowrap tracking-wide ${
                i === step ? "text-[#F22F46]" : i < step ? "text-neutral-500" : "text-neutral-300"
              }`}>{s.label}</span>
            </div>
            {/* Connector line (not after last step) */}
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mb-4 transition-colors ${i < step ? "bg-[#F22F46]" : "bg-neutral-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6">

        {/* ════════════════ STEP 0 — IDENTITY ════════════════ */}
        {step === 0 && (
          <div className="space-y-5">

            {/* Assistant Name */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
                Assistant Name *
              </label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => { if (!form.name.trim()) setFieldErrors((p) => ({ ...p, name: "Required" })); }}
                placeholder="e.g. Alex"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
                  fieldErrors.name
                    ? "border-red-300 focus:border-red-400 focus:ring-red-300 bg-red-50/30"
                    : "border-neutral-200 focus:border-[#F22F46] focus:ring-[#F22F46]"
                }`}
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">⚠ {fieldErrors.name}</p>
              )}
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
                Company Name *
              </label>
              <input
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                onBlur={() => { if (!form.companyName.trim()) setFieldErrors((p) => ({ ...p, companyName: "Required" })); }}
                placeholder="e.g. Acme Plumbing"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${
                  fieldErrors.companyName
                    ? "border-red-300 focus:border-red-400 focus:ring-red-300 bg-red-50/30"
                    : "border-neutral-200 focus:border-[#F22F46] focus:ring-[#F22F46]"
                }`}
              />
              {fieldErrors.companyName && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">⚠ {fieldErrors.companyName}</p>
              )}
            </div>

            {/* Industry */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
                Industry <span className="text-neutral-300 font-normal normal-case">(optional)</span>
              </label>
              <input
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="e.g. home services, HVAC, legal, real estate"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
              <p className="text-xs text-neutral-400 mt-1">Helps the AI generate smarter default instructions</p>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 1 — VOICE & GREETING ════════════════ */}
        {step === 1 && (
          <div className="space-y-5">

            {/* Voice Mode toggle */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">Voice Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {/* Standard */}
                <button
                  type="button"
                  onClick={() => toggleRealtime(false)}
                  className={`flex flex-col gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                    !form.isRealtime
                      ? "border-[#F22F46] bg-[#F22F46]/5"
                      : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  <span className={`text-xs font-semibold ${!form.isRealtime ? "text-[#F22F46]" : "text-neutral-700"}`}>
                    🎙 Standard
                  </span>
                  <span className="text-[11px] text-neutral-400 leading-tight">STT → GPT → TTS pipeline</span>
                </button>
                {/* Voice-to-Voice */}
                <button
                  type="button"
                  onClick={() => toggleRealtime(true)}
                  className={`flex flex-col gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                    form.isRealtime
                      ? "border-violet-500 bg-violet-50"
                      : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  <span className={`text-xs font-semibold ${form.isRealtime ? "text-violet-700" : "text-neutral-700"}`}>
                    ⚡ Voice-to-Voice
                  </span>
                  <span className="text-[11px] text-neutral-400 leading-tight">OpenAI Realtime — ultra-low latency</span>
                </button>
              </div>
              {form.isRealtime && (
                <p className="text-xs text-violet-600 mt-1.5 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
                  ⚡ Best-practice instructions will be pre-filled in the Behavior step — review and edit as needed.
                </p>
              )}
            </div>

            {/* Language — shown for both Standard and V2V modes */}
            {(
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
                  Language *
                </label>
                <p className="text-xs text-neutral-400 mb-2.5">
                  {form.isRealtime
                    ? "Sets the conversation language and Whisper STT hint for Voice-to-Voice mode."
                    : "Sets voice options and conversation language for the Standard pipeline."}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => changeLanguage(l.value)}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                        form.language === l.value
                          ? "border-[#F22F46] bg-[#F22F46]/5"
                          : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <span className="text-xl leading-none">{l.flag}</span>
                      <span className={`text-xs font-medium leading-tight ${form.language === l.value ? "text-[#F22F46]" : "text-neutral-600"}`}>
                        {l.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Voice selector — Standard or Realtime */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">Voice</label>
              {!form.isRealtime ? (
                <>
                  <select
                    value={form.voice}
                    onChange={(e) => set("voice", e.target.value)}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                  >
                    {voiceOptions.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-400 mt-1">
                    Only voices for {langDisplay(form.language)} are shown.
                    You can preview &amp; fine-tune after creating.
                  </p>
                </>
              ) : (
                <>
                  <select
                    value={form.realtimeVoice}
                    onChange={(e) => set("realtimeVoice", e.target.value)}
                    className="w-full border border-violet-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    {REALTIME_VOICES.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-400 mt-1">OpenAI Realtime voices — language-agnostic, ultra-low latency.</p>
                </>
              )}
            </div>

            {/* Opening Greeting */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5 uppercase tracking-wide">
                Opening Greeting <span className="text-neutral-300 font-normal normal-case">(optional)</span>
              </label>
              <p className="text-xs text-neutral-400 mb-1.5">
                First thing said when the call connects. Use{" "}
                <code className="bg-neutral-100 px-1 rounded text-neutral-600 text-[11px]">{"{{leadName}}"}</code>{" "}and{" "}
                <code className="bg-neutral-100 px-1 rounded text-neutral-600 text-[11px]">{"{{companyName}}"}</code> as tokens.
              </p>
              <textarea
                value={form.firstMessage}
                onChange={(e) => set("firstMessage", e.target.value)}
                placeholder={GREETING_PLACEHOLDER[form.language] ?? GREETING_PLACEHOLDER["en-US"]}
                rows={3}
                dir={rtl ? "rtl" : "ltr"}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none"
              />
              <p className="text-xs text-neutral-400 mt-1">Leave blank to use the auto-generated default greeting</p>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 2 — BEHAVIOR ════════════════ */}
        {step === 2 && (
          <div className="space-y-5">

            {/* System prompt */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  {form.isRealtime ? "Instructions" : "Custom Instructions"}
                  {!form.isRealtime && (
                    <span className="text-neutral-300 font-normal normal-case ml-1">(optional)</span>
                  )}
                </label>
                {form.isRealtime && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-semibold rounded-full border border-violet-200">
                    ⚡ Pre-filled for Voice-to-Voice
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mb-1.5">
                {form.isRealtime
                  ? "Best-practice instructions for noise filtering, anti-stall, and bilingual support are pre-filled. Customize for your specific use case."
                  : "Describe the assistant's goal and constraints in 1–3 sentences. Leave blank to use a smart default based on your company and industry."}
              </p>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => set("systemPrompt", e.target.value)}
                rows={form.isRealtime ? 12 : 4}
                dir={rtl ? "rtl" : "ltr"}
                placeholder={
                  form.isRealtime ? "" :
                  PROMPT_PLACEHOLDER[form.language] ??
                  "e.g. You are a sales agent for a roofing company. Your goal is to schedule a free inspection. Keep replies to 1–2 sentences max."
                }
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none font-mono text-xs transition-colors ${
                  form.isRealtime
                    ? "border-violet-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    : "border-neutral-200 focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                }`}
              />
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Permissions</label>
              <p className="text-xs text-neutral-400 mb-3">Choose what your agent is allowed to do during a call.</p>
              <div className="space-y-2">
                {([
                  { key: "createJobPermission" as const, label: "Book appointments",       desc: "Agent can schedule new appointments" },
                  { key: "reschedulePermission" as const, label: "Reschedule",              desc: "Agent can reschedule existing appointments" },
                  { key: "cancelPermission" as const,     label: "Cancel bookings",         desc: "Agent can cancel existing bookings" },
                  { key: "offerFreeEstimation" as const,  label: "Offer free estimates",    desc: "Agent can promise a free quote" },
                  { key: "priceRestriction" as const,     label: "Block price negotiation", desc: "Agent will not discuss price discounts" },
                ]).map(({ key, label, desc }) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      form[key]
                        ? "border-[#F22F46]/30 bg-[#F22F46]/5"
                        : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => set(key, e.target.checked)}
                      className="mt-0.5 accent-[#F22F46]"
                    />
                    <div>
                      <div className="text-sm font-medium text-neutral-700">{label}</div>
                      <div className="text-xs text-neutral-400">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ STEP 3 — REVIEW ════════════════ */}
        {step === 3 && (
          <div>
            <p className="text-sm text-neutral-500 mb-4">Everything looks good? Hit Create.</p>

            <ReviewSection title="Identity" onEdit={() => setStep(0)}>
              <ReviewRow label="Name"     value={form.name} />
              <ReviewRow label="Company"  value={form.companyName} />
              {form.industry && <ReviewRow label="Industry" value={form.industry} />}
            </ReviewSection>

            <ReviewSection title="Voice & Greeting" onEdit={() => setStep(1)}>
              <ReviewRow
                label="Mode"
                value={form.isRealtime ? "⚡ Voice-to-Voice (Realtime)" : "🎙 Standard (STT → GPT → TTS)"}
              />
              {!form.isRealtime && <ReviewRow label="Language" value={langDisplay(form.language)} />}
              <ReviewRow
                label="Voice"
                value={form.isRealtime
                  ? (REALTIME_VOICES.find((v) => v.value === form.realtimeVoice)?.label ?? form.realtimeVoice)
                  : voiceDisplay(form.voice, form.language)}
              />
              <ReviewRow
                label="Greeting"
                value={form.firstMessage || "Auto-generated default"}
                muted={!form.firstMessage}
                multiline={!!form.firstMessage}
                rtl={rtl}
              />
            </ReviewSection>

            <ReviewSection title="Behavior" onEdit={() => setStep(2)}>
              <ReviewRow
                label="Instructions"
                value={
                  !form.systemPrompt
                    ? "Auto-generated based on industry"
                    : form.systemPrompt === DEFAULT_V2V_SYSTEM_PROMPT
                    ? "Voice-to-Voice default system prompt (best-practice)"
                    : form.systemPrompt
                }
                muted={!form.systemPrompt}
                multiline={!!(form.systemPrompt && form.systemPrompt !== DEFAULT_V2V_SYSTEM_PROMPT)}
              />
              <div className="pt-1.5">
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide">Permissions</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {([
                    { key: "createJobPermission",  label: "Book appointments" },
                    { key: "reschedulePermission", label: "Reschedule" },
                    { key: "cancelPermission",     label: "Cancel bookings" },
                    { key: "offerFreeEstimation",  label: "Free estimates" },
                    { key: "priceRestriction",     label: "Block price negotiation" },
                  ]).map(({ key, label }) => (
                    <span
                      key={key}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        form[key as keyof FormData]
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-neutral-50 text-neutral-400 border-neutral-100 line-through"
                      }`}
                    >
                      {form[key as keyof FormData] ? "✓" : "✗"} {label}
                    </span>
                  ))}
                </div>
              </div>
            </ReviewSection>

            {error && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4">
        {step > 0 ? (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-700 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        ) : <div />}

        {step < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Creating…" : "Create Assistant"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Review sub-components ─────────────────────────────────────────────

function ReviewSection({
  title, onEdit, children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-neutral-100 rounded-xl p-4 mb-3 bg-neutral-50/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{title}</span>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-[#F22F46] hover:underline font-semibold"
        >
          Edit
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({
  label, value, multiline, muted, rtl,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  muted?: boolean;
  rtl?: boolean;
}) {
  if (multiline) {
    return (
      <div>
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide block mb-0.5">{label}</span>
        <span
          className={`text-xs block whitespace-pre-wrap ${muted ? "text-neutral-400 italic" : "text-neutral-700"}`}
          dir={rtl ? "rtl" : undefined}
        >
          {value}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-right ${muted ? "text-neutral-400 italic" : "text-neutral-700"}`}>
        {value}
      </span>
    </div>
  );
}
