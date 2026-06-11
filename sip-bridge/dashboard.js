/**
 * dashboard.js
 * Premium multi-tenant SIP management dashboard for VoiceFlow SIP Bridge.
 * Single-page app served at GET /dashboard — all state via SSE.
 *
 * MULTI-TENANT: when implemented, pass X-Tenant-ID in all fetch() calls
 * and filter SSE data server-side. UI tenant selector is wired but no-op for now.
 */
'use strict';

// ── In-memory rolling log (structured) ────────────────────────────────────────
const MAX_LOGS = 300;
const logBuffer = [];

function patchConsole() {
  const origLog   = console.log.bind(console);
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);

  const push = (level, args) => {
    const message = args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ');
    const callSidMatch = message.match(/CA[0-9A-F]{32}/);
    const entry = {
      ts:      new Date().toISOString(),
      level,
      message,
      callSid: callSidMatch ? callSidMatch[0] : null,
    };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  };

  console.log   = (...a) => { origLog(...a);   push('INFO',  a); };
  console.warn  = (...a) => { origWarn(...a);  push('WARN',  a); };
  console.error = (...a) => { origError(...a); push('ERROR', a); };
}

// ── SSE clients ────────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) { sseClients.delete(res); }
  }
}

let _callMgr  = null;
let _ariStatus = { connected: false };
let _sipMgr   = null;

function startBroadcast() {
  const os = require('os');
  setInterval(async () => {
    if (sseClients.size === 0) return;
    const sipStatus = _callMgr ? await _callMgr.getSipStatus().catch(() => null) : null;
    let ddiRules = [];
    if (_sipMgr) {
      try { ddiRules = await _sipMgr.getDDIRules(); } catch (_) {}
    }
    const mem = process.memoryUsage();
    broadcastSSE({
      type:         'state',
      ariConnected: _ariStatus.connected,
      activeCalls:  _callMgr ? _callMgr.activeCalls() : 0,
      callList:     _callMgr ? _callMgr.getCallList()  : [],
      sipStatus,
      ddiRules,
      logTraces:    logBuffer.slice(-80),
      ts:           Date.now(),
      metrics: {
        uptime:     process.uptime(),
        rssMB:      +(mem.rss/1048576).toFixed(1),
        heapUsedMB: +(mem.heapUsed/1048576).toFixed(1),
        heapTotalMB:+(mem.heapTotal/1048576).toFixed(1),
        freeMemMB:  Math.round(os.freemem()/1048576),
        totalMemMB: Math.round(os.totalmem()/1048576),
        loadavg:    os.loadavg()[0].toFixed(2),
      },
    });
  }, 2000);
}

// ── Dashboard HTML ─────────────────────────────────────────────────────────────
function buildHTML(bridgeSecret) {
  // Inject secret safely so the client JS can auth API calls.
  // An empty string means "no secret required" — still set the var.
  const secretScript = '<script>window.__BRIDGE_SECRET=' + JSON.stringify(bridgeSecret || '') + ';<\/script>';

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VoiceFlow Bridge &mdash; Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
SECRETSCRIPT_PLACEHOLDER
<style>
/* ── Reset & base ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080c18;--sidebar:#0c1022;--card:#111827;--border:#1f2937;--border2:#374151;
  --text:#f9fafb;--text2:#9ca3af;--text3:#4b5563;
  --indigo:#6366f1;--indigo2:#818cf8;--green:#10b981;--red:#ef4444;
  --yellow:#f59e0b;--blue:#3b82f6;--purple:#8b5cf6;
  --sidebar-w:60px;--sidebar-w-open:220px;--header-h:56px;
}
[data-theme=light]{
  --bg:#f1f5f9;--sidebar:#fff;--card:#fff;--border:#e2e8f0;--border2:#cbd5e1;
  --text:#0f172a;--text2:#475569;--text3:#94a3b8;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;font-size:14px;overflow-x:hidden;transition:background .3s,color .3s}
a{color:inherit;text-decoration:none}
button{cursor:pointer;border:none;outline:none;font-family:inherit}
input,select,textarea{font-family:inherit;outline:none}

/* ── Layout ── */
#app{display:flex;flex:1;position:relative}
#sidebar{
  width:var(--sidebar-w);min-height:calc(100vh - var(--header-h));
  background:var(--sidebar);border-right:1px solid var(--border);
  display:flex;flex-direction:column;transition:width .22s ease;
  position:fixed;top:var(--header-h);left:0;bottom:0;z-index:20;overflow:hidden;
}
#sidebar:hover,#sidebar.expanded{width:var(--sidebar-w-open)}
#main{margin-left:var(--sidebar-w);flex:1;padding:24px;min-height:calc(100vh - var(--header-h));transition:margin-left .22s ease}
header#topbar{
  height:var(--header-h);background:var(--sidebar);border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 20px;gap:12px;position:sticky;top:0;z-index:30;
}
header#topbar .brand{font-size:15px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px;white-space:nowrap}
header#topbar .brand .logo{width:28px;height:28px;background:var(--indigo);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.topbar-badges{display:flex;gap:8px;margin-left:auto;align-items:center;flex-wrap:wrap}

/* ── Sidebar nav items ── */
.nav-item{
  display:flex;align-items:center;gap:12px;padding:0 18px;height:44px;
  color:var(--text2);cursor:pointer;transition:all .15s;white-space:nowrap;
  border-left:3px solid transparent;font-size:13px;font-weight:500;
}
.nav-item:hover{background:rgba(99,102,241,.08);color:var(--text);border-left-color:rgba(99,102,241,.4)}
.nav-item.active{background:rgba(99,102,241,.12);color:var(--indigo2);border-left-color:var(--indigo)}
.nav-icon{font-size:16px;width:24px;text-align:center;flex-shrink:0}
.nav-label{opacity:0;transition:opacity .15s .05s;font-size:13px}
#sidebar:hover .nav-label,#sidebar.expanded .nav-label{opacity:1}
.nav-spacer{flex:1}

/* ── Badges / pills ── */
.badge{padding:3px 9px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;}
.badge-green{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.25)}
.badge-red{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.25)}
.badge-yellow{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.25)}
.badge-blue{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.25)}
.badge-indigo{background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)}
.badge-purple{background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.25)}
.badge-gray{background:rgba(75,85,99,.2);color:var(--text2);border:1px solid var(--border)}
.dot-pulse{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Stat cards ── */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:20px}
.stat-card{
  background:var(--card);border:1px solid var(--border);border-radius:14px;
  padding:18px 20px;position:relative;overflow:hidden;
  background-image:linear-gradient(135deg,rgba(255,255,255,.02) 0%,transparent 60%);
  transition:border-color .2s,transform .2s;
}
.stat-card:hover{border-color:var(--border2);transform:translateY(-1px)}
.stat-card .label{font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.stat-card .value{font-size:28px;font-weight:700;color:var(--text);line-height:1;letter-spacing:-.5px;transition:all .3s}
.stat-card .sub{font-size:11px;color:var(--text3);margin-top:6px}
.stat-card .icon{position:absolute;right:16px;top:16px;font-size:20px;opacity:.25}

/* ── Sparkline cards ── */
.sparkline-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
@media(max-width:720px){.sparkline-row{grid-template-columns:1fr}}
.sparkline-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;transition:border-color .2s}
.sparkline-card:hover{border-color:var(--border2)}
.sparkline-title{font-size:12px;font-weight:600;color:var(--text2);margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em}
.sparkline-card canvas{display:block;width:100%;height:60px;border-radius:6px}

/* ── Section headers ── */
.section-header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.section-header h2{font-size:13px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.06em}
.section-header .count{font-size:10px;font-weight:600;color:var(--text3);background:var(--card);border:1px solid var(--border);padding:1px 8px;border-radius:9999px;margin-left:auto;}
.section-divider{height:1px;background:var(--border);margin:24px 0}

/* ── Cards / panels ── */
.panel{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:20px}
.panel-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.panel-header h3{font-size:13px;font-weight:600;color:var(--text)}
.panel-body{padding:0}
.panel-footer{padding:12px 18px;border-top:1px solid var(--border)}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
@media(max-width:1100px){.grid-3{grid-template-columns:1fr 1fr}}
@media(max-width:720px){.grid-3,.grid-2{grid-template-columns:1fr}}

/* ── Tables ── */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 16px;font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;background:rgba(0,0,0,.2);border-bottom:1px solid var(--border);white-space:nowrap}
[data-theme=light] th{background:rgba(0,0,0,.04)}
td{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(99,102,241,.04)}
.td-mono{font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;font-size:11.5px;color:var(--text2)}
.empty-state{padding:40px 20px;text-align:center;color:var(--text3)}
.empty-state .empty-icon{font-size:32px;opacity:.3;margin-bottom:10px}
.empty-state p{font-size:13px}

/* ── Pill states ── */
.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap}
.pill-green{background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.2)}
.pill-red{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2)}
.pill-yellow{background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.2)}
.pill-blue{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}
.pill-gray{background:rgba(75,85,99,.15);color:var(--text2);border:1px solid var(--border)}
.pill-indigo{background:rgba(99,102,241,.12);color:#a5b4fc;border:1px solid rgba(99,102,241,.2)}
.pill-dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;transition:all .15s;cursor:pointer;border:none;}
.btn-primary{background:var(--indigo);color:#fff}
.btn-primary:hover{background:var(--indigo2);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{background:rgba(255,255,255,.05);color:var(--text);border-color:var(--border2)}
[data-theme=light] .btn-ghost:hover{background:rgba(0,0,0,.05)}
.btn-danger{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
.btn-danger:hover{background:rgba(239,68,68,.2)}
.btn-success{background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.2)}
.btn-success:hover{background:rgba(16,185,129,.22)}
.btn-sm{padding:4px 10px;font-size:11px;gap:4px}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.btn .spinner{display:none;width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
.btn.loading .spinner{display:inline-block}
.btn.loading .btn-label{display:none}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Forms / inputs ── */
.form-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
.form-group{display:flex;flex-direction:column;gap:5px;flex:1;min-width:120px}
.form-group label{font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase;letter-spacing:.06em}
input[type=text],input[type=password],input[type=number],select{
  background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:8px;
  color:var(--text);padding:7px 12px;font-size:13px;width:100%;transition:border-color .15s;
}
[data-theme=light] input[type=text],[data-theme=light] input[type=password],[data-theme=light] input[type=number],[data-theme=light] select{background:rgba(0,0,0,.05)}
input:focus,select:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(99,102,241,.1)}
input::placeholder{color:var(--text3)}
.inline-form{background:rgba(0,0,0,.25);border-top:1px solid var(--border);padding:14px 18px;display:none}
[data-theme=light] .inline-form{background:rgba(0,0,0,.03)}
.inline-form.open{display:block}
.pass-wrap{position:relative}
.pass-wrap input{padding-right:36px}
.pass-toggle{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0;line-height:1}
.pass-toggle:hover{color:var(--text)}

/* ── Quick dial panel ── */
.quick-dial-panel{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;margin-bottom:20px}
.quick-dial-panel h3{font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.quick-dial-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}

/* ── Resource bars ── */
.res-bar-wrap{margin-bottom:8px}
.res-bar-label{display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px}
.res-bar-track{height:6px;background:rgba(255,255,255,.06);border-radius:9999px;overflow:hidden}
[data-theme=light] .res-bar-track{background:rgba(0,0,0,.08)}
.res-bar-fill{height:100%;border-radius:9999px;transition:width .6s ease}
.res-bar-fill.bar-green{background:var(--green)}
.res-bar-fill.bar-yellow{background:var(--yellow)}
.res-bar-fill.bar-red{background:var(--red)}

/* ── Metrics panel ── */
.metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.metric-item{padding:12px 18px;border-bottom:1px solid var(--border)}
.metric-item:nth-child(odd){border-right:1px solid var(--border)}
.metric-item:nth-last-child(-n+2){border-bottom:none}
.metric-label{font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.metric-value{font-size:14px;font-weight:600;color:var(--text);font-family:'SF Mono','Cascadia Code',monospace}

/* ── Log styles ── */
.log-toolbar{display:flex;gap:8px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.log-filter-btn{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:transparent;border:1px solid var(--border);color:var(--text3);cursor:pointer;transition:all .15s}
.log-filter-btn.active{border-color:var(--indigo);color:var(--indigo2);background:rgba(99,102,241,.1)}
.log-search{background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:5px 10px;font-size:12px;width:180px}
[data-theme=light] .log-search{background:rgba(0,0,0,.05)}
.log-search:focus{border-color:var(--indigo)}
.log-box{background:#050810;padding:10px 0;height:400px;overflow-y:auto;font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;font-size:11px;line-height:1.7}
[data-theme=light] .log-box{background:#f8fafc}
.log-line{display:flex;gap:10px;padding:1px 16px;border-left:3px solid transparent}
.log-line:hover{background:rgba(255,255,255,.02)}
[data-theme=light] .log-line:hover{background:rgba(0,0,0,.03)}
.log-line.level-WARN{border-left-color:rgba(245,158,11,.4)}
.log-line.level-ERROR{border-left-color:rgba(239,68,68,.5);background:rgba(239,68,68,.03)}
.log-line.has-call{border-left-color:rgba(99,102,241,.35)}
.log-ts{color:var(--text3);flex-shrink:0;font-size:10px;padding-top:1px}
.log-lvl{flex-shrink:0;font-size:10px;font-weight:700;width:38px;text-align:center;padding:1px 4px;border-radius:3px}
.lvl-INFO{background:rgba(75,85,99,.3);color:var(--text2)}
.lvl-WARN{background:rgba(245,158,11,.2);color:#fbbf24}
.lvl-ERROR{background:rgba(239,68,68,.2);color:#f87171}
.log-msg{color:#c9d1d9;word-break:break-all}
[data-theme=light] .log-msg{color:#334155}

/* ── Terminal ── */
.terminal-wrap{background:#050810;border-radius:10px;overflow:hidden;border:1px solid #1a2035}
.terminal-output{
  background:#050810;height:420px;overflow-y:auto;padding:14px 16px;
  font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;font-size:12px;line-height:1.8;
}
.term-line{padding:1px 0;white-space:pre-wrap;word-break:break-all}
.term-cmd{color:#a5b4fc}
.term-ok{color:#34d399}
.term-err{color:#f87171}
.term-out{color:#9ca3af}
.term-input-row{display:flex;align-items:center;gap:0;background:#030508;border-top:1px solid #1a2035;padding:10px 14px}
.term-prompt{color:#34d399;font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;font-size:13px;white-space:nowrap;margin-right:6px;flex-shrink:0}
.term-input{
  flex:1;background:transparent;border:none;outline:none;
  color:#e2e8f0;font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;
  font-size:13px;caret-color:#34d399;
}
.term-spinner{display:none;width:14px;height:14px;border:2px solid rgba(52,211,153,.2);border-top-color:#34d399;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;margin-left:8px}
.term-spinner.active{display:block}
.terminal-presets{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;background:rgba(0,0,0,.3);border-bottom:1px solid #1a2035}
.preset-btn{padding:4px 12px;border-radius:6px;font-size:11px;font-weight:500;background:rgba(99,102,241,.1);color:#a5b4fc;border:1px solid rgba(99,102,241,.2);cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif}
.preset-btn:hover{background:rgba(99,102,241,.2);transform:translateY(-1px)}

/* ── Page transitions ── */
.page{display:none;animation:fadeIn .2s ease}
.page.active{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

/* ── Provider health cards ── */
.provider-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px}
.provider-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:6px;}
.provider-card .provider-name{font-size:12px;font-weight:600;color:var(--text2)}
.provider-card .provider-url{font-size:10px;color:var(--text3);word-break:break-all;margin-top:2px}

/* ── Activity feed ── */
.activity-feed{padding:4px 0}
.activity-item{display:flex;gap:12px;align-items:flex-start;padding:10px 18px;border-bottom:1px solid var(--border)}
.activity-item:last-child{border-bottom:none}
.activity-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;margin-top:1px}
.activity-body{flex:1;min-width:0}
.activity-msg{font-size:12px;color:var(--text);line-height:1.4;word-break:break-word}
.activity-time{font-size:10px;color:var(--text3);margin-top:3px}

/* ── DDI routing ── */
.ddi-arrow{color:var(--text3);font-size:12px}

/* ── Settings ── */
.setting-row{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border)}
.setting-row:last-child{border-bottom:none}
.setting-label{font-size:13px;font-weight:500;color:var(--text);min-width:180px}
.setting-value{font-size:12px;color:var(--text2);font-family:'SF Mono','Cascadia Code',monospace}

/* ── Toast notifications ── */
#toast-container{position:fixed;top:68px;right:18px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.toast{
  pointer-events:all;min-width:280px;max-width:380px;
  background:var(--card);border:1px solid var(--border);border-radius:12px;
  padding:12px 16px;display:flex;align-items:flex-start;gap:10px;
  box-shadow:0 8px 24px rgba(0,0,0,.4);
  animation:toastIn .3s cubic-bezier(.34,1.56,.64,1);
}
.toast.removing{animation:toastOut .25s ease forwards}
@keyframes toastIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:none}}
@keyframes toastOut{from{opacity:1;transform:none}to{opacity:0;transform:translateX(110%)}}
.toast-icon{font-size:16px;flex-shrink:0;margin-top:1px}
.toast-body{flex:1;min-width:0}
.toast-msg{font-size:13px;color:var(--text);font-weight:500;line-height:1.4}
.toast-time{font-size:10px;color:var(--text3);margin-top:2px}
.toast-close{background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0;flex-shrink:0;line-height:1}
.toast-close:hover{color:var(--text)}
.toast-success{border-left:3px solid var(--green)}
.toast-warning{border-left:3px solid var(--yellow)}
.toast-error{border-left:3px solid var(--red)}
.toast-info{border-left:3px solid var(--indigo)}

/* ── Keyboard shortcuts modal ── */
#shortcuts-modal{
  display:none;position:fixed;inset:0;z-index:10000;
  background:rgba(0,0,0,.7);backdrop-filter:blur(4px);
  align-items:center;justify-content:center;
}
#shortcuts-modal.open{display:flex}
.shortcuts-box{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px 32px;min-width:360px;max-width:500px;width:90%}
.shortcuts-box h2{font-size:16px;font-weight:700;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.shortcut-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}
.shortcut-row:last-child{border-bottom:none}
.shortcut-key{background:rgba(255,255,255,.08);border:1px solid var(--border2);border-radius:6px;padding:3px 9px;font-size:12px;font-family:monospace;font-weight:600;color:var(--text);white-space:nowrap}
[data-theme=light] .shortcut-key{background:rgba(0,0,0,.08)}
.shortcut-desc{font-size:13px;color:var(--text2)}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:9999px}
::-webkit-scrollbar-thumb:hover{background:#6b7280}

/* ── Loading shimmer ── */
@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
.shimmer{background:linear-gradient(90deg,var(--border) 25%,var(--border2) 50%,var(--border) 75%);background-size:800px 100%;animation:shimmer 1.6s infinite}

/* ── Misc ── */
.flex-center{display:flex;align-items:center;justify-content:center}
.gap-8{gap:8px}.ml-auto{margin-left:auto}.text-muted{color:var(--text2)}
.text-mono{font-family:'SF Mono','Cascadia Code','Fira Mono',monospace;font-size:12px}
.hidden{display:none!important}
.streaming-dot{width:8px;height:8px;border-radius:50%;background:var(--blue);display:inline-block;animation:pulse 1.2s infinite;margin-right:4px;vertical-align:middle}
.tenant-select{background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:8px;color:var(--text2);padding:4px 10px;font-size:12px;cursor:pointer}
[data-theme=light] .tenant-select{background:rgba(0,0,0,.05)}
.sse-badge{cursor:default;transition:all .3s}
</style>
</head>
<body>

<!-- ── Toast container ─────────────────────────────────────────────────────── -->
<div id="toast-container"></div>

<!-- ── Shortcuts modal ────────────────────────────────────────────────────── -->
<div id="shortcuts-modal">
  <div class="shortcuts-box">
    <h2>Keyboard Shortcuts <button class="btn btn-ghost btn-sm" onclick="document.getElementById('shortcuts-modal').classList.remove('open')">&#x2715;</button></h2>
    <div class="shortcut-row"><kbd class="shortcut-key">1 &ndash; 7</kbd><span class="shortcut-desc">Navigate to page 1&ndash;7</span></div>
    <div class="shortcut-row"><kbd class="shortcut-key">/</kbd><span class="shortcut-desc">Focus log search</span></div>
    <div class="shortcut-row"><kbd class="shortcut-key">d</kbd><span class="shortcut-desc">Focus quick dial input</span></div>
    <div class="shortcut-row"><kbd class="shortcut-key">?</kbd><span class="shortcut-desc">Toggle this shortcuts modal</span></div>
    <div class="shortcut-row"><kbd class="shortcut-key">Esc</kbd><span class="shortcut-desc">Close modal / blur input</span></div>
  </div>
</div>

<!-- ── Top header ─────────────────────────────────────────────────────────── -->
<header id="topbar">
  <div class="brand">
    <div class="logo">&#9889;</div>
    <span>VoiceFlow Bridge</span>
    <span style="color:var(--text3);font-weight:400;font-size:12px">v3.0</span>
  </div>
  <div class="topbar-badges">
    <span id="hAri" class="badge badge-red"><span class="dot-pulse"></span>ARI Disconnected</span>
    <span id="hCalls" class="badge badge-gray">0 calls</span>
    <span id="hExts"  class="badge badge-gray">0/0 ext</span>
    <span id="sseBadge" class="badge badge-gray sse-badge" title="SSE latency">SSE: &mdash;</span>
    <button class="btn btn-ghost btn-sm" id="themeToggle" onclick="toggleTheme()" title="Toggle theme">&#9728;</button>
    <span class="badge badge-indigo">&#9889; Admin</span>
  </div>
</header>

<!-- ── App shell ──────────────────────────────────────────────────────────── -->
<div id="app">

  <!-- Sidebar -->
  <nav id="sidebar">
    <div class="nav-item active" data-nav="overview">
      <span class="nav-icon">&#128202;</span><span class="nav-label">Overview</span>
    </div>
    <div class="nav-item" data-nav="infrastructure">
      <span class="nav-icon">&#127959;</span><span class="nav-label">Infrastructure</span>
    </div>
    <div class="nav-item" data-nav="calls">
      <span class="nav-icon">&#128222;</span><span class="nav-label">Live Calls</span>
    </div>
    <div class="nav-item" data-nav="routing">
      <span class="nav-icon">&#8599;</span><span class="nav-label">Routing</span>
    </div>
    <div class="nav-item" data-nav="logs">
      <span class="nav-icon">&#128203;</span><span class="nav-label">Logs</span>
    </div>
    <div class="nav-item" data-nav="terminal">
      <span class="nav-icon">&#128187;</span><span class="nav-label">Terminal</span>
    </div>
    <div class="nav-spacer"></div>
    <div class="nav-item" data-nav="settings">
      <span class="nav-icon">&#9881;&#65039;</span><span class="nav-label">Settings</span>
    </div>
  </nav>

  <!-- Main content -->
  <main id="main">

    <!-- ═══════════════════════════════════════════════════ Page: Overview -->
    <div class="page active" data-page="overview">
      <div class="stats-row">
        <div class="stat-card">
          <div class="label">Active Calls</div>
          <div class="value" id="ovCalls">&#8212;</div>
          <div class="sub">right now</div>
          <div class="icon">&#128222;</div>
        </div>
        <div class="stat-card">
          <div class="label">Trunks Online</div>
          <div class="value" id="ovTrunks">&#8212;</div>
          <div class="sub" id="ovTrunkSub">&#8212;</div>
          <div class="icon">&#128279;</div>
        </div>
        <div class="stat-card">
          <div class="label">Ext Registered</div>
          <div class="value" id="ovExts">&#8212;</div>
          <div class="sub" id="ovExtSub">&#8212;</div>
          <div class="icon">&#127911;</div>
        </div>
        <div class="stat-card">
          <div class="label">ARI Channels</div>
          <div class="value" id="ovChannels">&#8212;</div>
          <div class="sub">live in Asterisk</div>
          <div class="icon">&#128225;</div>
        </div>
        <div class="stat-card">
          <div class="label">Bridges</div>
          <div class="value" id="ovBridges">&#8212;</div>
          <div class="sub">mixing bridges</div>
          <div class="icon">&#127751;</div>
        </div>
        <div class="stat-card">
          <div class="label">Process Uptime</div>
          <div class="value" id="ovUptime" style="font-size:18px">&#8212;</div>
          <div class="sub">server uptime</div>
          <div class="icon">&#9203;</div>
        </div>
      </div>

      <!-- Sparklines -->
      <div class="sparkline-row">
        <div class="sparkline-card">
          <div class="sparkline-title">&#128202; Call Volume (last 60 ticks)</div>
          <canvas id="sparkCalls" width="560" height="60"></canvas>
        </div>
        <div class="sparkline-card">
          <div class="sparkline-title">&#127911; Extensions Online (last 60 ticks)</div>
          <canvas id="sparkExts" width="560" height="60"></canvas>
        </div>
      </div>

      <!-- System resources -->
      <div class="panel" style="margin-bottom:20px">
        <div class="panel-header"><span>&#128297;</span><h3>System Resources</h3></div>
        <div style="padding:16px 20px">
          <div class="res-bar-wrap">
            <div class="res-bar-label"><span>Memory Usage</span><span id="resMemPct">&#8212;</span></div>
            <div class="res-bar-track"><div class="res-bar-fill bar-green" id="resMemBar" style="width:0%"></div></div>
          </div>
          <div style="display:flex;gap:24px;margin-top:12px;flex-wrap:wrap">
            <div style="font-size:12px;color:var(--text2)">Load Avg: <span id="resLoad" style="color:var(--text)">&#8212;</span></div>
            <div style="font-size:12px;color:var(--text2)">RSS: <span id="resRss" style="color:var(--text)">&#8212;</span></div>
            <div style="font-size:12px;color:var(--text2)">Heap: <span id="resHeap" style="color:var(--text)">&#8212;</span></div>
          </div>
        </div>
      </div>

      <div class="provider-grid">
        <div class="provider-card">
          <div class="provider-name">SIP Bridge</div>
          <span id="pvBridge" class="badge badge-gray" style="width:fit-content">Unknown</span>
          <div class="provider-url" id="pvBridgeUrl">localhost</div>
        </div>
        <div class="provider-card">
          <div class="provider-name">Firebase Functions</div>
          <span class="badge badge-gray" style="width:fit-content">External</span>
          <div class="provider-url" id="pvFirebase">&#8212;</div>
        </div>
        <div class="provider-card">
          <div class="provider-name">Cloud Run (AI)</div>
          <span class="badge badge-gray" style="width:fit-content">External</span>
          <div class="provider-url" id="pvCloudRun">&#8212;</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><span>&#128240;</span><h3>Recent Activity</h3></div>
        <div class="activity-feed" id="activityFeed">
          <div class="activity-item">
            <div class="activity-icon" style="background:rgba(75,85,99,.2)">&#8987;</div>
            <div class="activity-body">
              <div class="activity-msg" style="color:var(--text3)">Waiting for events&hellip;</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════ Page: Infrastructure -->
    <div class="page" data-page="infrastructure">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-size:12px;color:var(--text2)">Tenant:</span>
        <select class="tenant-select" id="tenantFilter">
          <option value="">All Tenants</option>
        </select>
        <!-- MULTI-TENANT: filter by req.headers['x-tenant-id'] when implemented -->
      </div>

      <div class="grid-3">

        <!-- SIP Trunks -->
        <div class="panel">
          <div class="panel-header">
            <span>&#128279;</span>
            <h3>SIP Trunks</h3>
            <span class="count ml-auto" id="trunkCount">0</span>
            <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="toggleForm('trunkForm')">
              <span class="btn-label">&#65291; Add</span>
            </button>
          </div>
          <div class="inline-form" id="trunkForm">
            <div class="form-row">
              <div class="form-group">
                <label>Name</label>
                <input type="text" id="tf_name" placeholder="e.g. provider1">
              </div>
              <div class="form-group">
                <label>IP Address</label>
                <input type="text" id="tf_ip" placeholder="1.2.3.4">
              </div>
              <div class="form-group" style="max-width:140px">
                <label>Context</label>
                <input type="text" id="tf_ctx" placeholder="from-operator" value="from-operator">
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" id="btnAddTrunk" onclick="addTrunk()">
                <span class="spinner"></span><span class="btn-label">Add Trunk</span>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="toggleForm('trunkForm')">Cancel</button>
            </div>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>IP</th><th>State</th><th>Ch</th><th></th></tr></thead>
              <tbody id="trunkTable">
                <tr><td colspan="5"><div class="empty-state"><div class="empty-icon">&#128279;</div><p>No trunks</p></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- SIP Extensions -->
        <div class="panel">
          <div class="panel-header">
            <span>&#127911;</span>
            <h3>Extensions</h3>
            <span class="count ml-auto" id="extCount">0</span>
            <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="toggleForm('extForm')">
              <span class="btn-label">&#65291; Add</span>
            </button>
          </div>
          <div class="inline-form" id="extForm">
            <div class="form-row">
              <div class="form-group" style="max-width:100px">
                <label>Number</label>
                <input type="number" id="ef_num" placeholder="103" min="100" max="999">
              </div>
              <div class="form-group">
                <label>Password</label>
                <div class="pass-wrap">
                  <input type="password" id="ef_pass" placeholder="secure password">
                  <button class="pass-toggle" onclick="togglePass('ef_pass',this)">&#128065;</button>
                </div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" id="btnAddExt" onclick="addExtension()">
                <span class="spinner"></span><span class="btn-label">Add Extension</span>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="toggleForm('extForm')">Cancel</button>
            </div>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Ext</th><th>Status</th><th>Pass</th><th>Ch</th><th>Actions</th></tr></thead>
              <tbody id="extTable">
                <tr><td colspan="5"><div class="empty-state"><div class="empty-icon">&#127911;</div><p>No extensions</p></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ARI Channels -->
        <div class="panel">
          <div class="panel-header">
            <span>&#128225;</span>
            <h3>ARI Channels</h3>
            <span class="count ml-auto" id="chCount">0</span>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Channel</th><th>State</th><th>Route</th><th>Age</th></tr></thead>
              <tbody id="chTable">
                <tr><td colspan="4"><div class="empty-state"><div class="empty-icon">&#128225;</div><p>No channels</p></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════ Page: Live Calls -->
    <div class="page" data-page="calls">
      <!-- Quick Dial -->
      <div class="quick-dial-panel">
        <h3>&#9742; Quick Dial</h3>
        <div class="quick-dial-row">
          <div class="form-group" style="max-width:220px">
            <label>To (phone number)</label>
            <input type="text" id="dialTo" placeholder="+441234567890" autocomplete="off">
          </div>
          <div class="form-group" style="max-width:140px">
            <label>From (extension)</label>
            <select id="dialFrom">
              <option value="">Select ext&hellip;</option>
            </select>
          </div>
          <div style="padding-bottom:1px">
            <button class="btn btn-primary" id="btnDial" onclick="quickDial()">
              <span class="spinner"></span><span class="btn-label">&#9742; Call</span>
            </button>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-size:12px;color:var(--text2)">Tenant:</span>
        <select class="tenant-select" id="tenantFilterCalls">
          <option value="">All Tenants</option>
        </select>
        <!-- MULTI-TENANT: filter by req.headers['x-tenant-id'] when implemented -->
        <span id="liveBadge" class="badge badge-blue ml-auto"><span class="dot-pulse"></span>Live</span>
      </div>
      <div class="panel">
        <div class="panel-header">
          <span>&#128222;</span>
          <h3>Live Calls</h3>
          <span class="count ml-auto" id="callCount">0</span>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Call SID</th><th>From</th><th>To</th><th>Dir</th>
                <th>Provider</th><th>Status</th><th>Stream</th><th>Duration</th><th>Actions</th>
              </tr>
            </thead>
            <tbody id="callTable">
              <tr><td colspan="9">
                <div class="empty-state">
                  <div class="empty-icon">&#128245;</div>
                  <p>No active calls</p>
                </div>
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════ Page: Routing DDI -->
    <div class="page" data-page="routing">
      <div class="panel">
        <div class="panel-header">
          <span>&#8599;</span>
          <h3>DDI Routing Rules</h3>
          <span class="count ml-auto" id="ddiCount">0</span>
          <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="toggleForm('ddiForm')">
            <span class="btn-label">&#65291; Add Rule</span>
          </button>
        </div>
        <div class="inline-form" id="ddiForm">
          <div class="form-row">
            <div class="form-group" style="max-width:160px">
              <label>DDI Number</label>
              <input type="text" id="df_ddi" placeholder="+441234567890">
            </div>
            <div class="form-group">
              <label>Target</label>
              <select id="df_target_type" onchange="ddiTargetTypeChanged(this.value)" style="margin-bottom:6px">
                <option value="ext">Extension (PJSIP/NNN)</option>
                <option value="ai">AI Assistant (Stasis)</option>
                <option value="custom">Custom</option>
              </select>
              <input type="text" id="df_target" placeholder="e.g. 101 or PJSIP/101">
            </div>
            <div class="form-group">
              <label>Label</label>
              <input type="text" id="df_label" placeholder="e.g. Sales line">
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary btn-sm" id="btnAddDdi" onclick="addDDIRule()">
              <span class="spinner"></span><span class="btn-label">Add Rule</span>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="toggleForm('ddiForm')">Cancel</button>
          </div>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>DDI Number</th><th></th><th>Target</th><th>Label</th><th>Actions</th></tr></thead>
            <tbody id="ddiTable">
              <tr><td colspan="5"><div class="empty-state"><div class="empty-icon">&#8599;</div><p>No routing rules</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ Page: Logs -->
    <div class="page" data-page="logs">
      <div class="panel">
        <div class="panel-header"><span>&#128203;</span><h3>System Logs</h3></div>
        <div class="log-toolbar">
          <button class="log-filter-btn active" data-level="ALL"   onclick="setLogLevel('ALL',this)">ALL</button>
          <button class="log-filter-btn"         data-level="INFO"  onclick="setLogLevel('INFO',this)">INFO</button>
          <button class="log-filter-btn"         data-level="WARN"  onclick="setLogLevel('WARN',this)">WARN</button>
          <button class="log-filter-btn"         data-level="ERROR" onclick="setLogLevel('ERROR',this)">ERROR</button>
          <input class="log-search" type="text" id="logSearch" placeholder="Search logs&hellip;" oninput="renderLogs()">
          <select class="tenant-select" id="logCallFilter" onchange="renderLogs()" style="font-size:11px">
            <option value="">All calls</option>
          </select>
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);cursor:pointer">
            <input type="checkbox" id="autoScroll" checked style="accent-color:var(--indigo)">
            Auto-scroll
          </label>
          <button class="btn btn-ghost btn-sm ml-auto" onclick="exportLogsCsv()" title="Export CSV">&#128190; CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="clearLogs()">Clear</button>
        </div>
        <div class="log-box" id="logBox"></div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════ Page: Terminal -->
    <div class="page" data-page="terminal">
      <div class="panel">
        <div class="panel-header"><span>&#128187;</span><h3>Asterisk CLI Terminal</h3><span class="badge badge-indigo ml-auto">AMI / ARI</span></div>
        <div class="terminal-presets">
          <button class="preset-btn" onclick="runCliCommand('pjsip show endpoints')">Show Endpoints</button>
          <button class="preset-btn" onclick="runCliCommand('core show channels')">Show Channels</button>
          <button class="preset-btn" onclick="runCliCommand('pjsip show registrations')">PJSIP Status</button>
          <button class="preset-btn" onclick="runCliCommand('core show version')">Show Version</button>
          <button class="preset-btn" onclick="runCliCommand('core show uptime')">Core Status</button>
          <button class="preset-btn" onclick="runCliCommand('module reload')">Reload</button>
          <button class="preset-btn" onclick="runCliCommand('pjsip show contacts')">Show Contacts</button>
          <button class="preset-btn" onclick="runCliCommand('bridge show all')">Show Bridges</button>
        </div>
        <div class="terminal-wrap">
          <div class="terminal-output" id="termOutput">
            <div class="term-line term-ok">&gt; VoiceFlow Asterisk CLI Terminal ready. Type a command below or use the presets above.</div>
          </div>
          <div class="term-input-row">
            <span class="term-prompt">AST&gt;</span>
            <input class="term-input" id="termInput" type="text" placeholder="Enter Asterisk CLI command&hellip;" autocomplete="off" autocorrect="off" spellcheck="false">
            <div class="term-spinner" id="termSpinner"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════ Page: Settings -->
    <div class="page" data-page="settings">
      <div class="grid-2">

        <div class="panel">
          <div class="panel-header"><span>&#9881;&#65039;</span><h3>Bridge Configuration</h3></div>
          <div id="envVars">
            <div class="setting-row" style="color:var(--text3);font-size:12px;justify-content:center">Loading&hellip;</div>
          </div>
        </div>

        <!-- Live System Metrics -->
        <div class="panel">
          <div class="panel-header"><span>&#128200;</span><h3>Live System Metrics</h3><span class="badge badge-blue ml-auto" style="font-size:9px">via SSE</span></div>
          <div class="metrics-grid">
            <div class="metric-item">
              <div class="metric-label">Process Uptime</div>
              <div class="metric-value" id="mUptime">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">PID</div>
              <div class="metric-value" id="mPid">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">RSS Memory</div>
              <div class="metric-value" id="mRss">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">Heap Used / Total</div>
              <div class="metric-value" id="mHeap">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">OS Free Memory</div>
              <div class="metric-value" id="mOsFree">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">OS Total Memory</div>
              <div class="metric-value" id="mOsTotal">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">Load Average</div>
              <div class="metric-value" id="mLoad">&#8212;</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">Node.js Version</div>
              <div class="metric-value" id="mNode">&#8212;</div>
            </div>
          </div>
          <div class="panel-footer" style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="loadSettingsPage()">&#8635; Refresh</button>
          </div>
        </div>

        <div class="panel" style="grid-column:1/-1">
          <div class="panel-header"><span>&#128274;</span><h3>Security</h3></div>
          <div class="setting-row">
            <div class="setting-label">Bridge Secret</div>
            <div class="setting-value"><span id="secretStatus">&#8212;</span></div>
          </div>
          <div class="setting-row">
            <div class="setting-label">Auth Required</div>
            <div class="setting-value" id="authRequired">&#8212;</div>
          </div>
          <div class="setting-row">
            <div class="setting-label">Theme</div>
            <div class="setting-value">
              <button class="btn btn-ghost btn-sm" onclick="toggleTheme()" id="themeLabel">Dark Mode Active</button>
            </div>
          </div>
        </div>

      </div>
    </div>

  </main>
</div>

<script>
// ── Globals ──────────────────────────────────────────────────────────────────
const SECRET = (() => {
  if (window.__BRIDGE_SECRET) return window.__BRIDGE_SECRET;
  let s = sessionStorage.getItem('bridge_secret');
  if (!s) {
    s = prompt('Enter Bridge Secret (leave blank if none):') || '';
    sessionStorage.setItem('bridge_secret', s);
  }
  return s;
})();

let _state       = null;
let _logLevel    = 'ALL';
let _allLogs     = [];
let _callSids    = new Set();
let _ddiRules    = [];
let _trunkConfig = [];
let _extConfig   = [];
const _TICK      = Date.now();

// History for sparklines
const _history = { calls: [], exts: [] };
// Toast diffing
let _prevCallList  = [];
let _prevExtStates = {};
// Terminal
let _cmdHistory    = [];
let _cmdHistoryIdx = -1;
// Live call timers
const _callTimers  = {};
// SSE latency
let _lastTs = null;

// ── Theme ────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('vf_theme', isDark ? 'light' : 'dark');
  const lbl = document.getElementById('themeLabel');
  if (lbl) lbl.textContent = isDark ? 'Light Mode Active' : 'Dark Mode Active';
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = isDark ? '🌙' : '☀';
}
// Apply saved theme
(function() {
  const saved = localStorage.getItem('vf_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const lbl = document.getElementById('themeLabel');
  const btn = document.getElementById('themeToggle');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (lbl) lbl.textContent = isDark ? 'Dark Mode Active' : 'Light Mode Active';
  if (btn) btn.textContent = isDark ? '☀' : '🌙';
})();

// ── Navigation ───────────────────────────────────────────────────────────────
function navTo(name) {
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(p => p.classList.remove('active'));
  const navEl = document.querySelector('[data-nav="' + name + '"]');
  const pageEl = document.querySelector('[data-page="' + name + '"]');
  if (navEl) navEl.classList.add('active');
  if (pageEl) pageEl.classList.add('active');
  if (name === 'settings')      loadSettingsPage();
  if (name === 'infrastructure') loadInfraConfig();
  if (name === 'terminal') setTimeout(() => { const ti = document.getElementById('termInput'); if (ti) ti.focus(); }, 80);
}

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => navTo(el.dataset.nav));
});

// Load infra config on first paint
setTimeout(loadInfraConfig, 500);

// ── Keyboard shortcuts ───────────────────────────────────────────────────────
const _navPages = ['overview','infrastructure','calls','routing','logs','terminal','settings'];
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toUpperCase();
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (e.key === 'Escape') {
    document.getElementById('shortcuts-modal').classList.remove('open');
    if (inInput) e.target.blur();
    return;
  }
  if (e.key === '?' && !inInput) {
    document.getElementById('shortcuts-modal').classList.toggle('open');
    return;
  }
  if (inInput) return;
  if (e.key >= '1' && e.key <= '7') {
    navTo(_navPages[parseInt(e.key) - 1]);
    return;
  }
  if (e.key === '/') {
    e.preventDefault();
    navTo('logs');
    setTimeout(() => { const ls = document.getElementById('logSearch'); if (ls) ls.focus(); }, 80);
    return;
  }
  if (e.key === 'd') {
    navTo('calls');
    setTimeout(() => { const dt = document.getElementById('dialTo'); if (dt) dt.focus(); }, 80);
    return;
  }
});

// ── SSE ───────────────────────────────────────────────────────────────────────
const es = new EventSource('/dashboard/events');
es.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.type === 'config') {
    document.getElementById('pvFirebase').textContent = d.firebaseUrl || '—';
    document.getElementById('pvCloudRun').textContent = d.cloudRunUrl || '—';
    return;
  }
  if (d.type !== 'state') return;

  // SSE latency
  if (d.ts) {
    const now = Date.now();
    const latMs = now - d.ts;
    _lastTs = now;
    const latSec = (latMs / 1000).toFixed(1);
    const sseBadge = document.getElementById('sseBadge');
    if (sseBadge) {
      sseBadge.textContent = 'SSE: ' + latSec + 's';
      sseBadge.className = 'badge sse-badge ' + (latMs < 3000 ? 'badge-green' : latMs < 6000 ? 'badge-yellow' : 'badge-red');
    }
  }

  _state = d;
  if (d.ddiRules) _ddiRules = d.ddiRules;
  if (d.logTraces) {
    _allLogs = d.logTraces;
    for (const l of _allLogs) { if (l.callSid) _callSids.add(l.callSid); }
  }
  updateAll(d);
};
es.onerror = () => {
  document.getElementById('hAri').className = 'badge badge-red';
  document.getElementById('hAri').innerHTML = '<span class="dot-pulse"></span>SSE Error';
  const sseBadge = document.getElementById('sseBadge');
  if (sseBadge) { sseBadge.textContent = 'SSE: ERR'; sseBadge.className = 'badge sse-badge badge-red'; }
  showToast('🔴 SSE connection lost', 'error');
};

// ── Master update ─────────────────────────────────────────────────────────────
function updateAll(d) {
  const ss      = d.sipStatus;
  const trunks  = ss ? ss.endpoints.filter(ep => ep.kind === 'trunk')     : [];
  const exts    = ss ? ss.endpoints.filter(ep => ep.kind === 'extension') : [];
  const chs     = ss ? ss.channels  : [];
  const brs     = ss ? ss.bridges   : [];
  const online  = d.ariConnected;
  const regExts = exts.filter(ep => ep.state==='online'||ep.state==='available').length;
  const trOnline = trunks.filter(t => t.state==='online'||t.state==='available').length;

  // ── Toast diffing ──
  // ARI state
  if (_state && typeof _prevAriConnected !== 'undefined') {
    if (!_prevAriConnected && online) showToast('🟢 ARI connected', 'success');
    if (_prevAriConnected && !online)  showToast('🔴 ARI disconnected', 'error');
  }
  window._prevAriConnected = online;

  // New / ended calls
  const prevCallSids = new Set(_prevCallList.map(c => c.callSid));
  const curCallList  = d.callList || [];
  for (const c of curCallList) {
    if (!prevCallSids.has(c.callSid)) showToast('📞 Incoming call from ' + (c.from || 'unknown'), 'info');
  }
  const curCallSids = new Set(curCallList.map(c => c.callSid));
  for (const c of _prevCallList) {
    if (!curCallSids.has(c.callSid)) showToast('📵 Call ' + c.callSid.slice(0,14) + '… completed', 'warning');
  }
  _prevCallList = curCallList.slice();

  // Extension state changes
  for (const ep of exts) {
    const prev = _prevExtStates[ep.resource];
    const cur  = ep.state;
    if (prev !== undefined && prev !== cur) {
      const isOnline = cur === 'online' || cur === 'available';
      if (isOnline && !( prev === 'online' || prev === 'available'))
        showToast('✅ Extension ' + ep.resource + ' registered', 'success');
      else if (!isOnline && (prev === 'online' || prev === 'available'))
        showToast('⚠️ Extension ' + ep.resource + ' unregistered', 'warning');
    }
    _prevExtStates[ep.resource] = cur;
  }

  // ── Sparkline history ──
  _history.calls.push(d.activeCalls || 0);
  _history.exts.push(regExts);
  if (_history.calls.length > 60) _history.calls.shift();
  if (_history.exts.length  > 60) _history.exts.shift();
  requestAnimationFrame(() => {
    drawSparkline('sparkCalls', _history.calls, '#6366f1', 'rgba(99,102,241,.15)');
    drawSparkline('sparkExts',  _history.exts,  '#10b981', 'rgba(16,185,129,.15)');
  });

  // ── Header ──
  const ariBadge = document.getElementById('hAri');
  ariBadge.className = 'badge ' + (online ? 'badge-green' : 'badge-red');
  ariBadge.innerHTML = '<span class="dot-pulse"></span>' + (online ? 'ARI Connected' : 'ARI Disconnected');
  setText('hCalls', d.activeCalls + ' call' + (d.activeCalls !== 1 ? 's' : ''));
  setText('hExts', regExts + '/' + exts.length + ' ext');
  document.getElementById('hExts').className = 'badge ' + (regExts > 0 ? 'badge-purple' : 'badge-gray');

  // ── Overview stats (with animated counters) ──
  animateCounter(document.getElementById('ovCalls'),    d.activeCalls ?? 0);
  animateCounter(document.getElementById('ovTrunks'),   trOnline);
  animateCounter(document.getElementById('ovExts'),     regExts);
  animateCounter(document.getElementById('ovChannels'), chs.length);
  animateCounter(document.getElementById('ovBridges'),  brs.length);
  setText('ovTrunkSub', trunks.length + ' total');
  setText('ovExtSub',   exts.length   + ' total');

  // Uptime
  if (d.metrics) {
    const upS = Math.floor(d.metrics.uptime);
    const hh = String(Math.floor(upS/3600)).padStart(2,'0');
    const mm = String(Math.floor((upS%3600)/60)).padStart(2,'0');
    const ss2 = String(upS%60).padStart(2,'0');
    setText('ovUptime', hh + ':' + mm + ':' + ss2);

    // Resource bars
    const used  = d.metrics.totalMemMB - d.metrics.freeMemMB;
    const pct   = d.metrics.totalMemMB > 0 ? Math.round(used / d.metrics.totalMemMB * 100) : 0;
    setText('resMemPct', pct + '%');
    const bar = document.getElementById('resMemBar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'res-bar-fill ' + (pct < 60 ? 'bar-green' : pct < 85 ? 'bar-yellow' : 'bar-red');
    }
    setText('resLoad',  d.metrics.loadavg);
    setText('resRss',   d.metrics.rssMB + ' MB');
    setText('resHeap',  d.metrics.heapUsedMB + ' / ' + d.metrics.heapTotalMB + ' MB');

    // Metrics panel on settings page
    setText('mUptime',  hh + ':' + mm + ':' + ss2);
    setText('mRss',     d.metrics.rssMB + ' MB');
    setText('mHeap',    d.metrics.heapUsedMB + ' / ' + d.metrics.heapTotalMB + ' MB');
    setText('mOsFree',  d.metrics.freeMemMB + ' MB');
    setText('mOsTotal', d.metrics.totalMemMB + ' MB');
    setText('mLoad',    d.metrics.loadavg);
  }

  // ── Provider health ──
  const pvBr = document.getElementById('pvBridge');
  pvBr.className = 'badge ' + (online ? 'badge-green' : 'badge-red');
  pvBr.textContent = online ? 'Connected' : 'Disconnected';

  // ── Activity feed ──
  const feed = document.getElementById('activityFeed');
  const recent = _allLogs.slice(-10).reverse();
  if (recent.length) {
    feed.innerHTML = recent.map(l => {
      const ic = l.level==='ERROR'?'❌':l.level==='WARN'?'⚠️':'ℹ️';
      const bg = l.level==='ERROR'?'rgba(239,68,68,.1)':l.level==='WARN'?'rgba(245,158,11,.1)':'rgba(75,85,99,.15)';
      return '<div class="activity-item">' +
        '<div class="activity-icon" style="background:' + bg + '">' + ic + '</div>' +
        '<div class="activity-body">' +
          '<div class="activity-msg">' + esc(l.message) + '</div>' +
          '<div class="activity-time">' + fmtTs(l.ts) + '</div>' +
        '</div></div>';
    }).join('');
  }

  // ── Infrastructure ──
  updateTrunkTable(trunks);
  updateExtTable(exts);
  updateChTable(chs);

  // ── Live calls ──
  updateCallTable(d.callList || []);

  // ── DDI routing ──
  updateDdiTable(_ddiRules);

  // ── Logs ──
  renderLogs();

  // ── Log call SID dropdown ──
  const lcf = document.getElementById('logCallFilter');
  const cur = lcf.value;
  lcf.innerHTML = '<option value="">All calls</option>' +
    [..._callSids].slice(-15).map(sid =>
      '<option value="' + sid + '" ' + (sid===cur?'selected':'') + '>' + sid.slice(0,18) + '…</option>'
    ).join('');
  lcf.value = cur;

  // ── Quick dial: update From dropdown ──
  const dialFrom = document.getElementById('dialFrom');
  if (dialFrom) {
    const prev = dialFrom.value;
    dialFrom.innerHTML = '<option value="">Select ext…</option>' +
      (_extConfig.length ? _extConfig : exts.map(ep => ({ number: ep.resource }))).map(cfg =>
        '<option value="' + esc(cfg.number) + '" ' + (cfg.number==prev?'selected':'') + '>' + esc(cfg.number) + '</option>'
      ).join('');
    dialFrom.value = prev;
  }
}

// ── Sparkline drawing ─────────────────────────────────────────────────────────
function drawSparkline(canvasId, data, color, fillColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [i * w / (data.length - 1), h - (v / max) * (h - 4) - 2]);
  // Fill
  ctx.beginPath();
  ctx.moveTo(pts[0][0], h);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length-1][0], h);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  // Line
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ── Animated counters ─────────────────────────────────────────────────────────
function animateCounter(el, target) {
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const diff = target - current;
  const steps = Math.min(Math.abs(diff), 20);
  let step = 0;
  const raf = () => {
    step++;
    const val = Math.round(current + diff * (step / steps));
    el.textContent = val;
    if (step < steps) requestAnimationFrame(raf);
    else el.textContent = target;
  };
  requestAnimationFrame(raf);
}

// ── Infrastructure tables ─────────────────────────────────────────────────────
function updateTrunkTable(ariTrunks) {
  const source = _trunkConfig.length ? _trunkConfig : ariTrunks.map(ep => ({ name: ep.resource, ip: '' }));
  document.getElementById('trunkCount').textContent = source.length;
  const tbody = document.getElementById('trunkTable');
  if (!source.length) { tbody.innerHTML = emptyRow(5, '🔗', 'No trunks configured'); return; }
  const stateMap = {};
  for (const ep of ariTrunks) stateMap[ep.resource] = ep;
  tbody.innerHTML = source.map(cfg => {
    const live = stateMap[cfg.name] || {};
    const state = live.state || 'unknown';
    const chs   = (live.channelIds || []).length;
    const ipStr = cfg.ip || live.matchIp || '—';
    return '<tr><td style="font-weight:600">' + esc(cfg.name) + '</td>' +
      '<td class="td-mono" style="color:var(--text3)">' + esc(ipStr) + '</td>' +
      '<td>' + statePill(state) + '</td>' +
      '<td style="color:var(--text3)">' + chs + '</td>' +
      '<td><button class="btn btn-danger btn-sm" onclick="deleteTrunk(\'' + esc(cfg.name) + '\')">🗑</button></td></tr>';
  }).join('');
}

function updateExtTable(ariExts) {
  const source = _extConfig.length ? _extConfig : ariExts.map(ep => ({ number: ep.resource, password: '' }));
  document.getElementById('extCount').textContent = source.length;
  const tbody = document.getElementById('extTable');
  if (!source.length) { tbody.innerHTML = emptyRow(5, '🎧', 'No extensions configured'); return; }
  const stateMap = {};
  for (const ep of ariExts) stateMap[ep.resource] = ep;
  tbody.innerHTML = source.map(cfg => {
    const live  = stateMap[cfg.number] || {};
    const state = live.state || 'unknown';
    const reg   = state === 'online' || state === 'available';
    const chs   = (live.channelIds || []).length;
    const pass  = cfg.password || '';
    return '<tr>' +
      '<td style="font-weight:700;color:' + (reg?'var(--text)':'var(--text3)') + '">' + esc(cfg.number) + '</td>' +
      '<td>' + statePill(state) + '</td>' +
      '<td><span class="td-mono pass-cell" data-pass="' + esc(pass) + '" data-shown="false">••••••</span>' +
        '<button class="pass-toggle" onclick="togglePassCell(this)" style="margin-left:4px">👁</button></td>' +
      '<td style="color:var(--text3)">' + chs + '</td>' +
      '<td style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn btn-success btn-sm" onclick="testEchoCall(\'' + esc(cfg.number) + '\')" title="Test echo call">Echo</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteExtension(\'' + esc(cfg.number) + '\')">🗑</button>' +
      '</td></tr>';
  }).join('');
}

function updateChTable(chs) {
  document.getElementById('chCount').textContent = chs.length;
  const tbody = document.getElementById('chTable');
  if (!chs.length) { tbody.innerHTML = emptyRow(4, '📡', 'No active channels'); return; }
  tbody.innerHTML = chs.map(ch => {
    const chName = ch.name && ch.name.includes('/') ? ch.name.split('/').slice(0,2).join('/') : (ch.name||'?');
    const age = ch.createdAt ? Math.floor((Date.now()-new Date(ch.createdAt))/1000) : null;
    return '<tr><td class="td-mono" title="' + esc(ch.name||'') + '">' + esc(chName) + '</td>' +
      '<td>' + chanPill(ch.state) + '</td>' +
      '<td style="color:var(--text2);font-size:12px">' + esc(ch.caller||'?') + ' → ' + esc(ch.exten||'?') + '</td>' +
      '<td class="td-mono" style="color:var(--text3)">' + (age!=null?fmtDur(age):'—') + '</td></tr>';
  }).join('');
}

// ── Live calls table with ticking durations ────────────────────────────────────
function updateCallTable(calls) {
  document.getElementById('callCount').textContent = calls.length;
  const tbody = document.getElementById('callTable');

  // Clear timers for ended calls
  const activeSids = new Set(calls.map(c => c.callSid));
  for (const sid of Object.keys(_callTimers)) {
    if (!activeSids.has(sid)) { clearInterval(_callTimers[sid]); delete _callTimers[sid]; }
  }

  if (!calls.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📵</div><p>No active calls</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = calls.map(c => {
    const statusClass = c.status==='in-progress'?'pill-green':c.status==='ringing'?'pill-yellow':'pill-gray';
    const stream = c.streaming
      ? '<span class="streaming-dot"></span><span style="color:var(--blue);font-size:11px">Active</span>'
      : '<span style="color:var(--text3)">—</span>';
    const dir = c.direction==='inbound'
      ? '<span class="pill pill-indigo" style="font-size:10px">↙ In</span>'
      : '<span class="pill pill-blue" style="font-size:10px">↗ Out</span>';
    const provider = '<span class="badge badge-gray" style="font-size:10px">asterisk</span>';
    const durSecs  = Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000));
    return '<tr data-sid="' + esc(c.callSid) + '">' +
      '<td class="td-mono">' + esc(c.callSid.slice(0,16)) + '…</td>' +
      '<td style="color:var(--text2)">' + esc(c.from||'—') + '</td>' +
      '<td style="color:var(--text2)">' + esc(c.to||'—') + '</td>' +
      '<td>' + dir + '</td>' +
      '<td>' + provider + '</td>' +
      '<td><span class="pill ' + statusClass + '"><span class="pill-dot"></span>' + esc(c.status) + '</span></td>' +
      '<td>' + stream + '</td>' +
      '<td class="td-mono dur-cell" data-started="' + c.startedAt + '">' + fmtDur(durSecs) + '</td>' +
      '<td><button class="btn btn-danger btn-sm" onclick="hangupCall(\'' + esc(c.callSid) + '\')">🔴 Hangup</button></td>' +
      '</tr>';
  }).join('');

  // Start / refresh duration tickers
  for (const c of calls) {
    if (!_callTimers[c.callSid]) {
      _callTimers[c.callSid] = setInterval(() => {
        const row = tbody.querySelector('tr[data-sid="' + c.callSid + '"]');
        if (!row) { clearInterval(_callTimers[c.callSid]); delete _callTimers[c.callSid]; return; }
        const cell = row.querySelector('.dur-cell');
        if (cell) {
          const started = parseInt(cell.getAttribute('data-started')) || 0;
          cell.textContent = fmtDur(Math.max(0, Math.floor((Date.now() - started) / 1000)));
        }
      }, 1000);
    }
  }
}

// ── DDI table ─────────────────────────────────────────────────────────────────
function updateDdiTable(rules) {
  document.getElementById('ddiCount').textContent = rules.length;
  const tbody = document.getElementById('ddiTable');
  if (!rules.length) { tbody.innerHTML = emptyRow(5, '↗', 'No routing rules'); return; }
  tbody.innerHTML = rules.map(r =>
    '<tr><td class="td-mono" style="font-weight:600">' + esc(r.ddi) + '</td>' +
    '<td class="ddi-arrow">→</td>' +
    '<td class="td-mono">' + esc(r.target) + '</td>' +
    '<td style="color:var(--text2)">' + esc(r.label||'—') + '</td>' +
    '<td><button class="btn btn-danger btn-sm" onclick="deleteDDIRule(\'' + esc(r.ddi) + '\')">🗑</button></td></tr>'
  ).join('');
}

// ── Logs ──────────────────────────────────────────────────────────────────────
function setLogLevel(level, btn) {
  _logLevel = level;
  document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLogs();
}

function renderLogs() {
  const search  = (document.getElementById('logSearch')?.value || '').toLowerCase();
  const callFil = document.getElementById('logCallFilter')?.value || '';
  const box     = document.getElementById('logBox');
  const auto    = document.getElementById('autoScroll')?.checked;
  if (!box) return;

  const lines = _allLogs.filter(l => {
    if (_logLevel !== 'ALL' && l.level !== _logLevel) return false;
    if (search && !l.message.toLowerCase().includes(search)) return false;
    if (callFil && l.callSid !== callFil) return false;
    return true;
  });

  box.innerHTML = lines.map(l => {
    const callClass = l.callSid ? 'has-call' : '';
    return '<div class="log-line level-' + l.level + ' ' + callClass + '">' +
      '<span class="log-ts">' + (l.ts ? l.ts.slice(11,23) : '') + '</span>' +
      '<span class="log-lvl lvl-' + l.level + '">' + l.level + '</span>' +
      '<span class="log-msg">' + esc(l.message) + '</span></div>';
  }).join('');

  if (auto) box.scrollTop = box.scrollHeight;
}

function clearLogs() { _allLogs = []; renderLogs(); }

function exportLogsCsv() {
  const search  = (document.getElementById('logSearch')?.value || '').toLowerCase();
  const callFil = document.getElementById('logCallFilter')?.value || '';
  const lines = _allLogs.filter(l => {
    if (_logLevel !== 'ALL' && l.level !== _logLevel) return false;
    if (search && !l.message.toLowerCase().includes(search)) return false;
    if (callFil && l.callSid !== callFil) return false;
    return true;
  });
  const csv = 'Timestamp,Level,CallSID,Message\n' +
    lines.map(l => [
      '"' + (l.ts||'') + '"',
      '"' + (l.level||'') + '"',
      '"' + (l.callSid||'') + '"',
      '"' + (l.message||'').replace(/"/g,'""') + '"',
    ].join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'vf-logs-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Logs exported as CSV', 'success');
}

// ── Terminal ───────────────────────────────────────────────────────────────────
const termInput = document.getElementById('termInput');
if (termInput) {
  termInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const cmd = termInput.value.trim();
      if (!cmd) return;
      _cmdHistory.unshift(cmd);
      if (_cmdHistory.length > 20) _cmdHistory.pop();
      _cmdHistoryIdx = -1;
      termInput.value = '';
      runCliCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_cmdHistoryIdx < _cmdHistory.length - 1) {
        _cmdHistoryIdx++;
        termInput.value = _cmdHistory[_cmdHistoryIdx] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_cmdHistoryIdx > 0) {
        _cmdHistoryIdx--;
        termInput.value = _cmdHistory[_cmdHistoryIdx] || '';
      } else {
        _cmdHistoryIdx = -1;
        termInput.value = '';
      }
    }
  });
}

async function runCliCommand(cmd) {
  const out  = document.getElementById('termOutput');
  const spin = document.getElementById('termSpinner');
  if (!out) return;

  // Echo command
  const cmdLine = document.createElement('div');
  cmdLine.className = 'term-line term-cmd';
  cmdLine.textContent = 'AST> ' + cmd;
  out.appendChild(cmdLine);
  out.scrollTop = out.scrollHeight;

  if (spin) spin.classList.add('active');

  try {
    const r = await fetch('/asterisk/cli?cmd=' + encodeURIComponent(cmd), {
      headers: { 'X-Bridge-Secret': SECRET }
    });
    const json = await r.json().catch(() => ({}));
    const output = json.output || json.result || json.error || (r.ok ? '(no output)' : 'HTTP ' + r.status);
    const lines  = String(output).split('\n');
    for (const ln of lines) {
      const el = document.createElement('div');
      el.className = 'term-line ' + (
        /error|fail/i.test(ln) ? 'term-err' :
        /ok|success|connected/i.test(ln) ? 'term-ok' :
        'term-out'
      );
      el.textContent = ln;
      out.appendChild(el);
    }
  } catch(err) {
    const el = document.createElement('div');
    el.className = 'term-line term-err';
    el.textContent = 'Error: ' + err.message;
    out.appendChild(el);
  } finally {
    if (spin) spin.classList.remove('active');
    out.scrollTop = out.scrollHeight;
  }
}

// ── Settings page ─────────────────────────────────────────────────────────────
function loadSettingsPage() {
  const envDiv = document.getElementById('envVars');
  const vars = [
    ['PORT', _state?.ts ? '3000' : '—'],
    ['FIREBASE_URL', document.getElementById('pvFirebase')?.textContent || '—'],
    ['CLOUD_RUN_URL', document.getElementById('pvCloudRun')?.textContent || '—'],
    ['BRIDGE_SECRET', SECRET ? '****** (set)' : '(not set)'],
  ];
  if (envDiv) {
    envDiv.innerHTML = vars.map(([k,v]) =>
      '<div class="setting-row"><div class="setting-label">' + esc(k) + '</div>' +
      '<div class="setting-value">' + esc(v) + '</div></div>'
    ).join('');
  }

  setText('secretStatus', SECRET ? 'Set (masked)' : 'Not set — all requests allowed');
  setText('authRequired', SECRET ? 'Yes' : 'No');

  // Metrics from last SSE
  if (_state?.metrics) {
    const m  = _state.metrics;
    const upS = Math.floor(m.uptime);
    const hh  = String(Math.floor(upS/3600)).padStart(2,'0');
    const mm  = String(Math.floor((upS%3600)/60)).padStart(2,'0');
    const ss2 = String(upS%60).padStart(2,'0');
    setText('mUptime',  hh + ':' + mm + ':' + ss2);
    setText('mRss',     m.rssMB + ' MB');
    setText('mHeap',    m.heapUsedMB + ' / ' + m.heapTotalMB + ' MB');
    setText('mOsFree',  m.freeMemMB + ' MB');
    setText('mOsTotal', m.totalMemMB + ' MB');
    setText('mLoad',    m.loadavg);
    setText('mNode',    navigator.userAgent.match(/Node\\.js\\/([\\d.]+)/) ? navigator.userAgent.match(/Node\\.js\\/([\\d.]+)/)[1] : '—');
    setText('mPid',     '—');
  }
}

// ── Infrastructure config loader ──────────────────────────────────────────────
async function loadInfraConfig() {
  try {
    const [trunks, exts] = await Promise.all([
      fetch('/sip/trunks',     { headers: { 'X-Bridge-Secret': SECRET } }).then(r => r.ok ? r.json() : []),
      fetch('/sip/extensions', { headers: { 'X-Bridge-Secret': SECRET } }).then(r => r.ok ? r.json() : []),
    ]);
    _trunkConfig = Array.isArray(trunks) ? trunks : [];
    _extConfig   = Array.isArray(exts)   ? exts   : [];
    if (_state?.sipStatus) {
      const ss = _state.sipStatus;
      updateTrunkTable(ss.endpoints.filter(ep => ep.kind === 'trunk'));
      updateExtTable(ss.endpoints.filter(ep => ep.kind === 'extension'));
    }
  } catch (e) {
    console.warn('[Dashboard] loadInfraConfig error:', e.message);
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': SECRET },
  };
  if (body) opts.body = JSON.stringify(body);
  const r    = await fetch(path, opts);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || r.statusText);
  return json;
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

// ── Trunk CRUD ────────────────────────────────────────────────────────────────
async function addTrunk() {
  const name = document.getElementById('tf_name').value.trim();
  const ip   = document.getElementById('tf_ip').value.trim();
  const ctx  = document.getElementById('tf_ctx').value.trim() || 'from-operator';
  if (!name || !ip) return showToast('Name and IP are required', 'warning');
  setBtnLoading('btnAddTrunk', true);
  try {
    await api('POST', '/sip/trunks', { name, ip, context: ctx });
    document.getElementById('tf_name').value = '';
    document.getElementById('tf_ip').value   = '';
    toggleForm('trunkForm');
    await loadInfraConfig();
    showToast('✅ Trunk "' + name + '" added', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { setBtnLoading('btnAddTrunk', false); }
}

async function deleteTrunk(name) {
  if (!confirm('Delete trunk "' + name + '"?')) return;
  try {
    await api('DELETE', '/sip/trunks/' + encodeURIComponent(name));
    await loadInfraConfig();
    showToast('Trunk "' + name + '" deleted', 'warning');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── Extension CRUD ────────────────────────────────────────────────────────────
async function addExtension() {
  const number   = document.getElementById('ef_num').value.trim();
  const password = document.getElementById('ef_pass').value.trim();
  if (!number || !password) return showToast('Number and password are required', 'warning');
  setBtnLoading('btnAddExt', true);
  try {
    await api('POST', '/sip/extensions', { number, password });
    document.getElementById('ef_num').value  = '';
    document.getElementById('ef_pass').value = '';
    toggleForm('extForm');
    await loadInfraConfig();
    showToast('✅ Extension ' + number + ' added', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { setBtnLoading('btnAddExt', false); }
}

async function deleteExtension(number) {
  if (!confirm('Delete extension ' + number + '?')) return;
  try {
    await api('DELETE', '/sip/extensions/' + encodeURIComponent(number));
    await loadInfraConfig();
    showToast('Extension ' + number + ' deleted', 'warning');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function testEchoCall(extNumber) {
  try {
    await api('POST', '/calls', { to: '*43', from: extNumber });
    showToast('📞 Echo test call placed from ' + extNumber, 'info');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── Call actions ──────────────────────────────────────────────────────────────
async function hangupCall(callSid) {
  if (!confirm('Hang up call ' + callSid.slice(0,16) + '…?')) return;
  try {
    await api('POST', '/calls/' + callSid + '/update', { status: 'completed' });
    showToast('📵 Hang-up sent for ' + callSid.slice(0,14) + '…', 'info');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function quickDial() {
  const to   = document.getElementById('dialTo').value.trim();
  const from = document.getElementById('dialFrom').value.trim();
  if (!to) return showToast('Enter a phone number to dial', 'warning');
  setBtnLoading('btnDial', true);
  try {
    await api('POST', '/calls', { to, from: from || undefined });
    showToast('📞 Calling ' + to + '…', 'success');
    document.getElementById('dialTo').value = '';
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { setBtnLoading('btnDial', false); }
}

// ── DDI CRUD ──────────────────────────────────────────────────────────────────
function ddiTargetTypeChanged(val) {
  const inp = document.getElementById('df_target');
  if (val === 'ai')     { inp.value = 'Stasis(voiceflow-app)'; inp.readOnly = true; }
  else if (val === 'ext') { inp.value = ''; inp.readOnly = false; inp.placeholder = 'Extension number e.g. 101'; }
  else                  { inp.value = ''; inp.readOnly = false; inp.placeholder = 'PJSIP/101 or custom'; }
}

async function addDDIRule() {
  const ddi   = document.getElementById('df_ddi').value.trim();
  const type  = document.getElementById('df_target_type').value;
  let target  = document.getElementById('df_target').value.trim();
  const label = document.getElementById('df_label').value.trim();
  if (!ddi || !target) return showToast('DDI and target are required', 'warning');
  if (type === 'ext' && /^\d+$/.test(target)) target = 'PJSIP/' + target;
  setBtnLoading('btnAddDdi', true);
  try {
    await api('POST', '/sip/routing', { ddi, target, label });
    document.getElementById('df_ddi').value    = '';
    document.getElementById('df_target').value = '';
    document.getElementById('df_label').value  = '';
    toggleForm('ddiForm');
    showToast('✅ DDI rule added for ' + ddi, 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { setBtnLoading('btnAddDdi', false); }
}

async function deleteDDIRule(ddi) {
  if (!confirm('Delete DDI rule for ' + ddi + '?')) return;
  try {
    await api('DELETE', '/sip/routing/' + encodeURIComponent(ddi));
    showToast('DDI rule for ' + ddi + ' deleted', 'warning');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(msg, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', warning:'⚠️', error:'❌', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (icons[type]||'ℹ️') + '</span>' +
    '<div class="toast-body"><div class="toast-msg">' + esc(msg) + '</div>' +
    '<div class="toast-time">' + new Date().toLocaleTimeString() + '</div></div>' +
    '<button class="toast-close" onclick="dismissToast(this.parentElement)">&#x2715;</button>';
  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(el) {
  if (!el || el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => { if (el.parentElement) el.parentElement.removeChild(el); }, 280);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function toggleForm(id) {
  const f = document.getElementById(id);
  if (f) f.classList.toggle('open');
}

function togglePass(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function togglePassCell(btn) {
  const cell = btn.previousElementSibling;
  if (!cell) return;
  if (cell.dataset.shown === 'false') {
    const pass = cell.dataset.pass;
    cell.textContent = pass && pass.length > 0 ? pass : '(no password stored)';
    cell.dataset.shown = 'true';
    btn.textContent = '🙈';
  } else {
    cell.textContent = '••••••';
    cell.dataset.shown = 'false';
    btn.textContent = '👁';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtTs(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString(); } catch(_) { return iso; }
}

function fmtDur(s) {
  const m   = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return m + ':' + sec;
}

function emptyRow(cols, icon, msg) {
  return '<tr><td colspan="' + cols + '"><div class="empty-state"><div class="empty-icon">' + icon + '</div><p>' + msg + '</p></div></td></tr>';
}

function statePill(s) {
  const map = { online:'pill-green', available:'pill-green', offline:'pill-red', unavailable:'pill-red', busy:'pill-yellow', unknown:'pill-gray' };
  const cls   = map[s] || 'pill-gray';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
  return '<span class="pill ' + cls + '"><span class="pill-dot"></span>' + label + '</span>';
}

function chanPill(s) {
  const map = {up:'pill-green',ringing:'pill-yellow',ring:'pill-yellow',dialing:'pill-blue',down:'pill-red'};
  const ico = {up:'↑',ringing:'~',ring:'~',dialing:'→',down:'↓'}[s] || '○';
  return '<span class="pill ' + (map[s]||'pill-gray') + '">' + ico + ' ' + (s||'?') + '</span>';
}

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
<\/script>
</body>
</html>`;

  // Replace the SECRETSCRIPT_PLACEHOLDER with the real injected script tag
  return html.replace('SECRETSCRIPT_PLACEHOLDER', secretScript);
}

// ── Express routes ─────────────────────────────────────────────────────────────
function registerDashboard(app, callManager, ariStatusRef, sipManager) {
  _callMgr   = callManager;
  _ariStatus = ariStatusRef;
  _sipMgr    = sipManager || null;

  patchConsole();
  startBroadcast();

  // Dashboard HTML
  app.get('/dashboard', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    const secret = process.env.BRIDGE_SECRET || '';
    res.send(buildHTML(secret));
  });

  // SSE endpoint
  app.get('/dashboard/events', (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    // Send config immediately on connect
    res.write(`data: ${JSON.stringify({
      type:        'config',
      port:        process.env.PORT        || 3000,
      firebaseUrl: process.env.FIREBASE_URL  || '(not set)',
      cloudRunUrl: process.env.CLOUD_RUN_URL || '(not set)',
    })}\n\n`);

    req.on('close', () => sseClients.delete(res));
  });

  console.log('[Dashboard] Available at http://SERVER_IP:3000/dashboard');
}

module.exports = { registerDashboard };
