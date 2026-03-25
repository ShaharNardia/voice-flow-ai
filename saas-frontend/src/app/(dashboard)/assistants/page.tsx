"use client";

import { useEffect, useState } from "react";
import { assistantsList, assistantsDelete, type Assistant } from "@/lib/firebase-functions";
import Link from "next/link";
import { Bot, Plus, Pencil, Trash2, Phone, Globe } from "lucide-react";

function AssistantCard({ assistant, onDelete }: { assistant: Assistant; onDelete: (id: string) => void }) {
  const langBadge: Record<string, string> = {
    "en-US": "EN",
    "en": "EN",
    "he-IL": "HE",
    "he": "HE",
    "ar": "AR",
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#F22F46]/10 rounded-lg flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-[#F22F46]" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800 text-sm">{assistant.name || assistant.assistantName}</h3>
            <p className="text-neutral-400 text-xs">{assistant.companyName || "—"}</p>
          </div>
        </div>
        <span className="text-xs font-medium bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">
          {langBadge[assistant.language] || assistant.language}
        </span>
      </div>

      {assistant.phoneNumber && (
        <div className="flex items-center gap-1.5 text-neutral-400 text-xs mb-3">
          <Phone className="w-3 h-3" />
          {assistant.phoneNumber}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-neutral-100">
        <Link
          href={`/assistants/edit?id=${assistant.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-800 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </Link>
        <button
          onClick={() => onDelete(assistant.id)}
          className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AssistantsPage() {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssistants = async () => {
    try {
      const result = await assistantsList();
      setAssistants(Array.isArray(result) ? result : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load assistants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssistants(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this assistant?")) return;
    try {
      await assistantsDelete({ id });
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Assistants</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage your AI phone agents</p>
        </div>
        <Link
          href="/assistants/new"
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Assistant
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-neutral-100 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3 bg-neutral-100 rounded w-24" />
                  <div className="h-2.5 bg-neutral-100 rounded w-16" />
                </div>
              </div>
              <div className="h-8 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : assistants.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Bot className="w-6 h-6 text-neutral-400" />
          </div>
          <h3 className="font-semibold text-neutral-700 mb-1">No assistants yet</h3>
          <p className="text-neutral-400 text-sm mb-4">Create your first AI phone agent to start taking calls.</p>
          <Link
            href="/assistants/new"
            className="inline-flex items-center gap-2 bg-[#F22F46] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#d9243b] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create assistant
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {assistants.map((a) => (
            <AssistantCard key={a.id} assistant={a} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
