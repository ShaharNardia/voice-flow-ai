import type { HandleDef } from "./types";

export type NodeCategory = "flow" | "communication" | "logic" | "integration" | "crm";

export interface NodeTypeConfig {
  label: string;
  color: string;
  icon: string; // Lucide icon component name
  category: NodeCategory;
  defaultData: Record<string, unknown>;
  staticHandles?: HandleDef[];
  dynamicHandles?: boolean;
}

export const NODE_TYPES_CONFIG: Record<string, NodeTypeConfig> = {
  start: {
    label: "Start",
    color: "#4CAF50",
    icon: "Play",
    category: "flow",
    defaultData: { trigger: "outbound" },
  },
  say: {
    label: "Say",
    color: "#2196F3",
    icon: "MessageSquare",
    category: "communication",
    defaultData: { text: "", voice: "", language: "he-IL" },
  },
  gather: {
    label: "Gather Input",
    color: "#FF9800",
    icon: "Mic",
    category: "communication",
    defaultData: { inputType: "speech", prompt: "", timeout: 5, saveResponseTo: "userInput" },
    staticHandles: [
      { id: "success", label: "Success" },
      { id: "timeout", label: "Timeout" },
    ],
  },
  condition: {
    label: "Condition",
    color: "#9C27B0",
    icon: "GitBranch",
    category: "logic",
    defaultData: { conditionType: "keywords", branches: [{ id: "match", name: "Match", keywords: [] }] },
    dynamicHandles: true,
  },
  setVariable: {
    label: "Set Variable",
    color: "#607D8B",
    icon: "Variable",
    category: "logic",
    defaultData: { variableName: "", value: "", valueType: "string" },
  },
  apiCall: {
    label: "API Call",
    color: "#00BCD4",
    icon: "Globe",
    category: "integration",
    defaultData: { url: "", method: "POST", headers: {}, body: "", saveResponseTo: "" },
    staticHandles: [
      { id: "success", label: "Success" },
      { id: "error", label: "Error" },
    ],
  },
  transfer: {
    label: "Transfer Call",
    color: "#E91E63",
    icon: "PhoneForwarded",
    category: "communication",
    defaultData: { destinationType: "number", destination: "", timeout: 30, announcement: "" },
  },
  record: {
    label: "Record",
    color: "#795548",
    icon: "Mic2",
    category: "communication",
    defaultData: { action: "start", maxLength: 300, playBeep: true, transcribe: false },
  },
  wait: {
    label: "Wait",
    color: "#9E9E9E",
    icon: "Clock",
    category: "flow",
    defaultData: { duration: 1 },
  },
  scheduleCallback: {
    label: "Schedule Callback",
    color: "#3F51B5",
    icon: "CalendarClock",
    category: "crm",
    defaultData: { delay: 3600, message: "", priority: "normal" },
  },
  updateLead: {
    label: "Update Lead",
    color: "#8BC34A",
    icon: "FileEdit",
    category: "crm",
    defaultData: { status: "", notes: "", customFields: {} },
  },
  end: {
    label: "End Call",
    color: "#F44336",
    icon: "PhoneOff",
    category: "flow",
    defaultData: { message: "", status: "completed" },
  },
};

export const ALL_NODE_TYPES = Object.keys(NODE_TYPES_CONFIG);

export interface PaletteGroup {
  label: string;
  types: string[];
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  { label: "Flow", types: ["start", "wait", "end"] },
  { label: "Communication", types: ["say", "gather", "transfer", "record"] },
  { label: "Logic", types: ["condition", "setVariable"] },
  { label: "Integration", types: ["apiCall"] },
  { label: "CRM", types: ["scheduleCallback", "updateLead"] },
];

/**
 * Get output handles for a node.
 * - Static handles come from config
 * - Dynamic handles come from node data (condition branches)
 * - Nodes without special handles get a single default handle
 */
export function getOutputHandles(
  type: string,
  data: Record<string, unknown>
): HandleDef[] {
  const cfg = NODE_TYPES_CONFIG[type];
  if (!cfg) return [{ id: "default", label: "" }];

  if (cfg.staticHandles) return cfg.staticHandles;

  if (cfg.dynamicHandles && type === "condition") {
    const condType = data.conditionType as string;
    if (condType === "variable") {
      return [
        { id: "true", label: "True" },
        { id: "false", label: "False" },
      ];
    }
    // keywords mode — one handle per branch + default
    const branches = (data.branches || []) as { id: string; name: string }[];
    const handles: HandleDef[] = branches.map((b) => ({
      id: b.id,
      label: b.name,
    }));
    handles.push({ id: "default", label: "Default" });
    return handles;
  }

  return [{ id: "default", label: "" }];
}
