"use client";

import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useFeatures, FEATURES } from "@/lib/features";

interface FeatureGateProps {
  featureId: string;
  children: ReactNode;
  /** Optional custom fallback UI. Defaults to a friendly "not enabled" card. */
  fallback?: ReactNode;
}

/**
 * Client-side gate. If the current user doesn't have `featureId` enabled,
 * renders a non-destructive "module not enabled" card instead of `children`.
 * Does NOT redirect — pages remain routable so admins can see the gate too.
 */
export function FeatureGate({ featureId, children, fallback }: FeatureGateProps) {
  const { loading, has } = useFeatures();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-pulse text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  if (has(featureId)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const label = FEATURES.find((f) => f.id === featureId)?.label || "This module";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-neutral-100 flex items-center justify-center">
          <Lock className="w-5 h-5 text-neutral-500" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">
          {label} isn&apos;t enabled
        </h2>
        <p className="text-sm text-neutral-600">
          This module hasn&apos;t been turned on for your account. Please contact your
          administrator if you need access.
        </p>
      </div>
    </div>
  );
}

export default FeatureGate;
