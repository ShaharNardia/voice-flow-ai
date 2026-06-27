/**
 * Realtime call recorder — captures both inbound and outbound mulaw audio
 * from the Twilio <Connect><Stream> WebSocket and builds a stereo WAV file.
 *
 *   Left channel  = inbound  (caller / user)
 *   Right channel = outbound (assistant / OpenAI Realtime)
 *
 * Twilio native recording doesn't work reliably with <Connect><Stream> because
 * the call is handed off fully to the stream — this captures everything that
 * flows through our bridge instead.
 */

const SAMPLE_RATE = 8000;            // Twilio + OpenAI g711_ulaw = 8 kHz
const MULAW_SILENCE = 0xFF;          // g711 mulaw silence byte

class RealtimeRecorder {
  constructor(callSessionId) {
    this.callSessionId = callSessionId;
    this.startedAt = Date.now();
    this._inboundChunks = []; // {at: ms, buf: Buffer}
    this._outboundChunks = []; // {at: ms, buf: Buffer}
    // CONTIGUOUS placement clocks. Audio chunks arrive every ~20ms with a few
    // ms of wall-clock jitter; placing each chunk at its own arrival time and
    // rounding to a sample offset left 1-10 sample gaps/overlaps between
    // consecutive chunks — an audible click every few chunks, i.e. constant
    // crackle over the whole recording. Instead each stream appends seamlessly
    // to its running clock, and only RESYNCs to wall-time when there's a
    // genuine gap (> RESYNC_MS, e.g. between turns / caller silence).
    this._inboundClockMs = null;
    this._outboundPlayClockMs = 0;
  }

  static get RESYNC_MS() { return 250; }

  /** Called on each inbound (user) mulaw chunk from Twilio. */
  pushInbound(base64Mulaw) {
    const buf = Buffer.from(base64Mulaw, "base64");
    const now = Date.now() - this.startedAt;
    if (this._inboundClockMs === null ||
        Math.abs(now - this._inboundClockMs) > RealtimeRecorder.RESYNC_MS) {
      this._inboundClockMs = now;   // first chunk or a real gap — resync
    }
    this._inboundChunks.push({at: this._inboundClockMs, buf});
    this._inboundClockMs += buf.length * 1000 / SAMPLE_RATE;
  }

  /** Called on each outbound (assistant) mulaw chunk from the bridge. */
  pushOutbound(base64Mulaw) {
    const buf = Buffer.from(base64Mulaw, "base64");
    const now = Date.now() - this.startedAt;
    // Snap forward only on a genuine silence gap — NOT on every few-ms drift,
    // which fragmented steady 20ms-paced playback into crackle.
    if (now - this._outboundPlayClockMs > RealtimeRecorder.RESYNC_MS) {
      this._outboundPlayClockMs = now;
    }
    const at = this._outboundPlayClockMs;
    this._outboundChunks.push({at, buf});
    // Advance play clock by this chunk's duration (8 kHz → 1 byte per 0.125 ms)
    this._outboundPlayClockMs += buf.length * 1000 / SAMPLE_RATE;
  }

  /** Called when user barges in — tells Twilio to clear buffered audio.
   *  We also reset the outbound play clock so subsequent audio starts "now". */
  onBargeIn() {
    this._outboundPlayClockMs = Date.now() - this.startedAt;
  }

  /**
   * Build a stereo mulaw WAV buffer and upload to Firebase Storage.
   * Returns {url, durationSec, bytes} or null on failure.
   */
  async finalizeAndUpload() {
    const durationMs = Date.now() - this.startedAt;
    const totalBytes = Math.max(1, Math.round((durationMs * SAMPLE_RATE) / 1000));

    if (this._inboundChunks.length === 0 && this._outboundChunks.length === 0) {
      return null; // nothing to record
    }

    // Build each mono mulaw track at real-time alignment
    const inbound = Buffer.alloc(totalBytes, MULAW_SILENCE);
    const outbound = Buffer.alloc(totalBytes, MULAW_SILENCE);

    for (const {at, buf} of this._inboundChunks) {
      const start = Math.max(0, Math.round((at * SAMPLE_RATE) / 1000));
      const end = Math.min(totalBytes, start + buf.length);
      if (end > start) buf.copy(inbound, start, 0, end - start);
    }
    for (const {at, buf} of this._outboundChunks) {
      const start = Math.max(0, Math.round((at * SAMPLE_RATE) / 1000));
      const end = Math.min(totalBytes, start + buf.length);
      if (end > start) buf.copy(outbound, start, 0, end - start);
    }

    // Interleave into stereo: [L0][R0][L1][R1]…
    const stereo = Buffer.alloc(totalBytes * 2);
    for (let i = 0; i < totalBytes; i++) {
      stereo[i * 2] = inbound[i];
      stereo[i * 2 + 1] = outbound[i];
    }

    const wav = buildMulawStereoWav(stereo, SAMPLE_RATE);

    // Upload to Firebase Storage and store a PROXY url (getRealtimeRecording),
    // not a signed URL: the Cloud Run signer has no usable private key, so signed
    // URLs are rejected by GCS (SignatureDoesNotMatch) and won't play. The proxy
    // streams the object with admin creds. Bucket is env-aware so staging writes
    // to its own bucket (was hardcoded to prod).
    try {
      const {getStorage} = require("firebase-admin/storage");
      const project = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
      const bucketName = `${project}.firebasestorage.app`;
      const bucket = getStorage().bucket(bucketName);
      const objectPath = `realtime_recordings/${this.callSessionId}.wav`;
      const file = bucket.file(objectPath);
      await file.save(wav, {contentType: "audio/wav", resumable: false});
      const url = `https://us-central1-${project}.cloudfunctions.net/getRealtimeRecording?id=${encodeURIComponent(this.callSessionId)}`;
      return {
        url,
        durationSec: Math.round(durationMs / 1000),
        bytes: wav.length,
        objectPath,
      };
    } catch (err) {
      console.error(`[${this.callSessionId}] [REC] Upload failed:`, err.message);
      return null;
    }
  }
}

/**
 * Build a stereo mulaw WAV buffer from interleaved mulaw samples.
 * Format code 7 = WAVE_FORMAT_MULAW. 8-bit per sample, 2 channels.
 */
function buildMulawStereoWav(stereoData, sampleRate) {
  const channels = 2;
  const bitsPerSample = 8;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLen = stereoData.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);            // PCMWAVEFORMAT chunk size
  header.writeUInt16LE(7, 20);             // wFormatTag = 7 (mulaw)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);

  return Buffer.concat([header, stereoData]);
}

module.exports = {RealtimeRecorder};
