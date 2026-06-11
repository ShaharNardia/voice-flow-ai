"use client";

import React from "react";
import FieldWrapper, { TextArea, Toggle } from "../shared/FieldWrapper";
import VoiceLanguagePicker from "../shared/VoiceLanguagePicker";
import type { PanelProps } from "../../_lib/types";

export default function SayPanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Text *" helpText="The message the AI will speak">
        <TextArea
          value={(data.text as string) || ""}
          onChange={(v) => onUpdate("text", v)}
          placeholder="Enter the message..."
        />
      </FieldWrapper>

      <VoiceLanguagePicker
        language={(data.language as string) || "en-US"}
        voice={(data.voice as string) || ""}
        onLanguageChange={(v) => onUpdate("language", v)}
        onVoiceChange={(v) => onUpdate("voice", v)}
      />

      <FieldWrapper label="Barge In" helpText="When enabled, the caller can speak over this message">
        <Toggle
          value={!!data.bargeIn}
          onChange={(v) => onUpdate("bargeIn", v)}
          label="Allow caller to interrupt"
        />
      </FieldWrapper>
    </>
  );
}
