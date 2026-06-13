/**
 * audio-bridge.js
 * Bridges RTP (from Asterisk ExternalMedia) ↔ WebSocket (Twilio Media Streams format → Cloud Run).
 *
 * Twilio Media Streams WebSocket protocol (what Cloud Run expects):
 *   Inbound (bridge → Cloud Run):
 *     { event:"connected", protocol:"Call", version:"1.0.0" }
 *     { event:"start",  streamSid, start:{ callSid, streamSid, mediaFormat:{encoding,sampleRate,channels} } }
 *     { event:"media",  streamSid, media:{ track:"inbound", chunk, timestamp, payload:<base64 mulaw> } }
 *     { event:"stop",   streamSid, stop:{ callSid } }
 *
 *   Outbound (Cloud Run → bridge):
 *     { event:"media",  streamSid, media:{ payload:<base64 mulaw> } }
 *     { event:"clear",  streamSid }   — flush buffered audio (barge-in)
 *
 * RTP packet format (RFC 3550):
 *   Byte 0:    V=2, P=0, X=0, CC=0  → 0x80
 *   Byte 1:    M=0, PT=0 (PCMU)     → 0x00
 *   Bytes 2-3: Sequence number (big-endian)
 *   Bytes 4-7: Timestamp (big-endian, +160 per 20ms @ 8kHz)
 *   Bytes 8-11: SSRC (big-endian)
 *   Bytes 12+: Audio payload (mulaw)
 */
const dgram  = require('dgram');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const RTP_HEADER_SIZE = 12;
const SSRC = Math.floor(Math.random() * 0xFFFFFFFF);

// Track allocated UDP ports per call
const allocatedPorts = new Set();
const PORT_START = parseInt(process.env.RTP_PORT_START ?? '7000', 10);
const PORT_END   = parseInt(process.env.RTP_PORT_END   ?? '7100', 10);

function allocatePort() {
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!allocatedPorts.has(p)) { allocatedPorts.add(p); return p; }
  }
  throw new Error('No free RTP ports');
}

function releasePort(port) { allocatedPorts.delete(port); }

/**
 * AudioBridge — one instance per active call.
 *
 * Usage:
 *   const bridge = new AudioBridge(callSid, streamSid, cloudRunWsUrl);
 *   await bridge.start();
 *   // asterisk ExternalMedia should send RTP to 127.0.0.1:<bridge.rtpPort>
 *   bridge.on('audioOut', (mulawBuf) => { send RTP to Asterisk });
 *   bridge.sendAudioToCloud(mulawBuf);  // if you have audio to push without waiting for WS
 *   await bridge.stop();
 */
class AudioBridge {
  constructor(callSid, cloudRunWsUrl) {
    this.callSid       = callSid;
    this.streamSid     = `MZ${uuidv4().replace(/-/g, '')}`;
    this.cloudRunWsUrl = cloudRunWsUrl;
    this.rtpPort       = null;
    this.udpSocket     = null;
    this.ws            = null;
    this.asteriskAddr  = null;  // { address, port } — learned from first RTP packet
    this.chunkCounter  = 0;
    this.rtpSeq        = Math.floor(Math.random() * 0xFFFF);
    this.rtpTs         = Math.floor(Math.random() * 0xFFFFFFFF);
    this._onAudioOut   = null;  // callback(mulawBuf)
    this._onBargein    = null;  // callback()
    this.started       = false;
    // Outbound audio that arrived from Cloud Run BEFORE we learned Asterisk's
    // RTP address (the bot greets first while the caller is silent). Buffer it
    // and flush the moment the first inbound packet reveals where to send.
    // Capped so a never-arriving inbound leg can't grow memory unbounded.
    this._pendingOut   = [];
    this._maxPendingOut = 500;  // ~10s of 20ms µ-law frames
  }

  /** Set callback called when Cloud Run sends audio that should go to caller */
  onAudioOut(fn)  { this._onAudioOut = fn; }
  /** Set callback called when Cloud Run sends <clear> (barge-in) */
  onBargein(fn)   { this._onBargein  = fn; }

  async start() {
    this.rtpPort = allocatePort();

    // ── UDP socket: receives RTP from Asterisk ExternalMedia ─────────────────
    this.udpSocket = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
      this.udpSocket.bind(this.rtpPort, '127.0.0.1', (err) => err ? reject(err) : resolve());
    });

    this.udpSocket.on('message', (msg, rinfo) => {
      // Remember where Asterisk is sending from (for the return path)
      if (!this.asteriskAddr) {
        this.asteriskAddr = { address: rinfo.address, port: rinfo.port };
        console.log(`[Audio] Asterisk RTP from ${rinfo.address}:${rinfo.port}` +
          (this._pendingOut.length ? ` — flushing ${this._pendingOut.length} buffered frames` : ''));
        // Flush any greeting audio that arrived before we knew where to send it.
        const queued = this._pendingOut; this._pendingOut = [];
        for (const buf of queued) this._sendToAsterisk(buf);
      }
      if (msg.length <= RTP_HEADER_SIZE) return;

      const payload = msg.slice(RTP_HEADER_SIZE);  // strip RTP header
      this._sendToCloud(payload);
    });

    // ── WebSocket to Cloud Run ────────────────────────────────────────────────
    // The TwiML <Connect><Stream url="wss://…/stream/{sessionId}"/> already
    // carries the FULL path with the correct Firestore session id. Use it
    // verbatim — do NOT append another /stream/{callSid} (that produced
    // ".../stream/{sessionId}/stream/{callSid}" with the wrong id, which Cloud
    // Run rejected as "session not found"). Only synthesize the path when given
    // a bare host (the CLOUD_RUN_URL fallback with no /stream/ segment).
    const base = this.cloudRunWsUrl.replace(/^http/, 'ws');
    const wsUrl = /\/stream\//.test(base) ? base : `${base.replace(/\/$/, '')}/stream/${this.callSid}`;
    this.ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.once('open',  resolve);
      this.ws.once('error', reject);
    });

    // Send Twilio "connected" event
    this.ws.send(JSON.stringify({
      event: 'connected',
      protocol: 'Call',
      version: '1.0.0',
    }));

    // Send Twilio "start" event
    this.ws.send(JSON.stringify({
      event: 'start',
      streamSid: this.streamSid,
      start: {
        callSid:   this.callSid,
        streamSid: this.streamSid,
        mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
      },
    }));

    // Handle messages FROM Cloud Run
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.event === 'media' && msg.media?.payload) {
          const audio = Buffer.from(msg.media.payload, 'base64');
          this._sendToAsterisk(audio);
          if (this._onAudioOut) this._onAudioOut(audio);
        } else if (msg.event === 'clear') {
          this._pendingOut = [];   // discard buffered audio not yet sent (barge-in)
          if (this._onBargein) this._onBargein();
        }
      } catch (_) {}
    });

    this.ws.on('close', () => console.log(`[Audio] WS closed for ${this.callSid}`));
    this.ws.on('error', (e) => console.error(`[Audio] WS error: ${e.message}`));

    this.started = true;
    console.log(`[Audio] Bridge started — RTP port ${this.rtpPort}, WS → ${wsUrl}`);
  }

  /** Push a mulaw buffer as if it came from the caller (inbound track to Cloud Run) */
  sendAudioToCloud(mulawBuf) {
    this._sendToCloud(mulawBuf);
  }

  /**
   * Play a mulaw buffer to the caller (outbound direction).
   * Sends RTP to Asterisk's ExternalMedia channel which mixes it into the call.
   * Use this for TTS/pre-recorded audio that the caller should hear.
   */
  sendAudioToCaller(mulawBuf) {
    this._sendToAsterisk(mulawBuf);
  }

  _sendToCloud(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      event:     'media',
      streamSid: this.streamSid,
      media: {
        track:     'inbound',
        chunk:     String(++this.chunkCounter),
        timestamp: String(Date.now()),
        payload:   payload.toString('base64'),
      },
    }));
  }

  _sendToAsterisk(mulawBuf) {
    if (!this.udpSocket) return;
    // Address not learned yet (caller silent, bot greeting first) → buffer.
    if (!this.asteriskAddr) {
      if (this._pendingOut.length < this._maxPendingOut) this._pendingOut.push(mulawBuf);
      return;
    }

    // Build minimal RTP header
    const packet = Buffer.allocUnsafe(RTP_HEADER_SIZE + mulawBuf.length);
    packet[0]  = 0x80;                         // V=2, no padding/extension/csrc
    packet[1]  = 0x00;                         // M=0, PT=0 (PCMU/mulaw)
    packet.writeUInt16BE(this.rtpSeq & 0xFFFF, 2);
    packet.writeUInt32BE(this.rtpTs  & 0xFFFFFFFF, 4);
    packet.writeUInt32BE(SSRC, 8);
    mulawBuf.copy(packet, RTP_HEADER_SIZE);

    this.rtpSeq = (this.rtpSeq + 1) & 0xFFFF;
    this.rtpTs  = (this.rtpTs + 160) & 0xFFFFFFFF;  // 20ms @ 8kHz

    this.udpSocket.send(packet, this.asteriskAddr.port, this.asteriskAddr.address);
  }

  async stop() {
    if (!this.started) return;
    this.started = false;

    // Send Twilio "stop" event to Cloud Run
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event:     'stop',
        streamSid: this.streamSid,
        stop:      { callSid: this.callSid },
      }));
      this.ws.close();
    }

    this.udpSocket?.close();
    if (this.rtpPort) releasePort(this.rtpPort);
    console.log(`[Audio] Bridge stopped for ${this.callSid}`);
  }
}

module.exports = { AudioBridge };
