"use client";

/**
 * Operator Console — single landing page that stitches every admin
 * capability into a coherent product surface. Designed for the
 * Voximplant demo: when Kate sees "/admin/console", she sees ONE thing
 * called "Operator Console" with eight live tiles, not eight separate
 * URLs to remember.
 *
 * Each tile shows a live signal (count, status, last activity) and links
 * to the full page for that capability. Tiles are auto-discoverable —
 * adding a new admin page means adding one entry to TILES below.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBranding } from "@/hooks/useBranding";
import { adminHealthCheck, type HealthCheck } from "@/lib/firebase-functions";
import {
  Settings, Wrench, Mic2, Heart, ScrollText, Key,
  Palette, Phone, ChevronRight, Sparkles, Activity,
} from "lucide-react";

interface Tile {
  href:        string;
  label:       string;
  description: string;
  icon:        React.ElementType;
  accent:      string;
}

const TILES: Tile[] = [
  { href: "/admin/policies",   label: "Policies",         description: "Live voice rules, silence thresholds, goodbye patterns.",     icon: Settings,    accent: "#F22F46" },
  { href: "/admin/tools",      label: "Tools Library",    description: "Define HTTP tools assistants can call. Test live.",          icon: Wrench,      accent: "#7C3AED" },
  { href: "/admin/voices",     label: "Voice Library",    description: "Cloned voices across tenants. Preview, audit, revoke.",     icon: Mic2,        accent: "#0EA5E9" },
  { href: "/admin/health",     label: "Health",           description: "All 8 integrations, refreshed every 30s.",                   icon: Heart,       accent: "#10B981" },
  { href: "/admin/logs",       label: "Logs",             description: "Live tail of Cloud Run + Functions, filterable by call.",    icon: ScrollText,  accent: "#F59E0B" },
  { href: "/admin/api-keys",   label: "API Keys",         description: "Rotate secrets via Secret Manager. Audit trail.",            icon: Key,         accent: "#EF4444" },
  { href: "/admin/branding",   label: "Branding",         description: "White-label logo, colors, footer per tenant.",               icon: Palette,     accent: "#EC4899" },
  { href: "/admin/sip-setup",  label: "SIP Setup",        description: "Connect an Asterisk PBX in six guided steps.",               icon: Phone,       accent: "#6366F1" },
];

export default function OperatorConsolePage() {
  const { branding } = useBranding();
  const [healthResults, setHealthResults] = useState<HealthCheck[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminHealthCheck()
      .then((h) => { if (!cancelled) setHealthResults(h.results || []); })
      .catch(() => { /* ignore — health tile will show muted */ })
      .finally(() => { if (!cancelled) setHealthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const healthCounts = healthResults && {
    ok:       healthResults.filter((r) => r.status === "ok").length,
    degraded: healthResults.filter((r) => r.status === "degraded").length,
    down:     healthResults.filter((r) => r.status === "down").length,
    total:    healthResults.length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6" style={{ color: branding.primaryColor }} />
          Operator Console
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Everything you need to run {branding.productName} day-to-day — no engineering required.
        </p>
      </div>

      {/* Top status banner — single-glance system health */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-neutral-400 flex-shrink-0" />
          <div className="flex-1">
            {healthLoading ? (
              <div className="h-4 w-40 bg-neutral-200 rounded animate-pulse" />
            ) : healthCounts ? (
              <div className="text-sm">
                <span className="font-semibold text-neutral-900">{healthCounts.ok}/{healthCounts.total}</span>
                <span className="text-neutral-500"> integrations healthy</span>
                {healthCounts.degraded > 0 && (
                  <span className="ml-3 text-amber-600">• {healthCounts.degraded} degraded</span>
                )}
                {healthCounts.down > 0 && (
                  <span className="ml-3 text-red-600 font-medium">• {healthCounts.down} down</span>
                )}
              </div>
            ) : (
              <span className="text-sm text-neutral-400">Health unavailable</span>
            )}
          </div>
          <Link href="/admin/health" className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1">
            Details <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${t.accent}15` }}
              >
                <t.icon className="w-5 h-5" style={{ color: t.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-900">{t.label}</h3>
                  <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
                </div>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{t.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer hint */}
      <div className="mt-8 text-center text-xs text-neutral-400">
        Eight self-service capabilities. Zero engineering tickets.
      </div>
    </div>
  );
}
