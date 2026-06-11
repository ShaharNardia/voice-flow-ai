/**
 * Sanity tests for the µ-law codec used on the Voximplant boundary.
 * Run: node --test cloud-run/mediastream/voximplant_audio.test.js
 */

"use strict";

const test   = require("node:test");
const assert = require("node:assert/strict");
const { pcm16ToMulawBase64, mulawBase64ToPcm16, _internal } = require("./voximplant_audio.js");

test("encode→decode round-trip preserves zero", () => {
  const buf = Buffer.alloc(20);            // 10 silent samples
  const out = mulawBase64ToPcm16(pcm16ToMulawBase64(buf));
  assert.equal(out.length, buf.length);
  for (let i = 0; i < buf.length; i += 2) {
    assert.equal(out.readInt16LE(i), 0, `sample at ${i} should be zero, got ${out.readInt16LE(i)}`);
  }
});

test("encode→decode round-trip is bounded — never exceeds the mulaw quantum", () => {
  // Generate a synthetic sine sweep covering the dynamic range.
  const N = 8000;                          // 1 second @ 8 kHz
  const buf = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) {
    const amp = 30000 * Math.sin(2 * Math.PI * 440 * i / 8000);
    buf.writeInt16LE(Math.round(amp), i * 2);
  }
  const recovered = mulawBase64ToPcm16(pcm16ToMulawBase64(buf));
  assert.equal(recovered.length, buf.length);

  // µ-law's max quantization error grows with amplitude — but at amplitude
  // 30000 the worst single-step error is well under 2000.
  let maxErr = 0;
  for (let i = 0; i < N; i++) {
    const orig = buf.readInt16LE(i * 2);
    const out  = recovered.readInt16LE(i * 2);
    maxErr = Math.max(maxErr, Math.abs(orig - out));
  }
  assert.ok(maxErr < 2000, `worst quantization error ${maxErr} exceeded 2000`);
});

test("encode handles clipping at the top of the int16 range", () => {
  const buf = Buffer.alloc(4);
  buf.writeInt16LE( 32767, 0);             // max positive
  buf.writeInt16LE(-32768, 2);             // max negative
  // Must not throw, must produce 2 bytes
  const b64 = pcm16ToMulawBase64(buf);
  const mulaw = Buffer.from(b64, "base64");
  assert.equal(mulaw.length, 2);
});

test("decode produces zero output for silence-byte (0xFF)", () => {
  // 0xFF is µ-law's representation of 0.
  const b64 = Buffer.from([0xFF, 0xFF]).toString("base64");
  const pcm = mulawBase64ToPcm16(b64);
  assert.equal(pcm.length, 4);
  assert.equal(pcm.readInt16LE(0), 0);
  assert.equal(pcm.readInt16LE(2), 0);
});

test("decode table matches the encode side for representative samples", () => {
  // Encode then decode each representative amplitude — output should be
  // monotonic (within quantization) for a monotonic input.
  const inputs = [-30000, -10000, -1000, -100, 0, 100, 1000, 10000, 30000];
  let prev = -Infinity;
  for (const s of inputs) {
    const buf = Buffer.alloc(2);
    buf.writeInt16LE(s, 0);
    const decoded = mulawBase64ToPcm16(pcm16ToMulawBase64(buf)).readInt16LE(0);
    assert.ok(decoded >= prev, `monotonic break: ${s} → ${decoded}, prev was ${prev}`);
    prev = decoded;
  }
});

test("encodeMulawSample matches known reference values", () => {
  // Canonical G.711: silence (input 0) is byte 0xFF.
  assert.equal(_internal.encodeMulawSample(0), 0xFF);
  // Full-scale negative → mask 0x7F is applied, so high bit (sign) is 0.
  const enc = _internal.encodeMulawSample(-32768);
  assert.ok((enc & 0x80) === 0, `negative samples encode to bytes with sign bit clear, got 0x${enc.toString(16)}`);
});
