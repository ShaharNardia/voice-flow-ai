/**
 * tool_response_summarizer.js — compress a custom-tool HTTP response into
 * something the voice model can consume in a single turn, under a byte budget.
 *
 * Extracted from index.js so it can be unit-tested. Two exported functions:
 *   - compactItem(item, maxStrLen)   — shrink one list item to its useful fields
 *   - summarizeApiResponse(data, maxChars) — pick the list, compact + budget it
 */

"use strict";

// Array keys we know how to treat as "the list" inside an envelope object.
// `messages`/`announcements` matter for feeds like Moran transit disruptions,
// whose payload is `{ ...envelope, messages: [...] }` — without this the whole
// blob fell through to a blind slice(0, maxChars), silently dropping the tail
// messages (a caller asking about a bus line in message #8 got "I don't know").
const LIST_KEYS = ["products", "items", "results", "data", "messages", "announcements"];

// Feeds under these keys are text-heavy (each item is a paragraph, not a catalog
// row), so keep more of each string field before the byte budget trims items.
const TEXT_HEAVY_KEYS = new Set(["messages", "announcements"]);

/**
 * Extract a compact, model-friendly version of one item from a JSON list.
 * Keeps the small, identifying fields (name/sku/price/stock) and drops bloat.
 * @param {*} item
 * @param {number} [maxStrLen=180] per-field string cap (higher for text feeds)
 */
function compactItem(item, maxStrLen = 180) {
  if (item == null || typeof item !== "object") return item;
  const out = {};

  // GENERIC scalar pass: keep EVERY non-null scalar field, not a hardcoded
  // whitelist. Nulls/empties are dropped (noise); long strings truncated; the
  // overall byte budget is enforced by the caller.
  for (const [k, v] of Object.entries(item)) {
    if (v == null || v === "") continue;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) continue;
      out[k] = s.length > maxStrLen ? s.slice(0, maxStrLen) + "…" : s;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v) && v.length > 0 && v.length <= 24 &&
               v.every((x) => x == null || typeof x !== "object")) {
      // Small scalar arrays carry real data (e.g. MinutesToArrivalList:[0,5,10])
      out[k] = v;
    }
    // Nested objects / object-arrays are handled by the special cases below.
  }

  // Clean HTML out of the name (WooCommerce escapes entities in names)
  if (typeof out.name === "string") {
    out.name = out.name
      .replace(/&#?\w+;/g, " ")    // HTML entities → space
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // WooCommerce-style: pull price + currency out of the nested `prices` object
  if (item.prices && typeof item.prices === "object") {
    const p = item.prices;
    if (p.price != null) out.price = p.price;
    if (p.regular_price != null) out.regular_price = p.regular_price;
    if (p.sale_price != null && p.sale_price !== p.regular_price) out.sale_price = p.sale_price;
    if (p.currency_code) out.currency = p.currency_code;
  }

  // Categories / brands (often an array of {id, name, slug})
  for (const listKey of ["categories", "brands", "tags"]) {
    if (Array.isArray(item[listKey]) && item[listKey].length > 0) {
      out[listKey] = item[listKey].slice(0, 4).map((x) => (x?.name || x?.slug || x)).filter(Boolean);
    }
  }

  return out;
}

/**
 * Summarize a potentially-huge JSON response. For arrays we keep ALL items (not
 * just first N) up to the byte budget — so the model can find specific items the
 * caller asked about, even when they're deep in the list — and we ALWAYS report
 * totalCount/returned/truncated so the model knows when data was dropped.
 */
function summarizeApiResponse(data, maxChars = 20000) {
  if (typeof data === "string") return data.slice(0, maxChars);

  let arr = null;
  let sourceKey = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === "object") {
    for (const key of LIST_KEYS) {
      if (Array.isArray(data[key])) { arr = data[key]; sourceKey = key; break; }
    }
  }

  if (arr) {
    const maxStrLen = sourceKey && TEXT_HEAVY_KEYS.has(sourceKey) ? 600 : 180;
    // Fit as many compacted items as possible under the byte budget.
    const compacted = [];
    let running = 0;
    for (const item of arr) {
      const c = compactItem(item, maxStrLen);
      const s = JSON.stringify(c);
      if (running + s.length + 2 > maxChars - 200 /* header */) break;
      compacted.push(c);
      running += s.length + 2;
    }
    const summary = {
      totalCount: arr.length,
      returned: compacted.length,
      truncated: compacted.length < arr.length,
      items: compacted,
    };
    return JSON.stringify(summary);
  }

  const s = JSON.stringify(data);
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "…[truncated]";
}

module.exports = { compactItem, summarizeApiResponse, LIST_KEYS, TEXT_HEAVY_KEYS };
