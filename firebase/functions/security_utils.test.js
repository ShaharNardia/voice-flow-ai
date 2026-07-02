/**
 * Unit tests for security_utils.stripHtml / sanitizeObject.
 * Run: node --test firebase/functions/security_utils.test.js
 *
 * Regression lock for the over-broad event-handler regex that truncated any
 * saved string containing "on<word>=" — e.g. a tool URL param "phoneBotUse=true"
 * was cut to "...&ph" because "…ph‹oneBotUse=›" matched the onerror/onclick
 * stripper. Must still strip real HTML event handlers + <script>.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stripHtml, sanitizeObject } = require("./security_utils.js");

test("does NOT truncate a URL whose param contains 'on<word>=' (phoneBotUse, buttonId…)", () => {
  const url = "https://api.lancelotech.com/Moran/special-messages/by-agency?agencyId=38&refresh=false&includeRaw=true&phoneBotUse=true";
  assert.equal(stripHtml(url), url, "URL must be preserved verbatim");
  assert.equal(sanitizeObject({ url }).url, url, "sanitizeObject must not alter the URL");
  // A few more 'on'-containing words that used to trip it:
  for (const u of [
    "https://x.co/a?buttonId=5&seasonEnd=2026",
    "https://x.co/onboarding?step=2",
    "https://x.co/q?personId=9&monthly=true",
  ]) assert.equal(stripHtml(u), u, `preserved: ${u}`);
});

test("still strips real HTML event-handler attributes", () => {
  assert.ok(!/onerror/i.test(stripHtml(`<img src=x onerror="alert(1)">`)));
  assert.ok(!/onclick/i.test(stripHtml(`<div onclick=steal()>hi</div>`)));
  assert.ok(!/onmouseover/i.test(stripHtml(`<a href=# onmouseover=bad>x</a>`)));
});

test("still strips <script> blocks and tags", () => {
  assert.equal(stripHtml(`<script>evil()</script>hello`), "hello");
  assert.equal(stripHtml(`<b>hi</b>`), "hi");
});
