"use client";

/**
 * Admin: custom voice library management (#42).
 *
 * Cross-tenant view of every cloned voice. Lists, previews, and deletes.
 * Backed by the existing elevenlabs_voice_clone_service endpoints with
 * `?all=1` to bypass the per-tenant scope (super_admin only).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  elevenlabsAdminListVoices,
  elevenlabsDeleteVoice,
  elevenlabsPreviewVoice,
  type CustomVoice,
} from "@/lib/firebase-functions";
import { ArrowLeft, Mic2, Play, Pause, Trash2, RefreshCw, Loader2, Search } from "lucide-react";

export default function AdminVoicesPage() {
  const [voices, setVoices] = useState<CustomVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const v = await elevenlabsAdminListVoices();
      setVoices(Array.isArray(v) ? v : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const onPreview = async (v: CustomVoice) => {
    if (previewing === v.voiceId) {
      audioRef.current?.pause();
      setPreviewing(null);
      return;
    }
    setPreviewing(v.voiceId);
    try {
      const sample = "Hello, this is a preview of the cloned voice. אם אתה שומע עברית, גם זה עובד.";
      const r = await elevenlabsPreviewVoice({ voiceId: v.voiceId, text: sample });
      const audio = new Audio(`data:${r.mimeType};base64,${r.audioBase64}`);
      audioRef.current?.pause();
      audioRef.current = audio;
      audio.onended = () => setPreviewing((p) => (p === v.voiceId ? null : p));
      audio.onerror = () => setPreviewing((p) => (p === v.voiceId ? null : p));
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreviewing(null);
    }
  };

  const onDelete = async (v: CustomVoice) => {
    if (!confirm(`Delete voice "${v.name}"? This removes it from ElevenLabs, Firestore, and the consent recording from GCS. Cannot be undone.`)) return;
    setDeleting(v.voiceId);
    setError("");
    try {
      const r = await elevenlabsDeleteVoice({ voiceId: v.voiceId });
      if (!r.results.elevenlabs && !r.results.firestore) {
        setError(`Delete reported failure for ${v.name}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const filtered = voices.filter((v) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return v.name.toLowerCase().includes(q)
      || v.voiceId.toLowerCase().includes(q)
      || v.companyId.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
              <Mic2 className="w-5 h-5 text-[#F22F46]" />
              Custom Voice Library
            </h1>
            <p className="text-sm text-neutral-500">
              Every cloned voice across all tenants. Preview, audit, or revoke.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, voice ID, or company ID…"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#F22F46]"
          />
          <span className="text-xs text-neutral-500">
            {filtered.length} / {voices.length} voices
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading && voices.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-500 text-sm">
          {voices.length === 0 ? "No cloned voices yet." : "No voices match this filter."}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Voice ID</th>
                <th className="text-left px-4 py-3 font-medium">Assistants</th>
                <th className="text-left px-4 py-3 font-medium">Consent</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.voiceId} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">{v.name}</td>
                  <td className="px-4 py-3 text-neutral-600 font-mono text-xs">{v.companyId.slice(0, 12)}…</td>
                  <td className="px-4 py-3 text-neutral-600 font-mono text-xs">{v.voiceId.slice(0, 12)}…</td>
                  <td className="px-4 py-3 text-neutral-600">{v.assistantIds.length}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {v.consentDate ? new Date(v.consentDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onPreview(v)}
                        title="Preview voice"
                        className="p-1.5 rounded-lg text-neutral-500 hover:bg-violet-100 hover:text-violet-700"
                      >
                        {previewing === v.voiceId
                          ? <Pause className="w-4 h-4" />
                          : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => onDelete(v)}
                        disabled={deleting === v.voiceId}
                        title="Delete voice (irreversible)"
                        className="p-1.5 rounded-lg text-neutral-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                      >
                        {deleting === v.voiceId
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
