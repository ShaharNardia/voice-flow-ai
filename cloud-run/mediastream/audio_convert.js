/**
 * Audio format converters for Twilio ↔ OpenAI Realtime bridge.
 *
 * Twilio Media Streams: mulaw, 8 kHz, mono
 * OpenAI Realtime API:  PCM 16-bit LE, 24 kHz, mono
 *
 * No external dependencies — pure buffer math.
 */

// ── mulaw decode table (256 entries) ─────────────────────────────────
// ITU-T G.711 mu-law decompression
const MULAW_DECODE = new Int16Array(256);
(function buildMulawTable() {
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xFF;                    // complement
    const sign = (mu & 0x80) ? -1 : 1;
    mu = mu & 0x7F;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0F;
    let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
    magnitude -= 0x84;                      // bias removal
    MULAW_DECODE[i] = sign * magnitude;
  }
})();

// Mulaw encoding lookup tables (ITU-T G.711)
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
// Segment-end values: sample magnitude thresholds for exponents 0..7
const MULAW_SEG_END = [0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF, 0x3FFF, 0x7FFF];

/**
 * Encode a single PCM16 sample (signed) to mulaw byte.
 * ITU-T G.711 mu-law compression.
 */
function pcm16ToMulaw(sample) {
  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;

  // Find the exponent — the segment in which the sample magnitude falls
  let exponent = 7;
  for (let i = 0; i < 8; i++) {
    if (sample <= MULAW_SEG_END[i]) { exponent = i; break; }
  }

  // 4-bit mantissa from the bits above the exponent's segment
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

/**
 * Decode mulaw 8kHz buffer → PCM16 24kHz buffer.
 * Upsamples 3x using linear interpolation.
 *
 * @param {Buffer} mulawBuf - Raw mulaw bytes (1 byte per sample, 8kHz)
 * @returns {Buffer} PCM16 LE buffer at 24kHz
 */
function mulawToPcm16_24k(mulawBuf) {
  const numSamples8k = mulawBuf.length;
  // Decode mulaw → PCM16 at 8kHz
  const pcm8k = new Int16Array(numSamples8k);
  for (let i = 0; i < numSamples8k; i++) {
    pcm8k[i] = MULAW_DECODE[mulawBuf[i]];
  }

  // Upsample 8kHz → 24kHz (3x) via linear interpolation
  const numSamples24k = numSamples8k * 3;
  const outBuf = Buffer.alloc(numSamples24k * 2); // 2 bytes per PCM16 sample
  for (let i = 0; i < numSamples8k; i++) {
    const s0 = pcm8k[i];
    const s1 = (i + 1 < numSamples8k) ? pcm8k[i + 1] : s0;
    const base = i * 3;
    // Write 3 interpolated samples
    outBuf.writeInt16LE(s0, base * 2);
    outBuf.writeInt16LE(Math.round(s0 + (s1 - s0) / 3), (base + 1) * 2);
    outBuf.writeInt16LE(Math.round(s0 + 2 * (s1 - s0) / 3), (base + 2) * 2);
  }
  return outBuf;
}

/**
 * Decode PCM16 24kHz buffer → mulaw 8kHz buffer.
 * Downsamples 3x by picking every 3rd sample.
 *
 * @param {Buffer} pcmBuf - PCM16 LE buffer at 24kHz
 * @returns {Buffer} mulaw bytes at 8kHz
 */
function pcm16_24kToMulaw(pcmBuf) {
  const numSamples24k = pcmBuf.length / 2;
  const numSamples8k = Math.floor(numSamples24k / 3);
  const outBuf = Buffer.alloc(numSamples8k);
  for (let i = 0; i < numSamples8k; i++) {
    const sample = pcmBuf.readInt16LE(i * 3 * 2);
    outBuf[i] = pcm16ToMulaw(sample);
  }
  return outBuf;
}

module.exports = {
  mulawToPcm16_24k,
  pcm16_24kToMulaw,
  MULAW_DECODE,
};
