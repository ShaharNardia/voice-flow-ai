/**
 * tool_response_summarizer — the Moran-truncation fix + backward-compat lock.
 * Run: node --test cloud-run/mediastream/tool_response_summarizer.test.js
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeApiResponse, compactItem } = require("./tool_response_summarizer.js");

function makeMoran(n, contentLen = 500) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({
      id: 626000 + i,
      summaryContent: `ירושלים הודעה ${i}`,
      content: "ק".repeat(contentLen),          // long disruption text
      description: "ת".repeat(contentLen),
    });
  }
  return { totalCount: 285, count: n, agencyId: "38", messages };
}

test("recognizes the `messages` envelope instead of blind-slicing it", () => {
  const out = JSON.parse(summarizeApiResponse(makeMoran(3, 100)));
  assert.equal(out.returned, 3, "all 3 messages represented");
  assert.equal(out.totalCount, 3, "totalCount reflects the messages array length");
  assert.equal(out.truncated, false);
  assert.ok(Array.isArray(out.items) && out.items[2].id === 626002, "the LAST message survives (not dropped)");
});

test("text-heavy `messages` keep up to 600 chars per field (not the 180 catalog cap)", () => {
  const out = JSON.parse(summarizeApiResponse(makeMoran(1, 400)));
  const content = out.items[0].content;
  assert.ok(content.length >= 400, `disruption detail survives (got ${content.length} chars)`);
  assert.ok(!content.endsWith("…") || content.length > 180, "not cut at the 180 catalog cap");
});

test("still sets truncated=true + reports totalCount when the list blows the byte budget", () => {
  // 60 messages × ~1.2KB each ≫ 20KB budget → some dropped, but flagged.
  const out = JSON.parse(summarizeApiResponse(makeMoran(60, 600)));
  assert.equal(out.totalCount, 60, "model is told the true count");
  assert.ok(out.returned < 60, "some messages dropped under budget");
  assert.equal(out.truncated, true, "truncation is signalled, not silent");
});

test("product catalogs (items/products) keep the tight 180-char cap", () => {
  const data = { items: [{ name: "widget", description: "d".repeat(500) }] };
  const out = JSON.parse(summarizeApiResponse(data));
  assert.ok(out.items[0].description.length <= 181, "catalog rows stay compact (180 + ellipsis)");
});

test("unrecognized envelope falls through to a plain slice (backward compat)", () => {
  const data = { weird: { nested: "x".repeat(30000) } };
  const s = summarizeApiResponse(data, 20000);
  assert.ok(s.length <= 20000 + 20, "still bounded");
  assert.ok(s.includes("[truncated]"), "marks the plain-slice truncation");
});

test("compactItem drops nulls/empties and truncates at the given cap", () => {
  const c = compactItem({ a: "hi", b: null, c: "", d: "z".repeat(50) }, 10);
  assert.equal(c.a, "hi");
  assert.ok(!("b" in c) && !("c" in c), "nulls/empties dropped");
  assert.equal(c.d, "z".repeat(10) + "…");
});
