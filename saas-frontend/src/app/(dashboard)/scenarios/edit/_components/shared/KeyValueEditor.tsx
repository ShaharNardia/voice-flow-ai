"use client";

import React from "react";
import { Plus, X } from "lucide-react";

interface KVEntry {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  entries: KVEntry[];
  onChange: (entries: KVEntry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export default function KeyValueEditor({
  entries,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const rows = entries.length > 0 ? entries : [];

  const updateRow = (index: number, field: "key" | "value", val: string) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  };

  const addRow = () => onChange([...rows, { key: "", value: "" }]);

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {rows.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={entry.key}
            onChange={(e) => updateRow(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 border border-neutral-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#F22F46]"
          />
          <input
            type="text"
            value={entry.value}
            onChange={(e) => updateRow(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 border border-neutral-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-[#F22F46]"
          />
          <button
            onClick={() => removeRow(i)}
            className="p-1 text-neutral-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={addRow}
        className="flex items-center gap-1 text-xs text-[#F22F46] hover:text-[#d9243b] font-medium mt-1"
      >
        <Plus className="w-3 h-3" />
        Add row
      </button>
    </div>
  );
}

/** Convert Record<string,string> to KVEntry[] for the editor */
export function recordToEntries(obj: Record<string, string> | undefined): KVEntry[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}

/** Convert KVEntry[] back to Record<string,string> for storage */
export function entriesToRecord(entries: KVEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim()) result[key.trim()] = value;
  }
  return result;
}
