"use client";

import React from "react";
import type { Node } from "reactflow";
import { Trash2, AlertTriangle, Info } from "lucide-react";
import { NODE_TYPES_CONFIG } from "../_lib/node-config";
import type { PanelProps } from "../_lib/types";

import StartPanel from "./panels/StartPanel";
import SayPanel from "./panels/SayPanel";
import GatherPanel from "./panels/GatherPanel";
import ConditionPanel from "./panels/ConditionPanel";
import SetVariablePanel from "./panels/SetVariablePanel";
import ApiCallPanel from "./panels/ApiCallPanel";
import TransferPanel from "./panels/TransferPanel";
import RecordPanel from "./panels/RecordPanel";
import WaitPanel from "./panels/WaitPanel";
import ScheduleCallbackPanel from "./panels/ScheduleCallbackPanel";
import UpdateLeadPanel from "./panels/UpdateLeadPanel";
import EndPanel from "./panels/EndPanel";

const PANEL_MAP: Record<string, React.ComponentType<PanelProps>> = {
  start: StartPanel,
  say: SayPanel,
  gather: GatherPanel,
  condition: ConditionPanel,
  setVariable: SetVariablePanel,
  apiCall: ApiCallPanel,
  transfer: TransferPanel,
  record: RecordPanel,
  wait: WaitPanel,
  scheduleCallback: ScheduleCallbackPanel,
  updateLead: UpdateLeadPanel,
  end: EndPanel,
};

interface PropertiesPanelProps {
  node: Node;
  onUpdate: (key: string, value: unknown) => void;
  onDelete: () => void;
  errors?: string[];
  warnings?: string[];
}

export default function PropertiesPanel({ node, onUpdate, onDelete, errors, warnings }: PropertiesPanelProps) {
  const typeKey = node.type || "say";
  const cfg = NODE_TYPES_CONFIG[typeKey];
  const Panel = PANEL_MAP[typeKey];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-100">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: cfg?.color || "#999" }}
        />
        <span className="text-sm font-semibold text-neutral-800">
          {cfg?.label || typeKey}
        </span>
        <span className="text-[10px] text-neutral-400 ml-auto font-mono">
          {node.id.slice(0, 12)}
        </span>
      </div>

      {/* Validation messages */}
      {errors && errors.length > 0 && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {Panel ? (
          <Panel data={node.data as Record<string, unknown>} onUpdate={onUpdate} />
        ) : (
          <p className="text-sm text-neutral-400">No properties for this node type.</p>
        )}
      </div>

      {/* Delete button */}
      {typeKey !== "start" && (
        <button
          onClick={onDelete}
          className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Node
        </button>
      )}
    </div>
  );
}
