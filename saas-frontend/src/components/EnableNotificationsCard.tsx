"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeatures } from "@/lib/features";
import { requestPushPermission } from "@/lib/pwa";

/**
 * Self-contained opt-in card shown in Settings / Progress pages so users
 * can enable push notifications for reminders.
 */
export default function EnableNotificationsCard() {
  const { user } = useAuth();
  const { has } = useFeatures();
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");

  if (!has("cap.pwaPush")) return null;

  const enable = async () => {
    if (!user?.uid) return;
    setStatus("loading");
    setError("");
    const result = await requestPushPermission(user.uid);
    if (result.ok) setStatus("done");
    else { setStatus("idle"); setError(result.reason || "Failed"); }
  };

  const permission = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
          {permission === "granted" || status === "done" ? (
            <Bell className="w-5 h-5 text-violet-600" />
          ) : (
            <BellOff className="w-5 h-5 text-neutral-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 text-sm">Push notifications</h3>
          <p className="text-xs text-neutral-500 mt-0.5 mb-3">
            Get reminded 24 hours and 15 minutes before each scheduled lesson or appointment — even when the app is closed.
          </p>
          {status === "done" || permission === "granted" ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" /> Notifications enabled on this device
            </div>
          ) : (
            <button
              onClick={enable}
              disabled={status === "loading"}
              className="bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5"
            >
              {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
              Enable notifications
            </button>
          )}
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
