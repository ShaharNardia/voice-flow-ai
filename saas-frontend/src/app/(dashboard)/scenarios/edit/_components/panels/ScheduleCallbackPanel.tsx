"use client";

import React from "react";
import FieldWrapper, { TextArea, NumberInput, SelectInput } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function ScheduleCallbackPanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Delay" helpText="Delay before callback in seconds (3600 = 1 hour)">
        <NumberInput
          value={(data.delay as number) ?? 3600}
          onChange={(v) => onUpdate("delay", v)}
          min={1}
          max={86400}
        />
      </FieldWrapper>

      <FieldWrapper label="Message">
        <TextArea
          value={(data.message as string) || ""}
          onChange={(v) => onUpdate("message", v)}
          placeholder="Callback message / reason"
        />
      </FieldWrapper>

      <FieldWrapper label="Priority">
        <SelectInput
          value={(data.priority as string) || "normal"}
          onChange={(v) => onUpdate("priority", v)}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />
      </FieldWrapper>
    </>
  );
}
