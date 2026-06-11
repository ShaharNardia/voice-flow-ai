const express = require('express');
const ari     = require('ari-client');
const axios   = require('axios');
const { spawn } = require('child_process');
const fs      = require('fs');

const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'vf_bridge_2024_secure';
const FIREBASE_URL  = process.env.FIREBASE_URL  || 'https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net';
const ARI_URL       = 'http://127.0.0.1:8088';
const ARI_USER      = 'voiceflow';
const ARI_PASS      = 'vf_bridge_2024_secure';
const APP_NAME      = 'voiceflow-app';
const PORT          = 3000;
const PCAP_FILE     = '/tmp/sip_capture.pcap';
const MAX_TRACE_B   = 2 * 1024 * 1024; // 2 MB upload cap

const app = express();
app.use(express.json({ limit: '10mb' }));

let ariClient  = null;
let connected  = false;
let tcpdumpProc = null;
const activeSessions = {};   // channelId -> session object

// ── Pure-JS PCAP time-window filter (no editcap/tshark required) ─────────────
// Reads a pcap file, keeps only packets whose timestamps fall within [fromMs, toMs].
function filterPcap(srcPath, fromMs, toMs) {
  try {
    const buf = fs.readFileSync(srcPath);
    if (buf.length < 24) return null;
    const magic = buf.readUInt32LE(0);
    if (magic !== 0xa1b2c3d4 && magic !== 0xa1b23c4d) return null;
    const ns = (magic === 0xa1b23c4d); // nanosecond-resolution variant
    const globalHdr = buf.slice(0, 24);
    const packets   = [];
    let off = 24;
    while (off + 16 <= buf.length) {
      const sec  = buf.readUInt32LE(off);
      const sub  = buf.readUInt32LE(off + 4);
      const ilen = buf.readUInt32LE(off + 8);
      if (ilen > 65535 || off + 16 + ilen > buf.length) break;
      const ms = sec * 1000 + (ns ? Math.floor(sub / 1e6) : Math.floor(sub / 1000));
      if (ms >= fromMs && ms <= toMs) packets.push(buf.slice(off, off + 16 + ilen));
      off += 16 + ilen;
    }
    if (!packets.length) return null;
    const out = Buffer.concat([globalHdr, ...packets]);
    console.log('[TRACE] Filtered', packets.length, 'SIP pkts,', out.length, 'bytes');
    return out;
  } catch (e) {
    console.error('[TRACE] filterPcap:', e.message);
    return null;
  }
}

// ── tcpdump: capture all UDP port-5060 traffic continuously ──────────────────
function startCapture() {
  try {
    if (tcpdumpProc) { try { tcpdumpProc.kill(); } catch(e) {} tcpdumpProc = null; }
    if (fs.existsSync(PCAP_FILE)) fs.unlinkSync(PCAP_FILE);
    tcpdumpProc = spawn('tcpdump', ['-i', 'any', '-n', '-s', '0', 'udp port 5060', '-w', PCAP_FILE]);
    tcpdumpProc.stderr.on('data', d => {
      const m = d.toString().trim();
      if (!m.includes('listening') && !m.includes('packets')) console.log('[TCPDUMP]', m);
    });
    tcpdumpProc.on('close', code => {
      tcpdumpProc = null;
      console.log('[TCPDUMP] exited', code, '— restart in 5s');
      setTimeout(startCapture, 5000);
    });
    console.log('[TCPDUMP] capturing SIP → ' + PCAP_FILE);
  } catch (e) {
    console.error('[TCPDUMP] start failed:', e.message, '— traces will be unavailable');
    setTimeout(startCapture, 10000);
  }
}

// ── Save trace to Firebase after call ends ────────────────────────────────────
async function saveTrace(channelId, s) {
  await sleep(2000); // wait for final BYE / ACK to be captured
  try {
    if (!fs.existsSync(PCAP_FILE)) {
      console.log('[TRACE] pcap file not found, skipping', channelId);
      return;
    }
    const filtered = filterPcap(PCAP_FILE, s.startMs - 2000, s.endMs + 3000);
    if (!filtered) { console.log('[TRACE] no SIP packets for', channelId); return; }
    if (filtered.length > MAX_TRACE_B) { console.log('[TRACE] too large', filtered.length, 'bytes'); return; }
    await axios.post(FIREBASE_URL + '/sipTraceSave', {
      bridgeSecret: BRIDGE_SECRET,
      channelId,
      sessionId:  s.sessionId  || null,
      from:       s.from,
      to:         s.to,
      companyId:  s.companyId  || null,
      startMs:    s.startMs,
      endMs:      s.endMs,
      pcapB64:    filtered.toString('base64'),
    }, { timeout: 30000 });
    console.log('[TRACE] saved', channelId, filtered.length + 'B');
  } catch (e) {
    console.error('[TRACE] save failed:', e.message);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ARI: connect with retries ─────────────────────────────────────────────────
async function connectAri(retries) {
  retries = retries || 30;
  for (let i = 0; i < retries; i++) {
    try {
      ariClient = await ari.connect(ARI_URL, ARI_USER, ARI_PASS);
      connected = true;
      console.log('[ARI] Connected to Asterisk ARI');

      // ── Inbound call ────────────────────────────────────────────────────────
      ariClient.on('StasisStart', async (event, ch) => {
        const from = ch.caller.number || 'unknown';
        const to   = ch.dialplan.exten || 'unknown';
        console.log('[ARI] inbound:', from, '->', to, '(' + ch.id + ')');
        try {
          await ch.answer();
          const r = await axios.post(FIREBASE_URL + '/sipInboundCall', {
            channelId: ch.id, from, to, bridgeSecret: BRIDGE_SECRET,
          }, { timeout: 10000 });
          activeSessions[ch.id] = {
            sessionId:     r.data.sessionId,
            assistantId:   r.data.assistantId,
            assistantName: r.data.assistantName,
            companyId:     r.data.companyId,
            from, to,
            startMs: Date.now(),
          };
          console.log('[ARI] routing: assistant=' + r.data.assistantName + ' session=' + r.data.sessionId);
          try { await ch.play({ media: 'sound:hello-world' }); } catch (e) {}
        } catch (e) {
          console.error('[ARI] inbound error:', e.message);
          try { await ch.hangup(); } catch (e2) {}
        }
      });

      // ── Call ended ──────────────────────────────────────────────────────────
      ariClient.on('StasisEnd', async (event, ch) => {
        const s = activeSessions[ch.id];
        console.log('[ARI] call ended:', ch.id, s ? ('session=' + s.sessionId) : '(no session)');
        if (s) {
          s.endMs = Date.now();
          if (s.sessionId) {
            try {
              await axios.post(FIREBASE_URL + '/sipCallEnded', {
                channelId: ch.id, sessionId: s.sessionId, bridgeSecret: BRIDGE_SECRET,
              }, { timeout: 5000 });
            } catch (e) { console.log('[ARI] end notify failed:', e.message); }
          }
          const snap = Object.assign({}, s);
          saveTrace(ch.id, snap).catch(e => console.error('[TRACE]', e.message));
        }
        delete activeSessions[ch.id];
      });

      ariClient.start(APP_NAME);
      console.log('[ARI] app started:', APP_NAME);
      return;
    } catch (e) {
      console.log('[ARI] attempt', i + 1 + '/' + retries, 'failed:', e.message);
      if (i < retries - 1) await sleep(2000);
    }
  }
  console.error('[ARI] could not connect after', retries, 'attempts — degraded mode');
}

// ── REST endpoints ────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({
  status:            connected ? 'ok' : 'degraded',
  asteriskConnected: connected,
  activeCalls:       Object.keys(activeSessions).length,
  captureActive:     !!(tcpdumpProc && tcpdumpProc.exitCode === null),
  timestamp:         new Date().toISOString(),
}));

app.post('/dial', async (req, res) => {
  if (req.body.secret !== BRIDGE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  if (!connected) return res.status(503).json({ error: 'ARI not connected' });
  try {
    const ch = ariClient.Channel();
    await ch.originate({
      endpoint:  'PJSIP/' + req.body.to + '@partner',
      app:       APP_NAME,
      callerId:  req.body.from || '+12178078281',
      variables: req.body.channelVars || {},
    });
    res.json({ status: 'ok', channelId: ch.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/hangup', async (req, res) => {
  if (req.body.secret !== BRIDGE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  try {
    await ariClient.Channel(req.body.channelId).hangup();
    res.json({ status: 'ok' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/sessions', (req, res) => {
  const auth = req.headers['x-bridge-secret'] || req.query.secret;
  if (auth !== BRIDGE_SECRET) return res.status(403).json({ error: 'Forbidden' });
  res.json({ sessions: activeSessions });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('[Bridge] VoiceFlow SIP Bridge v2.0 — port', PORT);
  console.log('[Bridge] Firebase URL:', FIREBASE_URL);
  startCapture();   // start tcpdump
  connectAri();     // connect to Asterisk ARI
});
