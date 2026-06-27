"use client";

/**
 * useBranding — tenant-level white-label config.
 *
 * Reads optional `branding` subfield from the user's company doc:
 *   {
 *     productName:  string,   // "Voximplant Intelligence"
 *     logoUrl:      string,   // https://... (PNG/SVG)
 *     primaryColor: string,   // "#FF6B00"
 *     accentColor:  string,   // optional secondary
 *     footerText:   string,   // "Powered by Voximplant"
 *     loginTagline: string,   // shown on /login
 *   }
 *
 * Falls back to VoiceFlow defaults when no override is present so untenanted
 * environments and dev still look the same.
 *
 * Companion: <BrandingApply /> writes the CSS custom properties on :root.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

export interface Branding {
  productName:  string;
  logoUrl:      string | null;
  primaryColor: string;   // CSS color
  accentColor:  string;
  footerText:   string;
  loginTagline: string;
}

export const DEFAULT_BRANDING: Branding = {
  productName:  "VoiceFlow AI",
  logoUrl:      null,
  primaryColor: "#F22F46",          // matches existing accent throughout the app
  accentColor:  "#7C3AED",
  footerText:   "",
  loginTagline: "Phone-bot platform for businesses that can't keep up with calls.",
};

interface CompanyDoc {
  branding?: Partial<Branding>;
}

interface UserDoc {
  companyId?: string;
}

export function useBranding(): { branding: Branding; loading: boolean } {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [override, setOverride]   = useState<Partial<Branding>>({});
  const [loading, setLoading]     = useState(true);

  // Step 1: subscribe to the user doc to learn their companyId.
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? (snap.data() as UserDoc) : {};
      setCompanyId(data.companyId || user.uid);   // self-tenant fallback
    }, () => setCompanyId(null));
    return unsub;
  }, [user?.uid]);

  // Step 2: subscribe to that company's branding subfield.
  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, "Company", companyId), (snap) => {
      const data = snap.exists() ? (snap.data() as CompanyDoc) : {};
      setOverride(data.branding || {});
      setLoading(false);
    }, () => { setOverride({}); setLoading(false); });
    return unsub;
  }, [companyId]);

  const branding: Branding = { ...DEFAULT_BRANDING, ...override };
  return { branding, loading };
}
