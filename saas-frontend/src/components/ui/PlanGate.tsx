"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { UpgradeModal } from "./UpgradeModal";
import type { PlanLimits } from "@/hooks/usePlan";

interface PlanGateProps {
  feature: keyof PlanLimits;
  featureName?: string;
  children: React.ReactNode;
  /** If true, show the children with an overlay instead of hiding them */
  showPreview?: boolean;
}

export function PlanGate({ feature, featureName, children, showPreview = true }: PlanGateProps) {
  const { canAccess, loading } = usePlan();
  const [showModal, setShowModal] = useState(false);

  if (loading) return <>{children}</>;
  if (canAccess(feature)) return <>{children}</>;

  if (!showPreview) {
    return (
      <>
        <UpgradeModal open={showModal} onClose={() => setShowModal(false)} featureName={featureName} />
        <div
          className="flex flex-col items-center justify-center py-20 gap-4 cursor-pointer"
          onClick={() => setShowModal(true)}
        >
          <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Lock className="w-6 h-6 text-neutral-400" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-neutral-800">{featureName || "Premium Feature"}</div>
            <div className="text-sm text-neutral-500 mt-1">Upgrade to PRO to unlock this feature</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
            className="bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Upgrade to PRO →
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <UpgradeModal open={showModal} onClose={() => setShowModal(false)} featureName={featureName} />
      <div className="relative">
        {/* Blurred preview of the content */}
        <div className="pointer-events-none select-none" style={{ filter: "blur(4px)", opacity: 0.5 }}>
          {children}
        </div>
        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/70 backdrop-blur-sm rounded-xl">
          <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Lock className="w-6 h-6 text-neutral-400" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-neutral-800">{featureName || "Premium Feature"}</div>
            <div className="text-sm text-neutral-500 mt-1">Upgrade to PRO to unlock this feature</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Upgrade to PRO →
          </button>
        </div>
      </div>
    </>
  );
}
