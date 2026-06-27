"use client";

import React from "react";
import FieldWrapper, { TextInput, TextArea } from "../shared/FieldWrapper";
import KeyValueEditor, {
  recordToEntries,
  entriesToRecord,
} from "../shared/KeyValueEditor";
import type { PanelProps } from "../../_lib/types";

export default function UpdateLeadPanel({ data, onUpdate }: PanelProps) {
  return (
    <>
      <FieldWrapper label="Status" helpText="Lead status">
        <TextInput
          value={(data.status as string) || ""}
          onChange={(v) => onUpdate("status", v)}
          placeholder="contacted, interested, not_interested..."
        />
      </FieldWrapper>

      <FieldWrapper label="Notes">
        <TextArea
          value={(data.notes as string) || ""}
          onChange={(v) => onUpdate("notes", v)}
          placeholder="Notes to add to the lead record"
        />
      </FieldWrapper>

      <div className="mt-4 mb-2">
        <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
          Custom Fields
        </h4>
      </div>

      <KeyValueEditor
        entries={recordToEntries(data.customFields as Record<string, string>)}
        onChange={(entries) => onUpdate("customFields", entriesToRecord(entries))}
        keyPlaceholder="Field name"
        valuePlaceholder="Field value"
      />
    </>
  );
}
