/**
 * call-manager.js
 * Manages the lifecycle of each call:
 *   1. Receives ARI StasisStart event
 *   2. Fires webhook to Firebase (twilioVoiceWebhook) with Twilio-compatible fields
 *   3. Parses TwiML response and executes it
 *   4. Manages AudioBridge (RTP ↔ Cloud Run WebSocket)
 *   5. Handles mid-call REST updates (replaces twilio.calls(sid).update())
 *   6. Fires status callbacks (twilioStatusCallback) on call events
 */
require('dotenv').config();
const axios        = require('axios');
const { v4: uuidv4 } = require('uuid');
const { parseTwiml }  = require('./twiml-parser');
const { AudioBridge } = require('./audio-bridge');
const { synthesize }  = require('./tts');
const sipMgr          = require('./sip-manager');

const FIREBASE_URL   = process.env.FIREBASE_URL   || '';
const CLOUD_RUN_URL  = process.env.CLOUD_RUN_URL  || '';
const BRIDGE_SECRET  = process.env.BRIDGE_SECRET  || '';

// active calls keyed by callSid
const calls = new Map();

// shared ARI client reference (set by index.js after connect)
let _ariClient = null;

function setAriClient(client) { _ariClient = client; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCallSid() {
  return `CA${uuidv4().replace(/-/g, '').toUpperCase()}`;
}

async function postToFirebase(path, body) {
  const url = `${FIREBASE_URL}/${path}`;
  try {
    const resp = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
      transformRequest: [(data) => {
        // Firebase Functions for Twilio expect URL-encoded form body
        return new URLSearchParams(data).toString();
      }],
    });
    return resp.data;
  } catch (err) {
    console.error(`[Webhook] POST ${url} failed: ${err.message}`);
    return null;
  }
}

// ── Call state machine ────────────────────────────────────────────────────────

class Call {
  constructor({ callSid, channel, ariClient, direction, ddi }) {
    this.callSid     = callSid;
    this.channel     = channel;       // ARI channel object (null for outbound until answered)
    this.ariClient   = ariClient;
    this.direction   = direction;     // 'inbound' | 'outbound'
    this.status      = 'ringing';
    this.from        = channel?.caller?.number  || '';
    // Use the DDI (real DID phone number) when available so twilioVoiceWebhook can
    // look up the correct agent/company. Fall back to the Asterisk extension only
    // when no DDI mapping exists (e.g. direct extension dialling).
    this.to          = ddi || channel?.dialplan?.exten || '';
    this.audioBridge = null;
    this.extMediaCh  = null;          // ARI ExternalMedia channel
    this.ariBridge   = null;          // ARI mixing bridge
    this.streaming   = false;
    // Abort token — incremented each time executeTwiml is called; lets running
    // loops detect they've been superseded (e.g. a <Pause> interrupted by updateCall).
    this._execGen    = 0;
    this._startedAt  = Date.now();
  }

  // ── Fire a Twilio-compatible status callback ──────────────────────────────
  async fireStatusCallback(status, extra = {}) {
    this.status = status;
    await postToFirebase('twilioStatusCallback', {
      CallSid:    this.callSid,
      CallStatus: status,
      Direction:  this.direction,
      From:       this.from,
      To:         this.to,
      ...extra,
    });
  }

  // ── Answer the call and start the webhook→TwiML flow ─────────────────────
  async answer() {
    if (this.channel) await this.channel.answer();
    this.status = 'in-progress';
    console.log(`[Call] ${this.callSid} answered`);

    const twimlXml = await postToFirebase('twilioVoiceWebhook', {
      CallSid:     this.callSid,
      Called:      this.to,
      To:          this.to,
      From:        this.from,
      CallStatus:  'in-progress',
      Direction:   this.direction,
      AccountSid:  BRIDGE_SECRET,    // repurposed field for bridge auth
    });

    if (typeof twimlXml === 'string') {
      await this.executeTwiml(twimlXml);
    } else if (twimlXml) {
      // Firebase returned JSON (shouldn't happen but handle gracefully)
      console.warn('[Call] Unexpected non-XML from twilioVoiceWebhook');
    }
  }

  // ── Execute a TwiML document ──────────────────────────────────────────────
  // Each call increments _execGen — any previously-running executeTwiml loop
  // checks its captured generation and stops if superseded (Twilio interrupt semantics).
  async executeTwiml(xml) {
    const gen = ++this._execGen;    // this execution's generation token

    let actions;
    try {
      actions = await parseTwiml(xml);
    } catch (err) {
      console.error(`[TwiML] Parse error: ${err.message}\n${xml}`);
      return;
    }

    for (const action of actions) {
      if (this.status === 'completed') break;
      if (this._execGen !== gen) break;  // superseded by a newer executeTwiml call
      await this._executeAction(action, gen);
    }
  }

  async _executeAction(action, gen) {
    switch (action.verb) {

      case 'Say': {
        console.log(`[TwiML] <Say> "${action.text}"`);
        try {
          const audio = await synthesize(action.text);
          await this._playAudio(audio);
        } catch (err) {
          console.error(`[TwiML] TTS error: ${err.message}`);
        }
        break;
      }

      case 'Play': {
        console.log(`[TwiML] <Play> ${action.url}`);
        try {
          const resp = await axios.get(action.url, { responseType: 'arraybuffer', timeout: 10000 });
          await this._playAudio(Buffer.from(resp.data));
        } catch (err) {
          console.error(`[TwiML] Play error: ${err.message}`);
        }
        break;
      }

      case 'Pause': {
        const ms = (action.length || 1) * 1000;
        console.log(`[TwiML] <Pause> ${action.length}s`);
        // Interruptible pause — resolves immediately if a newer executeTwiml arrives
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          const check = setInterval(() => {
            if (this._execGen !== gen || this.status === 'completed') {
              clearTimeout(timer);
              clearInterval(check);
              resolve();
            }
          }, 200);
          // Ensure interval is cleaned up when timer fires naturally
          setTimeout(() => clearInterval(check), ms + 50);
        });
        break;
      }

      case 'Stream': {
        console.log(`[TwiML] <Stream> ${action.attrs?.url} mode=${action.mode}`);
        await this._startStream(action.attrs?.url || CLOUD_RUN_URL);
        // For <Pause>-backed streams we just keep the call alive; Cloud Run owns it now.
        break;
      }

      case 'Hangup': {
        console.log(`[TwiML] <Hangup>`);
        await this.hangup();
        break;
      }

      case 'Redirect': {
        console.log(`[TwiML] <Redirect> ${action.url}`);
        const xml = await postToFirebase(action.url.replace(FIREBASE_URL + '/', ''), {
          CallSid: this.callSid, From: this.from, To: this.to, CallStatus: this.status,
        });
        if (xml) await this.executeTwiml(xml);
        break;
      }

      case 'Dial': {
        console.log(`[TwiML] <Dial> ${action.number}`);
        await this._transferCall(action.number);
        break;
      }

      default:
        console.warn(`[TwiML] Unknown verb: ${action.verb}`);
    }
  }

  // ── Start audio streaming to Cloud Run ───────────────────────────────────
  async _startStream(wsUrl) {
    if (this.streaming) return;
    this.streaming = true;

    try {
      // Create ARI ExternalMedia channel — Asterisk sends RTP to our UDP port
      const bridge = new AudioBridge(this.callSid, wsUrl || CLOUD_RUN_URL);
      await bridge.start();
      this.audioBridge = bridge;

      // Tell Asterisk to send audio to our UDP port
      const extMedia = await this.ariClient.channels.externalMedia({
        app:           process.env.ARI_APP || 'voiceflow-app',
        external_host: `127.0.0.1:${bridge.rtpPort}`,
        format:        'ulaw',
        direction:     'both',
      });
      this.extMediaCh = extMedia;

      // Bridge the call channel with the ExternalMedia channel
      const ariBridge = await this.ariClient.bridges.create({ type: 'mixing' });
      await ariBridge.addChannel({ channel: `${this.channel.id},${extMedia.id}` });
      this.ariBridge = ariBridge;

      console.log(`[Call] ${this.callSid} streaming — RTP port ${bridge.rtpPort}`);
    } catch (err) {
      console.error(`[Call] Stream start error: ${err.message}`);
      this.streaming = false;
    }
  }

  // ── Play raw mulaw audio to the caller ───────────────────────────────────
  async _playAudio(mulawBuf) {
    if (this.audioBridge?.started) {
      // Stream active: send audio via RTP → Asterisk ExternalMedia → mixing bridge → caller
      this.audioBridge.sendAudioToCaller(mulawBuf);
    } else {
      // Pre-stream: write to Asterisk sounds dir and play via ARI playback API
      await this._playViaTmpFile(mulawBuf);
    }
  }

  async _playViaTmpFile(mulawBuf) {
    const fs   = require('fs');
    const path = require('path');
    // Write mulaw to Asterisk's sounds directory so `sound:` URIs resolve correctly.
    // AST_SOUNDS_DIR defaults to /var/lib/asterisk/sounds — override via env if needed.
    const soundsDir = process.env.AST_SOUNDS_DIR || '/var/lib/asterisk/sounds';
    const filename  = `vf_tts_${this.callSid}_${Date.now()}`;
    const filepath  = path.join(soundsDir, `${filename}.ulaw`);

    try {
      fs.writeFileSync(filepath, mulawBuf);
    } catch (writeErr) {
      console.warn(`[Call] Cannot write to ${soundsDir}: ${writeErr.message} — skipping <Say>`);
      return;
    }

    try {
      // ARI play: "sound:FILENAME" — Asterisk strips directory and extension internally
      const playback = await this.channel.play({ media: `sound:${filename}` });
      // Wait for playback to finish (PlaybackFinished event) up to 30s
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 30000);
        playback.once('PlaybackFinished', () => { clearTimeout(timer); resolve(); });
        playback.once('PlaybackFailed',   () => { clearTimeout(timer); resolve(); });
      });
    } catch (err) {
      console.warn(`[Call] ARI play failed: ${err.message}`);
    } finally {
      fs.unlink(filepath, () => {});
    }
  }

  // ── SIP transfer (for <Dial>) ─────────────────────────────────────────────
  async _transferCall(number) {
    try {
      await this.channel.redirect({ endpoint: `PJSIP/${number}` });
    } catch (err) {
      console.error(`[Call] Transfer error: ${err.message}`);
    }
  }

  // ── Hang up ───────────────────────────────────────────────────────────────
  async hangup() {
    if (this.status === 'completed') return;
    this.status = 'completed';
    // Interrupt any running TwiML loop (e.g. a long <Pause>)
    this._execGen++;
    try {
      await this.audioBridge?.stop();
      if (this.ariBridge) {
        await this.ariClient.bridges.destroy({ bridgeId: this.ariBridge.id }).catch(() => {});
      }
      if (this.extMediaCh) {
        await this.ariClient.channels.hangup({ channelId: this.extMediaCh.id }).catch(() => {});
      }
      if (this.channel) {
        await this.channel.hangup().catch(() => {});
      }
    } catch (_) {}
    await this.fireStatusCallback('completed');
    calls.delete(this.callSid);
    console.log(`[Call] ${this.callSid} completed`);
  }
}

// ── Public API used by index.js ───────────────────────────────────────────────

async function handleInboundCall(ariClient, channel, ddi) {
  const callSid = makeCallSid();
  const call = new Call({
    callSid,
    channel,
    ariClient,
    direction: 'inbound',
    ddi,
  });
  calls.set(callSid, call);

  // Map ARI channel ID → callSid for StasisEnd lookup
  calls.set(channel.id, call);

  await call.fireStatusCallback('ringing');
  await call.answer();
}

async function handleCallEnd(channelId) {
  const call = calls.get(channelId);
  if (!call || call.status === 'completed') return;
  await call.hangup();
}

/**
 * Outbound counterpart of handleInboundCall — used after the callee answers
 * an originated channel and Stasis starts. We've already pre-registered the
 * Call in placeOutboundCall; this finishes the wiring (channel attach +
 * status callback + run the TwiML the calling app provided via the webhook).
 */
async function handleOutboundAnswered(ariClient, channel, callSid) {
  let call = calls.get(callSid);
  if (!call) {
    // Defensive: if we missed the pre-registration somehow, create on the fly.
    console.warn(`[CallManager] No pre-registered Call for ${callSid} — creating from channel`);
    call = new Call({ callSid, channel, ariClient, direction: 'outbound', ddi: channel.dialplan?.exten || '' });
    calls.set(callSid, call);
  }
  call.channel = channel;
  call.ariClient = ariClient;
  // Map ARI channel ID → call so StasisEnd can find us
  calls.set(channel.id, call);

  await call.fireStatusCallback('ringing');   // technically already past ringing but mirrors Twilio's lifecycle
  await call.answer();                         // runs the webhook → TwiML → <Connect><Stream> just like inbound
}

async function updateCall(callSid, { twiml, status }) {
  const call = calls.get(callSid);
  if (!call) {
    console.warn(`[CallManager] updateCall: unknown callSid ${callSid}`);
    return false;
  }
  if (status === 'completed') {
    await call.hangup();
    return true;
  }
  if (twiml) {
    await call.executeTwiml(twiml);
    return true;
  }
  return false;
}

/**
 * Originate an outbound call via Asterisk ARI through the configured SIP
 * trunk. The called party's channel enters our Stasis app on answer, where
 * handleInboundCall picks it up — but we pre-register the Call object here so
 * the StasisStart handler can look it up by the X-CallSid variable instead
 * of treating it as a fresh inbound.
 *
 *   ENV:
 *     SIP_OUTBOUND_TRUNK   default trunk endpoint name (e.g. "my-trunk"). If
 *                          unset, the first trunk found in pjsip.conf is used.
 *     SIP_DIAL_TIMEOUT_SEC how long Asterisk rings the destination (default 30s)
 */
async function placeOutboundCall({ callSid, to, from, url, statusCallback }) {
  if (!_ariClient) throw new Error('ARI client not connected');
  if (!to)         throw new Error('Missing destination number (to)');

  // Pick a trunk. Caller can override via env; otherwise grab the first one
  // parsed from pjsip.conf so a single-trunk deployment "just works".
  let trunk = process.env.SIP_OUTBOUND_TRUNK || '';
  if (!trunk) {
    try {
      const { trunks } = await sipMgr.parsePjsipConf();
      if (trunks?.length) trunk = trunks[0].name;
    } catch (_) { /* fall through — will fail clearly below */ }
  }
  if (!trunk) {
    throw new Error('No SIP trunk configured (set SIP_OUTBOUND_TRUNK or add a trunk via /sip/trunks)');
  }

  const dialTimeoutSec = parseInt(process.env.SIP_DIAL_TIMEOUT_SEC || '30', 10);
  const endpoint       = `PJSIP/${to}@${trunk}`;
  const appName        = process.env.ARI_APP || 'voiceflow-app';

  // Pre-register the Call object so StasisStart (which fires when the callee
  // answers) can resolve it from the channel variable we set below.
  const call = new Call({
    callSid,
    channel:   null,           // filled in by StasisStart
    ariClient: _ariClient,
    direction: 'outbound',
    ddi:       to,
  });
  call.from = from || '';
  call.to   = to;
  call.statusCallbackUrl = statusCallback || null;
  calls.set(callSid, call);

  console.log(`[CallManager] Outbound originate: ${from} → ${to} via ${trunk} (callSid=${callSid})`);

  try {
    const channel = await _ariClient.channels.originate({
      endpoint,
      app:        appName,
      callerId:   from || '',
      timeout:    dialTimeoutSec,
      variables: {
        // Custom variable so StasisStart can recognise this is OUR outbound
        // and look up the pre-registered Call by callSid.
        'CALLERID(name)':       from || '',
        'X_VOICEFLOW_CALLSID':  callSid,
      },
    });
    // Map ARI channel id → Call so handleCallEnd can locate it
    calls.set(channel.id, call);
    call.channel = channel;

    // Fire the "initiated" callback so Firebase records the attempt
    await call.fireStatusCallback('initiated', { Trunk: trunk });
    return { callSid, status: 'initiated', trunk };
  } catch (err) {
    // Channel never made it — clean up the pre-registration so we don't leak
    calls.delete(callSid);
    console.error(`[CallManager] Originate failed: ${err.message}`);
    // Bubble up to the REST handler which returns 5xx to the caller
    throw new Error(`SIP originate failed: ${err.message}`);
  }
}

function activeCalls() {
  let count = 0;
  for (const v of calls.values()) {
    if (v instanceof Call && v.status !== 'completed') count++;
  }
  return count;
}

function getCallList() {
  const list = [];
  const seen = new Set();
  for (const v of calls.values()) {
    if (v instanceof Call && v.status !== 'completed' && !seen.has(v.callSid)) {
      seen.add(v.callSid);
      list.push({
        callSid:   v.callSid,
        from:      v.from,
        to:        v.to,
        status:    v.status,
        direction: v.direction,
        streaming: v.streaming,
        startedAt: v._startedAt || Date.now(),
      });
    }
  }
  return list;
}

/**
 * Query Asterisk ARI for live SIP/endpoint status.
 * Returns null if ARI client not yet connected.
 */
async function getSipStatus() {
  if (!_ariClient) return null;
  try {
    const [rawEndpointsList, rawEndpointsByTech, rawChannels, rawBridges] = await Promise.all([
      _ariClient.endpoints.list().catch(() => []),
      _ariClient.endpoints.listByTech({ tech: 'PJSIP' }).catch(() => []),
      _ariClient.channels.list().catch(() => []),
      _ariClient.bridges.list().catch(() => []),
    ]);

    // Merge the two endpoint lists, deduplicated by resource name
    const epMap = new Map();
    for (const ep of [...rawEndpointsList, ...rawEndpointsByTech]) {
      const key = ep.resource || ep.id || '';
      if (key && !epMap.has(key)) epMap.set(key, ep);
    }
    const rawEndpoints = Array.from(epMap.values());

    const endpoints = rawEndpoints.map(ep => {
      const resource = ep.resource || ep.id || '';
      // numeric-only resource = extension, anything else = trunk
      const kind = /^\d+$/.test(resource) ? 'extension' : 'trunk';
      return {
        tech:       ep.technology || 'PJSIP',
        resource,
        label:      resource,
        kind,
        state:      (ep.state || 'unknown').toLowerCase(),
        channelIds: ep.channel_ids || [],
      };
    });

    const channels = rawChannels.map(ch => ({
      id:       ch.id,
      name:     ch.name || '',
      state:    (ch.state || 'unknown').toLowerCase(),
      caller:   ch.caller?.number || '',
      exten:    ch.dialplan?.exten || '',
      createdAt: ch.creationtime || null,
    }));

    const bridges = rawBridges.map(br => ({
      id:         br.id,
      type:       br.bridge_type || 'mixing',
      channelIds: br.channels || [],
    }));

    return { endpoints, channels, bridges };
  } catch (err) {
    console.error('[SIP] Status query error:', err.message);
    return null;
  }
}

module.exports = {
  setAriClient,
  handleInboundCall,
  handleOutboundAnswered,
  handleCallEnd,
  updateCall,
  placeOutboundCall,
  activeCalls,
  getCallList,
  getSipStatus,
};
