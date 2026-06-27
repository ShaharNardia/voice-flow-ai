"use client";

/**
 * Dismissible first-run banner pointing users at the voice-enabled
 * assistant wizard. Hides itself once dismissed (per-browser, localStorage)
 * or once the tenant already has at least one assistant.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Mic, X } from "lucide-react";

const KEY = "vf_wizard_banner_dismissed_v1";

export default function WizardWelcomeBanner({ assistantCount }: { assistantCount: number }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed === null) return null;          // still reading localStorage
  if (dismissed) return null;
  if (assistantCount > 0) return null;          // already has assistants — not first run

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="relative bg-gradient-to-r from-[#F22F46] via-[#d9243b] to-violet-600 text-white rounded-xl p-5 mb-6 shadow-sm overflow-hidden">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-white/70 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-4">
        <div className="bg-white/15 rounded-lg p-2.5 flex items-center justify-center">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-1">Build your first phone-bot — just talk to the wizard.</h2>
          <p className="text-sm text-white/85 mb-3 max-w-2xl">
            Hold the mic and describe your business. The wizard picks a voice, writes the system prompt,
            and configures the bot — you don&apos;t touch a form.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assistants/new/wizard"
              className="inline-flex items-center gap-2 bg-white text-[#F22F46] hover:bg-white/90 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <Mic className="w-4 h-4" />
              Talk to the wizard
            </Link>
            <Link
              href="/assistants/new"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Build manually
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
