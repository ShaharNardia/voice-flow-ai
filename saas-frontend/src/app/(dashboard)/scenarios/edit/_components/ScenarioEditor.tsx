"use client";

import React, { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Save, Loader2, Play, AlertTriangle, Info, PhoneCall } from "lucide-react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  scenariosGet,
  scenariosUpdate,
  type ScenarioNode,
} from "@/lib/firebase-functions";
import { NODE_TYPES_CONFIG } from "../_lib/node-config";
import { serializeEdges, cleanOrphanedEdges } from "../_lib/edge-utils";
import { validateScenario, validateNode, validateGraph, type ScenarioValidation, type NodeValidationState } from "../_lib/validation";
import NodePalette from "./NodePalette";
import PropertiesPanel from "./PropertiesPanel";
import LiveTestPanel from "./LiveTestPanel";
import FlowNode from "./nodes/FlowNode";
import ConditionNode from "./nodes/ConditionNode";
import DeletableEdge from "./edges/DeletableEdge";
import TestCallModal from "./TestCallModal";
import ScenarioPhoneSimulator from "./shared/ScenarioPhoneSimulator";
import { EdgeDeleteContext } from "../_lib/editor-context";

// Dynamic ReactFlow (SSR disabled for static export)
const ReactFlow = dynamic(() => import("reactflow").then((m) => m.default), {
  ssr: false,
});
const Background = dynamic(
  () => import("reactflow").then((m) => m.Background),
  { ssr: false }
);
const Controls = dynamic(() => import("reactflow").then((m) => m.Controls), {
  ssr: false,
});
const MiniMap = dynamic(() => import("reactflow").then((m) => m.MiniMap), {
  ssr: false,
});

// Register custom node types
const RF_NODE_TYPES: Record<string, React.ComponentType<any>> = {
  condition: ConditionNode,
};
// All other types use FlowNode
for (const key of Object.keys(NODE_TYPES_CONFIG)) {
  if (!RF_NODE_TYPES[key]) RF_NODE_TYPES[key] = FlowNode;
}

const RF_EDGE_TYPES = { default: DeletableEdge };

const defaultEdgeOptions = {
  type: "default",
  style: { stroke: "#94A3B8", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8", width: 14, height: 14 },
};

/**
 * Normalize legacy scenario data for backward compatibility
 */
function normalizeNodes(nodes: ScenarioNode[]): Node<Record<string, unknown>>[] {
  return nodes.map((n) => {
    const cfg = NODE_TYPES_CONFIG[n.type];
    const data = { ...n.data } as Record<string, unknown>;

    // Bake display fields into data
    data.label = cfg?.label || n.type;
    data.color = cfg?.color || "#999";

    // Normalize condition nodes
    if (n.type === "condition") {
      if (!data.conditionType) {
        // Legacy: had variable/operator/value but no conditionType
        data.conditionType = data.variable ? "variable" : "keywords";
      }
      if (data.conditionType === "keywords" && !Array.isArray(data.branches)) {
        data.branches = [{ id: "match", name: "Match", keywords: [] }];
      }
    }

    // Normalize gather
    if (n.type === "gather" && !data.saveResponseTo) {
      data.saveResponseTo = "userInput";
    }

    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data,
    } as Node<Record<string, unknown>>;
  });
}

/**
 * Normalize edges — restore condition from sourceHandle if missing
 */
function normalizeEdges(edges: any[]): Edge[] {
  return edges.map((e) => ({
    id: e.id || `e-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    animated: e.animated ?? true,
    label: e.condition && e.condition !== "default" ? e.condition : "",
    data: { condition: e.condition || e.sourceHandle || null },
  }));
}

export default function ScenarioEditor() {
  const params = useSearchParams();
  const id = params.get("id") || "";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState<Record<string, unknown>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node<Record<string, unknown>> | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [showTestCall, setShowTestCall] = useState(false);
  const [showPhoneSim, setShowPhoneSim] = useState(false);
  const [validation, setValidation] = useState<ScenarioValidation | null>(null);
  const nodeIdCounter = useRef(Date.now());

  // Load scenario
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    scenariosGet(id)
      .then((data) => {
        setName(data.name || "");
        setDescription(data.description || "");
        setNodes(normalizeNodes(data.nodes || []));
        setEdges(normalizeEdges(data.edges || []));
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load scenario")
      )
      .finally(() => setLoading(false));
  }, [id, setNodes, setEdges]);

  // Delete node by id (used by toolbar)
  const deleteNodeById = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNode?.id === nodeId) setSelectedNode(null);
    },
    [setNodes, setEdges, selectedNode]
  );

  // Duplicate node (used by toolbar)
  const duplicateNode = useCallback(
    (nodeId: string) => {
      const original = nodes.find((n) => n.id === nodeId);
      if (!original || original.type === "start") return;
      const newId = `${original.type}-${++nodeIdCounter.current}`;
      const { _errors, _warnings, _disconnected, _inLoop, _onDelete, _onDuplicate, label, color, ...cleanData } = original.data as Record<string, unknown>;
      const cfg = NODE_TYPES_CONFIG[original.type || "say"];
      setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type: original.type,
          position: { x: original.position.x + 30, y: original.position.y + 80 },
          data: { ...cleanData, label: cfg?.label || original.type, color: cfg?.color || "#999" },
        },
      ]);
    },
    [nodes, setNodes]
  );

  // Run validation on every change
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = validateScenario(name, nodes, edges);
      setValidation(result);
      // Inject validation state into node data for visual indicators
      setNodes((nds) =>
        nds.map((n) => {
          const nodeState = result.nodeStates.get(n.id);
          const errors = nodeState?.errors || [];
          const warnings = nodeState?.warnings || [];
          return {
            ...n,
            data: {
              ...n.data,
              _errors: errors,
              _warnings: warnings,
              _disconnected: result.disconnectedNodeIds.has(n.id),
              _inLoop: result.loopNodeIds.has(n.id),
              _onDelete: () => deleteNodeById(n.id),
              _onDuplicate: () => duplicateNode(n.id),
            },
          };
        })
      );
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [nodes, edges, name, setNodes, deleteNodeById, duplicateNode]);

  // Add node from palette
  const addNode = useCallback(
    (type: string) => {
      const cfg = NODE_TYPES_CONFIG[type];
      if (!cfg) return;
      // Prevent duplicate Start nodes
      if (type === "start" && nodes.some((n) => n.type === "start")) return;

      const newId = `${type}-${++nodeIdCounter.current}`;

      // Position near selected node if one exists, else random
      let posX = 150 + Math.random() * 250;
      let posY = 150 + Math.random() * 200;
      if (selectedNode) {
        posX = selectedNode.position.x;
        posY = selectedNode.position.y + 120;
      }

      const newNode: Node<Record<string, unknown>> = {
        id: newId,
        type,
        position: { x: posX, y: posY },
        data: { ...cfg.defaultData, label: cfg.label, color: cfg.color },
      };
      setNodes((nds) => [...nds, newNode]);

      // Auto-connect from selected node if it has no outgoing edge on default handle
      if (selectedNode && selectedNode.type !== "end" && selectedNode.type !== "transfer") {
        const hasDefaultEdge = edges.some(
          (e) => e.source === selectedNode.id && (!e.sourceHandle || e.sourceHandle === "default")
        );
        if (!hasDefaultEdge) {
          setEdges((eds) =>
            addEdge(
              {
                source: selectedNode.id,
                target: newId,
                sourceHandle: "default",
                targetHandle: null,
                animated: true,
              },
              eds
            )
          );
        }
      }

      // Select the new node
      setSelectedNode(newNode);
    },
    [setNodes, setEdges, selectedNode, nodes, edges]
  );

  // Connect nodes — KEY FIX: set condition from sourceHandle
  const onConnect = useCallback(
    (params: Connection) => {
      const handle = params.sourceHandle;
      const condition =
        handle && handle !== "default" ? handle : undefined;

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            label: condition || "",
            data: { condition: condition || null },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Select node
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<Record<string, unknown>>) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // Update node data from properties panel
  const updateNodeData = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNode) return;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNode.id
            ? { ...n, data: { ...n.data, [key]: value } }
            : n
        )
      );
      setSelectedNode((prev) =>
        prev ? { ...prev, data: { ...prev.data, [key]: value } } : null
      );

      // If condition branches changed, clean orphaned edges
      if (selectedNode.type === "condition" && key === "branches") {
        const branches = (value || []) as { id: string }[];
        const validIds = [...branches.map((b) => b.id), "default", "true", "false"];
        setEdges((eds) => cleanOrphanedEdges(eds, selectedNode.id, validIds));
      }
    },
    [selectedNode, setNodes, setEdges]
  );

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
      )
    );
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  // Delete edge by id
  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [setEdges]
  );

  // Save
  const handleSave = useCallback(async (): Promise<boolean> => {
    // Run full validation
    const result = validateScenario(name, nodes, edges);
    setValidation(result);

    if (!result.canSave) {
      const errorCount = result.allIssues.filter((i) => i.severity === "error").length;
      setError(`Fix ${errorCount} error${errorCount > 1 ? "s" : ""} before saving`);
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const cleanNodes = nodes.map((n) => {
        const { label: _l, color: _c, _errors, _warnings, _disconnected, _inLoop, _onDelete, _onDuplicate, ...rest } = n.data as Record<string, unknown>;
        void _l; void _c; void _errors; void _warnings; void _disconnected; void _inLoop; void _onDelete; void _onDuplicate;
        return {
          id: n.id,
          type: n.type || "say",
          position: n.position,
          data: rest,
        };
      });
      const cleanEdges = serializeEdges(edges);
      await scenariosUpdate({
        id,
        name,
        description,
        nodes: cleanNodes,
        edges: cleanEdges,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, name, description, nodes, edges]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!id) {
    return (
      <div className="p-8 text-center">
        <p className="text-neutral-400 text-sm">No scenario ID provided.</p>
        <Link
          href="/scenarios"
          className="text-[#0066CC] text-sm hover:underline mt-2 inline-block"
        >
          &larr; Back to scenarios
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <Link
          href="/scenarios"
          className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Scenarios
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Scenario name"
            className="text-base font-semibold text-neutral-900 border-0 border-b border-transparent hover:border-neutral-300 focus:border-[#F22F46] focus:outline-none px-1 py-0.5 bg-transparent min-w-0 flex-shrink"
            style={{ width: Math.max(180, name.length * 9 + 20) }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="text-sm text-neutral-500 border-0 border-b border-transparent hover:border-neutral-300 focus:border-neutral-400 focus:outline-none px-1 py-0.5 bg-transparent flex-1 min-w-0"
          />
        </div>
        <button
          onClick={() => setShowTest((v) => !v)}
          title="Text-based flow test"
          className={`flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            showTest
              ? "bg-green-600 text-white"
              : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
          }`}
        >
          <Play className="w-4 h-4" />
          {showTest ? "Close" : "Text Test"}
        </button>
        <button
          onClick={() => setShowPhoneSim(true)}
          title="Phone simulator — realistic call test with voice"
          className="flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-green-500 hover:bg-green-600 text-white"
        >
          <Play className="w-4 h-4" />
          Test Call
        </button>
        <button
          onClick={() => setShowTestCall(true)}
          className="flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-[#0D1117] hover:bg-[#161B22] text-white"
        >
          <PhoneCall className="w-4 h-4" />
          Test Call
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex-shrink-0 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            saved
              ? "bg-green-500 text-white"
              : validation && !validation.canSave
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-[#F22F46] hover:bg-[#d9243b] text-white"
          } disabled:opacity-60`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : validation && !validation.canSave ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? "Saved!" : saving ? "Saving..." : validation && !validation.canSave
            ? `Fix ${validation.allIssues.filter(i => i.severity === "error").length} errors`
            : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* Validation warnings banner */}
      {validation && validation.allIssues.length > 0 && (
        <div className="mb-2 flex-shrink-0">
          {validation.allIssues.filter(i => i.severity === "error").length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-1">
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium mb-1">
                <AlertTriangle className="w-4 h-4" />
                {validation.allIssues.filter(i => i.severity === "error").length} error(s) must be fixed before saving
              </div>
              <ul className="space-y-0.5">
                {validation.allIssues.filter(i => i.severity === "error").map((issue, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-red-500 cursor-pointer hover:text-red-700 flex items-center gap-1"
                    onClick={() => {
                      if (issue.nodeId) {
                        const node = nodes.find(n => n.id === issue.nodeId);
                        if (node) setSelectedNode(node as Node<Record<string, unknown>>);
                      }
                    }}
                  >
                    <span>•</span>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {validation.allIssues.filter(i => i.severity === "warning").length > 0 && !validation.allIssues.some(i => i.severity === "error") && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-600">
                {validation.allIssues.filter(i => i.severity === "warning").length} warning(s) — scenario will save but may have issues at runtime
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3-column editor */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Left: Node Palette */}
        <NodePalette
          onAddNode={addNode}
          hasStart={nodes.some((n) => n.type === "start")}
        />

        {/* Center: Canvas */}
        <div className="flex-1 bg-white border border-neutral-200 rounded-xl overflow-hidden relative">
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="text-center pointer-events-auto">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-sm font-medium text-neutral-600 mb-1">Start building your scenario</p>
                <p className="text-xs text-neutral-400 mb-4">Click &quot;Start&quot; in the palette to begin</p>
                <button
                  onClick={() => addNode("start")}
                  className="px-4 py-2 bg-[#4CAF50] text-white text-sm font-medium rounded-lg hover:bg-[#43A047] transition-colors"
                >
                  ▶ Add Start Node
                </button>
              </div>
            </div>
          )}
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
              </div>
            }
          >
            <EdgeDeleteContext.Provider value={deleteEdge}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={RF_NODE_TYPES}
                edgeTypes={RF_EDGE_TYPES}
                defaultEdgeOptions={defaultEdgeOptions}
                fitView
                deleteKeyCode="Delete"
                snapToGrid
                snapGrid={[15, 15]}
              >
                <Background gap={15} size={1} color="#e5e7eb" />
                <Controls />
                <MiniMap
                  nodeStrokeColor="#999"
                  nodeColor={(n) => {
                    const cfg = NODE_TYPES_CONFIG[n.type || ""];
                    return cfg?.color || "#ddd";
                  }}
                  maskColor="rgba(0,0,0,0.08)"
                />
              </ReactFlow>
            </EdgeDeleteContext.Provider>
          </Suspense>
        </div>

        {/* Right: Properties or Test panel */}
        {showTest ? (
          <LiveTestPanel
            nodes={nodes}
            edges={edges}
            onClose={() => setShowTest(false)}
          />
        ) : selectedNode ? (
          <div className="w-72 flex-shrink-0 bg-white border border-neutral-200 rounded-xl p-4 overflow-y-auto">
            <PropertiesPanel
              node={selectedNode}
              onUpdate={updateNodeData}
              onDelete={deleteSelectedNode}
              errors={validation?.nodeStates.get(selectedNode.id)?.errors}
              warnings={validation?.nodeStates.get(selectedNode.id)?.warnings}
            />
          </div>
        ) : (
          <div className="w-72 flex-shrink-0 bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-center">
            <p className="text-sm text-neutral-400 text-center">
              Click a node to edit its properties
            </p>
          </div>
        )}
      </div>

      {showTestCall && (
        <TestCallModal
          scenarioId={id}
          onSave={handleSave}
          onClose={() => setShowTestCall(false)}
        />
      )}

      {showPhoneSim && (
        <ScenarioPhoneSimulator
          scenarioId={id}
          nodes={nodes as any}
          edges={edges as any}
          onClose={() => setShowPhoneSim(false)}
        />
      )}
    </div>
  );
}
