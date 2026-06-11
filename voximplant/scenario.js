/**
 * VoxEngine scenario — VoiceFlow AI bridge.
 *
 * This file runs INSIDE Voximplant's VoxEngine sandbox, not on our servers.
 * Upload it via the Voximplant control panel as a scenario tied to a Rule
 * on the Voximplant Application that hosts our DIDs / outbound rules.
 *
 * Architecture:
 *
 *   PSTN ─► Voximplant (this scenario) ─► WebSocket ─► our Cloud Run
 *                                                        ├── Gemini Live / OpenAI Realtime
 *                                                        └── transcript + tool execution
 *
 * VoxEngine sandbox constraints:
 *   • No npm — vanilla JS + Voximplant's built-in `VoxEngine`, `Call`,
 *     `Net`, `Logger`, `Application`, `WebSocket` (their wrapper, not
 *     the W3C one — see Voximplant docs).
 *   • Custom data passed via StartScenarios arrives as a string in
 *     VoxEngine.customData(). We JSON.parse it.
 *
 * Inbound path: scenario triggered by Rule on incoming PSTN call.
 *   customData carries: { mode: "inbound", callSessionId, cloudRunUrl, webhookUrl, ... }
 *   We answer, open WS, bridge audio.
 *
 * Outbound path: scenario triggered by StartScenarios API.
 *   customData carries: { mode: "outbound", to, from, callSessionId, cloudRunUrl, webhookUrl, ... }
 *   We dial `to`, on connect open WS, bridge audio.
 *
 * Webhook events posted back (so Cloud Run + Firestore stay in sync):
 *   • call.ringing      — outbound dial started
 *   • call.connected    — answered, audio bridge live
 *   • call.completed    — normal hangup, duration included
 *   • call.failed       — dial failure or media error
 */

"use strict";

// VoxEngine globals expected (provided by the sandbox):
//   VoxEngine, Call, CallEvents, Net, Logger, AppEvents
//   WebSocket (Voximplant's wrapper, see https://voximplant.com/docs/references/voxengine/websocket)

// ── Parse the custom data the management API forwarded ───────────────────

let cfg = {};
try {
  cfg = JSON.parse(VoxEngine.customData() || "{}");
} catch (e) {
  Logger.write("[VFA] Failed to parse customData: " + e.message);
}

const SESSION_ID  = cfg.callSessionId  || ("vox-" + Date.now());
const CLOUD_RUN   = cfg.cloudRunUrl    || "";   // wss://mediastream-xxx.run.app/voximplant
const WEBHOOK_URL = cfg.webhookUrl     || "";   // https://.../voxImplantWebhook
const MODE        = cfg.mode || (cfg.to ? "outbound" : "inbound");
const TO          = cfg.to;
const FROM        = cfg.from   || cfg.callerId;
const GREETING    = cfg.greeting || "";

let pstnCall   = null;
let ws         = null;
let answeredAt = 0;
let mediaBridgedInbound  = false;
let mediaBridgedOutbound = false;

// ── Helpers ──────────────────────────────────────────────────────────────

function emit(event, extra) {
  if (!WEBHOOK_URL) return;
  const body = Object.assign({
    event,
    callSessionId: SESSION_ID,
    callId:        pstnCall ? pstnCall.id() : null,
    ts:            Date.now(),
  }, extra || {});
  try {
    Net.httpRequestAsync(WEBHOOK_URL, {
      method:  "POST",
      headers: ["Content-Type: application/json"],
      postData: JSON.stringify(body),
    });
  } catch (e) {
    Logger.write("[VFA] webhook send failed: " + e.message);
  }
}

function teardown(reason) {
  Logger.write("[VFA] teardown: " + reason);
  try { if (ws) ws.close(); } catch (_) {}
  try { if (pstnCall) pstnCall.hangup(); } catch (_) {}
  VoxEngine.terminate();
}

// ── Open WebSocket to Cloud Run and bridge audio ─────────────────────────

function openBridge() {
  if (!CLOUD_RUN) {
    Logger.write("[VFA] cloudRunUrl missing — terminating");
    emit("call.failed", { reason: "missing_cloudRunUrl" });
    teardown("no cloud run url");
    return;
  }

  // Use path-style URL — the existing Twilio path uses /stream/:id because
  // some upstream proxies strip the WS upgrade query string. We mirror the
  // pattern with /voximplant/stream/:id. Hello frame below carries the
  // remaining metadata (from/to/greeting).
  //
  // CLOUD_RUN_URL is typically https://… on the Firebase side; VoxEngine
  // expects wss://. Convert protocol-only — keep the host/path intact.
  let base = CLOUD_RUN.replace(/\/+$/, "");
  if (base.indexOf("http://")  === 0) base = "ws:"  + base.slice(5);
  if (base.indexOf("https://") === 0) base = "wss:" + base.slice(6);
  const wsUrl = base + "/voximplant/stream/" + encodeURIComponent(SESSION_ID);

  Logger.write("[VFA] opening WS to " + wsUrl);
  ws = VoxEngine.createWebSocket(wsUrl);

  ws.addEventListener(WebSocketEvents.OPEN, () => {
    Logger.write("[VFA] WS open");
    // Send a JSON hello so the server can log when bridging started.
    try {
      ws.send(JSON.stringify({
        type: "voximplant.hello",
        callSessionId: SESSION_ID,
        from: FROM, to: TO, greeting: GREETING,
        bridgedAt: Date.now(),
      }));
    } catch (_) {}

    // Bridge audio in both directions.
    //   call ─► ws  : caller audio reaches our LLM
    //   ws ─► call  : our LLM's TTS reaches the caller
    if (pstnCall) {
      try { pstnCall.sendMediaTo(ws); mediaBridgedOutbound = true; } catch (e) {
        Logger.write("[VFA] sendMediaTo(ws) failed: " + e.message);
      }
      try { ws.sendMediaTo(pstnCall); mediaBridgedInbound = true; } catch (e) {
        Logger.write("[VFA] sendMediaTo(call) failed: " + e.message);
      }
    }
  });

  ws.addEventListener(WebSocketEvents.ERROR, (e) => {
    Logger.write("[VFA] WS error: " + (e && e.message ? e.message : "unknown"));
    emit("call.failed", { reason: "ws_error" });
    teardown("ws error");
  });

  ws.addEventListener(WebSocketEvents.CLOSE, () => {
    Logger.write("[VFA] WS closed");
    // Don't tear down immediately — caller may still be on the line. But if
    // we never bridged inbound media, the AI side is dead; end the call.
    if (!mediaBridgedInbound) teardown("ws closed before media bridge");
  });
}

// ── Wire up PSTN call lifecycle ──────────────────────────────────────────

function attachCallHandlers(call) {
  pstnCall = call;

  call.addEventListener(CallEvents.Connected, () => {
    answeredAt = Date.now();
    Logger.write("[VFA] call connected, id=" + call.id());
    emit("call.connected", { at: answeredAt });
    openBridge();
  });

  call.addEventListener(CallEvents.Disconnected, () => {
    const duration = answeredAt > 0 ? Math.round((Date.now() - answeredAt) / 1000) : 0;
    Logger.write("[VFA] call disconnected, duration=" + duration + "s");
    emit("call.completed", { duration, hangupCause: "normal" });
    teardown("call disconnected");
  });

  call.addEventListener(CallEvents.Failed, (e) => {
    Logger.write("[VFA] call failed: " + (e && e.reason ? e.reason : "unknown"));
    emit("call.failed", { hangupCause: e && e.reason ? e.reason : "unknown" });
    teardown("call failed");
  });
}

// ── Entry point — branch on inbound vs outbound ──────────────────────────

if (MODE === "outbound") {
  if (!TO) {
    Logger.write("[VFA] outbound mode but `to` is missing");
    emit("call.failed", { reason: "missing_to" });
    VoxEngine.terminate();
  } else {
    Logger.write("[VFA] dialing " + TO + " from " + (FROM || "(default)"));
    emit("call.ringing", { to: TO, from: FROM });
    const outboundCall = VoxEngine.callPSTN(TO, FROM);
    attachCallHandlers(outboundCall);
  }
} else {
  // Inbound — the call is delivered to the scenario via CallAlerting on the
  // application. The platform creates the Call object for us and dispatches
  // VoxEngine.events.CallAlerting.
  VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    Logger.write("[VFA] inbound CallAlerting from " + e.callerid);
    attachCallHandlers(e.call);
    e.call.answer();
  });
}
