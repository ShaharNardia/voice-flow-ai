"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, Zap } from "lucide-react";

function BillingSuccessContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    // Poll Firestore for plan upgrade (max 30s)
    const timeout = setTimeout(() => setTimedOut(true), 30000);

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const plan = snap.data()?.plan;
        if (plan === "pro" || plan === "scale") {
          clearTimeout(timeout);
          setConfirmed(true);
        }
      }
    });

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        {confirmed ? (
          <>
            {/* Success state */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Welcome to PRO! 🎉</h1>
            <p className="text-neutral-500 text-sm mb-8">
              Your account has been upgraded. All PRO features are now unlocked.
            </p>
            <button
              onClick={() => router.replace("/dashboard")}
              className="bg-[#F22F46] hover:bg-[#d9243b] text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors flex items-center gap-2 mx-auto"
            >
              <Zap className="w-4 h-4" />
              Go to Dashboard →
            </button>
          </>
        ) : timedOut ? (
          <>
            {/* Timeout state */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-yellow-500" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-neutral-900 mb-2">Still processing...</h1>
            <p className="text-neutral-500 text-sm mb-6">
              Your upgrade is being processed. It may take a minute to reflect.
              Check back shortly or refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="border border-neutral-200 hover:bg-neutral-50 text-neutral-700 font-medium px-6 py-2.5 rounded-lg text-sm transition-colors mr-3"
            >
              Refresh
            </button>
            <button
              onClick={() => router.replace("/dashboard")}
              className="bg-[#F22F46] hover:bg-[#d9243b] text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            {/* Waiting state */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 bg-[#F22F46]/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-[#F22F46] animate-spin" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-neutral-900 mb-2">Activating your PRO account...</h1>
            <p className="text-neutral-500 text-sm">
              Your payment was successful! We&apos;re activating your account now.
              This usually takes just a few seconds.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>}>
      <BillingSuccessContent />
    </Suspense>
  );
}
