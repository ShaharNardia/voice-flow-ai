"use client";

import { useEffect, useState, useCallback } from "react";
import { collection, query, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GitBranch, Plus, Pencil, Loader2, X, Trash2, Copy } from "lucide-react";
import { scenariosCreate, scenariosDelete, type ScenarioNode, type ScenarioEdge } from "@/lib/firebase-functions";

interface Scenario {
  id: string;
  name?: string;
  description?: string;
  nodes?: unknown[];
  edges?: unknown[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "scenarios"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Scenario)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) { setCreateError("Name is required"); return; }
    setCreating(true);
    setCreateError("");
    try {
      const result = await scenariosCreate({
        name: newName.trim(),
        description: newDesc.trim(),
        nodes: [{ id: "start-1", type: "start", position: { x: 250, y: 100 }, data: { trigger: "outbound", label: "Start", color: "#4CAF50" } }],
        edges: [],
      });
      router.push(`/scenarios/edit?id=${result.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create scenario");
      setCreating(false);
    }
  }, [newName, newDesc, router]);

  const closeModal = useCallback(() => {
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
    setCreateError("");
  }, []);

  const handleDelete = useCallback(async (s: Scenario) => {
    if (!confirm(`Delete "${s.name || "Untitled Scenario"}"? This cannot be undone.`)) return;
    try {
      await scenariosDelete(s.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }, []);

  const handleDuplicate = useCallback(async (s: Scenario) => {
    try {
      const result = await scenariosCreate({
        name: `${s.name || "Untitled"} (copy)`,
        description: s.description || "",
        nodes: (s.nodes as ScenarioNode[]) || [{ id: "start-1", type: "start", position: { x: 250, y: 100 }, data: { trigger: "outbound", label: "Start", color: "#4CAF50" } }],
        edges: (s.edges as ScenarioEdge[]) || [],
      });
      router.push(`/scenarios/edit?id=${result.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to duplicate");
    }
  }, [router]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Scenarios</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Visual call flow builder</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Scenario
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-neutral-900">New Scenario</h3>
              <button onClick={closeModal} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{createError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Name *</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. Inbound Sales Flow"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Description</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating ? "Creating..." : "Create Scenario"}
              </button>
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scenario List */}
      {loading ? (
        <div className="p-8 text-center text-neutral-400 text-sm">Loading...</div>
      ) : scenarios.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <GitBranch className="w-6 h-6 text-neutral-400" />
          </div>
          <h3 className="font-semibold text-neutral-700 mb-1">No scenarios yet</h3>
          <p className="text-neutral-400 text-sm mb-4">Create visual call flows without code.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create your first scenario
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {scenarios.map((s) => (
            <div key={s.id} className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-800 text-sm">{s.name || "Untitled Scenario"}</h3>
                  <p className="text-xs text-neutral-400">{s.nodes?.length || 0} nodes</p>
                </div>
              </div>
              {s.description && <p className="text-xs text-neutral-500 mb-3">{s.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-400">
                  {s.createdAt ? formatDate((s.createdAt as Timestamp).toDate()) : "—"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(s)}
                    title="Duplicate"
                    className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    title="Delete"
                    className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <Link href={`/scenarios/edit?id=${s.id}`} className="flex items-center gap-1 text-xs text-[#0066CC] hover:underline ml-1">
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
