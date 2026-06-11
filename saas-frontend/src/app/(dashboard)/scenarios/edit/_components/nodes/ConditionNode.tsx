"use client";

import React, { useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { getOutputHandles, NODE_TYPES_CONFIG } from "../../_lib/node-config";
import type { Branch } from "../../_lib/types";

export default function ConditionNode({ data, type, selected, id }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const cfg = NODE_TYPES_CONFIG["condition"];
  const color = cfg.color; // purple
  const conditionType = (data.conditionType as string) || "keywords";
  const outputHandles = getOutputHandles("condition", data as Record<string, unknown>);

  // Build preview
  let preview = "";
  if (conditionType === "variable") {
    const v = data.variable as string;
    const op = data.operator as string;
    const val = data.value as string;
    if (v) preview = `${v} ${op || "=="} ${val || "?"}`;
  } else {
    const branches = (data.branches || []) as Branch[];
    preview = branches.length > 0
      ? `${branches.length} branch${branches.length > 1 ? "es" : ""}`
      : "No branches";
  }

  // Validation indicators
  const errors = (data._errors as string[]) || [];
  const warnings = (data._warnings as string[]) || [];
  const isDisconnected = !!data._disconnected;
  const isInLoop = !!data._inLoop;
  const hasErrors = errors.length > 0;

  // Border style: selected > errors > disconnected > loop > normal
  let border = "1px solid #E2E8F0";
  let shadow = "0 1px 3px rgba(0,0,0,0.06)";
  if (selected) {
    border = "2px solid #3B82F6";
    shadow = "0 4px 12px rgba(0,0,0,0.1)";
  } else if (hasErrors) {
    border = "2px solid #EF4444";
    shadow = "0 4px 12px rgba(0,0,0,0.1)";
  } else if (isDisconnected) {
    border = "2px dashed #F59E0B";
  } else if (isInLoop) {
    border = "2px solid #F97316";
  } else if (hovered) {
    shadow = "0 4px 12px rgba(0,0,0,0.1)";
  }

  const onDelete = data._onDelete as ((id: string) => void) | undefined;
  const onDuplicate = data._onDuplicate as ((id: string) => void) | undefined;

  // Handle label colors
  const getHandleLabelColor = (handleId: string) => {
    if (conditionType === "variable") {
      if (handleId === "true") return "#16A34A";
      if (handleId === "false") return "#DC2626";
    }
    if (handleId === "default") return "#6B7280";
    return "#7C3AED"; // purple for branch names
  };

  // Handle border color
  const getHandleBorderColor = (handleId: string) => {
    if (conditionType === "variable") {
      if (handleId === "true") return "#16A34A";
      if (handleId === "false") return "#DC2626";
    }
    if (handleId === "default") return "#9CA3AF";
    return color;
  };

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Mini toolbar — appears on hover, positioned above the node */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: -32,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            zIndex: 20,
          }}
        >
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(id); }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "white",
                border: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 12,
                color: "#64748B",
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#3B82F6";
                (e.currentTarget as HTMLElement).style.color = "#3B82F6";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                (e.currentTarget as HTMLElement).style.color = "#64748B";
              }}
              title="Duplicate node"
            >
              &#x2398;
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(id); }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "white",
                border: "1px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 13,
                color: "#64748B",
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#EF4444";
                (e.currentTarget as HTMLElement).style.color = "#EF4444";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                (e.currentTarget as HTMLElement).style.color = "#64748B";
              }}
              title="Delete node"
            >
              &#x2715;
            </button>
          )}
        </div>
      )}

      {/* Disconnected label above node */}
      {isDisconnected && (
        <div
          style={{
            position: "absolute",
            top: hovered ? -52 : -22,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 600,
            color: "#F59E0B",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            background: "#FFFBEB",
            padding: "1px 6px",
            borderRadius: 4,
            border: "1px solid #FDE68A",
            zIndex: 10,
          }}
        >
          Disconnected
        </div>
      )}

      {/* White card with purple left accent bar */}
      <div
        style={{
          width: 180,
          background: "white",
          borderRadius: 12,
          border,
          boxShadow: shadow,
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
      >
        {/* Left accent bar — purple */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 4,
            height: "100%",
            background: color,
            borderRadius: "12px 0 0 12px",
          }}
        />

        {/* Error badge */}
        {hasErrors && (
          <div
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#EF4444",
              color: "white",
              borderRadius: "50%",
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              boxShadow: "0 1px 4px rgba(239,68,68,0.4)",
              zIndex: 10,
              lineHeight: 1,
            }}
            title={errors.join("\n")}
          >
            {errors.length}
          </div>
        )}

        {/* Target handle */}
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: "white",
            border: `2px solid ${color}`,
            width: 8,
            height: 8,
          }}
        />

        {/* Content area */}
        <div style={{ padding: "10px 12px 10px 16px" }}>
          {/* Icon circle + label */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              C
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#1E293B",
              }}
            >
              Condition
            </span>
          </div>

          {/* Condition type pill + preview */}
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: color,
                background: "#F5F3FF",
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid #DDD6FE",
                whiteSpace: "nowrap",
              }}
            >
              {conditionType === "variable" ? "Variable" : "Keywords"}
            </span>
            {preview && (
              <span
                style={{
                  fontSize: 11,
                  color: "#94A3B8",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 400,
                }}
              >
                {preview}
              </span>
            )}
          </div>
        </div>

        {/* Output handles */}
        {outputHandles.map((handle, i) => {
          const count = outputHandles.length;
          const leftPercent = count === 1 ? 50 : ((i + 1) * 100) / (count + 1);

          return (
            <React.Fragment key={handle.id}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={handle.id}
                style={{
                  left: `${leftPercent}%`,
                  background: "white",
                  border: `2px solid ${getHandleBorderColor(handle.id)}`,
                  width: 8,
                  height: 8,
                }}
              />
              {handle.label && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -18,
                    left: `${leftPercent}%`,
                    transform: "translateX(-50%)",
                    fontSize: 9,
                    fontWeight: 600,
                    color: getHandleLabelColor(handle.id),
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    background: "rgba(255,255,255,0.95)",
                    padding: "1px 5px",
                    borderRadius: 3,
                  }}
                >
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
