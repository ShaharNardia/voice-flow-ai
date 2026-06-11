"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Authenticated users go straight to the dashboard
    // Everyone else sees the marketing landing page
    if (user) {
      router.replace("/dashboard");
    } else {
      router.replace("/landing");
    }
  }, [user, loading, router]);

  return null;
}
