"use client";

import React, { useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { getOutputHandles, NODE_TYPES_CONFIG } from "../../_lib/node-config";

export default function FlowNode({ data, type, selected, id }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const typeKey = type || "say";
  const cfg = NODE_TYPES_CONFIG[typeKey];
  const color = (data.color as string) || cfg?.color || "#999";
  const label = (data.label as string) || cfg?.label || typeKey;
  const outputHandles = getOutputHandles(typeKey, data as Record<string, unknown>);
  const isMultiOutput = outputHandles.length > 1 || (outputHandles.length === 1 && outputHandles[0].id !== "default");

  // Build preview text from the most relevant data field
  const preview = String(
    data.text || data.prompt || data.message || data.url || data.destination || data.variableName || ""
  ).slice(0, 40);

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

      {/* White card with colored left accent bar */}
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
        {/* Left accent bar */}
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

        {/* Target handle (input) */}
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
              {cfg?.label?.[0] || "?"}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#1E293B",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </div>

          {/* Preview text */}
          {preview && (
            <div
              style={{
                fontSize: 11,
                color: "#94A3B8",
                marginTop: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 148,
                fontWeight: 400,
              }}
            >
              {preview}
            </div>
          )}
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
                  border: `2px solid ${color}`,
                  width: 8,
                  height: 8,
                }}
              />
              {isMultiOutput && handle.label && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -18,
                    left: `${leftPercent}%`,
                    transform: "translateX(-50%)",
                    fontSize: 9,
                    fontWeight: 500,
                    color: "#64748B",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    background: "rgba(255,255,255,0.95)",
                    padding: "1px 4px",
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
