"use client";

import React from "react";
import FieldWrapper, { TextInput, SelectInput } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function SetVariablePanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Variable Name">
        <TextInput
          value={(data.variableName as string) || ""}
          onChange={(v) => onUpdate("variableName", v)}
          placeholder="myVariable"
        />
      </FieldWrapper>

      <FieldWrapper label="Value" helpText="Use {{placeholders}} for dynamic values">
        <TextInput
          value={(data.value as string) || ""}
          onChange={(v) => onUpdate("value", v)}
          placeholder="Enter value..."
        />
      </FieldWrapper>

      <FieldWrapper label="Value Type">
        <SelectInput
          value={(data.valueType as string) || "string"}
          onChange={(v) => onUpdate("valueType", v)}
          options={[
            { value: "string", label: "String" },
            { value: "number", label: "Number" },
            { value: "boolean", label: "Boolean" },
          ]}
        />
      </FieldWrapper>
    </>
  );
}
