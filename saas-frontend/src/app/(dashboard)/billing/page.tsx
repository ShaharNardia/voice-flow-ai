"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, ExternalLink, Zap, CreditCard, TrendingUp, Clock, Users } from "lucide-react";
import { usePlan } from "@/hooks/usePlan";
import { UsageMeter } from "@/components/ui/UsageMeter";
import { createCheckoutSession, createBillingPortalSession, getUserPlan } from "@/lib/firebase-functions";

interface Usage {
  minutesUsed: number;
  assistantCount: number;
  leadCount: number;
  campaignCount: number;
  callCount: number;
}

const COMPARISON = [
  { feature: "AI Assistants", basic: "1", pro: "10", scale: "Unlimited" },
  { feature: "Call minutes/month", basic: "50", pro: "2,000", scale: "10,000" },
  { feature: "Leads", basic: "100", pro: "5,000", scale: "Unlimited" },
  { feature: "Campaigns", basic: "—", pro: "10", scale: "Unlimited" },
  { feature: "Calendar & appointments", basic: "—", pro: "✓", scale: "✓" },
  { feature: "Knowledge base", basic: "—", pro: "✓", scale: "✓" },
  { feature: "Analytics", basic: "—", pro: "✓", scale: "✓" },
  { feature: "WhatsApp", basic: "—", pro: "✓", scale: "✓" },
  { feature: "Call history", basic: "Last 10", pro: "Full", scale: "Full" },
  { feature: "Support", basic: "Email", pro: "Priority", scale: "Dedicated" },
];

export default function BillingPage() {
  const { plan, isPro, limits, loading: planLoading } = usePlan();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<"pro" | "scale" | null>(null);

  useEffect(() => {
    getUserPlan()
      .then((data) => setUsage(data.usage as Usage))
      .catch(() => {});
  }, []);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await createBillingPortalSession({ returnUrl: window.location.href });
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  };

  const startCheckout = async (tier: "pro" | "scale") => {
    setCheckoutLoading(tier);
    try {
      const priceId = tier === "pro"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || ""
        : process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID || "";
      if (!priceId) { alert("Stripe price ID not configured. Contact support."); setCheckoutLoading(null); return; }
      const { url } = await createCheckoutSession({
        priceId,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing`,
      });
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start checkout");
      setCheckoutLoading(null);
    }
  };

  if (planLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-neutral-900">Billing & Plan</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Manage your subscription and track usage</p>
      </div>

      {/* ── Current plan card ── */}
      {isPro ? (
        /* PRO / SCALE — management view */
        <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F22F46]/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#F22F46]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-neutral-900 capitalize">{plan} Plan</h3>
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">Active</span>
                </div>
                <p className="text-sm text-neutral-500 mt-0.5">
                  {plan === "pro" ? "$99/month" : "$249/month"} · Renews automatically
                </p>
              </div>
            </div>
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="flex items-center gap-2 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage Subscription
            </button>
          </div>

          {usage && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-neutral-100">
              <UsageMeter used={usage.minutesUsed} max={limits.minutesPerMonth} label="Call minutes this month" />
              <UsageMeter used={usage.assistantCount} max={limits.assistants} label="Assistants" />
              <UsageMeter used={usage.leadCount} max={limits.leads} label="Leads" />
            </div>
          )}
        </div>
      ) : (
        /* BASIC — upgrade prompt view */
        <>
          {/* Current plan summary */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-neutral-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-900">BASIC Plan</h3>
                    <span className="bg-neutral-100 text-neutral-600 text-xs font-semibold px-2 py-0.5 rounded-full">Free</span>
                  </div>
                  <p className="text-sm text-neutral-500 mt-0.5">Free forever — upgrade anytime</p>
                </div>
              </div>
            </div>

            {usage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UsageMeter used={usage.minutesUsed} max={50} label="Call minutes this month" />
                <UsageMeter used={usage.assistantCount} max={1} label="Assistants" />
                <UsageMeter used={usage.leadCount} max={100} label="Leads" />
                <div className="flex items-center gap-3 bg-neutral-50 rounded-lg p-3">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-neutral-700">{usage.callCount} calls made</div>
                    <div className="text-xs text-neutral-400">this month</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PRO upgrade card */}
          <div className="bg-gradient-to-br from-[#F22F46]/5 to-[#F22F46]/10 border-2 border-[#F22F46] rounded-xl p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-[#F22F46] text-white text-xs font-bold px-3 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 bg-[#F22F46] rounded-xl flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-lg">Upgrade to PRO</h3>
                <p className="text-neutral-600 text-sm mt-0.5">
                  10x your capacity · $99/month · <span className="text-emerald-600 font-semibold">14-day free trial</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-6">
              {["10 AI assistants", "2,000 minutes/month", "5,000 leads", "10 campaigns", "Calendar & appointments", "Knowledge base", "Advanced analytics", "WhatsApp integration"].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-neutral-700">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <button
              onClick={() => startCheckout("pro")}
              disabled={checkoutLoading !== null}
              className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#F22F46]/20"
            >
              {checkoutLoading === "pro" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {checkoutLoading === "pro" ? "Redirecting..." : "Start 14-day Free Trial — $0 today"}
            </button>
            <p className="text-center text-xs text-neutral-400 mt-2">No credit card required to start. Cancel anytime.</p>
          </div>
        </>
      )}

      {/* ── Plan comparison table ── */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-neutral-100">
          <h3 className="font-semibold text-neutral-800 text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-neutral-400" />
            Plan Comparison
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="text-left px-6 py-3 text-neutral-500 font-medium">Feature</th>
                <th className="text-center px-4 py-3 text-neutral-600 font-semibold">BASIC<br /><span className="font-normal text-neutral-400 text-xs">Free</span></th>
                <th className="text-center px-4 py-3 text-[#F22F46] font-semibold bg-[#F22F46]/5">PRO<br /><span className="font-normal text-neutral-500 text-xs">$99/mo</span></th>
                <th className="text-center px-4 py-3 text-neutral-600 font-semibold">SCALE<br /><span className="font-normal text-neutral-400 text-xs">$249/mo</span></th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "bg-neutral-50/50" : ""}>
                  <td className="px-6 py-3 text-neutral-700">{row.feature}</td>
                  <td className="text-center px-4 py-3 text-neutral-500">{row.basic}</td>
                  <td className="text-center px-4 py-3 font-medium text-neutral-800 bg-[#F22F46]/5">{row.pro}</td>
                  <td className="text-center px-4 py-3 text-neutral-500">{row.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isPro && (
          <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between bg-neutral-50">
            <div>
              <div className="text-sm font-semibold text-neutral-800">Ready to upgrade?</div>
              <div className="text-xs text-neutral-500">Join 500+ businesses automating their sales calls</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => startCheckout("pro")}
                disabled={checkoutLoading !== null}
                className="bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {checkoutLoading === "pro" && <Loader2 className="w-4 h-4 animate-spin" />}
                Get PRO
              </button>
              <button
                onClick={() => startCheckout("scale")}
                disabled={checkoutLoading !== null}
                className="border border-neutral-200 hover:bg-white text-neutral-700 font-medium px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {checkoutLoading === "scale" && <Loader2 className="w-4 h-4 animate-spin" />}
                Get SCALE
              </button>
            </div>
          </div>
        )}
      </div>

      {isPro && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-neutral-400" />
            <h3 className="font-semibold text-neutral-800 text-sm">Payment Method</h3>
          </div>
          <p className="text-sm text-neutral-500 mb-3">Manage payment methods, download invoices, and update billing info.</p>
          <button onClick={openPortal} disabled={portalLoading} className="text-[#0066CC] hover:underline text-sm flex items-center gap-1">
            {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
            Open billing portal →
          </button>
        </div>
      )}
    </div>
  );
}
