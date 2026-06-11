"use client";

/**
 * ScenarioFlowReplay
 * Read-only React Flow diagram that overlays an execution trace onto the
 * scenario graph. Visited nodes are highlighted green; un-visited nodes
 * are faded. Traversed edges are animated in green.
 *
 * Used by the Call Detail page to show "scenario replay" like Voximplant Kit.
 */

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Handle, Position, type NodeProps, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { NODE_TYPES_CONFIG, getOutputHandles } from "../../_lib/node-config";
import { Loader2 } from "lucide-react";
import type { LogEntry } from "./ExecutionTrace";

// Dynamic imports — SSR disabled for static export
const ReactFlow  = dynamic(() => import("reactflow").then(m => m.default), { ssr: false });
const Background = dynamic(() => import("reactflow").then(m => m.Background), { ssr: false });
const Controls   = dynamic(() => import("reactflow").then(m => m.Controls),  { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

// ── ReplayNode — simple read-only card with visited state ─────────────────────

function ReplayNode({ data, type }: NodeProps) {
  const typeKey = type || "say";
  const cfg       = NODE_TYPES_CONFIG[typeKey];
  const baseColor = cfg?.color || "#999";
  const label     = (data.label as string) || cfg?.label || typeKey;
  const preview   = String(
    data.text || data.prompt || data.message || data.url || data.destination || ""
  ).slice(0, 35);

  const isVisited     = data._visited     as boolean;
  const isLastVisited = data._lastVisited as boolean;
  const stepNumber    = data._stepNumber  as number | undefined;

  const accentColor = isVisited ? baseColor : "#CBD5E1";
  const border = isLastVisited
    ? `2px solid #16A34A`
    : isVisited
    ? `2px solid #86EFAC`
    : `1px solid #E2E8F0`;
  const shadow = isLastVisited
    ? `0 0 0 4px rgba(22,163,74,0.18), 0 4px 12px rgba(0,0,0,0.1)`
    : isVisited
    ? `0 0 0 2px rgba(134,239,172,0.3)`
    : `0 1px 3px rgba(0,0,0,0.06)`;

  const outputHandles = getOutputHandles(typeKey, data as Record<string, unknown>);
  const isMultiOut    = outputHandles.length > 1 || (outputHandles.length === 1 && outputHandles[0].id !== "default");

  return (
    <div style={{ opacity: isVisited ? 1 : 0.28, position: "relative" }}>
      {/* Step number badge */}
      {stepNumber !== undefined && (
        <div style={{
          position: "absolute",
          top: -10, right: -10,
          background: isLastVisited ? "#16A34A" : "#4ADE80",
          color: "white",
          borderRadius: "50%",
          width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700,
          zIndex: 10,
          border: "2px solid white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        }}>
          {stepNumber}
        </div>
      )}

      {/* Card */}
      <div style={{
        width: 180,
        background: isVisited ? "white" : "#F8FAFC",
        borderRadius: 12,
        border, boxShadow: shadow,
        position: "relative",
        overflow: "hidden",
        cursor: "default",
      }}>
        {/* Left accent bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: 4, height: "100%",
          background: accentColor, borderRadius: "12px 0 0 12px",
        }} />

        {/* Input handle */}
        <Handle type="target" position={Position.Top}
          style={{ background: "white", border: `2px solid ${accentColor}`, width: 8, height: 8 }} />

        {/* Content */}
        <div style={{ padding: "10px 12px 10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: accentColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {cfg?.label?.[0] || "?"}
            </div>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: isVisited ? "#1E293B" : "#94A3B8",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {label}
            </span>
          </div>
          {preview && (
            <div style={{
              fontSize: 11, marginTop: 4,
              color: isVisited ? "#94A3B8" : "#CBD5E1",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 148,
            }}>
              {preview}
            </div>
          )}
        </div>

        {/* Output handles */}
        {outputHandles.map((handle, i) => {
          const count      = outputHandles.length;
          const leftPct    = count === 1 ? 50 : ((i + 1) * 100) / (count + 1);
          return (
            <React.Fragment key={handle.id}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={handle.id}
                style={{
                  left: `${leftPct}%`,
                  background: "white",
                  border: `2px solid ${accentColor}`,
                  width: 8, height: 8,
                }}
              />
              {isMultiOut && handle.label && (
                <div style={{
                  position: "absolute",
                  bottom: -18,
                  left: `${leftPct}%`,
                  transform: "translateX(-50%)",
                  fontSize: 9, fontWeight: 500,
                  color: isVisited ? "#64748B" : "#CBD5E1",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  background: "rgba(255,255,255,0.95)",
                  padding: "1px 4px", borderRadius: 3,
                }}>
                  {handle.label}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Register one ReplayNode renderer per node type
const RF_NODE_TYPES: Record<string, React.ComponentType<NodeProps>> = {};
for (const key of Object.keys(NODE_TYPES_CONFIG)) {
  RF_NODE_TYPES[key] = ReplayNode;
}

// ── ScenarioFlowReplay ────────────────────────────────────────────────────────

interface Props {
  scenarioId: string;
  executionLog: LogEntry[];
}

export default function ScenarioFlowReplay({ scenarioId, executionLog }: Props) {
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [rawNodes,     setRawNodes]     = useState<RawNode[]>([]);
  const [rawEdges,     setRawEdges]     = useState<RawEdge[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "scenarios", scenarioId));
        if (!snap.exists()) { setLoadError("Scenario not found"); return; }
        const d = snap.data();
        setScenarioName(d.name || "Scenario");
        setRawNodes((d.nodes  || []) as RawNode[]);
        setRawEdges((d.edges  || []) as RawEdge[]);
      } catch {
        setLoadError("Failed to load scenario");
      } finally {
        setLoading(false);
      }
    })();
  }, [scenarioId]);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!rawNodes.length) return { rfNodes: [], rfEdges: [] };

    const realNodeIds = new Set(rawNodes.map(n => n.id));

    // Build ordered list of first-visit for each real node
    const visitedOrder: string[] = [];
    const visitedSet   = new Set<string>();
    for (const entry of executionLog) {
      if (realNodeIds.has(entry.nodeId) && !visitedSet.has(entry.nodeId)) {
        visitedOrder.push(entry.nodeId);
        visitedSet.add(entry.nodeId);
      }
    }

    const stepMap       = new Map<string, number>();
    visitedOrder.forEach((id, i) => stepMap.set(id, i + 1));
    const lastVisitedId = visitedOrder[visitedOrder.length - 1];

    // Build RF nodes
    const rfNodes = rawNodes.map(n => {
      const cfg       = NODE_TYPES_CONFIG[n.type];
      const isVisited = visitedSet.has(n.id);
      return {
        id:       n.id,
        type:     n.type,
        position: n.position,
        draggable: false,
        selectable: false,
        connectable: false,
        data: {
          ...n.data,
          label:         (n.data.label as string) || cfg?.label || n.type,
          color:         cfg?.color || "#999",
          _visited:      isVisited,
          _lastVisited:  n.id === lastVisitedId,
          _stepNumber:   stepMap.get(n.id),
        },
      };
    });

    // Compute traversed edges from consecutive node pairs in the log
    const logPath = executionLog
      .filter(e => realNodeIds.has(e.nodeId))
      .map(e => e.nodeId);

    const visitedEdgeSet = new Set<string>();
    for (let i = 0; i < logPath.length - 1; i++) {
      if (logPath[i] === logPath[i + 1]) continue;
      const from = logPath[i], to = logPath[i + 1];
      for (const e of rawEdges) {
        if (e.source === from && e.target === to) {
          visitedEdgeSet.add(e.id);
          break;
        }
      }
    }

    // Build RF edges
    const rfEdges = rawEdges.map(e => {
      const traversed = visitedEdgeSet.has(e.id);
      return {
        id:           e.id,
        source:       e.source,
        target:       e.target,
        sourceHandle: e.sourceHandle,
        label:        e.label,
        type:         "default",
        animated:     traversed,
        style:        traversed
          ? { stroke: "#16A34A", strokeWidth: 2.5 }
          : { stroke: "#CBD5E1", strokeWidth: 1.5, opacity: 0.35 },
        markerEnd: {
          type:  MarkerType.ArrowClosed,
          color: traversed ? "#16A34A" : "#CBD5E1",
          width: 14, height: 14,
        },
      };
    });

    return { rfNodes, rfEdges };
  }, [rawNodes, rawEdges, executionLog]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-neutral-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading scenario flow…
      </div>
    );
  }

  if (loadError) {
    return <p className="text-red-500 text-sm text-center py-6">{loadError}</p>;
  }

  const totalSteps   = new Set(executionLog.map(e => e.nodeId)).size;
  const visitedCount = rfNodes.filter(n => n.data._visited).length;

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-600">{scenarioName}</span>
          <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
            {visitedCount} / {rfNodes.length} nodes visited
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#4ADE80", border: "2px solid #16A34A" }} />
            Visited
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-neutral-200" />
            Not reached
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ background: "#16A34A" }} />
            Path taken
          </span>
        </div>
      </div>

      {/* Flow diagram */}
      <div style={{ height: 420, borderRadius: 12, overflow: "hidden", background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={RF_NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          panOnScroll
          zoomOnScroll
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E2E8F0" gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Step timeline below the diagram */}
      {totalSteps > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {executionLog
            .filter((e, i, arr) => arr.findIndex(x => x.nodeId === e.nodeId) === i)
            .map((entry, i) => {
              const cfg = NODE_TYPES_CONFIG[entry.nodeType];
              return (
                <div key={i} className="flex items-center gap-1 bg-white border border-neutral-200 rounded-full px-2 py-1 text-[10px]">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[8px] flex-shrink-0"
                    style={{ background: cfg?.color || "#94A3B8" }}>
                    {i + 1}
                  </span>
                  <span className="text-neutral-600 font-medium">{entry.nodeLabel || entry.nodeType}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
