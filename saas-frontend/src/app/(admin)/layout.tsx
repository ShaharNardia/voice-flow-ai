"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (role !== "admin") router.replace("/dashboard");
    }
  }, [user, loading, role, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F22F46] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || role !== "admin") return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="bg-[#0D1117] border-b border-[#21262D] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">VoiceFlow AI</span>
          <span className="text-[#F22F46] text-xs font-medium px-2 py-0.5 bg-[#F22F46]/10 border border-[#F22F46]/20 rounded-full">
            Admin
          </span>
        </div>
        <a href="/dashboard" className="text-[#8B949E] hover:text-white text-sm transition-colors">
          ← Back to dashboard
        </a>
      </div>
      <main className="p-6">{children}</main>
    </div>
  );
}
