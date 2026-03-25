"use client";

import { useState, useEffect } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

export type PlanName = "basic" | "pro" | "scale";

export interface PlanLimits {
  assistants: number;
  minutesPerMonth: number;
  leads: number;
  campaigns: number;
  knowledgeBase: boolean;
  analytics: boolean;
  calendar: boolean;
  whatsapp: boolean;
  callHistoryLimit: number | null;
}

export interface PlanUsage {
  minutesUsed: number;
  assistantCount: number;
  leadCount: number;
  campaignCount: number;
  callCount: number;
}

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  basic: {
    assistants: 1,
    minutesPerMonth: 50,
    leads: 100,
    campaigns: 0,
    knowledgeBase: false,
    analytics: false,
    calendar: false,
    whatsapp: false,
    callHistoryLimit: 10,
  },
  pro: {
    assistants: 10,
    minutesPerMonth: 2000,
    leads: 5000,
    campaigns: 10,
    knowledgeBase: true,
    analytics: true,
    calendar: true,
    whatsapp: true,
    callHistoryLimit: null,
  },
  scale: {
    assistants: 999,
    minutesPerMonth: 10000,
    leads: 999999,
    campaigns: 999,
    knowledgeBase: true,
    analytics: true,
    calendar: true,
    whatsapp: true,
    callHistoryLimit: null,
  },
};

export function usePlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanName>("basic");
  const [loading, setLoading] = useState(true);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditExpiresAt, setCreditExpiresAt] = useState<Date | null>(null);
  const [creditGranted, setCreditGranted] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Migration compat: if plan field absent, derive from subscribed boolean
        let resolvedPlan: PlanName = "basic";
        if (data.plan === "pro" || data.plan === "scale" || data.plan === "basic") {
          resolvedPlan = data.plan as PlanName;
        } else if (data.subscribed === true) {
          resolvedPlan = "pro";
        }
        setPlan(resolvedPlan);
        // Credit info (basic plan users)
        setCreditGranted(Boolean(data.creditGranted));
        setCreditBalance(typeof data.creditBalance === "number" ? data.creditBalance : null);
        if (data.creditExpiresAt?.toDate) {
          setCreditExpiresAt(data.creditExpiresAt.toDate());
        } else if (data.creditExpiresAt) {
          setCreditExpiresAt(new Date(data.creditExpiresAt));
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const limits = PLAN_LIMITS[plan];

  return {
    plan,
    loading,
    isPro: plan === "pro" || plan === "scale",
    isBasic: plan === "basic",
    limits,
    // Credit info for basic plan users
    creditGranted,
    creditBalance,
    creditExpiresAt,
    canAccess: (feature: keyof PlanLimits): boolean => {
      const val = limits[feature];
      if (typeof val === "boolean") return val;
      if (typeof val === "number") return val > 0;
      return val !== null && val !== undefined;
    },
    PLAN_LIMITS,
  };
}
