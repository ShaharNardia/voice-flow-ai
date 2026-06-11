"use client";

/**
 * Admin → API Keys / Secrets — list + rotate Firebase/GCP secrets without
 * touching the firebase CLI or terminal.
 *
 * Replaces:
 *   firebase functions:secrets:set FOO --data-file=...
 *   firebase deploy --only functions:bar,baz
 *
 * super_admin only. The value is never read back; only metadata (last
 * rotated, version count, masked last-4) is shown.
 */

import { useEffect, useState } from "react";
import {
  Key, RotateCw, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2,
  Copy, Check, Info, X, Lock,
} from "lucide-react";
import { adminListSecrets, adminRotateSecret, type ManagedSecret } from "@/lib/firebase-functions";

export default function ApiKeysPage() {
  const [secrets, setSecrets] = useState<ManagedSecret[]>([]);
  const [project, setProject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [rotating, setRotating] = useState<ManagedSecret | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError("");
    try {
      const r = await adminListSecrets();
      setSecrets(r.secrets);
      setProject(r.project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
            <Key className="w-6 h-6 text-amber-600" /> API Keys & Secrets
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Manage Firebase/GCP secrets for every integration. Rotation creates a new version;
            existing function instances pick up the new value on cold-start (usually within minutes).
          </p>
          {project && (
            <p className="text-xs text-neutral-400 mt-1 font-mono">project: {project}</p>
          )}
        </div>
        <button onClick={load} className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
          <RotateCw className="w-3 h-3" /> Refresh
        </button>
      </header>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Never paste a secret into chat, logs, or a public terminal.</strong> Values entered here go directly to Google
          Secret Manager (encrypted at rest) and are never logged. The system shows only the last 4 characters once stored.
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-neutral-400 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading secrets…
        </div>
      ) : (
        <div className="space-y-3">
          {secrets.map((s) => (
            <SecretRow key={s.name} secret={s} onRotate={() => setRotating(s)} />
          ))}
        </div>
      )}

      {rotating && (
        <RotateModal
          secret={rotating}
          onClose={() => setRotating(null)}
          onSuccess={() => { setRotating(null); load(); }}
        />
      )}
    </div>
  );
}

function SecretRow({ secret, onRotate }: { secret: ManagedSecret; onRotate: () => void }) {
  const statusBadge = secret.status === "present" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-semibold uppercase">
      <CheckCircle2 className="w-3 h-3" /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-semibold uppercase">
      <X className="w-3 h-3" /> Missing
    </span>
  );

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm font-semibold text-neutral-900">{secret.name}</span>
            {statusBadge}
            <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 bg-neutral-100 rounded font-semibold uppercase">{secret.provider}</span>
          </div>
          <div className="text-xs text-neutral-500">{secret.label}</div>

          {secret.status === "present" && (
            <div className="mt-2 grid grid-cols-3 gap-3 text-[11px]">
              <Stat label="Last rotated" value={secret.lastRotated ? new Date(secret.lastRotated).toLocaleDateString() : "—"} />
              <Stat label="Versions" value={String(secret.versionCount)} />
              <Stat label="Ends in" value={secret.masked || "—"} mono />
            </div>
          )}

          <details className="mt-2 text-[10px] text-neutral-400">
            <summary className="cursor-pointer hover:text-neutral-600">
              Affects {secret.functions.length} function{secret.functions.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-1 ml-3 font-mono">
              {secret.functions.map((f) => <div key={f}>• {f}</div>)}
            </div>
          </details>

          {secret.error && (
            <div className="mt-2 text-[11px] text-red-600 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 mt-0.5" /> {secret.error}
            </div>
          )}
        </div>

        <button
          onClick={onRotate}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors flex-shrink-0"
        >
          <RotateCw className="w-3.5 h-3.5" />
          {secret.status === "present" ? "Rotate" : "Set"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">{label}</div>
      <div className={`text-[11px] mt-0.5 text-neutral-700 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function RotateModal({ secret, onClose, onSuccess }: {
  secret: ManagedSecret;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [value, setValue]     = useState("");
  const [show,  setShow]      = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState("");
  const [result, setResult]   = useState<{ message: string; affectedFunctions: string[] } | null>(null);

  async function submit() {
    setSaving(true); setError("");
    try {
      const r = await adminRotateSecret({ name: secret.name, value });
      setResult({ message: r.message, affectedFunctions: r.affectedFunctions });
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rotation failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-amber-600" /> Rotate {secret.name}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {result ? (
            <div>
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 mb-4">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{result.message}</span>
              </div>
              <div className="text-xs text-neutral-600 mb-2 font-semibold">Affected functions:</div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 font-mono text-[11px] text-neutral-700 space-y-0.5 max-h-40 overflow-y-auto">
                {result.affectedFunctions.map((f) => <div key={f}>• {f}</div>)}
              </div>
              <div className="mt-3 text-[11px] text-neutral-500">
                For immediate effect (don&apos;t wait for cold-start), redeploy with: <br />
                <code className="bg-neutral-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                  firebase deploy --only functions:{result.affectedFunctions.slice(0,3).join(",")}{result.affectedFunctions.length > 3 ? ",..." : ""}
                </code>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={onSuccess} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg">Done</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-neutral-700 mb-3">
                Paste the new value for <span className="font-mono font-semibold">{secret.name}</span>.
                The value goes directly to Google Secret Manager (encrypted) — it is never logged.
              </p>

              <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">
                New value
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="paste new secret here"
                  className="w-full px-3 py-2 pr-10 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-amber-500"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">{value.length} chars · trailing whitespace will be trimmed</div>

              {error && (
                <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {error}
                </div>
              )}

              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>This creates a new secret version. Old versions remain until you delete them via gcloud. Audit row is written.</span>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancel</button>
                <button
                  onClick={submit}
                  disabled={saving || value.trim().length < 8}
                  className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                  Rotate now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
