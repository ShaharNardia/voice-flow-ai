"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { assistantsGet, assistantsUpdate, knowledgeListFiles, knowledgeProcessFile, knowledgeDeleteFile, knowledgeProcessUrl, knowledgeSync, knowledgeProcessText, type Assistant, type KnowledgeFile } from "@/lib/firebase-functions";
import { storage, auth } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, Link2, Loader2, Play, RefreshCw, Save, Settings, Square, Trash2, Type, Upload, Volume2 } from "lucide-react";

const VOICES_BY_LANG: Record<string, { value: string; label: string }[]> = {
  "en-US": [
    { value: "Google.en-US-Neural2-F", label: "Google Neural2-F (Female)" },
    { value: "Google.en-US-Neural2-J", label: "Google Neural2-J (Male)" },
    { value: "Google.en-US-Neural2-C", label: "Google Neural2-C (Female)" },
    { value: "Google.en-US-Neural2-I", label: "Google Neural2-I (Male)" },
    { value: "Polly.Joanna", label: "Polly Joanna (Female)" },
    { value: "Polly.Matthew", label: "Polly Matthew (Male)" },
    { value: "Polly.Amy", label: "Polly Amy (Female, UK)" },
  ],
  "en-GB": [
    { value: "Google.en-GB-Neural2-A", label: "Google Neural2-A (Female)" },
    { value: "Google.en-GB-Neural2-B", label: "Google Neural2-B (Male)" },
    { value: "Polly.Amy", label: "Polly Amy (Female)" },
    { value: "Polly.Brian", label: "Polly Brian (Male)" },
  ],
  "en-AU": [
    { value: "Google.en-AU-Neural2-A", label: "Google Neural2-A (Female)" },
    { value: "Google.en-AU-Neural2-B", label: "Google Neural2-B (Male)" },
    { value: "Google.en-AU-Neural2-C", label: "Google Neural2-C (Female)" },
    { value: "Google.en-AU-Neural2-D", label: "Google Neural2-D (Male)" },
    { value: "Polly.Olivia", label: "Polly Olivia (Female, Neural)" },
    { value: "Polly.Russell", label: "Polly Russell (Male)" },
  ],
  "he-IL": [
    { value: "openai:nova", label: "OpenAI Nova (Female, Recommended)" },
    { value: "openai:alloy", label: "OpenAI Alloy (Neutral)" },
    { value: "openai:shimmer", label: "OpenAI Shimmer (Female)" },
    { value: "openai:echo", label: "OpenAI Echo (Male)" },
    { value: "openai:onyx", label: "OpenAI Onyx (Male, Deep)" },
    { value: "Google.he-IL-Chirp3-HD-Achird", label: "Google Chirp3 Achird (Male)" },
    { value: "Google.he-IL-Chirp3-HD-Kore", label: "Google Chirp3 Kore (Female)" },
    { value: "Google.he-IL-Wavenet-D", label: "Google Wavenet-D (Male)" },
    { value: "Google.he-IL-Wavenet-A", label: "Google Wavenet-A (Female)" },
    { value: "Google.he-IL-Wavenet-B", label: "Google Wavenet-B (Male)" },
    { value: "Google.he-IL-Wavenet-C", label: "Google Wavenet-C (Female)" },
  ],
  "ar": [
    { value: "Google.ar-XA-Wavenet-A", label: "Google Wavenet-A (Female)" },
    { value: "Google.ar-XA-Wavenet-B", label: "Google Wavenet-B (Male)" },
    { value: "Polly.Zeina", label: "Polly Zeina (Female)" },
  ],
};

interface AssistantExtended extends Assistant {
  systemPrompt?: string;
  feedbackCallEnabled?: boolean;
}

type Tab = "settings" | "knowledge";

function AssistantEdit() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const [assistant, setAssistant] = useState<AssistantExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("settings");

  // Knowledge Base state
  const [kbFiles, setKbFiles] = useState<KnowledgeFile[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadStatus, setKbUploadStatus] = useState("");
  const [kbError, setKbError] = useState("");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TTS preview state
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const playPreview = async (text?: string) => {
    if (previewPlaying && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    const sampleText = text || previewText || assistant?.firstMessage || "שלום! אני הבוט של החברה. איך אוכל לעזור לך היום?";
    const voice = assistant?.voice || "openai:nova";
    setPreviewPlaying(true);
    try {
      const CLOUD_RUN = "https://voiceflow-mediastream-900818829902.us-central1.run.app";
      const res = await fetch(`${CLOUD_RUN}/tts-preview?text=${encodeURIComponent(sampleText)}&voice=${encodeURIComponent(voice)}`);
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPreviewPlaying(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch { setPreviewPlaying(false); }
  };

  // URL knowledge source state
  const [urlInput, setUrlInput] = useState("");
  const [urlAdding, setUrlAdding] = useState(false);
  const [syncingUrl, setSyncingUrl] = useState<string | null>(null);

  // Text knowledge source state
  const [showTextForm, setShowTextForm] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textAdding, setTextAdding] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    assistantsGet(id)
      .then((res) => setAssistant(res as AssistantExtended))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [id]);

  // Load knowledge files when switching to KB tab
  useEffect(() => {
    if (tab === "knowledge" && id) {
      loadKbFiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  async function loadKbFiles() {
    setKbLoading(true);
    setKbError("");
    try {
      const files = await knowledgeListFiles(id);
      setKbFiles(files);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setKbLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setKbError("File too large — maximum 5 MB");
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) { setKbError("Not authenticated"); return; }

    setKbUploading(true);
    setKbError("");
    setKbUploadStatus("Uploading...");

    try {
      // 1. Upload to Firebase Storage
      const fileId = Date.now().toString(36);
      const storagePath = `users/${uid}/knowledge/${id}/${fileId}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      setKbUploadStatus("Processing & embedding...");

      // 2. Process via Cloud Function (extract text → chunk → embed → store)
      const result = await knowledgeProcessFile({ assistantId: id, storagePath, fileName: file.name });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks created`);

      // 3. Refresh list
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
    setDeletingFile(sourceFile);
    setKbError("");
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
    setUrlAdding(true);
    setKbError("");
    setKbUploadStatus("Fetching & embedding URL...");
    try {
      const result = await knowledgeProcessUrl({ assistantId: id, url });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks indexed`);
      setUrlInput("");
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to add URL");
      setKbUploadStatus("");
    } finally {
      setUrlAdding(false);
    }
  }

  async function handleAddText() {
    const text = textContent.trim();
    const title = textTitle.trim() || "Text snippet";
    if (!text || !id) return;
    setTextAdding(true);
    setKbError("");
    setKbUploadStatus("Processing text...");
    try {
      const result = await knowledgeProcessText({ assistantId: id, text, title });
      setKbUploadStatus(`Done — ${result.chunksCreated} chunks created`);
      setTextTitle("");
      setTextContent("");
      setShowTextForm(false);
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Failed to add text");
      setKbUploadStatus("");
    } finally {
      setTextAdding(false);
    }
  }

  async function handleSyncUrl(url: string) {
    if (!id) return;
    setSyncingUrl(url);
    setKbError("");
    try {
      const result = await knowledgeSync({ assistantId: id, url });
      setKbUploadStatus(`Synced — ${result.chunksCreated} chunks updated`);
      await loadKbFiles();
      setTimeout(() => setKbUploadStatus(""), 4000);
    } catch (e: unknown) {
      setKbError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingUrl(null);
    }
  }

  const handleSave = async () => {
    if (!assistant) return;
    setSaving(true);
    setError("");
    try {
      await assistantsUpdate({ ...assistant, id });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: string | boolean) =>
    setAssistant((prev) => prev ? { ...prev, [key]: value } : null);

  const currentLang = assistant?.language || "en-US";
  const voiceOptions = VOICES_BY_LANG[currentLang] || VOICES_BY_LANG["en-US"];

  if (loading) return <div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>;
  if (!assistant) return (
    <div className="p-8 text-center">
      <p className="text-neutral-400 text-sm">{error || "Assistant not found."}</p>
      <Link href="/assistants" className="text-[#0066CC] text-sm hover:underline mt-2 inline-block">← Back to assistants</Link>
    </div>
  );

  return (
    <div className="max-w-lg">
      <Link href="/assistants" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Assistants
      </Link>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{assistant.name || assistant.assistantName}</h2>
        {tab === "settings" && (
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              saved ? "bg-green-500 text-white" : "bg-[#F22F46] hover:bg-[#d9243b] text-white"
            }`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-neutral-100 rounded-lg p-1">
        <button
          onClick={() => setTab("settings")}
          className={`flex items-center gap-1.5 flex-1 justify-center py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
            tab === "settings" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
        <button
          onClick={() => setTab("knowledge")}
          className={`flex items-center gap-1.5 flex-1 justify-center py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
            tab === "knowledge" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Knowledge Base
          {kbFiles.length > 0 && (
            <span className="ml-1 bg-[#F22F46] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {kbFiles.length}
            </span>
          )}
        </button>
      </div>

      {/* Settings Tab */}
      {tab === "settings" && (
        <>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">

            {/* Identity */}
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

            {/* Language + Voice */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Language</label>
                <select
                  value={currentLang}
                  onChange={(e) => {
                    const lang = e.target.value;
                    const defaultVoice = (VOICES_BY_LANG[lang] || VOICES_BY_LANG["en-US"])[0].value;
                    setAssistant((prev) => prev ? { ...prev, language: lang, voice: defaultVoice } : null);
                  }}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="en-AU">English (Australian)</option>
                  <option value="he-IL">Hebrew</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Voice</label>
                <select
                  value={assistant.voice || voiceOptions[0].value}
                  onChange={(e) => set("voice", e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                >
                  {voiceOptions.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voice Preview */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-[#F22F46]" />
                <span className="text-xs font-medium text-neutral-600 uppercase tracking-wide">Voice Preview</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder={assistant.firstMessage || "שלום! אני הבוט של החברה. איך אוכל לעזור לך היום?"}
                  className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46]"
                />
                <button
                  onClick={() => playPreview()}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    previewPlaying
                      ? "bg-neutral-800 text-white"
                      : "bg-[#F22F46] text-white hover:bg-[#d41e35]"
                  }`}
                >
                  {previewPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {previewPlaying ? "Stop" : "Play"}
                </button>
              </div>
              <p className="text-xs text-neutral-400">Type custom text or leave empty to preview the opening greeting</p>
            </div>

            {/* Opening Greeting */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Opening Greeting</label>
              <p className="text-xs text-neutral-400 mb-1.5">First thing the bot says when the call connects. Use {"{{leadName}}"}, {"{{companyName}}"} as placeholders.</p>
              <textarea value={assistant.firstMessage || ""} onChange={(e) => set("firstMessage", e.target.value)} rows={2}
                placeholder='e.g. "Hi {{leadName}}, this is Alex from {{companyName}}. How can I help you today?"'
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none" />
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Custom Instructions (System Prompt)</label>
              <p className="text-xs text-neutral-400 mb-1.5">Tell the bot what it does, its personality, goals, and any constraints. The more detail, the better.</p>
              <textarea
                value={(assistant as AssistantExtended).systemPrompt || ""}
                onChange={(e) => set("systemPrompt", e.target.value)}
                rows={6}
                placeholder={currentLang.startsWith("he")
                  ? "לדוגמה: אתה נציג שירות לקוחות של חברה. המטרה שלך היא לתאם פגישות. תמיד שאל קודם מה שם הלקוח. אחרי שאספת פרטים, אשר בקצרה וסיים בנימוס."
                  : "e.g. You are a sales agent for a roofing company. Your goal is to schedule a free inspection. First ask what problem they're having. Then offer a time this week. Keep replies short — 1-2 sentences max. If they're not interested, thank them politely and hang up."
                }
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] resize-none font-mono text-xs"
              />
            </div>

            {/* Post-call Feedback */}
            <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-800">Post-call Feedback</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    After each completed call, automatically place a short follow-up call to collect a 1–5 quality rating and improvement suggestion.
                  </p>
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

          </div>
        </>
      )}

      {/* Knowledge Base Tab */}
      {tab === "knowledge" && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">Knowledge Sources</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Files and URLs are embedded and used to answer questions during calls.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={kbUploading}
              className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              {kbUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* URL input row */}
          <div className="flex gap-2 mb-3">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              placeholder="https://example.com/page"
              disabled={urlAdding}
              className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:opacity-60"
            />
            <button
              onClick={handleAddUrl}
              disabled={urlAdding || !urlInput.trim()}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              {urlAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Add URL
            </button>
          </div>

          {/* Add Text button / form */}
          {!showTextForm ? (
            <button
              onClick={() => setShowTextForm(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800 border border-neutral-200 hover:border-neutral-400 px-3 py-2 rounded-lg transition-colors mb-4"
            >
              <Type className="w-3.5 h-3.5" />
              Add Text
            </button>
          ) : (
            <div className="mb-4 border border-neutral-200 rounded-lg p-3 space-y-2">
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46]"
              />
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste or type your text here..."
                rows={5}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowTextForm(false); setTextTitle(""); setTextContent(""); }}
                  className="text-xs text-neutral-500 hover:text-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddText}
                  disabled={textAdding || !textContent.trim()}
                  className="flex items-center gap-1.5 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {textAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Type className="w-3.5 h-3.5" />}
                  Save Text
                </button>
              </div>
            </div>
          )}

          {/* Upload / processing status */}
          {kbUploadStatus && (
            <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-xs flex items-center gap-2">
              {(kbUploading || urlAdding || syncingUrl) && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
              {kbUploadStatus}
            </div>
          )}

          {/* Error */}
          {kbError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{kbError}</div>
          )}

          {/* Source list (files + URLs) */}
          {kbLoading ? (
            <div className="py-8 text-center text-neutral-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading sources...
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
                return (
                  <div key={file.sourceFile} className="flex items-center justify-between p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50 group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isUrl
                        ? <Link2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        : <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-700 truncate" title={file.sourceFile}>{label}</p>
                        <p className="text-xs text-neutral-400">{file.chunkCount} chunk{file.chunkCount !== 1 ? "s" : ""}{isUrl ? " · URL" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isUrl && (
                        <button
                          onClick={() => handleSyncUrl(file.sourceFile)}
                          disabled={syncingUrl === file.sourceFile}
                          className="p-1.5 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-60"
                          title="Re-sync URL"
                        >
                          {syncingUrl === file.sourceFile
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <RefreshCw className="w-4 h-4" />
                          }
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFile(file.sourceFile)}
                        disabled={deletingFile === file.sourceFile}
                        className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-60"
                        title={isUrl ? "Remove URL" : "Delete file"}
                      >
                        {deletingFile === file.sourceFile
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-neutral-300 mt-3 text-center">Files: TXT · MD · PDF · DOCX (max 5 MB) · URLs: any public webpage</p>
            </div>
          )}
        </div>
      )}
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
