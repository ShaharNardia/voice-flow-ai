"use client";

/**
 * Admin → Branding: per-tenant white-label config.
 *
 * Super-admins can pick any tenant; tenant admins edit their own only.
 * Persists to Company/{id}.branding. useBranding() picks it up live.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_BRANDING, type Branding } from "@/hooks/useBranding";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Palette, Save, Loader2, RefreshCw, Eye } from "lucide-react";

interface CompanyOption { id: string; name: string }

export default function AdminBrandingPage() {
  const { user, role } = useAuth();
  const isSuper = role === "super_admin";
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Partial<Branding>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Super-admins get a dropdown of every Company; tenant admins are pinned
  // to their own company doc.
  useEffect(() => {
    (async () => {
      try {
        if (isSuper) {
          const snap = await getDocs(collection(db, "Company"));
          const opts: CompanyOption[] = snap.docs.map((d) => ({
            id: d.id,
            name: (d.data().name as string) || d.id.slice(0, 8),
          }));
          opts.sort((a, b) => a.name.localeCompare(b.name));
          setCompanies(opts);
          if (opts.length && !selectedId) setSelectedId(opts[0].id);
        } else if (user?.uid) {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          const companyId = (userSnap.data()?.companyId as string) || user.uid;
          setSelectedId(companyId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load companies");
      }
    })();
  }, [isSuper, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the selected company's existing branding into the draft form.
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    getDoc(doc(db, "Company", selectedId))
      .then((snap) => {
        const data = snap.exists() ? snap.data() : {};
        setDraft((data.branding as Partial<Branding>) || {});
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await setDoc(
        doc(db, "Company", selectedId),
        {
          branding: {
            productName:  draft.productName  || DEFAULT_BRANDING.productName,
            logoUrl:      draft.logoUrl      || null,
            primaryColor: draft.primaryColor || DEFAULT_BRANDING.primaryColor,
            accentColor:  draft.accentColor  || DEFAULT_BRANDING.accentColor,
            footerText:   draft.footerText   || "",
            loginTagline: draft.loginTagline || "",
          },
        },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft({});

  const set = (k: keyof Branding) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const preview: Branding = { ...DEFAULT_BRANDING, ...draft };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#F22F46]" />
            White-label Branding
          </h1>
          <p className="text-sm text-neutral-500">
            Customize what every tenant user sees — logo, product name, colors, footer.
          </p>
        </div>
      </div>

      {isSuper && companies.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
            Tenant
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#F22F46]"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.id.slice(0, 8)}…)</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Form */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            <Field label="Product Name" placeholder={DEFAULT_BRANDING.productName} value={draft.productName ?? ""} onChange={set("productName")} />
            <Field label="Logo URL" placeholder="https://… (PNG or SVG, square ~64×64)" value={draft.logoUrl ?? ""} onChange={set("logoUrl")} />
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Primary Color"  value={draft.primaryColor ?? DEFAULT_BRANDING.primaryColor} onChange={set("primaryColor")} />
              <ColorField label="Accent Color"   value={draft.accentColor  ?? DEFAULT_BRANDING.accentColor}  onChange={set("accentColor")} />
            </div>
            <Field label="Footer Text" placeholder="Powered by Voximplant" value={draft.footerText ?? ""} onChange={set("footerText")} />
            <Field label="Login Tagline" placeholder="Phone-bot platform for businesses…" value={draft.loginTagline ?? ""} onChange={set("loginTagline")} />

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving || !selectedId}
                className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 px-3 py-2 rounded-lg text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reset to defaults
              </button>
              {saved && <span className="text-emerald-600 text-sm ml-auto">Saved.</span>}
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3 text-xs text-neutral-500 uppercase tracking-wide">
              <Eye className="w-3.5 h-3.5" />
              Live preview
            </div>

            {/* Mock sidebar header */}
            <div className="bg-[#0D1117] rounded-md p-4 flex items-center gap-3">
              {preview.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.logoUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: preview.primaryColor }} />
              )}
              <span className="text-white font-semibold text-sm">{preview.productName}</span>
            </div>

            {/* Mock CTA pill in primary color */}
            <button
              type="button"
              className="mt-4 w-full py-2 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: preview.primaryColor }}
            >
              Primary action
            </button>

            <button
              type="button"
              className="mt-2 w-full py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: preview.accentColor }}
            >
              Accent action
            </button>

            {preview.footerText && (
              <div className="mt-4 text-center text-xs text-neutral-400">{preview.footerText}</div>
            )}
            {preview.loginTagline && (
              <div className="mt-4 p-3 bg-neutral-50 rounded-lg text-xs text-neutral-600 italic">
                &quot;{preview.loginTagline}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:border-[#F22F46]"
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 border border-neutral-200 rounded-lg cursor-pointer"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-neutral-200 focus:outline-none focus:border-[#F22F46]"
        />
      </div>
    </div>
  );
}
