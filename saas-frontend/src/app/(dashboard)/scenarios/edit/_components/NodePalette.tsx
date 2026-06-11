"use client";

import React from "react";
import { NODE_TYPES_CONFIG, PALETTE_GROUPS } from "../_lib/node-config";

interface NodePaletteProps {
  onAddNode: (type: string) => void;
  hasStart: boolean;
}

export default function NodePalette({ onAddNode, hasStart }: NodePaletteProps) {
  return (
    <div className="w-48 flex-shrink-0 bg-white border border-neutral-200 rounded-xl overflow-y-auto">
      <div className="p-3 border-b border-neutral-100">
        <p className="text-xs font-semibold text-neutral-800 uppercase tracking-wide">Nodes</p>
      </div>
      <div className="p-2 space-y-3">
        {PALETTE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider px-2 mb-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.types.map((type) => {
                const cfg = NODE_TYPES_CONFIG[type];
                if (!cfg) return null;
                const disabled = type === "start" && hasStart;
                return (
                  <button
                    key={type}
                    onClick={() => !disabled && onAddNode(type)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all ${
                      disabled
                        ? "text-neutral-300 cursor-not-allowed"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 hover:shadow-sm"
                    }`}
                    title={disabled ? "Only one Start node allowed" : cfg.label}
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ background: disabled ? "#D1D5DB" : cfg.color }}
                    >
                      {cfg.label[0]}
                    </span>
                    <span className="truncate font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
