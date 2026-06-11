"use client";

import React from "react";
import FieldWrapper, {
  TextInput,
  TextArea,
  NumberInput,
  SelectInput,
} from "../shared/FieldWrapper";
import KeyValueEditor, {
  recordToEntries,
  entriesToRecord,
} from "../shared/KeyValueEditor";
import type { PanelProps } from "../../_lib/types";

export default function ApiCallPanel({ data, onUpdate }: PanelProps) {
  const method = (data.method as string) || "GET";
  const showBody = ["POST", "PUT", "PATCH"].includes(method);

  return (
    <>
      <FieldWrapper label="URL" helpText="API endpoint URL">
        <TextInput
          value={(data.url as string) || ""}
          onChange={(v) => onUpdate("url", v)}
          placeholder="https://api.example.com/endpoint"
        />
      </FieldWrapper>

      <FieldWrapper label="Method">
        <SelectInput
          value={method}
          onChange={(v) => onUpdate("method", v)}
          options={["GET", "POST", "PUT", "DELETE", "PATCH"]}
        />
      </FieldWrapper>

      <FieldWrapper label="Headers">
        <KeyValueEditor
          entries={recordToEntries(data.headers as Record<string, string>)}
          onChange={(entries) => onUpdate("headers", entriesToRecord(entries))}
          keyPlaceholder="Header name"
          valuePlaceholder="Header value"
        />
      </FieldWrapper>

      {showBody && (
        <FieldWrapper label="Body" helpText="Only used for POST/PUT/PATCH">
          <TextArea
            value={(data.body as string) || ""}
            onChange={(v) => onUpdate("body", v)}
            placeholder='{"key": "value"}'
            mono
          />
        </FieldWrapper>
      )}

      <FieldWrapper label="Save Response To" helpText="Variable name for the response">
        <TextInput
          value={(data.saveResponseTo as string) || ""}
          onChange={(v) => onUpdate("saveResponseTo", v)}
          placeholder="apiResponse"
        />
      </FieldWrapper>

      <FieldWrapper label="Timeout" helpText="Request timeout in seconds">
        <NumberInput
          value={(data.timeout as number) ?? 10}
          onChange={(v) => onUpdate("timeout", v)}
          min={1}
          max={30}
        />
      </FieldWrapper>

      <FieldWrapper label="Error Message">
        <TextArea
          value={(data.errorMessage as string) || ""}
          onChange={(v) => onUpdate("errorMessage", v)}
          placeholder="Message to say if the API call fails"
        />
      </FieldWrapper>
    </>
  );
}
