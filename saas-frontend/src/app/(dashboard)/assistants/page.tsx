"use client";

import { useEffect, useState } from "react";
import { assistantsList, assistantsDelete, assistantsDuplicate, elAlSeedAssistant, type Assistant } from "@/lib/firebase-functions";
import { useUsersMap, type UserInfo } from "@/hooks/useUsersMap";
import OwnerBadge from "@/components/OwnerBadge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Pencil, Trash2, Phone, Copy, Sparkles,
  LayoutTemplate, X, Plane, CheckCircle2, Loader2,
  Globe, Wrench, BookOpen, Shield, Mic2, Languages,
} from "lucide-react";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatures } from "@/lib/features";

// ── Assistant Card ────────────────────────────────────────────────────────────

function AssistantCard({
  assistant, onDelete, onDuplicate, isSuperAdmin, usersMap,
}: {
  assistant: Assistant;
  onDelete: (id: string) => void;
  onDuplicate: (id: string, name: string) => void;
  isSuperAdmin: boolean;
  usersMap: Map<string, UserInfo>;
}) {
  const langBadge: Record<string, string> = {
    "en-US": "EN", "en": "EN", "he-IL": "HE", "he": "HE", "ar": "AR",
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 hover:border-neutral-300 hover:shadow-sm transition-all">
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

      {(assistant.assignedPhoneNumbers && assistant.assignedPhoneNumbers.length > 0) || assistant.phoneNumber ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-3">
          <Phone className="w-3 h-3 text-green-500" />
          {(assistant.assignedPhoneNumbers || [assistant.phoneNumber]).filter(Boolean).map((p, i) => (
            <span key={i} className="text-neutral-500 font-mono bg-neutral-50 px-1.5 py-0.5 rounded">{p}</span>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-amber-500 mb-3">
          <Phone className="w-3 h-3" />
          No phone assigned
        </div>
      )}

      {isSuperAdmin && (
        <div className="mb-3">
          <OwnerBadge ownerId={assistant.metadata?.ownerId} usersMap={usersMap} />
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
          onClick={() => onDuplicate(assistant.id, assistant.name || assistant.assistantName || "")}
          className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
          title="Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
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

// ── Templates Modal ───────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  company: string;
  language: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
  gradient: string;
  capabilities: { icon: React.ReactNode; label: string }[];
  seed: () => Promise<{ assistantId: string }>;
}

function TemplatesModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [seeding, setSeeding] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const TEMPLATES: Template[] = [
    {
      id: "elal",
      name: "נציג שירות לקוחות – אל על",
      company: "אל על נתיבי אויר לישראל",
      language: "he-IL",
      description:
        "Hebrew-first AI agent for El Al Airlines. Answers real-time flight status, schedules, delays, and route queries via the AirLabs API. Showcases all platform capabilities.",
      tags: ["Aviation", "Hebrew", "Real-time API", "Demo"],
      icon: <Plane className="w-6 h-6 text-blue-600" />,
      gradient: "from-blue-50 to-sky-50 border-blue-200",
      capabilities: [
        { icon: <Globe className="w-3.5 h-3.5" />, label: "6 Live AirLabs API tools" },
        { icon: <BookOpen className="w-3.5 h-3.5" />, label: "Knowledge base pre-loaded" },
        { icon: <Wrench className="w-3.5 h-3.5" />, label: "save_lead + tag_call + send_link + callback" },
        { icon: <Shield className="w-3.5 h-3.5" />, label: "Compliance-ready" },
        { icon: <Mic2 className="w-3.5 h-3.5" />, label: "OpenAI Realtime (nova voice)" },
        { icon: <Languages className="w-3.5 h-3.5" />, label: "Hebrew + professional vibe" },
      ],
      seed: async () => {
        const result = await elAlSeedAssistant();
        return { assistantId: result.assistantId };
      },
    },
  ];

  const handleUse = async (template: Template) => {
    setSeeding(template.id);
    try {
      const { assistantId } = await template.seed();
      setDone(assistantId);
      setTimeout(() => {
        onCreated(assistantId);
      }, 1800);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create assistant from template");
      setSeeding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Assistant Templates</h2>
            <p className="text-sm text-neutral-500 mt-0.5">One-click setup with all capabilities pre-configured</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Templates */}
        <div className="p-6 space-y-4">
          {TEMPLATES.map((t) => (
            <div key={t.id} className={`border rounded-xl p-5 bg-gradient-to-br ${t.gradient}`}>
              {/* Title row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    {t.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-neutral-900 text-sm" dir="rtl">{t.name}</div>
                    <div className="text-xs text-neutral-500" dir="rtl">{t.company}</div>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium bg-white border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                  {t.language}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-neutral-600 mb-4 leading-relaxed">{t.description}</p>

              {/* Capabilities grid */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {t.capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-neutral-600 bg-white/70 rounded-lg px-3 py-2">
                    <span className="text-blue-500 shrink-0">{cap.icon}</span>
                    {cap.label}
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {t.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>

              {/* CTA */}
              {done ? (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Assistant created! Opening editor…
                </div>
              ) : (
                <button
                  onClick={() => handleUse(t)}
                  disabled={seeding !== null}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  {seeding === t.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating assistant…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Use this template
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <p className="text-xs text-neutral-400 text-center">
            More templates coming soon — Customer Support, Sales SDR, Appointment Booking, and more.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AssistantsPageInner() {
  const { usersMap, isSuperAdmin } = useUsersMap();
  const { has: hasFeature } = useFeatures();
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

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

  const handleDuplicate = async (id: string, name: string) => {
    try {
      const result = await assistantsDuplicate({ id });
      setAssistants((prev) => [
        { id: result.id, name: result.name, language: "", ...prev.find((a) => a.id === id) } as Assistant,
        ...prev,
      ]);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to duplicate");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this assistant?")) return;
    try {
      await assistantsDelete({ id });
      setAssistants((prev) => prev.filter((a) => a.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleTemplateCreated = (assistantId: string) => {
    setShowTemplates(false);
    router.push(`/assistants/edit?id=${assistantId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Assistants</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage your AI phone agents</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Templates button */}
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 bg-white border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 text-neutral-700 hover:text-blue-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <LayoutTemplate className="w-4 h-4" />
            Templates
          </button>

          {hasFeature("cap.assistantWizard") && (
            <Link
              href="/assistants/new/wizard"
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Wizard
            </Link>
          )}
          <Link
            href="/assistants/new"
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Assistant
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowTemplates(true)}
              className="inline-flex items-center gap-2 border border-blue-200 text-blue-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <LayoutTemplate className="w-4 h-4" />
              Start from template
            </button>
            <Link
              href="/assistants/new"
              className="inline-flex items-center gap-2 bg-[#F22F46] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#d9243b] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create from scratch
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {assistants.map((a) => (
            <AssistantCard
              key={a.id}
              assistant={a}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              isSuperAdmin={isSuperAdmin}
              usersMap={usersMap}
            />
          ))}
        </div>
      )}

      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onCreated={handleTemplateCreated}
        />
      )}
    </div>
  );
}

export default function AssistantsPage() {
  return <FeatureGate featureId="module.assistants"><AssistantsPageInner /></FeatureGate>;
}
