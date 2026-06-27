"use client";

/**
 * SIP Setup Wizard — admin-only.
 *
 * Six-step guided installation for connecting Asterisk + SIP bridge to the
 * VoiceFlow stack. Every step has copy-paste config or runs a server-side
 * verification. Progress persists in localStorage so refresh doesn't reset.
 *
 * Why this exists: the runbook in sip-bridge/SETUP.md is correct but long.
 * For non-experts (and for admins who only do this once per server), a
 * stepper UI that auto-generates secrets and provides exact commands is
 * dramatically faster and less error-prone.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check, Copy, Server, ChevronRight, ChevronLeft, Loader2, Sparkles,
  Terminal, Cloud, FileCode2, Wifi, WifiOff, RotateCw, AlertTriangle,
  CheckCircle2, ArrowRight, Download, Eye, EyeOff,
} from "lucide-react";
import { sipSetupCheckBridge, sipSetupGetConfig, sipSetupVerify, type SipVerifyResult } from "@/lib/firebase-functions";

// ── Types ────────────────────────────────────────────────────────────────────

interface WizardState {
  ariPassword: string;
  bridgeSecret: string;
  bridgeUrl: string;              // e.g. http://1.2.3.4:3000
  operatorTrunk: string;          // pjsip.conf section name, e.g. "my-operator"
  carrierRatePerMin: string;      // "0.005"
  currentStep: number;
  // Track which steps the admin has marked as done
  done: Record<number, boolean>;
}

const DEFAULT_STATE: WizardState = {
  ariPassword:    "",
  bridgeSecret:   "",
  bridgeUrl:      "",
  operatorTrunk:  "",
  carrierRatePerMin: "0.005",
  currentStep:    0,
  done:           {},
};

const LS_KEY = "voiceflow.sipSetupWizard.v1";

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomBase64(byteCount = 32): string {
  // crypto.getRandomValues is available in modern browsers.
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  // base64-url-safe (no +/=). Build string char-by-char to avoid spread on
  // Uint8Array (TS target restriction on older lib settings).
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function loadState(): WizardState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { return DEFAULT_STATE; }
}

function saveState(s: WizardState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* quota or private mode */ }
}

// ── CodeBlock component ──────────────────────────────────────────────────────

function CodeBlock({ code, language, height }: { code: string; language?: string; height?: number }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignored */ }
  };
  return (
    <div className="relative group">
      <pre
        className="bg-[#0D1117] border border-[#21262D] rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-[#C9D1D9]"
        style={height ? { maxHeight: height, overflowY: "auto" } : undefined}
      >
        {language && <div className="absolute top-2 left-3 text-[10px] uppercase tracking-wider text-neutral-500">{language}</div>}
        <code className={language ? "block pt-3" : "block"}>{code}</code>
      </pre>
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-[#21262D] hover:bg-[#30363D] text-[#C9D1D9] transition-colors opacity-70 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Reusable test/verify widgets ─────────────────────────────────────────────

interface CheckResult { ok: boolean; detail?: string; sub?: string }

function VerifyButton({
  label, onRun, autoRun, result, running,
}: {
  label: string;
  onRun: () => void;
  autoRun?: boolean;            // run on mount if true (visual only — caller controls)
  result: CheckResult | null;
  running: boolean;
}) {
  useEffect(() => { if (autoRun) onRun(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-neutral-800">{label}</div>
          {result && (
            <div className="mt-1.5 flex items-start gap-1.5">
              {result.ok
                ? <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                : <X className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />}
              <div className="min-w-0">
                <div className={`text-xs font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
                  {result.ok ? "Passed" : "Failed"}
                </div>
                {result.detail && (
                  <div className="text-[11px] text-neutral-600 font-mono mt-0.5 break-words">{result.detail}</div>
                )}
                {result.sub && (
                  <div className="text-[11px] text-neutral-500 mt-0.5">{result.sub}</div>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-sm text-neutral-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
          {running ? "Testing…" : result ? "Re-test" : "Test"}
        </button>
      </div>
    </div>
  );
}

// X icon — local, since we don't import the full lucide X here. Use existing CheckCircle2 style.
function X({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Strength meter for the generated secrets — passive, no test button.
function SecretStrength({ value }: { value: string }) {
  const len = value.length;
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[-_]/.test(value);
  const variety = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
  // Score: 0-4 from length, 0-4 from variety
  const score = Math.min(4, Math.floor(len / 8)) + Math.min(4, variety);
  const level = score >= 7 ? { txt: "Excellent", color: "bg-green-500 text-green-700" }
              : score >= 5 ? { txt: "Strong",    color: "bg-emerald-500 text-emerald-700" }
              : score >= 3 ? { txt: "OK",        color: "bg-amber-500 text-amber-700" }
              :              { txt: "Weak",      color: "bg-red-500 text-red-700" };
  const fillPct = (score / 8) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
        <div className={`h-full ${level.color.split(" ")[0]} transition-all`} style={{ width: `${fillPct}%` }} />
      </div>
      <span className={`font-semibold ${level.color.split(" ")[1]}`}>{level.txt}</span>
      <span className="text-neutral-400">({len} chars, {variety}/4 classes)</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, title: "Prerequisites",    icon: Sparkles,  description: "Confirm your server is ready" },
  { id: 1, title: "Generate Secrets", icon: FileCode2, description: "ARI password + bridge secret" },
  { id: 2, title: "Asterisk Config",  icon: Terminal,  description: "Three config files to paste" },
  { id: 3, title: "Install Bridge",   icon: Server,    description: "Run the bridge service" },
  { id: 4, title: "Wire Backend",     icon: Cloud,     description: "Firebase + Cloud Run env" },
  { id: 5, title: "Test & Done",      icon: Wifi,      description: "Verify connection" },
];

export default function SipSetupWizardPage() {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [healthResult, setHealthResult] = useState<{ ok: boolean; ariConnected?: boolean; version?: string; activeCalls?: number; latencyMs?: number; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<{ SIP_BRIDGE_URL: boolean; SIP_BRIDGE_SECRET: boolean; currentBridgeUrl: string | null } | null>(null);

  // Hydrate from localStorage on mount (avoids SSR hydration mismatch).
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
    sipSetupGetConfig()
      .then(r => setCurrentConfig(r.functions))
      .catch(() => setCurrentConfig(null));
  }, []);

  // Persist on every change.
  useEffect(() => { if (hydrated) saveState(state); }, [state, hydrated]);

  const update = (patch: Partial<WizardState>) =>
    setState(prev => ({ ...prev, ...patch }));

  const setStep = (n: number) => update({ currentStep: Math.max(0, Math.min(STEPS.length - 1, n)) });

  const markDone = (step: number, done: boolean) =>
    update({ done: { ...state.done, [step]: done } });

  const generateSecretsIfMissing = () => {
    update({
      ariPassword:  state.ariPassword  || randomBase64(24),
      bridgeSecret: state.bridgeSecret || randomBase64(32),
    });
  };

  const resetWizard = () => {
    if (!confirm("Reset the wizard? Your generated secrets and progress will be cleared.")) return;
    localStorage.removeItem(LS_KEY);
    setState(DEFAULT_STATE);
    setHealthResult(null);
  };

  const runHealthCheck = async () => {
    if (!state.bridgeUrl) return;
    setChecking(true);
    setHealthResult(null);
    try {
      const r = await sipSetupCheckBridge({ bridgeUrl: state.bridgeUrl, bridgeSecret: state.bridgeSecret });
      setHealthResult(r);
      if (r.ok) markDone(5, true);
    } catch (e) {
      setHealthResult({ ok: false, error: e instanceof Error ? e.message : "Check failed" });
    } finally {
      setChecking(false);
    }
  };

  if (!hydrated) {
    return <div className="p-8 text-neutral-400 flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Loading wizard…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
            <Server className="w-6 h-6 text-teal-600" /> SIP Setup Wizard
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Connect your Asterisk PBX to VoiceFlow in 6 steps. Replaces Twilio for inbound + outbound; saves ~75% on telephony cost.
          </p>
        </div>
        <button
          onClick={resetWizard}
          className="text-xs text-neutral-500 hover:text-red-500 flex items-center gap-1 transition-colors"
          title="Reset wizard"
        >
          <RotateCw className="w-3 h-3" /> Reset
        </button>
      </header>

      {/* Stepper rail */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 mb-6">
        <div className="flex items-center gap-1">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === state.currentStep;
            const isDone   = !!state.done[idx];
            const isPast   = idx < state.currentStep;
            return (
              <button
                key={s.id}
                onClick={() => setStep(idx)}
                className={`flex-1 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive
                    ? "bg-teal-50 border border-teal-200"
                    : isDone
                      ? "hover:bg-neutral-50"
                      : "hover:bg-neutral-50 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone   ? "bg-green-100 text-green-700" :
                    isActive ? "bg-teal-600 text-white" :
                    isPast   ? "bg-neutral-200 text-neutral-600" :
                               "bg-neutral-100 text-neutral-400"
                  }`}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-semibold truncate ${isActive ? "text-teal-700" : "text-neutral-700"}`}>
                      {idx + 1}. {s.title}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate">{s.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step body */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-6">
        {state.currentStep === 0 && <StepPrereqs onMark={(d) => markDone(0, d)} done={!!state.done[0]} />}
        {state.currentStep === 1 && (
          <StepSecrets
            state={state}
            update={update}
            generate={generateSecretsIfMissing}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            onMark={(d) => markDone(1, d)}
            done={!!state.done[1]}
          />
        )}
        {state.currentStep === 2 && <StepAsteriskConfig state={state} onMark={(d) => markDone(2, d)} done={!!state.done[2]} />}
        {state.currentStep === 3 && <StepInstallBridge state={state} update={update} onMark={(d) => markDone(3, d)} done={!!state.done[3]} />}
        {state.currentStep === 4 && (
          <StepWireBackend
            state={state}
            update={update}
            currentConfig={currentConfig}
            onMark={(d) => markDone(4, d)}
            done={!!state.done[4]}
          />
        )}
        {state.currentStep === 5 && (
          <StepTestAndDone
            state={state}
            checking={checking}
            healthResult={healthResult}
            onRun={runHealthCheck}
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(state.currentStep - 1)}
          disabled={state.currentStep === 0}
          className="flex items-center gap-1 text-sm px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-xs text-neutral-400">Step {state.currentStep + 1} of {STEPS.length}</div>
        {state.currentStep < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(state.currentStep + 1)}
            className="flex items-center gap-1 text-sm px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <a
            href="/assistants"
            className="flex items-center gap-1 text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            Go to Assistants <ArrowRight className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Step 0 — Prerequisites ───────────────────────────────────────────────────

function StepPrereqs({ onMark, done }: { onMark: (d: boolean) => void; done: boolean }) {
  const items = [
    "Linux server (Ubuntu 20.04+ or similar) with root / sudo access",
    "Asterisk 18+ installed and running",
    "Your SIP operator has provisioned at least one trunk and one DID, and you've verified raw calls work without the bridge",
    "Node.js 18+ available on the server (or willing to install)",
    "Outbound HTTPS access from the server to Firebase Functions + Cloud Run (us-central1.cloudfunctions.net, us-central1.run.app)",
    "Inbound TCP access on port 3000 from Firebase Functions IP ranges (or you'll put nginx + TLS in front, see SETUP.md Phase 6)",
  ];
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Before you begin</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Verify these are true on your Asterisk server. If any aren't yet, complete them first — the wizard can't help with operator-side setup.
      </p>
      <ul className="space-y-2 mb-4">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <ChevronRight className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
            <span className="text-neutral-700">{it}</span>
          </li>
        ))}
      </ul>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          <strong>Verify operator trunk first:</strong> SSH into your Asterisk server and run the commands below. If any fails, fix that BEFORE moving on — the wizard cannot debug operator-side issues.
        </span>
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide">Run on your Asterisk server</div>
        <CodeBlock language="bash" code={`# 1. Asterisk is running
sudo systemctl status asterisk

# 2. Version is 18+
sudo asterisk -rx "core show version"
# Expected: "Asterisk 18.x" or higher

# 3. SIP operator trunk is registered
sudo asterisk -rx "pjsip show registrations"
# Expected: At least one row with state "Registered"

# 4. Note the trunk's section name — you'll need it later
sudo asterisk -rx "pjsip show endpoints" | head -30
# Look for the line: "Endpoint:  YOUR-TRUNK-NAME"

# 5. ARI module is loaded (required for the bridge)
sudo asterisk -rx "module show like res_ari"
# Expected: "res_ari.so ... Running"`} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={done} onChange={(e) => onMark(e.target.checked)} className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500" />
        <span className="text-neutral-700">All five commands above succeed — operator + Asterisk + ARI module all healthy</span>
      </label>
    </div>
  );
}

// ── Step 1 — Generate Secrets ────────────────────────────────────────────────

function StepSecrets({
  state, update, generate, showSecrets, setShowSecrets, onMark, done,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  generate: () => void;
  showSecrets: boolean;
  setShowSecrets: (b: boolean) => void;
  onMark: (d: boolean) => void;
  done: boolean;
}) {
  const hasSecrets = !!state.ariPassword && !!state.bridgeSecret;
  const mask = (s: string) => s ? (showSecrets ? s : s.slice(0, 4) + "•".repeat(Math.max(8, s.length - 4))) : "";

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Generate strong secrets</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Two secrets are needed: the <strong>ARI password</strong> (Asterisk uses it to authenticate the bridge) and the <strong>Bridge secret</strong> (Firebase + Cloud Run use it to authenticate API calls to the bridge). Both are generated cryptographically in your browser; they never leave this device until you paste them into the next steps.
      </p>

      {!hasSecrets ? (
        <button
          onClick={generate}
          className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Generate Secrets
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <SecretField
              label="ARI Password (used in /etc/asterisk/ari.conf and bridge .env)"
              value={state.ariPassword}
              displayValue={mask(state.ariPassword)}
              onRegenerate={() => update({ ariPassword: randomBase64(24) })}
            />
            <div className="mt-1.5"><SecretStrength value={state.ariPassword} /></div>
          </div>
          <div>
            <SecretField
              label="Bridge Secret (used in bridge .env + Firebase Functions + Cloud Run)"
              value={state.bridgeSecret}
              displayValue={mask(state.bridgeSecret)}
              onRegenerate={() => update({ bridgeSecret: randomBase64(32) })}
            />
            <div className="mt-1.5"><SecretStrength value={state.bridgeSecret} /></div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <button onClick={() => setShowSecrets(!showSecrets)} className="flex items-center gap-1 text-neutral-500 hover:text-neutral-700">
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? "Hide values" : "Show values"}
            </button>
            <span className="text-neutral-400">Saved in your browser. Lost on Reset.</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2 mt-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Save these to a password manager NOW.</strong> They&apos;re shown unmasked when you click the eye icon and copied to clipboard by the next steps. If you lose them, you&apos;ll need to regenerate and reconfigure all three services (Asterisk, Firebase, Cloud Run).
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm mt-3 pt-3 border-t border-neutral-100">
            <input type="checkbox" checked={done} onChange={(e) => onMark(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
            <span className="text-neutral-700">I&apos;ve saved both secrets to my password manager</span>
          </label>
        </div>
      )}
    </div>
  );
}

function SecretField({ label, value, displayValue, onRegenerate }: { label: string; value: string; displayValue: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          value={displayValue}
          readOnly
          className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-xs font-mono bg-neutral-50 text-neutral-700"
        />
        <button onClick={onCopy} title="Copy" className="w-9 h-9 flex items-center justify-center border border-neutral-200 rounded-lg hover:bg-neutral-50">
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-neutral-500" />}
        </button>
        <button onClick={onRegenerate} title="Regenerate" className="w-9 h-9 flex items-center justify-center border border-neutral-200 rounded-lg hover:bg-neutral-50">
          <RotateCw className="w-3.5 h-3.5 text-neutral-500" />
        </button>
      </div>
    </div>
  );
}

// ── Step 2 — Asterisk Config ─────────────────────────────────────────────────

function StepAsteriskConfig({ state, onMark, done }: { state: WizardState; onMark: (d: boolean) => void; done: boolean }) {
  const [tab, setTab] = useState<"ari" | "http" | "extensions">("ari");

  const ariConf = `[general]
enabled = yes
pretty = yes
allowed_origins = *

[voiceflow]
type = user
password = ${state.ariPassword || "<RUN WIZARD STEP 1 FIRST>"}
password_format = plain
read_only = no
`;

  const httpConf = `[general]
enabled = yes
bindaddr = 127.0.0.1
bindport = 8088
prefix =
`;

  const extConf = `[from-sip]
exten => _X.,1,NoOp(VoiceFlow inbound: \${CALLERID(num)} -> \${EXTEN})
 same => n,Stasis(voiceflow-app)
 same => n,Hangup()
`;

  const reloadCmd = `sudo asterisk -rx "core reload"
sudo asterisk -rx "ari show status"      # expect: "Asterisk REST Interface is enabled"
sudo asterisk -rx "dialplan show from-sip"   # verify your DID matches _X.`;

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Configure Asterisk</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Three files. Paste each into the corresponding location on your Asterisk server, then run the reload command.
        If the file already exists, <strong>append</strong> these sections — don&apos;t overwrite.
      </p>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {([
          { id: "ari",        label: "/etc/asterisk/ari.conf" },
          { id: "http",       label: "/etc/asterisk/http.conf" },
          { id: "extensions", label: "/etc/asterisk/extensions.conf" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-mono -mb-px border-b-2 transition-colors ${
              tab === t.id ? "border-teal-500 text-teal-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ari"        && <CodeBlock code={ariConf} language="ini" />}
      {tab === "http"       && <CodeBlock code={httpConf} language="ini" />}
      {tab === "extensions" && (
        <>
          <CodeBlock code={extConf} language="ini" />
          <p className="text-xs text-neutral-500 mt-2">
            Note: <code className="bg-neutral-100 px-1 rounded">_X.</code> matches <em>any</em> incoming DID. If you want only specific numbers
            to route to VoiceFlow, replace with the exact DID (e.g. <code className="bg-neutral-100 px-1 rounded">_+972747054937</code>).
          </p>
        </>
      )}

      <div className="mt-6">
        <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide">After saving the files:</div>
        <CodeBlock code={reloadCmd} language="bash" />
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
        <Info /><span>
          <strong>How to verify Asterisk side:</strong> the commands above print pass/fail directly in your SSH terminal. The wizard can&apos;t test these from the browser, but Step 3&apos;s &quot;Test bridge&quot; button will fail with a clear ARI-connection error if anything in this step is wrong — so you&apos;ll know immediately.
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm mt-4 pt-3 border-t border-neutral-100">
        <input type="checkbox" checked={done} onChange={(e) => onMark(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
        <span className="text-neutral-700">Config files pasted, Asterisk reloaded, ARI status confirmed</span>
      </label>
    </div>
  );
}

function Info() {
  return (
    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ── Step 3 — Install Bridge ──────────────────────────────────────────────────

function StepInstallBridge({ state, update, onMark, done }: { state: WizardState; update: (p: Partial<WizardState>) => void; onMark: (d: boolean) => void; done: boolean }) {
  const [testResult, setTestResult] = useState<CheckResult | null>(null);
  const [running,    setRunning]    = useState(false);
  const runBridgeTest = async () => {
    if (!state.bridgeUrl) {
      setTestResult({ ok: false, detail: "Enter the bridge URL below first" });
      return;
    }
    setRunning(true);
    try {
      const r = await sipSetupCheckBridge({ bridgeUrl: state.bridgeUrl, bridgeSecret: state.bridgeSecret });
      if (r.ok) {
        setTestResult({
          ok: true,
          detail: r.ariConnected ? "Bridge online + Asterisk ARI connected" : "Bridge online but ARI is DISCONNECTED",
          sub: `Version ${r.version || "?"} · ${r.activeCalls ?? 0} active calls · ${r.latencyMs}ms`,
        });
      } else {
        setTestResult({ ok: false, detail: r.error || "Unknown error" });
      }
    } catch (e) {
      setTestResult({ ok: false, detail: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setRunning(false);
    }
  };
  const envContent = `# Generated by the SIP Setup Wizard. Place at /opt/voiceflow/sip-bridge/.env
# chmod 600 .env  after pasting

# Asterisk ARI (localhost)
ARI_URL=http://127.0.0.1:8088
ARI_USER=voiceflow
ARI_PASS=${state.ariPassword || "<MISSING — RUN STEP 1>"}
ARI_APP=voiceflow-app

# Bridge REST API
PORT=3000
BRIDGE_SECRET=${state.bridgeSecret || "<MISSING — RUN STEP 1>"}

# Where Firebase Functions live (Firebase project: voiceflow-ai-202509231639)
FIREBASE_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net

# Cloud Run mediastream service URL
CLOUD_RUN_URL=https://voiceflow-mediastream-myg46khq7q-uc.a.run.app

# Outbound trunk — must match a section name in pjsip.conf
SIP_OUTBOUND_TRUNK=${state.operatorTrunk || "your-operator-trunk-name"}

# Ring timeout for outbound (seconds)
SIP_DIAL_TIMEOUT_SEC=30

# RTP ports between Asterisk and bridge (localhost only)
RTP_PORT_START=7000
RTP_PORT_END=7100
`;

  const installCmds = `# 1. Copy the sip-bridge folder to /opt/voiceflow/ on your Asterisk server
#    From your dev machine:
#      scp -r sip-bridge/ user@your-asterisk-server:/opt/voiceflow/

# 2. On the server:
sudo mkdir -p /opt/voiceflow && sudo chown $USER:$USER /opt/voiceflow
cd /opt/voiceflow/sip-bridge

# Install Node 18 if missing
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs

npm install --omit=dev

# 3. Paste the .env from the box on the left
nano .env
chmod 600 .env

# 4. Quick sanity check
node index.js
#   Expect:
#     [ARI] Connected to Asterisk
#     [ARI] App started: voiceflow-app

# Ctrl-C to stop, then run under pm2:
sudo npm install -g pm2
pm2 start index.js --name voiceflow-bridge
pm2 save
pm2 startup   # then run the line PM2 outputs (sudo env ...)

# Log rotation so disk doesn't fill up
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14

# Verify
curl http://127.0.0.1:3000/health
# Expect: {"status":"ok","ariConnected":true,...}`;

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Install the bridge service</h2>
      <p className="text-sm text-neutral-500 mb-4">
        First fill in your <strong>SIP operator trunk name</strong> (the section name in <code className="bg-neutral-100 px-1 rounded">pjsip.conf</code>),
        then copy the generated <code className="bg-neutral-100 px-1 rounded">.env</code> file and the install commands to your Asterisk server.
      </p>

      <div className="mb-4">
        <label className="block text-xs font-medium text-neutral-600 mb-1.5">SIP operator trunk name (from your pjsip.conf)</label>
        <input
          type="text"
          value={state.operatorTrunk}
          onChange={(e) => update({ operatorTrunk: e.target.value })}
          placeholder="my-operator"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-teal-500"
        />
        <p className="text-xs text-neutral-400 mt-1">If unset, the bridge auto-picks the first trunk it finds (typically fine for single-trunk deployments).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <FileCode2 className="w-3.5 h-3.5" /> bridge .env
          </div>
          <CodeBlock code={envContent} language="env" height={420} />
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> install + run
          </div>
          <CodeBlock code={installCmds} language="bash" height={420} />
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-neutral-200">
        <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide">Step 3 verification</div>
        <p className="text-xs text-neutral-500 mb-3">
          Once the bridge is running on your server, enter its public URL below and click <strong>Test</strong>.
          Firebase will ping it from Google&apos;s network (same as production).
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={state.bridgeUrl}
            onChange={(e) => update({ bridgeUrl: e.target.value })}
            placeholder="http://1.2.3.4:3000 or https://pbx.yourcompany.com"
            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-teal-500"
          />
        </div>
        <VerifyButton
          label="Bridge reachable + ARI connected"
          onRun={runBridgeTest}
          result={testResult}
          running={running}
        />
      </div>

      <label className="flex items-center gap-2 text-sm mt-4 pt-3 border-t border-neutral-100">
        <input type="checkbox" checked={done} onChange={(e) => onMark(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
        <span className="text-neutral-700">Bridge installed, pm2 running, <code className="bg-neutral-100 px-1 rounded">curl /health</code> returns ok</span>
      </label>
    </div>
  );
}

// ── Step 4 — Wire Backend (Firebase + Cloud Run) ─────────────────────────────

function StepWireBackend({
  state, update, currentConfig, onMark, done,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  currentConfig: { SIP_BRIDGE_URL: boolean; SIP_BRIDGE_SECRET: boolean; currentBridgeUrl: string | null } | null;
  onMark: (d: boolean) => void;
  done: boolean;
}) {
  const [verifyResult, setVerifyResult] = useState<SipVerifyResult | null>(null);
  const [verifying,    setVerifying]    = useState(false);
  const runFullVerify = async () => {
    setVerifying(true);
    try {
      const r = await sipSetupVerify({ bridgeUrl: state.bridgeUrl, bridgeSecret: state.bridgeSecret });
      setVerifyResult(r);
    } catch (e) {
      setVerifyResult({
        firebaseEnv:     { ok: false, detail: e instanceof Error ? e.message : "Verify failed" },
        cloudRunPing:    { ok: false, status: null, detail: "Verify call failed before reaching server" },
        bridgeReachable: { ok: false, ariConnected: false, version: null, detail: "Verify call failed before reaching server" },
      });
    } finally {
      setVerifying(false);
    }
  };
  const firebaseEnvBlock = `# Append to firebase/functions/.env
SIP_BRIDGE_URL=${state.bridgeUrl || "<set the URL above>"}
SIP_BRIDGE_SECRET=${state.bridgeSecret || "<run step 1>"}`;

  const firebaseDeploy = `cd firebase
firebase deploy --only functions:placeCall --project voiceflow-ai-202509231639`;

  const cloudRunCmd = `gcloud run services update voiceflow-mediastream \\
  --region us-central1 \\
  --project voiceflow-ai-202509231639 \\
  --update-env-vars "SIP_BRIDGE_URL=${state.bridgeUrl || "<set>"},SIP_BRIDGE_SECRET=${state.bridgeSecret || "<run step 1>"},SIP_CARRIER_RATE_PER_MIN=${state.carrierRatePerMin}"`;

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Wire Firebase + Cloud Run</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Tell our backend where the bridge lives. Both Firebase Functions (for outbound <code className="bg-neutral-100 px-1 rounded">placeCall</code>) and
        Cloud Run mediastream (for mid-call hangups) need <code className="bg-neutral-100 px-1 rounded">SIP_BRIDGE_URL</code> and the matching secret.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">Bridge URL (publicly reachable from GCP)</label>
          <input
            type="text"
            value={state.bridgeUrl}
            onChange={(e) => update({ bridgeUrl: e.target.value })}
            placeholder="http://1.2.3.4:3000 or https://pbx.yourcompany.com"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-teal-500"
          />
          <p className="text-xs text-neutral-400 mt-1">Use HTTPS in production (see SETUP.md Phase 6 for nginx + Let&apos;s Encrypt).</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1.5">SIP carrier rate ($/min, for cost tracking)</label>
          <input
            type="text"
            value={state.carrierRatePerMin}
            onChange={(e) => update({ carrierRatePerMin: e.target.value })}
            placeholder="0.005"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-teal-500"
          />
          <p className="text-xs text-neutral-400 mt-1">Your operator&apos;s per-minute rate. Drives cost breakdown on each call.</p>
        </div>
      </div>

      {currentConfig && (
        <div className={`mb-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
          currentConfig.SIP_BRIDGE_URL && currentConfig.SIP_BRIDGE_SECRET
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {currentConfig.SIP_BRIDGE_URL && currentConfig.SIP_BRIDGE_SECRET
            ? <><CheckCircle2 className="w-4 h-4" /> Firebase Functions already has SIP env vars set — current bridge URL: <code className="bg-white px-1 rounded">{currentConfig.currentBridgeUrl}</code></>
            : <><AlertTriangle className="w-4 h-4" /> Firebase Functions has not been wired yet — run the commands below to deploy.</>}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <FileCode2 className="w-3.5 h-3.5" /> Firebase Functions — add to firebase/functions/.env
          </div>
          <CodeBlock code={firebaseEnvBlock} language="env" />
        </div>

        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" /> Deploy Firebase Functions
          </div>
          <CodeBlock code={firebaseDeploy} language="bash" />
        </div>

        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5" /> Cloud Run — set env vars
          </div>
          <CodeBlock code={cloudRunCmd} language="bash" />
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Step 4 verification</div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Runs three checks: Firebase env, Cloud Run mediastream, and bridge reachability — all at once.
            </p>
          </div>
          <button
            onClick={runFullVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            {verifying ? "Verifying…" : verifyResult ? "Re-verify" : "Verify All"}
          </button>
        </div>

        {verifyResult && (
          <div className="space-y-2">
            <CheckRow
              label="Firebase Functions env (SIP_BRIDGE_URL + SECRET)"
              ok={verifyResult.firebaseEnv.ok}
              detail={verifyResult.firebaseEnv.detail}
            />
            <CheckRow
              label="Cloud Run mediastream service reachable"
              ok={verifyResult.cloudRunPing.ok}
              detail={verifyResult.cloudRunPing.detail}
            />
            <CheckRow
              label="SIP bridge reachable + Asterisk ARI connected"
              ok={verifyResult.bridgeReachable.ok && verifyResult.bridgeReachable.ariConnected}
              halfOk={verifyResult.bridgeReachable.ok && !verifyResult.bridgeReachable.ariConnected}
              detail={verifyResult.bridgeReachable.detail}
            />
            {verifyResult.firebaseEnv.ok && verifyResult.cloudRunPing.ok && verifyResult.bridgeReachable.ok && verifyResult.bridgeReachable.ariConnected && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>All three checks passed. Backend is wired correctly. Continue to Step 5 for a final end-to-end check.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm mt-4 pt-3 border-t border-neutral-100">
        <input type="checkbox" checked={done} onChange={(e) => onMark(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
        <span className="text-neutral-700">Both deploys completed</span>
      </label>
    </div>
  );
}

// Renders a single ✓ / ⚠ / ✗ row in a multi-check verification panel.
function CheckRow({ label, ok, halfOk, detail }: { label: string; ok: boolean; halfOk?: boolean; detail: string }) {
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${
      ok ? "bg-green-50 border-green-200"
       : halfOk ? "bg-amber-50 border-amber-200"
       : "bg-red-50 border-red-200"
    }`}>
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
        : halfOk
          ? <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          : <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold ${
          ok ? "text-green-800" : halfOk ? "text-amber-800" : "text-red-800"
        }`}>{label}</div>
        <div className="text-[11px] text-neutral-700 mt-0.5 break-words">{detail}</div>
      </div>
    </div>
  );
}

// ── Step 5 — Test & Done ─────────────────────────────────────────────────────

function StepTestAndDone({
  state, checking, healthResult, onRun,
}: {
  state: WizardState;
  checking: boolean;
  healthResult: { ok: boolean; ariConnected?: boolean; version?: string; activeCalls?: number; latencyMs?: number; error?: string } | null;
  onRun: () => void;
}) {
  const canTest = !!state.bridgeUrl;

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-2">Verify the connection</h2>
      <p className="text-sm text-neutral-500 mb-4">
        We&apos;ll ping the bridge from Firebase&apos;s servers (matching where production traffic comes from) and report what we see.
      </p>

      <div className="bg-neutral-50 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">Bridge URL</div>
            <div className="text-sm font-mono text-neutral-800 mt-0.5">{state.bridgeUrl || "(not set)"}</div>
          </div>
          <button
            onClick={onRun}
            disabled={!canTest || checking}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {checking ? "Checking…" : "Test Connection"}
          </button>
        </div>
      </div>

      {healthResult && (
        <div className={`rounded-xl border p-5 mb-4 ${
          healthResult.ok
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-start gap-3">
            {healthResult.ok
              ? <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              : <WifiOff className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            }
            <div className="flex-1">
              <div className={`text-sm font-semibold ${healthResult.ok ? "text-green-800" : "text-red-800"}`}>
                {healthResult.ok ? "Bridge is reachable" : "Bridge unreachable"}
              </div>
              {healthResult.ok ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                  <Stat label="Version"       value={healthResult.version || "—"} />
                  <Stat label="Asterisk ARI"  value={healthResult.ariConnected ? "Connected" : "Disconnected"} ok={healthResult.ariConnected} />
                  <Stat label="Active calls"  value={String(healthResult.activeCalls ?? 0)} />
                  <Stat label="Latency"       value={`${healthResult.latencyMs} ms`} />
                </div>
              ) : (
                <div className="text-xs text-red-700 mt-1 font-mono">{healthResult.error}</div>
              )}
            </div>
          </div>

          {healthResult.ok && healthResult.ariConnected === false && (
            <div className="mt-3 pt-3 border-t border-green-200 text-xs text-amber-700 bg-amber-50 -mx-5 -mb-5 p-3 rounded-b-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Bridge is reachable but it isn&apos;t connected to Asterisk ARI. Check the ARI password in <code className="bg-amber-100 px-1 rounded">.env</code> matches <code className="bg-amber-100 px-1 rounded">/etc/asterisk/ari.conf</code>, and that the HTTP server is enabled (Step 2).
              </span>
            </div>
          )}
        </div>
      )}

      {healthResult?.ok && healthResult.ariConnected && (
        <div className="bg-gradient-to-br from-teal-50 to-green-50 border border-teal-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-teal-700" />
            <h3 className="font-semibold text-teal-900">You&apos;re all set!</h3>
          </div>
          <p className="text-sm text-teal-800 mb-3">
            The bridge is online and connected to Asterisk. Final step: flip an assistant to SIP and place a real test call.
          </p>
          <ol className="text-sm text-teal-800 space-y-1.5 mb-4 list-decimal list-inside">
            <li>Open <a href="/assistants" className="font-semibold underline">Assistants</a> and pick one to test with</li>
            <li>Scroll to <strong>Telephony Carrier</strong>, click <strong>SIP Trunk</strong>, save</li>
            <li>Open <a href="/phone-numbers/sip" className="font-semibold underline">SIP DIDs</a> and map a DID to this assistant</li>
            <li>Place a test call to that DID — watch the live logs:
              <CodeBlock code={`# On your Asterisk server:
pm2 logs voiceflow-bridge

# In another terminal — Cloud Run logs:
gcloud logging tail --project voiceflow-ai-202509231639 \\
  'resource.type="cloud_run_revision" AND resource.labels.service_name="voiceflow-mediastream"'`} language="bash" />
            </li>
          </ol>
        </div>
      )}

      {!healthResult && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 text-sm text-neutral-600">
          <div className="flex items-start gap-2">
            <Wifi className="w-4 h-4 mt-0.5 text-neutral-400" />
            <div>
              Click <strong>Test Connection</strong> above. If it fails, check:
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
                <li>Bridge URL is reachable from the public internet (not just <code className="bg-neutral-100 px-1 rounded">127.0.0.1</code>)</li>
                <li>Port 3000 (or your reverse-proxy port) is open in the firewall</li>
                <li><code className="bg-neutral-100 px-1 rounded">pm2 ls</code> on the server shows <code className="bg-neutral-100 px-1 rounded">voiceflow-bridge</code> as <strong>online</strong></li>
                <li>If you&apos;re using https://, the certificate is valid (not self-signed)</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${ok === false ? "text-amber-600" : "text-neutral-800"}`}>{value}</div>
    </div>
  );
}
