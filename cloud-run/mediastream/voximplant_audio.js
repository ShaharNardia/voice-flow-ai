/**
 * Voximplant audio codec — PCM16 ↔ µ-law (G.711) at 8 kHz.
 *
 * Voximplant's VoxEngine `sendMediaTo(websocket)` delivers caller audio as
 * raw binary PCM16 little-endian samples at 8000 Hz. To bridge into our
 * existing GeminiBridge — which already speaks Twilio-style µ-law base64 —
 * we transcode at the boundary.
 *
 * Encoding direction (caller → Gemini):
 *   binary PCM16LE @ 8 kHz   →   µ-law @ 8 kHz, base64-encoded
 *   GeminiBridge.sendAudio() then upsamples to 16 kHz internally.
 *
 * Decoding direction (Gemini → caller):
 *   µ-law @ 8 kHz, base64 (from bridge.on("audio"))   →   binary PCM16LE @ 8 kHz
 *   We ship raw binary frames back over the Vox WebSocket; VoxEngine's
 *   ws.sendMediaTo(call) feeds them into the PSTN leg.
 *
 * G.711 µ-law is lossy. At 8 kHz telephony bandwidth the perceived quality
 * difference between native PCM and a single µ-law round-trip is negligible
 * — Twilio's own pipeline does this very same conversion. The benefit is
 * we reuse the existing GeminiBridge unchanged; no new code path on the
 * Gemini side.
 */

"use strict";

// ── µ-law encode table (ITU-T G.711) ─────────────────────────────────────
//
// Standard µ-law companding. Pre-computed for every 14-bit magnitude value
// that PCM16 audio can take. We dispatch into this table per-sample rather
// than running the branchy reference algorithm on every byte.

// Canonical G.711 µ-law encode parameters.
//
// Subtlety: there are two common forms of the encoder in the wild. One
// works on the full 16-bit magnitude with bias=132 and the seg_aend
// {0x1FF…0xFFFF}; the other does an explicit >>2 to 14 bits with bias=33
// and the seg_aend {0x3F…0x1FFF}. The two only round-trip correctly when
// paired with matching decoders. Our decoder (mirrored from the existing
// gemini_bridge.js path) is the 14-bit form, so we MUST encode the same
// way. Got this wrong on the first pass — quantization error blew up to
// ~16k near full-scale before pairing them correctly.

const MULAW_BIAS_14B  = 33;            // 0x21
const MULAW_CLIP_14B  = 8191;          // (32767 >> 2) clamped to fit
const MULAW_SEG_END   = [0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF];

/**
 * Encode a single int16 sample to a µ-law byte (ITU-T G.711, 14-bit form).
 */
function encodeMulawSample(s) {
  // Shift 16-bit to 14-bit magnitude. µ-law is defined on 14-bit input;
  // the bottom 2 bits are below the noise floor of the codec anyway.
  s >>= 2;

  let mask = 0xFF;
  if (s < 0) { s = -s; mask = 0x7F; }
  if (s > MULAW_CLIP_14B) s = MULAW_CLIP_14B;
  s += MULAW_BIAS_14B;

  let seg = 0;
  while (seg < 8 && s > MULAW_SEG_END[seg]) seg++;
  if (seg >= 8) return 0x7F ^ mask;

  const mantissa = (s >> (seg + 1)) & 0x0F;
  return ((seg << 4) | mantissa) ^ mask;
}

// ── µ-law decode table ───────────────────────────────────────────────────
// 256-entry, signed 16-bit. Identical to the one in gemini_bridge.js but
// duplicated here so this module has zero internal coupling.

const MULAW_DECODE_TABLE = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xFF;
    const sign = (mu & 0x80) ? -1 : 1;
    mu = mu & 0x7F;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0F;
    let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
    magnitude -= 0x84;
    t[i] = sign * magnitude;
  }
  return t;
})();

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Encode a Buffer of PCM16LE @ 8 kHz into base64-encoded µ-law @ 8 kHz.
 * Two input bytes (one int16 sample) become one µ-law byte → output buffer
 * is half the size of input.
 *
 * @param {Buffer} pcm16Buf — raw PCM16LE samples, mono, 8000 Hz.
 * @returns {string} base64-encoded µ-law bytes, suitable for
 *                   `GeminiBridge.sendAudio(base64Mulaw)`.
 */
function pcm16ToMulawBase64(pcm16Buf) {
  const sampleCount = pcm16Buf.length >> 1;        // 2 bytes per sample
  const out = Buffer.allocUnsafe(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = pcm16Buf.readInt16LE(i * 2);
    out[i] = encodeMulawSample(s);
  }
  return out.toString("base64");
}

/**
 * Decode a base64-encoded µ-law @ 8 kHz chunk into a Buffer of PCM16LE
 * @ 8 kHz. One µ-law byte expands to two PCM bytes (one int16 sample).
 *
 * @param {string} base64Mulaw — typically what bridge.on("audio") emits.
 * @returns {Buffer} raw PCM16LE binary, ready to ship over Voximplant ws.
 */
function mulawBase64ToPcm16(base64Mulaw) {
  const mulaw = Buffer.from(base64Mulaw, "base64");
  const out = Buffer.allocUnsafe(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    out.writeInt16LE(MULAW_DECODE_TABLE[mulaw[i]], i * 2);
  }
  return out;
}

module.exports = {
  pcm16ToMulawBase64,
  mulawBase64ToPcm16,
  // exposed for unit testing
  _internal: { encodeMulawSample, MULAW_DECODE_TABLE },
};
