"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { Node, Edge } from "reactflow";
import { Play, X, Send, RotateCcw } from "lucide-react";
import type { Branch } from "../_lib/types";

interface TestMsg {
  role: "bot" | "user" | "system";
  text: string;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

interface LiveTestPanelProps {
  nodes: Node<Record<string, unknown>>[];
  edges: Edge[];
  onClose: () => void;
}

export default function LiveTestPanel({ nodes, edges, onClose }: LiveTestPanelProps) {
  const [messages, setMessages] = useState<TestMsg[]>([]);
  const [userInput, setUserInput] = useState("");
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const resumeRef = useRef<((val: string) => void) | null>(null);
  const varsRef = useRef<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMsg = useCallback((role: TestMsg["role"], text: string) => {
    setMessages((m) => [...m, { role, text }]);
  }, []);

  const edgesBySource = useMemo(() => {
    const map: Record<string, Edge[]> = {};
    for (const e of edges) {
      if (!map[e.source]) map[e.source] = [];
      map[e.source].push(e);
    }
    return map;
  }, [edges]);

  const nodeById = useMemo(() => {
    const map: Record<string, Node<Record<string, unknown>>> = {};
    for (const n of nodes) map[n.id] = n;
    return map;
  }, [nodes]);

  // Find next node — respects sourceHandle/condition matching
  function findNext(nodeId: string, condition?: string): string | null {
    const outEdges = edgesBySource[nodeId] || [];
    if (condition) {
      const matched = outEdges.find(
        (e) => e.sourceHandle === condition || (e.data as Record<string, unknown>)?.condition === condition
      );
      if (matched) return matched.target;
    }
    // Default: first edge without a condition or with "default" handle
    const def = outEdges.find(
      (e) => !e.sourceHandle || e.sourceHandle === "default"
    );
    return def?.target || outEdges[0]?.target || null;
  }

  const interpolate = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => varsRef.current[k] ?? `{{${k}}}`);

  const processNodeRef = useRef<(nodeId: string) => Promise<void>>();
  processNodeRef.current = async function processNode(nodeId: string): Promise<void> {
    const node = nodeById[nodeId];
    if (!node) { setDone(true); return; }
    const d = node.data;

    switch (node.type) {
      case "start": {
        await sleep(200);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "say": {
        const text = interpolate(String(d.text || "..."));
        addMsg("bot", text);
        await sleep(400);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "gather": {
        const prompt = interpolate(String(d.prompt || ""));
        if (prompt) addMsg("bot", prompt);
        setAwaitingInput(true);
        setTimeout(() => inputRef.current?.focus(), 50);
        const userReply = await new Promise<string>((resolve) => {
          resumeRef.current = resolve;
        });
        addMsg("user", userReply);
        setAwaitingInput(false);
        const saveVar = String(d.saveResponseTo || "userInput");
        varsRef.current = { ...varsRef.current, [saveVar]: userReply, lastSpeechResult: userReply };
        await sleep(200);
        const next = findNext(nodeId, "success");
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "condition": {
        const condType = String(d.conditionType || "variable");

        if (condType === "keywords") {
          const branches = (d.branches || []) as Branch[];
          const lastInput = (varsRef.current.lastSpeechResult || "").toLowerCase();
          let matchedBranch: string | null = null;

          for (const branch of branches) {
            for (const kw of branch.keywords) {
              if (lastInput.includes(kw.toLowerCase())) {
                matchedBranch = branch.id;
                break;
              }
            }
            if (matchedBranch) break;
          }

          const branchName = matchedBranch
            ? branches.find((b) => b.id === matchedBranch)?.name || matchedBranch
            : "Default";
          addMsg("system", `Condition: keywords -> ${branchName}`);
          const next = findNext(nodeId, matchedBranch || "default");
          if (next) await processNodeRef.current!(next); else setDone(true);
        } else {
          // variable mode
          const variable = String(d.variable || "");
          const operator = String(d.operator || "equals");
          const value = String(d.value || "");
          const actual = varsRef.current[variable] ?? "";
          let matches = false;
          if (operator === "equals") matches = actual === value;
          else if (operator === "notEquals") matches = actual !== value;
          else if (operator === "contains") matches = actual.toLowerCase().includes(value.toLowerCase());
          else if (operator === "startsWith") matches = actual.toLowerCase().startsWith(value.toLowerCase());
          else if (operator === "greaterThan") matches = Number(actual) > Number(value);
          else if (operator === "lessThan") matches = Number(actual) < Number(value);

          addMsg("system", `${variable} ${operator} "${value}" -> ${matches ? "true" : "false"}`);
          const next = findNext(nodeId, matches ? "true" : "false");
          if (next) await processNodeRef.current!(next); else setDone(true);
        }
        break;
      }
      case "setVariable": {
        const varName = String(d.variableName || "");
        const val = interpolate(String(d.value || ""));
        varsRef.current = { ...varsRef.current, [varName]: val };
        addMsg("system", `Set ${varName} = "${val}"`);
        await sleep(100);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "wait": {
        addMsg("system", `Wait ${d.duration ?? 1}s`);
        await sleep(300);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "transfer": {
        if (d.announcement) addMsg("bot", interpolate(String(d.announcement)));
        addMsg("system", `Transfer -> ${d.destination || "?"}`);
        setDone(true);
        break;
      }
      case "apiCall": {
        addMsg("system", `API ${d.method || "GET"} ${d.url || "?"}`);
        if (d.saveResponseTo) {
          varsRef.current = { ...varsRef.current, [String(d.saveResponseTo)]: '{"status":"ok"}' };
          addMsg("system", `  -> Saved to ${d.saveResponseTo}`);
        }
        await sleep(300);
        const next = findNext(nodeId, "success");
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "record": {
        addMsg("system", `Recording ${d.action || "start"}`);
        await sleep(200);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "scheduleCallback": {
        addMsg("system", `Callback scheduled (${d.priority || "normal"} priority)`);
        await sleep(200);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "updateLead": {
        addMsg("system", `Lead -> "${d.status || "?"}`);
        await sleep(150);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
        break;
      }
      case "end": {
        const msg = interpolate(String(d.message || ""));
        if (msg) addMsg("bot", msg);
        addMsg("system", "Call ended");
        setDone(true);
        break;
      }
      default: {
        addMsg("system", `[${node.type}] (unsupported)`);
        const next = findNext(nodeId);
        if (next) await processNodeRef.current!(next); else setDone(true);
      }
    }
  };

  function startTest() {
    setStarted(true);
    setMessages([]);
    setDone(false);
    varsRef.current = {};
    const startNode = nodes.find((n) => n.type === "start");
    if (!startNode) {
      addMsg("system", "No Start node. Add one to run the test.");
      setDone(true);
      return;
    }
    addMsg("system", "Simulation started");
    processNodeRef.current!(startNode.id).catch((err) => {
      addMsg("system", `Error: ${err.message}`);
      setDone(true);
    });
  }

  function handleSend() {
    const val = userInput.trim();
    if (!val || !awaitingInput) return;
    setUserInput("");
    if (resumeRef.current) {
      resumeRef.current(val);
      resumeRef.current = null;
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="w-80 flex-shrink-0 bg-white border border-neutral-200 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-green-500" />
          <span className="text-sm font-semibold text-neutral-800">Live Test</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {!started ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Play className="w-8 h-8 text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-500 mb-4">
              Test your scenario flow interactively
            </p>
            <button
              onClick={startTest}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Start Test
            </button>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded-lg max-w-[90%] ${
                  msg.role === "bot"
                    ? "bg-blue-50 text-blue-800 self-start"
                    : msg.role === "user"
                    ? "bg-neutral-100 text-neutral-800 ml-auto"
                    : "bg-neutral-50 text-neutral-500 text-[11px] italic"
                }`}
                style={{
                  display: "block",
                  marginLeft: msg.role === "user" ? "auto" : undefined,
                }}
              >
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input & controls */}
      {started && (
        <div className="border-t border-neutral-100 px-3 py-3 flex-shrink-0 space-y-2">
          {done && (
            <button
              onClick={startTest}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart Test
            </button>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              disabled={!awaitingInput}
              placeholder={
                awaitingInput ? "Type your response..." : done ? "Test complete" : "Waiting..."
              }
              className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <button
              onClick={handleSend}
              disabled={!awaitingInput || !userInput.trim()}
              className="p-2 bg-[#F22F46] text-white rounded-lg hover:bg-[#d9243b] disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
