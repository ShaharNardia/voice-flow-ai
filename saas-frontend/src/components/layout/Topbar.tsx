"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/assistants": "Assistants",
  "/phone-numbers": "Phone Numbers",
  "/calls": "Calls",
  "/leads": "Leads",
  "/scenarios": "Scenarios",
  "/analytics": "Analytics",
  "/billing": "Billing",
  "/settings": "Settings",
};

export default function Topbar() {
  const pathname = usePathname();

  const title =
    Object.entries(PAGE_TITLES).find(([key]) =>
      pathname === key || (key !== "/dashboard" && pathname.startsWith(key)),
    )?.[1] ?? "VoiceFlow AI";

  return (
    <header className="h-14 border-b border-neutral-200 bg-white flex items-center justify-between px-6">
      <h1 className="font-semibold text-neutral-800 text-sm">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-[#F22F46] flex items-center justify-center text-white text-xs font-semibold">
          A
        </div>
      </div>
    </header>
  );
}
