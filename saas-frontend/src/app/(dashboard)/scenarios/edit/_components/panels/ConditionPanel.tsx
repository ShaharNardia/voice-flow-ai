"use client";

import React from "react";
import FieldWrapper, { TextInput, SelectInput } from "../shared/FieldWrapper";
import BranchEditor from "../shared/BranchEditor";
import type { PanelProps, Branch } from "../../_lib/types";

const DEFAULT_BRANCHES: Branch[] = [
  { id: "match", name: "Match", keywords: [] },
];

export default function ConditionPanel({ data, onUpdate }: PanelProps) {
  const conditionType = (data.conditionType as string) || "keywords";

  return (
    <>
      {/* Info box */}
      <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 leading-snug">
        Routes the conversation based on caller response or variable values.
      </div>

      <FieldWrapper label="Condition Type">
        <SelectInput
          value={conditionType}
          onChange={(v) => onUpdate("conditionType", v)}
          options={[
            { value: "keywords", label: "Keywords" },
            { value: "variable", label: "Variable" },
          ]}
        />
      </FieldWrapper>

      {conditionType === "keywords" && (
        <FieldWrapper label="Branches">
          <BranchEditor
            branches={(data.branches as Branch[]) || DEFAULT_BRANCHES}
            onChange={(branches) => onUpdate("branches", branches)}
          />
        </FieldWrapper>
      )}

      {conditionType === "variable" && (
        <>
          <FieldWrapper label="Variable">
            <TextInput
              value={(data.variable as string) || ""}
              onChange={(v) => onUpdate("variable", v)}
              placeholder="Variable name to check"
            />
          </FieldWrapper>

          <FieldWrapper label="Operator">
            <SelectInput
              value={(data.operator as string) || "equals"}
              onChange={(v) => onUpdate("operator", v)}
              options={[
                { value: "equals", label: "Equals" },
                { value: "notEquals", label: "Not Equals" },
                { value: "contains", label: "Contains" },
                { value: "startsWith", label: "Starts With" },
                { value: "greaterThan", label: "Greater Than" },
                { value: "lessThan", label: "Less Than" },
              ]}
            />
          </FieldWrapper>

          <FieldWrapper label="Value">
            <TextInput
              value={(data.value as string) || ""}
              onChange={(v) => onUpdate("value", v)}
              placeholder="Value to compare against"
            />
          </FieldWrapper>
        </>
      )}
    </>
  );
}
