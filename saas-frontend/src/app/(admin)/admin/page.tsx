"use client";

import React, { useEffect, useState, useMemo, useCallback, createContext, useContext, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  adminListUsers, adminToggleUser, adminDeleteUser,
  adminSetRole, adminResetPassword, adminCreateUser, adminGetUserDetail,
  adminGetSubscriptions, adminOverridePlan,
  adminGetPlanConfig, adminUpdatePlanConfig,
  adminGetBillingConfig, adminUpdateBillingConfig,
  adminGetPronunciation, adminUpdatePronunciation,
  type PronunciationFix,
  adminGetSystemSettings, adminUpdateSystemSettings,
  adminGetKeysMeta, adminUpdateKeyMeta,
  adminListAllPhoneNumbers, adminReleasePhoneNumber, adminReassignPhoneNumber,
  adminCheckIntegrations,
  type AdminUser, type Assistant, type AdminCallSession,
  type AdminSubscriptionUser, type PlanTier,
  type AllPlanConfigs, type PlanConfig,
  type AllKeysMeta, type SystemSettings,
  type BillingConfig,
  type AdminPhoneNumber, type AllIntegrationResults, type IntegrationResult,
} from "@/lib/firebase-functions";
import {
  Loader2, Users, ShieldCheck, ShieldOff, Trash2, KeyRound, Eye,
  UserPlus, X, Copy, Check, Phone, Bot, CreditCard, BarChart3,
  Key, Settings, ExternalLink, AlertTriangle, Save, RotateCcw,
  CheckCircle2, XCircle, Info, RefreshCw, Globe, Wifi, WifiOff,
} from "lucide-react";

// ── Error toast context ───────────────────────────────────────────────────────

const ErrorToastCtx = createContext<(msg: string) => void>(() => {});
const useErrorToast = () => useContext(ErrorToastCtx);

function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 6000);
  }, []);
  return (
    <ErrorToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-start gap-3 bg-neutral-900 text-white px-4 py-3 rounded-xl shadow-xl max-w-sm text-sm animate-in fade-in slide-in-from-bottom-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" />
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg("")} className="text-neutral-400 hover:text-white ml-1 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </ErrorToastCtx.Provider>
  );
}

// ── Tab definition ────────────────────────────────────────────────────────────

const TABS = [
  { id: "users",         label: "Users",                icon: Users },
  { id: "subscriptions", label: "Subscriptions",        icon: CreditCard },
  { id: "plans",         label: "Plans & Pricing",      icon: BarChart3 },
  { id: "apikeys",       label: "API Keys",             icon: Key },
  { id: "settings",      label: "System Settings",      icon: Settings },
  { id: "phone",         label: "Phone & Integrations", icon: Phone },
  { id: "pronunciation", label: "Pronunciation",        icon: Globe },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Shared helper components ───────────────────────────────────────────────────

function PlanBadge({ plan }: { plan?: string }) {
  const cfg: Record<string, string> = {
    basic: "bg-neutral-100 text-neutral-600",
    pro:   "bg-blue-100 text-blue-700",
    scale: "bg-purple-100 text-purple-700",
  };
  const cls = cfg[plan || "basic"] ?? "bg-neutral-100 text-neutral-600";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full uppercase tracking-wide ${cls}`}>
      {plan || "basic"}
    </span>
  );
}

function Badge({ role }: { role: "admin" | "user" }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
      role === "admin" ? "bg-purple-100 text-purple-700" : "bg-neutral-100 text-neutral-600"
    }`}>{role}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
      status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
    }`}>{status}</span>
  );
}

function StripeBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-neutral-400">—</span>;
  const cfg: Record<string, string> = {
    active:   "bg-green-100 text-green-700",
    trialing: "bg-blue-100 text-blue-700",
    past_due: "bg-red-100 text-red-600",
    canceled: "bg-neutral-100 text-neutral-500",
    unpaid:   "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg[status] ?? "bg-neutral-100 text-neutral-500"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-5 py-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-colors ${value ? "bg-emerald-500" : "bg-neutral-300"}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

// ── Tab 1: Users ──────────────────────────────────────────────────────────────

function UsersTab({ currentUid }: { currentUid?: string }) {
  const showError = useErrorToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [settingRole, setSettingRole] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<{ assistants: Assistant[]; recentCalls: AdminCallSession[]; plan?: string; stripeCustomerId?: string; stripeStatus?: string } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    adminListUsers()
      .then(setUsers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    users.filter(u =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.displayName || "").toLowerCase().includes(search.toLowerCase())
    ), [users, search]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.status === "active").length,
    suspended: users.filter(u => u.status === "suspended").length,
    admins: users.filter(u => u.role === "admin").length,
    assistants: users.reduce((s, u) => s + (u.assistantCount || 0), 0),
    pro: users.filter(u => u.plan === "pro" || u.plan === "scale").length,
  }), [users]);

  const isSelf = (u: AdminUser) => u.uid === currentUid;

  const handleToggle = async (u: AdminUser) => {
    const newStatus = u.status === "active" ? "suspended" : "active";
    setToggling(u.uid);
    try {
      await adminToggleUser({ uid: u.uid, status: newStatus });
      setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, status: newStatus, disabled: newStatus === "suspended" } : x));
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setToggling(null); }
  };

  const handleRoleToggle = async (u: AdminUser) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    if (!confirm(`Change ${u.email} role to "${newRole}"?`)) return;
    setSettingRole(u.uid);
    try {
      await adminSetRole({ uid: u.uid, role: newRole });
      setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, role: newRole } : x));
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setSettingRole(null); }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setDeleting(u.uid);
    try {
      await adminDeleteUser({ uid: u.uid });
      setUsers(prev => prev.filter(x => x.uid !== u.uid));
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setDeleting(null); }
  };

  const handleResetPassword = async (u: AdminUser) => {
    setResetting(u.uid);
    try {
      const { resetLink: link } = await adminResetPassword({ email: u.email });
      setResetLink(link);
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setResetting(null); }
  };

  const handleViewDetail = async (u: AdminUser) => {
    setDetailUser(u);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await adminGetUserDetail(u.uid);
      setDetail(d);
    } catch { setDetail({ assistants: [], recentCalls: [] }); }
    finally { setLoadingDetail(false); }
  };

  const handleCopyLink = () => {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const newUser = await adminCreateUser({ email: createEmail, password: createPassword, displayName: createName, role: createRole });
      setUsers(prev => [newUser, ...prev]);
      setShowCreate(false);
      setCreateEmail(""); setCreatePassword(""); setCreateName(""); setCreateRole("user");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally { setCreating(false); }
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Users" value={stats.total} color="text-neutral-900" />
        <StatCard label="Active" value={stats.active} color="text-green-600" />
        <StatCard label="Suspended" value={stats.suspended} color="text-red-500" />
        <StatCard label="Admins" value={stats.admins} color="text-purple-600" />
        <StatCard label="Assistants" value={stats.assistants} color="text-blue-600" />
        <StatCard label="Paid Plans" value={stats.pro} color="text-amber-600" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-neutral-500" />
          <h2 className="text-lg font-semibold text-neutral-900">Users</h2>
          {!loading && <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{users.length}</span>}
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-56 text-sm px-3 py-2 border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
        />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Assistants</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(u => (
                <tr key={u.uid} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{u.displayName || "—"}</div>
                    <div className="text-xs text-neutral-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => !isSelf(u) && handleRoleToggle(u)}
                      disabled={isSelf(u) || settingRole === u.uid}
                      title={isSelf(u) ? "Cannot change own role" : `Click to make ${u.role === "admin" ? "user" : "admin"}`}
                      className={`${isSelf(u) ? "cursor-default" : "cursor-pointer hover:opacity-80"} transition-opacity`}
                    >
                      {settingRole === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Badge role={u.role} />}
                    </button>
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={u.plan} /></td>
                  <td className="px-4 py-3 text-neutral-600">{u.assistantCount ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!isSelf(u) && (
                        <button
                          onClick={() => handleToggle(u)}
                          disabled={toggling === u.uid}
                          title={u.status === "active" ? "Suspend" : "Activate"}
                          className={`p-1.5 rounded-md transition-colors ${
                            u.status === "active" ? "text-orange-500 hover:bg-orange-50" : "text-green-600 hover:bg-green-50"
                          } disabled:opacity-40`}
                        >
                          {toggling === u.uid ? <Loader2 className="w-4 h-4 animate-spin" /> :
                            u.status === "active" ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleResetPassword(u)}
                        disabled={resetting === u.uid}
                        title="Generate password reset link"
                        className="p-1.5 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                      >
                        {resetting === u.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleViewDetail(u)}
                        title="View details"
                        className="p-1.5 rounded-md text-neutral-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {!isSelf(u) && (
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deleting === u.uid}
                          title="Delete user permanently"
                          className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {deleting === u.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400 text-sm">
                  {search ? "No users match your search." : "No users yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset Link Toast */}
      {resetLink && (
        <div className="fixed bottom-6 right-6 bg-white border border-neutral-200 rounded-xl shadow-lg p-4 w-96 z-50">
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-medium text-neutral-900">Password Reset Link</p>
            <button onClick={() => setResetLink(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-neutral-500 mb-3 break-all bg-neutral-50 p-2 rounded-lg">{resetLink}</p>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 w-full justify-center text-sm font-medium bg-neutral-900 text-white py-2 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      {/* Detail Side Panel */}
      {detailUser && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDetailUser(null)} />
          <div className="w-96 bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-neutral-900">{detailUser.displayName || detailUser.email}</p>
                <p className="text-xs text-neutral-400">{detailUser.email}</p>
              </div>
              <button onClick={() => setDetailUser(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingDetail ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>
              ) : detail ? (
                <>
                  {/* Plan & Subscription */}
                  <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Plan</span>
                      <PlanBadge plan={detail.plan} />
                    </div>
                    {detail.stripeCustomerId && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Stripe Customer</span>
                        <a
                          href={`https://dashboard.stripe.com/customers/${detail.stripeCustomerId}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {detail.stripeCustomerId.slice(0, 14)}... <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {detail.stripeStatus && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Stripe Status</span>
                        <StripeBadge status={detail.stripeStatus} />
                      </div>
                    )}
                  </div>

                  {/* Assistants */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Assistants <span className="text-neutral-400 font-normal">({detail.assistants.length})</span></h3>
                    </div>
                    {detail.assistants.length === 0 ? (
                      <p className="text-xs text-neutral-400">No assistants yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.assistants.map(a => (
                          <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <span className="text-sm text-neutral-800">{a.name}</span>
                            <span className="text-xs text-neutral-400">{a.language}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Calls */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Recent Calls <span className="text-neutral-400 font-normal">({detail.recentCalls.length})</span></h3>
                    </div>
                    {detail.recentCalls.length === 0 ? (
                      <p className="text-xs text-neutral-400">No calls yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail.recentCalls.map(c => (
                          <div key={c.id} className="py-2 px-3 bg-neutral-50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-neutral-800">{c.leadNumber}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                c.status === "completed" ? "bg-green-100 text-green-600" :
                                c.status === "failed" ? "bg-red-100 text-red-500" : "bg-neutral-100 text-neutral-500"
                              }`}>{c.status}</span>
                            </div>
                            {c.assistantName && <p className="text-xs text-neutral-400 mt-0.5">{c.assistantName}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-neutral-900">Create User</h2>
              <button onClick={() => setShowCreate(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            </div>
            {createError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{createError}</div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Display Name</label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Jane Smith"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Email *</label>
                <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="user@company.com" required
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Password *</label>
                <input type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="At least 6 characters" required
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Role</label>
                <select value={createRole} onChange={e => setCreateRole(e.target.value as "user" | "admin")}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 bg-white">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-neutral-200 text-neutral-600 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-[#F22F46] hover:bg-[#d9243b] text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 2: Subscriptions ──────────────────────────────────────────────────────

function SubscriptionsTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [subs, setSubs] = useState<AdminSubscriptionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [overrideTarget, setOverrideTarget] = useState<AdminSubscriptionUser | null>(null);
  const [overridePlan, setOverridePlan] = useState<PlanTier>("basic");
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    if (!wasLoaded || subs.length > 0) return;
    setLoading(true);
    adminGetSubscriptions()
      .then(setSubs)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() =>
    subs.filter(s =>
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.displayName || "").toLowerCase().includes(search.toLowerCase())
    ), [subs, search]);

  const handleOverride = async () => {
    if (!overrideTarget) return;
    setOverriding(true);
    try {
      await adminOverridePlan({ uid: overrideTarget.uid, plan: overridePlan });
      setSubs(prev => prev.map(s => s.uid === overrideTarget.uid ? { ...s, plan: overridePlan } : s));
      setOverrideTarget(null);
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setOverriding(false); }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-neutral-900">Subscriptions</h2>
        <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{subs.length}</span>
        <div className="flex-1" />
        <input
          type="text" placeholder="Search users..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-56 text-sm px-3 py-2 border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
        />
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Stripe Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Minutes Used</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Customer ID</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(s => (
                <tr key={s.uid} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{s.displayName || "—"}</div>
                    <div className="text-xs text-neutral-400">{s.email}</div>
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={s.plan} /></td>
                  <td className="px-4 py-3"><StripeBadge status={s.stripeStatus} /></td>
                  <td className="px-4 py-3 text-neutral-600">{s.minutesUsedThisMonth} min</td>
                  <td className="px-4 py-3">
                    {s.stripeCustomerId ? (
                      <span className="text-xs text-neutral-400 font-mono">{s.stripeCustomerId.slice(0, 16)}…</span>
                    ) : <span className="text-neutral-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {s.stripeCustomerId && (
                        <a
                          href={`https://dashboard.stripe.com/customers/${s.stripeCustomerId}`}
                          target="_blank" rel="noopener noreferrer"
                          title="View in Stripe"
                          className="p-1.5 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => { setOverrideTarget(s); setOverridePlan(s.plan); }}
                        title="Override plan"
                        className="p-1.5 rounded-md text-neutral-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400 text-sm">
                  {search ? "No users match your search." : "No users found."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Override Plan Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-neutral-900">Override Plan</h2>
              <button onClick={() => setOverrideTarget(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-neutral-600 mb-3">
              Changing plan for <strong>{overrideTarget.email}</strong>
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">This bypasses Stripe. The user will not be billed for upgraded access.</p>
            </div>
            <select
              value={overridePlan}
              onChange={e => setOverridePlan(e.target.value as PlanTier)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200 mb-4"
            >
              <option value="basic">BASIC — Free</option>
              <option value="pro">PRO — $99/mo</option>
              <option value="scale">SCALE — $249/mo</option>
            </select>
            <div className="flex gap-3">
              <button onClick={() => setOverrideTarget(null)}
                className="flex-1 border border-neutral-200 text-neutral-600 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">Cancel</button>
              <button onClick={handleOverride} disabled={overriding}
                className="flex-1 bg-[#F22F46] hover:bg-[#d9243b] text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {overriding && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 3: Plans & Pricing ────────────────────────────────────────────────────

const PLAN_TIERS: PlanTier[] = ["basic", "pro", "scale"];
const BOOL_FEATURES: Array<{ key: keyof PlanConfig; label: string }> = [
  { key: "knowledgeBase", label: "Knowledge Base" },
  { key: "analytics",     label: "Analytics" },
  { key: "calendar",      label: "Calendar" },
  { key: "whatsapp",      label: "WhatsApp" },
];

function PlansTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [planConfig, setPlanConfig] = useState<AllPlanConfigs | null>(null);
  const [editing, setEditing] = useState<AllPlanConfigs | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [source, setSource] = useState<"firestore" | "hardcoded">("hardcoded");

  // Billing config state
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [billingEditing, setBillingEditing] = useState<BillingConfig | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaveStatus, setBillingSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (!wasLoaded || planConfig) return;
    setLoading(true);
    Promise.all([
      adminGetPlanConfig(),
      adminGetBillingConfig(),
    ]).then(([{ plans, source: s }, billing]) => {
      setPlanConfig(plans);
      setEditing(JSON.parse(JSON.stringify(plans)));
      setSource(s);
      setBillingConfig(billing);
      setBillingEditing({ ...billing });
    }).finally(() => setLoading(false));
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTier = (tier: PlanTier, key: keyof PlanConfig, value: number | boolean | null) => {
    if (!editing) return;
    setEditing(prev => ({ ...prev!, [tier]: { ...prev![tier], [key]: value } }));
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      await adminUpdatePlanConfig({ plans: editing });
      setPlanConfig(editing);
      setSource("firestore");
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e: unknown) { setSaveStatus("error"); showError(e instanceof Error ? e.message : "Failed to save plan config"); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    if (!planConfig) return;
    setEditing(JSON.parse(JSON.stringify(planConfig)));
  };

  const handleBillingSave = async () => {
    if (!billingEditing) return;
    setBillingSaving(true);
    setBillingSaveStatus("idle");
    try {
      await adminUpdateBillingConfig({ config: billingEditing });
      setBillingConfig({ ...billingEditing });
      setBillingSaveStatus("success");
      setTimeout(() => setBillingSaveStatus("idle"), 3000);
    } catch (e: unknown) { setBillingSaveStatus("error"); showError(e instanceof Error ? e.message : "Failed to save billing config"); }
    finally { setBillingSaving(false); }
  };

  const TIER_STYLES: Record<PlanTier, { border: string; label: string; labelColor: string }> = {
    basic: { border: "border-neutral-200", label: "BASIC", labelColor: "text-neutral-600" },
    pro:   { border: "border-blue-300", label: "PRO", labelColor: "text-blue-700" },
    scale: { border: "border-purple-300", label: "SCALE", labelColor: "text-purple-700" },
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;
  if (!editing) return null;

  return (
    <>
      {/* Source banner */}
      <div className={`mb-5 p-3 rounded-lg flex items-center gap-2 text-sm ${
        source === "firestore" ? "bg-green-50 border border-green-200 text-green-700" : "bg-neutral-50 border border-neutral-200 text-neutral-600"
      }`}>
        <Info className="w-4 h-4 flex-shrink-0" />
        {source === "firestore"
          ? "Configuration is stored in Firestore — changes here update all users immediately."
          : "Using hardcoded defaults. Save to persist your configuration in Firestore."}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        {PLAN_TIERS.map(tier => {
          const p = editing[tier];
          const s = TIER_STYLES[tier];
          return (
            <div key={tier} className={`bg-white border-2 ${s.border} rounded-xl p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold uppercase tracking-wide ${s.labelColor}`}>{s.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-neutral-400 text-sm">$</span>
                  <input
                    type="number" min={0} max={9999}
                    value={p.price}
                    disabled={tier === "basic"}
                    onChange={e => updateTier(tier, "price", Number(e.target.value))}
                    className="w-16 text-sm font-semibold text-neutral-900 border border-neutral-200 rounded px-2 py-1 disabled:bg-neutral-50 disabled:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                  <span className="text-neutral-400 text-xs">/mo</span>
                </div>
              </div>

              <div className="space-y-2">
                {([
                  { key: "assistants" as const, label: "Assistants" },
                  { key: "minutesPerMonth" as const, label: "Minutes/Month" },
                  { key: "leads" as const, label: "Leads" },
                  { key: "campaigns" as const, label: "Campaigns" },
                ] as Array<{ key: keyof PlanConfig; label: string }>).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">{label}</span>
                    <input
                      type="number" min={0}
                      value={p[key] as number}
                      onChange={e => updateTier(tier, key, Number(e.target.value))}
                      className="w-20 text-xs text-right border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Call History Limit</span>
                  <input
                    type="number" min={0}
                    value={p.callHistoryLimit === null ? "" : p.callHistoryLimit}
                    placeholder="∞"
                    onChange={e => updateTier(tier, "callHistoryLimit", e.target.value === "" ? null : Number(e.target.value))}
                    className="w-20 text-xs text-right border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-3 space-y-2">
                {BOOL_FEATURES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">{label}</span>
                    <ToggleSwitch value={Boolean(p[key])} onChange={v => updateTier(tier, key, v)} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-colors">
          <RotateCcw className="w-4 h-4" />
          Reset Changes
        </button>
        <div className="flex-1" />
        {saveStatus === "success" && (
          <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircle2 className="w-4 h-4" /> Saved successfully!</div>
        )}
        {saveStatus === "error" && (
          <div className="flex items-center gap-2 text-red-600 text-sm"><XCircle className="w-4 h-4" /> Failed to save.</div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      {/* Billing & Credit Configuration */}
      {billingEditing && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-neutral-500" />
            Billing &amp; Credit Configuration
          </h3>
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-5">
            <div className="grid grid-cols-2 gap-5">
              {/* Signup credit amount */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Signup Credit Amount
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-sm">$</span>
                  <input
                    type="number" min={0} max={1000} step={0.01}
                    value={(billingEditing.signupCreditCents / 100).toFixed(2)}
                    onChange={e => setBillingEditing(prev => prev ? { ...prev, signupCreditCents: Math.round(parseFloat(e.target.value || "0") * 100) } : prev)}
                    className="w-28 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  />
                  <span className="text-neutral-400 text-xs">given to new Basic users</span>
                </div>
              </div>

              {/* Credit validity */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
                  Credit Validity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={365}
                    value={billingEditing.signupCreditDays}
                    onChange={e => setBillingEditing(prev => prev ? { ...prev, signupCreditDays: parseInt(e.target.value || "30") } : prev)}
                    className="w-20 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                  />
                  <span className="text-neutral-400 text-xs">days before credit expires</span>
                </div>
              </div>
            </div>

            {/* Basic plan requires own keys */}
            <div className="border-t border-neutral-100 pt-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-800">Basic plan must use own API keys</div>
                <div className="text-xs text-neutral-400 mt-0.5">When enabled, Basic users must supply their own Twilio, OpenAI &amp; Deepgram credentials</div>
              </div>
              <ToggleSwitch
                value={billingEditing.basicRequiresOwnKeys}
                onChange={v => setBillingEditing(prev => prev ? { ...prev, basicRequiresOwnKeys: v } : prev)}
              />
            </div>
          </div>

          {/* Billing save row */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1" />
            {billingSaveStatus === "success" && (
              <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircle2 className="w-4 h-4" /> Billing config saved!</div>
            )}
            {billingSaveStatus === "error" && (
              <div className="flex items-center gap-2 text-red-600 text-sm"><XCircle className="w-4 h-4" /> Failed to save.</div>
            )}
            <button
              onClick={handleBillingSave}
              disabled={billingSaving}
              className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {billingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Billing Config
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 4: API Keys ────────────────────────────────────────────────────────────

const KEY_DEFINITIONS = [
  { name: "STRIPE_SECRET_KEY",     display: "Stripe Secret Key",       description: "Stripe API secret (sk_live_... or sk_test_...)" },
  { name: "STRIPE_WEBHOOK_SECRET", display: "Stripe Webhook Secret",   description: "Webhook signing secret (whsec_...)" },
  { name: "STRIPE_PRO_PRICE_ID",   display: "Stripe PRO Price ID",     description: "Price ID for PRO plan ($99/mo)" },
  { name: "STRIPE_SCALE_PRICE_ID", display: "Stripe SCALE Price ID",   description: "Price ID for SCALE plan ($249/mo)" },
  { name: "ELEVENLABS_API_KEY",    display: "ElevenLabs API Key",      description: "ElevenLabs TTS provider key" },
  { name: "TWILIO_ACCOUNT_SID",    display: "Twilio Account SID",      description: "Twilio account identifier (AC...)" },
  { name: "TWILIO_AUTH_TOKEN",     display: "Twilio Auth Token",       description: "Twilio authentication token" },
] as const;

type KnownKeyName = typeof KEY_DEFINITIONS[number]["name"];

function ApiKeysTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [keysMeta, setKeysMeta] = useState<AllKeysMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<KnownKeyName | null>(null);
  const [editIsSet, setEditIsSet] = useState(false);
  const [editLast4, setEditLast4] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!wasLoaded || keysMeta) return;
    setLoading(true);
    adminGetKeysMeta()
      .then(setKeysMeta)
      .finally(() => setLoading(false));
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (keyName: KnownKeyName) => {
    const meta = keysMeta?.[keyName];
    setEditingKey(keyName);
    setEditIsSet(meta?.isSet ?? false);
    setEditLast4(meta?.last4 ?? "");
  };

  const cancelEdit = () => { setEditingKey(null); setEditLast4(""); setEditIsSet(false); };

  const handleSave = async (keyName: KnownKeyName) => {
    setSaving(true);
    try {
      await adminUpdateKeyMeta({ keyName, last4: editIsSet && editLast4 ? editLast4 : null, isSet: editIsSet });
      setKeysMeta(prev => prev ? {
        ...prev,
        [keyName]: { ...prev[keyName], isSet: editIsSet, last4: editIsSet && editLast4 ? editLast4 : null }
      } : prev);
      cancelEdit();
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const getMasked = (keyName: string, meta?: { isSet?: boolean; last4?: string | null }) => {
    if (!meta?.isSet) return "not configured";
    const prefix = keyName.startsWith("STRIPE_SECRET") ? "sk_..." :
                   keyName.startsWith("STRIPE_WEBHOOK") ? "whsec_..." :
                   keyName.startsWith("STRIPE") ? "price_..." :
                   keyName.startsWith("TWILIO_ACCOUNT") ? "AC..." :
                   "•••";
    return `${prefix}${meta.last4 || "????"}`;
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;

  return (
    <>
      {/* Info banner */}
      <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-sm text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Security note:</strong> Actual secrets are managed in Firebase Secret Manager.
          This panel tracks which keys are configured and their last 4 characters for verification.
          To set or rotate actual values, use <code className="bg-blue-100 px-1 rounded">firebase functions:secrets:set KEY_NAME</code>.
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Key Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Description</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Value</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {KEY_DEFINITIONS.map(({ name, display, description }) => {
              const meta = keysMeta?.[name];
              const isEditing = editingKey === name;
              return (
                <tr key={name} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{display}</div>
                    <div className="text-xs text-neutral-400 font-mono mt-0.5">{name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500 max-w-[200px]">{description}</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={editIsSet} onChange={e => setEditIsSet(e.target.checked)} className="rounded" />
                          Key is configured
                        </label>
                        {editIsSet && (
                          <input
                            type="text" maxLength={8}
                            value={editLast4} onChange={e => setEditLast4(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                            placeholder="Last 4 chars"
                            className="w-28 text-xs border border-neutral-200 rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"
                          />
                        )}
                      </div>
                    ) : (
                      <span className={`text-xs font-mono ${meta?.isSet ? "text-neutral-700" : "text-neutral-400"}`}>
                        {getMasked(name, meta)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {meta?.isSet ? (
                      <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> SET</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-neutral-400"><XCircle className="w-3.5 h-3.5" /> Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={cancelEdit} className="px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">Cancel</button>
                          <button
                            onClick={() => handleSave(name)}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Save
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(name)}
                          className="px-3 py-1.5 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Tab 5: System Settings ─────────────────────────────────────────────────────

function SystemSettingsTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [editing, setEditing] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (!wasLoaded || settings) return;
    setLoading(true);
    adminGetSystemSettings()
      .then(s => { setSettings(s); setEditing(JSON.parse(JSON.stringify(s))); })
      .finally(() => setLoading(false));
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = useCallback(<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setEditing(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const updateFlag = useCallback((flag: keyof SystemSettings["featureFlags"], value: boolean) => {
    setEditing(prev => prev ? { ...prev, featureFlags: { ...prev.featureFlags, [flag]: value } } : prev);
  }, []);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      await adminUpdateSystemSettings({ settings: editing });
      setSettings(editing);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e: unknown) { setSaveStatus("error"); showError(e instanceof Error ? e.message : "Failed to save settings"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;
  if (!editing) return null;

  return (
    <>
      {/* Maintenance mode warning */}
      {editing.featureFlags.maintenanceMode && (
        <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>Maintenance Mode is ON.</strong>&nbsp;Users cannot currently access the application.
        </div>
      )}

      <div className="space-y-5 max-w-2xl">
        {/* General */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">General</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">App Name</label>
              <input
                type="text" value={editing.appName}
                onChange={e => updateField("appName", e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Support Email</label>
              <input
                type="email" value={editing.supportEmail}
                onChange={e => updateField("supportEmail", e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Default Plan for New Users</label>
              <select
                value={editing.defaultPlan}
                onChange={e => updateField("defaultPlan", e.target.value as "basic" | "pro")}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
              >
                <option value="basic">BASIC (Free)</option>
                <option value="pro">PRO ($99/mo)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feature Flags */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-1">Feature Flags</h3>
          <p className="text-xs text-neutral-400 mb-4">Toggle platform features on or off globally.</p>

          <div className="divide-y divide-neutral-100">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">Onboarding Wizard</p>
                <p className="text-xs text-neutral-400">Show 3-step onboarding after signup</p>
              </div>
              <ToggleSwitch value={editing.featureFlags.onboardingWizard} onChange={v => updateFlag("onboardingWizard", v)} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">Stripe Live Mode</p>
                <p className="text-xs text-neutral-400">When on, ensure your Stripe key is <code className="bg-neutral-100 px-1 rounded text-xs">sk_live_...</code></p>
              </div>
              <ToggleSwitch value={editing.featureFlags.stripeLiveMode} onChange={v => updateFlag("stripeLiveMode", v)} />
            </div>
            {editing.featureFlags.stripeLiveMode && (
              <div className="py-2">
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Ensure your Stripe Secret Key is <code className="bg-amber-100 px-1 rounded">sk_live_...</code> not a test key.
                </div>
              </div>
            )}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">Maintenance Mode</p>
                <p className="text-xs text-neutral-400 text-red-500">Disables access for all non-admin users</p>
              </div>
              <ToggleSwitch value={editing.featureFlags.maintenanceMode} onChange={v => updateFlag("maintenanceMode", v)} />
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <div className="flex-1" />
          {saveStatus === "success" && (
            <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircle2 className="w-4 h-4" /> Settings saved!</div>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-2 text-red-600 text-sm"><XCircle className="w-4 h-4" /> Failed to save.</div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}

// ── Tab 6: Phone & Integrations ───────────────────────────────────────────────

type PhoneSection = "numbers" | "health";

function IntegrationCard({ name, result }: { name: string; result: IntegrationResult }) {
  const statusCfg = {
    ok:             { dot: "bg-green-500", bg: "bg-green-50 border-green-200", text: "text-green-700" },
    error:          { dot: "bg-red-500",   bg: "bg-red-50 border-red-200",     text: "text-red-700" },
    not_configured: { dot: "bg-neutral-300", bg: "bg-neutral-50 border-neutral-200", text: "text-neutral-500" },
  }[result.status];

  const icons: Record<string, string> = {
    Twilio: "📞", Stripe: "💳", SendGrid: "📧", ElevenLabs: "🎙️", Deepgram: "👂", OpenAI: "🤖",
  };

  return (
    <div className={`border rounded-xl p-4 ${statusCfg.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icons[result.label] || "🔌"}</span>
        <span className="font-semibold text-sm text-neutral-900">{result.label}</span>
        <span className={`w-2 h-2 rounded-full ml-auto ${statusCfg.dot}`} />
      </div>
      <p className={`text-xs ${statusCfg.text}`}>
        {result.status === "ok" ? result.detail || "Connected" :
         result.status === "not_configured" ? "Not configured" :
         result.detail || "Connection failed"}
      </p>
      {result.status === "not_configured" && (
        <p className="text-xs text-neutral-400 mt-1">Set via Firebase Secrets</p>
      )}
    </div>
  );
}

// ── Tab 7: Pronunciation Training ────────────────────────────────────────────

const CLOUD_RUN_URL = "https://voiceflow-mediastream-900818829902.us-central1.run.app";

function PronunciationTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [fixes, setFixes] = useState<PronunciationFix[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // New fix form
  const [newOriginal, setNewOriginal] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [newNote, setNewNote] = useState("");

  // TTS model selection
  const [ttsModels, setTtsModels] = useState<Array<{id: string; label: string; provider: string}>>([]);
  const [selectedModel, setSelectedModel] = useState("openai-nova");
  const [savingModel, setSavingModel] = useState(false);
  const [testSentence, setTestSentence] = useState("שלום! אני חן מחברת לנסלוט טכנולוגיות. במה אוכל לעזור לך היום?");

  // TTS preview
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!wasLoaded) return;
    // Load fixes
    if (fixes.length === 0) {
      setLoading(true);
      adminGetPronunciation()
        .then(data => setFixes(data.fixes || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    // Load TTS models
    fetch(`${CLOUD_RUN_URL}/tts-models`)
      .then(r => r.json())
      .then(data => {
        setTtsModels(data.models || []);
        setSelectedModel(data.current || "openai-nova");
      })
      .catch(() => {});
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTTS = (text: string, id: string, model?: string) => {
    if (audioRef.current) { audioRef.current.pause(); }
    const m = model || selectedModel;
    const url = `${CLOUD_RUN_URL}/tts?text=${encodeURIComponent(text)}&lang=he&model=${encodeURIComponent(m)}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(id);
    audio.play();
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => { setPlayingId(null); showError("Failed to play audio"); };
  };

  const saveModelChoice = async () => {
    setSavingModel(true);
    try {
      await fetch(`${CLOUD_RUN_URL}/tts-models`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({model: selectedModel}),
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch { showError("Failed to save model"); }
    finally { setSavingModel(false); }
  };

  const addFix = () => {
    if (!newOriginal.trim() || !newReplacement.trim()) return;
    setFixes(prev => [...prev, { original: newOriginal.trim(), replacement: newReplacement.trim(), note: newNote.trim() }]);
    setNewOriginal(""); setNewReplacement(""); setNewNote("");
  };

  const removeFix = (idx: number) => {
    setFixes(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      await adminUpdatePronunciation({ fixes });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e: unknown) { setSaveStatus("error"); showError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* TTS Voice Model Selector */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">בחירת קול TTS לעברית</h3>
        <p className="text-xs text-neutral-500 mb-4">
          בחר מודל קול, הקלד משפט לבדיקה ושמע איך הוא נשמע. לחץ &quot;שמור כברירת מחדל&quot; כדי להשתמש בו בפונבוט.
        </p>

        <div className="flex gap-3 items-end mb-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">מודל קול</label>
            <select
              value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
            >
              {ttsModels.length > 0 ? ttsModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              )) : (
                <>
                  <option value="openai-nova">OpenAI Nova (נשי, חם)</option>
                  <option value="openai-alloy">OpenAI Alloy (ניטרלי)</option>
                  <option value="google-chirp3-achird">Google Chirp3 Achird (גברי)</option>
                </>
              )}
            </select>
          </div>
          <button
            onClick={saveModelChoice} disabled={savingModel}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs rounded-lg disabled:opacity-50 hover:bg-neutral-800"
          >
            {savingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            שמור כברירת מחדל
          </button>
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">משפט לבדיקה</label>
            <input
              type="text" value={testSentence} onChange={e => setTestSentence(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
              dir="rtl"
            />
          </div>
          <button
            onClick={() => playTTS(testSentence, "test-model")}
            disabled={!testSentence.trim()}
            className={`px-4 py-2 rounded-lg text-sm border font-medium ${playingId === "test-model" ? "bg-blue-50 border-blue-300 text-blue-700" : "border-neutral-200 hover:bg-neutral-50"}`}
          >
            {playingId === "test-model" ? "⏸ מנגן..." : "🔊 השמע"}
          </button>
        </div>
      </div>

      {/* Pronunciation Fixes */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">תיקון הגייה — מילון</h3>
        <p className="text-xs text-neutral-500 mb-4">
          הוסף מילים שה-TTS לא מבטא נכון. כתוב את המילה המקורית ואת הכתיב הפונטי המתוקן.
          לחץ 🔊 לשמוע איך כל גרסה נשמעת. השינויים מוחלים אוטומטית על הפונבוט.
        </p>

        {/* Existing fixes */}
        <div className="space-y-2 mb-4">
          {fixes.map((fix, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-neutral-700 min-w-[100px]">{fix.original}</span>
              <span className="text-neutral-400">→</span>
              <span className="text-sm font-medium text-green-700 min-w-[100px]">{fix.replacement}</span>
              {fix.note && <span className="text-xs text-neutral-400 flex-1">({fix.note})</span>}
              <button
                onClick={() => playTTS(fix.original, `orig-${idx}`)}
                className={`p-1 rounded hover:bg-neutral-200 text-xs ${playingId === `orig-${idx}` ? "bg-red-100" : ""}`}
                title="Play original"
              >🔊 מקור</button>
              <button
                onClick={() => playTTS(fix.replacement, `fix-${idx}`)}
                className={`p-1 rounded hover:bg-green-100 text-xs ${playingId === `fix-${idx}` ? "bg-green-200" : ""}`}
                title="Play fixed"
              >🔊 תיקון</button>
              <button onClick={() => removeFix(idx)} className="p-1 text-neutral-400 hover:text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {fixes.length === 0 && (
            <p className="text-xs text-neutral-400 text-center py-4">No pronunciation fixes yet. Add your first one below.</p>
          )}
        </div>

        {/* Add new fix */}
        <div className="border-t border-neutral-100 pt-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Original word</label>
              <input
                type="text" value={newOriginal} onChange={e => setNewOriginal(e.target.value)}
                placeholder="לנסלוט"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                dir="rtl"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Phonetic fix</label>
              <input
                type="text" value={newReplacement} onChange={e => setNewReplacement(e.target.value)}
                placeholder="לאנסלוט"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                dir="rtl"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Note (optional)</label>
              <input
                type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                placeholder="company name"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
              />
            </div>
            <div className="flex gap-1">
              {newOriginal && (
                <button onClick={() => playTTS(newOriginal, "new-orig")}
                  className={`px-2 py-2 rounded-lg text-xs border ${playingId === "new-orig" ? "bg-red-50 border-red-200" : "border-neutral-200 hover:bg-neutral-50"}`}
                >🔊</button>
              )}
              {newReplacement && (
                <button onClick={() => playTTS(newReplacement, "new-fix")}
                  className={`px-2 py-2 rounded-lg text-xs border ${playingId === "new-fix" ? "bg-green-50 border-green-200" : "border-neutral-200 hover:bg-neutral-50"}`}
                >🔊✓</button>
              )}
              <button
                onClick={addFix}
                disabled={!newOriginal.trim() || !newReplacement.trim()}
                className="px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg disabled:opacity-30 hover:bg-neutral-800"
              >Add</button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-neutral-100">
          <button
            onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-neutral-800"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save & Deploy
          </button>
          {saveStatus === "success" && <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Saved! Cloud Run will use these fixes.</span>}
          {saveStatus === "error" && <span className="flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" /> Failed to save</span>}
        </div>
      </div>
    </div>
  );
}

// ── Tab 6: Phone & Integrations ──────────────────────────────────────────────

function PhoneIntegrationsTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [section, setSection] = useState<PhoneSection>("numbers");

  // Phone numbers state
  const [phones, setPhones] = useState<AdminPhoneNumber[]>([]);
  const [phonesLoading, setPhonesLoading] = useState(false);
  const [phonesError, setPhonesError] = useState("");
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<AdminPhoneNumber | null>(null);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [reassigning, setReassigning] = useState(false);

  // Users list for reassign dropdown
  const [usersList, setUsersList] = useState<Array<{ uid: string; email: string }>>([]);

  // Integration health state
  const [health, setHealth] = useState<AllIntegrationResults | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);

  const loadPhones = async () => {
    setPhonesLoading(true);
    setPhonesError("");
    try {
      const data = await adminListAllPhoneNumbers();
      setPhones(data);
    } catch (e: unknown) {
      setPhonesError(e instanceof Error ? e.message : "Failed to load phone numbers");
    } finally {
      setPhonesLoading(false);
    }
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await adminCheckIntegrations();
      setHealth(data);
      setHealthCheckedAt(data.checkedAt || new Date().toISOString());
    } catch (e: unknown) {
      console.error("Failed to check integrations:", e);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    if (!wasLoaded) return;
    loadPhones();
    loadHealth();
    // Also load users list for reassign dropdown
    import("@/lib/firebase-functions").then(({ adminListUsers }) => {
      adminListUsers().then(users => setUsersList(users.map(u => ({ uid: u.uid, email: u.email }))));
    });
  }, [wasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRelease = async (p: AdminPhoneNumber) => {
    if (!confirm(`Release ${p.phoneNumber}? This permanently removes it from your Twilio account.`)) return;
    setReleasingId(p.sid);
    try {
      await adminReleasePhoneNumber({ sid: p.sid, phoneNumber: p.phoneNumber });
      setPhones(prev => prev.filter(x => x.sid !== p.sid));
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed to release"); }
    finally { setReleasingId(null); }
  };

  const handleReassign = async () => {
    if (!reassignTarget || !newOwnerId) return;
    setReassigning(true);
    try {
      await adminReassignPhoneNumber({ sid: reassignTarget.sid, phoneNumber: reassignTarget.phoneNumber, newOwnerId });
      setPhones(prev => prev.map(p => p.sid === reassignTarget.sid
        ? { ...p, ownerId: newOwnerId, ownerEmail: newOwnerEmail || newOwnerId }
        : p
      ));
      setReassignTarget(null);
      setNewOwnerId("");
      setNewOwnerEmail("");
    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed to reassign"); }
    finally { setReassigning(false); }
  };

  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    phones.forEach(p => { counts[p.country] = (counts[p.country] || 0) + 1; });
    return counts;
  }, [phones]);

  return (
    <>
      {/* Sub-navigation */}
      <div className="flex gap-1 mb-6 bg-neutral-100 p-1 rounded-xl w-fit">
        {([
          { id: "numbers" as PhoneSection, label: "Phone Numbers", icon: Phone },
          { id: "health"  as PhoneSection, label: "Integration Health", icon: Wifi },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Section: Phone Numbers ── */}
      {section === "numbers" && (
        <>
          {/* Stats */}
          <div className="flex items-center gap-4 mb-5">
            <div className="bg-white border border-neutral-200 rounded-xl px-5 py-3 flex items-center gap-3">
              <Phone className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-neutral-400">Total Numbers</p>
                <p className="text-xl font-bold text-neutral-900">{phones.length}</p>
              </div>
            </div>
            {Object.entries(countryCounts).slice(0, 4).map(([country, count]) => (
              <div key={country} className="bg-white border border-neutral-200 rounded-xl px-4 py-3">
                <p className="text-xs text-neutral-400">{country}</p>
                <p className="text-xl font-bold text-neutral-900">{count}</p>
              </div>
            ))}
            <div className="flex-1" />
            <button
              onClick={loadPhones}
              disabled={phonesLoading}
              className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              {phonesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync from Twilio
            </button>
          </div>

          {phonesError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{phonesError}</div>
          )}

          {phonesLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Phone Number</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Country</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Voice Webhook</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {phones.map(p => (
                    <tr key={p.sid} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900 font-mono">{p.phoneNumber}</div>
                        <div className="text-xs text-neutral-400">{p.friendlyName !== p.phoneNumber ? p.friendlyName : p.sid}</div>
                      </td>
                      <td className="px-4 py-3">
                        {p.ownerEmail ? (
                          <span className="text-sm text-neutral-700">{p.ownerEmail}</span>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{p.country}</span>
                      </td>
                      <td className="px-4 py-3">
                        {p.voiceUrl ? (
                          <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Configured</span>
                        ) : (
                          <span className="text-xs text-neutral-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setReassignTarget(p); setNewOwnerId(p.ownerId || ""); }}
                            title="Reassign to different user"
                            className="p-1.5 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Globe className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRelease(p)}
                            disabled={releasingId === p.sid}
                            title="Release from Twilio"
                            className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            {releasingId === p.sid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {phones.length === 0 && !phonesLoading && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-neutral-400 text-sm">
                      <Phone className="w-8 h-8 mx-auto mb-2 text-neutral-200" />
                      No phone numbers found in Twilio account.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Reassign Modal */}
          {reassignTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-neutral-900">Reassign Number</h2>
                  <button onClick={() => setReassignTarget(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-sm text-neutral-600 mb-4">
                  Reassigning <strong className="font-mono">{reassignTarget.phoneNumber}</strong>
                </p>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Assign to User</label>
                  {usersList.length > 0 ? (
                    <select
                      value={newOwnerId}
                      onChange={e => {
                        const u = usersList.find(x => x.uid === e.target.value);
                        setNewOwnerId(e.target.value);
                        setNewOwnerEmail(u?.email || "");
                      }}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    >
                      <option value="">Select a user...</option>
                      {usersList.map(u => (
                        <option key={u.uid} value={u.uid}>{u.email}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newOwnerId}
                      onChange={e => setNewOwnerId(e.target.value)}
                      placeholder="User UID"
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setReassignTarget(null)}
                    className="flex-1 border border-neutral-200 text-neutral-600 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">Cancel</button>
                  <button
                    onClick={handleReassign}
                    disabled={reassigning || !newOwnerId}
                    className="flex-1 bg-[#F22F46] hover:bg-[#d9243b] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {reassigning && <Loader2 className="w-4 h-4 animate-spin" />}
                    Reassign
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Section: Integration Health ── */}
      {section === "health" && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Integration Health</h2>
              {healthCheckedAt && (
                <p className="text-xs text-neutral-400">Last checked: {new Date(healthCheckedAt).toLocaleTimeString()}</p>
              )}
            </div>
            <div className="flex-1" />
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {healthLoading ? "Checking..." : "Check All"}
            </button>
          </div>

          {healthLoading && !health ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
          ) : health ? (
            <div className="grid grid-cols-3 gap-4">
              {(Object.entries(health) as Array<[string, IntegrationResult]>)
                .filter(([key]) => key !== "checkedAt")
                .map(([key, result]) => (
                  <IntegrationCard key={key} name={key} result={result} />
                ))}
            </div>
          ) : (
            <div className="text-center py-16 text-neutral-400">
              <WifiOff className="w-10 h-10 mx-auto mb-3 text-neutral-200" />
              <p className="text-sm">Click "Check All" to test integration connectivity.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(new Set<TabId>(["users"]));

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setLoadedTabs(prev => { const next = new Set<TabId>(Array.from(prev)); next.add(tab); return next; });
  };

  return (
    <ErrorToastProvider>
      <div className="max-w-7xl mx-auto">
        {/* Tab navigation */}
        <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
          <nav className="flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === id
                    ? "border-[#F22F46] text-[#F22F46] bg-red-50/50"
                    : "border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === "users" && <UsersTab currentUid={user?.uid} />}
        {activeTab === "subscriptions" && <SubscriptionsTab wasLoaded={loadedTabs.has("subscriptions")} />}
        {activeTab === "plans" && <PlansTab wasLoaded={loadedTabs.has("plans")} />}
        {activeTab === "apikeys" && <ApiKeysTab wasLoaded={loadedTabs.has("apikeys")} />}
        {activeTab === "settings" && <SystemSettingsTab wasLoaded={loadedTabs.has("settings")} />}
        {activeTab === "phone" && <PhoneIntegrationsTab wasLoaded={loadedTabs.has("phone")} />}
        {activeTab === "pronunciation" && <PronunciationTab wasLoaded={loadedTabs.has("pronunciation")} />}
      </div>
    </ErrorToastProvider>
  );
}
