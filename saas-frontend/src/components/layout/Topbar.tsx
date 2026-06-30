"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/assistants": "Assistants",
  "/phone-numbers": "Phone Numbers",
  "/bench": "Bench — STT/TTS Validation",
  "/calls": "Calls",
  "/leads": "Leads",
  "/scenarios": "Scenarios",
  "/lessons": "English Tutor",
  "/analytics": "Analytics",
  "/billing": "Billing",
  "/settings": "Settings",
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps = {}) {
  const pathname = usePathname();
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading]     = useState(false);

  const title =
    Object.entries(PAGE_TITLES).find(([key]) =>
      pathname === key || (key !== "/dashboard" && pathname.startsWith(key)),
    )?.[1] ?? "VoiceFlow AI";

  // Listen for UPDATE_AVAILABLE message from the new service worker
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // One-shot guard: if we already reloaded for an update this browser session,
    // don't re-arm the banner from a lingering waiting worker — that's the loop
    // that made it "always show even after reload". Checked first so we don't
    // register a listener we then skip cleaning up.
    if (sessionStorage.getItem("vf_sw_reloaded") === "1") {
      sessionStorage.removeItem("vf_sw_reloaded");
      return;
    }

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "UPDATE_AVAILABLE") setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Check if a waiting SW already exists (e.g. user opened a second tab)
    // AND watch for new updates arriving while the page is open.
    // Note: a *waiting* SW has no clients so it cannot postMessage us —
    // we must detect the update here in the page via updatefound/statechange.
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) setUpdateReady(true);
      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          // "installed" + an active controller = new SW is waiting, ready to swap
          if (incoming.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
    });

    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  /**
   * Hard reload — clears ALL caches, tells the waiting SW to skip waiting,
   * then reloads only after the new SW has taken control (controllerchange).
   * Fallback: just location.reload() for non-PWA browsers.
   */
  async function hardReload() {
    setReloading(true);
    setUpdateReady(false);                          // hide immediately on click
    sessionStorage.setItem("vf_sw_reloaded", "1");  // suppress re-arm after reload
    try {
      // 1. Delete every cache entry
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // 2. Tell any waiting service worker to activate immediately.
      //    Wait for controllerchange (new SW has claimed the client) before
      //    reloading — avoids the race where we reload while the SW is still
      //    mid-activation and the banner re-appears on the fresh page.
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          // Wait for the new SW to take control — but never hang forever if
          // controllerchange doesn't fire (stalled activation). Reload anyway
          // after 3s so the button can't get stuck on "Reloading…".
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
            setTimeout(done, 3000);
            reg.waiting!.postMessage({ type: "SKIP_WAITING" });
          });
        }
      }
    } catch { /* non-fatal — reload anyway */ }
    window.location.reload();
  }

  return (
    <>
      {/* Update-available banner */}
      {updateReady && (
        <div className="bg-[#F22F46] text-white flex items-center justify-between px-5 py-3 gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🎉</span>
            <div>
              <div className="text-sm font-semibold">New version available</div>
              <div className="text-xs opacity-80">Reload to get the latest updates</div>
            </div>
          </div>
          <button
            onClick={hardReload}
            disabled={reloading}
            className="flex-shrink-0 bg-white text-[#F22F46] text-sm font-bold px-5 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 shadow-sm"
          >
            {reloading ? "Reloading…" : "Reload now →"}
          </button>
        </div>
      )}

      <header className="h-14 border-b border-neutral-200 bg-white flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile-only hamburger */}
          <button
            onClick={onMenuClick}
            className="md:hidden w-8 h-8 rounded-md flex items-center justify-center text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-neutral-800 text-sm">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Hard-reload button — always available, clears SW cache + reloads */}
          <button
            onClick={hardReload}
            disabled={reloading}
            title="Clear cache &amp; reload app"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
          </button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#F22F46] flex items-center justify-center text-white text-xs font-semibold">
            A
          </div>
        </div>
      </header>
    </>
  );
}
