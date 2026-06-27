"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/firebase-auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Phone, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const cred = await signUp(email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: displayName.trim() || email.split("@")[0],
        role: "user",
        status: "active",
        plan: "basic",
        onboardingComplete: false,
        createdAt: serverTimestamp(),
      });
      router.replace("/onboarding");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists.");
      } else if (msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-8 h-8 bg-[#F22F46] rounded-lg flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">VoiceFlow AI</span>
        </div>

        {/* Card */}
        <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-8">
          <h1 className="text-white text-xl font-semibold mb-1">Create account</h1>
          <p className="text-[#8B949E] text-sm mb-6">Get started with VoiceFlow AI.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                Full Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#484F58] focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@company.com"
                className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#484F58] focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[#8B949E] text-xs font-medium mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 6 characters"
                className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#484F58] focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="text-center text-[#484F58] text-xs mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-[#8B949E] hover:text-white transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-[#484F58] text-xs mt-6">
          © 2025 VoiceFlow AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
