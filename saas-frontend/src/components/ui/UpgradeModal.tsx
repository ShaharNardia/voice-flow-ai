"use client";

import { useState } from "react";
import { X, Check, Zap, Loader2 } from "lucide-react";
import { createCheckoutSession } from "@/lib/firebase-functions";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

const PRO_FEATURES = [
  "10 AI assistants",
  "2,000 call minutes/month",
  "5,000 leads",
  "10 campaigns",
  "Full calendar & appointments",
  "Knowledge base (5 files)",
  "Advanced analytics",
  "WhatsApp integration",
  "Full call history",
  "Priority support",
];

const BASIC_FEATURES = [
  "1 AI assistant",
  "50 call minutes/month",
  "100 leads",
  "Last 10 calls only",
];

export function UpgradeModal({ open, onClose, featureName }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "";
      if (!priceId) {
        alert("Stripe price ID not configured. Contact support.");
        return;
      }
      const { url } = await createCheckoutSession({
        priceId,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing`,
      });
      window.location.href = url;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start checkout");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-8 pb-0 text-center">
          <div className="inline-flex items-center gap-2 bg-red-50 text-[#F22F46] text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <Zap className="w-3.5 h-3.5" />
            {featureName ? `Unlock ${featureName}` : "Upgrade to PRO"}
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">
            Unlock the Full Power of VoiceFlow AI
          </h2>
          <p className="text-neutral-500 mt-2 text-sm">
            Join 500+ businesses automating their sales calls with AI
          </p>
        </div>

        {/* Plans comparison */}
        <div className="grid grid-cols-2 gap-4 p-8">
          {/* BASIC */}
          <div className="border border-neutral-200 rounded-xl p-5">
            <div className="text-sm font-semibold text-neutral-500 mb-1">BASIC</div>
            <div className="text-xl font-bold text-neutral-900 mb-4">Free Forever</div>
            <ul className="space-y-2">
              {BASIC_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-500">
                  <span className="text-neutral-300 mt-0.5">✗</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* PRO */}
          <div className="border-2 border-[#F22F46] rounded-xl p-5 relative shadow-sm">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F22F46] text-white text-xs font-bold px-3 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <div className="text-sm font-semibold text-[#F22F46]">PRO</div>
            </div>
            <div className="text-xl font-bold text-neutral-900 mb-1">
              $99<span className="text-sm font-normal text-neutral-400">/mo</span>
            </div>
            <div className="text-xs text-emerald-600 font-medium mb-4">✓ 14-day free trial</div>
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA */}
        <div className="px-8 pb-8 text-center space-y-3">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Redirecting to checkout..." : "Start 14-day Free Trial — $0 today"}
          </button>
          <p className="text-xs text-neutral-400">
            No credit card required to start. Cancel anytime.
          </p>
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-600 underline"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
