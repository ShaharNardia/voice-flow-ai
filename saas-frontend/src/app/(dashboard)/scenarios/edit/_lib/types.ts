// Node data types matching backend scenario_engine.js expectations

export interface Branch {
  id: string;
  name: string;
  keywords: string[];
}

export interface HandleDef {
  id: string;
  label: string;
}

export interface StartNodeData {
  trigger: "outbound" | "inbound";
}

export interface SayNodeData {
  text: string;
  voice?: string;
  language?: string;
  bargeIn?: boolean;
}

export interface GatherNodeData {
  prompt: string;
  timeout: number;
  inputType: "speech" | "dtmf" | "both";
  speechTimeout?: number | string; // number or "auto"
  language?: string;
  numDigits?: number;
  saveResponseTo?: string;
  noMatchMessage?: string;
  maxRetries?: number;
}

export interface ConditionNodeData {
  conditionType: "keywords" | "variable";
  // keywords mode
  branches?: Branch[];
  // variable mode
  variable?: string;
  operator?: "equals" | "notEquals" | "contains" | "startsWith" | "greaterThan" | "lessThan";
  value?: string;
}

export interface SetVariableNodeData {
  variableName: string;
  value: string;
  valueType: "string" | "number" | "boolean";
}

export interface ApiCallNodeData {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  saveResponseTo?: string;
  timeout?: number;
  errorMessage?: string;
}

export interface TransferNodeData {
  destinationType: "number" | "agent" | "queue" | "sip";
  destination: string;
  timeout: number;
  announcement?: string;
  callerId?: string;
}

export interface RecordNodeData {
  action: "start" | "stop";
  maxLength: number;
  playBeep?: boolean;
  transcribe?: boolean;
}

export interface WaitNodeData {
  duration: number;
}

export interface ScheduleCallbackNodeData {
  delay: number;
  message: string;
  priority?: "low" | "normal" | "high";
}

export interface UpdateLeadNodeData {
  status: string;
  notes: string;
  customFields?: Record<string, string>;
}

export interface EndNodeData {
  message: string;
  status: string;
}

export type AnyNodeData =
  | StartNodeData
  | SayNodeData
  | GatherNodeData
  | ConditionNodeData
  | SetVariableNodeData
  | ApiCallNodeData
  | TransferNodeData
  | RecordNodeData
  | WaitNodeData
  | ScheduleCallbackNodeData
  | UpdateLeadNodeData
  | EndNodeData;

export interface PanelProps {
  data: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}
