/**
 * VoiceFlow SIP Bridge v3.0
 * Replaces Twilio — connects Asterisk (SIP) to Firebase Functions + Cloud Run.
 *
 * REST API (called by Firebase Functions instead of Twilio REST API):
 *   POST /calls/:callSid/update   { twiml?, status? }
 *   POST /calls                   { to, from, url, statusCallback }
 *   GET  /health
 */
require('dotenv').config();

const express    = require('express');
const ari        = require('ari-client');
const callMgr    = require('./call-manager');
const sipMgr     = require('./sip-manager');
const { registerDashboard } = require('./dashboard');

const ARI_URL  = process.env.ARI_URL  || 'http://127.0.0.1:8088';
const ARI_USER = process.env.ARI_USER || 'voiceflow';
const ARI_PASS = process.env.ARI_PASS || 'vf_bridge_2024_secure';
const APP_NAME = process.env.ARI_APP  || 'voiceflow-app';
const PORT     = parseInt(process.env.PORT || '3000', 10);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireSecret(req, res, next) {
  const secret = req.headers['x-bridge-secret'] || req.body?.bridgeSecret;
  if (BRIDGE_SECRET && secret !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── REST API ──────────────────────────────────────────────────────────────────

/**
 * Mid-call update — replaces:
 *   twilioClient.calls(callSid).update({ twiml })
 *   twilioClient.calls(callSid).update({ status: 'completed' })
 */
app.post('/calls/:callSid/update', requireSecret, async (req, res) => {
  const { callSid } = req.params;
  const { twiml, status } = req.body;
  try {
    const ok = await callMgr.updateCall(callSid, { twiml, status });
    if (!ok) return res.status(404).json({ error: `Call ${callSid} not found` });
    res.json({ sid: callSid, status: status || 'in-progress' });
  } catch (err) {
    console.error(`[API] /calls/${callSid}/update error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Outbound call — replaces:
 *   twilioClient.calls.create({ to, from, url, statusCallback })
 */
app.post('/calls', requireSecret, async (req, res) => {
  const { to, from, url, statusCallback } = req.body;
  if (!to || !from) return res.status(400).json({ error: 'Missing to/from' });
  try {
    const result = await callMgr.placeOutboundCall({
      callSid: `CA${require('crypto').randomBytes(16).toString('hex').toUpperCase()}`,
      to, from, url, statusCallback,
    });
    res.json(result);
  } catch (err) {
    console.error('[API] /calls error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SIP Management Routes ─────────────────────────────────────────────────────
// MULTI-TENANT: filter by req.headers['x-tenant-id'] when implemented

/** GET /sip/trunks — list trunks from pjsip.conf */
app.get('/sip/trunks', requireSecret, async (_req, res) => {
  try {
    const { trunks } = await sipMgr.parsePjsipConf();
    res.json(trunks);
  } catch (err) {
    console.error('[API] GET /sip/trunks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /sip/trunks — add a new trunk */
app.post('/sip/trunks', requireSecret, async (req, res) => {
  const { name, ip, context } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'Missing name or ip' });
  try {
    await sipMgr.addTrunk({ name, ip, context });
    res.json({ ok: true, name });
  } catch (err) {
    console.error('[API] POST /sip/trunks:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 500).json({ error: err.message });
  }
});

/** DELETE /sip/trunks/:name — remove a trunk */
app.delete('/sip/trunks/:name', requireSecret, async (req, res) => {
  try {
    await sipMgr.removeTrunk(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /sip/trunks:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/** GET /sip/extensions — list extensions from pjsip.conf */
app.get('/sip/extensions', requireSecret, async (_req, res) => {
  try {
    const { extensions } = await sipMgr.parsePjsipConf();
    res.json(extensions);
  } catch (err) {
    console.error('[API] GET /sip/extensions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /sip/extensions — add a new extension */
app.post('/sip/extensions', requireSecret, async (req, res) => {
  const { number, password } = req.body;
  if (!number || !password) return res.status(400).json({ error: 'Missing number or password' });
  try {
    await sipMgr.addExtension({ number, password });
    res.json({ ok: true, number });
  } catch (err) {
    console.error('[API] POST /sip/extensions:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 500).json({ error: err.message });
  }
});

/** DELETE /sip/extensions/:number — remove an extension */
app.delete('/sip/extensions/:number', requireSecret, async (req, res) => {
  try {
    await sipMgr.removeExtension(req.params.number);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /sip/extensions:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/** GET /sip/routing — list DDI rules */
app.get('/sip/routing', requireSecret, async (_req, res) => {
  try {
    const rules = await sipMgr.getDDIRules();
    res.json(rules);
  } catch (err) {
    console.error('[API] GET /sip/routing:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /sip/routing — add a DDI rule */
app.post('/sip/routing', requireSecret, async (req, res) => {
  const { ddi, target, label } = req.body;
  if (!ddi || !target) return res.status(400).json({ error: 'Missing ddi or target' });
  try {
    await sipMgr.addDDIRule({ ddi, target, label });
    res.json({ ok: true, ddi });
  } catch (err) {
    console.error('[API] POST /sip/routing:', err.message);
    res.status(err.message.includes('already exists') ? 409 : 500).json({ error: err.message });
  }
});

/** DELETE /sip/routing/:ddi — remove a DDI rule */
app.delete('/sip/routing/:ddi', requireSecret, async (req, res) => {
  try {
    await sipMgr.removeDDIRule(req.params.ddi);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /sip/routing:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status:      'ok',
    version:     '3.0.0',
    ariConnected: ariStatus.connected,
    activeCalls:  callMgr.activeCalls(),
    timestamp:    new Date().toISOString(),
  });
});

/** Stats - used by admin dashboard */
app.get('/stats', (_req, res) => {
  res.json({
    status:      'ok',
    activeCalls:  callMgr.activeCalls(),
    ariConnected: ariStatus.connected,
    calls:        callMgr.getCallList(),
    uptime:       process.uptime(),
    calls_today:  0,
    timestamp:    new Date().toISOString(),
  });
});

/** Server metrics */
app.get('/metrics', requireSecret, (_req, res) => {
  const os  = require('os');
  const mem = process.memoryUsage();
  res.json({
    uptime:      process.uptime(),
    node:        process.version,
    pid:         process.pid,
    memory:      { rssMB: +(mem.rss/1048576).toFixed(1), heapUsedMB: +(mem.heapUsed/1048576).toFixed(1), heapTotalMB: +(mem.heapTotal/1048576).toFixed(1) },
    os:          { loadavg: os.loadavg().map(l => +l.toFixed(2)), totalMemMB: Math.round(os.totalmem()/1048576), freeMemMB: Math.round(os.freemem()/1048576), platform: os.platform() },
    ariConnected: ariStatus.connected,
    activeCalls:  callMgr.activeCalls(),
  });
});

/** Asterisk CLI passthrough — executes: asterisk -rx "<cmd>" */
app.get('/asterisk/cli', requireSecret, (req, res) => {
  const { exec } = require('child_process');
  const cmd = (req.query.cmd || '').replace(/["`$\\]/g, '');   // basic sanitise
  if (!cmd) return res.status(400).json({ error: 'Missing cmd param' });
  exec(`asterisk -rx "${cmd}"`, { timeout: 10000 }, (err, stdout, stderr) => {
    res.json({ cmd, output: stdout || stderr || err?.message || '(no output)', ok: !err });
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
const ariStatus = { connected: false };
registerDashboard(app, callMgr, ariStatus, sipMgr);

// ── ARI connection ────────────────────────────────────────────────────────────
let ariConnected = false;

async function connectARI(attempt = 1) {
  try {
    const client = await ari.connect(ARI_URL, ARI_USER, ARI_PASS);
    ariConnected = true;
    ariStatus.connected = true;
    console.log('[ARI] Connected to Asterisk');

    callMgr.setAriClient(client);

    client.on('StasisStart', async (event, channel) => {
      // Ignore channels that are already part of a bridge (e.g. ExternalMedia channels)
      if (channel.name?.startsWith('UnicastRTP')) return;

      // Outbound: if we tagged this channel with X_VOICEFLOW_CALLSID during
      // originate, hand it to the call-manager's outbound completion path
      // instead of treating it like an inbound call.
      try {
        const v = await client.channels.getChannelVar({ channelId: channel.id, variable: 'X_VOICEFLOW_CALLSID' }).catch(() => null);
        const outboundCallSid = v?.value || null;
        if (outboundCallSid) {
          console.log(`[ARI] Outbound answered: ${channel.caller.number} (callSid=${outboundCallSid})`);
          await callMgr.handleOutboundAnswered(client, channel, outboundCallSid);
          return;
        }
      } catch (_) { /* fall through to inbound handling */ }

      const exten = channel.dialplan?.exten || '';
      // Reverse-lookup DDI rules to find the DID phone number that maps to this extension.
      // Without this, twilioVoiceWebhook receives the extension ('101') instead of the
      // real phone number and fails to find the matching agent/company.
      let ddi = exten;
      try {
        const rules = await sipMgr.getDDIRules();
        // target may be 'PJSIP/101', 'SIP/101', or bare '101' — strip tech prefix before comparing
        const rule = rules.find(r => {
          const bare = r.target.replace(/^(PJSIP|SIP)\//i, '');
          return bare === exten || r.target === exten;
        });
        if (rule) ddi = rule.ddi;
      } catch (_) {}
      console.log(`[ARI] Inbound call: ${channel.caller.number} -> ${exten} (DID: ${ddi})`);
      await callMgr.handleInboundCall(client, channel, ddi);
    });

    client.on('StasisEnd', async (event, channel) => {
      console.log(`[ARI] StasisEnd: ${channel.id}`);
      await callMgr.handleCallEnd(channel.id);
    });

    client.on('ChannelHangupRequest', async (event, channel) => {
      await callMgr.handleCallEnd(channel.id);
    });

    client.once('close', () => {
      ariConnected = false;
      ariStatus.connected = false;
      console.warn('[ARI] Disconnected — reconnecting in 5s');
      setTimeout(() => connectARI(), 5000);
    });

    client.start(APP_NAME);
    console.log(`[ARI] App started: ${APP_NAME}`);
  } catch (err) {
    ariConnected = false;
    const delay = Math.min(attempt * 2000, 30000);
    console.log(`[ARI] Connect attempt ${attempt} failed (${err.message}) — retry in ${delay}ms`);
    setTimeout(() => connectARI(attempt + 1), delay);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   VoiceFlow SIP Bridge v3.0                   ║
║   Port: ${PORT}                                   ║
║   Firebase: ${process.env.FIREBASE_URL?.slice(0,30) ?? '(not set)'}...  ║
║   Cloud Run: ${process.env.CLOUD_RUN_URL?.slice(0,28) ?? '(not set)'}...  ║
╚═══════════════════════════════════════════════╝
`);
});

connectARI();
