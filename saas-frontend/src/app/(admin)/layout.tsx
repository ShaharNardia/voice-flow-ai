"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import BrandingApply from "@/components/BrandingApply";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  const { branding } = useBranding();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (role !== "admin" && role !== "super_admin") router.replace("/dashboard");
    }
  }, [user, loading, role, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F22F46] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (role !== "admin" && role !== "super_admin")) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <BrandingApply />
      <div className="bg-[#0D1117] border-b border-[#21262D] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/admin"
            className="text-white font-semibold text-sm transition-colors"
            style={{ color: "white" }}
          >
            {branding.productName}
          </a>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color: branding.primaryColor,
              backgroundColor: `${branding.primaryColor}1A`,
              border: `1px solid ${branding.primaryColor}33`,
            }}
          >
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/admin/console"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Operator Console — every admin capability in one place"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            Console
          </a>
          <a
            href="/admin/logs"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Live log tail"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Logs
          </a>
          <a
            href="/admin/health"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="System health dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            Health
          </a>
          <a
            href="/admin/api-keys"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Manage API keys & secrets"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            API Keys
          </a>
          <a
            href="/admin/policies"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Edit Gemini Live behavior rules live"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Policies
          </a>
          <a
            href="/admin/branding"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="White-label branding for tenants"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
            Branding
          </a>
          <a
            href="/admin/voices"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Custom voice library — cross-tenant audit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8M5 4h14a1 1 0 011 1v6a8 8 0 01-16 0V5a1 1 0 011-1z" /></svg>
            Voices
          </a>
          <a
            href="/admin/tools"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Global tool library — define HTTP tools once, any assistant can opt in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
            Tools
          </a>
          <a
            href="/admin/sip-setup"
            className="flex items-center gap-1.5 text-[#8B949E] hover:text-white text-sm transition-colors"
            title="Connect your Asterisk PBX in 6 guided steps"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
            SIP Setup
          </a>
          <a href="/dashboard" className="text-[#8B949E] hover:text-white text-sm transition-colors">
            ← Back to dashboard
          </a>
        </div>
      </div>
      <main className="p-6">{children}</main>
    </div>
  );
}
