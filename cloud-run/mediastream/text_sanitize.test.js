/**
 * text_sanitize.test.js — locks the "bot never speaks symbols" guarantee.
 * Run: node --test cloud-run/mediastream/text_sanitize.test.js
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeForSpeech } = require("./text_sanitize.js");

const NO_SYMBOLS = /[#*_~`|<>{}[\]\\"'«»“”‘’„‟()/]/;

test("falsy inputs pass through untouched", () => {
  assert.equal(sanitizeForSpeech(""), "");
  assert.equal(sanitizeForSpeech(null), null);
  assert.equal(sanitizeForSpeech(undefined), undefined);
});

test("strips markdown, keeps words", () => {
  assert.equal(sanitizeForSpeech("## כותרת"), "כותרת");
  assert.equal(sanitizeForSpeech("**מודגש** ו*נטוי*"), "מודגש ונטוי");
  assert.equal(sanitizeForSpeech("ראו [האתר](https://x.com)"), "ראו האתר");
  assert.equal(sanitizeForSpeech("`code` here"), "code here");
});

test("removes raw URLs", () => {
  assert.equal(sanitizeForSpeech("בקרו ב https://example.com/page עכשיו"), "בקרו ב עכשיו");
});

test("quotes are removed, inner words stay", () => {
  assert.equal(sanitizeForSpeech('הוא אמר "שלום" לכולם'), "הוא אמר שלום לכולם");
  assert.equal(sanitizeForSpeech("אמר 'כן' מיד"), "אמר כן מיד");
  assert.equal(sanitizeForSpeech("«ברוכים» „הבאים”"), "ברוכים הבאים");
});

test("slash/pipe become a space (ו/או → ו או)", () => {
  assert.equal(sanitizeForSpeech("עדכוני תנועה ו/או שיבושים"), "עדכוני תנועה ו או שיבושים");
});

test("parentheses dropped, contents kept", () => {
  assert.equal(sanitizeForSpeech("קו 5 (לכיוון תל אביב)"), "קו 5 לכיוון תל אביב");
});

test("the exact prod regression: no symbol class survives, on mixed Hebrew", () => {
  const samples = [
    'אהה, אוקיי, "הכותל". תוכל לומר לי את מספר התחנה?',
    "## עדכונים\n- אוטובוס תקוע *בבגין*\n- עבודות `תשתית`",
    "בעוד 3 דקות → קו 18 [פרטים](http://bus.gov.il/x) ו/או 45",
    "מחיר: 5₪ {מבצע} <דחוף>",
  ];
  for (const s of samples) {
    const out = sanitizeForSpeech(s);
    assert.ok(!NO_SYMBOLS.test(out), `symbols leaked from: ${s}\n→ ${out}`);
  }
});

test("plain Hebrew sentence is unchanged (no over-stripping)", () => {
  const s = "שלום, קו חמש יגיע בעוד ארבע דקות לתחנה.";
  assert.equal(sanitizeForSpeech(s), s);
});

test("digits, %, currency words and punctuation that ARE safe stay", () => {
  // sentence-ending punctuation . , ? ! : are intentionally kept (natural prosody)
  assert.equal(sanitizeForSpeech("יש 11 עדכונים, האם להמשיך?"), "יש 11 עדכונים, האם להמשיך?");
});
