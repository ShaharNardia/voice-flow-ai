"use client";

import React from "react";
import FieldWrapper, { SelectInput } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function StartPanel({ data, onUpdate }: PanelProps) {
  return (
    <FieldWrapper label="Trigger">
      <SelectInput
        value={(data.trigger as string) || "outbound"}
        onChange={(v) => onUpdate("trigger", v)}
        options={[
          { value: "outbound", label: "Outbound" },
          { value: "inbound", label: "Inbound" },
        ]}
      />
    </FieldWrapper>
  );
}
