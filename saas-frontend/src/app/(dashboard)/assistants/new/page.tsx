"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assistantsCreate } from "@/lib/firebase-functions";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

const STEPS = ["Identity", "Voice & Language", "Permissions", "Review"];

const LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (Australian)" },
  { value: "he-IL", label: "Hebrew" },
  { value: "ar", label: "Arabic" },
];

const VOICES = [
  { value: "Google.en-US-Neural2-F", label: "Google Neural2 — Female (en-US)", lang: "en-US" },
  { value: "Google.en-US-Neural2-J", label: "Google Neural2 — Male (en-US)", lang: "en-US" },
  { value: "Google.en-GB-Neural2-A", label: "Google Neural2 — Female (en-GB)", lang: "en-GB" },
  { value: "Google.en-GB-Neural2-B", label: "Google Neural2 — Male (en-GB)", lang: "en-GB" },
  { value: "Google.en-AU-Neural2-A", label: "Google Neural2 — Female (en-AU)", lang: "en-AU" },
  { value: "Google.en-AU-Neural2-B", label: "Google Neural2 — Male (en-AU)", lang: "en-AU" },
  { value: "Polly.Olivia", label: "Polly Olivia — Female Neural (en-AU)", lang: "en-AU" },
  { value: "Google.he-IL-Wavenet-A", label: "Google WaveNet — Female (he-IL)", lang: "he-IL" },
  { value: "Google.he-IL-Wavenet-D", label: "Google WaveNet — Male (he-IL)", lang: "he-IL" },
];

interface FormData {
  name: string;
  companyName: string;
  industry: string;
  language: string;
  voice: string;
  firstMessage: string;
  createJobPermission: boolean;
  reschedulePermission: boolean;
  cancelPermission: boolean;
  offerFreeEstimation: boolean;
  priceRestriction: boolean;
}

export default function NewAssistantPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData>({
    name: "",
    companyName: "",
    industry: "",
    language: "en-US",
    voice: "Google.en-US-Neural2-F",
    firstMessage: "",
    createJobPermission: true,
    reschedulePermission: false,
    cancelPermission: false,
    offerFreeEstimation: false,
    priceRestriction: false,
  });

  const set = (key: keyof FormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const filteredVoices = VOICES.filter((v) => v.lang === form.language || v.lang.startsWith(form.language.split("-")[0]));

  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      await assistantsCreate({
        ...form,
        assistantName: form.name,
      });
      router.replace("/assistants");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create assistant");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Link href="/assistants" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Assistants
      </Link>

      <h2 className="text-lg font-semibold text-neutral-900 mb-1">New Assistant</h2>
      <p className="text-sm text-neutral-500 mb-6">Configure your AI phone agent in a few steps.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
              i < step ? "bg-[#F22F46] text-white" :
              i === step ? "bg-[#F22F46]/10 text-[#F22F46] border border-[#F22F46]" :
              "bg-neutral-100 text-neutral-400"
            }`}>
              {i < step ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-xs ${i === step ? "text-neutral-700 font-medium" : "text-neutral-400"}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-neutral-200 mx-1" />}
          </div>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        {/* Step 0: Identity */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Assistant Name *</label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Alex"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Company Name *</label>
              <input
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="e.g. Acme Plumbing"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Industry</label>
              <input
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="e.g. home services, HVAC, legal"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Opening Greeting</label>
              <textarea
                value={form.firstMessage}
                onChange={(e) => set("firstMessage", e.target.value)}
                placeholder="Hey there! Thanks for calling Acme Plumbing. How can I help you today?"
                rows={2}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none"
              />
              <p className="text-xs text-neutral-400 mt-1">Leave blank to use default greeting</p>
            </div>
          </div>
        )}

        {/* Step 1: Voice & Language */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Language</label>
              <select
                value={form.language}
                onChange={(e) => {
                  set("language", e.target.value);
                  const matchingVoice = VOICES.find((v) => v.lang === e.target.value);
                  if (matchingVoice) set("voice", matchingVoice.value);
                }}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Voice</label>
              <div className="space-y-2">
                {filteredVoices.map((v) => (
                  <label key={v.value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    form.voice === v.value ? "border-[#F22F46] bg-[#F22F46]/5" : "border-neutral-200 hover:bg-neutral-50"
                  }`}>
                    <input
                      type="radio"
                      name="voice"
                      value={v.value}
                      checked={form.voice === v.value}
                      onChange={() => set("voice", v.value)}
                      className="accent-[#F22F46]"
                    />
                    <span className="text-sm text-neutral-700">{v.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Permissions */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 mb-4">Choose what your agent is allowed to do during a call.</p>
            {[
              { key: "createJobPermission" as const, label: "Book appointments", desc: "Agent can schedule new appointments" },
              { key: "reschedulePermission" as const, label: "Reschedule", desc: "Agent can reschedule existing appointments" },
              { key: "cancelPermission" as const, label: "Cancel bookings", desc: "Agent can cancel existing bookings" },
              { key: "offerFreeEstimation" as const, label: "Offer free estimates", desc: "Agent can promise a free quote" },
              { key: "priceRestriction" as const, label: "Block price negotiation", desc: "Agent will not discuss price discounts" },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 p-3 border border-neutral-200 rounded-lg cursor-pointer hover:bg-neutral-50 transition-colors">
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
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 mb-2">Review your assistant before creating.</p>
            {[
              { label: "Name", value: form.name },
              { label: "Company", value: form.companyName },
              { label: "Industry", value: form.industry || "Not specified" },
              { label: "Language", value: form.language },
              { label: "Voice", value: form.voice.split(".").pop() || form.voice },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-neutral-50">
                <span className="text-xs text-neutral-400 font-medium uppercase tracking-wide">{label}</span>
                <span className="text-sm text-neutral-700">{value}</span>
              </div>
            ))}
            {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-4">
        {step > 0 ? (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-700 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        ) : <div />}

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 && (!form.name || !form.companyName)}
            className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Creating..." : "Create Assistant"}
          </button>
        )}
      </div>
    </div>
  );
}
