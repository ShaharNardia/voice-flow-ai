"use client";

import React, { useEffect, useState, useMemo, useCallback, createContext, useContext, useRef, Fragment } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUsersMap } from "@/hooks/useUsersMap";
import {
  adminListUsers, adminToggleUser, adminDeleteUser,
  adminSetRole, adminResetPassword, adminCreateUser, adminGetUserDetail,
  assistantsDelete, scenariosDelete,
  adminGetSubscriptions, adminOverridePlan,
  adminGetPlanConfig, adminUpdatePlanConfig,
  adminGetBillingConfig, adminUpdateBillingConfig,
  adminGetPronunciation, adminUpdatePronunciation,
  type PronunciationFix,
  adminGetSystemSettings, adminUpdateSystemSettings,
  adminGetKeysMeta, adminUpdateKeyMeta,
  adminListAllPhoneNumbers, adminReleasePhoneNumber, adminReassignPhoneNumber,
  adminCheckIntegrations,
  adminGetRateCard, adminUpdateRateCard,
  adminGetCustomerPricing, adminUpdateCustomerPricing,
  adminGetCostDashboard,
  adminListTutorStudents, adminListStudentLessons,
  adminGetFeatureConfig, adminSetFeatureConfig, adminSetUserFeatures,
  type FeatureRegistryEntry,
  type AdminTutorStudent, type AdminStudentLesson,
  adminGetActivityLog, type ActivityLogEntry, type ActivityLogResponse,
  type AdminUser, type Assistant, type AdminCallSession,
  type AdminSubscriptionUser, type PlanTier,
  type AllPlanConfigs, type PlanConfig,
  type AllKeysMeta, type SystemSettings,
  type BillingConfig, type RateCard, type CustomerPricingConfig, type CostDashboardResult,
  type AdminPhoneNumber, type AllIntegrationResults, type IntegrationResult,
} from "@/lib/firebase-functions";
import {
  Loader2, Users, ShieldCheck, ShieldOff, Trash2, KeyRound, Eye, Pencil,
  UserPlus, X, Copy, Check, Phone, Bot, CreditCard, BarChart3, GitBranch,
  Key, Settings, ExternalLink, AlertTriangle, Save, RotateCcw,
  CheckCircle2, XCircle, Info, RefreshCw, Globe, Wifi, WifiOff, DollarSign, TrendingUp, GraduationCap,
  Activity, ChevronDown, ChevronRight, Clock, ToggleLeft,
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
  { id: "features",      label: "Features",             icon: ToggleLeft },
  { id: "phone",         label: "Phone & Integrations", icon: Phone },
  { id: "pronunciation", label: "Pronunciation",        icon: Globe },
  { id: "activity",      label: "Activity Log",         icon: Activity },
  { id: "costs",         label: "Costs & Revenue",      icon: DollarSign },
  { id: "tutor",         label: "Tutor Students",       icon: GraduationCap },
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

function Badge({ role }: { role: string }) {
  const style =
    role === "super_admin" ? "bg-red-100 text-red-700" :
    role === "admin" ? "bg-purple-100 text-purple-700" :
    "bg-neutral-100 text-neutral-600";
  const label = role === "super_admin" ? "super admin" : role;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>{label}</span>
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

function UsersTab({ currentUid, currentRole }: { currentUid?: string; currentRole?: string }) {
  const isSuperAdmin = currentRole === "super_admin";
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
  const [detail, setDetail] = useState<{
    assistants: { id: string; name: string; language?: string; voice?: string; createdAt?: unknown }[];
    recentCalls: { id: string; leadNumber?: string; status?: string; createdAt?: unknown; assistantName?: string; scenarioId?: string; duration?: number }[];
    scenarios: { id: string; name: string; description?: string; nodeCount?: number; isActive?: boolean; createdAt?: unknown }[];
    leads: { id: string; name?: string; phone?: string; email?: string; status?: string; createdAt?: unknown }[];
    campaigns: { id: string; name?: string; status?: string; leadCount?: number; createdAt?: unknown }[];
    phoneNumbers: { id: string; phoneNumber: string; friendlyName?: string; assistantId?: string }[];
    plan?: string;
    stripeCustomerId?: string;
    stripeStatus?: string;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit user state
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState<"user" | "admin" | "super_admin">("user");
  const [editPlan, setEditPlan] = useState<"basic" | "pro" | "scale">("basic");
  const [editStatus, setEditStatus] = useState<"active" | "suspended">("active");
  // Feature overrides state for the currently-edited user.
  // Values: true = force on, false = force off, undefined = inherit role default.
  const [editFeatureOverrides, setEditFeatureOverrides] = useState<Record<string, boolean>>({});
  const [initialFeatureOverrides, setInitialFeatureOverrides] = useState<Record<string, boolean>>({});
  const [featureRegistry, setFeatureRegistry] = useState<FeatureRegistryEntry[]>([]);
  const [featureModuleOpen, setFeatureModuleOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

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
    admins: users.filter(u => u.role === "admin" || u.role === "super_admin").length,
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

  const handleRoleChange = async (u: AdminUser, newRole: "user" | "admin" | "super_admin") => {
    if (newRole === u.role) return;
    const label = newRole === "super_admin" ? "SUPER ADMIN" : newRole.toUpperCase();
    const warning = newRole === "super_admin"
      ? `\n\n⚠ Super admins have full system access — including billing, rate cards, user management, and all tenant data. Only promote someone you trust.`
      : "";
    if (!confirm(`Change ${u.email} role to "${label}"?${warning}`)) return;
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
    } catch { setDetail({ assistants: [], recentCalls: [], scenarios: [], leads: [], campaigns: [], phoneNumbers: [] }); }
    finally { setLoadingDetail(false); }
  };

  const handleCopyLink = () => {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openEditUser = async (u: AdminUser) => {
    setEditUser(u);
    setEditRole(u.role as "user" | "admin" | "super_admin");
    setEditPlan((u.plan as "basic" | "pro" | "scale") || "basic");
    setEditStatus(u.status as "active" | "suspended");
    setEditError("");
    setEditFeatureOverrides({});
    setInitialFeatureOverrides({});
    setFeatureModuleOpen(false);
    // Load the user's current feature overrides + registry (super_admin only)
    if (isSuperAdmin) {
      try {
        const [detail, cfg] = await Promise.all([
          adminGetUserDetail(u.uid),
          featureRegistry.length ? Promise.resolve(null) : adminGetFeatureConfig(),
        ]);
        const overrides = detail.featureOverrides || {};
        setEditFeatureOverrides({ ...overrides });
        setInitialFeatureOverrides({ ...overrides });
        if (cfg) setFeatureRegistry(cfg.featureRegistry);
      } catch {
        // Non-fatal; UI will show "unavailable"
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    setEditError("");
    try {
      const updates: Promise<unknown>[] = [];

      // Role change (super_admin only)
      if (isSuperAdmin && editRole !== editUser.role) {
        updates.push(adminSetRole({ uid: editUser.uid, role: editRole }));
      }

      // Plan change
      if (editPlan !== (editUser.plan || "basic")) {
        updates.push(adminOverridePlan({ uid: editUser.uid, plan: editPlan }));
      }

      // Status change
      if (editStatus !== editUser.status) {
        updates.push(adminToggleUser({ uid: editUser.uid, status: editStatus }));
      }

      // Feature overrides diff — only send keys that changed.
      if (isSuperAdmin) {
        const diff: Record<string, boolean | null> = {};
        const allKeys = Array.from(new Set([
          ...Object.keys(editFeatureOverrides),
          ...Object.keys(initialFeatureOverrides),
        ]));
        for (const k of allKeys) {
          const before = initialFeatureOverrides[k];
          const after = editFeatureOverrides[k];
          if (before === after) continue;
          if (after === undefined) diff[k] = null;       // inherit (delete)
          else diff[k] = after;                          // force on/off
        }
        if (Object.keys(diff).length > 0) {
          updates.push(adminSetUserFeatures({ uid: editUser.uid, featureOverrides: diff }));
        }
      }

      if (updates.length === 0) { setEditUser(null); return; }

      await Promise.all(updates);
      setUsers(prev => prev.map(u => u.uid === editUser.uid ? {
        ...u,
        role: (isSuperAdmin && editUser.role !== "super_admin") ? editRole : u.role,
        plan: editPlan,
        status: editStatus,
        disabled: editStatus === "suspended",
      } : u));
      setEditUser(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally { setSaving(false); }
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
        {isSuperAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        )}
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
                    {isSuperAdmin && !isSelf(u) ? (
                      settingRole === u.uid ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u, e.target.value as "user" | "admin" | "super_admin")}
                          className={`text-xs font-semibold rounded-full px-2.5 py-1 border cursor-pointer hover:opacity-90 ${
                            u.role === "super_admin" ? "bg-red-100 text-red-700 border-red-200"
                            : u.role === "admin" ? "bg-blue-100 text-blue-700 border-blue-200"
                            : "bg-neutral-100 text-neutral-600 border-neutral-200"
                          }`}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="super_admin">super admin</option>
                        </select>
                      )
                    ) : (
                      <Badge role={u.role} />
                    )}
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
                      {!isSelf(u) && (
                        <button
                          onClick={() => openEditUser(u)}
                          title="Edit user"
                          className="p-1.5 rounded-md text-neutral-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleViewDetail(u)}
                        title="View details"
                        className="p-1.5 rounded-md text-neutral-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && !isSelf(u) && u.role !== "super_admin" && (
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
          <div className="w-[480px] bg-white shadow-xl flex flex-col overflow-hidden">
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
                      <p className="text-xs text-neutral-400">No assistants.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.assistants.map(a => (
                          <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <div>
                              <span className="text-sm text-neutral-800">{a.name}</span>
                              {a.language && <span className="text-xs text-neutral-400 ml-2">{a.language}</span>}
                            </div>
                            {isSuperAdmin && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete assistant "${a.name}"?`)) return;
                                  try {
                                    await assistantsDelete({id: a.id});
                                    setDetail(prev => prev ? {...prev, assistants: prev.assistants.filter(x => x.id !== a.id)} : prev);
                                  } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
                                }}
                                className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                                title="Delete assistant"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Scenarios */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Scenarios <span className="text-neutral-400 font-normal">({detail.scenarios.length})</span></h3>
                    </div>
                    {detail.scenarios.length === 0 ? (
                      <p className="text-xs text-neutral-400">No scenarios.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.scenarios.map(s => (
                          <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <div>
                              <span className="text-sm text-neutral-800">{s.name}</span>
                              <span className="text-xs text-neutral-400 ml-2">{s.nodeCount || 0} nodes</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <a href={`/scenarios/edit?id=${s.id}`} target="_blank" rel="noopener noreferrer"
                                className="p-1 text-neutral-400 hover:text-blue-500 transition-colors" title="Edit scenario">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              {isSuperAdmin && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete scenario "${s.name}"?`)) return;
                                    try {
                                      await scenariosDelete(s.id);
                                      setDetail(prev => prev ? {...prev, scenarios: prev.scenarios.filter(x => x.id !== s.id)} : prev);
                                    } catch (e: unknown) { showError(e instanceof Error ? e.message : "Failed"); }
                                  }}
                                  className="p-1 text-neutral-400 hover:text-red-500 transition-colors" title="Delete scenario"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phone Numbers */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Phone Numbers <span className="text-neutral-400 font-normal">({detail.phoneNumbers.length})</span></h3>
                    </div>
                    {detail.phoneNumbers.length === 0 ? (
                      <p className="text-xs text-neutral-400">No phone numbers assigned.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.phoneNumbers.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <span className="text-sm text-neutral-800 font-mono">{p.phoneNumber}</span>
                            {p.friendlyName && <span className="text-xs text-neutral-400">{p.friendlyName}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Leads */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Leads <span className="text-neutral-400 font-normal">({detail.leads.length})</span></h3>
                    </div>
                    {detail.leads.length === 0 ? (
                      <p className="text-xs text-neutral-400">No leads.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.leads.slice(0, 10).map(l => (
                          <div key={l.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <div>
                              <span className="text-sm text-neutral-800">{l.name || l.phone || "Unknown"}</span>
                              {l.email && <span className="text-xs text-neutral-400 ml-2">{l.email}</span>}
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${l.status === "contacted" ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-500"}`}>
                              {l.status || "new"}
                            </span>
                          </div>
                        ))}
                        {detail.leads.length > 10 && (
                          <p className="text-xs text-neutral-400 text-center">...and {detail.leads.length - 10} more</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Campaigns */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-neutral-400" />
                      <h3 className="text-sm font-semibold text-neutral-800">Campaigns <span className="text-neutral-400 font-normal">({detail.campaigns.length})</span></h3>
                    </div>
                    {detail.campaigns.length === 0 ? (
                      <p className="text-xs text-neutral-400">No campaigns.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.campaigns.map(c => (
                          <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg">
                            <span className="text-sm text-neutral-800">{c.name || "Untitled"}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-neutral-400">{c.leadCount || 0} leads</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === "running" ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-500"}`}>
                                {c.status || "draft"}
                              </span>
                            </div>
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
                      <div className="space-y-1.5">
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
      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Edit User</h2>
                <p className="text-xs text-neutral-400 mt-0.5">{editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
            </div>
            {editError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{editError}</div>}
            <div className="space-y-4">
              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Role</label>
                {isSuperAdmin && !isSelf(editUser) ? (
                  <>
                    <select value={editRole} onChange={e => setEditRole(e.target.value as "user" | "admin" | "super_admin")}
                      className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 bg-white">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    {editRole === "super_admin" && editUser.role !== "super_admin" && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1">
                        <span>⚠</span>
                        <span>Super admins have full system access including billing, rate cards, user management, and all tenant data. Only promote someone you trust.</span>
                      </p>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-500">
                    <Badge role={editUser.role} />
                    <span className="ml-2 text-xs text-neutral-400">{isSelf(editUser) ? "(can't change your own role)" : "(only super admin can change roles)"}</span>
                  </div>
                )}
              </div>

              {/* Plan */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Plan</label>
                <select value={editPlan} onChange={e => setEditPlan(e.target.value as "basic" | "pro" | "scale")}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 bg-white">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="scale">Scale</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value as "active" | "suspended")}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-200 bg-white">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {/* Module access (super_admin only) */}
              {isSuperAdmin && featureRegistry.length > 0 && (
                <div className="border border-neutral-200 rounded-lg">
                  <button type="button" onClick={() => setFeatureModuleOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors">
                    <span className="font-medium text-neutral-700">Module access</span>
                    <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${featureModuleOpen ? "rotate-180" : ""}`} />
                  </button>
                  {featureModuleOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-neutral-200 space-y-2 max-h-[280px] overflow-y-auto">
                      <p className="text-xs text-neutral-500 pt-2 pb-1">
                        &quot;Inherit&quot; uses the role default. Override here to force a module on or off for this user only.
                      </p>
                      {featureRegistry.map((f) => {
                        const current = editFeatureOverrides[f.id];
                        const value = current === undefined ? "inherit" : current ? "on" : "off";
                        return (
                          <div key={f.id} className="flex items-center justify-between gap-2 py-1">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-neutral-700 truncate">{f.label}</div>
                              <div className="text-[10px] text-neutral-400 uppercase tracking-wide">{f.kind}</div>
                            </div>
                            <select
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditFeatureOverrides(prev => {
                                  const next = { ...prev };
                                  if (v === "inherit") delete next[f.id];
                                  else next[f.id] = v === "on";
                                  return next;
                                });
                              }}
                              className="text-xs border border-neutral-200 rounded-md px-2 py-1 bg-white focus:outline-none"
                            >
                              <option value="inherit">Inherit</option>
                              <option value="on">Force on</option>
                              <option value="off">Force off</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditUser(null)}
                  className="flex-1 border border-neutral-200 text-neutral-600 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 bg-[#F22F46] hover:bg-[#d9243b] text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
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
                ] as Array<{ key: keyof PlanConfig; label: string }>).map(({ key, label }) => {
                  // null (or negative) = Unlimited. Leave the field empty so
                  // the ∞ placeholder shows; round-trip null on save.
                  const raw = p[key];
                  const isUnlimited = raw === null || raw === undefined || (typeof raw === "number" && raw < 0);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">{label}</span>
                      <input
                        type="number" min={0}
                        value={isUnlimited ? "" : (raw as number)}
                        placeholder="∞"
                        title={isUnlimited ? "Unlimited — leave empty for no cap" : ""}
                        onChange={e => updateTier(tier, key, e.target.value === "" ? null : Number(e.target.value))}
                        className="w-20 text-xs text-right border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                  );
                })}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl">
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

// ── Tab: Features (role defaults) ─────────────────────────────────────────────

function FeaturesTab({ wasLoaded, isSuperAdmin }: { wasLoaded: boolean; isSuperAdmin: boolean }) {
  const showError = useErrorToast();
  const [registry, setRegistry] = useState<FeatureRegistryEntry[]>([]);
  const [defaults, setDefaults] = useState<{ user: Record<string, boolean>; admin: Record<string, boolean> }>({ user: {}, admin: {} });
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!wasLoaded || !isSuperAdmin) return;
    setLoading(true);
    adminGetFeatureConfig()
      .then((res) => {
        setRegistry(res.featureRegistry);
        setDefaults({ user: res.defaults.user || {}, admin: res.defaults.admin || {} });
      })
      .catch((e) => showError(e instanceof Error ? e.message : "Failed to load feature config"))
      .finally(() => setLoading(false));
  }, [wasLoaded, isSuperAdmin, showError]);

  const effective = (role: "user" | "admin", f: FeatureRegistryEntry): boolean => {
    const v = defaults[role][f.id];
    return v === undefined ? f.defaultOn : v;
  };

  const toggle = async (role: "user" | "admin", f: FeatureRegistryEntry) => {
    const next = !effective(role, f);
    const key = `${role}:${f.id}`;
    setSavingKey(key);
    // optimistic
    setDefaults(prev => ({ ...prev, [role]: { ...prev[role], [f.id]: next } }));
    try {
      await adminSetFeatureConfig({ role, featureId: f.id, enabled: next });
    } catch (e) {
      // revert
      setDefaults(prev => ({ ...prev, [role]: { ...prev[role], [f.id]: !next } }));
      showError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingKey(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center text-neutral-500">
        Only super admins can manage feature defaults.
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>;
  }

  const navFeatures = registry.filter(f => f.kind === "nav");
  const capFeatures = registry.filter(f => f.kind === "cap");

  const renderRows = (list: FeatureRegistryEntry[]) => list.map((f) => (
    <tr key={f.id} className="border-b border-neutral-100 last:border-0">
      <td className="py-3 px-4">
        <div className="text-sm text-neutral-800">{f.label}</div>
        <div className="text-[11px] text-neutral-400 font-mono">{f.id}</div>
      </td>
      {(["user", "admin"] as const).map((role) => {
        const on = effective(role, f);
        const key = `${role}:${f.id}`;
        return (
          <td key={role} className="py-3 px-4 text-center">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={on}
                disabled={savingKey === key}
                onChange={() => toggle(role, f)}
                className="w-4 h-4 rounded border-neutral-300 text-[#F22F46] focus:ring-[#F22F46]"
              />
              {savingKey === key && <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />}
            </label>
          </td>
        );
      })}
      <td className="py-3 px-4 text-center text-neutral-400">
        <Check className="w-4 h-4 inline text-neutral-300" />
      </td>
    </tr>
  ));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <h2 className="text-base font-semibold text-neutral-900 mb-1">Feature defaults by role</h2>
        <p className="text-sm text-neutral-500 mb-4">
          Turn modules on or off for everyone in a role. Individual users can be overridden in <strong>Users → Edit</strong>.
          Super admins always have access to everything.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase text-neutral-500 border-b border-neutral-200">
                <th className="text-left py-2 px-4 font-medium">Feature</th>
                <th className="py-2 px-4 font-medium w-24">User</th>
                <th className="py-2 px-4 font-medium w-24">Admin</th>
                <th className="py-2 px-4 font-medium w-28">Super admin</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={4} className="px-4 pt-4 pb-1 text-xs uppercase tracking-wide text-neutral-400">Navigation modules</td></tr>
              {renderRows(navFeatures)}
              <tr><td colSpan={4} className="px-4 pt-4 pb-1 text-xs uppercase tracking-wide text-neutral-400">Capabilities</td></tr>
              {renderRows(capFeatures)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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

const CLOUD_RUN_URL = "https://voiceflow-mediastream-900818829902.me-west1.run.app";

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-6xl items-start">
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
  // #50 — resolve raw ownerIds to display emails when the audit field is missing.
  const { usersMap } = useUsersMap();

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
                        {(() => {
                          const resolved = p.ownerId ? usersMap.get(p.ownerId) : null;
                          const email = p.ownerEmail || resolved?.email;
                          const name = resolved?.displayName;
                          if (email) {
                            return <span className="text-sm text-neutral-700" title={p.ownerId || ""}>{email}</span>;
                          }
                          if (name) {
                            return <span className="text-sm text-neutral-700" title={p.ownerId || ""}>{name}</span>;
                          }
                          if (p.ownerId) {
                            return <span className="text-xs font-mono text-neutral-500" title={p.ownerId}>{p.ownerId.slice(0, 8)}…</span>;
                          }
                          return <span className="text-xs text-neutral-400 italic">Unassigned</span>;
                        })()}
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

// ── Costs & Revenue Tab ───────────────────────────────────────────────────────

function CostsTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<CostDashboardResult | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [rcEditing, setRcEditing] = useState(false);
  const [rcSaving, setRcSaving] = useState(false);
  const [pricing, setPricing] = useState<CustomerPricingConfig | null>(null);
  const [pricingSaving, setPricingSaving] = useState(false);

  const getDateRange = useCallback((p: string) => {
    const now = new Date();
    const to = now.toISOString();
    if (p === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to };
    if (p === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d.toISOString(), to }; }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
  }, []);

  const loadDashboard = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const range = getDateRange(p);
      const [dash, rc, cp] = await Promise.all([
        adminGetCostDashboard(range),
        adminGetRateCard(),
        adminGetCustomerPricing(),
      ]);
      setDashboard(dash);
      setRateCard(rc);
      setPricing(cp);
    } catch (e) { showError(e instanceof Error ? e.message : "Failed to load costs"); }
    finally { setLoading(false); }
  }, [getDateRange, showError]);

  useEffect(() => { if (wasLoaded) loadDashboard(period); }, [wasLoaded]); // eslint-disable-line

  const handlePeriod = (p: "today" | "week" | "month") => { setPeriod(p); loadDashboard(p); };

  const saveRateCard = async () => {
    if (!rateCard) return;
    setRcSaving(true);
    try { await adminUpdateRateCard({ rateCard }); setRcEditing(false); } catch (e) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setRcSaving(false); }
  };

  const savePricing = async () => {
    if (!pricing) return;
    setPricingSaving(true);
    try { await adminUpdateCustomerPricing(pricing); } catch (e) { showError(e instanceof Error ? e.message : "Failed"); }
    finally { setPricingSaving(false); }
  };

  const s = dashboard?.summary;
  const bs = dashboard?.byService;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Costs & Revenue</h2>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
          {(["today", "week", "month"] as const).map(p => (
            <button key={p} onClick={() => handlePeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${period === p ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
            >{p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}</button>
          ))}
        </div>
        <button onClick={() => loadDashboard(period)} className="ml-auto text-neutral-400 hover:text-neutral-600"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? <div className="text-center py-12 text-neutral-400 text-sm">Loading costs...</div> : s && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Total Cost", value: `$${s.totalCost.toFixed(2)}`, color: "text-red-600" },
              { label: "Revenue", value: `$${s.totalRevenue.toFixed(2)}`, color: "text-green-600" },
              { label: "Profit", value: `$${s.profit.toFixed(2)}`, color: s.profit >= 0 ? "text-green-600" : "text-red-600" },
              { label: "Calls", value: `${s.totalCalls} (${s.totalMinutes.toFixed(0)} min)`, color: "text-neutral-800" },
            ].map(c => (
              <div key={c.label} className="bg-white border border-neutral-200 rounded-xl p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wide">{c.label}</p>
                <p className={`text-xl font-bold mt-1 ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Cost by service */}
          {bs && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-neutral-700 mb-3">Cost by Service</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { name: "Twilio (Calls)", cost: bs.twilio, icon: "📞" },
                  { name: "OpenAI (LLM)", cost: bs.llm, icon: "🧠" },
                  { name: "Deepgram (STT)", cost: bs.stt, icon: "🎙️" },
                  { name: "TTS", cost: bs.tts, icon: "🔊" },
                  { name: "Realtime (V2V)", cost: bs.realtime ?? 0, icon: "⚡" },
                ].map(svc => {
                  const pct = s.totalCost > 0 ? (svc.cost / s.totalCost * 100).toFixed(0) : "0";
                  return (
                    <div key={svc.name} className="bg-neutral-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-neutral-600">{svc.icon} {svc.name}</div>
                      <p className="text-lg font-semibold text-neutral-900 mt-1">${svc.cost.toFixed(4)}</p>
                      <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-2">
                        <div className="bg-[#F22F46] rounded-full h-1.5" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{pct}% of total</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cost by user */}
          {dashboard.byUser.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <h3 className="text-sm font-semibold text-neutral-700 p-4 border-b">Cost by User</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="bg-neutral-50 text-neutral-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">User</th><th className="px-4 py-2 text-right">Calls</th>
                  <th className="px-4 py-2 text-right">Minutes</th><th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Profit</th>
                </tr></thead>
                <tbody>
                  {dashboard.byUser.map(u => (
                    <tr key={u.uid} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2 text-right">{u.calls}</td>
                      <td className="px-4 py-2 text-right">{u.minutes}</td>
                      <td className="px-4 py-2 text-right text-red-600">${u.cost.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-green-600">${u.revenue.toFixed(4)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${u.revenue - u.cost >= 0 ? "text-green-600" : "text-red-600"}`}>${(u.revenue - u.cost).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Cost by assistant */}
          {dashboard.byAssistant && dashboard.byAssistant.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <h3 className="text-sm font-semibold text-neutral-700 p-4 border-b">Cost by Assistant</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="bg-neutral-50 text-neutral-500 text-xs uppercase">
                  <th className="px-4 py-2 text-left">Assistant</th><th className="px-4 py-2 text-right">Calls</th>
                  <th className="px-4 py-2 text-right">Minutes</th><th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Profit</th>
                </tr></thead>
                <tbody>
                  {dashboard.byAssistant.map(a => (
                    <tr key={a.assistantId} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-4 py-2">{a.assistantName}</td>
                      <td className="px-4 py-2 text-right">{a.calls}</td>
                      <td className="px-4 py-2 text-right">{a.minutes}</td>
                      <td className="px-4 py-2 text-right text-red-600">${a.cost.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-green-600">${a.revenue.toFixed(4)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${a.revenue - a.cost >= 0 ? "text-green-600" : "text-red-600"}`}>${(a.revenue - a.cost).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Rate Card Editor */}
      {rateCard && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-700">⚙️ Rate Card (Provider Costs)</h3>
            {!rcEditing ? (
              <button onClick={() => setRcEditing(true)} className="text-xs text-[#0066CC] hover:underline">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setRcEditing(false)} className="text-xs text-neutral-500">Cancel</button>
                <button onClick={saveRateCard} disabled={rcSaving} className="text-xs bg-[#F22F46] text-white px-3 py-1 rounded-md hover:bg-[#d9243b] disabled:opacity-50">
                  {rcSaving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            {[
              { label: "Twilio $/min", val: rateCard.twilio?.costPerMinute, set: (v: number) => setRateCard({...rateCard, twilio: {...rateCard.twilio, costPerMinute: v}}) },
              { label: "OpenAI prompt $/1K tok", val: rateCard.openai?.costPerPromptToken1K, set: (v: number) => setRateCard({...rateCard, openai: {...rateCard.openai, costPerPromptToken1K: v}}) },
              { label: "OpenAI completion $/1K tok", val: rateCard.openai?.costPerCompletionToken1K, set: (v: number) => setRateCard({...rateCard, openai: {...rateCard.openai, costPerCompletionToken1K: v}}) },
              { label: "OpenAI TTS $/1K chars", val: rateCard.openai?.costPerTtsChar1K, set: (v: number) => setRateCard({...rateCard, openai: {...rateCard.openai, costPerTtsChar1K: v}}) },
              { label: "Deepgram $/min", val: rateCard.deepgram?.costPerMinute, set: (v: number) => setRateCard({...rateCard, deepgram: {...rateCard.deepgram, costPerMinute: v}}) },
              { label: "Google TTS $/1K chars", val: rateCard.googleTts?.costPerChar1K, set: (v: number) => setRateCard({...rateCard, googleTts: {...rateCard.googleTts, costPerChar1K: v}}) },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-neutral-500 mb-1">{f.label}</label>
                <input type="number" step="0.0001" value={f.val ?? 0} disabled={!rcEditing}
                  onChange={e => f.set(parseFloat(e.target.value) || 0)}
                  className="w-full border border-neutral-200 rounded px-2 py-1.5 text-xs font-mono disabled:bg-neutral-50 disabled:text-neutral-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Pricing Config */}
      {pricing && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-700">💰 Customer Pricing</h3>
            <button onClick={savePricing} disabled={pricingSaving} className="text-xs bg-[#F22F46] text-white px-3 py-1 rounded-md hover:bg-[#d9243b] disabled:opacity-50">
              {pricingSaving ? "Saving..." : "Save"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Default Model</label>
              <select value={pricing.defaultModel} onChange={e => setPricing({...pricing, defaultModel: e.target.value as "markup" | "fixedPerMinute"})}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm">
                <option value="markup">Markup % on actual cost</option>
                <option value="fixedPerMinute">Fixed price per minute</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Default Markup %</label>
              <input type="number" value={pricing.defaultMarkupPercent} onChange={e => setPricing({...pricing, defaultMarkupPercent: parseFloat(e.target.value) || 0})}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Default Fixed $/min</label>
              <input type="number" step="0.01" value={pricing.defaultFixedPerMinute} onChange={e => setPricing({...pricing, defaultFixedPerMinute: parseFloat(e.target.value) || 0})}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Activity Log (Super Admin only) ─────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  delete: "bg-red-100 text-red-600",
  update: "bg-blue-100 text-blue-700",
  toggle: "bg-amber-100 text-amber-700",
  change: "bg-purple-100 text-purple-700",
  place: "bg-cyan-100 text-cyan-700",
  purchase: "bg-emerald-100 text-emerald-700",
  release: "bg-orange-100 text-orange-700",
  start: "bg-green-100 text-green-700",
  override: "bg-amber-100 text-amber-700",
  reset: "bg-indigo-100 text-indigo-700",
  bootstrap: "bg-red-100 text-red-700",
  batch: "bg-blue-100 text-blue-700",
};

function getActionColor(action: string): string {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return cls;
  }
  return "bg-neutral-100 text-neutral-600";
}

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "user", label: "Users" },
  { value: "scenario", label: "Scenarios" },
  { value: "assistant", label: "Assistants" },
  { value: "call", label: "Calls" },
  { value: "phone", label: "Phone Numbers" },
  { value: "lead", label: "Leads" },
  { value: "campaign", label: "Campaigns" },
  { value: "settings", label: "Settings" },
  { value: "billing", label: "Billing" },
];

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function ActivityLogTab({ wasLoaded, isSuperAdmin }: { wasLoaded: boolean; isSuperAdmin: boolean }) {
  const showError = useErrorToast();
  // Resolve raw uids → emails for #50. Audit entries that don't carry
  // userEmail still get a friendly display name when the user is in the
  // active users map.
  const { usersMap } = useUsersMap();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (cursor?: string) => {
    const isMore = !!cursor;
    if (isMore) setLoadingMore(true); else setLoading(true);
    try {
      const result = await adminGetActivityLog({
        limit: 50,
        startAfter: cursor,
        category: categoryFilter || undefined,
      });
      if (isMore) {
        setEntries((prev) => [...prev, ...result.entries]);
      } else {
        setEntries(result.entries);
      }
      setNextCursor(result.nextCursor);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : "Failed to load activity log");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [categoryFilter, showError]);

  useEffect(() => {
    if (!wasLoaded || !isSuperAdmin) return;
    fetchLogs();
  }, [wasLoaded, isSuperAdmin, fetchLogs]);

  // Reload when filter changes
  useEffect(() => {
    if (!wasLoaded || !isSuperAdmin) return;
    fetchLogs();
  }, [categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-12 text-neutral-400 text-sm">
        Activity Log is only available to Super Admins.
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-neutral-500" />
          <h2 className="text-lg font-semibold text-neutral-900">Activity Log</h2>
        </div>
        <div className="flex-1" />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => fetchLogs()}
          className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 px-3 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-neutral-400 text-sm">
          No activity logged yet.
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide w-8"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Resource</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="px-4 py-3 text-neutral-400">
                      {expandedId === entry.id ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-neutral-600" title={entry.timestamp || ""}>
                        {formatTimeAgo(entry.timestamp)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-neutral-700 text-xs" title={entry.userId || ""}>
                        {(() => {
                          // Display priority: entry.userEmail → usersMap lookup → short uid → "system".
                          if (entry.userEmail) return entry.userEmail;
                          const resolved = entry.userId ? usersMap.get(entry.userId) : null;
                          if (resolved?.email) return resolved.email;
                          if (resolved?.displayName) return resolved.displayName;
                          return entry.userId ? <span className="font-mono">{entry.userId.slice(0, 8)}…</span> : "system";
                        })()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getActionColor(entry.action)}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500 capitalize">
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-400 font-mono">
                        {entry.resourceType ? `${entry.resourceType}` : "—"}
                        {entry.resourceId ? ` / ${entry.resourceId.slice(0, 12)}...` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${entry.status === "success" ? "text-green-600" : "text-red-500"}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                  {/* Expanded details row */}
                  {expandedId === entry.id && (
                    <tr>
                      <td colSpan={7} className="px-8 py-4 bg-neutral-50">
                        <div className="space-y-2">
                          <div className="flex gap-6 text-xs">
                            <div>
                              <span className="text-neutral-400">User ID:</span>{" "}
                              <span className="font-mono text-neutral-600">{entry.userId}</span>
                            </div>
                            <div>
                              <span className="text-neutral-400">Timestamp:</span>{" "}
                              <span className="text-neutral-600">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}</span>
                            </div>
                            {entry.resourceId && (
                              <div>
                                <span className="text-neutral-400">Resource ID:</span>{" "}
                                <span className="font-mono text-neutral-600">{entry.resourceId}</span>
                              </div>
                            )}
                          </div>
                          {Object.keys(entry.details || {}).length > 0 && (
                            <div>
                              <span className="text-xs text-neutral-400 block mb-1">Details:</span>
                              <pre className="text-xs bg-white border border-neutral-200 rounded-lg p-3 overflow-x-auto font-mono text-neutral-700">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Load More */}
          {nextCursor && (
            <div className="border-t border-neutral-100 px-4 py-3 text-center">
              <button
                onClick={() => fetchLogs(nextCursor)}
                disabled={loadingMore}
                className="text-sm text-[#F22F46] hover:text-[#d9243b] font-medium disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// TutorStudentsTab — super_admin view of all tutor students + drill-down
// into each student's lesson history with costs.
// ══════════════════════════════════════════════════════════════════════
function TutorStudentsTab({ wasLoaded }: { wasLoaded: boolean }) {
  const showError = useErrorToast();
  const [students, setStudents] = useState<AdminTutorStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lessonsByStudent, setLessonsByStudent] = useState<Record<string, AdminStudentLesson[]>>({});
  const [loadingLessons, setLoadingLessons] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListTutorStudents();
      setStudents(r.students);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load tutor students");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { if (wasLoaded) refresh(); }, [wasLoaded, refresh]);

  const toggleExpand = async (uid: string) => {
    if (expanded === uid) { setExpanded(null); return; }
    setExpanded(uid);
    if (!lessonsByStudent[uid]) {
      setLoadingLessons(uid);
      try {
        const r = await adminListStudentLessons(uid);
        setLessonsByStudent((prev) => ({ ...prev, [uid]: r.lessons }));
      } catch (e) {
        showError(e instanceof Error ? e.message : "Failed to load lessons");
      } finally {
        setLoadingLessons(null);
      }
    }
  };

  const totalCost = students.reduce((s, x) => s + x.cost, 0);
  const totalLessons = students.reduce((s, x) => s + x.lessons, 0);
  const totalMinutes = students.reduce((s, x) => s + x.minutes, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase font-medium">Students</div>
          <div className="text-2xl font-bold text-violet-700">{students.length}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase font-medium">Total lessons</div>
          <div className="text-2xl font-bold text-neutral-900">{totalLessons}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase font-medium">Total minutes</div>
          <div className="text-2xl font-bold text-neutral-900">{totalMinutes}</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase font-medium">Total cost</div>
          <div className="text-2xl font-bold text-red-600">${totalCost.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">All tutor students</h3>
        <button onClick={refresh} className="text-neutral-400 hover:text-neutral-600"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Students table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-400 text-sm">Loading…</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-sm">No tutor students yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-2 text-left"></th>
                  <th className="px-4 py-2 text-left">Student</th>
                  <th className="px-4 py-2 text-left">Level</th>
                  <th className="px-4 py-2 text-right">Lessons</th>
                  <th className="px-4 py-2 text-right">Minutes</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-left">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <Fragment key={s.uid}>
                    <tr className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer" onClick={() => toggleExpand(s.uid)}>
                      <td className="px-4 py-2.5 w-8 text-violet-400">{expanded === s.uid ? "▾" : "▸"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{s.email}</td>
                      <td className="px-4 py-2.5">
                        {s.level ? (
                          <span className="text-[10px] font-semibold uppercase bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full">{s.level}</span>
                        ) : s.placementDone ? (
                          <span className="text-[10px] text-neutral-400">—</span>
                        ) : (
                          <span className="text-[10px] text-amber-600">no placement</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">{s.lessons}</td>
                      <td className="px-4 py-2.5 text-right">{s.minutes}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-mono">${s.cost.toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">{s.lastAt ? new Date(s.lastAt).toLocaleString() : "—"}</td>
                    </tr>
                    {expanded === s.uid && (
                      <tr className="bg-violet-50/30">
                        <td colSpan={7} className="px-4 py-4">
                          {loadingLessons === s.uid ? (
                            <div className="text-center text-neutral-400 text-xs py-4">Loading lessons…</div>
                          ) : (lessonsByStudent[s.uid] || []).length === 0 ? (
                            <div className="text-center text-neutral-400 text-xs py-4">No lessons yet for this student.</div>
                          ) : (
                            <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[720px] bg-white rounded-lg">
                              <thead>
                                <tr className="text-neutral-500 text-[10px] uppercase tracking-wide bg-neutral-50">
                                  <th className="px-3 py-2 text-left">When</th>
                                  <th className="px-3 py-2 text-left">Theme</th>
                                  <th className="px-3 py-2 text-left">Mode</th>
                                  <th className="px-3 py-2 text-right">Duration</th>
                                  <th className="px-3 py-2 text-right">Corrections</th>
                                  <th className="px-3 py-2 text-right">Vocab</th>
                                  <th className="px-3 py-2 text-right">Drills</th>
                                  <th className="px-3 py-2 text-right">In/Out sec</th>
                                  <th className="px-3 py-2 text-right">Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(lessonsByStudent[s.uid] || []).map((l) => (
                                  <tr key={l.id} className="border-t border-neutral-100">
                                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">
                                      {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                                    </td>
                                    <td className="px-3 py-2">{l.theme || "—"} {l.moduleId ? `· ${l.moduleId}` : ""}</td>
                                    <td className="px-3 py-2">
                                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${l.mode === "placement" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                                        {l.mode}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">{Math.round(l.durationSec / 60)}m</td>
                                    <td className="px-3 py-2 text-right">{l.correctionsCount}</td>
                                    <td className="px-3 py-2 text-right">{l.vocabularyCount}</td>
                                    <td className="px-3 py-2 text-right">{l.drillsCount}</td>
                                    <td className="px-3 py-2 text-right font-mono text-[10px] text-neutral-500">{l.realtimeInputSec}/{l.realtimeOutputSec}</td>
                                    <td className="px-3 py-2 text-right text-red-600 font-mono">${l.cost.toFixed(4)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, role } = useAuth();
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
        {activeTab === "users" && <UsersTab currentUid={user?.uid} currentRole={role} />}
        {activeTab === "subscriptions" && <SubscriptionsTab wasLoaded={loadedTabs.has("subscriptions")} />}
        {activeTab === "plans" && <PlansTab wasLoaded={loadedTabs.has("plans")} />}
        {activeTab === "apikeys" && <ApiKeysTab wasLoaded={loadedTabs.has("apikeys")} />}
        {activeTab === "settings" && <SystemSettingsTab wasLoaded={loadedTabs.has("settings")} />}
        {activeTab === "features" && <FeaturesTab wasLoaded={loadedTabs.has("features")} isSuperAdmin={role === "super_admin"} />}
        {activeTab === "phone" && <PhoneIntegrationsTab wasLoaded={loadedTabs.has("phone")} />}
        {activeTab === "pronunciation" && <PronunciationTab wasLoaded={loadedTabs.has("pronunciation")} />}
        {activeTab === "activity" && <ActivityLogTab wasLoaded={loadedTabs.has("activity")} isSuperAdmin={role === "super_admin"} />}
        {activeTab === "costs" && <CostsTab wasLoaded={loadedTabs.has("costs")} />}
        {activeTab === "tutor" && <TutorStudentsTab wasLoaded={loadedTabs.has("tutor")} />}
      </div>
    </ErrorToastProvider>
  );
}
