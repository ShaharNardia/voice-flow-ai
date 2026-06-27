"use client";

import React, { useEffect, useRef } from "react";

interface LogEntry {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  timestamp: string;
  output: {
    action: string;
    text?: string;
    resolvedText?: string;
    prompt?: string;
    inputType?: string;
    timeout?: number;
    voice?: string;
    language?: string;
    name?: string;
    value?: string;
    type?: string;
    url?: string;
    method?: string;
    status?: number;
    responsePreview?: string;
    error?: string;
    destinationType?: string;
    destination?: string;
    conditionType?: string;
    matchedBranch?: string;
    matchedCondition?: string;
    variable?: string;
    operator?: string;
    message?: string;
    trigger?: string;
    recordAction?: string;
    duration?: number;
    delay?: number;
    priority?: string;
    notes?: string;
    saveResponseTo?: string;
    maxLength?: number;
  } | null;
}

interface ExecutionTraceProps {
  entries: LogEntry[];
  autoScroll?: boolean;
  maxHeight?: string;
}

const TYPE_STYLES: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  start:              { icon: "\u25B6",  color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  say:                { icon: "\uD83D\uDCAC", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  gather:             { icon: "\uD83C\uDF99", color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
  user_input:         { icon: "\uD83D\uDC64", color: "#525252", bg: "#F5F5F5", border: "#D4D4D4" },
  condition:          { icon: "\uD83D\uDD00", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  setVariable:        { icon: "\uD83D\uDCDD", color: "#475569", bg: "#F8FAFC", border: "#CBD5E1" },
  apiCall:            { icon: "\uD83C\uDF10", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  transfer:           { icon: "\uD83D\uDCDE", color: "#DB2777", bg: "#FDF2F8", border: "#FBCFE8" },
  record:             { icon: "\uD83C\uDF99",  color: "#78350F", bg: "#FFFBEB", border: "#FDE68A" },
  wait:               { icon: "\u23F3", color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
  scheduleCallback:   { icon: "\uD83D\uDCC5", color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
  updateLead:         { icon: "\uD83D\uDCCB", color: "#65A30D", bg: "#F7FEE7", border: "#BEF264" },
  end:                { icon: "\uD83D\uDD34", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

function formatOutput(entry: LogEntry): string {
  const o = entry.output;
  if (!o) return "";

  switch (o.action) {
    case "start":
      return `Trigger: ${o.trigger || "outbound"}`;
    case "say":
      return o.resolvedText || o.text || "";
    case "gather":
      return `Prompt: "${o.prompt || ""}"  |  Input: ${o.inputType || "speech"}  |  Timeout: ${o.timeout || 5}s`;
    case "user_input":
      return `"${o.text || ""}"${o.matchedCondition ? `  \u2192  ${o.matchedCondition}` : ""}`;
    case "condition":
      if (o.conditionType === "variable") {
        return `${o.variable || "?"} ${o.operator || "=="} \u2192 ${o.matchedBranch || "?"}`;
      }
      return `Keywords \u2192 ${o.matchedBranch || "default"}`;
    case "setVariable":
      return `${o.name || "?"} = "${o.value || ""}" (${o.type || "string"})`;
    case "apiCall": {
      const statusLabel = o.status ? `${o.status}` : "pending";
      const statusColor = o.error ? "text-red-600" : o.status && o.status < 400 ? "text-green-600" : "text-amber-600";
      return `${o.method || "GET"} ${o.url || "?"}  \u2192  <span class="${statusColor} font-medium">${statusLabel}</span>${o.error ? ` (${o.error})` : ""}`;
    }
    case "transfer":
      return `${o.destinationType || "number"}: ${o.destination || "?"}  |  Timeout: ${o.timeout || 30}s`;
    case "record":
      return `${o.recordAction || "start"}${o.maxLength ? ` (max ${o.maxLength}s)` : ""}`;
    case "wait":
      return `Pause ${o.duration || 1}s`;
    case "scheduleCallback":
      return `Delay: ${o.delay || 0}s  |  Priority: ${o.priority || "normal"}`;
    case "updateLead":
      return `Status: "${o.status || "?"}"${o.notes ? `  |  Notes: "${o.notes}"` : ""}`;
    case "end":
      return `${o.message ? `"${o.message}"` : ""}  Status: ${o.status || "completed"}`;
    default:
      return JSON.stringify(o).slice(0, 100);
  }
}

export default function ExecutionTrace({ entries, autoScroll = true, maxHeight = "300px" }: ExecutionTraceProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, autoScroll]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-neutral-400">
        No execution data yet
      </div>
    );
  }

  return (
    <div className="overflow-y-auto space-y-1 pr-1" style={{ maxHeight }}>
      {entries.map((entry, i) => {
        const style = TYPE_STYLES[entry.nodeType] || TYPE_STYLES[entry.output?.action || ""] || { icon: "\u2022", color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" };
        const outputText = formatOutput(entry);
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

        return (
          <div
            key={i}
            className="flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors"
            style={{ background: style.bg, border: `1px solid ${style.border}` }}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
              <span className="text-sm">{style.icon}</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold" style={{ color: style.color }}>
                  {entry.nodeLabel || entry.nodeType}
                </span>
                {time && (
                  <span className="text-[9px] text-neutral-400 ml-auto flex-shrink-0">
                    {time}
                  </span>
                )}
              </div>
              {outputText && (
                <div
                  className="text-[11px] text-neutral-600 mt-0.5 leading-tight break-words"
                  dangerouslySetInnerHTML={{ __html: outputText }}
                />
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

export type { LogEntry };
