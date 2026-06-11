/**
 * sip-manager.js
 * Parse and mutate /etc/asterisk/pjsip.conf + extensions.conf, then reload Asterisk.
 * All file operations are async (fs.promises). Reload via asterisk -rx.
 *
 * MULTI-TENANT: when multi-tenancy is implemented, scope trunk/extension namespaces
 * by tenant prefix (e.g. "tenant1_mytrunk") and filter by req.headers['x-tenant-id'].
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const { promisify } = require('util');
const exec    = promisify(require('child_process').exec);

const PJSIP_CONF = process.env.PJSIP_CONF      || '/etc/asterisk/pjsip.conf';
const EXT_CONF   = process.env.EXTENSIONS_CONF || '/etc/asterisk/extensions.conf';

// ── INI-style parser ──────────────────────────────────────────────────────────

/**
 * Parse a simple Asterisk INI-style .conf file.
 * Returns an array of sections: [{ name: string, lines: string[], kv: {key:value} }]
 * Preserves raw lines so we can round-trip without losing comments.
 */
function parseConf(text) {
  const sections = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw;
    const sectionMatch = line.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      current = { name: sectionMatch[1], lines: [line], kv: {} };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
      const kvMatch = line.match(/^([^=;#\s][^=]*)=\s*(.*)\s*$/);
      if (kvMatch) {
        current.kv[kvMatch[1].trim()] = kvMatch[2].trim();
      }
    }
    // lines before any section are discarded (or we could keep them — not needed here)
  }
  return sections;
}

function sectionsToText(sections) {
  return sections.map(s => s.lines.join('\n')).join('\n') + '\n';
}

// ── Read helpers ──────────────────────────────────────────────────────────────

async function readConf(filepath) {
  try {
    const text = await fs.promises.readFile(filepath, 'utf8');
    return { text, sections: parseConf(text) };
  } catch (err) {
    if (err.code === 'ENOENT') return { text: '', sections: [] };
    throw err;
  }
}

async function writeConf(filepath, sections) {
  const text = sectionsToText(sections);
  await fs.promises.writeFile(filepath, text, 'utf8');
}

// ── parsePjsipConf ────────────────────────────────────────────────────────────

/**
 * Read pjsip.conf and return categorised trunks and extensions.
 * Heuristic: sections with a matching [name] (type=endpoint) whose auth/aor
 * have an identify block → trunk. Numeric-only section names → extension.
 */
async function parsePjsipConf() {
  const { sections } = await readConf(PJSIP_CONF);

  const trunks     = [];
  const extensions = [];

  // Collect endpoints
  const endpoints = sections.filter(s => s.kv.type === 'endpoint');

  // Collect identifies (for trunk IP detection)
  const identifies = sections.filter(s => s.kv.type === 'identify');

  // Collect auths for password extraction
  const auths = sections.filter(s => s.kv.type === 'auth');

  for (const ep of endpoints) {
    const name = ep.name;
    if (/^\d+$/.test(name)) {
      // Numeric → extension
      const authName = ep.kv.auth || name;
      const authSec  = auths.find(a => a.name === authName);
      const password = authSec?.kv?.password || authSec?.kv?.md5_cred || '';
      extensions.push({ number: name, password });
    } else {
      // Non-numeric → trunk
      const identifySec = identifies.find(id => id.name.startsWith(name));
      const ip      = identifySec?.kv?.match || '';
      const context = ep.kv.context || 'from-operator';
      trunks.push({ name, ip, context });
    }
  }

  return { trunks, extensions };
}

// ── addTrunk ──────────────────────────────────────────────────────────────────

async function addTrunk({ name, ip, context = 'from-operator' }) {
  if (!name || !ip) throw new Error('name and ip are required');

  // --- pjsip.conf ---
  const { sections: pjsipSections } = await readConf(PJSIP_CONF);

  // Check duplicate
  if (pjsipSections.some(s => s.name === name && s.kv.type === 'endpoint')) {
    throw new Error(`Trunk "${name}" already exists`);
  }

  // Endpoint section
  const epLines = [
    `[${name}]`,
    `type=endpoint`,
    `transport=transport-udp`,
    `context=${context}`,
    `disallow=all`,
    `allow=ulaw`,
    `allow=alaw`,
    `dtmf_mode=rfc4733`,
    `aors=${name}`,
    `auth=${name}`,
    `direct_media=no`,
    `trust_id_outbound=yes`,
  ];

  // AOR section
  const aorLines = [
    `[${name}]`,
    `type=aor`,
    `contact=sip:${ip}`,
    `qualify_frequency=30`,
  ];

  // Identify section (IP-based auth)
  const identifyLines = [
    `[${name}-identify]`,
    `type=identify`,
    `endpoint=${name}`,
    `match=${ip}`,
  ];

  // Auth section (no password needed for IP-based trunks, but define it)
  const authLines = [
    `[${name}]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${name}`,
    `password=`,
  ];

  const newSections = [epLines, aorLines, identifyLines, authLines].map(lines => ({
    name: lines[0].replace(/^\[|\]$/g, ''),
    lines,
    kv: {},
  }));

  // Re-parse kv for completeness
  for (const sec of newSections) {
    for (const l of sec.lines.slice(1)) {
      const m = l.match(/^([^=]+)=(.*)$/);
      if (m) sec.kv[m[1].trim()] = m[2].trim();
    }
  }

  pjsipSections.push(...newSections);
  await writeConf(PJSIP_CONF, pjsipSections);

  // --- extensions.conf ---
  await _addTrunkDialplan(name, ip, context);

  await reloadAsterisk();
}

async function _addTrunkDialplan(name, ip, context) {
  const { text, sections } = await readConf(EXT_CONF);

  // Find or create the from-operator context (or specified context)
  const ctxName = context;
  let ctxSec = sections.find(s => s.name === ctxName);
  if (!ctxSec) {
    ctxSec = { name: ctxName, lines: [`[${ctxName}]`], kv: {} };
    sections.push(ctxSec);
  }
  // Nothing special to add for trunk dialplan — trunks receive inbound via PJSIP
  // But we need to ensure the context exists for pjsip.conf reference.
  await writeConf(EXT_CONF, sections);
}

// ── removeTrunk ───────────────────────────────────────────────────────────────

async function removeTrunk(name) {
  if (!name) throw new Error('name is required');

  const { sections } = await readConf(PJSIP_CONF);

  const filtered = sections.filter(s => {
    // Remove endpoint, aor, auth with exact name, and identify named <name>-identify or <name>_identify
    if (s.name === name) return false;
    if (s.name === `${name}-identify`) return false;
    if (s.name === `${name}_identify`) return false;
    return true;
  });

  if (filtered.length === sections.length) {
    throw new Error(`Trunk "${name}" not found`);
  }

  await writeConf(PJSIP_CONF, filtered);
  await reloadAsterisk();
}

// ── addExtension ──────────────────────────────────────────────────────────────

async function addExtension({ number, password }) {
  if (!number || !password) throw new Error('number and password are required');
  const num = String(number);

  // --- pjsip.conf ---
  const { sections: pjsipSections } = await readConf(PJSIP_CONF);

  if (pjsipSections.some(s => s.name === num && s.kv.type === 'endpoint')) {
    throw new Error(`Extension ${num} already exists`);
  }

  const epLines = [
    `[${num}]`,
    `type=endpoint`,
    `transport=transport-udp`,
    `context=from-internal`,
    `disallow=all`,
    `allow=ulaw`,
    `allow=alaw`,
    `dtmf_mode=rfc4733`,
    `aors=${num}`,
    `auth=${num}`,
    `direct_media=no`,
  ];

  const aorLines = [
    `[${num}]`,
    `type=aor`,
    `max_contacts=3`,
    `qualify_frequency=30`,
  ];

  const authLines = [
    `[${num}]`,
    `type=auth`,
    `auth_type=userpass`,
    `username=${num}`,
    `password=${password}`,
  ];

  const newSections = [epLines, aorLines, authLines].map(lines => ({
    name: lines[0].replace(/^\[|\]$/g, ''),
    lines,
    kv: {},
  }));

  for (const sec of newSections) {
    for (const l of sec.lines.slice(1)) {
      const m = l.match(/^([^=]+)=(.*)$/);
      if (m) sec.kv[m[1].trim()] = m[2].trim();
    }
  }

  pjsipSections.push(...newSections);
  await writeConf(PJSIP_CONF, pjsipSections);

  // --- extensions.conf: add extension in from-internal context ---
  await _addExtensionDialplan(num);

  await reloadAsterisk();
}

async function _addExtensionDialplan(num) {
  const { sections } = await readConf(EXT_CONF);

  let ctxSec = sections.find(s => s.name === 'from-internal');
  if (!ctxSec) {
    ctxSec = { name: 'from-internal', lines: ['[from-internal]'], kv: {} };
    sections.push(ctxSec);
  }

  // Add a direct-dial entry for this extension if not already present
  const dialLine = `exten => ${num},1,Dial(PJSIP/${num},30,tTr)`;
  const hangLine = `exten => ${num},n,Hangup()`;

  if (!ctxSec.lines.some(l => l.includes(`exten => ${num},`))) {
    ctxSec.lines.push(dialLine, hangLine);
  }

  await writeConf(EXT_CONF, sections);
}

// ── removeExtension ───────────────────────────────────────────────────────────

async function removeExtension(number) {
  const num = String(number);

  // Remove from pjsip.conf
  const { sections: pjsipSections } = await readConf(PJSIP_CONF);
  const filtered = pjsipSections.filter(s => s.name !== num);
  if (filtered.length === pjsipSections.length) {
    throw new Error(`Extension ${num} not found`);
  }
  await writeConf(PJSIP_CONF, filtered);

  // Remove dialplan lines from extensions.conf
  const { sections: extSections } = await readConf(EXT_CONF);
  for (const sec of extSections) {
    sec.lines = sec.lines.filter(l => !l.includes(`exten => ${num},`));
  }
  await writeConf(EXT_CONF, extSections);

  await reloadAsterisk();
}

// ── getDDIRules ───────────────────────────────────────────────────────────────

/**
 * Parse extensions.conf and return DDI routing rules.
 * Looks for lines of the form:
 *   exten => DDI,1,Dial(target)           ; optional label comment
 * in the [from-operator] or [from-pstn] contexts.
 */
async function getDDIRules() {
  const { sections } = await readConf(EXT_CONF);

  const inboundContexts = ['from-operator', 'from-pstn', 'from-trunk', 'from-external'];
  const rules = [];

  for (const sec of sections) {
    if (!inboundContexts.includes(sec.name)) continue;

    for (const line of sec.lines) {
      // Match: exten => <ddi>,1,<app>(<target>)  ; <label>
      const m = line.match(/^\s*exten\s*=>\s*([+\d_\.]+)\s*,\s*1\s*,\s*(.+?)(?:\s*;\s*(.*))?$/);
      if (!m) continue;
      const ddi    = m[1].trim();
      const appStr = m[2].trim();
      const label  = (m[3] || '').trim();

      // Extract target from Dial() or Stasis() or bare app
      let target = appStr;
      const dialMatch = appStr.match(/^Dial\(([^,)]+)/i);
      const stasisMatch = appStr.match(/^Stasis\(([^,)]+)/i);
      if (dialMatch) target = dialMatch[1].trim();
      else if (stasisMatch) target = `Stasis(${stasisMatch[1].trim()})`;

      rules.push({ ddi, target, label, context: sec.name });
    }
  }

  return rules;
}

// ── addDDIRule ────────────────────────────────────────────────────────────────

async function addDDIRule({ ddi, target, label = '' }) {
  if (!ddi || !target) throw new Error('ddi and target are required');

  const { sections } = await readConf(EXT_CONF);

  // Use from-operator as default inbound context
  let ctxSec = sections.find(s => s.name === 'from-operator');
  if (!ctxSec) {
    ctxSec = { name: 'from-operator', lines: ['[from-operator]'], kv: {} };
    sections.push(ctxSec);
  }

  // Check for duplicate DDI
  if (ctxSec.lines.some(l => {
    const m = l.match(/^\s*exten\s*=>\s*([+\d_\.]+)\s*,\s*1/);
    return m && m[1].trim() === ddi;
  })) {
    throw new Error(`DDI rule for ${ddi} already exists`);
  }

  // Build the dial application string
  let appStr;
  if (target.startsWith('Stasis(')) {
    appStr = target;
  } else if (target.startsWith('PJSIP/') || target.startsWith('SIP/')) {
    appStr = `Dial(${target},30,tTr)`;
  } else if (/^\d+$/.test(target)) {
    appStr = `Dial(PJSIP/${target},30,tTr)`;
  } else {
    appStr = `Dial(${target},30,tTr)`;
  }

  const comment = label ? ` ; ${label}` : '';
  ctxSec.lines.push(`exten => ${ddi},1,${appStr}${comment}`);
  ctxSec.lines.push(`exten => ${ddi},n,Hangup()`);

  await writeConf(EXT_CONF, sections);
  await reloadAsterisk(['dialplan']);
}

// ── removeDDIRule ─────────────────────────────────────────────────────────────

async function removeDDIRule(ddi) {
  if (!ddi) throw new Error('ddi is required');

  const { sections } = await readConf(EXT_CONF);
  let removed = false;

  for (const sec of sections) {
    const before = sec.lines.length;
    sec.lines = sec.lines.filter(l => {
      const m = l.match(/^\s*exten\s*=>\s*([+\d_\.]+)\s*,/);
      return !(m && m[1].trim() === ddi);
    });
    if (sec.lines.length < before) removed = true;
  }

  if (!removed) throw new Error(`DDI rule for ${ddi} not found`);

  await writeConf(EXT_CONF, sections);
  await reloadAsterisk(['dialplan']);
}

// ── reloadAsterisk ────────────────────────────────────────────────────────────

async function reloadAsterisk(modules = ['pjsip', 'dialplan']) {
  const cmds = modules.map(m => {
    if (m === 'pjsip')     return 'asterisk -rx "pjsip reload"';
    if (m === 'dialplan')  return 'asterisk -rx "dialplan reload"';
    return `asterisk -rx "module reload ${m}"`;
  });
  const cmd = cmds.join(' && ');
  try {
    const { stdout, stderr } = await exec(cmd, { timeout: 15000 });
    if (stdout) console.log('[SipMgr] Reload stdout:', stdout.trim());
    if (stderr) console.warn('[SipMgr] Reload stderr:', stderr.trim());
  } catch (err) {
    // Non-fatal — Asterisk may not be running in dev environments
    console.warn('[SipMgr] Reload warning:', err.message);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  parsePjsipConf,
  addTrunk,
  removeTrunk,
  addExtension,
  removeExtension,
  getDDIRules,
  addDDIRule,
  removeDDIRule,
  reloadAsterisk,
};
