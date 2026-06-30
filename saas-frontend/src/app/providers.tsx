"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Single source of truth for SW registration: pwa.ts cleans up stale
  // root-scope registrations and registers the FCM worker at its own scope,
  // so it can't clobber the app-shell sw.js (the perpetual "new version
  // available" banner). The inline <script> in layout.tsx that re-registered
  // both workers at root scope on every load has been removed.
  useEffect(() => { registerServiceWorker(); }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
