"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  voiceProductList, voiceProductCreate, voiceProductUpdate, voiceProductDelete,
  voiceOrderList, voiceOrderUpdateStatus,
  type VoiceProduct, type VoiceOrder,
} from "@/lib/firebase-functions";
import {
  ShoppingCart, Package, Plus, Pencil, Trash2, Loader2, RefreshCw,
  DollarSign, CheckCircle2, Clock, ExternalLink, X, Save,
} from "lucide-react";

// ── Order status badge ─────────────────────────────────────────────────────────
function OrderStatus({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending_payment: "bg-yellow-100 text-yellow-700",
    paid:            "bg-green-100 text-green-700",
    processing:      "bg-blue-100 text-blue-700",
    shipped:         "bg-purple-100 text-purple-700",
    delivered:       "bg-teal-100 text-teal-700",
    cancelled:       "bg-red-100 text-red-700",
    refunded:        "bg-orange-100 text-orange-700",
    pending:         "bg-neutral-100 text-neutral-600",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || "bg-neutral-100 text-neutral-600"}`}>{s.replace(/_/g, " ")}</span>;
}

// ── Product form modal ────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onSave }: { product?: VoiceProduct; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [currency, setCurrency] = useState(product?.currency || "USD");
  const [sku, setSku] = useState(product?.sku || "");
  const [stock, setStock] = useState(product?.stock != null ? String(product.stock) : "");
  const [category, setCategory] = useState(product?.category || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !price.trim()) { alert("Name and price are required."); return; }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(), description: description.trim(),
        price: parseFloat(price), currency, sku: sku.trim(),
        stock: stock ? parseInt(stock) : null, category: category.trim(),
      };
      if (product?.id) {
        await voiceProductUpdate({ id: product.id, ...payload });
      } else {
        await voiceProductCreate(payload);
      }
      onSave(); onClose();
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">{product ? "Edit Product" : "New Product"}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-neutral-400" /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Product Name *", val: name, set: setName, placeholder: "e.g. Premium Widget" },
            { label: "SKU", val: sku, set: setSku, placeholder: "e.g. SKU-001" },
            { label: "Category", val: category, set: setCategory, placeholder: "e.g. Electronics" },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium text-neutral-600 block mb-1">{f.label}</label>
              <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-neutral-600 block mb-1">Price *</label>
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 block mb-1">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]">
                {["USD","EUR","GBP","ILS","AED","SAR"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 block mb-1">Stock (leave empty for unlimited)</label>
            <input type="number" value={stock} onChange={e => setStock(e.target.value)} placeholder="Unlimited"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F22F46]" />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-2 text-sm bg-[#F22F46] text-white rounded-lg disabled:opacity-50 hover:bg-[#d41f35] flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {product ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ORDER_STATUSES = ["pending","pending_payment","paid","processing","shipped","delivered","cancelled","refunded"];

export default function VoiceCommercePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<VoiceProduct[]>([]);
  const [orders, setOrders] = useState<VoiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState<VoiceProduct | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, ords] = await Promise.all([voiceProductList(true), voiceOrderList()]);
      setProducts(prods.products || []);
      setOrders(ords.orders || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const deleteProduct = async (id: string) => {
    if (!confirm("Remove this product from the catalog?")) return;
    setBusy(true);
    try { await voiceProductDelete({ id }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    setBusy(true);
    try { await voiceOrderUpdateStatus({ id, status }); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  const totalRevenue = orders.filter(o => o.status === "paid" || o.status === "delivered").reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            Voice Commerce
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">Product catalog · In-call ordering · Stripe payment links via SMS</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {tab === "products" && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#F22F46] text-white rounded-lg hover:bg-[#d41f35]">
              <Plus className="w-3.5 h-3.5" /> Add Product
            </button>
          )}
        </div>
      </div>

      {(showCreate) && <ProductModal onClose={() => setShowCreate(false)} onSave={load} />}
      {editProduct && <ProductModal product={editProduct} onClose={() => setEditProduct(undefined)} onSave={load} />}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">Products</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{products.filter(p => p.active).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">Orders</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{orders.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">Revenue</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">${totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {(["products","orders"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
            {t === "products" ? `Products (${products.length})` : `Orders (${orders.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
      ) : (
        <>
          {/* ── Products ────────────────────────────── */}
          {tab === "products" && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              {products.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Package className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No products yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Add products your AI assistant can sell over the phone</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        {["Name","SKU","Category","Price","Stock","Status",""].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-neutral-50/50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-neutral-800">{p.name}</p>
                            {p.description && <p className="text-xs text-neutral-400 truncate max-w-xs">{p.description}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-500 font-mono text-xs">{p.sku || "—"}</td>
                          <td className="px-4 py-2.5 text-neutral-600">{p.category || "—"}</td>
                          <td className="px-4 py-2.5 font-medium text-neutral-800">${p.price.toFixed(2)} <span className="text-xs text-neutral-400">{p.currency}</span></td>
                          <td className="px-4 py-2.5 text-neutral-600">{p.stock != null ? p.stock : "∞"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                              {p.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditProduct(p)} className="text-neutral-400 hover:text-blue-500">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteProduct(p.id)} className="text-neutral-400 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Orders ──────────────────────────────── */}
          {tab === "orders" && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              {orders.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <ShoppingCart className="w-10 h-10 text-neutral-200 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500">No orders yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Orders are created when callers purchase products during AI calls</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        {["Customer","Items","Total","Status","Payment","Date",""].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                      {orders.map(o => (
                        <tr key={o.id} className="hover:bg-neutral-50/50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-neutral-800">{o.partyName || "Unknown"}</p>
                            {o.partyPhone && <p className="text-xs text-neutral-400">{o.partyPhone}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600 text-xs">{o.items.length} item{o.items.length > 1 ? "s" : ""}</td>
                          <td className="px-4 py-2.5 font-medium text-neutral-800">${o.totalAmount.toFixed(2)}</td>
                          <td className="px-4 py-2.5"><OrderStatus s={o.status} /></td>
                          <td className="px-4 py-2.5">
                            {o.paymentLink ? (
                              <a href={o.paymentLink} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <ExternalLink className="w-3 h-3" /> Link
                              </a>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-400 text-xs">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-2.5">
                            <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)}
                              disabled={busy}
                              className="text-xs border border-neutral-200 rounded px-2 py-1 focus:outline-none">
                              {ORDER_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
