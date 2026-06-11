"use client";

import React from "react";
import FieldWrapper, { NumberInput, SelectInput, Toggle } from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

export default function RecordPanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Action">
        <SelectInput
          value={(data.action as string) || "start"}
          onChange={(v) => onUpdate("action", v)}
          options={[
            { value: "start", label: "Start Recording" },
            { value: "stop", label: "Stop Recording" },
          ]}
        />
      </FieldWrapper>

      <FieldWrapper label="Max Length" helpText="Maximum recording length in seconds">
        <NumberInput
          value={(data.maxLength as number) ?? 300}
          onChange={(v) => onUpdate("maxLength", v)}
          min={1}
          max={3600}
        />
      </FieldWrapper>

      <FieldWrapper label="Play Beep">
        <Toggle
          value={!!data.playBeep}
          onChange={(v) => onUpdate("playBeep", v)}
          label="Play beep before recording"
        />
      </FieldWrapper>

      <FieldWrapper label="Transcribe">
        <Toggle
          value={!!data.transcribe}
          onChange={(v) => onUpdate("transcribe", v)}
          label="Automatically transcribe the recording"
        />
      </FieldWrapper>
    </>
  );
}
