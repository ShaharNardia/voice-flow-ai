"use client";

import { useState } from "react";
import { searchPhoneNumbers, purchasePhoneNumber, type PhoneNumber } from "@/lib/firebase-functions";
import Link from "next/link";
import { ArrowLeft, Search, Check, Loader2 } from "lucide-react";

export default function BuyPhoneNumberPage() {
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<PhoneNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    setError("");
    setSearching(true);
    try {
      const res = await searchPhoneNumbers({ country, areaCode: areaCode || undefined });
      setResults(Array.isArray(res) ? res : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async (phoneNumber: string) => {
    setPurchasing(phoneNumber);
    try {
      await purchasePhoneNumber({ phoneNumber });
      setPurchased(phoneNumber);
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
      <p className="text-sm text-neutral-500 mb-6">Search available Twilio numbers and purchase one for your assistant.</p>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
            >
              <option value="US">United States (+1)</option>
              <option value="GB">United Kingdom (+44)</option>
              <option value="CA">Canada (+1)</option>
              <option value="AU">Australia (+61)</option>
              <option value="IL">Israel (+972)</option>
            </select>
          </div>
          <div className="w-32">
            <label className="block text-xs font-medium text-neutral-500 mb-1.5">Area Code</label>
            <input
              type="text"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="212"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F22F46] focus:ring-1 focus:ring-[#F22F46]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 bg-[#F22F46] hover:bg-[#d9243b] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

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
                  <div className="text-xs text-neutral-400">{n.locality}{n.region ? `, ${n.region}` : ""}</div>
                </div>
                {purchased === n.phoneNumber ? (
                  <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                    <Check className="w-4 h-4" />
                    Purchased
                  </span>
                ) : (
                  <button
                    onClick={() => handlePurchase(n.phoneNumber)}
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
