"use client";

import React from "react";
import FieldWrapper, {
  TextArea,
  TextInput,
  NumberInput,
  SelectInput,
} from "../shared/FieldWrapper";
import { LANGUAGES } from "../../_lib/voices";
import type { PanelProps } from "../../_lib/types";

export default function GatherPanel({ data, onUpdate }: PanelProps) {
  const inputType = (data.inputType as string) || "speech";
  const showDigits = inputType === "dtmf" || inputType === "both";

  return (
    <>
      <FieldWrapper label="Prompt">
        <TextArea
          value={(data.prompt as string) || ""}
          onChange={(v) => onUpdate("prompt", v)}
          placeholder="What to say while waiting for input"
        />
      </FieldWrapper>

      <FieldWrapper label="Input Type">
        <SelectInput
          value={inputType}
          onChange={(v) => onUpdate("inputType", v)}
          options={[
            { value: "speech", label: "Speech" },
            { value: "dtmf", label: "DTMF" },
            { value: "both", label: "Both" },
          ]}
        />
      </FieldWrapper>

      <FieldWrapper label="Timeout" helpText="How long to wait for input (seconds)">
        <NumberInput
          value={(data.timeout as number) ?? 5}
          onChange={(v) => onUpdate("timeout", v)}
          min={1}
          max={30}
        />
      </FieldWrapper>

      <FieldWrapper label="Speech Timeout" helpText="Silence after last word before accepting (seconds). Set to 0 for 'auto'">
        <NumberInput
          value={(data.speechTimeout as number) ?? 2}
          onChange={(v) => onUpdate("speechTimeout", v)}
          min={0}
          max={10}
        />
      </FieldWrapper>

      <FieldWrapper label="Language">
        <SelectInput
          value={(data.language as string) || "en-US"}
          onChange={(v) => onUpdate("language", v)}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
        />
      </FieldWrapper>

      {showDigits && (
        <FieldWrapper label="Number of Digits" helpText="Expected number of DTMF digits">
          <NumberInput
            value={(data.numDigits as number) ?? 1}
            onChange={(v) => onUpdate("numDigits", v)}
            min={1}
            max={20}
          />
        </FieldWrapper>
      )}

      <FieldWrapper label="Save Response To" helpText="Variable name to store the response">
        <TextInput
          value={(data.saveResponseTo as string) || ""}
          onChange={(v) => onUpdate("saveResponseTo", v)}
          placeholder="userInput"
        />
      </FieldWrapper>

      <FieldWrapper label="No Match Message">
        <TextArea
          value={(data.noMatchMessage as string) || ""}
          onChange={(v) => onUpdate("noMatchMessage", v)}
          placeholder="What to say if input isn't recognized"
        />
      </FieldWrapper>

      <FieldWrapper label="Max Retries" helpText="How many times to re-prompt on no match">
        <NumberInput
          value={(data.maxRetries as number) ?? 2}
          onChange={(v) => onUpdate("maxRetries", v)}
          min={0}
          max={5}
        />
      </FieldWrapper>
    </>
  );
}
