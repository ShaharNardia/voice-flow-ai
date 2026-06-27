"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { createCheckoutSession } from "@/lib/firebase-functions";
import {
  Phone,
  Check,
  ChevronRight,
  Loader2,
  Zap,
  Building2,
  Users,
} from "lucide-react";

type Step = 1 | 2 | 3;

const INDUSTRIES = [
  "Real Estate",
  "Insurance",
  "Debt Collection",
  "Healthcare",
  "Financial Services",
  "Sales & Marketing",
  "Retail",
  "Other",
];

const CALL_VOLUMES = [
  "Less than 100/month",
  "100 – 500/month",
  "500 – 2,000/month",
  "2,000+/month",
];

const PRO_FEATURES = [
  "10 AI assistants",
  "2,000 minutes/month",
  "Automated campaigns",
  "CRM with 5,000 leads",
  "Calendar & appointments",
  "Knowledge base",
  "Advanced analytics",
  "WhatsApp messaging",
];

const BASIC_FEATURES = [
  { label: "1 AI assistant", included: true },
  { label: "50 call minutes/month", included: true },
  { label: "100 leads max", included: true },
  { label: "Last 10 calls visible", included: true },
  { label: "Campaigns", included: false },
  { label: "Calendar & analytics", included: false },
  { label: "Knowledge base", included: false },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [expectedCalls, setExpectedCalls] = useState("");
  const [saving, setSaving] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [checkingGuard, setCheckingGuard] = useState(true);

  // Guard: if already onboarded → dashboard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists() && snap.data()?.onboardingComplete === true) {
        router.replace("/dashboard");
      } else {
        setCheckingGuard(false);
      }
    });
  }, [user, authLoading, router]);

  const handleStartFree = () => setStep(2);

  const handleUpgradePro = async () => {
    setUpgradeLoading(true);
    try {
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "";
      if (!priceId) { alert("Stripe not configured yet. Continue with BASIC for now."); setUpgradeLoading(false); return; }
      const { url } = await createCheckoutSession({
        priceId,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/onboarding`,
      });
      window.location.href = url;
    } catch {
      alert("Failed to start checkout. Please try again.");
      setUpgradeLoading(false);
    }
  };

  const handleProfileContinue = () => {
    if (!companyName.trim()) return;
    setStep(3);
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        companyName: companyName.trim(),
        industry: industry || "Other",
        expectedCalls: expectedCalls || "Less than 100/month",
        onboardingComplete: true,
        plan: "basic",
        planUpdatedAt: serverTimestamp(),
      }, { merge: true });
      router.replace("/assistants/new");
    } catch {
      setSaving(false);
    }
  };

  if (authLoading || checkingGuard) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1117] to-[#161B22] flex items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-8 h-8 bg-[#F22F46] rounded-lg flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">VoiceFlow AI</span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                step > s ? "bg-[#F22F46] text-white" : step === s ? "bg-[#F22F46] text-white ring-4 ring-[#F22F46]/30" : "bg-[#21262D] text-[#484F58]"
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-[#F22F46]" : "bg-[#21262D]"}`} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Plan selection ── */}
        {step === 1 && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Welcome to VoiceFlow AI 🎙</h1>
              <p className="text-[#8B949E] text-base">Choose how you want to start — you can always upgrade later.</p>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* BASIC */}
              <div className="bg-[#161B22] border border-[#21262D] rounded-2xl p-6">
                <div className="text-[#8B949E] text-sm font-semibold mb-1">BASIC</div>
                <div className="text-3xl font-bold text-white mb-1">Free</div>
                <div className="text-[#484F58] text-xs mb-5">Forever, no credit card needed</div>
                <ul className="space-y-3 mb-6">
                  {BASIC_FEATURES.map((f) => (
                    <li key={f.label} className={`flex items-center gap-2 text-sm ${f.included ? "text-[#8B949E]" : "text-[#484F58] line-through"}`}>
                      <span className={f.included ? "text-emerald-500" : "text-[#30363D]"}>
                        {f.included ? "✓" : "✗"}
                      </span>
                      {f.label}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleStartFree}
                  className="w-full border border-[#30363D] hover:border-[#484F58] text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  Start Free with BASIC <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* PRO */}
              <div className="bg-[#161B22] border-2 border-[#F22F46] rounded-2xl p-6 relative">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#F22F46] text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-[#F22F46] text-sm font-semibold">PRO</div>
                  <div className="text-xs text-emerald-400 font-medium bg-emerald-400/10 px-2 py-0.5 rounded-full">14 days free</div>
                </div>
                <div className="text-3xl font-bold text-white mb-1">$99<span className="text-sm font-normal text-[#8B949E]">/mo</span></div>
                <div className="text-[#484F58] text-xs mb-5">after trial, cancel anytime</div>
                <ul className="space-y-3 mb-6">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[#8B949E]">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleUpgradePro}
                  disabled={upgradeLoading}
                  className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {upgradeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {upgradeLoading ? "Redirecting..." : "Start 14-day FREE Trial"}
                </button>
              </div>
            </div>

            <p className="text-center text-[#484F58] text-xs mt-6">
              Both plans include full access to the AI calling engine. Upgrade or downgrade anytime.
            </p>
          </div>
        )}

        {/* ── STEP 2: Business profile ── */}
        {step === 2 && (
          <div className="bg-[#161B22] border border-[#21262D] rounded-2xl p-8 max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#F22F46]/10 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#F22F46]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Tell us about your business</h2>
                <p className="text-[#8B949E] text-sm">Helps us personalize your experience</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Company Name <span className="text-[#F22F46]">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Real Estate"
                  className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#484F58] focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
                >
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                  Expected Monthly Calls
                </label>
                <select
                  value={expectedCalls}
                  onChange={(e) => setExpectedCalls(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
                >
                  <option value="">Select range...</option>
                  {CALL_VOLUMES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleProfileContinue}
              disabled={!companyName.trim()}
              className="w-full mt-6 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP 3: You're ready ── */}
        {step === 3 && (
          <div className="bg-[#161B22] border border-[#21262D] rounded-2xl p-8 max-w-lg mx-auto text-center">
            {/* Animated checkmark */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center animate-bounce">
                <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              You&apos;re all set, {user?.displayName?.split(" ")[0] || "there"}! 🎉
            </h2>
            <p className="text-[#8B949E] text-sm mb-6">
              Your account is ready. Start by building your first AI voice assistant.
            </p>

            {/* Plan summary */}
            <div className="bg-[#0D1117] border border-[#21262D] rounded-xl p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-[#8B949E]" />
                <span className="text-white text-sm font-semibold">Your BASIC Plan</span>
                <span className="ml-auto text-[#F22F46] text-xs font-medium">FREE</span>
              </div>
              <ul className="space-y-1.5">
                {BASIC_FEATURES.filter(f => f.included).map((f) => (
                  <li key={f.label} className="flex items-center gap-2 text-xs text-[#8B949E]">
                    <Check className="w-3 h-3 text-emerald-500" />
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {saving ? "Setting up..." : "Build my first AI assistant →"}
            </button>

            <p className="text-[#484F58] text-xs mt-4">
              Want more power?{" "}
              <a href="/billing" className="text-[#8B949E] hover:text-white underline transition-colors">
                Upgrade to PRO anytime from Billing →
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
