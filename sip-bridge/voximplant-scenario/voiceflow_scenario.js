/**
 * VoiceFlow VoxImplant Scenario
 * Upload this file to your VoxImplant application as a scenario.
 *
 * What it does:
 *   1. Receives customData (JSON) from Firebase via StartScenarios API
 *   2. Places an outbound PSTN call to the lead's number
 *   3. Opens a WebSocket to Cloud Run (Twilio Media Streams protocol)
 *   4. Streams bidirectional audio: caller ↔ Cloud Run AI
 *   5. Reports call events back to Firebase via webhookUrl
 *
 * customData JSON fields:
 *   callSessionId  — Firebase call session ID
 *   to             — phone number to call (E.164)
 *   from           — caller ID (E.164)
 *   greeting       — optional first TTS greeting to play before AI takes over
 *   webhookUrl     — Firebase function URL for event reporting
 *   cloudRunUrl    — Cloud Run WebSocket base URL (wss://...)
 */

require(Modules.WebSocket);
require(Modules.Net);

var outCall     = null;
var wsConn      = null;
var customData  = {};
var streamSid   = null;
var chunkSeq    = 0;
var callStarted = false;

// ── Entry point ───────────────────────────────────────────────────────────────

VoxEngine.addEventListener(AppEvents.Started, function (e) {
  try {
    customData = JSON.parse(e.customData || "{}");
  } catch (_) {
    customData = {};
  }

  streamSid = "VX" + (customData.callSessionId || ("" + Date.now())).replace(/[^a-zA-Z0-9]/g, "");

  Logger.write("[VoiceFlow] Scenario started. Calling: " + customData.to);

  // Place outbound call
  outCall = VoxEngine.callPSTN(customData.to, customData.from || "VoiceFlow");

  outCall.addEventListener(CallEvents.Connected,    onCallConnected);
  outCall.addEventListener(CallEvents.Disconnected, onCallDisconnected);
  outCall.addEventListener(CallEvents.Failed,       onCallFailed);
  outCall.addEventListener(CallEvents.PlaybackFinished, function () {});
});

// ── Call connected ────────────────────────────────────────────────────────────

function onCallConnected(e) {
  Logger.write("[VoiceFlow] Call connected to " + customData.to);
  callStarted = true;

  // Report to Firebase
  postEvent("call.connected", { callId: VoxEngine.getCallById(outCall.id()).id() });

  // Connect WebSocket to Cloud Run
  connectWebSocket();
}

// ── WebSocket to Cloud Run ────────────────────────────────────────────────────

function connectWebSocket() {
  var rawUrl   = customData.cloudRunUrl || "";
  var wsBase   = rawUrl.replace(/^https?:\/\//, "wss://").replace(/\/$/, "");
  var wsUrl    = wsBase + "/stream/" + customData.callSessionId;

  Logger.write("[VoiceFlow] Connecting WebSocket: " + wsUrl);

  wsConn = Net.connectWebSocket(wsUrl);

  wsConn.addEventListener(WebSocketEvents.ERROR, function (we) {
    Logger.write("[VoiceFlow] WS error: " + we.message);
  });

  wsConn.addEventListener(WebSocketEvents.CLOSE, function () {
    Logger.write("[VoiceFlow] WS closed");
    if (outCall && callStarted) outCall.hangup();
  });

  wsConn.addEventListener(WebSocketEvents.OPEN, function () {
    Logger.write("[VoiceFlow] WS open — sending connected + start");

    // Twilio Media Streams — connected event
    wsConn.send(JSON.stringify({
      event:    "connected",
      protocol: "Call",
      version:  "1.0.0",
    }));

    // Twilio Media Streams — start event
    wsConn.send(JSON.stringify({
      event:     "start",
      streamSid: streamSid,
      start: {
        callSid:   customData.callSessionId,
        streamSid: streamSid,
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
        customParameters: {
          leadName:      customData.leadName      || "",
          companyName:   customData.companyName   || "",
          assistantName: customData.assistantName || "",
          greeting:      customData.greeting      || "",
        },
      },
    }));

    // Begin streaming call audio → WebSocket (inbound track)
    outCall.sendMediaTo(wsConn, {
      encoding: "mulaw",
      sampleRate: 8000,
      onData: function (data) {
        // data is base64-encoded mulaw audio from the caller
        chunkSeq++;
        wsConn.send(JSON.stringify({
          event:     "media",
          streamSid: streamSid,
          media: {
            track:     "inbound",
            chunk:     String(chunkSeq),
            timestamp: String(Date.now()),
            payload:   data,
          },
        }));
      },
    });
  });

  // Receive audio from Cloud Run → play to caller
  wsConn.addEventListener(WebSocketEvents.MESSAGE, function (we) {
    try {
      var msg = JSON.parse(we.text);

      if (msg.event === "media" && msg.media && msg.media.payload) {
        // Play base64 mulaw audio chunk to caller
        outCall.playback("data:audio/x-mulaw;base64," + msg.media.payload);
      } else if (msg.event === "clear") {
        // Barge-in: stop current playback
        outCall.stopPlayback();
      } else if (msg.event === "hangup") {
        outCall.hangup();
      }
    } catch (err) {
      Logger.write("[VoiceFlow] WS message parse error: " + err);
    }
  });
}

// ── Mid-call commands from Firebase ──────────────────────────────────────────
// Firebase can call VoxImplant SendMediaSessionCommand to inject commands

VoxEngine.addEventListener(AppEvents.MessageReceived, function (e) {
  try {
    var cmd = JSON.parse(e.text || "{}");
    Logger.write("[VoiceFlow] Command received: " + e.text);

    if (cmd.action === "hangup") {
      if (outCall) outCall.hangup();
    } else if (cmd.action === "say" && cmd.text) {
      outCall.say(cmd.text, { language: cmd.language || "en-US" });
    }
  } catch (_) {}
});

// ── Call ended ────────────────────────────────────────────────────────────────

function onCallDisconnected(e) {
  Logger.write("[VoiceFlow] Call disconnected. Duration: " + e.duration);
  callStarted = false;

  // Send stop event to Cloud Run
  if (wsConn) {
    try {
      wsConn.send(JSON.stringify({
        event:     "stop",
        streamSid: streamSid,
        stop:      { callSid: customData.callSessionId },
      }));
    } catch (_) {}
    wsConn.close();
  }

  postEvent("call.completed", {
    duration:    e.duration   || 0,
    hangupCause: e.hangupCause || "normal",
  }, function () { VoxEngine.terminate(); });
}

function onCallFailed(e) {
  Logger.write("[VoiceFlow] Call failed: " + e.reason + " (" + e.code + ")");
  if (wsConn) { try { wsConn.close(); } catch (_) {} }

  postEvent("call.failed", {
    hangupCause: e.reason || "failed",
    code:        e.code   || 0,
  }, function () { VoxEngine.terminate(); });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function postEvent(event, extra, callback) {
  if (!customData.webhookUrl) {
    if (callback) callback();
    return;
  }

  var body = JSON.stringify(Object.assign({
    event,
    callSessionId: customData.callSessionId,
    callId:        outCall ? outCall.id() : null,
  }, extra || {}));

  Net.httpRequest(customData.webhookUrl, {
    method:   "POST",
    headers:  { "Content-Type": "application/json" },
    postData: body,
    callback: function (result) {
      if (result.code !== 200) {
        Logger.write("[VoiceFlow] Webhook " + event + " returned " + result.code);
      }
      if (callback) callback();
    },
  });
}
