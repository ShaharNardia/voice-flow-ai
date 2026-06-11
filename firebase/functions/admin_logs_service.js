/**
 * Admin Logs — query Cloud Run / Functions logs from the admin UI.
 * Reuses the @google-cloud/logging client we added for call diagnostics.
 *
 * Endpoint:
 *   GET /adminLogsQuery
 *     ?service=mediastream|functions|sip-bridge|all
 *     &severity=INFO|WARNING|ERROR
 *     &search=<freetext>
 *     &callSessionId=<id>
 *     &hours=1|6|24
 *     &limit=200
 *   → { entries: [{ts, severity, service, message, raw}], filter, queriedHours }
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

async function requireAdmin(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const u = await db.collection("users").doc(uid).get();
  const role = u.exists ? u.data().role : null;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin only" });
    return null;
  }
  return uid;
}

const SERVICE_FILTERS = {
  mediastream: 'resource.type="cloud_run_revision" AND resource.labels.service_name="voiceflow-mediastream"',
  functions:   'resource.type="cloud_function" OR resource.type="cloud_run_revision"',
  "sip-bridge": 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"sip-bridge|voiceflow-bridge"',
  all:         "",
};

exports.adminLogsQuery = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "512MiB", ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await requireAdmin(req, res))) return;

    const service       = String(req.query.service       || "mediastream");
    const severity      = String(req.query.severity      || "");
    const search        = String(req.query.search        || "").trim();
    const callSessionId = String(req.query.callSessionId || "").trim();
    const hours         = Math.min(72, Math.max(0.25, parseFloat(req.query.hours) || 1));
    const limit         = Math.min(1000, Math.max(10, parseInt(req.query.limit, 10) || 200));

    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
    const filterParts = [`timestamp >= "${sinceIso}"`];

    if (SERVICE_FILTERS[service]) filterParts.push(`(${SERVICE_FILTERS[service]})`);

    if (severity) {
      // INFO+ / WARN+ / ERROR+
      const order = ["DEFAULT", "DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL", "ALERT", "EMERGENCY"];
      const idx = order.indexOf(severity.toUpperCase());
      if (idx >= 0) {
        filterParts.push(`severity >= "${severity.toUpperCase()}"`);
      }
    }

    if (callSessionId) {
      // Escape quotes
      const safe = callSessionId.replace(/"/g, "\\\"");
      filterParts.push(`(textPayload:"${safe}" OR jsonPayload.callSessionId="${safe}")`);
    }

    if (search) {
      const safe = search.replace(/"/g, "\\\"");
      filterParts.push(`textPayload:"${safe}"`);
    }

    const filter = filterParts.join(" AND ");

    try {
      const [entries] = await logging.getEntries({
        filter,
        pageSize: limit,
        orderBy: "timestamp desc",
      });

      const out = entries.map((e) => {
        const meta = e.metadata || {};
        const ts = meta.timestamp || meta.receiveTimestamp || new Date().toISOString();
        const raw = typeof e.data === "string"
          ? e.data
          : (e.data?.message || JSON.stringify(e.data));
        return {
          ts,
          severity: meta.severity || "DEFAULT",
          service:  meta.resource?.labels?.service_name || meta.resource?.type || "unknown",
          message:  raw.slice(0, 2000),
          insertId: meta.insertId || null,
        };
      });

      res.json({
        entries: out,
        filter,
        queriedHours: hours,
        count: out.length,
      });
    } catch (e) {
      logger.error("adminLogsQuery failed", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);
