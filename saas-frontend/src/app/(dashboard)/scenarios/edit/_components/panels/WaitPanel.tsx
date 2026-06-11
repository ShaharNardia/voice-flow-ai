"use client";

import React from "react";
import FieldWrapper, { NumberInput } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function WaitPanel({ data, onUpdate }: PanelProps) {
  return (
    <FieldWrapper label="Duration" helpText="Pause duration in seconds">
      <NumberInput
        value={(data.duration as number) ?? 5}
        onChange={(v) => onUpdate("duration", v)}
        min={1}
        max={60}
      />
    </FieldWrapper>
  );
}
