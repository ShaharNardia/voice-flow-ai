import type { Node, Edge } from "reactflow";
import type { Branch } from "./types";

// ── Types ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface NodeValidationState {
  errors: string[];      // field-level errors (block save)
  warnings: string[];    // non-blocking hints
}

export interface GraphValidation {
  issues: ValidationIssue[];
  disconnectedNodeIds: Set<string>;  // nodes not reachable from Start
  loopNodeIds: Set<string>;          // nodes in cycles without exit
  hasStart: boolean;
  multipleStarts: boolean;
  hasEndReachable: boolean;
}

export interface ScenarioValidation {
  nodeStates: Map<string, NodeValidationState>;
  graphIssues: ValidationIssue[];
  disconnectedNodeIds: Set<string>;
  loopNodeIds: Set<string>;
  canSave: boolean;
  allIssues: ValidationIssue[];
}

// ── Node-level validation ────────────────────────────────────────────────

export function validateNode(
  type: string,
  data: Record<string, unknown>
): NodeValidationState {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (type) {
    case "say":
      if (!data.text || String(data.text).trim() === "") {
        errors.push("Message text is required");
      }
      break;

    case "gather":
      if (!data.prompt || String(data.prompt).trim() === "") {
        errors.push("Prompt text is required");
      }
      if (!data.saveResponseTo || String(data.saveResponseTo).trim() === "") {
        warnings.push("No variable name set — response will be saved as 'userInput'");
      }
      break;

    case "condition": {
      const condType = data.conditionType as string;
      if (condType === "keywords" || !condType) {
        const branches = (data.branches || []) as Branch[];
        if (branches.length === 0) {
          errors.push("Add at least one branch");
        } else {
          const hasKeywords = branches.some((b) => b.keywords && b.keywords.length > 0);
          if (!hasKeywords) {
            errors.push("At least one branch must have keywords");
          }
          // Check for duplicate keywords across branches
          const allKeywords: string[] = [];
          for (const b of branches) {
            for (const kw of b.keywords || []) {
              const lower = kw.toLowerCase();
              if (allKeywords.includes(lower)) {
                warnings.push(`Duplicate keyword "${kw}" across branches`);
              }
              allKeywords.push(lower);
            }
          }
          // Check for empty branch names
          for (const b of branches) {
            if (!b.name || b.name.trim() === "") {
              errors.push("All branches must have a name");
              break;
            }
          }
        }
      } else if (condType === "variable") {
        if (!data.variable || String(data.variable).trim() === "") {
          errors.push("Variable name is required");
        }
        if (!data.value && data.value !== 0 && data.value !== "") {
          warnings.push("Comparison value is empty");
        }
      }
      break;
    }

    case "setVariable":
      if (!data.variableName || String(data.variableName).trim() === "") {
        errors.push("Variable name is required");
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(data.variableName))) {
        errors.push("Variable name must be a valid identifier (letters, numbers, underscores)");
      }
      break;

    case "apiCall":
      if (!data.url || String(data.url).trim() === "") {
        errors.push("URL is required");
      } else {
        const url = String(data.url).trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          errors.push("URL must start with http:// or https://");
        }
      }
      // Validate JSON body for POST/PUT/PATCH
      if (["POST", "PUT", "PATCH"].includes(String(data.method)) && data.body) {
        const body = String(data.body).trim();
        if (body) {
          try {
            JSON.parse(body);
          } catch {
            warnings.push("Request body is not valid JSON");
          }
        }
      }
      break;

    case "transfer":
      if (!data.destination || String(data.destination).trim() === "") {
        errors.push("Destination is required");
      }
      break;

    case "updateLead":
      if (!data.status || String(data.status).trim() === "") {
        warnings.push("No lead status set");
      }
      break;

    case "wait":
      if (Number(data.duration) <= 0) {
        warnings.push("Duration should be greater than 0");
      }
      break;

    case "scheduleCallback":
      if (Number(data.delay) <= 0) {
        warnings.push("Delay should be greater than 0");
      }
      if (!data.message || String(data.message).trim() === "") {
        warnings.push("Callback message is empty");
      }
      break;

    // start, end, record — always valid
  }

  return { errors, warnings };
}

// ── Graph topology validation ────────────────────────────────────────────

export function validateGraph(
  nodes: Node<Record<string, unknown>>[],
  edges: Edge[]
): GraphValidation {
  const issues: ValidationIssue[] = [];
  const disconnectedNodeIds = new Set<string>();
  const loopNodeIds = new Set<string>();

  // Find start nodes
  const startNodes = nodes.filter((n) => n.type === "start");
  const hasStart = startNodes.length >= 1;
  const multipleStarts = startNodes.length > 1;

  if (!hasStart && nodes.length > 0) {
    issues.push({
      message: "Scenario must have a Start node",
      severity: "error",
    });
  }

  if (multipleStarts) {
    issues.push({
      message: "Only one Start node is allowed",
      severity: "error",
    });
    // Mark extra starts
    for (let i = 1; i < startNodes.length; i++) {
      issues.push({
        nodeId: startNodes[i].id,
        nodeType: "start",
        nodeLabel: "Start",
        message: "Duplicate Start node — remove this one",
        severity: "error",
      });
    }
  }

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const targets = adj.get(e.source) || [];
    targets.push(e.target);
    adj.set(e.source, targets);
  }

  // BFS from Start to find reachable nodes
  const reachable = new Set<string>();
  if (hasStart) {
    const queue = [startNodes[0].id];
    reachable.add(startNodes[0].id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adj.get(current) || []) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  // Mark disconnected nodes (not reachable from Start)
  for (const n of nodes) {
    if (n.type === "start") continue; // Start itself is always "reachable"
    if (!reachable.has(n.id)) {
      disconnectedNodeIds.add(n.id);
      issues.push({
        nodeId: n.id,
        nodeType: n.type,
        nodeLabel: (n.data.label as string) || n.type || "Node",
        message: "Not connected — unreachable from Start",
        severity: "warning",
      });
    }
  }

  // Check if End node is reachable
  const endNodes = nodes.filter((n) => n.type === "end");
  const hasEndReachable = endNodes.some((n) => reachable.has(n.id));

  if (nodes.length > 1 && !hasEndReachable) {
    issues.push({
      message: "No End node reachable — call may never terminate",
      severity: "warning",
    });
  }

  // Detect cycles — DFS with coloring (WHITE=0, GRAY=1, BLACK=2)
  if (hasStart) {
    const color = new Map<string, number>();
    for (const n of nodes) color.set(n.id, 0);
    const cycleNodes = new Set<string>();

    const dfs = (nodeId: string, path: Set<string>): boolean => {
      color.set(nodeId, 1); // GRAY — in progress
      path.add(nodeId);

      for (const neighbor of adj.get(nodeId) || []) {
        if (color.get(neighbor) === 1) {
          // Back edge found — cycle!
          // Mark all nodes in current path from neighbor onwards
          Array.from(path).forEach((pid) => cycleNodes.add(pid));
          cycleNodes.add(neighbor);
          return true;
        }
        if (color.get(neighbor) === 0) {
          if (dfs(neighbor, new Set(path))) {
            // Don't propagate — just mark the cycle participants
          }
        }
      }

      color.set(nodeId, 2); // BLACK — done
      return false;
    };

    dfs(startNodes[0].id, new Set());

    // Only flag cycles that have no exit branch
    Array.from(cycleNodes).forEach((nodeId) => {
      const neighbors = adj.get(nodeId) || [];
      const hasExitPath = neighbors.some((n) => !cycleNodes.has(n));
      if (!hasExitPath && reachable.has(nodeId)) {
        loopNodeIds.add(nodeId);
      }
    });

    if (loopNodeIds.size > 0) {
      issues.push({
        message: `Potential infinite loop detected (${loopNodeIds.size} nodes)`,
        severity: "warning",
      });
    }
  }

  // Check for nodes with no outgoing edges (dead ends that aren't End/Transfer)
  for (const n of nodes) {
    if (n.type === "end" || n.type === "transfer") continue;
    if (!reachable.has(n.id)) continue; // Don't warn about disconnected nodes twice
    const outEdges = edges.filter((e) => e.source === n.id);
    if (outEdges.length === 0) {
      issues.push({
        nodeId: n.id,
        nodeType: n.type,
        nodeLabel: (n.data.label as string) || n.type || "Node",
        message: "No outgoing connection — flow will stop here",
        severity: "warning",
      });
    }
  }

  return {
    issues,
    disconnectedNodeIds,
    loopNodeIds,
    hasStart,
    multipleStarts,
    hasEndReachable,
  };
}

// ── Full scenario validation (pre-save) ──────────────────────────────────

export function validateScenario(
  name: string,
  nodes: Node<Record<string, unknown>>[],
  edges: Edge[]
): ScenarioValidation {
  const allIssues: ValidationIssue[] = [];
  const nodeStates = new Map<string, NodeValidationState>();

  // Name validation
  if (!name.trim()) {
    allIssues.push({ message: "Scenario name is required", severity: "error" });
  }

  // Empty scenario check
  if (nodes.length === 0) {
    allIssues.push({ message: "Scenario is empty — add at least a Start and End node", severity: "error" });
    return {
      nodeStates,
      graphIssues: allIssues,
      disconnectedNodeIds: new Set(),
      loopNodeIds: new Set(),
      canSave: false,
      allIssues,
    };
  }

  // Validate each node
  for (const node of nodes) {
    const state = validateNode(node.type || "say", node.data as Record<string, unknown>);
    nodeStates.set(node.id, state);

    for (const err of state.errors) {
      allIssues.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: (node.data.label as string) || node.type || "Node",
        field: undefined,
        message: `${(node.data.label as string) || node.type}: ${err}`,
        severity: "error",
      });
    }
    for (const warn of state.warnings) {
      allIssues.push({
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: (node.data.label as string) || node.type || "Node",
        message: `${(node.data.label as string) || node.type}: ${warn}`,
        severity: "warning",
      });
    }
  }

  // Graph validation
  const graph = validateGraph(nodes, edges);
  allIssues.push(...graph.issues);

  // Can save = no errors (warnings don't block)
  const hasErrors = allIssues.some((i) => i.severity === "error");

  return {
    nodeStates,
    graphIssues: graph.issues,
    disconnectedNodeIds: graph.disconnectedNodeIds,
    loopNodeIds: graph.loopNodeIds,
    canSave: !hasErrors,
    allIssues,
  };
}
