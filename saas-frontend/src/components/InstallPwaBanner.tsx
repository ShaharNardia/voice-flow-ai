"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { onInstallAvailable, promptInstall } from "@/lib/pwa";
import { useFeatures } from "@/lib/features";

const STORAGE_KEY = "voiceflow-install-dismissed";

/**
 * Fixed bottom-right banner inviting the user to install the PWA.
 * Hidden automatically once installed or after dismiss.
 */
export default function InstallPwaBanner() {
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { has } = useFeatures();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    return onInstallAvailable((ok) => setCanInstall(ok));
  }, []);

  if (!has("cap.pwaPush")) return null;
  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs bg-white border border-neutral-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
      <div className="w-8 h-8 bg-[#F22F46] rounded-lg flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-neutral-900 mb-0.5">Install VoiceFlow</div>
        <div className="text-xs text-neutral-500 mb-2">Launch from your home screen and get push reminders.</div>
        <div className="flex gap-2">
          <button
            onClick={async () => { await promptInstall(); }}
            className="bg-[#F22F46] hover:bg-[#d9243b] text-white text-xs font-medium px-3 py-1.5 rounded-md"
          >
            Install
          </button>
          <button
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, "1");
              setDismissed(true);
            }}
            className="text-xs text-neutral-500 hover:text-neutral-900 px-2"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        className="text-neutral-400 hover:text-neutral-600"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
