"use client";

interface UsageMeterProps {
  used: number;
  // null = Unlimited. Meter renders "used / ∞" with a flat green bar.
  max: number | null;
  label: string;
  className?: string;
}

export function UsageMeter({ used, max, label, className = "" }: UsageMeterProps) {
  const isUnlimited = max === null || (typeof max === "number" && max < 0);
  const pct = isUnlimited ? 0 : (max && max > 0 ? Math.min((used / max) * 100, 100) : 0);
  const isWarning = !isUnlimited && pct >= 70 && pct < 85;
  const isDanger  = !isUnlimited && pct >= 85 && pct < 95;
  const isCritical = !isUnlimited && pct >= 95;

  const barColor = isCritical
    ? "bg-red-500"
    : isDanger
    ? "bg-red-400"
    : isWarning
    ? "bg-yellow-400"
    : "bg-emerald-500";

  const textColor = isCritical || isDanger ? "text-red-600" : isWarning ? "text-yellow-600" : "text-neutral-600";

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        <span className={`text-xs font-semibold ${textColor}`}>
          {used} / {isUnlimited ? "∞" : max}
        </span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${isCritical ? "animate-pulse" : ""}`}
          style={{ width: `${isUnlimited ? 8 : pct}%` }}
          title={isUnlimited ? "Unlimited" : undefined}
        />
      </div>
      {isCritical && !isUnlimited && (
        <p className="text-xs text-red-600 font-medium mt-1">
          ⚠️ Only {(max ?? 0) - used} {label.toLowerCase().includes("minute") ? "minutes" : "slots"} remaining!
        </p>
      )}
    </div>
  );
}
