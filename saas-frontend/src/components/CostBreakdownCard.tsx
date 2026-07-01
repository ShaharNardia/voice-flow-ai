"use client";

import { DollarSign } from "lucide-react";

// Shared cost model + card. IMPORTANT: this exposes the operator's REAL provider
// cost + profit, so it must only ever be rendered inside the Admin area — never
// on the customer-facing call-detail page.
export interface CostBreakdown {
  twilio?: { minutes?: number; cost?: number };
  llm?: { promptTokens?: number; completionTokens?: number; turns?: number; cost?: number };
  stt?: { minutes?: number; cost?: number };
  tts?: { characters?: number; provider?: string; cost?: number };
  realtime?: { inputMinutes?: number; outputMinutes?: number; cost?: number };
  breakdown?: Array<{ provider?: string; label?: string; cost?: number; detail?: string }>;
  provider?: string;
  model?: string;
  inputCost?: number;
  outputCost?: number;
  twilioCost?: number;
  geminiCost?: number;
  durationSec?: number;
  totalCost?: number;
  customerCharge?: number;
  pricingModel?: string;
  pricingValue?: number;
  currency?: string;
  mode?: string;
}

export function CostBreakdownCard({ costs }: { costs: CostBreakdown }) {
  const curr = costs.currency || "USD";
  const fmt = (n: number | undefined) => {
    if (n == null) return "—";
    const s = n.toFixed(n < 0.01 ? 6 : n < 1 ? 4 : 2);
    return curr === "USD" ? `$${s}` : `${s} ${curr}`;
  };
  const rows: Array<{ label: string; detail?: string; cost?: number }> = [];

  if (Array.isArray(costs.breakdown) && costs.breakdown.length > 0) {
    for (const b of costs.breakdown) {
      rows.push({
        label:  b.label || b.provider || "(unnamed)",
        detail: b.detail,
        cost:   typeof b.cost === "number" ? b.cost : undefined,
      });
    }
  }

  const hasBreakdown = rows.length > 0;
  if (!hasBreakdown) {
    if (costs.twilio?.cost != null) rows.push({ label: "Twilio (call minutes)", detail: `${costs.twilio.minutes?.toFixed(2) ?? "?"} min`, cost: costs.twilio.cost });
    if (costs.realtime?.cost != null) rows.push({ label: "OpenAI Realtime (voice-to-voice)", detail: `in ${costs.realtime.inputMinutes?.toFixed(2) ?? 0}m / out ${costs.realtime.outputMinutes?.toFixed(2) ?? 0}m`, cost: costs.realtime.cost });
    if (costs.llm?.cost) rows.push({ label: "LLM (OpenAI)", detail: `${(costs.llm.promptTokens ?? 0) + (costs.llm.completionTokens ?? 0)} tokens · ${costs.llm.turns ?? 0} turns`, cost: costs.llm.cost });
    if (costs.stt?.cost) rows.push({ label: "STT (Deepgram)", detail: `${costs.stt.minutes?.toFixed(2) ?? "?"} min`, cost: costs.stt.cost });
    if (costs.tts?.cost) rows.push({ label: `TTS (${costs.tts.provider || "?"})`, detail: `${costs.tts.characters ?? 0} chars`, cost: costs.tts.cost });
  }

  const total = costs.totalCost ?? 0;
  const charge = costs.customerCharge ?? 0;
  const profit = charge - total;
  const markupText = costs.pricingModel === "markup"
    ? `${costs.pricingValue ?? 0}% markup`
    : costs.pricingModel === "fixed"
      ? `$${costs.pricingValue ?? 0}/min flat`
      : "";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mt-4">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-neutral-800 text-sm">Cost Breakdown</h2>
          {costs.mode === "realtime" && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">REALTIME</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-400">Total cost</div>
          <div className="text-lg font-bold text-neutral-900">{fmt(total)}</div>
        </div>
      </div>
      <div className="p-5 space-y-2">
        {rows.length === 0 ? (
          <p className="text-neutral-400 text-sm text-center py-4">No cost data recorded for this call.</p>
        ) : rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex-1">
              <div className="text-neutral-700">{r.label}</div>
              {r.detail && <div className="text-xs text-neutral-400">{r.detail}</div>}
            </div>
            <div className="font-mono text-neutral-800 tabular-nums">{fmt(r.cost)}</div>
          </div>
        ))}
        {(charge > 0 || markupText) && (
          <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div>
                <div className="text-neutral-700 font-medium">Customer charge</div>
                {markupText && <div className="text-xs text-neutral-400">{markupText}</div>}
              </div>
              <div className="font-mono text-emerald-600 font-semibold tabular-nums">{fmt(charge)}</div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="text-neutral-500">Profit</div>
              <div className={`font-mono tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(profit)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
