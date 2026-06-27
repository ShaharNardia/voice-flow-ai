"use client";

import { useState } from "react";
import { searchPhoneNumbers, purchasePhoneNumber, type PhoneNumber } from "@/lib/firebase-functions";
import Link from "next/link";
import { ArrowLeft, Search, Check, Loader2 } from "lucide-react";

// Area code is only meaningful for US and CA
const AREA_CODE_COUNTRIES = ["US", "CA"];

type Provider = "twilio" | "voximplant";

export default function BuyPhoneNumberPage() {
  const [provider, setProvider] = useState<Provider>("twilio");
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<PhoneNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const accent = provider === "voximplant" ? "#EA7B0C" : "#F22F46";

  const handleSearch = async () => {
    setError(""); setNote(null);
    setSearchPerformed(false);
    setSearching(true);
    try {
      const res = await searchPhoneNumbers({ country, areaCode: areaCode || undefined, provider });
      setResults(res.numbers);
      setNote(res.note ?? null);
      setSearchPerformed(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async (n: PhoneNumber) => {
    setPurchasing(n.phoneNumber);
    setError(""); setNote(null);
    try {
      const res = await purchasePhoneNumber({
        phoneNumber: n.phoneNumber,
        provider,
        // Voximplant needs these to attach the exact number/region.
        phoneId: n.phoneId,
        regionId: n.regionId,
        category: n.category,
      });
      setPurchased(n.phoneNumber);
      if (res?.note) setNote(res.note);
      else if (provider === "voximplant" && res?.bound === false) {
        setNote("Number purchased but not auto-bound to your app — bind it to your application + rule in the Voximplant console.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="max-w-xl">
      <Link href="/phone-numbers" className="flex items-center gap-1.5 text-neutral-400 hover:text-neutral-600 text-sm mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Phone numbers
      </Link>

      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Buy a Phone Number</h2>
      <p className="text-sm text-neutral-500 mb-5">Search available numbers and purchase one for your assistant.</p>

      {/* Provider selector */}
      <div className="flex gap-2 mb-4">
        {([
          { id: "twilio", label: "Twilio", desc: "Global, instant" },
          { id: "voximplant", label: "Voximplant", desc: "Region/KYC-gated inventory" },
        ] as { id: Provider; label: string; desc: string }[]).map((p) => (
          <button
            key={p.id}
            onClick={() => { setProvider(p.id); setResults([]); setSearchPerformed(false); setError(""); setNote(null); }}
            className={`flex-1 text-left border rounded-xl px-4 py-3 transition-colors ${
              provider === p.id ? "border-transparent ring-2 text-neutral-900" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            }`}
            style={provider === p.id ? { boxShadow: `0 0 0 2px ${p.id === "voximplant" ? "#EA7B0C" : "#F22F46"}` } : undefined}
          >
            <div className="text-sm font-semibold">{p.label}</div>
            <div className="text-xs text-neutral-400 mt-0.5">{p.desc}</div>
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Country</label>
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); setResults([]); setSearchPerformed(false); setError(""); setNote(null); }}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ outlineColor: accent }}
            >
              <option value="US">United States (+1)</option>
              <option value="GB">United Kingdom (+44)</option>
              <option value="CA">Canada (+1)</option>
              <option value="AU">Australia (+61)</option>
              <option value="IL">Israel (+972)</option>
              <option value="GR">Greece (+30)</option>
              <option value="CY">Cyprus (+357)</option>
              <option value="AE">UAE / Dubai (+971)</option>
            </select>
          </div>
          {provider === "twilio" && AREA_CODE_COUNTRIES.includes(country) && (
            <div className="w-32">
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Area Code</label>
              <input
                type="text"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="212"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: accent }}
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
      {note && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">{note}</div>}

      {searchPerformed && results.length === 0 && !error && (
        <div className="mb-4 p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-center">
          <p className="text-sm font-medium text-neutral-700 mb-1">No numbers available</p>
          <p className="text-xs text-neutral-400">
            {provider === "voximplant"
              ? "Voximplant has no self-serve inventory for this country on your account. Many countries (incl. Israel) require regulatory documents — buy those in the Voximplant console, then register them via “Add Manually” on the Numbers page."
              : "Twilio has no available numbers for this country right now. Try a different country, or check that your Twilio account has geo-permissions enabled for this region."}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 text-sm font-medium text-neutral-700">
            {results.length} numbers available
          </div>
          <div className="divide-y divide-neutral-50">
            {results.map((n) => (
              <div key={n.phoneNumber} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-mono text-sm text-neutral-800">{n.friendlyName || n.phoneNumber}</div>
                  <div className="text-xs text-neutral-400">
                    {[n.locality || n.region, n.category, n.setupPrice ? `setup $${n.setupPrice}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {purchased === n.phoneNumber ? (
                  <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                    <Check className="w-4 h-4" />
                    Purchased
                  </span>
                ) : (
                  <button
                    onClick={() => handlePurchase(n)}
                    disabled={!!purchasing}
                    className="flex items-center gap-1.5 bg-[#0066CC] hover:bg-[#0052A3] disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {purchasing === n.phoneNumber ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {n.monthlyPrice ? `Buy — ${n.monthlyPrice}/mo` : "Buy"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
