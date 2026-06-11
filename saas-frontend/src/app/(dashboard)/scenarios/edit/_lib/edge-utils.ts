import type { Edge } from "reactflow";
import type { ScenarioEdge } from "@/lib/firebase-functions";

/**
 * Get the condition string from an edge.
 * Checks both sourceHandle and data.condition for compatibility.
 */
export function getEdgeCondition(edge: Edge): string | undefined {
  const handle = edge.sourceHandle;
  const dataCond = (edge.data as Record<string, unknown>)?.condition as string | undefined;
  const cond = handle || dataCond;
  if (!cond || cond === "default") return undefined;
  return cond;
}

/**
 * Remove orphaned edges when condition branches change.
 * Returns filtered edges — removes any edge from nodeId whose
 * sourceHandle doesn't match a valid handle ID.
 */
export function cleanOrphanedEdges(
  edges: Edge[],
  nodeId: string,
  validHandleIds: string[]
): Edge[] {
  return edges.filter((e) => {
    if (e.source !== nodeId) return true;
    if (!e.sourceHandle || e.sourceHandle === "default") return true;
    return validHandleIds.includes(e.sourceHandle);
  });
}

/**
 * Prepare edges for save — include condition field matching sourceHandle
 */
export function serializeEdges(edges: Edge[]): ScenarioEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    animated: e.animated ?? true,
    condition: getEdgeCondition(e) || null,
  }));
}
