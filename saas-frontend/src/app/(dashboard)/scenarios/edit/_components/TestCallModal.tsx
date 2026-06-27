"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Phone, Loader2, X, PhoneOff, PhoneCall, CheckCircle2, AlertCircle } from "lucide-react";
import ExecutionTrace, { type LogEntry } from "./shared/ExecutionTrace";
import { doc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { placeCall } from "@/lib/firebase-functions";

interface TestCallModalProps {
  scenarioId: string;
  onSave: () => Promise<boolean>; // returns true if save succeeded
  onClose: () => void;
}

const STORAGE_KEY = "voiceflow_test_phone";

type CallStatus = "idle" | "saving" | "calling" | "initiated" | "ringing" | "answered" | "in-progress" | "completed" | "failed" | "busy" | "no-answer" | "canceled";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; animate?: boolean }> = {
  idle: { label: "Ready", color: "#6B7280", icon: "" },
  saving: { label: "Saving scenario...", color: "#3B82F6", icon: "", animate: true },
  calling: { label: "Placing call...", color: "#3B82F6", icon: "", animate: true },
  initiated: { label: "Call initiated", color: "#3B82F6", icon: "📞" },
  ringing: { label: "Ringing your phone...", color: "#F59E0B", icon: "🔔", animate: true },
  "in-progress": { label: "Call in progress", color: "#10B981", icon: "🟢" },
  answered: { label: "Connected — interact with the scenario", color: "#10B981", icon: "🟢" },
  completed: { label: "Call completed", color: "#6B7280", icon: "✅" },
  failed: { label: "Call failed", color: "#EF4444", icon: "❌" },
  busy: { label: "Line busy", color: "#F59E0B", icon: "📵" },
  "no-answer": { label: "No answer", color: "#F59E0B", icon: "📵" },
};

export default function TestCallModal({ scenarioId, onSave, onClose }: TestCallModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(STORAGE_KEY) || "";
    return "";
  });
  const [fromNumbers, setFromNumbers] = useState<{ sid: string; phoneNumber: string; friendlyName: string }[]>([]);
  const [selectedFrom, setSelectedFrom] = useState("");
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState("");
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [executionLog, setExecutionLog] = useState<LogEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Load available FROM numbers from Firestore phone_numbers collection
  useEffect(() => {
    getDocs(collection(db, "phone_numbers"))
      .then((snap) => {
        const nums = snap.docs.map((d) => {
          const data = d.data();
          return {
            sid: data.sid || d.id,
            phoneNumber: data.phoneNumber || d.id,
            friendlyName: data.friendlyName || "",
          };
        });
        setFromNumbers(nums);
        if (nums.length > 0) setSelectedFrom(nums[0].phoneNumber);
      })
      .catch(() => setFromNumbers([]))
      .finally(() => setLoadingNumbers(false));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // Subscribe to call session status
  const subscribeToSession = useCallback((sessionId: string) => {
    if (unsubRef.current) unsubRef.current();

    unsubRef.current = onSnapshot(doc(db, "call_sessions", sessionId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const newStatus = (data.status || data.callStatus || "initiated") as string;

      setStatus(newStatus as CallStatus);

      // Capture execution trace
      const log = data.executionLog;
      if (Array.isArray(log) && log.length > 0) {
        setExecutionLog(log as LogEntry[]);
      }

      // Start timer when answered
      if ((newStatus === "answered" || newStatus === "in-progress") && !timerRef.current) {
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      }

      // Stop timer when completed/failed
      if (["completed", "failed", "busy", "no-answer", "canceled"].includes(newStatus)) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    });
  }, []);

  const handleCall = async () => {
    // Validate & normalize phone number — auto-add + if missing
    let cleaned = phoneNumber.replace(/[\s\-()]/g, "");
    if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
    if (cleaned.length < 10) {
      setError("Enter a valid phone number (e.g., +972501234567)");
      return;
    }
    // Normalize FROM number
    let from = selectedFrom.replace(/[\s\-()]/g, "");
    if (!from.startsWith("+")) from = "+" + from;
    if (!from || from.length < 10) {
      setError("Enter a valid outbound phone number");
      return;
    }

    setError("");
    setDuration(0);
    setExecutionLog([]);

    // Step 1: Save scenario first
    setStatus("saving");
    try {
      const saved = await onSave();
      if (!saved) {
        setStatus("idle");
        setError("Fix scenario errors before testing");
        return;
      }
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Failed to save scenario");
      return;
    }

    // Step 2: Place call
    setStatus("calling");
    try {
      localStorage.setItem(STORAGE_KEY, phoneNumber);
      const result = await placeCall({
        number: cleaned,
        companyPhone: from,
        scenarioId,
        // Minimal assistant context for scenario-only calls
        // Backend reads "assistantJson" field for inline definitions
        assistantJson: {
          name: "Scenario Test",
          firstMessage: "",
          language: "he-IL",
          voice: "Google.he-IL-Wavenet-D",
        },
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      setCallSessionId(result.callSessionId);
      setStatus("initiated");
      subscribeToSession(result.callSessionId);
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "Failed to place call");
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const isActive = ["initiated", "ringing", "answered", "in-progress", "saving", "calling"].includes(status);
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-[#0D1117] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F22F46] rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Test Call</h2>
              <p className="text-[#8B949E] text-xs">Real call to test your scenario</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isActive && status !== "idle"}
            className="text-[#8B949E] hover:text-white transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Phone number input */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
              Your Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isActive}
              placeholder="+972501234567"
              className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:bg-neutral-50 disabled:text-neutral-400"
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              We'll call this number so you can interact with the scenario
            </p>
          </div>

          {/* FROM number */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
              Call From
            </label>
            {loadingNumbers ? (
              <div className="flex items-center gap-2 py-3 text-xs text-neutral-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading phone numbers...
              </div>
            ) : fromNumbers.length === 0 ? (
              <>
                <input
                  type="tel"
                  value={selectedFrom}
                  onChange={(e) => setSelectedFrom(e.target.value)}
                  disabled={isActive}
                  placeholder="+19179243285"
                  className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:bg-neutral-50 disabled:text-neutral-400"
                />
                <p className="mt-1 text-[11px] text-neutral-400">
                  Enter your Twilio phone number. Go to Phone Numbers to purchase one.
                </p>
              </>
            ) : (
              <select
                value={selectedFrom}
                onChange={(e) => setSelectedFrom(e.target.value)}
                disabled={isActive}
                className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] disabled:bg-neutral-50 bg-white"
              >
                {fromNumbers.map((n) => (
                  <option key={n.sid} value={n.phoneNumber}>
                    {n.phoneNumber} {n.friendlyName ? `(${n.friendlyName})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Status display */}
          {status !== "idle" && (
            <div
              className="p-4 rounded-xl border-2 text-center space-y-2"
              style={{ borderColor: statusCfg.color + "40", backgroundColor: statusCfg.color + "08" }}
            >
              <div className="flex items-center justify-center gap-2">
                {statusCfg.animate && <Loader2 className="w-4 h-4 animate-spin" style={{ color: statusCfg.color }} />}
                {!statusCfg.animate && statusCfg.icon && <span className="text-lg">{statusCfg.icon}</span>}
                <span className="text-sm font-medium" style={{ color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
              </div>

              {(status === "answered" || status === "in-progress" || status === "completed") && (
                <div className="text-2xl font-mono font-bold text-neutral-800">
                  {formatDuration(duration)}
                </div>
              )}

              {(status === "answered" || status === "in-progress") && (
                <p className="text-[11px] text-neutral-500">
                  Pick up your phone and interact with the scenario
                </p>
              )}

              {status === "completed" && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Test completed successfully
                </div>
              )}
            </div>
          )}

          {/* Execution trace */}
          {executionLog.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-1.5">
                Execution Trace
              </p>
              <ExecutionTrace entries={executionLog} maxHeight="200px" />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {status === "idle" || status === "completed" || status === "failed" || status === "busy" || status === "no-answer" ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 border border-neutral-200 text-neutral-600 py-3 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors"
                >
                  {status === "completed" ? "Done" : "Cancel"}
                </button>
                <button
                  onClick={handleCall}
                  disabled={!phoneNumber.trim() || !selectedFrom.trim()}
                  className="flex-1 bg-[#F22F46] hover:bg-[#d9243b] text-white py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <PhoneCall className="w-4 h-4" />
                  {status === "completed" || status === "failed" ? "Call Again" : "Call Me"}
                </button>
              </>
            ) : (
              <div className="flex-1 text-center">
                <p className="text-xs text-neutral-400 py-2">
                  {status === "saving" ? "Saving your latest changes..." :
                   status === "calling" ? "Connecting to Twilio..." :
                   "Call in progress — interact with your scenario on your phone"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
