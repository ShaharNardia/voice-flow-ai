"use client";

/**
 * BrandingApply — mount once at the top of the authenticated app to inject
 * the tenant's brand into CSS custom properties on :root, plus update the
 * document title to use their productName.
 *
 * Existing components keep using the hardcoded #F22F46 colors via Tailwind;
 * those won't pick up the tenant brand. The custom props (--brand-primary,
 * --brand-accent) become available for new components and for one-off
 * overrides like the Sidebar logo block.
 *
 * No visible markup; just a side-effect component.
 */

import { useEffect } from "react";
import { useBranding } from "@/hooks/useBranding";

export default function BrandingApply() {
  const { branding } = useBranding();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const r = document.documentElement;
    r.style.setProperty("--brand-primary", branding.primaryColor);
    r.style.setProperty("--brand-accent",  branding.accentColor);
    if (branding.productName) document.title = branding.productName;
  }, [branding.primaryColor, branding.accentColor, branding.productName]);

  return null;
}
