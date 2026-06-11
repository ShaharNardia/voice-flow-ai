/**
 * Call Diagnostics — admin-only timeline of technical events for a single
 * call session. Reads Cloud Run logs filtered by callSessionId and parses
 * the textPayload lines into structured events the call detail UI can render
 * as a colored timeline.
 *
 * Endpoint:
 *   GET /getCallDiagnostics?callSessionId=...&hours=2
 *   → { events: [{ts, severity, type, label, detail, raw}, ...], summary }
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { Logging } = require("@google-cloud/logging");
const { getFirestore } = require("firebase-admin/firestore");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const REGION = "us-central1";
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

const logging = new Logging();

// ── Pattern-matching parsers ──────────────────────────────────────────────
// Each line in Cloud Run logs that mentions our callSessionId gets matched
// against these patterns to extract its event type. Order matters — first
// match wins. Each handler returns {type, label, severity, detail}.
const PATTERNS = [
  { re: /\[WS\] New connection.*url=(.+)$/i,
    handle: (m) => ({ type: "twilio_ws_connect",  severity: "info",  label: "Twilio WebSocket connected", detail: m[1] }) },

  { re: /\[GL\] Starting Gemini Live voice=(\S+) lang=(\S+) VAD=(\S+)/i,
    handle: (m) => ({ type: "session_start", severity: "info", label: "Session starting",
                       detail: `voice=${m[1]} lang=${m[2]} VAD=${m[3]}` }) },

  { re: /Injected KB: (\d+) chunks, (\d+) chars/i,
    handle: (m) => ({ type: "kb_injected", severity: "info", label: "Knowledge base injected",
                       detail: `${m[1]} chunks, ${m[2]} chars` }) },

  { re: /Registered (\d+) custom API tool\(s\): (.+)$/i,
    handle: (m) => ({ type: "tools_registered", severity: "info", label: "Custom tools registered",
                       detail: `${m[1]}: ${m[2]}` }) },

  { re: /connected to Gemini Live \(model=([^)]+)\)/i,
    handle: (m) => ({ type: "gemini_connected", severity: "info", label: "Gemini Live connected", detail: `model=${m[1]}` }) },

  { re: /primary model unavailable — falling back to (\S+)/i,
    handle: (m) => ({ type: "model_fallback", severity: "warning", label: "Model fallback", detail: `→ ${m[1]}` }) },

  { re: /languageCode field rejected by API — reconnecting without language hint/i,
    handle: () => ({ type: "lang_hint_rejected", severity: "warning", label: "Language hint rejected by API",
                      detail: "Auto-reconnected without languageCode — Hebrew STT will use auto-detect" }) },

  { re: /Bridge ready \(\+(\d+)ms\)/i,
    handle: (m) => ({ type: "bridge_ready", severity: "info", label: "Bridge ready", detail: `${m[1]}ms after call start` }) },

  { re: /Triggering greeting \(\+(\d+)ms\)/i,
    handle: (m) => ({ type: "greeting", severity: "info", label: "Greeting triggered", detail: `${m[1]}ms after call start` }) },

  { re: /spawning ffmpeg resampler: (\S+)/i,
    handle: (m) => ({ type: "ffmpeg_spawn", severity: "debug", label: "ffmpeg resampler spawned", detail: m[1] }) },

  { re: /Tool call: (\w+)\((.*)\)/i,
    handle: (m) => ({ type: "tool_call", severity: "info", label: `Tool: ${m[1]}`, detail: m[2] || "(no args)" }) },

  { re: /Tool (\w+) failed: (.+)$/i,
    handle: (m) => ({ type: "tool_error", severity: "error", label: `Tool failed: ${m[1]}`, detail: m[2] }) },

  { re: /Custom API (\S+) → (\d+) \((\d+) chars summary\)/i,
    handle: (m) => ({ type: "custom_api_response", severity: "info", label: `Custom API: ${m[1]}`, detail: `HTTP ${m[2]} · ${m[3]} chars` }) },

  { re: /barge-in detected/i,
    handle: () => ({ type: "barge_in", severity: "info", label: "Barge-in", detail: "Caller interrupted bot" }) },

  { re: /Silence check-in #(\d+)/i,
    handle: (m) => ({ type: "silence_check", severity: "warning", label: `Silence check-in #${m[1]}`, detail: "Watchdog prompted caller" }) },

  { re: /Silence watchdog ending call/i,
    handle: () => ({ type: "silence_hangup", severity: "warning", label: "Silence watchdog ending call", detail: "Max check-ins reached" }) },

  { re: /Goodbye detected in turn: "(.*?)" — hanging up in (\d+)s/i,
    handle: (m) => ({ type: "goodbye_detected", severity: "info", label: "Goodbye detected", detail: `"${m[1]}" · hangup in ${m[2]}s` }) },

  { re: /suppressing audio — meta-narration this turn: (.+)$/i,
    handle: (m) => ({ type: "meta_suppressed", severity: "warning", label: "Meta-narration suppressed", detail: m[1] }) },

  { re: /Output audio: mimeType="([^"]+)" bytes=(\d+)/i,
    handle: (m) => ({ type: "audio_first", severity: "debug", label: "First audio chunk from Gemini", detail: `${m[1]} (${m[2]} bytes)` }) },

  { re: /WS closed: (\d+)\s*(.+)?$/i,
    handle: (m) => ({ type: "ws_closed", severity: m[1] === "1000" ? "info" : "error",
                       label: `Gemini WS closed`, detail: `code=${m[1]} ${m[2] || ""}`.trim() }) },

  { re: /ffmpeg exited code=(\S+) sig=(\S+)/i,
    handle: (m) => ({ type: "ffmpeg_exit", severity: "debug", label: "ffmpeg exited", detail: `code=${m[1]} sig=${m[2]}` }) },

  { re: /Recording uploaded: (\d+)B, (\d+)s/i,
    handle: (m) => ({ type: "recording", severity: "info", label: "Recording uploaded", detail: `${Math.round(parseInt(m[1])/1024)} KB · ${m[2]}s` }) },

  { re: /Recording skipped/i,
    handle: () => ({ type: "recording_skip", severity: "warning", label: "Recording skipped", detail: "No audio or upload failed" }) },

  { re: /Costs: gemini=\$([\d.]+) carrier\(([^)]+)\)=\$([\d.]+) total=\$([\d.]+) \((\d+)s\)/i,
    handle: (m) => ({ type: "cost", severity: "info", label: "Costs",
                       detail: `gemini $${m[1]} + ${m[2]} $${m[3]} = $${m[4]} (${m[5]}s)` }) },

  { re: /Auto-analysis complete/i,
    handle: () => ({ type: "auto_analysis", severity: "info", label: "AI analysis complete", detail: "Summary + sentiment ready" }) },

  // Catch-all for [ARI] events (SIP path)
  { re: /\[ARI\] Inbound call: (\S+) -> (\S+)/,
    handle: (m) => ({ type: "ari_inbound", severity: "info", label: "ARI inbound", detail: `${m[1]} → ${m[2]}` }) },

  { re: /\[ARI\] Outbound answered: (\S+)/,
    handle: (m) => ({ type: "ari_outbound", severity: "info", label: "ARI outbound answered", detail: m[1] }) },
];

// Parse a raw log line into a structured event.
function parseLine(textPayload, timestamp) {
  for (const p of PATTERNS) {
    const m = textPayload.match(p.re);
    if (m) {
      const parsed = p.handle(m);
      return { ts: timestamp, raw: textPayload, ...parsed };
    }
  }
  return null;
}

async function authedAdminOrOwner(req, res, callSessionId) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  const role = u.exists ? u.data().role : null;
  if (role === "admin" || role === "super_admin") return uid;
  // Otherwise, the user must own the call session
  const session = await db.collection("call_sessions").doc(callSessionId).get();
  if (!session.exists) { res.status(404).json({ error: "Call session not found" }); return null; }
  const sessionOwner = session.data().ownerId;
  if (sessionOwner === uid) return uid;
  res.status(403).json({ error: "Not allowed to view this call's diagnostics" });
  return null;
}

exports.getCallDiagnostics = onRequest(
  { region: REGION, memory: "512MiB", timeoutSeconds: 60, ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const callSessionId = String(req.query.callSessionId || "").trim();
    if (!callSessionId) { res.status(400).json({ error: "callSessionId required" }); return; }

    if (!(await authedAdminOrOwner(req, res, callSessionId))) return;

    const hours = Math.min(72, Math.max(1, parseInt(req.query.hours, 10) || 6));
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();

    // Logs we want: the mediastream service AND the sip-bridge logs that
    // mention this call session ID. The SIP-bridge logs go to a different
    // service so we OR the filter.
    const filter = [
      `timestamp >= "${sinceIso}"`,
      `resource.type="cloud_run_revision"`,
      `(textPayload:"${callSessionId}" OR jsonPayload.callSessionId="${callSessionId}")`,
    ].join(" AND ");

    try {
      const [entries] = await logging.getEntries({
        filter,
        pageSize: 500,
        orderBy: "timestamp asc",
      });

      const events = [];
      for (const entry of entries) {
        const meta = entry.metadata || {};
        const ts = meta.timestamp || meta.receiveTimestamp || new Date().toISOString();
        // entry.data is the payload — could be string (textPayload) or object (jsonPayload)
        const raw = typeof entry.data === "string"
          ? entry.data
          : (entry.data?.message || JSON.stringify(entry.data));
        const parsed = parseLine(raw, ts);
        if (parsed) {
          events.push(parsed);
        } else if (raw.includes(callSessionId)) {
          // Unrecognized but relevant — keep it as a debug row
          events.push({
            ts,
            raw,
            type: "raw",
            severity: "debug",
            label: "Unmatched log line",
            detail: raw.slice(0, 300),
          });
        }
      }

      // Summary stats
      const summary = {
        totalEvents: events.length,
        errors:    events.filter((e) => e.severity === "error").length,
        warnings:  events.filter((e) => e.severity === "warning").length,
        toolCalls: events.filter((e) => e.type === "tool_call").length,
        modelFallbacks: events.filter((e) => e.type === "model_fallback").length,
        langHintRejected: events.some((e) => e.type === "lang_hint_rejected"),
      };

      res.json({ callSessionId, events, summary, queriedHours: hours });
    } catch (e) {
      logger.error("getCallDiagnostics failed", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);
