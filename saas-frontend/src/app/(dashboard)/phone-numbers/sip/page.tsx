"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Trash2, Edit2, Play, Loader2, X, Check,
  Shield, ShieldCheck, ShieldOff, ChevronDown, ChevronUp,
  Lock, Globe, Server, Phone, Link2, Unlink, Hash,
  GitBranch, PhoneOutgoing, BookOpen, Activity, AlertTriangle,
  CheckCircle2, XCircle, AlertCircle, Wifi, WifiOff, RefreshCw,
  Settings, Save, Eye, EyeOff, ShieldAlert, Download, FileSearch,
} from "lucide-react";
import {
  sipTrunkCreate, sipTrunkUpdate, sipTrunkDelete, sipTrunkList, sipTrunkTest, sipTrunkHealthCheck,
  sipBridgeConfigGet, sipBridgeConfigSave, sipTracesList, sipTraceDownloadUrl,
  assistantsList,
  type SipTrunk, type SipTrunkInput, type SipTrunkType,
  type SipDtmfMode, type SipEncryption, type SipTransport,
  type SipDid, type SipIvrMenu, type SipIvrMenuItem, type SipOutboundRoute,
  type Assistant, type SipHealthCheckResult, type SipBridgeConfig, type SipBridgeConfigInput,
  type SipTrace,
} from "@/lib/firebase-functions";

// ── Constants ─────────────────────────────────────────────────────────────────
const DTMF_OPTIONS: { value: SipDtmfMode; label: string; desc: string }[] = [
  { value: "rfc2833",  label: "RFC 2833",   desc: "RTP Events — most compatible, recommended" },
  { value: "info",     label: "SIP INFO",   desc: "DTMF via SIP INFO messages" },
  { value: "inband",   label: "In-band",    desc: "DTMF tones in the audio stream" },
  { value: "auto",     label: "Auto",       desc: "Detect and use whatever the provider sends" },
];

const ENC_OPTIONS: { value: SipEncryption; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "required",  label: "Required",  desc: "SRTP only — reject unencrypted media. TLS transport enforced.", icon: <ShieldCheck className="w-4 h-4 text-green-600" /> },
  { value: "preferred", label: "Preferred", desc: "Use SRTP if supported, fall back to RTP.",                    icon: <Shield        className="w-4 h-4 text-amber-500" /> },
  { value: "disabled",  label: "Disabled",  desc: "Plain RTP only — use only on trusted private networks.",      icon: <ShieldOff     className="w-4 h-4 text-red-400"  /> },
];

const TRANS_OPTIONS: { value: SipTransport; label: string; desc: string }[] = [
  { value: "tls", label: "TLS",  desc: "Encrypted signalling (SIPS) — required with SRTP" },
  { value: "tcp", label: "TCP",  desc: "Reliable, unencrypted signalling" },
  { value: "udp", label: "UDP",  desc: "Standard SIP signalling (stateless)" },
];

const CODEC_OPTIONS = ["PCMU", "PCMA", "G722", "G729", "G726", "opus", "iLBC", "speex"];
const DTMF_KEYS = ["1","2","3","4","5","6","7","8","9","0","*","#"];

const DEFAULT_IVR: SipIvrMenu = { enabled: false, prompt: "", timeout: 5, items: [] };

const DEFAULT_FORM: SipTrunkInput = {
  name:        "",
  type:        "register",
  transport:   "tls",
  encryption:  "required",
  dtmfMode:    "rfc2833",
  codecs:      ["PCMU", "PCMA"],
  port:        5061,
  registrar:   "",
  username:    "",
  authUsername:"",
  domain:      "",
  password:    "",
  host:        "",
  allowedIps:  [],
  callerId:    "",
  maxChannels: 0,
  status:      "active",
  dids:        [],
  ivrMenu:     { ...DEFAULT_IVR },
  outboundRoutes: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function encLabel(enc: SipEncryption) {
  if (enc === "required")  return <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium">SRTP Required</span>;
  if (enc === "preferred") return <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">SRTP Preferred</span>;
  return                          <span className="px-1.5 py-0.5 bg-red-50  text-red-600  rounded text-[10px] font-medium">No Encryption</span>;
}
function transLabel(t: SipTransport) {
  if (t === "tls") return <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium flex items-center gap-0.5"><Lock className="w-2.5 h-2.5"/>TLS</span>;
  if (t === "tcp") return <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-medium">TCP</span>;
  return                  <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-medium">UDP</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SipTrunkPage() {
  const [trunks,     setTrunks]     = useState<SipTrunk[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [assistants, setAssistants] = useState<Assistant[]>([]);

  // Modal
  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState<SipTrunk | null>(null);
  const [form,     setForm]     = useState<SipTrunkInput>(DEFAULT_FORM);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState<string[]>([]);
  const [ipInput,  setIpInput]  = useState("");
  const [activeSection, setActiveSection] = useState<string>("basic");

  // DID state
  const [didInput, setDidInput] = useState("");

  // IVR state
  const [ivrItem, setIvrItem]   = useState<Partial<SipIvrMenuItem>>({ key: "1", label: "", action: "assistant" });

  // Outbound route state
  const [routeInput, setRouteInput] = useState<{ pattern: string; description: string; priority: number }>({ pattern: "", description: "", priority: 10 });

  // Test
  const [testing,  setTesting]  = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState<string | null>(null);

  // Health check
  const [hcRunning,  setHcRunning]  = useState(false);
  const [hcResult,   setHcResult]   = useState<SipHealthCheckResult | null>(null);
  const [hcExpanded, setHcExpanded] = useState(false);

  // Bridge config
  const [bridgeOpen,    setBridgeOpen]    = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeSaving,  setBridgeSaving]  = useState(false);
  const [bridgeSaved,   setBridgeSaved]   = useState(false);
  const [bridgeErr,     setBridgeErr]     = useState("");
  const [bridgeShowSecret, setBridgeShowSecret] = useState(false);
  const [bridgeForm, setBridgeForm] = useState<SipBridgeConfigInput>({
    telephonyProvider:    "asterisk",
    asteriskBridgeUrl:    "",
    asteriskBridgeSecret: "",
    asteriskCallerId:     "",
    asteriskSipTrunkName: "",
  });
  const [bridgeHasSecret, setBridgeHasSecret] = useState(false);

  // Expanded row
  const [expanded, setExpanded] = useState<string | null>(null);

  // Inner tab
  const [innerTab, setInnerTab] = useState<"trunks" | "traces">("trunks");

  // Traces
  const [traces,        setTraces]       = useState<SipTrace[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesErr,     setTracesErr]    = useState("");

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    load();
    assistantsList().then(setAssistants).catch(() => {});
    loadBridgeConfig();
  }, []);

  async function loadBridgeConfig() {
    try {
      const res = await sipBridgeConfigGet();
      if (res.config) {
        setBridgeForm({
          telephonyProvider:    res.config.telephonyProvider    || "asterisk",
          asteriskBridgeUrl:    res.config.asteriskBridgeUrl    || "",
          asteriskBridgeSecret: "",   // never returned
          asteriskCallerId:     res.config.asteriskCallerId     || "",
          asteriskSipTrunkName: res.config.asteriskSipTrunkName || "",
        });
        setBridgeHasSecret(res.config.hasSecret || false);
      }
    } catch { /* first-time, no config yet — form stays at defaults */ }
  }

  async function saveBridgeConfig() {
    setBridgeSaving(true); setBridgeErr(""); setBridgeSaved(false);
    try {
      const payload: SipBridgeConfigInput = { ...bridgeForm };
      // Don't send empty secret — keep existing
      if (!payload.asteriskBridgeSecret) delete payload.asteriskBridgeSecret;
      await sipBridgeConfigSave(payload);
      if (bridgeForm.asteriskBridgeSecret) setBridgeHasSecret(true);
      setBridgeForm((prev) => ({ ...prev, asteriskBridgeSecret: "" }));
      setBridgeSaved(true);
      setTimeout(() => setBridgeSaved(false), 3000);
    } catch (e) {
      setBridgeErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBridgeSaving(false);
    }
  }

  async function loadTraces() {
    setTracesLoading(true);
    setTracesErr("");
    try {
      const res = await sipTracesList(50);
      setTraces(res.traces || []);
    } catch (e) {
      setTracesErr(e instanceof Error ? e.message : "Failed to load traces");
    } finally {
      setTracesLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await sipTrunkList();
      setTrunks(res.trunks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SIP trunks");
    } finally {
      setLoading(false);
    }
  }

  // ── Open create/edit modal ─────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm({ ...DEFAULT_FORM, ivrMenu: { ...DEFAULT_IVR }, dids: [], outboundRoutes: [] });
    setFormErr([]);
    setIpInput(""); setDidInput("");
    setIvrItem({ key: "1", label: "", action: "assistant" });
    setRouteInput({ pattern: "", description: "", priority: 10 });
    setActiveSection("basic");
    setOpen(true);
  }

  function openEdit(t: SipTrunk) {
    setEditing(t);
    setForm({
      name:           t.name,
      type:           t.type,
      transport:      t.transport,
      encryption:     t.encryption,
      dtmfMode:       t.dtmfMode,
      codecs:         [...t.codecs],
      port:           t.port,
      registrar:      t.registrar    || "",
      username:       t.username     || "",
      authUsername:   t.authUsername || "",
      domain:         t.domain       || "",
      password:       "",
      host:           t.host         || "",
      allowedIps:     [...(t.allowedIps || [])],
      callerId:       t.callerId     || "",
      maxChannels:    t.maxChannels  || 0,
      status:         t.status,
      dids:           JSON.parse(JSON.stringify(t.dids || [])),
      ivrMenu:        t.ivrMenu ? JSON.parse(JSON.stringify(t.ivrMenu)) : { ...DEFAULT_IVR },
      outboundRoutes: JSON.parse(JSON.stringify(t.outboundRoutes || [])),
    });
    setFormErr([]);
    setIpInput(""); setDidInput("");
    setIvrItem({ key: "1", label: "", action: "assistant" });
    setRouteInput({ pattern: "", description: "", priority: 10 });
    setActiveSection("basic");
    setOpen(true);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setFormErr([]);
    setSaving(true);
    try {
      if (editing) {
        const res = await sipTrunkUpdate({ ...form, id: editing.id });
        setTrunks((prev) => prev.map((t) => t.id === editing.id ? res.trunk : t));
      } else {
        const res = await sipTrunkCreate(form);
        setTrunks((prev) => [res.trunk, ...prev]);
      }
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      try { setFormErr(JSON.parse(msg)); } catch { setFormErr([msg]); }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(t: SipTrunk) {
    if (!confirm(`Delete SIP trunk "${t.name}"? This cannot be undone.`)) return;
    try {
      await sipTrunkDelete({ id: t.id });
      setTrunks((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── Test ───────────────────────────────────────────────────────────────────
  async function handleTest(t: SipTrunk) {
    setTesting(t.id);
    setTestOpen(t.id);
    try {
      const res = await sipTrunkTest({ id: t.id });
      setTrunks((prev) => prev.map((x) => x.id === t.id
        ? { ...x, testResult: { success: res.ok, message: res.message, steps: res.steps, testedAt: new Date().toISOString() } }
        : x
      ));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  // ── Health check ───────────────────────────────────────────────────────────
  async function runHealthCheck() {
    setHcRunning(true);
    setHcExpanded(true);
    try {
      const res = await sipTrunkHealthCheck();
      setHcResult(res);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setHcRunning(false);
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  function setF(key: keyof SipTrunkInput, val: unknown) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "transport") {
        if (val === "tls" && (prev.port === 5060 || !prev.port)) next.port = 5061;
        if (val !== "tls" && (prev.port === 5061 || !prev.port)) next.port = 5060;
        if (val !== "tls" && prev.encryption === "required") next.encryption = "preferred";
      }
      if (key === "encryption" && val === "required") {
        next.transport = "tls";
        next.port = 5061;
      }
      return next;
    });
  }

  function toggleCodec(c: string) {
    setForm((prev) => ({
      ...prev,
      codecs: prev.codecs?.includes(c)
        ? prev.codecs.filter((x) => x !== c)
        : [...(prev.codecs || []), c],
    }));
  }

  function addIp() {
    const ip = ipInput.trim();
    if (!ip) return;
    setForm((prev) => ({ ...prev, allowedIps: [...(prev.allowedIps || []), ip] }));
    setIpInput("");
  }
  function removeIp(ip: string) {
    setForm((prev) => ({ ...prev, allowedIps: (prev.allowedIps || []).filter((x) => x !== ip) }));
  }

  // DID helpers
  function addDid() {
    const num = didInput.trim();
    if (!num) return;
    const newDid: SipDid = { id: `did_${Date.now()}`, number: num };
    setForm((prev) => ({ ...prev, dids: [...(prev.dids || []), newDid] }));
    setDidInput("");
  }
  function removeDid(id: string) {
    setForm((prev) => ({ ...prev, dids: (prev.dids || []).filter((d) => d.id !== id) }));
  }
  function updateDid(id: string, patch: Partial<SipDid>) {
    setForm((prev) => ({
      ...prev,
      dids: (prev.dids || []).map((d) => d.id === id ? { ...d, ...patch } : d),
    }));
  }

  // IVR helpers
  function setIvr(patch: Partial<SipIvrMenu>) {
    setForm((prev) => ({ ...prev, ivrMenu: { ...(prev.ivrMenu || DEFAULT_IVR), ...patch } }));
  }
  function addIvrItem() {
    if (!ivrItem.key || !ivrItem.label || !ivrItem.action) return;
    const item: SipIvrMenuItem = {
      key: ivrItem.key!,
      label: ivrItem.label!,
      action: ivrItem.action!,
      assistantId: ivrItem.assistantId,
      extension: ivrItem.extension,
    };
    setForm((prev) => ({
      ...prev,
      ivrMenu: { ...(prev.ivrMenu || DEFAULT_IVR), items: [...((prev.ivrMenu?.items) || []), item] },
    }));
    setIvrItem({ key: "1", label: "", action: "assistant" });
  }
  function removeIvrItem(key: string) {
    setForm((prev) => ({
      ...prev,
      ivrMenu: { ...(prev.ivrMenu || DEFAULT_IVR), items: (prev.ivrMenu?.items || []).filter((i) => i.key !== key) },
    }));
  }

  // Outbound route helpers
  function addRoute() {
    if (!routeInput.pattern.trim()) return;
    const route: SipOutboundRoute = {
      id: `route_${Date.now()}`,
      pattern: routeInput.pattern.trim(),
      description: routeInput.description.trim(),
      priority: routeInput.priority,
    };
    setForm((prev) => ({ ...prev, outboundRoutes: [...(prev.outboundRoutes || []), route] }));
    setRouteInput({ pattern: "", description: "", priority: 10 });
  }
  function removeRoute(id: string) {
    setForm((prev) => ({ ...prev, outboundRoutes: (prev.outboundRoutes || []).filter((r) => r.id !== id) }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const SECTIONS = [
    { id: "basic",    label: "Basic",          icon: <Globe       className="w-3.5 h-3.5" /> },
    { id: "conn",     label: "Connection",     icon: <Server      className="w-3.5 h-3.5" /> },
    { id: "security", label: "Security",       icon: <Lock        className="w-3.5 h-3.5" /> },
    { id: "dtmf",     label: "DTMF & Codecs",  icon: <Phone       className="w-3.5 h-3.5" /> },
    { id: "dids",     label: "DID Numbers",    icon: <Hash        className="w-3.5 h-3.5" /> },
    { id: "ivr",      label: "IVR Menu",       icon: <BookOpen    className="w-3.5 h-3.5" /> },
    { id: "routing",  label: "PBX Routing",    icon: <GitBranch   className="w-3.5 h-3.5" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Phone Numbers</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage PSTN numbers and SIP trunks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runHealthCheck}
            disabled={hcRunning}
            className="flex items-center gap-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {hcRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {hcRunning ? "Checking…" : "Health Check"}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add SIP Trunk
          </button>
        </div>
      </div>

      {/* Top tab bar */}
      <div className="flex border-b border-neutral-200 mb-6">
        <Link href="/phone-numbers" className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50">
          <Phone className="w-4 h-4" /> PSTN Numbers
        </Link>
        <Link href="/phone-numbers/sip" className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors border-[#F22F46] text-[#F22F46]">
          <Server className="w-4 h-4" /> SIP Trunks
        </Link>
      </div>

      {/* Inner tab bar */}
      <div className="flex gap-0.5 bg-neutral-100 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setInnerTab("trunks")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            innerTab === "trunks" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <Server className="w-3.5 h-3.5" /> Trunks
        </button>
        <button
          onClick={() => { setInnerTab("traces"); if (traces.length === 0) loadTraces(); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            innerTab === "traces" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          <FileSearch className="w-3.5 h-3.5" /> SIP Traces
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

      {/* ── Traces panel ──────────────────────────────────────────────────────── */}
      {innerTab === "traces" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-800">SIP Packet Traces</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Raw SIP signalling captured per call — download as .pcap to open in Wireshark</p>
            </div>
            <button
              onClick={loadTraces}
              disabled={tracesLoading}
              className="flex items-center gap-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {tracesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {tracesLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {tracesErr && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{tracesErr}</div>
          )}

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            {tracesLoading ? (
              <div className="p-8 text-center text-neutral-400 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading traces…
              </div>
            ) : traces.length === 0 ? (
              <div className="p-12 text-center">
                <FileSearch className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
                <p className="text-neutral-400 text-sm mb-1">No SIP traces yet</p>
                <p className="text-neutral-400 text-xs">Traces are captured automatically for each inbound SIP call once the bridge is configured and running.</p>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-5 py-2.5 bg-neutral-50 border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                  <span>From</span>
                  <span>To</span>
                  <span>Date / Time</span>
                  <span>Duration</span>
                  <span className="text-right">Download</span>
                </div>
                <div className="divide-y divide-neutral-50">
                  {traces.map((tr) => {
                    const startDate = new Date(tr.startMs);
                    const dur = tr.durationMs != null
                      ? tr.durationMs < 60000
                        ? `${Math.round(tr.durationMs / 1000)}s`
                        : `${Math.floor(tr.durationMs / 60000)}m ${Math.round((tr.durationMs % 60000) / 1000)}s`
                      : "—";
                    return (
                      <div key={tr.traceId} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 items-center hover:bg-neutral-50/60 text-sm">
                        <span className="font-mono text-neutral-700 truncate">{tr.from}</span>
                        <span className="font-mono text-neutral-700 truncate">{tr.to}</span>
                        <span className="text-neutral-500 text-xs">
                          {startDate.toLocaleDateString()} {startDate.toLocaleTimeString()}
                        </span>
                        <span className="text-neutral-500 text-xs tabular-nums">{dur}</span>
                        <a
                          href={sipTraceDownloadUrl(tr.traceId)}
                          download={`sip-trace-${tr.traceId}.pcap`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Download className="w-3 h-3" /> .pcap
                        </a>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-neutral-400 mt-3">
            💡 Open .pcap files in <strong>Wireshark</strong> — use filter <code className="bg-neutral-100 px-1 rounded">sip</code> to see SIP messages, or <code className="bg-neutral-100 px-1 rounded">rtp</code> for audio streams.
          </p>
        </div>
      )}

      {/* ── Trunks panel (all existing content) ────────────────────────────── */}
      {innerTab === "trunks" && (<>

      {/* Security info banner */}
      <div className="mb-5 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <strong>Security:</strong> SIP passwords are encrypted at rest (AES-256-GCM) and never returned by the API. Use <strong>TLS + SRTP Required</strong> for maximum security. IP allowlists are recommended for Peer trunks.
        </div>
      </div>

      {/* Asterisk Bridge Configuration Panel */}
      <div className="mb-5 border border-neutral-200 rounded-xl overflow-hidden bg-white">
        <button
          onClick={() => { setBridgeOpen((o) => !o); if (!bridgeOpen) loadBridgeConfig(); }}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-medium text-neutral-700">Asterisk Bridge Configuration</span>
            {bridgeHasSecret && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">Configured</span>
            )}
            {!bridgeHasSecret && !bridgeForm.asteriskBridgeUrl && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Not set up</span>
            )}
          </div>
          {bridgeOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </button>

        {bridgeOpen && (
          <div className="border-t border-neutral-100 p-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Connect your Asterisk PBX bridge so health checks can verify live SIP connectivity and the platform can route calls through your infrastructure.
            </p>

            {bridgeErr && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{bridgeErr}</div>
            )}
            {bridgeSaved && (
              <div className="flex items-center gap-1.5 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <Check className="w-3.5 h-3.5" /> Bridge configuration saved successfully.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Telephony Provider</label>
                <select
                  value={bridgeForm.telephonyProvider}
                  onChange={(e) => setBridgeForm((p) => ({ ...p, telephonyProvider: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                >
                  <option value="asterisk">Asterisk PBX</option>
                  <option value="freeswitch">FreeSWITCH</option>
                  <option value="kamailio">Kamailio</option>
                  <option value="generic">Generic SIP</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Bridge URL</label>
                <input
                  value={bridgeForm.asteriskBridgeUrl}
                  onChange={(e) => setBridgeForm((p) => ({ ...p, asteriskBridgeUrl: e.target.value }))}
                  placeholder="https://bridge.example.com"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                  Bridge Secret
                  {bridgeHasSecret && <span className="ml-1.5 font-normal text-neutral-400">— leave blank to keep current</span>}
                </label>
                <div className="relative">
                  <input
                    type={bridgeShowSecret ? "text" : "password"}
                    value={bridgeForm.asteriskBridgeSecret}
                    onChange={(e) => setBridgeForm((p) => ({ ...p, asteriskBridgeSecret: e.target.value }))}
                    placeholder={bridgeHasSecret ? "••••••••" : "Shared secret / API key"}
                    autoComplete="new-password"
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm pr-9 focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                  />
                  <button
                    type="button"
                    onClick={() => setBridgeShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {bridgeShowSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">🔒 Stored encrypted. Never returned by the API.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Default Caller ID (E.164)</label>
                <input
                  value={bridgeForm.asteriskCallerId}
                  onChange={(e) => setBridgeForm((p) => ({ ...p, asteriskCallerId: e.target.value }))}
                  placeholder="+972501234567"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">Asterisk SIP Trunk Name</label>
                <input
                  value={bridgeForm.asteriskSipTrunkName}
                  onChange={(e) => setBridgeForm((p) => ({ ...p, asteriskSipTrunkName: e.target.value }))}
                  placeholder="e.g. SIP/myprovider"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
                />
                <p className="text-[10px] text-neutral-400 mt-1">The trunk name as configured in Asterisk (used for dial-plan routing).</p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={saveBridgeConfig}
                disabled={bridgeSaving}
                className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {bridgeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {bridgeSaving ? "Saving…" : "Save Bridge Config"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Health Check Panel */}
      {hcResult && hcExpanded && (
        <div className={`mb-5 border rounded-xl overflow-hidden ${
          hcResult.summary === "critical" ? "border-red-200 bg-red-50" :
          hcResult.summary === "warning"  ? "border-amber-200 bg-amber-50" :
          "border-green-200 bg-green-50"
        }`}>
          {/* Panel header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            hcResult.summary === "critical" ? "border-red-200" :
            hcResult.summary === "warning"  ? "border-amber-200" :
            "border-green-200"
          }`}>
            <div className="flex items-center gap-2">
              {hcResult.summary === "critical" ? <XCircle       className="w-4 h-4 text-red-500"    /> :
               hcResult.summary === "warning"  ? <AlertTriangle className="w-4 h-4 text-amber-500"  /> :
                                                 <CheckCircle2  className="w-4 h-4 text-green-600"  />}
              <span className={`text-sm font-semibold ${
                hcResult.summary === "critical" ? "text-red-800" :
                hcResult.summary === "warning"  ? "text-amber-800" :
                "text-green-800"
              }`}>
                SIP Health Check —{" "}
                {hcResult.summary === "critical" ? "Critical issues found" :
                 hcResult.summary === "warning"  ? "Warnings detected" :
                 "All systems healthy"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                hcResult.summary === "critical" ? "bg-red-100 text-red-600" :
                hcResult.summary === "warning"  ? "bg-amber-100 text-amber-600" :
                "bg-green-100 text-green-600"
              }`}>
                {hcResult.trunkCount} trunk{hcResult.trunkCount !== 1 ? "s" : ""} checked
              </span>
              <span className="text-xs text-neutral-400">
                {new Date(hcResult.checkedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={runHealthCheck} disabled={hcRunning} title="Re-run"
                className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-white/60 rounded-lg transition-colors disabled:opacity-40">
                <RefreshCw className={`w-3.5 h-3.5 ${hcRunning ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setHcExpanded(false)}
                className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-white/60 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Asterisk Bridge status */}
            <div>
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Asterisk Bridge</div>
              <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${
                hcResult.bridge.status === "online"         ? "bg-white border-green-200" :
                hcResult.bridge.status === "unconfigured" || hcResult.bridge.status === "not_linked"
                                                            ? "bg-white border-neutral-200" :
                "bg-white border-red-200"
              }`}>
                {hcResult.bridge.status === "online"   ? <Wifi    className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" /> :
                 hcResult.bridge.status === "offline" || hcResult.bridge.status === "misconfigured"
                                                        ? <WifiOff className="w-4 h-4 text-red-400  flex-shrink-0 mt-0.5" /> :
                 <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-neutral-800 text-xs">
                    {hcResult.bridge.status === "online"       ? "Bridge online" :
                     hcResult.bridge.status === "offline"      ? "Bridge offline" :
                     hcResult.bridge.status === "misconfigured"? "Misconfigured" :
                     hcResult.bridge.status === "not_linked"   ? "Not linked" :
                     "Not configured"}
                    {hcResult.bridge.url && <span className="ml-1.5 font-normal text-neutral-400 font-mono">{hcResult.bridge.url}</span>}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">{hcResult.bridge.detail}</div>
                  {hcResult.bridge.status === "online" && (
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className={`flex items-center gap-1 ${hcResult.bridge.asteriskConnected ? "text-green-600" : "text-amber-500"}`}>
                        {hcResult.bridge.asteriskConnected ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        Asterisk PBX {hcResult.bridge.asteriskConnected ? "connected" : "disconnected"}
                      </span>
                      <span className="text-neutral-400">{hcResult.bridge.activeCalls} active call{hcResult.bridge.activeCalls !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Per-trunk results */}
            {hcResult.trunks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Trunks</div>
                <div className="space-y-2">
                  {hcResult.trunks.map((tr) => (
                    <div key={tr.id} className={`bg-white border rounded-xl overflow-hidden ${
                      tr.health === "critical" ? "border-red-200" :
                      tr.health === "warning"  ? "border-amber-200" :
                      "border-green-200"
                    }`}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {tr.health === "critical" ? <XCircle       className="w-3.5 h-3.5 text-red-500    flex-shrink-0" /> :
                         tr.health === "warning"  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500  flex-shrink-0" /> :
                                                    <CheckCircle2  className="w-3.5 h-3.5 text-green-500  flex-shrink-0" />}
                        <span className="text-sm font-medium text-neutral-800 flex-1">{tr.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          tr.type === "register" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"
                        }`}>{tr.type.toUpperCase()}</span>
                        {tr.transport && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-medium font-mono">{tr.transport.toUpperCase()}</span>
                        )}
                        {tr.status === "inactive" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-medium">INACTIVE</span>}
                      </div>
                      {/* Check rows */}
                      <div className="border-t border-neutral-100 divide-y divide-neutral-50">
                        {tr.checks.map((c) => (
                          <div key={c.id} className={`flex items-start gap-2 px-3 py-1.5 text-xs ${c.id === "ip_security" && c.ok === false ? "bg-red-50" : ""}`}>
                            {c.id === "ip_security" && c.ok === false
                              ? <ShieldAlert className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                              : c.id === "ip_security" && c.ok === true
                              ? <ShieldCheck className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                              : c.ok === true  ? <Check        className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                              : c.ok === false ? <X            className="w-3 h-3 text-red-400   flex-shrink-0 mt-0.5" />
                                               : <AlertCircle className="w-3 h-3 text-neutral-300 flex-shrink-0 mt-0.5" />}
                            <span className={`font-medium w-32 flex-shrink-0 ${c.id === "ip_security" && c.ok === false ? "text-red-700" : "text-neutral-600"}`}>{c.label}</span>
                            <span className={`flex-1 ${c.ok === false ? "text-red-600" : c.ok === null ? "text-neutral-400 italic" : "text-neutral-500"}`}>{c.detail}</span>
                          </div>
                        ))}
                      </div>
                      {/* Trace log */}
                      {tr.trace && tr.trace.length > 0 && (
                        <details className="border-t border-neutral-100">
                          <summary className="px-3 py-1.5 text-[10px] font-medium text-neutral-400 uppercase tracking-wide cursor-pointer hover:bg-neutral-50 select-none">
                            Request trace ({tr.trace.length} steps)
                          </summary>
                          <div className="bg-neutral-950 px-3 py-2 font-mono text-[10px] leading-relaxed space-y-0.5 max-h-40 overflow-y-auto">
                            {tr.trace.map((line, i) => (
                              <div key={i} className={
                                line.includes("✓") ? "text-green-400" :
                                line.includes("✗") ? "text-red-400" :
                                line.includes("⚠") ? "text-amber-400" :
                                line.startsWith("[START]") || line.startsWith("[END]") ? "text-blue-300" :
                                "text-neutral-400"
                              }>{line}</div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Issues summary */}
            {hcResult.issues.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Issues ({hcResult.issues.length})</div>
                <div className="space-y-1.5">
                  {hcResult.issues.map((issue, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${
                      issue.severity === "critical" ? "bg-red-100 text-red-800" :
                      issue.severity === "warning"  ? "bg-amber-100 text-amber-800" :
                      "bg-blue-50 text-blue-700"
                    }`}>
                      {issue.severity === "critical" ? <XCircle       className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                       issue.severity === "warning"  ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> :
                                                       <AlertCircle   className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                      {issue.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hcResult.issues.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                No issues detected — your SIP configuration looks healthy.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trunk list */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : trunks.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-8 h-8 text-neutral-200 mx-auto mb-2" />
            <p className="text-neutral-400 text-sm mb-1">No SIP trunks configured</p>
            <p className="text-neutral-400 text-xs mb-4">Connect your Vonage, Bandwidth, Twilio SIP, or any SIP/2.0 provider.</p>
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 text-[#0066CC] hover:underline text-sm">
              <Plus className="w-3.5 h-3.5" /> Add your first SIP trunk
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {trunks.map((t) => (
              <div key={t.id}>
                <div className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50/60 transition-colors">
                  {/* Type badge */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold uppercase ${
                    t.type === "register" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"
                  }`}>
                    {t.type === "register" ? "REG" : "PEER"}
                  </div>

                  {/* Name + host */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-neutral-900">{t.name}</span>
                      {t.status === "inactive" && (
                        <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-[10px] font-medium">Inactive</span>
                      )}
                      {(t.dids?.length ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded text-[10px] font-medium">
                          {t.dids!.length} DID{t.dids!.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {t.ivrMenu?.enabled && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">IVR</span>
                      )}
                      {/* Anti-fraud warning: Peer trunk with no IP allowlist */}
                      {t.type === "peer" && (t.allowedIps?.length ?? 0) === 0 && (
                        <span title="No IP allowlist — any IP can send calls through this trunk (toll fraud risk)" className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[10px] font-medium">
                          <ShieldAlert className="w-2.5 h-2.5" /> No IP allowlist
                        </span>
                      )}
                      {/* Show IP count if allowlist is set */}
                      {t.type === "peer" && (t.allowedIps?.length ?? 0) > 0 && (
                        <span title={`Allowed: ${t.allowedIps!.join(", ")}`} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium">
                          <ShieldCheck className="w-2.5 h-2.5" /> {t.allowedIps!.length} IP{t.allowedIps!.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5 font-mono truncate">
                      {t.type === "register" ? (t.registrar || "—") : (t.host || "—")} :{t.port}
                    </div>
                  </div>

                  {/* Security badges */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {encLabel(t.encryption)}
                    {transLabel(t.transport)}
                    <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-medium uppercase">{t.dtmfMode}</span>
                  </div>

                  {/* Connection status — #1: Link2/Unlink instead of Wifi icons */}
                  <div className="flex-shrink-0">
                    {t.testResult ? (
                      t.testResult.success
                        ? <span title="Connected — last test passed">
                            <Link2 className="w-4 h-4 text-green-500" />
                          </span>
                        : <span title="Disconnected — last test failed">
                            <Unlink className="w-4 h-4 text-red-400" />
                          </span>
                    ) : (
                      <span title="Not tested yet">
                        <div className="w-4 h-4 rounded-full bg-neutral-200" />
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleTest(t)} disabled={testing === t.id} title="Test connectivity"
                      className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40">
                      {testing === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => openEdit(t)} title="Edit"
                      className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(t)} title="Delete"
                      className="w-7 h-7 flex items-center justify-center text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                      className="w-7 h-7 flex items-center justify-center text-neutral-300 hover:text-neutral-600 rounded-lg transition-colors">
                      {expanded === t.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded === t.id && (
                  <div className="bg-neutral-50 border-t border-neutral-100 px-5 py-4 space-y-4 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Detail label="Type"        value={t.type === "register" ? "Register (SIP UA)" : "Peer (IP-based)"} />
                      <Detail label="Transport"    value={`${t.transport.toUpperCase()} :${t.port}`} />
                      <Detail label="Encryption"   value={t.encryption.charAt(0).toUpperCase() + t.encryption.slice(1)} />
                      <Detail label="DTMF"         value={t.dtmfMode === "rfc2833" ? "RFC 2833 / RTP Events" : t.dtmfMode} />
                      <Detail label="Codecs"       value={t.codecs.join(", ") || "—"} />
                      <Detail label="Max Channels" value={t.maxChannels ? String(t.maxChannels) : "Unlimited"} />
                      {t.callerId && <Detail label="Caller ID" value={t.callerId} />}
                      {t.type === "register" && t.username && <Detail label="Username" value={t.username} />}
                      {t.type === "register" && t.domain   && <Detail label="Domain"   value={t.domain}   />}
                      {t.type === "peer" && t.allowedIps && t.allowedIps.length > 0 && (
                        <Detail label="Allowed IPs" value={t.allowedIps.join(", ")} />
                      )}
                    </div>

                    {/* DIDs */}
                    {(t.dids?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">DID Numbers</div>
                        <div className="flex flex-wrap gap-2">
                          {t.dids!.map((d) => {
                            const aName = assistants.find((a) => a.id === d.assistantId)?.name;
                            return (
                              <div key={d.id} className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2 py-1">
                                <Hash className="w-3 h-3 text-neutral-400" />
                                <span className="font-mono text-neutral-700">{d.number}</span>
                                {aName && <span className="text-neutral-400">→ {aName}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* IVR */}
                    {t.ivrMenu?.enabled && t.ivrMenu.items.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">IVR Menu</div>
                        <div className="space-y-1">
                          {t.ivrMenu.items.map((item) => {
                            const aName = assistants.find((a) => a.id === item.assistantId)?.name;
                            return (
                              <div key={item.key} className="flex items-center gap-2 text-neutral-600">
                                <span className="w-5 h-5 flex items-center justify-center bg-neutral-100 rounded font-mono font-bold text-[10px]">{item.key}</span>
                                <span>{item.label}</span>
                                {item.action === "assistant" && aName && <span className="text-neutral-400">→ {aName}</span>}
                                {item.action === "extension"  && item.extension && <span className="text-neutral-400">→ ext {item.extension}</span>}
                                {item.action === "hangup"     && <span className="text-neutral-400">→ Hangup</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Outbound routes */}
                    {(t.outboundRoutes?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">Outbound Routes</div>
                        <div className="space-y-1">
                          {t.outboundRoutes!.map((r) => (
                            <div key={r.id} className="flex items-center gap-2 text-neutral-600">
                              <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">{r.pattern}</span>
                              <span>{r.description}</span>
                              <span className="text-neutral-400 text-[10px]">priority {r.priority}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Test result */}
                    {t.testResult && (
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">Last Test</div>
                        <div className={`flex items-center gap-1.5 mb-1 ${t.testResult.success ? "text-green-700" : "text-red-600"}`}>
                          {t.testResult.success ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          {t.testResult.message}
                        </div>
                        <div className="space-y-0.5">
                          {t.testResult.steps?.map((s) => (
                            <div key={s.step} className="flex items-center gap-1.5 text-neutral-500">
                              {s.ok ? <Check className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-red-400" />}
                              <span className="font-medium uppercase">{s.step}</span>: {s.detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── End of trunks panel ──────────────────────────────────────────────── */}
      </>)}

      {/* ── Create / Edit Modal ───────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-100">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">
                  {editing ? `Edit SIP Trunk — ${editing.name}` : "Add SIP Trunk"}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">Configure connection, security, DIDs, IVR and outbound routing</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section nav */}
            <div className="flex border-b border-neutral-100 overflow-x-auto">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    activeSection === s.id
                      ? "border-[#F22F46] text-[#F22F46]"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {s.icon}{s.label}
                </button>
              ))}
            </div>

            <div className="p-6 min-h-[320px]">
              {/* Validation errors */}
              {formErr.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <p className="text-red-700 font-medium mb-1.5">Please fix the following errors:</p>
                  <ul className="space-y-0.5">
                    {formErr.map((e, i) => {
                      const tabMatch = e.match(/^\[([^\]]+)\]\s*/);
                      const tab = tabMatch?.[1] ?? null;
                      const msg = tab ? e.replace(tabMatch![0], "") : e;
                      return (
                        <li key={i} className="flex items-start gap-1.5 text-red-600">
                          <span className="mt-0.5 flex-shrink-0">•</span>
                          <span>
                            {tab && <span className="font-semibold text-red-700 mr-1">({tab})</span>}
                            {msg}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* ── Basic ─────────────────────────────────────────────────── */}
              {activeSection === "basic" && (
                <div className="space-y-4">
                  <div>
                    <Label>Display Name</Label>
                    <input value={form.name} onChange={(e) => setF("name", e.target.value)}
                      placeholder="My SIP Provider" className={inputCls} />
                  </div>
                  <div>
                    <Label>Authentication Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["register", "peer"] as SipTrunkType[]).map((t) => (
                        <button key={t} type="button" onClick={() => setF("type", t)}
                          className={`p-3 border rounded-xl text-left transition-colors ${form.type === t ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                          <div className="text-sm font-medium text-neutral-800 capitalize">{t}</div>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            {t === "register" ? "Platform registers as SIP UA with credentials" : "IP-based auth — no registration, restrict by source IP"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Max Concurrent Channels <span className="text-neutral-400 font-normal">(0 = unlimited)</span></Label>
                      <input type="number" value={form.maxChannels} onChange={(e) => setF("maxChannels", parseInt(e.target.value) || 0)}
                        className={inputCls} min={0} max={1000} />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select value={form.status} onChange={(e) => setF("status", e.target.value)} className={inputCls}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Connection ────────────────────────────────────────────── */}
              {activeSection === "conn" && (
                <div className="space-y-4">
                  {form.type === "register" ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Registrar (FQDN or IP)</Label>
                        <input value={form.registrar} onChange={(e) => setF("registrar", e.target.value)}
                          placeholder="sip.provider.com" className={inputCls} />
                      </div>
                      <div>
                        <Label>SIP Domain</Label>
                        <input value={form.domain} onChange={(e) => setF("domain", e.target.value)}
                          placeholder="provider.com" className={inputCls} />
                      </div>
                      <div>
                        <Label>Username</Label>
                        <input value={form.username} onChange={(e) => setF("username", e.target.value)}
                          placeholder="1001" className={inputCls} autoComplete="off" />
                      </div>
                      <div>
                        <Label>Auth Username <span className="text-neutral-400 font-normal">(optional)</span></Label>
                        <input value={form.authUsername} onChange={(e) => setF("authUsername", e.target.value)}
                          placeholder="Same as username" className={inputCls} autoComplete="off" />
                      </div>
                      <div className="col-span-2">
                        <Label>Password{editing?.hasPassword && <span className="ml-1.5 text-neutral-400 font-normal">— leave blank to keep current</span>}</Label>
                        <input type="password" value={form.password} onChange={(e) => setF("password", e.target.value)}
                          placeholder={editing?.hasPassword ? "••••••••" : "SIP password"}
                          className={inputCls} autoComplete="new-password" />
                        <p className="text-[10px] text-neutral-400 mt-1">🔒 Stored encrypted (AES-256-GCM). Never returned by the API.</p>
                      </div>
                      <div>
                        <Label>Port</Label>
                        <input type="number" value={form.port} onChange={(e) => setF("port", parseInt(e.target.value) || 5061)}
                          className={inputCls} min={1024} max={65535} />
                      </div>
                      <div>
                        <Label>Caller ID (E.164)</Label>
                        <input value={form.callerId} onChange={(e) => setF("callerId", e.target.value)}
                          placeholder="+12025551234" className={inputCls} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Host (FQDN or IP)</Label>
                          <input value={form.host} onChange={(e) => setF("host", e.target.value)}
                            placeholder="203.0.113.10" className={inputCls} />
                        </div>
                        <div>
                          <Label>Port</Label>
                          <input type="number" value={form.port} onChange={(e) => setF("port", parseInt(e.target.value) || 5060)}
                            className={inputCls} min={1024} max={65535} />
                        </div>
                      </div>
                      <div>
                        <Label>Allowed Source IPs <span className="text-neutral-400 font-normal">(IPv4 or CIDR, max 20)</span></Label>
                        <div className="flex gap-2 mb-2">
                          <input value={ipInput} onChange={(e) => setIpInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIp())}
                            placeholder="1.2.3.4 or 1.2.3.0/24" className={inputCls + " flex-1"} />
                          <button type="button" onClick={addIp}
                            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm rounded-lg transition-colors">Add</button>
                        </div>
                        {(form.allowedIps || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {(form.allowedIps || []).map((ip) => (
                              <span key={ip} className="flex items-center gap-1 px-2 py-1 bg-neutral-100 text-neutral-700 rounded-lg text-xs font-mono">
                                {ip}
                                <button type="button" onClick={() => removeIp(ip)} className="text-neutral-400 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Caller ID (E.164)</Label>
                        <input value={form.callerId} onChange={(e) => setF("callerId", e.target.value)}
                          placeholder="+12025551234" className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Security ──────────────────────────────────────────────── */}
              {activeSection === "security" && (
                <div className="space-y-4">
                  <div>
                    <Label>Signalling Transport</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {TRANS_OPTIONS.map((o) => (
                        <button key={o.value} type="button" onClick={() => setF("transport", o.value)}
                          className={`p-2.5 border rounded-xl text-left transition-colors ${form.transport === o.value ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                          <div className="text-xs font-semibold text-neutral-800">{o.label}</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5 leading-tight">{o.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Media Encryption (SRTP)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {ENC_OPTIONS.map((o) => (
                        <button key={o.value} type="button" onClick={() => setF("encryption", o.value)}
                          className={`p-2.5 border rounded-xl text-left transition-colors ${form.encryption === o.value ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                          <div className="flex items-center gap-1 mb-0.5">{o.icon}<span className="text-xs font-semibold text-neutral-800">{o.label}</span></div>
                          <div className="text-[10px] text-neutral-400 leading-tight">{o.desc}</div>
                        </button>
                      ))}
                    </div>
                    {form.encryption === "required" && form.transport !== "tls" && (
                      <p className="mt-1.5 text-xs text-amber-600">⚠️ Transport will be set to TLS when encryption is Required</p>
                    )}
                    {form.encryption === "disabled" && (
                      <p className="mt-1.5 text-xs text-red-500">⚠️ No media encryption — use only on trusted private networks</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── DTMF & Codecs ─────────────────────────────────────────── */}
              {activeSection === "dtmf" && (
                <div className="space-y-4">
                  <div>
                    <Label>DTMF Mode</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {DTMF_OPTIONS.map((o) => (
                        <button key={o.value} type="button" onClick={() => setF("dtmfMode", o.value)}
                          className={`p-2.5 border rounded-xl text-left transition-colors ${form.dtmfMode === o.value ? "border-[#F22F46] bg-red-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                          <div className="text-xs font-semibold text-neutral-800">{o.label}</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">{o.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Audio Codecs <span className="text-neutral-400 font-normal">(priority order — select all that apply)</span></Label>
                    <div className="flex flex-wrap gap-2">
                      {CODEC_OPTIONS.map((c) => (
                        <button key={c} type="button" onClick={() => toggleCodec(c)}
                          className={`px-3 py-1.5 border rounded-lg text-xs font-mono font-medium transition-colors ${
                            form.codecs?.includes(c) ? "border-[#F22F46] bg-red-50 text-[#F22F46]" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                          }`}>{c}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── DID Numbers ───────────────────────────────────────────── */}
              {activeSection === "dids" && (
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500">
                    Add DID numbers provisioned by your SIP provider. Each DID can be assigned to an assistant for inbound call routing.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={didInput}
                      onChange={(e) => setDidInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDid())}
                      placeholder="+972501234567"
                      className={inputCls + " flex-1"}
                    />
                    <button type="button" onClick={addDid}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm rounded-lg transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add DID
                    </button>
                  </div>

                  {(form.dids || []).length === 0 ? (
                    <div className="border border-dashed border-neutral-200 rounded-xl p-8 text-center">
                      <Hash className="w-6 h-6 text-neutral-300 mx-auto mb-2" />
                      <p className="text-xs text-neutral-400">No DID numbers added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(form.dids || []).map((did) => (
                        <div key={did.id} className="flex items-center gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                          <Hash className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                          <span className="font-mono text-sm text-neutral-800 flex-shrink-0">{did.number}</span>
                          <select
                            value={did.assistantId || ""}
                            onChange={(e) => updateDid(did.id, { assistantId: e.target.value || undefined })}
                            className="flex-1 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#F22F46]"
                          >
                            <option value="">— No assistant assigned —</option>
                            {assistants.map((a) => (
                              <option key={a.id} value={a.id}>{a.name || a.assistantName}</option>
                            ))}
                          </select>
                          <input
                            value={did.description || ""}
                            onChange={(e) => updateDid(did.id, { description: e.target.value })}
                            placeholder="Description (optional)"
                            className="w-36 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#F22F46]"
                          />
                          <button type="button" onClick={() => removeDid(did.id)}
                            className="text-neutral-300 hover:text-red-500 transition-colors flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── IVR Menu ──────────────────────────────────────────────── */}
              {activeSection === "ivr" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-neutral-800">Enable IVR / DTMF Menu</div>
                      <div className="text-xs text-neutral-400">Play a menu on inbound calls and route based on key press</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIvr({ enabled: !form.ivrMenu?.enabled })}
                      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.ivrMenu?.enabled ? "bg-[#F22F46]" : "bg-neutral-200"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.ivrMenu?.enabled ? "translate-x-5" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {form.ivrMenu?.enabled && (
                    <>
                      <div>
                        <Label>Menu Prompt (TTS)</Label>
                        <textarea
                          value={form.ivrMenu?.prompt || ""}
                          onChange={(e) => setIvr({ prompt: e.target.value })}
                          rows={2}
                          placeholder='e.g. "For Sales press 1. For Support press 2. To speak with an operator press 0."'
                          className={inputCls + " resize-none"}
                        />
                      </div>
                      <div className="w-32">
                        <Label>Input Timeout (sec)</Label>
                        <input type="number" value={form.ivrMenu?.timeout || 5}
                          onChange={(e) => setIvr({ timeout: parseInt(e.target.value) || 5 })}
                          className={inputCls} min={2} max={30} />
                      </div>

                      <div>
                        <Label>Menu Items</Label>
                        <div className="space-y-2 mb-3">
                          {(form.ivrMenu?.items || []).length === 0 ? (
                            <p className="text-xs text-neutral-400 py-2">No menu items yet — add one below</p>
                          ) : (
                            (form.ivrMenu?.items || []).map((item) => (
                              <div key={item.key} className="flex items-center gap-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                                <span className="w-7 h-7 flex items-center justify-center bg-[#F22F46]/10 text-[#F22F46] rounded-lg font-mono font-bold text-sm flex-shrink-0">{item.key}</span>
                                <span className="text-sm font-medium text-neutral-800 flex-1">{item.label}</span>
                                <span className="text-xs text-neutral-400">
                                  {item.action === "assistant" && (assistants.find((a) => a.id === item.assistantId)?.name || "No assistant")}
                                  {item.action === "extension" && `ext ${item.extension}`}
                                  {item.action === "hangup"    && "Hangup"}
                                </span>
                                <button type="button" onClick={() => removeIvrItem(item.key)}
                                  className="text-neutral-300 hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add item row */}
                        <div className="flex gap-2 items-end p-3 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                          <div>
                            <Label>Key</Label>
                            <select value={ivrItem.key || "1"} onChange={(e) => setIvrItem((p) => ({ ...p, key: e.target.value }))}
                              className="w-16 border border-neutral-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-[#F22F46]">
                              {DTMF_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <div className="flex-1">
                            <Label>Label</Label>
                            <input value={ivrItem.label || ""} onChange={(e) => setIvrItem((p) => ({ ...p, label: e.target.value }))}
                              placeholder='e.g. "Sales"' className={inputCls} />
                          </div>
                          <div>
                            <Label>Action</Label>
                            <select value={ivrItem.action || "assistant"} onChange={(e) => setIvrItem((p) => ({ ...p, action: e.target.value as SipIvrMenuItem["action"] }))}
                              className="border border-neutral-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:border-[#F22F46]">
                              <option value="assistant">→ Assistant</option>
                              <option value="extension">→ Extension</option>
                              <option value="hangup">Hangup</option>
                            </select>
                          </div>
                          {ivrItem.action === "assistant" && (
                            <div className="flex-1">
                              <Label>Assistant</Label>
                              <select value={ivrItem.assistantId || ""} onChange={(e) => setIvrItem((p) => ({ ...p, assistantId: e.target.value }))}
                                className={inputCls}>
                                <option value="">— Select —</option>
                                {assistants.map((a) => <option key={a.id} value={a.id}>{a.name || a.assistantName}</option>)}
                              </select>
                            </div>
                          )}
                          {ivrItem.action === "extension" && (
                            <div>
                              <Label>Ext.</Label>
                              <input value={ivrItem.extension || ""} onChange={(e) => setIvrItem((p) => ({ ...p, extension: e.target.value }))}
                                placeholder="101" className="w-20 border border-neutral-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:border-[#F22F46]" />
                            </div>
                          )}
                          <button type="button" onClick={addIvrItem}
                            className="flex items-center gap-1 px-3 py-2.5 bg-[#F22F46] hover:bg-[#d9243b] text-white text-xs rounded-lg transition-colors">
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── PBX Routing ───────────────────────────────────────────── */}
              {activeSection === "routing" && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
                    <strong>Outbound routing rules</strong> — when making an outbound call, the system finds the trunk whose pattern matches the destination number prefix (E.164). Lower priority number = tried first.
                    <br />Each tenant&apos;s rules are isolated — other tenants&apos; routes never affect your calls.
                  </div>

                  <div className="space-y-2">
                    {(form.outboundRoutes || []).length === 0 ? (
                      <div className="border border-dashed border-neutral-200 rounded-xl p-6 text-center">
                        <GitBranch className="w-6 h-6 text-neutral-300 mx-auto mb-2" />
                        <p className="text-xs text-neutral-400">No routing rules — calls use default Twilio PSTN</p>
                      </div>
                    ) : (
                      (form.outboundRoutes || [])
                        .sort((a, b) => a.priority - b.priority)
                        .map((r) => (
                          <div key={r.id} className="flex items-center gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                            <span className="w-7 h-7 flex items-center justify-center bg-neutral-100 text-neutral-500 rounded-lg text-xs font-bold flex-shrink-0">{r.priority}</span>
                            <span className="font-mono text-sm text-neutral-800 flex-shrink-0">{r.pattern}</span>
                            <span className="text-sm text-neutral-500 flex-1">{r.description}</span>
                            <button type="button" onClick={() => removeRoute(r.id)}
                              className="text-neutral-300 hover:text-red-500 transition-colors flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                    )}
                  </div>

                  {/* Add route */}
                  <div className="flex gap-2 items-end p-3 bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                    <div>
                      <Label>E.164 Prefix</Label>
                      <input value={routeInput.pattern} onChange={(e) => setRouteInput((p) => ({ ...p, pattern: e.target.value }))}
                        placeholder="+972" className="w-28 border border-neutral-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:border-[#F22F46]" />
                    </div>
                    <div className="flex-1">
                      <Label>Description</Label>
                      <input value={routeInput.description} onChange={(e) => setRouteInput((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Israel numbers" className={inputCls} />
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <input type="number" value={routeInput.priority} onChange={(e) => setRouteInput((p) => ({ ...p, priority: parseInt(e.target.value) || 10 }))}
                        className="w-20 border border-neutral-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:border-[#F22F46]" min={1} />
                    </div>
                    <button type="button" onClick={addRoute}
                      className="flex items-center gap-1 px-3 py-2.5 bg-[#F22F46] hover:bg-[#d9243b] text-white text-xs rounded-lg transition-colors">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  {/* Outbound SIP selection note */}
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <PhoneOutgoing className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span><strong>Outbound calls</strong> — when placing a call from the Calls page or a campaign, you can select which SIP trunk to route through. These routing rules act as the automatic fallback when no trunk is manually selected.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-neutral-100">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving..." : editing ? "Save Changes" : "Create SIP Trunk"}
              </button>
              <button onClick={() => setOpen(false)}
                className="px-5 py-2.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">{children}</label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-xs text-neutral-700 font-mono">{value}</div>
    </div>
  );
}

const inputCls = "w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]";
