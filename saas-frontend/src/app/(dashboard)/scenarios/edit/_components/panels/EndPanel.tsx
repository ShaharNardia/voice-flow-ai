"use client";

import React from "react";
import FieldWrapper, { TextArea, SelectInput } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function EndPanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Message">
        <TextArea
          value={(data.message as string) || ""}
          onChange={(v) => onUpdate("message", v)}
          placeholder="Farewell message to play before hanging up"
        />
      </FieldWrapper>

      <FieldWrapper label="Status">
        <SelectInput
          value={(data.status as string) || "completed"}
          onChange={(v) => onUpdate("status", v)}
          options={[
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
            { value: "voicemail", label: "Voicemail" },
            { value: "transferred", label: "Transferred" },
            { value: "no_answer", label: "No Answer" },
          ]}
        />
      </FieldWrapper>
    </>
  );
}
