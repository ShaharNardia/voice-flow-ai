/**
 * SIP Trunk Service
 * Per-user SIP trunk configuration management with secure credential storage.
 *
 * Security features:
 *   • AES-256-GCM password encryption  (SIP_ENCRYPTION_KEY env var — 32-byte hex)
 *   • Passwords are write-only: never returned in API responses (masked "••••••••")
 *   • TLS transport enforced when encryption = "required"
 *   • Peer type: allowedIps validated as IPv4 or IPv4/CIDR
 *   • Per-user document isolation — every query filters on userId
 *   • Input sanitised via isSafeString before persisting
 *   • Max-trunks guard: 10 per user (prevents DoS via infinite writes)
 *   • DTMF modes: rfc2833, info, inband, auto
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");
const net = require("net");
const dns = require("dns").promises;
const {extractUidFromRequest, isSafeString} = require("./security_utils");

// ── CORS ─────────────────────────────────────────────────────────────────────
// Explicit allowlist only — no regex patterns.
// Regex entries like /\.web\.app$/ would allow ANY Firebase-hosted attacker app
// (e.g. evil-app.web.app) to call these endpoints cross-origin.
const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// ── Encryption (AES-256-GCM) ─────────────────────────────────────────────────
const SIP_KEY_HEX = process.env.SIP_ENCRYPTION_KEY || "";
const HAS_ENCRYPTION_KEY = SIP_KEY_HEX.length === 64; // 32 bytes = 64 hex chars

if (!HAS_ENCRYPTION_KEY) {
  logger.error("SIP_ENCRYPTION_KEY not set or invalid length — password writes are BLOCKED until the key is configured. Set a 64-char hex key in Firebase Functions env.");
}

/**
 * Encrypt a plaintext secret with AES-256-GCM.
 * Throws if the encryption key is not configured — fail-closed: we never
 * store passwords in plaintext even in degraded environments.
 */
function encryptPassword(plaintext) {
  if (!plaintext) return "";
  if (!HAS_ENCRYPTION_KEY) {
    throw new Error("SIP_ENCRYPTION_KEY is not configured on this Function. Cannot store password securely — set the key and redeploy.");
  }
  const key = Buffer.from(SIP_KEY_HEX, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: gcm:<iv_hex>:<tag_hex>:<data_hex>
  return `gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(ciphertext) {
  if (!ciphertext) return "";
  if (!HAS_ENCRYPTION_KEY || !ciphertext.startsWith("gcm:")) return ciphertext;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) return "";
    const [, ivHex, tagHex, dataHex] = parts;
    const key = Buffer.from(SIP_KEY_HEX, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// ── Validation ────────────────────────────────────────────────────────────────
const ALLOWED_DTMF   = ["rfc2833", "info", "inband", "auto"];
const ALLOWED_ENC    = ["required", "preferred", "disabled"];
const ALLOWED_TRANS  = ["tls", "tcp", "udp"];
const ALLOWED_TYPE   = ["register", "peer"];
const ALLOWED_CODECS = ["PCMU", "PCMA", "G722", "G729", "G726", "opus", "iLBC", "speex"];
const CIDR_RE        = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const E164_RE        = /^\+\d{7,15}$/;
const HOST_RE        = /^[\w.\-]+$/; // FQDN or IP

/**
 * Validate a SIP trunk payload.
 * Returns array of error strings (empty = valid).
 */
function validateTrunk(d) {
  // Each error includes [Tab: Name] prefix so the UI can direct the user to the right section.
  const errors = [];

  if (!d.name || !isSafeString(d.name, 80))    errors.push("[Basic] Name is required (max 80 chars)");
  if (!ALLOWED_TYPE.includes(d.type))           errors.push("[Basic] Type must be 'register' or 'peer'");
  if (!ALLOWED_DTMF.includes(d.dtmfMode))       errors.push(`[DTMF & Codecs] DTMF mode must be one of: ${ALLOWED_DTMF.join(", ")}`);
  if (!ALLOWED_ENC.includes(d.encryption))      errors.push(`[Security] Encryption must be one of: ${ALLOWED_ENC.join(", ")}`);
  if (!ALLOWED_TRANS.includes(d.transport))     errors.push(`[Security] Transport must be one of: ${ALLOWED_TRANS.join(", ")}`);

  // Enforce TLS when media encryption is required
  if (d.encryption === "required" && d.transport !== "tls") {
    errors.push("[Security] Transport must be 'TLS' when encryption is set to 'Required'");
  }

  // Port range
  if (d.port !== undefined && d.port !== null) {
    const p = Number(d.port);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) {
      errors.push("[Connection] Port must be an integer between 1024 and 65535");
    }
  }

  // Caller ID (optional but must be E.164 if provided)
  if (d.callerId && !E164_RE.test(d.callerId)) {
    errors.push("[Connection] Caller ID must be E.164 format (e.g. +12025551234) — not an IP address");
  }

  // Codecs
  if (d.codecs?.length > 0) {
    for (const c of d.codecs) {
      if (!ALLOWED_CODECS.includes(c)) errors.push(`[DTMF & Codecs] Unknown codec: ${c}`);
    }
  }

  // Register-specific
  if (d.type === "register") {
    if (!d.registrar || !HOST_RE.test(d.registrar)) errors.push("[Connection] Registrar must be a valid hostname or IP address (not E.164)");
    if (!d.username?.trim())  errors.push("[Connection] Username is required for Register type");
    if (!d.domain?.trim())    errors.push("[Connection] SIP Domain is required for Register type");
    if (d.authUsername && !isSafeString(d.authUsername, 80)) errors.push("[Connection] Auth Username is too long (max 80 chars)");
  }

  // Peer-specific
  if (d.type === "peer") {
    if (!d.host || !HOST_RE.test(d.host)) errors.push("[Connection] Host must be a valid hostname or IP address (not E.164 format)");
    if (d.allowedIps?.length > 0) {
      for (const ip of d.allowedIps) {
        if (!CIDR_RE.test(ip.trim())) {
          errors.push(`[Connection] Allowed IPs — invalid entry "${ip}": use IP (1.2.3.4) or CIDR (1.2.3.0/24)`);
        }
      }
    }
    if (d.allowedIps?.length > 20) errors.push("[Connection] Maximum 20 allowed IPs per trunk");
  }

  if (d.maxChannels !== undefined && d.maxChannels !== null) {
    const m = Number(d.maxChannels);
    if (!Number.isInteger(m) || m < 0 || m > 1000) errors.push("[Basic] Max Channels must be 0–1000 (0 = unlimited)");
  }

  return errors;
}

// ── Nested-structure sanitizers ───────────────────────────────────────────────

const ALLOWED_IVR_ACTIONS = ["assistant", "extension", "hangup"];

/**
 * Validate and sanitize a DID array.
 * Each item must be { id: string, number: string, assistantId?: string, description?: string }.
 * Returns sanitized array or throws with a descriptive error string.
 */
function sanitizeDids(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 50) throw new Error("[DID Numbers] Maximum 50 DID numbers per trunk");
  return raw.map((d, i) => {
    if (typeof d !== "object" || d === null) throw new Error(`[DID Numbers] Item ${i} is not an object`);
    const id  = String(d.id  || "").trim();
    const num = String(d.number || "").trim();
    if (!id)  throw new Error(`[DID Numbers] Item ${i} is missing an id`);
    if (!num) throw new Error(`[DID Numbers] Item ${i} is missing a number`);
    if (!/^\+?\d{5,20}$/.test(num)) throw new Error(`[DID Numbers] "${num}" is not a valid phone number`);
    const assistantId = d.assistantId ? String(d.assistantId).trim() : undefined;
    const description = d.description ? String(d.description).slice(0, 200) : undefined;
    return {id, number: num, ...(assistantId && {assistantId}), ...(description && {description})};
  });
}

/**
 * Validate and sanitize an IVR menu object.
 */
function sanitizeIvrMenu(raw) {
  if (!raw || typeof raw !== "object") return null;
  const enabled = !!raw.enabled;
  if (!enabled) return {enabled: false, prompt: "", timeout: 5, items: []};
  const prompt  = String(raw.prompt || "").slice(0, 1000);
  const timeout = Math.min(Math.max(Number(raw.timeout) || 5, 2), 30);
  const items   = Array.isArray(raw.items) ? raw.items : [];
  if (items.length > 20) throw new Error("[IVR Menu] Maximum 20 menu items");
  const sanitizedItems = items.map((it, i) => {
    if (typeof it !== "object" || it === null) throw new Error(`[IVR Menu] Item ${i} is not an object`);
    const key    = String(it.key || "").trim();
    const label  = String(it.label || "").slice(0, 100);
    const action = it.action;
    if (!key || !/^[\d*#]$/.test(key)) throw new Error(`[IVR Menu] Item ${i} has invalid key "${key}"`);
    if (!label) throw new Error(`[IVR Menu] Item ${i} is missing a label`);
    if (!ALLOWED_IVR_ACTIONS.includes(action)) throw new Error(`[IVR Menu] Item ${i} has invalid action "${action}"`);
    const assistantId = it.assistantId ? String(it.assistantId).trim() : undefined;
    const extension   = it.extension   ? String(it.extension).slice(0, 20)  : undefined;
    return {key, label, action, ...(assistantId && {assistantId}), ...(extension && {extension})};
  });
  return {enabled, prompt, timeout, items: sanitizedItems};
}

/**
 * Validate and sanitize outbound route array.
 */
function sanitizeOutboundRoutes(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 50) throw new Error("[PBX Routing] Maximum 50 outbound routes per trunk");
  return raw.map((r, i) => {
    if (typeof r !== "object" || r === null) throw new Error(`[PBX Routing] Route ${i} is not an object`);
    const id          = String(r.id || "").trim();
    const pattern     = String(r.pattern || "").trim();
    const description = String(r.description || "").slice(0, 200);
    const priority    = Math.min(Math.max(Number(r.priority) || 10, 1), 999);
    if (!id) throw new Error(`[PBX Routing] Route ${i} is missing an id`);
    if (!pattern) throw new Error(`[PBX Routing] Route ${i} is missing a pattern`);
    return {id, pattern, description, priority};
  });
}

/**
 * Strip sensitive fields before returning trunk doc to client.
 * Password hash/ciphertext is always removed; a boolean `hasPassword` is set instead.
 */
function sanitizeTrunkForClient(id, data) {
  const {passwordEncrypted, ...rest} = data;
  return {
    id,
    ...rest,
    hasPassword: !!passwordEncrypted,
    // mask the encrypted blob — client gets only a boolean
  };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function requireUid(req, res) {
  const uid = await extractUidFromRequest(req);
  if (!uid) {
    res.status(401).json({status: "error", message: "Unauthorized."});
    return null;
  }
  return uid;
}

/** Returns true if uid has role super_admin in Firestore. Non-fatal — returns false on any error. */
async function isSuperAdminUid(uid) {
  try {
    const snap = await getFirestore().collection("users").doc(uid).get();
    return snap.exists && snap.data().role === "super_admin";
  } catch { return false; }
}

/**
 * Fetch a SIP trunk by ID and verify the caller owns it (or is super_admin).
 * Returns { snap, trunk } on success, or sends a 404 response and returns null.
 */
async function requireTrunkAccess(db, trunkId, uid, res) {
  const snap = await db.collection("sip_trunks").doc(trunkId).get();
  if (!snap.exists) {
    res.status(404).json({status: "error", message: "SIP trunk not found."});
    return null;
  }
  const trunk = snap.data();
  if (trunk.userId !== uid) {
    // Allow super_admin to access any trunk
    const isAdmin = await isSuperAdminUid(uid);
    if (!isAdmin) {
      res.status(404).json({status: "error", message: "SIP trunk not found."});
      return null;
    }
  }
  return {snap, trunk};
}

// ── GET company ID from uid ───────────────────────────────────────────────────
async function getCompanyId(uid) {
  const db = getFirestore();
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      const legacySnap = await db.collection("user").doc(uid).get();
      return legacySnap.exists ? legacySnap.data().companyId || null : null;
    }
    return userSnap.data().companyId || null;
  } catch {
    return null;
  }
}

// ── Network connectivity test (TCP) ──────────────────────────────────────────
function tcpProbe(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const cleanup = (ok, msg) => { sock.destroy(); resolve({ok, msg}); };
    sock.setTimeout(timeoutMs);
    sock.on("connect",  ()      => cleanup(true,  "TCP connection established"));
    sock.on("timeout",  ()      => cleanup(false, "Connection timed out"));
    sock.on("error",    (e)     => cleanup(false, e.message));
    sock.connect(port, host);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge config helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read or create the Company doc for a given uid (used as companyId). */
async function getCompanyDoc(db, uid) {
  const companyId = (await getCompanyId(uid)) || uid;
  // Try Company (capital C) first for legacy compat, fall back to companies
  let ref = db.collection("Company").doc(companyId);
  let snap = await ref.get();
  if (!snap.exists) {
    ref = db.collection("companies").doc(companyId);
    snap = await ref.get();
  }
  return {ref: ref.parent.doc(companyId), snap, companyId};
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /sipBridgeConfigGet
 * Returns Asterisk bridge settings for the authenticated user's company.
 * Bridge secret is write-only — returned as boolean hasSecret.
 */
exports.sipBridgeConfigGet = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "GET required."}); return; }
  const uid = await requireUid(req, res); if (!uid) return;
  try {
    const db = getFirestore();
    const {snap} = await getCompanyDoc(db, uid);
    if (!snap.exists) {
      return res.json({status: "success", config: {telephonyProvider: "twilio", asteriskBridgeUrl: "", hasSecret: false, asteriskCallerId: ""}});
    }
    const d = snap.data();
    // asteriskBridgeSecret may be stored as AES-GCM ciphertext (after Fix 3 migration)
    // or as legacy plaintext. Either way we only report whether it exists — never the value.
    const hasSecret = !!d.asteriskBridgeSecret;
    res.json({
      status: "success",
      config: {
        telephonyProvider:    d.telephonyProvider    || "twilio",
        asteriskBridgeUrl:    d.asteriskBridgeUrl    || "",
        hasSecret,
        asteriskCallerId:     d.asteriskCallerId     || d.defaultDdi || "",
        asteriskSipTrunkName: d.asteriskSipTrunkName || d.sipTrunkName || "",
      },
    });
  } catch (err) {
    logger.error("sipBridgeConfigGet error", err);
    res.status(500).json({status: "error", message: "Failed to get bridge config."});
  }
});

/**
 * POST /sipBridgeConfigSave
 * Body: { telephonyProvider, asteriskBridgeUrl, asteriskBridgeSecret?, asteriskCallerId?, asteriskSipTrunkName? }
 */
exports.sipBridgeConfigSave = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }
  const uid = await requireUid(req, res); if (!uid) return;
  try {
    const db = getFirestore();
    const body = req.body || {};
    const allowed = ["twilio", "asterisk", "freeswitch", "kamailio", "generic"];
    if (body.telephonyProvider && !allowed.includes(body.telephonyProvider)) {
      return res.status(400).json({status: "error", message: `telephonyProvider must be one of: ${allowed.join(", ")}`});
    }
    const update = {
      telephonyProvider:    body.telephonyProvider || "twilio",
      asteriskBridgeUrl:    String(body.asteriskBridgeUrl || "").trim(),
      asteriskCallerId:     String(body.asteriskCallerId || "").trim(),
      asteriskSipTrunkName: String(body.asteriskSipTrunkName || "").trim(),
      updatedAt:            FieldValue.serverTimestamp(),
    };
    // Only overwrite secret if a new one is provided.
    // Encrypt with AES-256-GCM — same scheme as SIP passwords (fail-closed).
    if (body.asteriskBridgeSecret) {
      const rawSecret = String(body.asteriskBridgeSecret).trim();
      if (!rawSecret) {
        return res.status(400).json({status: "error", message: "asteriskBridgeSecret cannot be blank."});
      }
      update.asteriskBridgeSecret = encryptPassword(rawSecret);
    }
    const companyId = (await getCompanyId(uid)) || uid;
    // Always write to "Company" collection (primary)
    await db.collection("Company").doc(companyId).set(update, {merge: true});
    logger.info("sipBridgeConfigSave", {uid, companyId, provider: update.telephonyProvider});
    res.json({status: "success"});
  } catch (err) {
    logger.error("sipBridgeConfigSave error", err);
    res.status(500).json({status: "error", message: "Failed to save bridge config."});
  }
});

/**
 * POST /sipTrunkCreate
 * Body: SipTrunkInput (see validateTrunk)
 */
exports.sipTrunkCreate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  try {
    const db = getFirestore();
    const col = db.collection("sip_trunks");

    // Enforce max 10 trunks per user
    const existing = await col.where("userId", "==", uid).count().get();
    if (existing.data().count >= 10) {
      res.status(429).json({status: "error", message: "Maximum 10 SIP trunks per account."});
      return;
    }

    const body = req.body || {};
    const errors = validateTrunk(body);
    if (errors.length > 0) {
      res.status(400).json({status: "error", message: "Validation failed", errors});
      return;
    }

    // Sanitize nested structures — throws with user-friendly message on bad input
    let dids, ivrMenu, outboundRoutes;
    try {
      dids           = sanitizeDids(body.dids);
      ivrMenu        = sanitizeIvrMenu(body.ivrMenu);
      outboundRoutes = sanitizeOutboundRoutes(body.outboundRoutes);
    } catch (sanitizeErr) {
      res.status(400).json({status: "error", message: sanitizeErr.message});
      return;
    }

    const companyId = await getCompanyId(uid);

    // Encrypt password if provided (Register type) — throws if key not configured
    const passwordEncrypted = body.password ? encryptPassword(body.password) : "";

    const doc = {
      userId:            uid,
      companyId:         companyId || null,
      name:              String(body.name).trim(),
      type:              body.type,
      // Register fields
      registrar:         body.type === "register" ? String(body.registrar || "").trim() : "",
      username:          body.type === "register" ? String(body.username || "").trim() : "",
      authUsername:      body.type === "register" ? String(body.authUsername || "").trim() : "",
      domain:            body.type === "register" ? String(body.domain || "").trim() : "",
      passwordEncrypted, // never returned to client
      // Peer fields
      host:              body.type === "peer" ? String(body.host || "").trim() : "",
      allowedIps:        body.type === "peer" ? (body.allowedIps || []).map((ip) => String(ip).trim()) : [],
      // Common
      port:              Number(body.port) || (body.transport === "tls" ? 5061 : 5060),
      transport:         body.transport,
      callerId:          String(body.callerId || "").trim(),
      dtmfMode:          body.dtmfMode,
      codecs:            (body.codecs || ["PCMU", "PCMA"]).filter((c) => ALLOWED_CODECS.includes(c)),
      encryption:        body.encryption,
      maxChannels:       Number(body.maxChannels) || 0,
      status:            "active",
      testResult:        null,
      dids,
      ivrMenu,
      outboundRoutes,
      createdAt:         FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
    };

    const ref = await col.add(doc);
    logger.info(`sipTrunkCreate: uid=${uid} trunkId=${ref.id} type=${body.type}`);

    res.status(201).json({
      status: "success",
      trunk: sanitizeTrunkForClient(ref.id, doc),
    });
  } catch (err) {
    logger.error("sipTrunkCreate error", err);
    res.status(500).json({status: "error", message: "Failed to create SIP trunk."});
  }
});

/**
 * POST /sipTrunkUpdate
 * Body: { id: string, ...SipTrunkInput }
 */
exports.sipTrunkUpdate = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  try {
    const db = getFirestore();
    const body = req.body || {};
    const trunkId = String(body.id || "").trim();
    if (!trunkId) { res.status(400).json({status: "error", message: "id is required."}); return; }

    const access = await requireTrunkAccess(db, trunkId, uid, res);
    if (!access) return;
    const {snap, trunk: prev} = access;
    const ref = snap.ref;

    const errors = validateTrunk(body);
    if (errors.length > 0) {
      res.status(400).json({status: "error", message: "Validation failed", errors});
      return;
    }

    // Sanitize nested structures
    let dids, ivrMenu, outboundRoutes;
    try {
      dids           = Array.isArray(body.dids)          ? sanitizeDids(body.dids)                    : (prev.dids || []);
      ivrMenu        = body.ivrMenu !== undefined         ? sanitizeIvrMenu(body.ivrMenu)               : (prev.ivrMenu || null);
      outboundRoutes = Array.isArray(body.outboundRoutes) ? sanitizeOutboundRoutes(body.outboundRoutes) : (prev.outboundRoutes || []);
    } catch (sanitizeErr) {
      res.status(400).json({status: "error", message: sanitizeErr.message});
      return;
    }

    // Only re-encrypt if a new password was provided (throws if key not configured)
    let passwordEncrypted = prev.passwordEncrypted;
    if (body.password) {
      passwordEncrypted = encryptPassword(body.password);
    }

    const updates = {
      name:          String(body.name).trim(),
      type:          body.type,
      registrar:     body.type === "register" ? String(body.registrar || "").trim() : "",
      username:      body.type === "register" ? String(body.username || "").trim() : "",
      authUsername:  body.type === "register" ? String(body.authUsername || "").trim() : "",
      domain:        body.type === "register" ? String(body.domain || "").trim() : "",
      passwordEncrypted,
      host:          body.type === "peer" ? String(body.host || "").trim() : "",
      allowedIps:    body.type === "peer" ? (body.allowedIps || []).map((ip) => String(ip).trim()) : [],
      port:          Number(body.port) || (body.transport === "tls" ? 5061 : 5060),
      transport:     body.transport,
      callerId:      String(body.callerId || "").trim(),
      dtmfMode:      body.dtmfMode,
      codecs:        (body.codecs || ["PCMU", "PCMA"]).filter((c) => ALLOWED_CODECS.includes(c)),
      encryption:    body.encryption,
      maxChannels:   Number(body.maxChannels) || 0,
      status:        body.status === "inactive" ? "inactive" : "active",
      dids,
      ivrMenu,
      outboundRoutes,
      updatedAt:     FieldValue.serverTimestamp(),
    };

    await ref.update(updates);
    logger.info(`sipTrunkUpdate: uid=${uid} trunkId=${trunkId}`);

    const updated = {...prev, ...updates};
    res.status(200).json({
      status: "success",
      trunk: sanitizeTrunkForClient(trunkId, updated),
    });
  } catch (err) {
    logger.error("sipTrunkUpdate error", err);
    res.status(500).json({status: "error", message: "Failed to update SIP trunk."});
  }
});

/**
 * POST /sipTrunkDelete
 * Body: { id: string }
 */
exports.sipTrunkDelete = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  try {
    const db = getFirestore();
    const trunkId = String((req.body || {}).id || "").trim();
    if (!trunkId) { res.status(400).json({status: "error", message: "id is required."}); return; }

    const access = await requireTrunkAccess(db, trunkId, uid, res);
    if (!access) return;

    await access.snap.ref.delete();
    logger.info(`sipTrunkDelete: uid=${uid} trunkId=${trunkId}`);

    res.status(200).json({status: "success", deleted: trunkId});
  } catch (err) {
    logger.error("sipTrunkDelete error", err);
    res.status(500).json({status: "error", message: "Failed to delete SIP trunk."});
  }
});

/**
 * GET /sipTrunkList
 * Returns all SIP trunks for the authenticated user (passwords masked).
 */
exports.sipTrunkList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).json({status: "error", message: "GET required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  try {
    const db = getFirestore();

    // Determine user role — super_admin sees ALL trunks across the project
    let isSuperAdmin = false;
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (userSnap.exists && userSnap.data().role === "super_admin") isSuperAdmin = true;
    } catch { /* non-fatal — default to user-scoped query */ }

    let snaps;
    try {
      const col = db.collection("sip_trunks");
      const q = isSuperAdmin
        ? col.orderBy("createdAt", "desc").limit(200)
        : col.where("userId", "==", uid).orderBy("createdAt", "desc").limit(50);
      snaps = await q.get();
    } catch (indexErr) {
      // Index may still be building — fall back to unordered query and sort in JS
      if (indexErr.code === 9 || (indexErr.message && indexErr.message.includes("index"))) {
        logger.warn("sipTrunkList: composite index not ready, falling back to unordered query", indexErr.message);
        const col = db.collection("sip_trunks");
        snaps = isSuperAdmin
          ? await col.limit(200).get()
          : await col.where("userId", "==", uid).limit(50).get();
      } else {
        throw indexErr;
      }
    }

    const trunks = snaps.docs
      .map((d) => sanitizeTrunkForClient(d.id, d.data()))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    logger.info("sipTrunkList", {uid, isSuperAdmin, count: trunks.length});
    res.status(200).json({status: "success", trunks});
  } catch (err) {
    logger.error("sipTrunkList error", err);
    res.status(500).json({status: "error", message: "Failed to list SIP trunks."});
  }
});

/**
 * POST /sipTrunkHealthCheck
 * Body: {} (no body required — checks all trunks for the authenticated user)
 *
 * Comprehensive health-check covering:
 *   1. Per-trunk: DNS resolution, TCP connectivity, config sanity, credential
 *      completeness, DID assignment validity, IVR menu validity, outbound routes
 *   2. Asterisk bridge: reads Company doc → checks provider config, pings /health
 *   3. Cross-check: trunks exist but Asterisk not configured (or vice-versa)
 *
 * Returns:
 *   { summary: "healthy"|"warning"|"critical", trunks: [...], bridge: {...}, issues: [...] }
 */
exports.sipTrunkHealthCheck = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  const hcStart = Date.now();
  logger.info("sipTrunkHealthCheck: started", {uid, ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress});

  try {
    const db = getFirestore();
    const axios = require("axios");

    // ── 1. Load trunks (super_admin sees all, others see own) ─────────────
    let isSuperAdmin = false;
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (userSnap.exists && userSnap.data().role === "super_admin") isSuperAdmin = true;
    } catch { /* non-fatal */ }

    const trunksSnap = isSuperAdmin
      ? await db.collection("sip_trunks").limit(50).get()
      : await db.collection("sip_trunks").where("userId", "==", uid).limit(50).get();

    const rawTrunks = trunksSnap.docs.map((d) => ({id: d.id, ...d.data()}));
    logger.info("sipTrunkHealthCheck: loaded trunks", {count: rawTrunks.length, isSuperAdmin});

    // ── 2. Load assistants to validate DID / IVR assistant IDs ─────────────
    const companyId = await getCompanyId(uid);
    const assistantIds = new Set();
    try {
      const assSnap = await db.collection("assistants")
        .where("ownerId", "==", uid).select().get();
      for (const d of assSnap.docs) assistantIds.add(d.id);
    } catch { /* non-fatal */ }

    // ── 3. Per-trunk checks ────────────────────────────────────────────────
    const trunkResults = await Promise.all(rawTrunks.map(async (trunk) => {
      const checks = [];
      const trunkIssues = [];
      const traceLog = [];  // per-trunk trace lines shown in UI

      const host     = trunk.type === "peer" ? trunk.host : trunk.registrar;
      const port     = trunk.port || (trunk.transport === "tls" ? 5061 : 5060);
      const isActive = trunk.status !== "inactive";
      const transport = (trunk.transport || "udp").toLowerCase();

      traceLog.push(`[START] Checking trunk "${trunk.name}" (${trunk.type}, ${transport.toUpperCase()}:${port})`);
      logger.info(`sipTrunkHealthCheck: trunk "${trunk.name}"`, {type: trunk.type, transport, port, host, isActive});

      // ── DNS ─────────────────────────────────────────────────────────────
      if (host) {
        try {
          traceLog.push(`[DNS] Resolving "${host}"…`);
          const addrs = await dns.lookup(host);
          traceLog.push(`[DNS] ✓ Resolved → ${addrs.address}`);
          checks.push({id: "dns", label: "DNS Resolution", ok: true, detail: `Resolved → ${addrs.address}`});
        } catch (e) {
          traceLog.push(`[DNS] ✗ Failed: ${e.message}`);
          checks.push({id: "dns", label: "DNS Resolution", ok: false, detail: `Failed: ${e.message}`});
          if (isActive) trunkIssues.push({severity: "critical", msg: `Trunk "${trunk.name}" — DNS lookup for ${host} failed: ${e.message}`});
        }
      } else {
        traceLog.push("[DNS] ✗ No host/registrar configured");
        checks.push({id: "dns", label: "DNS Resolution", ok: false, detail: "No host/registrar configured"});
        trunkIssues.push({severity: "critical", msg: `Trunk "${trunk.name}" — no host or registrar address configured`});
      }

      // ── Network connectivity — transport-aware ───────────────────────────
      // TCP probe is only valid for TCP and TLS. UDP uses datagrams — a TCP
      // handshake to a UDP SIP port will always fail/timeout even when the
      // SIP server is healthy. For UDP we skip the probe and note the limitation.
      if (!isActive) {
        traceLog.push("[NETWORK] Skipped — trunk is inactive");
        checks.push({id: "network", label: "Network Connectivity", ok: null, detail: "Skipped — trunk is inactive"});
      } else if (transport === "udp") {
        traceLog.push(`[NETWORK] Transport is UDP — TCP probe skipped (UDP datagrams cannot be verified via TCP handshake)`);
        checks.push({
          id: "network", label: "Network Connectivity", ok: null,
          detail: `UDP transport — TCP probe not applicable. SIP server reachability over UDP can only be confirmed by a live SIP OPTIONS exchange from Asterisk.`,
        });
        // Soft informational warning — not an error
        trunkIssues.push({severity: "info", msg: `Trunk "${trunk.name}" — UDP connectivity cannot be verified from the cloud (no SIP OPTIONS probe). Confirm reachability from Asterisk directly.`});
      } else if (host) {
        traceLog.push(`[NETWORK] ${transport.toUpperCase()} probe → ${host}:${port}…`);
        const probe = await tcpProbe(host, port, 4000);
        traceLog.push(`[NETWORK] ${probe.ok ? "✓" : "✗"} ${probe.msg}`);
        checks.push({id: "network", label: `${transport.toUpperCase()} Connectivity`, ok: probe.ok, detail: probe.msg});
        if (!probe.ok) trunkIssues.push({severity: "critical", msg: `Trunk "${trunk.name}" — ${transport.toUpperCase()} ${host}:${port} unreachable: ${probe.msg}`});
      }

      // ── Encryption/Transport consistency ─────────────────────────────────
      const encMismatch = trunk.encryption === "required" && transport !== "tls";
      traceLog.push(`[CONFIG] Encryption=${trunk.encryption}, Transport=${transport.toUpperCase()} → ${encMismatch ? "MISMATCH" : "OK"}`);
      checks.push({
        id: "config", label: "Encryption/Transport",
        ok: !encMismatch,
        detail: encMismatch
          ? `SRTP=Required but transport is ${transport.toUpperCase()} — signalling will be unencrypted`
          : `${transport.toUpperCase()} + ${trunk.encryption} — consistent`,
      });
      if (encMismatch) trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — SRTP Required but transport is ${transport.toUpperCase()}. Change transport to TLS or set encryption to Preferred/Disabled.`});

      // ── REGISTER parameters (register type only) ─────────────────────────
      // Validates that credentials exist AND are correctly formatted.
      // Network connectivity can be fine while REGISTER still fails due to
      // wrong username format, domain/registrar mismatch, bad codec SDP, etc.
      if (trunk.type === "register") {
        const credIssues = [];
        const regParamIssues = [];

        // Credential presence
        if (!trunk.registrar)         credIssues.push("registrar address missing");
        if (!trunk.username)          credIssues.push("username missing");
        if (!trunk.domain)            credIssues.push("SIP domain missing");
        if (!trunk.passwordEncrypted) credIssues.push("password not set");

        // REGISTER parameter format validation
        if (trunk.username?.includes("@")) {
          regParamIssues.push(`Username "${trunk.username}" includes "@" — use the account/extension number only, not a full SIP URI`);
        }
        if (trunk.domain?.includes(":")) {
          regParamIssues.push(`SIP domain "${trunk.domain}" includes a port — the domain field should be a bare hostname, e.g. sip.provider.co.il`);
        }
        if (trunk.registrar && trunk.domain) {
          // Check if registrar and domain share the same base domain
          const baseDomain = (h) => h.split(":")[0].split(".").slice(-2).join(".");
          if (baseDomain(trunk.registrar) !== baseDomain(trunk.domain)) {
            regParamIssues.push(`Registrar (${trunk.registrar}) and SIP domain (${trunk.domain}) have different base domains — verify this is intentional for your provider`);
          }
        }
        if (trunk.authUsername && trunk.authUsername.includes("@")) {
          regParamIssues.push(`Auth username "${trunk.authUsername}" includes "@" — this is usually just the account number`);
        }

        const credOk = credIssues.length === 0;
        const paramOk = regParamIssues.length === 0;

        traceLog.push(`[CREDS] ${credOk ? "✓ All credentials present" : "✗ " + credIssues.join(", ")}`);
        checks.push({
          id: "creds", label: "Credentials",
          ok: credOk,
          detail: credOk ? "All credentials present" : `Missing: ${credIssues.join(", ")}`,
        });
        if (!credOk) trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — missing credentials: ${credIssues.join(", ")}`});

        traceLog.push(`[REGISTER] ${paramOk ? "✓ Parameters look correct" : "✗ " + regParamIssues.join("; ")}`);
        checks.push({
          id: "register_params", label: "REGISTER Parameters",
          ok: paramOk,
          detail: paramOk
            ? `Username "${trunk.username || "—"}" @ domain "${trunk.domain || "—"}" via registrar "${trunk.registrar || "—"}" — format looks correct`
            : regParamIssues.join("; "),
        });
        if (!paramOk) {
          regParamIssues.forEach((msg) => trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — REGISTER param: ${msg}`}));
        }
      }

      // ── Codec validation ─────────────────────────────────────────────────
      // Having only "exotic" codecs means the SIP server may reject the INVITE
      // even when the network is fully reachable.
      const codecs = trunk.codecs || [];
      const G711_CODECS = ["PCMU", "PCMA"];
      const BASIC_VOICE_CODECS = [...G711_CODECS, "G729", "G722"];
      const hasG711 = codecs.some((c) => G711_CODECS.includes(c));
      const hasBasicVoice = codecs.some((c) => BASIC_VOICE_CODECS.includes(c));
      const exoticOnly = codecs.length > 0 && !hasBasicVoice;

      if (codecs.length === 0) {
        traceLog.push("[CODECS] ✗ No codecs configured");
        checks.push({id: "codecs", label: "Codec Compatibility", ok: false, detail: "No codecs configured — SIP INVITE will have an empty SDP offer, provider will reject the call"});
        trunkIssues.push({severity: "critical", msg: `Trunk "${trunk.name}" — no codecs configured. Add at least PCMU or PCMA.`});
      } else if (exoticOnly) {
        traceLog.push(`[CODECS] ⚠ Only non-standard codecs: ${codecs.join(", ")}`);
        checks.push({id: "codecs", label: "Codec Compatibility", ok: false, detail: `Only non-standard codecs (${codecs.join(", ")}) — Israeli SIP providers typically require G.711 (PCMU/PCMA) or G.729. Provider may reject INVITE.`});
        trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — codec mismatch risk: only ${codecs.join(", ")} configured. Add PCMU or PCMA for broadest compatibility.`});
      } else {
        const compatNote = hasG711 ? "G.711 included — maximum compatibility" : "G.729 included — verify provider supports it";
        traceLog.push(`[CODECS] ✓ ${codecs.join(", ")} — ${compatNote}`);
        checks.push({id: "codecs", label: "Codec Compatibility", ok: true, detail: `${codecs.join(", ")} — ${compatNote}`});
      }

      // ── DID assignment validity ───────────────────────────────────────────
      const dids = trunk.dids || [];
      const orphanedDids = dids.filter((d) => d.assistantId && !assistantIds.has(d.assistantId));
      if (orphanedDids.length > 0) {
        traceLog.push(`[DIDS] ✗ ${orphanedDids.length} DID(s) reference deleted assistants`);
        checks.push({id: "dids", label: "DID Assignments", ok: false, detail: `${orphanedDids.length} DID(s) point to deleted assistants`});
        trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — ${orphanedDids.length} DID(s) reference deleted assistants: ${orphanedDids.map((d) => d.number).join(", ")}`});
      } else if (dids.length > 0) {
        traceLog.push(`[DIDS] ✓ ${dids.length} DID(s) assigned`);
        checks.push({id: "dids", label: "DID Assignments", ok: true, detail: `${dids.length} DID(s) correctly assigned`});
      } else {
        traceLog.push("[DIDS] — No DIDs configured");
        checks.push({id: "dids", label: "DID Assignments", ok: null, detail: "No DIDs configured on this trunk"});
      }

      // ── IVR menu validity ─────────────────────────────────────────────────
      if (trunk.ivrMenu?.enabled) {
        const items = trunk.ivrMenu.items || [];
        const orphanedIvr = items.filter((it) => it.action === "assistant" && it.assistantId && !assistantIds.has(it.assistantId));
        const missingPrompt = !trunk.ivrMenu.prompt?.trim();
        if (orphanedIvr.length > 0 || missingPrompt) {
          const detail = [
            orphanedIvr.length > 0 ? `${orphanedIvr.length} menu item(s) reference deleted assistants` : "",
            missingPrompt ? "IVR greeting prompt is empty" : "",
          ].filter(Boolean).join("; ");
          traceLog.push(`[IVR] ✗ ${detail}`);
          checks.push({id: "ivr", label: "IVR Menu", ok: false, detail});
          trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — IVR issues: ${detail}`});
        } else {
          traceLog.push(`[IVR] ✓ ${items.length} item(s) valid`);
          checks.push({id: "ivr", label: "IVR Menu", ok: true, detail: `${items.length} menu item(s) — all valid`});
        }
      }

      // ── Outbound routes ───────────────────────────────────────────────────
      const routes = trunk.outboundRoutes || [];
      const badRoutes = routes.filter((r) => !r.pattern || !r.pattern.startsWith("+"));
      if (badRoutes.length > 0) {
        traceLog.push(`[ROUTES] ✗ ${badRoutes.length} route(s) missing + prefix`);
        checks.push({id: "routes", label: "Outbound Routes", ok: false, detail: `${badRoutes.length} route(s) missing + prefix`});
        trunkIssues.push({severity: "warning", msg: `Trunk "${trunk.name}" — ${badRoutes.length} outbound route(s) lack a + prefix (expected E.164)`});
      } else if (routes.length > 0) {
        traceLog.push(`[ROUTES] ✓ ${routes.length} route(s) valid`);
        checks.push({id: "routes", label: "Outbound Routes", ok: true, detail: `${routes.length} route(s) — patterns look valid`});
      }

      // ── IP Security (anti-fraud / call theft prevention) ─────────────────
      // This is the most critical SIP security control.
      // Peer trunks: authenticate by source IP only — an empty allowedIps list
      //   means ANYONE on the internet can send SIP traffic and make calls.
      // Register trunks: rely on credentials, but without IP restriction a
      //   brute-forced or leaked password exposes the account.
      if (trunk.type === "peer") {
        const allowedIps = trunk.allowedIps || [];
        if (allowedIps.length === 0) {
          traceLog.push("[IP-SECURITY] ✗ CRITICAL — Peer trunk has NO IP allowlist. Any IP can send SIP and make/receive calls.");
          checks.push({
            id: "ip_security",
            label: "IP Allowlist (Anti-Fraud)",
            ok: false,
            detail: "⚠️ NO IP ALLOWLIST — Peer trunk accepts traffic from any source IP. Any device on the internet can inject calls. Add the provider's IP range(s) immediately.",
          });
          trunkIssues.push({
            severity: "critical",
            msg: `Trunk "${trunk.name}" — SECURITY RISK: Peer trunk has no IP allowlist. This trunk accepts calls from ANY IP address — high risk of toll fraud and call theft. Add the provider's IP range under "Allowed IPs".`,
          });
        } else {
          traceLog.push(`[IP-SECURITY] ✓ Peer trunk protected — ${allowedIps.length} allowed IP/CIDR(s): ${allowedIps.join(", ")}`);
          checks.push({
            id: "ip_security",
            label: "IP Allowlist (Anti-Fraud)",
            ok: true,
            detail: `${allowedIps.length} allowed source IP/CIDR(s): ${allowedIps.join(", ")}`,
          });
        }
      } else if (trunk.type === "register") {
        // Register trunks use credentials — check that a password is set and warn if no IP filter
        const hasPassword = !!trunk.passwordEncrypted;
        if (!hasPassword) {
          traceLog.push("[IP-SECURITY] ✗ Register trunk has no password set — authentication impossible");
          checks.push({
            id: "ip_security",
            label: "Credential Security",
            ok: false,
            detail: "No password set — SIP registration will fail and the trunk is unprotected",
          });
          trunkIssues.push({severity: "critical", msg: `Trunk "${trunk.name}" — no SIP password set. Registration will fail and the line is unprotected.`});
        } else {
          traceLog.push("[IP-SECURITY] ✓ Register trunk — password-based authentication active");
          checks.push({
            id: "ip_security",
            label: "Credential Security",
            ok: true,
            detail: "Password authentication active. Tip: some providers also support IP-based ACLs for extra protection against credential leaks.",
          });
        }
      }

      // ── Summary ───────────────────────────────────────────────────────────
      const hasCritical = trunkIssues.some((i) => i.severity === "critical");
      const hasWarning  = trunkIssues.some((i) => i.severity === "warning");
      const trunkHealth = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";
      traceLog.push(`[END] Health: ${trunkHealth} — ${trunkIssues.length} issue(s) found (elapsed: ${Date.now() - hcStart}ms)`);

      logger.info(`sipTrunkHealthCheck: trunk "${trunk.name}" result`, {health: trunkHealth, issues: trunkIssues.length});

      return {
        id:        trunk.id,
        name:      trunk.name,
        type:      trunk.type,
        status:    trunk.status,
        transport: trunk.transport,
        health:    trunkHealth,
        checks,
        issues:    trunkIssues,
        trace:     traceLog,
      };
    }));

    // ── 4. Asterisk Bridge check ───────────────────────────────────────────
    let bridge = {status: "unconfigured", detail: "Asterisk bridge not configured"};
    const bridgeIssues = [];

    try {
      const targetId = companyId || uid;
      // Try both collection spellings
      let compSnap = await db.collection("Company").doc(targetId).get();
      if (!compSnap.exists) compSnap = await db.collection("companies").doc(targetId).get();

      if (compSnap.exists) {
        const compData = compSnap.data();
        const provider = compData.telephonyProvider;
        const bridgeUrl = compData.asteriskBridgeUrl;
        const hasBridgeSecret = !!compData.asteriskBridgeSecret;

        if (provider === "asterisk") {
          if (!bridgeUrl) {
            bridge = {status: "misconfigured", detail: "Provider set to Asterisk but no bridge URL configured"};
            bridgeIssues.push({severity: "critical", msg: "Asterisk provider selected but asteriskBridgeUrl is empty in Company settings"});
          } else {
            bridge = {status: "configured", url: bridgeUrl, hasSecret: hasBridgeSecret, detail: "Pinging bridge..."};
            if (!hasBridgeSecret) {
              bridgeIssues.push({severity: "warning", msg: "Asterisk bridge URL set but asteriskBridgeSecret is missing — webhook security disabled"});
            }

            // Ping /health
            try {
              const healthRes = await axios.get(`${bridgeUrl}/health`, {timeout: 5000});
              const hData = healthRes.data || {};
              bridge = {
                status: "online",
                url: bridgeUrl,
                hasSecret: hasBridgeSecret,
                asteriskConnected: hData.asteriskConnected,
                activeCalls: hData.activeCalls || 0,
                detail: hData.asteriskConnected
                  ? `Bridge online — Asterisk connected (${hData.activeCalls || 0} active calls)`
                  : "Bridge reachable but Asterisk PBX not connected",
              };
              if (!hData.asteriskConnected) {
                bridgeIssues.push({severity: "warning", msg: "Asterisk bridge is reachable but PBX reports Asterisk not connected"});
              }
            } catch (pingErr) {
              bridge = {status: "offline", url: bridgeUrl, hasSecret: hasBridgeSecret, detail: `Bridge unreachable: ${pingErr.message}`};
              bridgeIssues.push({severity: "critical", msg: `Asterisk bridge at ${bridgeUrl} is offline: ${pingErr.message}`});
            }
          }
        } else if (rawTrunks.length > 0) {
          // Has SIP trunks but company is NOT configured for Asterisk
          bridge = {
            status: "not_linked",
            detail: `Company telephony provider is "${provider || "twilio"}" — SIP trunks are defined but Asterisk bridge not enabled`,
          };
          bridgeIssues.push({
            severity: "warning",
            msg: `You have ${rawTrunks.length} SIP trunk(s) configured but your company telephony provider is set to "${provider || "twilio"}". To route calls through your SIP trunks, set telephonyProvider = "asterisk" in your Company settings.`,
          });
        }
      }
    } catch (bridgeErr) {
      logger.warn("sipTrunkHealthCheck: bridge check failed", bridgeErr.message);
      bridge = {status: "error", detail: `Could not read company config: ${bridgeErr.message}`};
    }

    // ── 5. Aggregate all issues ────────────────────────────────────────────
    const allIssues = [
      ...bridgeIssues,
      ...trunkResults.flatMap((t) => t.issues),
    ];

    const hasCritical = allIssues.some((i) => i.severity === "critical");
    const hasWarning  = allIssues.some((i) => i.severity === "warning");
    const summary     = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";

    logger.info("sipTrunkHealthCheck: completed", {uid, isSuperAdmin, summary, trunks: rawTrunks.length, issues: allIssues.length, elapsedMs: Date.now() - hcStart});

    res.status(200).json({
      status: "success",
      summary,
      checkedAt: new Date().toISOString(),
      trunkCount: rawTrunks.length,
      trunks: trunkResults,
      bridge,
      issues: allIssues,
    });
  } catch (err) {
    logger.error("sipTrunkHealthCheck error", err);
    res.status(500).json({status: "error", message: "Health check failed."});
  }
});

/**
 * POST /sipTrunkTest
 * Body: { id: string }
 * Tests network connectivity to the trunk's host/registrar via TCP probe + DNS lookup.
 * Full SIP OPTIONS ping requires the Asterisk bridge.
 */
exports.sipTrunkTest = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status: "error", message: "POST required."}); return; }

  const uid = await requireUid(req, res); if (!uid) return;

  try {
    const db = getFirestore();
    const trunkId = String((req.body || {}).id || "").trim();
    if (!trunkId) { res.status(400).json({status: "error", message: "id is required."}); return; }

    const access = await requireTrunkAccess(db, trunkId, uid, res);
    if (!access) return;
    const {snap, trunk} = access;
    const host   = trunk.type === "peer" ? trunk.host : trunk.registrar;
    const port   = trunk.port || (trunk.transport === "tls" ? 5061 : 5060);
    const steps  = [];
    let allOk    = true;

    // Step 1: DNS resolution
    try {
      const addrs = await dns.lookup(host);
      steps.push({step: "dns", ok: true, detail: `Resolved to ${addrs.address}`});
    } catch (e) {
      steps.push({step: "dns", ok: false, detail: `DNS lookup failed: ${e.message}`});
      allOk = false;
    }

    // Step 2: Connectivity probe — TCP/TLS only; UDP cannot be tested via TCP handshake
    const transport = (trunk.transport || "udp").toLowerCase();
    if (transport === "udp") {
      steps.push({
        step: "network",
        ok: null,
        detail: `UDP transport — TCP probe skipped. UDP connectivity can only be confirmed by a live SIP OPTIONS exchange from Asterisk. DNS resolved → host is reachable at network level.`,
      });
      // Don't mark allOk=false for UDP — it's not a failure, just untestable from cloud
    } else {
      const probe = await tcpProbe(host, port, 4000);
      steps.push({step: "network", ok: probe.ok, detail: probe.msg});
      if (!probe.ok) allOk = false;
    }

    // Step 3: Config sanity (encryption vs transport)
    const configOk = !(trunk.encryption === "required" && transport !== "tls");
    steps.push({
      step: "config",
      ok: configOk,
      detail: configOk
        ? `Encryption/transport settings are consistent (${transport.toUpperCase()}, ${trunk.encryption})`
        : "SRTP required but transport is not TLS — signalling will be unencrypted",
    });
    if (!configOk) allOk = false;

    // Step 4: IP allowlist check (Peer type)
    if (trunk.type === "peer") {
      const ips = trunk.allowedIps || [];
      const ipOk = ips.length > 0;
      steps.push({
        step: "security",
        ok: ipOk,
        detail: ipOk
          ? `IP allowlist configured — ${ips.length} allowed source(s): ${ips.join(", ")}`
          : "⚠️ No IP allowlist — peer trunk accepts traffic from any IP (toll fraud risk)",
      });
      if (!ipOk) allOk = false;
    }

    const message = allOk
      ? `${transport.toUpperCase()} trunk ${host}:${port} — all checks passed`
      : `Some checks failed — see details`;

    // Persist result
    await snap.ref.update({
      testResult:  {success: allOk, message, steps, testedAt: new Date().toISOString()},
      updatedAt:   FieldValue.serverTimestamp(),
    });

    logger.info(`sipTrunkTest: uid=${uid} trunkId=${trunkId} ok=${allOk}`);
    res.status(200).json({status: "success", ok: allOk, message, steps});
  } catch (err) {
    logger.error("sipTrunkTest error", err);
    res.status(500).json({status: "error", message: "Test failed."});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// sipInboundCall
// Called by the Asterisk bridge (POST /sipInboundCall) when a SIP call arrives.
// Validates the bridge secret, looks up the dialed number → assistant mapping,
// creates a callSession, and returns routing info so the bridge knows which
// assistant to connect the caller to.
//
// Request body (from bridge):
//   { channelId, from, to, bridgeSecret }
//
// Response:
//   { status:"ok", sessionId, assistantId, companyId, assistantName, greeting? }
// ─────────────────────────────────────────────────────────────────────────────
exports.sipInboundCall = onRequest(
  {cors: false, timeoutSeconds: 30, memory: "256MiB"},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    const {channelId, from, to, bridgeSecret} = req.body || {};

    if (!channelId || !from || !to || !bridgeSecret) {
      return res.status(400).json({error: "Missing required fields: channelId, from, to, bridgeSecret"});
    }

    const db = getFirestore();

    // ── 1. Validate bridge secret ─────────────────────────────────────────────
    // The bridge secret is stored encrypted in each company's Firestore doc.
    // We scan company docs to find the one whose decrypted secret matches.
    // Abort early once found — typical deployment has one company.
    let foundCompany = null;
    try {
      const companySnap = await db.collection("Company").get();
      for (const doc of companySnap.docs) {
        const data = doc.data();
        if (!data.asteriskBridgeSecret) continue;
        const storedSecret = decryptPassword(data.asteriskBridgeSecret);
        if (storedSecret && storedSecret === bridgeSecret) {
          foundCompany = {id: doc.id, ...data};
          break;
        }
      }
    } catch (err) {
      logger.error("[sipInboundCall] Error scanning companies:", err);
      return res.status(500).json({error: "Internal error"});
    }

    if (!foundCompany) {
      logger.warn("[sipInboundCall] Invalid bridge secret — rejecting inbound call");
      return res.status(403).json({error: "Invalid bridge secret"});
    }

    // ── 2. Normalise dialed number ────────────────────────────────────────────
    let normalizedTo = to.trim();
    if (!normalizedTo.startsWith("+")) normalizedTo = `+${normalizedTo}`;

    // ── 3. Look up phone number → assistant mapping ───────────────────────────
    let assistantId = foundCompany.defaultAssistantId || null;
    let assistantName = null;

    try {
      const phoneQuery = await db.collection("phone_numbers")
        .where("companyId", "==", foundCompany.id)
        .where("number", "==", normalizedTo)
        .limit(1)
        .get();

      if (!phoneQuery.empty) {
        const phoneData = phoneQuery.docs[0].data();
        if (phoneData.assistantId) assistantId = phoneData.assistantId;
      }
    } catch (err) {
      logger.error("[sipInboundCall] Error querying phone_numbers:", err);
    }

    // Fall back to SIP trunk's per-DID mapping or defaultAssistantId
    if (!assistantId) {
      try {
        const trunkQuery = await db.collection("sip_trunks")
          .where("companyId", "==", foundCompany.id)
          .limit(5)
          .get();
        if (!trunkQuery.empty) {
          // Strip the leading + for matching against trunk DIDs (stored without +)
          const strippedTo = normalizedTo.replace(/^\+/, "");
          for (const trunkDoc of trunkQuery.docs) {
            const trunkData = trunkDoc.data();
            // Check per-DID mapping in the dids[] array first
            const dids = Array.isArray(trunkData.dids) ? trunkData.dids : [];
            const didEntry = dids.find(d =>
              d.number === strippedTo || d.number === normalizedTo
            );
            if (didEntry && didEntry.assistantId) {
              assistantId = didEntry.assistantId;
              logger.info(`[sipInboundCall] Matched DID ${strippedTo} → assistant ${assistantId} via trunk ${trunkDoc.id}`);
              break;
            }
            // Fall back to trunk-level default
            if (!assistantId && trunkData.defaultAssistantId) {
              assistantId = trunkData.defaultAssistantId;
            }
          }
        }
      } catch (err) {
        logger.warn("[sipInboundCall] Could not check SIP trunk for assistant fallback:", err.message);
      }
    }

    if (!assistantId) {
      logger.warn(`[sipInboundCall] No assistant configured for ${normalizedTo} in company ${foundCompany.id}`);
      return res.status(404).json({
        error: "No assistant configured for this number",
        to: normalizedTo,
        companyId: foundCompany.id,
      });
    }

    // ── 4. Fetch assistant details ────────────────────────────────────────────
    try {
      const assistantSnap = await db.collection("Assistants").doc(assistantId).get();
      if (assistantSnap.exists) {
        assistantName = assistantSnap.data().name || null;
      }
    } catch (err) {
      logger.warn("[sipInboundCall] Could not fetch assistant details:", err.message);
    }

    // ── 5. Create call session ────────────────────────────────────────────────
    const sessionRef = db.collection("call_sessions").doc();
    try {
      await sessionRef.set({
        sessionId: sessionRef.id,
        companyId: foundCompany.id,
        assistantId,
        assistantName,
        from,
        to: normalizedTo,
        channelId,
        source: "sip_asterisk",
        status: "active",
        startTime: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.error("[sipInboundCall] Failed to create callSession:", err);
      // Non-fatal — still return routing info to bridge
    }

    logger.info(`[sipInboundCall] Routed: ${from} → ${normalizedTo} → assistant "${assistantName}" (${assistantId}), session ${sessionRef.id}`);

    // ── 6. Return routing info to bridge ─────────────────────────────────────
    res.status(200).json({
      status: "ok",
      sessionId: sessionRef.id,
      assistantId,
      assistantName,
      companyId: foundCompany.id,
    });
  },
);

// ── SIP Trace: Save (called by the bridge after each call) ───────────────────
// POST /sipTraceSave — bridge posts a base64-encoded PCAP for each finished call.
// Auth: same bridge-secret scan used by sipInboundCall.
exports.sipTraceSave = onRequest(
  {cors: false, timeoutSeconds: 60, memory: "512MiB"},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});

    const {bridgeSecret, channelId, sessionId, from, to, companyId, startMs, endMs, pcapB64} =
      req.body || {};

    if (!bridgeSecret || !channelId || !pcapB64) {
      return res.status(400).json({error: "Missing required fields"});
    }

    // Validate bridge secret — scan Company docs (same as sipInboundCall)
    const db = getFirestore();
    let foundCompanyId = companyId || null;
    if (!foundCompanyId) {
      const snap = await db.collection("Company").get();
      for (const doc of snap.docs) {
        const stored = decryptPassword(doc.data().asteriskBridgeSecret);
        if (stored && stored === bridgeSecret) { foundCompanyId = doc.id; break; }
      }
    } else {
      // Verify secret matches the given companyId
      const doc = await db.collection("Company").doc(foundCompanyId).get();
      if (!doc.exists) return res.status(403).json({error: "Invalid company"});
      const stored = decryptPassword(doc.data().asteriskBridgeSecret);
      if (!stored || stored !== bridgeSecret) return res.status(403).json({error: "Invalid bridge secret"});
    }
    if (!foundCompanyId) return res.status(403).json({error: "Invalid bridge secret"});

    // Reject payloads > 2.5 MB base64 (≈ 1.9 MB binary)
    if (pcapB64.length > 2.5 * 1024 * 1024) {
      return res.status(413).json({error: "PCAP too large"});
    }

    const traceId = channelId.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();
    await db.collection("sip_traces").doc(traceId).set({
      traceId,
      channelId,
      sessionId:  sessionId  || null,
      from:       from       || "",
      to:         to         || "",
      companyId:  foundCompanyId,
      startMs:    startMs    || null,
      endMs:      endMs      || null,
      durationMs: (startMs && endMs) ? (endMs - startMs) : null,
      pcapB64,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info(`[sipTraceSave] Saved trace ${traceId} for channel ${channelId} (${pcapB64.length} B b64)`);
    return res.status(200).json({status: "ok", traceId});
  },
);

// ── SIP Trace: List (authenticated user, own company only) ───────────────────
// GET /sipTracesList[?limit=50]
exports.sipTracesList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireUid(req, res);
  if (!uid) return;

  const db  = getFirestore();
  // Use getCompanyId() which handles both direct companyId field and legacy
  // owner-as-company pattern (uid == companyId).
  const cid = (await getCompanyId(uid)) || uid;
  if (!cid) return res.status(400).json({status: "error", message: "No company associated with account"});

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const snap  = await db.collection("sip_traces")
    .where("companyId", "==", cid)
    .orderBy("startMs", "desc")
    .limit(limit)
    .get();

  // Strip pcapB64 from the list — only returned on download
  const traces = snap.docs.map((d) => {
    const {pcapB64, ...rest} = d.data(); // eslint-disable-line no-unused-vars
    return rest;
  });

  return res.json({status: "ok", traces});
});

// ── SIP Trace: Download PCAP ──────────────────────────────────────────────────
// GET /sipTraceDownload?traceId=xxx  → application/vnd.tcpdump.pcap binary
exports.sipTraceDownload = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  const uid = await requireUid(req, res);
  if (!uid) return;

  const traceId = req.query.traceId;
  if (!traceId) return res.status(400).json({status: "error", message: "traceId query param required"});

  const db  = getFirestore();
  const cid = (await getCompanyId(uid)) || uid;

  const traceDoc = await db.collection("sip_traces").doc(String(traceId)).get();
  if (!traceDoc.exists) return res.status(404).json({status: "error", message: "Trace not found"});

  const trace = traceDoc.data();
  if (trace.companyId !== cid) return res.status(403).json({status: "error", message: "Forbidden"});
  if (!trace.pcapB64)          return res.status(404).json({status: "error", message: "No PCAP data for this trace"});

  const pcapBuf  = Buffer.from(trace.pcapB64, "base64");
  const filename = `sip-trace-${traceId}.pcap`;
  res.set("Content-Type",        "application/vnd.tcpdump.pcap");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.set("Content-Length",      String(pcapBuf.length));
  return res.send(pcapBuf);
});
