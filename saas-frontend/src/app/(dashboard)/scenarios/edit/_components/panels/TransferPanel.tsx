"use client";

import React from "react";
import FieldWrapper, {
  TextInput,
  TextArea,
  NumberInput,
  SelectInput,
} from "../shared/FieldWrapper";
import type { PanelProps } from "../../_lib/types";

const PLACEHOLDER_MAP: Record<string, string> = {
  number: "+1 (555) 123-4567",
  agent: "agent_id_123",
  queue: "sales_queue",
  sip: "sip:user@domain.com",
};

export default function TransferPanel({ data, onUpdate }: PanelProps) {
  const destType = (data.destinationType as string) || "number";

  return (
    <>
      <FieldWrapper label="Destination Type">
        <SelectInput
          value={destType}
          onChange={(v) => onUpdate("destinationType", v)}
          options={[
            { value: "number", label: "Phone Number" },
            { value: "agent", label: "Agent" },
            { value: "queue", label: "Queue" },
            { value: "sip", label: "SIP URI" },
          ]}
        />
      </FieldWrapper>

      <FieldWrapper label="Destination">
        <TextInput
          value={(data.destination as string) || ""}
          onChange={(v) => onUpdate("destination", v)}
          placeholder={PLACEHOLDER_MAP[destType] || ""}
        />
      </FieldWrapper>

      <FieldWrapper label="Timeout" helpText="Ring timeout in seconds">
        <NumberInput
          value={(data.timeout as number) ?? 30}
          onChange={(v) => onUpdate("timeout", v)}
          min={1}
          max={120}
        />
      </FieldWrapper>

      <FieldWrapper label="Announcement" helpText="Caller hears this while waiting for the transfer">
        <TextArea
          value={(data.announcement as string) || ""}
          onChange={(v) => onUpdate("announcement", v)}
          placeholder="Message to play before connecting"
        />
      </FieldWrapper>

      <FieldWrapper label="Caller ID" helpText="Leave blank to use default">
        <TextInput
          value={(data.callerId as string) || ""}
          onChange={(v) => onUpdate("callerId", v)}
          placeholder="Override caller ID"
        />
      </FieldWrapper>
    </>
  );
}
