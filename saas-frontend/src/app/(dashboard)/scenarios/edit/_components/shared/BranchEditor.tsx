"use client";

import React, { useState, useCallback } from "react";
import { Plus, X, GripVertical } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  keywords: string[];
}

interface BranchEditorProps {
  branches: Branch[];
  onChange: (branches: Branch[]) => void;
}

export default function BranchEditor({ branches, onChange }: BranchEditorProps) {
  const updateBranch = useCallback(
    (index: number, updates: Partial<Branch>) => {
      const next = [...branches];
      next[index] = { ...next[index], ...updates };
      // Sync id with name (kebab-case)
      if (updates.name !== undefined) {
        next[index].id = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `branch_${index}`;
      }
      onChange(next);
    },
    [branches, onChange]
  );

  const addBranch = () => {
    const idx = branches.length + 1;
    onChange([...branches, { id: `branch_${idx}`, name: `Branch ${idx}`, keywords: [] }]);
  };

  const removeBranch = (index: number) => {
    onChange(branches.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {branches.map((branch, i) => (
        <BranchRow
          key={branch.id || i}
          branch={branch}
          onUpdate={(updates) => updateBranch(i, updates)}
          onRemove={() => removeBranch(i)}
          canRemove={branches.length > 1}
        />
      ))}
      <button
        onClick={addBranch}
        className="flex items-center gap-1.5 text-xs text-[#F22F46] hover:text-[#d9243b] font-medium"
      >
        <Plus className="w-3 h-3" />
        Add branch
      </button>
      {/* Default branch info */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 rounded-md border border-neutral-100">
        <div className="w-2 h-2 rounded-full bg-neutral-400 flex-shrink-0" />
        <span className="text-[11px] text-neutral-500">
          <strong>Default</strong> — unmatched responses follow this path
        </span>
      </div>
    </div>
  );
}

function BranchRow({
  branch,
  onUpdate,
  onRemove,
  canRemove,
}: {
  branch: Branch;
  onUpdate: (updates: Partial<Branch>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [input, setInput] = useState("");

  const addKeyword = () => {
    const word = input.trim();
    if (!word || branch.keywords.includes(word)) return;
    onUpdate({ keywords: [...branch.keywords, word] });
    setInput("");
  };

  const removeKeyword = (kw: string) => {
    onUpdate({ keywords: branch.keywords.filter((k) => k !== kw) });
  };

  return (
    <div className="border border-neutral-200 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" />
        <input
          type="text"
          value={branch.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Branch name"
          className="flex-1 border border-neutral-200 rounded-md px-2 py-1 text-xs font-medium focus:outline-none focus:border-[#F22F46]"
        />
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-0.5 text-neutral-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Keyword chips */}
      <div className="flex flex-wrap gap-1">
        {branch.keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          >
            {kw}
            <button
              onClick={() => removeKeyword(kw)}
              className="text-purple-400 hover:text-purple-700"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      {/* Add keyword input */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder="Type keyword + Enter"
          className="flex-1 border border-neutral-200 rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-purple-400"
        />
        <button
          onClick={addKeyword}
          disabled={!input.trim()}
          className="text-[10px] text-purple-600 font-medium px-1.5 py-1 hover:bg-purple-50 rounded disabled:opacity-30"
        >
          Add
        </button>
      </div>
    </div>
  );
}
