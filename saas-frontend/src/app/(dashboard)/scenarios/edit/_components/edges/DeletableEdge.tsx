"use client";

import React, { useState, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "reactflow";
import { X } from "lucide-react";
import { EdgeDeleteContext } from "../../_lib/editor-context";

export default function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style = {}, markerEnd, label, data,
}: EdgeProps) {
  const onDeleteEdge = useContext(EdgeDeleteContext);
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: hovered ? "#64748B" : (style.stroke || "#94A3B8"),
          strokeWidth: hovered ? 2.5 : (style.strokeWidth || 2),
          transition: "stroke 0.15s, stroke-width 0.15s",
        }}
      />
      <EdgeLabelRenderer>
        {/* Condition label */}
        {label && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 14}px)`,
              fontSize: 10,
              fontWeight: 600,
              color: "#7C3AED",
              background: "#F5F3FF",
              padding: "1px 6px",
              borderRadius: 4,
              border: "1px solid #DDD6FE",
              pointerEvents: "none",
            }}
          >
            {label}
          </div>
        )}
        {/* Delete button — shown on hover */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteEdge(id);
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "white",
                border: "1.5px solid #E2E8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#EF4444";
                (e.currentTarget as HTMLElement).style.background = "#FEF2F2";
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                (e.currentTarget as HTMLElement).style.background = "white";
              }}
            >
              <X style={{ width: 12, height: 12, color: "#94A3B8" }} />
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
