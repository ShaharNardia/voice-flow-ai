"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/firebase-auth";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { useFeatures } from "@/lib/features";
import { useBranding } from "@/hooks/useBranding";
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
  ShoppingCart,
  FileText,
  Network,
  Headphones,
  RefreshCw,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  lockedFor?: "campaigns" | "calendar" | "analytics";
  featureId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, featureId: "module.dashboard" },
  { href: "/assistants", label: "Assistants", icon: Bot, featureId: "module.assistants" },
  { href: "/phone-numbers", label: "Phone Numbers", icon: Phone, featureId: "module.phoneNumbers" },
  { href: "/calls", label: "Calls", icon: PhoneCall, featureId: "module.calls" },
  { href: "/leads", label: "Leads", icon: Users, featureId: "module.leads" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, lockedFor: "campaigns", featureId: "module.campaigns" },
  { href: "/followups", label: "Follow-ups", icon: RefreshCw, featureId: "module.followups" },
  // NLPearl removed — all NLPearl assistants now run on Gemini Live.
  { href: "/bench", label: "Bench", icon: BarChart3, featureId: "module.bench" },
  { href: "/calendar", label: "Calendar", icon: Calendar, lockedFor: "calendar", featureId: "module.calendar" },
  { href: "/scenarios", label: "Scenarios", icon: GitBranch, featureId: "module.scenarios" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, lockedFor: "analytics", featureId: "module.analytics" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, featureId: "module.compliance" },
  { href: "/contracts", label: "Contracts", icon: FileText, featureId: "module.contracts" },
  { href: "/voice-commerce", label: "Voice Commerce", icon: ShoppingCart, featureId: "module.voiceCommerce" },
  { href: "/agent-directory", label: "Agent Network", icon: Network, featureId: "module.agentDirectory" },
  { href: "/copilot", label: "AI Co-Pilot", icon: Headphones, featureId: "module.copilot" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/billing", label: "Billing", icon: CreditCard, featureId: "module.billing" },
  { href: "/settings", label: "Settings", icon: Settings, featureId: "module.settings" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useAuth();
  const { isBasic, plan, loading: planLoading, creditGranted, creditBalance } = usePlan();
  const { has: hasFeature, loading: featuresLoading } = useFeatures();
  const { branding } = useBranding();
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

      {/* Mobile backdrop — click outside to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
          aria-label="Close menu"
        />
      )}

      <aside
        className={
          // On desktop (>= md): always visible, normal flow.
          // On mobile: slide-in drawer with fixed positioning + transform.
          `w-[220px] min-h-screen bg-[#0D1117] border-r border-[#21262D] flex flex-col flex-shrink-0 ` +
          `fixed md:sticky top-0 left-0 h-screen z-50 transition-transform md:transition-none ` +
          (mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        {/* Logo + mobile close */}
        <div className="px-5 py-5 border-b border-[#21262D] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.productName} className="w-7 h-7 rounded-md object-cover" />
            ) : (
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{ backgroundColor: branding.primaryColor }}
              >
                <PhoneOff className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <span className="text-white font-semibold text-sm tracking-tight">{branding.productName}</span>
          </div>
          <button
            onClick={onMobileClose}
            className="md:hidden text-[#8B949E] hover:text-white p-1"
            aria-label="Close navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 sidebar-scroll overflow-y-auto">
          {NAV_ITEMS
            .filter((item) => featuresLoading || !item.featureId || hasFeature(item.featureId))
            .map(({ href, label, icon: Icon, lockedFor }) => {
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

          {(role === "admin" || role === "super_admin") && (
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

          {BOTTOM_ITEMS
            .filter((item) => featuresLoading || !item.featureId || hasFeature(item.featureId))
            .map(({ href, label, icon: Icon }) => (
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

          {/* White-label footer — shows "Powered by …" when tenant configures it */}
          {branding.footerText && (
            <div className="text-[10px] text-center text-[#484F58] pt-1">
              {branding.footerText}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
