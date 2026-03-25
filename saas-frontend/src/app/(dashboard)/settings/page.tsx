"use client";

import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/firebase-auth";
import { getIntegrationStatus, type UserIntegrationStatus } from "@/lib/firebase-functions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Settings,
  Zap,
  Phone,
  CreditCard,
  Mail,
  MessageSquare,
  Mic,
  Brain,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

type ServiceKey = keyof UserIntegrationStatus["services"];

const SERVICE_ICONS: Record<ServiceKey, React.ElementType> = {
  twilio:     Phone,
  stripe:     CreditCard,
  sendgrid:   Mail,
  elevenlabs: Mic,
  deepgram:   Brain,
  openai:     Brain,
  whatsapp:   MessageSquare,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<UserIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIntegrationStatus();
      setStatus(data);
    } catch (e) {
      setError((e as Error).message || "Failed to load integration status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const services = status?.services
    ? (Object.entries(status.services) as [ServiceKey, UserIntegrationStatus["services"][ServiceKey]][])
    : [];

  const configuredCount = services.filter(([, s]) => s.configured).length;
  const totalCount = services.length;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Settings</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Account and integration configuration</p>
      </div>

      {/* Account */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-neutral-400" />
          <h3 className="font-semibold text-neutral-800 text-sm">Account</h3>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">Email</div>
            <div className="text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg">
              {user?.email || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 font-medium uppercase tracking-wide mb-1">User ID</div>
            <div className="text-sm text-neutral-400 font-mono bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg">
              {user?.uid || "—"}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-4 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
        >
          Sign out →
        </button>
      </div>

      {/* Integrations */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-neutral-400" />
            <h3 className="font-semibold text-neutral-800 text-sm">Integrations</h3>
            {!loading && status && (
              <span className="text-xs text-neutral-400 ml-1">
                {configuredCount}/{totalCount} active
              </span>
            )}
          </div>
          <button
            onClick={loadStatus}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {loading && !status ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-neutral-50 border border-neutral-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {services.map(([key, svc]) => {
              const Icon = SERVICE_ICONS[key] || Zap;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-neutral-700">{svc.label}</div>
                      <div className="text-xs text-neutral-400">{svc.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {svc.configured ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-neutral-300" />
                        <span className="text-xs font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                          Not configured
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-neutral-400 mt-3">
          Integration credentials are managed by your system administrator.
          Contact support to enable additional services.
        </p>
      </div>
    </div>
  );
}
