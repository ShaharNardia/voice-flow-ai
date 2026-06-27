"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signInWithGoogle, signInWithApple } from "@/lib/firebase-auth";
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

  const handleSocial = async (provider: "google" | "apple") => {
    setError("");
    setLoading(true);
    try {
      if (provider === "google") await signInWithGoogle();
      else await signInWithApple();
      router.replace("/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/popup-closed-by-user") setError("Sign-in cancelled.");
      else if (code === "auth/popup-blocked") setError("Pop-up blocked — allow pop-ups and try again.");
      else if (code === "auth/operation-not-allowed") setError("This sign-in method isn't enabled yet.");
      else setError(err instanceof Error ? err.message : "Sign-in failed");
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
          <p className="text-[#8B949E] text-sm mb-5">Welcome back — let&apos;s get to work.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Social sign-in */}
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={() => handleSocial("google")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-900 font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleSocial("apple")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-black hover:bg-neutral-950 border border-[#21262D] text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              <AppleIcon />
              Continue with Apple
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#21262D]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#161B22] px-3 text-[#484F58] uppercase tracking-wider">or with email</span>
            </div>
          </div>

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

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}
