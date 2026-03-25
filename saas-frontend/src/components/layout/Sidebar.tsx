"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/firebase-auth";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { useState } from "react";
import { UpgradeModal } from "@/components/ui/UpgradeModal";
import {
  LayoutDashboard,
  Bot,
  Phone,
  PhoneCall,
  Users,
  GitBranch,
  BarChart3,
  CreditCard,
  Settings,
  LogOut,
  PhoneOff,
  ShieldCheck,
  Megaphone,
  Calendar,
  Lock,
  Zap,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  lockedFor?: "campaigns" | "calendar" | "analytics";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assistants", label: "Assistants", icon: Bot },
  { href: "/phone-numbers", label: "Phone Numbers", icon: Phone },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, lockedFor: "campaigns" },
  { href: "/calendar", label: "Calendar", icon: Calendar, lockedFor: "calendar" },
  { href: "/scenarios", label: "Scenarios", icon: GitBranch },
  { href: "/analytics", label: "Analytics", icon: BarChart3, lockedFor: "analytics" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useAuth();
  const { isBasic, plan, loading: planLoading, creditGranted, creditBalance } = usePlan();
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature?: string }>({ open: false });

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const isLocked = (item: NavItem) =>
    !planLoading && isBasic && Boolean(item.lockedFor);

  const featureLabel: Record<string, string> = {
    campaigns: "Campaigns",
    calendar: "Calendar",
    analytics: "Analytics",
  };

  return (
    <>
      <UpgradeModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal({ open: false })}
        featureName={upgradeModal.feature}
      />

      <aside className="w-[220px] min-h-screen bg-[#0D1117] border-r border-[#21262D] flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#21262D]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#F22F46] rounded-md flex items-center justify-center">
              <PhoneOff className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-semibold text-sm tracking-tight">VoiceFlow AI</span>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 sidebar-scroll overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon, lockedFor }) => {
            const locked = !planLoading && isBasic && Boolean(lockedFor);
            const active = isActive(href);

            if (locked) {
              return (
                <button
                  key={href}
                  onClick={() => setUpgradeModal({ open: true, feature: featureLabel[lockedFor!] })}
                  className="nav-item w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#484F58] hover:bg-[#161B22] hover:text-[#8B949E] transition-colors"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  <Lock className="w-3 h-3 shrink-0" />
                </button>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                  active
                    ? "bg-[#161B22] text-white border-l-2 border-[#F22F46] pl-[10px]"
                    : "text-[#8B949E] hover:bg-[#161B22] hover:text-[#F0F6FC]",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}

          <div className="border-t border-[#21262D] my-3" />

          {role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                pathname.startsWith("/admin")
                  ? "bg-[#161B22] text-white border-l-2 border-[#F22F46] pl-[10px]"
                  : "text-[#8B949E] hover:bg-[#161B22] hover:text-[#F0F6FC]",
              )}
            >
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              Admin Panel
            </Link>
          )}

          {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                isActive(href)
                  ? "bg-[#161B22] text-white border-l-2 border-[#F22F46] pl-[10px]"
                  : "text-[#8B949E] hover:bg-[#161B22] hover:text-[#F0F6FC]",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Plan badge + sign out */}
        <div className="px-3 py-4 border-t border-[#21262D] space-y-2">
          {/* Plan pill */}
          {!planLoading && (
            <button
              onClick={() => isBasic ? setUpgradeModal({ open: true }) : undefined}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                isBasic
                  ? "bg-[#21262D] text-[#8B949E] hover:bg-[#30363D]"
                  : "bg-gradient-to-r from-[#F22F46] to-[#ff6b7a] text-white cursor-default",
              )}
            >
              {isBasic ? (
                <>
                  <Lock className="w-3 h-3" />
                  BASIC — Upgrade
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3" />
                  {plan.toUpperCase()} ✦
                </>
              )}
            </button>
          )}

          {/* Credit balance (basic plan) */}
          {!planLoading && isBasic && creditGranted && creditBalance !== null && (
            <div className="w-full px-2 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#484F58] mb-1">Credit</div>
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-semibold",
                  creditBalance <= 0 ? "text-red-400" : creditBalance < 300 ? "text-yellow-400" : "text-emerald-400",
                )}>
                  ${(creditBalance / 100).toFixed(2)}
                </span>
                {creditBalance <= 0 && (
                  <Link href="/billing" className="text-[10px] text-[#F22F46] hover:underline">Upgrade</Link>
                )}
              </div>
              {creditBalance > 0 && (
                <div className="mt-1 h-1 w-full bg-[#21262D] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      creditBalance < 300 ? "bg-yellow-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${Math.min(100, (creditBalance / 1000) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="nav-item w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#8B949E] hover:bg-[#161B22] hover:text-[#F0F6FC]"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
