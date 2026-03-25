"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/firebase-auth";
import { Phone, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid email or password";
      setError(msg.includes("auth/") ? "Invalid email or password." : msg);
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
          <h1 className="text-white text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-[#8B949E] text-sm mb-6">Welcome back — let&apos;s get to work.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="••••••••"
                className="w-full bg-[#0D1117] border border-[#21262D] rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-[#484F58] focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[#484F58] text-xs mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#8B949E] hover:text-white transition-colors">
            Sign up
          </Link>
        </p>

        <p className="text-center text-[#484F58] text-xs mt-3">
          © 2025 VoiceFlow AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
