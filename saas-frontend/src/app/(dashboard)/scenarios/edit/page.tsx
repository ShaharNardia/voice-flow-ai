"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ScenarioEditor from "./_components/ScenarioEditor";

export default function ScenarioEditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      }
    >
      <ScenarioEditor />
    </Suspense>
  );
}
