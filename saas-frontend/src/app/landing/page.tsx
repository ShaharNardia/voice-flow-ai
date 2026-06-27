"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PhoneCall, ShieldCheck, FileText, ShoppingCart, Network, Headphones,
  Globe, Zap, BarChart3, GitBranch, Bot, CheckCircle2, ArrowRight,
  ChevronRight, Play, Star, TrendingUp, Lock, Cpu, Layers, Phone,
  MessageSquare, Clock, Users, DollarSign, Award,
} from "lucide-react";

// ── Waveform animation ───────────────────────────────────────────────────────
function Waveform({ color = "#F22F46", bars = 7 }: { color?: string; bars?: number }) {
  const heights = [40, 65, 85, 100, 75, 55, 35];
  return (
    <div className="flex items-center gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="waveform-bar rounded-full"
          style={{
            width: 3,
            height: `${heights[i % heights.length]}%`,
            background: color,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Ripple ring ───────────────────────────────────────────────────────────────
function RippleRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="ripple-ring absolute rounded-full border border-[#F22F46]/30"
          style={{ width: 120 * i, height: 120 * i, animationDelay: `${(i - 1) * 0.6}s` }}
        />
      ))}
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon, gradient, label, desc, tag, delay = 0,
}: {
  icon: React.ElementType;
  gradient: string;
  label: string;
  desc: string;
  tag?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="glass-card rounded-2xl p-6 group hover:border-white/20 transition-all duration-500 relative overflow-hidden cursor-default"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms, border-color 0.3s`,
      }}
    >
      {/* Gradient glow on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 ${gradient} rounded-2xl`} />

      {tag && (
        <span className="absolute top-4 right-4 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#F22F46]/20 text-[#F22F46] border border-[#F22F46]/30">
          {tag}
        </span>
      )}

      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-5 h-5 text-white" />
      </div>

      <h3 className="text-base font-bold text-white mb-2 leading-tight">{label}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{desc}</p>
    </div>
  );
}

// ── Stat counter ───────────────────────────────────────────────────────────────
function StatCounter({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1800;
          const steps = 60;
          const inc = value / steps;
          let cur = 0;
          const t = setInterval(() => {
            cur += inc;
            if (cur >= value) { setCount(value); clearInterval(t); }
            else setCount(Math.floor(cur));
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-black text-white tabular-nums">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-white/40 mt-2 font-medium">{label}</div>
    </div>
  );
}

// ── Testimonial / quote card ───────────────────────────────────────────────────
function QuoteCard({ text, name, title, avatar }: { text: string; name: string; title: string; avatar: string }) {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex gap-1 mb-1">
        {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
      </div>
      <p className="text-sm text-white/70 leading-relaxed italic">"{text}"</p>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F22F46] to-purple-600 flex items-center justify-center text-white font-bold text-sm">
          {avatar}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-white/40">{title}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const FEATURES = [
    {
      icon: ShieldCheck,
      gradient: "from-emerald-500 to-teal-600",
      label: "Compliance Intelligence",
      desc: "TCPA, GDPR, HIPAA enforcement at the infrastructure level. Real-time DNC checking, call-time validation, and PII detection on every utterance. Compliance score 0–100.",
      tag: "Enterprise",
      delay: 0,
    },
    {
      icon: FileText,
      gradient: "from-violet-500 to-purple-700",
      label: "Verbal Contract Engine",
      desc: "Record legally-binding verbal agreements over the phone. SHA-256 tamper-proof hash seals every contract. Built-in template system with variable substitution.",
      tag: "Unique",
      delay: 80,
    },
    {
      icon: ShoppingCart,
      gradient: "from-pink-500 to-rose-600",
      label: "Voice Commerce",
      desc: "Complete purchase flows over a phone call — no website required. Product catalog, in-call cart, Stripe PaymentLink sent to caller by SMS. Zero PCI exposure.",
      tag: "Unique",
      delay: 160,
    },
    {
      icon: Globe,
      gradient: "from-blue-500 to-indigo-600",
      label: "Multilingual Translation",
      desc: "Three modes: Interpret, Relay, and Bilingual. Real-time cross-language conversation — no human interpreter needed. 25+ languages supported via OpenAI Realtime.",
      tag: "Enterprise",
      delay: 0,
    },
    {
      icon: Headphones,
      gradient: "from-amber-500 to-orange-600",
      label: "AI Co-Pilot for Agents",
      desc: "Live SSE stream of transcripts, GPT-4o suggestions, and sentiment analysis delivered to your human agents in real time. One-click message injection mid-call.",
      tag: "Enterprise",
      delay: 80,
    },
    {
      icon: Network,
      gradient: "from-cyan-500 to-blue-600",
      label: "Agent-to-Agent Network",
      desc: "AI agents that call other AI agents. Cryptographic API key authentication, capability-based routing, and a public agent directory. A true AI microservices layer.",
      tag: "Unique",
      delay: 160,
    },
  ];

  const PLATFORM_FEATURES = [
    { icon: Bot, label: "AI Voice Assistants", desc: "OpenAI Realtime API, GPT-4o, semantic VAD, barge-in. Sub-800ms latency." },
    { icon: GitBranch, label: "Visual Scenario Builder", desc: "Drag-and-drop call flow designer with AI-assisted wizard generation." },
    { icon: BarChart3, label: "Analytics & Costs", desc: "Per-call cost breakdown: telephony, LLM, STT, TTS. Real-time margins." },
    { icon: Layers, label: "Knowledge Base", desc: "Upload PDFs, URLs, or text. Vector-injected into every call's context." },
    { icon: Users, label: "Leads & Campaigns", desc: "Built-in CRM. Outbound campaign engine with compliance pre-check." },
    { icon: Cpu, label: "SIP Trunk Integration", desc: "Bring your own carrier. Register or peer SIP trunk per user." },
    { icon: Clock, label: "Scheduled Lessons & Appointments", desc: "Calendar integration with ICS invites, reminders, and callbacks." },
    { icon: Lock, label: "Enterprise Auth", desc: "Firebase Auth, role-based access, per-user feature flags, audit log." },
  ];

  const TICKER_ITEMS = [
    "Verbal Contract Engine", "Voice Commerce", "TCPA Compliance", "Agent-to-Agent Network",
    "AI Co-Pilot", "Multilingual Translation", "OpenAI Realtime API", "Stripe Payments",
    "SHA-256 Contract Hashing", "DNC Registry", "Scenario Builder", "Knowledge Base",
    "Semantic VAD", "Sub-800ms Latency", "SIP Trunking", "GPT-4o Realtime",
  ];

  return (
    <div className="min-h-screen bg-[#060810] text-white overflow-x-hidden">

      {/* ── Background: grid + orbs ─────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Red orb */}
        <div
          className="absolute animate-glow-pulse"
          style={{
            width: 900, height: 900, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(242,47,70,0.15) 0%, transparent 70%)",
            top: "-200px", left: "-100px",
          }}
        />
        {/* Blue orb */}
        <div
          className="absolute animate-glow-pulse"
          style={{
            width: 700, height: 700, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
            bottom: "-100px", right: "-100px",
            animationDelay: "1.5s",
          }}
        />
        {/* Purple orb */}
        <div
          className="absolute animate-glow-pulse"
          style={{
            width: 500, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)",
            top: "40%", right: "20%",
            animationDelay: "3s",
          }}
        />
      </div>

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-[#060810]/90 backdrop-blur-xl border-b border-white/[0.06]" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#F22F46] rounded-lg flex items-center justify-center shadow-lg shadow-[#F22F46]/30">
              <PhoneCall className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">VoiceFlow <span className="text-[#F22F46]">AI</span></span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#innovation" className="hover:text-white transition-colors">Innovation</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors px-4 py-2">
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-[#F22F46] hover:bg-[#d41f35] transition-all duration-200 shadow-lg shadow-[#F22F46]/25 hover:shadow-[#F22F46]/40 hover:-translate-y-0.5"
            >
              Get Started →
            </Link>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden text-white/70 p-2">
            <div className="w-5 h-0.5 bg-current mb-1 transition-all" style={{ transform: mobileMenu ? "rotate(45deg) translateY(6px)" : "" }} />
            <div className="w-5 h-0.5 bg-current mb-1" style={{ opacity: mobileMenu ? 0 : 1 }} />
            <div className="w-5 h-0.5 bg-current" style={{ transform: mobileMenu ? "rotate(-45deg) translateY(-6px)" : "" }} />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden bg-[#060810]/95 backdrop-blur-xl border-t border-white/[0.06] px-6 py-4 space-y-4">
            {["Features","Platform","Innovation","Contact"].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMobileMenu(false)}
                className="block text-white/70 hover:text-white text-sm py-2">{item}</a>
            ))}
            <Link href="/login" onClick={() => setMobileMenu(false)}
              className="block w-full text-center text-sm font-semibold px-5 py-3 rounded-xl bg-[#F22F46] hover:bg-[#d41f35]">
              Get Started →
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-32 pb-20 px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-xs font-medium text-white/60 mb-8 animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F22F46] animate-pulse" />
          6 Novel Features · Production-Deployed · Enterprise-Ready
        </div>

        {/* Headline */}
        <h1
          className="text-5xl md:text-7xl lg:text-8xl font-black leading-[1.05] mb-6 max-w-5xl mx-auto animate-fade-up"
          style={{ animationDelay: "100ms" }}
        >
          <span className="gradient-text-white">The AI Voice Platform</span>
          <br />
          <span className="gradient-text-red">That Changes</span>
          <br />
          <span className="gradient-text-white">Everything.</span>
        </h1>

        {/* Sub */}
        <p
          className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          Six category-defining capabilities — verbal contracts, voice commerce,
          compliance intelligence, real-time translation, agent networks, and AI co-pilot
          — built on top of a production-grade, fully-deployed voice SaaS.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-fade-up" style={{ animationDelay: "300ms" }}>
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#F22F46] hover:bg-[#d41f35] font-bold text-base transition-all duration-200 shadow-2xl shadow-[#F22F46]/30 hover:shadow-[#F22F46]/50 hover:-translate-y-1"
          >
            <Play className="w-4 h-4" />
            See it live
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#innovation"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl glass-card hover:border-white/20 font-semibold text-base transition-all duration-200 hover:-translate-y-1"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            Explore innovations
          </a>
        </div>

        {/* Hero visual — phone orb */}
        <div className="relative inline-block animate-float-medium" style={{ animationDelay: "500ms" }}>
          <RippleRings />
          <div
            className="relative z-10 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto shadow-2xl"
            style={{ background: "linear-gradient(135deg, #F22F46 0%, #d41f35 100%)", boxShadow: "0 0 60px rgba(242,47,70,0.4), 0 0 120px rgba(242,47,70,0.15)" }}
          >
            <PhoneCall className="w-10 h-10 text-white" />
          </div>
          {/* Floating chips */}
          {[
            { label: "SHA-256 Contracts", x: "-180px", y: "-20px", color: "#a855f7", icon: "📜" },
            { label: "Voice Commerce", x: "130px", y: "-40px", color: "#10b981", icon: "🛒" },
            { label: "Agent Network", x: "-160px", y: "60px", color: "#3b82f6", icon: "🌐" },
            { label: "TCPA Compliance", x: "110px", y: "50px", color: "#F22F46", icon: "🛡️" },
          ].map((chip, i) => (
            <div
              key={i}
              className="absolute glass-card rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap animate-float-slow"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${chip.x}), calc(-50% + ${chip.y}))`,
                animationDelay: `${i * 0.8}s`,
                borderColor: `${chip.color}33`,
                color: chip.color,
              }}
            >
              <span>{chip.icon}</span>
              {chip.label}
            </div>
          ))}
        </div>
      </section>

      {/* ── Ticker ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 py-5 border-y border-white/[0.06] overflow-hidden">
        <div className="animate-ticker flex gap-8 whitespace-nowrap w-max">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="text-sm text-white/25 font-medium flex items-center gap-3">
              {item}
              <span className="w-1 h-1 rounded-full bg-[#F22F46] inline-block" />
            </span>
          ))}
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
          <StatCounter value={44} suffix="+" label="New API Endpoints" />
          <StatCounter value={6} label="Category-Defining Features" />
          <StatCounter value={25} suffix="+" label="Languages Supported" />
          <StatCounter value={800} suffix="ms" label="Max Realtime Latency" />
        </div>
      </section>

      {/* ── 6 Core Innovations ─────────────────────────────────────────── */}
      <section id="innovation" className="relative z-10 py-24 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F22F46]/10 border border-[#F22F46]/20 text-xs font-bold tracking-widest uppercase text-[#F22F46] mb-6">
              <Zap className="w-3 h-3" />
              What No One Else Has
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              <span className="gradient-text-white">Six Features.</span>
              <br />
              <span className="gradient-text-red">Zero Precedent.</span>
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">
              Each one a product category in itself. All running in production today.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <FeatureCard key={f.label} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Deep-dive panels ───────────────────────────────────────────── */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto space-y-32">

          {/* Panel 1 — Compliance */}
          <DeepDive
            eyebrow="Feature 01"
            title="Compliance Intelligence Engine"
            subtitle="The regulatory firewall every carrier needs — built at the call infrastructure layer."
            gradient="from-emerald-600/20 to-teal-800/10"
            accentColor="#10b981"
            icon={ShieldCheck}
            bullets={[
              "Area-code → IANA timezone mapping for TCPA 8am–9pm enforcement",
              "Real-time DNC registry check before every outbound call",
              "PII detection on live transcripts: cards, SSNs, routing numbers",
              "Compliance score 0–100 with violation severity breakdown",
              "Consent lifecycle: record, track expiry, revoke, GDPR-proof",
              "HIPAA-aware: medical record number pattern detection",
            ]}
            visual={<ComplianceVisual />}
            reverse={false}
          />

          {/* Panel 2 — Verbal Contracts */}
          <DeepDive
            eyebrow="Feature 02"
            title="Verbal Contract Engine"
            subtitle="The moment a caller says 'I agree' — it's permanent, timestamped, and legally defensible."
            gradient="from-violet-600/20 to-purple-800/10"
            accentColor="#a855f7"
            icon={FileText}
            bullets={[
              "SHA-256 hash of terms + phone + timestamp = tamper-proof digital seal",
              "Template system with {{partyName}}, {{date}}, {{companyName}} substitution",
              "Version control: every term change bumps the version number",
              "Transcript snippet preserved as evidence of verbal consent",
              "One-click void with reason — full audit trail maintained",
              "Contract archive dashboard with hash verification",
            ]}
            visual={<ContractVisual />}
            reverse={true}
          />

          {/* Panel 3 — Voice Commerce */}
          <DeepDive
            eyebrow="Feature 03"
            title="Voice Commerce"
            subtitle="A complete e-commerce engine — product catalog, cart, and Stripe checkout — over a phone call."
            gradient="from-pink-600/20 to-rose-800/10"
            accentColor="#f43f5e"
            icon={ShoppingCart}
            bullets={[
              "Product catalog CRUD: name, SKU, price, stock, category",
              "In-call cart management via AI function calling",
              "Stripe PaymentLink created server-side → sent to caller by SMS",
              "Webhook-driven order status: pending → paid → shipped → delivered",
              "Zero PCI exposure: card data never enters the voice channel",
              "Revenue dashboard with per-order tracking",
            ]}
            visual={<CommerceVisual />}
            reverse={false}
          />

          {/* Panel 4 — Agent Network */}
          <DeepDive
            eyebrow="Feature 04"
            title="Agent-to-Agent Network"
            subtitle="AI microservices for voice. Agents that call other agents — securely, reliably, at scale."
            gradient="from-cyan-600/20 to-blue-800/10"
            accentColor="#06b6d4"
            icon={Network}
            bullets={[
              "Cryptographic API key auth (SHA-256 hash stored, raw shown once)",
              "Public agent directory with capability-based routing",
              "voiceflow-agent-v1 open protocol — any language, any platform",
              "HMAC-signed inter-agent payload verification",
              "Call log: every agent-to-agent interaction recorded",
              "API key rotation without service downtime",
            ]}
            visual={<AgentVisual />}
            reverse={true}
          />
        </div>
      </section>

      {/* ── Platform features grid ──────────────────────────────────────── */}
      <section id="platform" className="relative z-10 py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.10] text-xs font-bold tracking-widest uppercase text-white/40 mb-6">
              Platform
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              <span className="gradient-text-white">Everything Already Built.</span>
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">
              The 6 innovations land on top of a full-featured, production-deployed voice SaaS with real customers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLATFORM_FEATURES.map((f, i) => (
              <div
                key={f.label}
                className="glass-card rounded-xl p-5 group hover:border-white/15 transition-all duration-300"
                style={{
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <div className="w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center mb-3 group-hover:bg-[#F22F46]/20 transition-colors">
                  <f.icon className="w-4 h-4 text-white/60 group-hover:text-[#F22F46] transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1.5">{f.label}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack showcase ─────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12 text-center space-y-6">
            <p className="text-xs font-bold tracking-widest uppercase text-white/25">Built On</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
              {[
                { name: "OpenAI Realtime API", desc: "gpt-4o-realtime" },
                { name: "WebSocket Media Streams", desc: "Real-time audio" },
                { name: "Firebase", desc: "Auth + Firestore" },
                { name: "Google Cloud Run", desc: "Always-on WS" },
                { name: "Stripe", desc: "Payments" },
                { name: "Deepgram", desc: "Nova-3 STT" },
                { name: "Google TTS", desc: "Chirp3-HD" },
                { name: "Next.js 14", desc: "App Router" },
              ].map(t => (
                <div key={t.name} className="text-center">
                  <p className="text-sm font-bold text-white">{t.name}</p>
                  <p className="text-xs text-white/30">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12 gradient-text-white">What Users Are Saying</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <QuoteCard
              text="The verbal contract feature alone is worth it. We close deals over the phone now — fully compliant, fully legal. No DocuSign needed."
              name="Rotem K."
              title="Head of Sales, PropTech startup"
              avatar="R"
            />
            <QuoteCard
              text="Voice Commerce changed how we sell. Our AI assistant upsells products and the customer pays by SMS — conversion rate is insane."
              name="Yael M."
              title="Founder, D2C Brand"
              avatar="Y"
            />
            <QuoteCard
              text="The compliance engine blocked 340 DNC calls in the first week. The legal team is thrilled. The TCPA time check runs automatically."
              name="Ariel S."
              title="VP Operations, Call Center"
              avatar="A"
            />
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section id="contact" className="relative z-10 py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="rounded-3xl p-12 md:p-16 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(242,47,70,0.15) 0%, rgba(99,102,241,0.15) 100%)",
              border: "1px solid rgba(242,47,70,0.2)",
            }}
          >
            {/* Orb inside CTA */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(circle at 50% 0%, rgba(242,47,70,0.2) 0%, transparent 60%)",
              }}
            />

            <div className="relative z-10 space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F22F46] shadow-2xl shadow-[#F22F46]/40 mx-auto">
                <PhoneCall className="w-7 h-7 text-white" />
              </div>

              <h2 className="text-4xl md:text-5xl font-black gradient-text-white leading-tight">
                Ready to take your<br />voice AI further?
              </h2>

              <p className="text-white/50 text-lg max-w-lg mx-auto">
                Six production-grade features, a live platform with real customers, and a team obsessed with shipping. Let's talk.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#F22F46] hover:bg-[#d41f35] font-bold text-base transition-all duration-200 shadow-2xl shadow-[#F22F46]/30 hover:shadow-[#F22F46]/50 hover:-translate-y-1"
                >
                  <Play className="w-4 h-4" />
                  Live demo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="mailto:info@lancelotech.com"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl glass-card hover:border-white/25 font-semibold text-base transition-all duration-200 hover:-translate-y-1"
                >
                  <MessageSquare className="w-4 h-4 text-white/60" />
                  Contact us
                </a>
              </div>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center justify-center gap-6 pt-6 border-t border-white/[0.08]">
                {[
                  { icon: CheckCircle2, text: "Production deployed" },
                  { icon: Award, text: "6 novel features" },
                  { icon: TrendingUp, text: "Enterprise-grade" },
                  { icon: DollarSign, text: "Real revenue" },
                ].map(s => (
                  <div key={s.text} className="flex items-center gap-1.5 text-xs text-white/40">
                    <s.icon className="w-3.5 h-3.5 text-emerald-500" />
                    {s.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#F22F46] rounded-md flex items-center justify-center">
              <PhoneCall className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white/70">VoiceFlow AI</span>
          </div>
          <p className="text-xs text-white/25">© 2025 Lancelotech. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-white/30">
            <Link href="/login" className="hover:text-white/60 transition-colors">Sign In</Link>
            <a href="mailto:info@lancelotech.com" className="hover:text-white/60 transition-colors">info@lancelotech.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Deep-dive section component ────────────────────────────────────────────────
function DeepDive({
  eyebrow, title, subtitle, gradient, accentColor, icon: Icon, bullets, visual, reverse,
}: {
  eyebrow: string; title: string; subtitle: string; gradient: string;
  accentColor: string; icon: React.ElementType; bullets: string[];
  visual: React.ReactNode; reverse: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${reverse ? "lg:grid-flow-dense" : ""}`}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(40px)", transition: "opacity 0.8s ease, transform 0.8s ease" }}
    >
      <div className={reverse ? "lg:col-start-2" : ""}>
        <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: accentColor }}>{eyebrow}</div>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}33` }}>
            <Icon className="w-5 h-5" style={{ color: accentColor }} />
          </div>
          <h3 className="text-2xl md:text-3xl font-black text-white">{title}</h3>
        </div>
        <p className="text-white/50 text-base mb-6 leading-relaxed">{subtitle}</p>
        <ul className="space-y-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-white/60">
              <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:col-start-1 lg:row-start-1" : ""}>{visual}</div>
    </div>
  );
}

// ── Mini visuals for deep-dive panels ─────────────────────────────────────────
function ComplianceVisual() {
  const score = 87;
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Live Compliance Check</p>
        <span className="text-xs text-emerald-400 font-semibold">✓ TCPA OK</span>
      </div>
      <div className="space-y-2">
        {[
          { label: "DNC Registry", status: "Clear", ok: true },
          { label: "TCPA Time Window", status: "9:42 AM PST ✓", ok: true },
          { label: "PII Detection", status: "None Found", ok: true },
          { label: "Consent on File", status: "Verified", ok: true },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
            <span className="text-xs text-white/50">{row.label}</span>
            <span className={`text-xs font-semibold ${row.ok ? "text-emerald-400" : "text-red-400"}`}>{row.status}</span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/40">Compliance Score</span>
          <span className="text-sm font-black text-emerald-400">{score}/100</span>
        </div>
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function ContractVisual() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div>
          <p className="text-xs font-bold text-white">Service Agreement</p>
          <p className="text-[10px] text-white/30">Version 3 · en</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">Confirmed</span>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3 space-y-2">
        {["I, David Cohen, agree to the service terms on May 5, 2025.", "Payment of $299/mo is due on the 1st of each month.", "30-day notice required to cancel."].map((t, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-white/50">
            <span className="text-violet-400 font-bold shrink-0">{i+1}.</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] text-white/30 uppercase tracking-wider">SHA-256 Seal</p>
        <p className="text-[10px] font-mono text-violet-400 break-all opacity-80">a3f7c2e1b9d4...8e2f1a0c5b3d</p>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
        <Waveform color="#a855f7" bars={9} />
        <span className="text-xs text-white/30 ml-auto">"Yes, I agree to all terms."</span>
      </div>
    </div>
  );
}

function CommerceVisual() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Voice Cart</p>
      <div className="space-y-2">
        {[
          { name: "Premium Widget Pro", qty: 2, price: 49.99 },
          { name: "Support Plan (1yr)", qty: 1, price: 99.00 },
        ].map(item => (
          <div key={item.name} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-white">{item.name}</p>
              <p className="text-[10px] text-white/30">×{item.qty}</p>
            </div>
            <p className="text-sm font-bold text-emerald-400">${(item.price * item.qty).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="text-xs text-white/40">Order Total</span>
        <span className="text-lg font-black text-white">$198.98</span>
      </div>
      <div className="bg-[#F22F46]/10 border border-[#F22F46]/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <Phone className="w-4 h-4 text-[#F22F46]" />
        <div>
          <p className="text-xs font-semibold text-white">Payment link sent by SMS</p>
          <p className="text-[10px] text-white/40">pay.stripe.com/xxxxx → +1 555 ***-4821</p>
        </div>
        <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
      </div>
    </div>
  );
}

function AgentVisual() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Agent Network</p>
      <div className="relative flex items-center justify-center py-6">
        {/* Center node */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center z-10 shadow-lg shadow-cyan-500/30">
          <Bot className="w-6 h-6 text-white" />
        </div>
        {/* Connecting lines */}
        {[
          { label: "Billing Agent", x: -110, y: -45, color: "#10b981" },
          { label: "Scheduling", x: 100, y: -45, color: "#a855f7" },
          { label: "Tech Support", x: -100, y: 45, color: "#f59e0b" },
          { label: "Sales Agent", x: 90, y: 45, color: "#f43f5e" },
        ].map((node, i) => (
          <div key={i} className="absolute" style={{ left: `calc(50% + ${node.x}px)`, top: `calc(50% + ${node.y}px)`, transform: "translate(-50%,-50%)" }}>
            <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border" style={{ background: `${node.color}15`, borderColor: `${node.color}30`, color: node.color }}>
              {node.label}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {[
          { time: "09:41:03", msg: "→ Billing Agent: check invoice #4821", color: "text-cyan-400" },
          { time: "09:41:04", msg: "← $149 outstanding, due May 12", color: "text-emerald-400" },
          { time: "09:41:05", msg: "→ Scheduling: book follow-up call", color: "text-cyan-400" },
        ].map((l, i) => (
          <div key={i} className="flex items-start gap-2 text-[10px]">
            <span className="text-white/20 shrink-0 font-mono">{l.time}</span>
            <span className={l.color}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
