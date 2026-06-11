/**
 * compliance_service.js â€” Compliance Intelligence Engine
 *
 * Protects every call on the platform from TCPA, GDPR, HIPAA, and PCI violations.
 *
 * Endpoints:
 *  POST complianceCheckCall       â€” Pre-call TCPA + DNC + consent check
 *  POST complianceDncAdd          â€” Add number to Do Not Call list
 *  POST complianceDncRemove       â€” Remove number from DNC list
 *  GET  complianceDncList         â€” List DNC entries for this account
 *  POST complianceConsentRecord   â€” Record explicit consent for a phone number
 *  GET  complianceConsentList     â€” List consent records
 *  POST complianceLogViolation    â€” Internal: log PII violation (called from Cloud Run)
 *  GET  complianceGetReport       â€” Per-call compliance report + score
 *  GET  complianceDashboard       â€” Aggregate stats (last 30 days)
 *
 * Firestore collections:
 *  dnc_list              { phoneNumber, ownerId, reason, addedAt }
 *  compliance_consents   { phoneNumber, ownerId, consentType, source, active, consentedAt }
 *  compliance_violations { callSessionId, ownerId, violationType, severity, description, regulation, transcriptChunk, detectedAt }
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore, FieldValue, Timestamp} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const {
  sanitizeObject,
  applyRateLimit,
  extractUidFromRequest,
} = require("./security_utils");
const {safeJsonParse, normalizePhoneNumber} = require("./workflow_utils");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â”€â”€ US Area Code â†’ IANA Timezone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Covers all 50 states + DC, PR, VI.  Used for TCPA time-window enforcement.
const US_AREA_CODE_TZ = {
  "201":"America/New_York","202":"America/New_York","203":"America/New_York",
  "205":"America/Chicago","206":"America/Los_Angeles","207":"America/New_York",
  "208":"America/Boise","209":"America/Los_Angeles","210":"America/Chicago",
  "212":"America/New_York","213":"America/Los_Angeles","214":"America/Chicago",
  "215":"America/New_York","216":"America/New_York","217":"America/Chicago",
  "218":"America/Chicago","219":"America/Chicago","224":"America/Chicago",
  "225":"America/Chicago","228":"America/Chicago","229":"America/New_York",
  "231":"America/Detroit","234":"America/New_York","239":"America/New_York",
  "240":"America/New_York","248":"America/Detroit","251":"America/Chicago",
  "252":"America/New_York","253":"America/Los_Angeles","254":"America/Chicago",
  "256":"America/Chicago","260":"America/Indiana/Indianapolis","262":"America/Chicago",
  "267":"America/New_York","269":"America/Detroit","270":"America/Chicago",
  "276":"America/New_York","281":"America/Chicago","301":"America/New_York",
  "302":"America/New_York","303":"America/Denver","304":"America/New_York",
  "305":"America/New_York","307":"America/Denver","308":"America/Chicago",
  "309":"America/Chicago","310":"America/Los_Angeles","312":"America/Chicago",
  "313":"America/Detroit","314":"America/Chicago","315":"America/New_York",
  "316":"America/Chicago","317":"America/Indiana/Indianapolis","318":"America/Chicago",
  "319":"America/Chicago","320":"America/Chicago","321":"America/New_York",
  "323":"America/Los_Angeles","325":"America/Chicago","330":"America/New_York",
  "331":"America/Chicago","334":"America/Chicago","336":"America/New_York",
  "337":"America/Chicago","339":"America/New_York","347":"America/New_York",
  "351":"America/New_York","352":"America/New_York","360":"America/Los_Angeles",
  "361":"America/Chicago","386":"America/New_York","401":"America/New_York",
  "402":"America/Chicago","404":"America/New_York","405":"America/Chicago",
  "406":"America/Denver","407":"America/New_York","408":"America/Los_Angeles",
  "409":"America/Chicago","410":"America/New_York","412":"America/New_York",
  "413":"America/New_York","414":"America/Chicago","415":"America/Los_Angeles",
  "417":"America/Chicago","419":"America/New_York","423":"America/New_York",
  "424":"America/Los_Angeles","425":"America/Los_Angeles","430":"America/Chicago",
  "432":"America/Chicago","434":"America/New_York","435":"America/Denver",
  "440":"America/New_York","442":"America/Los_Angeles","443":"America/New_York",
  "469":"America/Chicago","470":"America/New_York","475":"America/New_York",
  "478":"America/New_York","479":"America/Chicago","480":"America/Phoenix",
  "484":"America/New_York","501":"America/Chicago","502":"America/Kentucky/Louisville",
  "503":"America/Los_Angeles","504":"America/Chicago","505":"America/Denver",
  "507":"America/Chicago","508":"America/New_York","509":"America/Los_Angeles",
  "510":"America/Los_Angeles","512":"America/Chicago","513":"America/New_York",
  "515":"America/Chicago","516":"America/New_York","517":"America/Detroit",
  "518":"America/New_York","520":"America/Phoenix","530":"America/Los_Angeles",
  "540":"America/New_York","541":"America/Los_Angeles","559":"America/Los_Angeles",
  "561":"America/New_York","562":"America/Los_Angeles","563":"America/Chicago",
  "567":"America/New_York","570":"America/New_York","571":"America/New_York",
  "573":"America/Chicago","574":"America/Indiana/Indianapolis","580":"America/Chicago",
  "585":"America/New_York","586":"America/Detroit","601":"America/Chicago",
  "602":"America/Phoenix","603":"America/New_York","605":"America/Chicago",
  "606":"America/New_York","607":"America/New_York","608":"America/Chicago",
  "609":"America/New_York","610":"America/New_York","612":"America/Chicago",
  "614":"America/New_York","615":"America/Chicago","616":"America/Detroit",
  "617":"America/New_York","618":"America/Chicago","619":"America/Los_Angeles",
  "620":"America/Chicago","623":"America/Phoenix","626":"America/Los_Angeles",
  "630":"America/Chicago","631":"America/New_York","636":"America/Chicago",
  "641":"America/Chicago","646":"America/New_York","650":"America/Los_Angeles",
  "651":"America/Chicago","660":"America/Chicago","661":"America/Los_Angeles",
  "662":"America/Chicago","678":"America/New_York","682":"America/Chicago",
  "701":"America/Chicago","702":"America/Los_Angeles","703":"America/New_York",
  "704":"America/New_York","706":"America/New_York","707":"America/Los_Angeles",
  "708":"America/Chicago","712":"America/Chicago","713":"America/Chicago",
  "714":"America/Los_Angeles","715":"America/Chicago","716":"America/New_York",
  "717":"America/New_York","718":"America/New_York","719":"America/Denver",
  "720":"America/Denver","724":"America/New_York","727":"America/New_York",
  "731":"America/Chicago","732":"America/New_York","734":"America/Detroit",
  "737":"America/Chicago","740":"America/New_York","754":"America/New_York",
  "757":"America/New_York","760":"America/Los_Angeles","763":"America/Chicago",
  "765":"America/Indiana/Indianapolis","770":"America/New_York","772":"America/New_York",
  "773":"America/Chicago","775":"America/Los_Angeles","781":"America/New_York",
  "785":"America/Chicago","786":"America/New_York","801":"America/Denver",
  "802":"America/New_York","803":"America/New_York","804":"America/New_York",
  "805":"America/Los_Angeles","806":"America/Chicago","808":"Pacific/Honolulu",
  "810":"America/Detroit","812":"America/Indiana/Indianapolis","813":"America/New_York",
  "814":"America/New_York","815":"America/Chicago","816":"America/Chicago",
  "817":"America/Chicago","818":"America/Los_Angeles","828":"America/New_York",
  "830":"America/Chicago","831":"America/Los_Angeles","832":"America/Chicago",
  "843":"America/New_York","845":"America/New_York","847":"America/Chicago",
  "848":"America/New_York","850":"America/Chicago","856":"America/New_York",
  "857":"America/New_York","858":"America/Los_Angeles","859":"America/Kentucky/Louisville",
  "860":"America/New_York","862":"America/New_York","863":"America/New_York",
  "864":"America/New_York","865":"America/New_York","870":"America/Chicago",
  "872":"America/Chicago","878":"America/New_York","901":"America/Chicago",
  "903":"America/Chicago","904":"America/New_York","906":"America/Detroit",
  "907":"America/Anchorage","908":"America/New_York","909":"America/Los_Angeles",
  "910":"America/New_York","912":"America/New_York","913":"America/Chicago",
  "914":"America/New_York","915":"America/Denver","916":"America/Los_Angeles",
  "917":"America/New_York","918":"America/Chicago","919":"America/New_York",
  "920":"America/Chicago","925":"America/Los_Angeles","928":"America/Phoenix",
  "931":"America/Chicago","936":"America/Chicago","937":"America/New_York",
  "940":"America/Chicago","941":"America/New_York","947":"America/Detroit",
  "949":"America/Los_Angeles","951":"America/Los_Angeles","952":"America/Chicago",
  "954":"America/New_York","956":"America/Chicago","970":"America/Denver",
  "971":"America/Los_Angeles","972":"America/Chicago","973":"America/New_York",
  "978":"America/New_York","979":"America/Chicago","980":"America/New_York",
  "984":"America/New_York","985":"America/Chicago","989":"America/Detroit",
};

// Country calling code â†’ IANA timezone (longest-prefix match)
const COUNTRY_CODE_TZ = {
  "972":"Asia/Jerusalem","966":"Asia/Riyadh","971":"Asia/Dubai",
  "962":"Asia/Amman","961":"Asia/Beirut","963":"Asia/Damascus",
  "20":"Africa/Cairo","30":"Europe/Athens","7":"Europe/Moscow",
  "380":"Europe/Kiev","48":"Europe/Warsaw","49":"Europe/Berlin",
  "44":"Europe/London","33":"Europe/Paris","34":"Europe/Madrid",
  "39":"Europe/Rome","91":"Asia/Kolkata","86":"Asia/Shanghai",
  "81":"Asia/Tokyo","82":"Asia/Seoul","55":"America/Sao_Paulo",
  "52":"America/Mexico_City","61":"Australia/Sydney","64":"Pacific/Auckland",
  "90":"Europe/Istanbul","31":"Europe/Amsterdam","32":"Europe/Brussels",
  "41":"Europe/Zurich","46":"Europe/Stockholm","47":"Europe/Oslo",
  "45":"Europe/Copenhagen","358":"Europe/Helsinki","36":"Europe/Budapest",
  "420":"Europe/Prague","40":"Europe/Bucharest","359":"Europe/Sofia",
  "385":"Europe/Zagreb","381":"Europe/Belgrade",
};

/**
 * Determine IANA timezone for a phone number (E.164 digits, no +)
 */
function getTimezoneForPhone(e164digits) {
  if (!e164digits) return null;
  const d = String(e164digits).replace(/\D/g, "");
  // US/Canada (+1): 11 digits starting with 1
  if (d.startsWith("1") && d.length === 11) {
    const area = d.substring(1, 4);
    return US_AREA_CODE_TZ[area] || "America/New_York";
  }
  // Try country codes longest-first to avoid false matches
  for (const [prefix] of Object.entries(COUNTRY_CODE_TZ).sort((a, b) => b[0].length - a[0].length)) {
    if (d.startsWith(prefix)) return COUNTRY_CODE_TZ[prefix];
  }
  return null;
}

/**
 * TCPA compliance: calls only allowed 8amâ€“9pm caller-local time.
 * Returns { allowed, localTime, timezone, reason? }
 */
function checkTcpaTime(phoneNumber) {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  // Only enforce TCPA for +1 US numbers
  if (!digits.startsWith("1") || digits.length !== 11) {
    return {allowed: true, localTime: "n/a", timezone: "n/a", tcpaApplicable: false};
  }
  const tz = getTimezoneForPhone(digits);
  if (!tz) return {allowed: true, localTime: "unknown", timezone: "unknown", flagged: true};

  try {
    const now = new Date();
    // toLocaleTimeString with timeZone gives us local hour
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(now);
    const hour   = parseInt(parts.find(p => p.type === "hour")?.value   || "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const localTime = `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    const totalMinutes = hour * 60 + minute;
    // TCPA window: 08:00â€“21:00 = 480â€“1260 minutes
    const allowed = totalMinutes >= 480 && totalMinutes <= 1260;
    return {
      allowed,
      localTime,
      timezone: tz,
      tcpaApplicable: true,
      ...(allowed ? {} : {
        reason: `TCPA: local time is ${localTime} (${tz}). Calls are only permitted 8amâ€“9pm local time.`,
      }),
    };
  } catch (e) {
    return {allowed: true, localTime: "error", timezone: tz, flagged: true};
  }
}

// â”€â”€ PII Detection Patterns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PII_PATTERNS = [
  {
    type: "credit_card",
    severity: "critical",
    regulation: "PCI-DSS",
    description: "Credit card number detected in transcript",
    // Visa, Mastercard, Amex, Discover
    regex: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d\d)\d{12})\b/,
  },
  {
    type: "us_ssn",
    severity: "critical",
    regulation: "HIPAA/PII",
    description: "US Social Security Number detected",
    regex: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/,
  },
  {
    type: "bank_routing",
    severity: "high",
    regulation: "PCI-DSS",
    description: "Possible US bank routing number (9 digits)",
    regex: /\b\d{9}\b/,
  },
  {
    type: "date_of_birth",
    severity: "medium",
    regulation: "HIPAA/GDPR",
    description: "Date of birth pattern detected",
    regex: /\b(?:0[1-9]|1[0-2])[\/\-](?:0[1-9]|[12]\d|3[01])[\/\-]\d{2,4}\b/,
  },
  {
    type: "medical_info",
    severity: "high",
    regulation: "HIPAA",
    description: "Medical information keyword detected",
    regex: /\b(diagnosis|prescription|patient id|medical record|health insurance|policy number|blood type|medication)\b/i,
  },
  {
    type: "il_id",
    severity: "high",
    regulation: "GDPR/Privacy",
    description: "Israeli ID number pattern detected",
    regex: /\b\d{9}\b/,
  },
];

/**
 * Scan a transcript chunk for PII/compliance violations.
 * Returns array of violation objects (empty = clean).
 */
function detectPiiViolations(text) {
  if (!text || typeof text !== "string") return [];
  const found = [];
  const seen = new Set();
  for (const p of PII_PATTERNS) {
    if (seen.has(p.type)) continue;
    if (p.regex.test(text)) {
      seen.add(p.type);
      found.push({
        type: p.type,
        severity: p.severity,
        regulation: p.regulation,
        description: p.description,
        detectedAt: new Date().toISOString(),
      });
    }
  }
  return found;
}

/**
 * Check whether required TCPA disclosures appear in the transcript.
 * Returns { hasAllDisclosures, missing[] }
 */
function checkTcpaDisclosures(transcript) {
  const lower = (transcript || "").toLowerCase();
  const REQUIRED = [
    {key: "recording_notice",   patterns: ["recorded", "recording", "monitored"], label: "Call recording notice"},
    {key: "agent_identity",     patterns: ["my name is", "this is ", "calling from", "calling on behalf"], label: "Agent/company identification"},
    {key: "opt_out_notice",     patterns: ["press 9", "opt out", "do not call", "remove you from"], label: "Opt-out instruction"},
  ];
  const missing = REQUIRED
    .filter(r => !r.patterns.some(p => lower.includes(p)))
    .map(r => r.label);
  return {hasAllDisclosures: missing.length === 0, missing};
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function normalizePhone(raw) {
  if (!raw) return null;
  return normalizePhoneNumber(raw) || String(raw).replace(/\D/g, "") || null;
}

// â”€â”€ Pre-call Compliance Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.complianceCheckCall = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }
  if (!applyRateLimit(req, res, {maxRequests: 100, windowMs: 60000})) return;

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {phoneNumber, checkType = "full"} = payload;
    if (!phoneNumber) { res.status(400).json({status:"error",message:"phoneNumber is required"}); return; }

    const normalized = normalizePhone(phoneNumber);
    if (!normalized) { res.status(400).json({status:"error",message:"Invalid phone number"}); return; }

    const db = getFirestore();
    const result = {phoneNumber: normalized, checks: {}, passed: true, violations: [], warnings: []};

    // 1. TCPA time-window check (US numbers only)
    if (checkType === "full" || checkType === "tcpa") {
      const tcpa = checkTcpaTime(normalized);
      result.checks.tcpa = tcpa;
      if (tcpa.tcpaApplicable && !tcpa.allowed) {
        result.passed = false;
        result.violations.push({type: "tcpa_time", severity: "critical", message: tcpa.reason});
      }
    }

    // 2. DNC check (internal list + global entries)
    if (checkType === "full" || checkType === "dnc") {
      const [ownedSnap, globalSnap] = await Promise.all([
        db.collection("dnc_list").where("ownerId","==",uid).where("phoneNumber","==",normalized).limit(1).get(),
        db.collection("dnc_list").where("ownerId","==","global").where("phoneNumber","==",normalized).limit(1).get(),
      ]);
      const onDnc = !ownedSnap.empty || !globalSnap.empty;
      result.checks.dnc = {onList: onDnc};
      if (onDnc) {
        const entry = (!ownedSnap.empty ? ownedSnap : globalSnap).docs[0].data();
        result.passed = false;
        result.violations.push({
          type: "dnc",
          severity: "critical",
          message: `Number is on the Do Not Call list${entry.reason ? `: ${entry.reason}` : ""}`,
          addedAt: entry.addedAt?.toDate?.()?.toISOString() || null,
        });
      }
    }

    // 3. Consent check
    if (checkType === "full" || checkType === "consent") {
      const consentSnap = await db.collection("compliance_consents")
        .where("ownerId","==",uid)
        .where("phoneNumber","==",normalized)
        .where("active","==",true)
        .limit(1).get();
      const hasConsent = !consentSnap.empty;
      result.checks.consent = {hasConsent};
      if (!hasConsent) {
        // Warning (not a hard block â€” consent requirements vary by use-case)
        result.warnings.push({
          type: "no_consent",
          severity: "warning",
          message: "No explicit consent record found for this number",
        });
      }
    }

    res.status(200).json({status:"ok", ...result});
  } catch (e) {
    logger.error("complianceCheckCall", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ DNC Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.complianceDncAdd = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {phoneNumber, reason = ""} = payload;
    if (!phoneNumber) { res.status(400).json({status:"error",message:"phoneNumber required"}); return; }

    const normalized = normalizePhone(phoneNumber);
    if (!normalized) { res.status(400).json({status:"error",message:"Invalid phone number"}); return; }

    const db = getFirestore();
    // Upsert â€” don't create duplicates
    const existing = await db.collection("dnc_list")
      .where("ownerId","==",uid).where("phoneNumber","==",normalized).limit(1).get();
    if (!existing.empty) {
      await existing.docs[0].ref.update({reason: reason.trim(), updatedAt: FieldValue.serverTimestamp()});
    } else {
      await db.collection("dnc_list").add({
        phoneNumber: normalized,
        ownerId: uid,
        reason: reason.trim(),
        addedAt: FieldValue.serverTimestamp(),
      });
    }
    res.status(200).json({status:"ok", message:`${normalized} added to DNC list`});
  } catch (e) {
    logger.error("complianceDncAdd", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.complianceDncRemove = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {phoneNumber} = payload;
    if (!phoneNumber) { res.status(400).json({status:"error",message:"phoneNumber required"}); return; }

    const normalized = normalizePhone(phoneNumber);
    const db = getFirestore();
    const snap = await db.collection("dnc_list")
      .where("ownerId","==",uid).where("phoneNumber","==",normalized).get();

    if (snap.empty) { res.status(404).json({status:"error",message:"Number not found on DNC list"}); return; }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.status(200).json({status:"ok", message:`${normalized} removed from DNC list`, removed: snap.size});
  } catch (e) {
    logger.error("complianceDncRemove", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.complianceDncList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const db = getFirestore();
    const snap = await db.collection("dnc_list")
      .where("ownerId","==",uid).orderBy("addedAt","desc").limit(1000).get();

    const entries = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      addedAt: d.data().addedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", entries, count: entries.length});
  } catch (e) {
    logger.error("complianceDncList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// Bulk-import DNC numbers (CSV/array)
exports.complianceDncBulkAdd = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    // Accept either { numbers: [...] } or { csv: "num1\nnum2\n..." }
    let rawNumbers = [];
    if (Array.isArray(payload.numbers)) rawNumbers = payload.numbers;
    else if (typeof payload.csv === "string") rawNumbers = payload.csv.split(/[\n,;]+/);
    else { res.status(400).json({status:"error",message:"numbers (array) or csv (string) required"}); return; }

    const reason = payload.reason || "";
    const db = getFirestore();
    const now = FieldValue.serverTimestamp();
    let added = 0;
    let skipped = 0;

    // Batch in groups of 500 (Firestore limit)
    const chunks = [];
    for (let i = 0; i < rawNumbers.length; i += 400) chunks.push(rawNumbers.slice(i, i + 400));

    for (const chunk of chunks) {
      const batch = db.batch();
      for (const raw of chunk) {
        const normalized = normalizePhone(String(raw).trim());
        if (!normalized) { skipped++; continue; }
        const ref = db.collection("dnc_list").doc();
        batch.set(ref, {phoneNumber: normalized, ownerId: uid, reason, addedAt: now});
        added++;
      }
      await batch.commit();
    }

    res.status(200).json({status:"ok", added, skipped, total: rawNumbers.length});
  } catch (e) {
    logger.error("complianceDncBulkAdd", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Consent Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.complianceConsentRecord = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {phoneNumber, consentType = "voice_call", source = "manual", notes = ""} = payload;
    if (!phoneNumber) { res.status(400).json({status:"error",message:"phoneNumber required"}); return; }

    const normalized = normalizePhone(phoneNumber);
    if (!normalized) { res.status(400).json({status:"error",message:"Invalid phone number"}); return; }

    const db = getFirestore();
    const docRef = await db.collection("compliance_consents").add({
      phoneNumber: normalized,
      ownerId: uid,
      consentType,
      source,
      notes: notes.trim(),
      active: true,
      consentedAt: FieldValue.serverTimestamp(),
    });
    res.status(200).json({status:"ok", id: docRef.id, message:"Consent recorded"});
  } catch (e) {
    logger.error("complianceConsentRecord", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

exports.complianceConsentList = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const db = getFirestore();
    const snap = await db.collection("compliance_consents")
      .where("ownerId","==",uid).where("active","==",true)
      .orderBy("consentedAt","desc").limit(1000).get();

    const entries = snap.docs.map(d => ({
      id: d.id, ...d.data(),
      consentedAt: d.data().consentedAt?.toDate?.()?.toISOString() || null,
    }));
    res.status(200).json({status:"ok", entries, count: entries.length});
  } catch (e) {
    logger.error("complianceConsentList", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// Revoke consent
exports.complianceConsentRevoke = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({status:"error",message:"POST required"}); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const payload = sanitizeObject(safeJsonParse(req.body));
    const {phoneNumber} = payload;
    if (!phoneNumber) { res.status(400).json({status:"error",message:"phoneNumber required"}); return; }

    const normalized = normalizePhone(phoneNumber);
    const db = getFirestore();
    const snap = await db.collection("compliance_consents")
      .where("ownerId","==",uid).where("phoneNumber","==",normalized).where("active","==",true).get();

    if (snap.empty) { res.status(404).json({status:"error",message:"No active consent found"}); return; }

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, {active: false, revokedAt: FieldValue.serverTimestamp()}));
    await batch.commit();
    res.status(200).json({status:"ok", message:"Consent revoked", revoked: snap.size});
  } catch (e) {
    logger.error("complianceConsentRevoke", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Violation Logging (internal â€” called from Cloud Run) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// No CORS / no auth â€” trusted internal traffic only.
// Cloud Run uses the service account, not user tokens.
exports.complianceLogViolation = onRequest(async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({status:"error"}); return; }

  try {
    const payload = safeJsonParse(req.body) || {};
    const {callSessionId, ownerId, violations, transcriptChunk} = payload;

    if (!callSessionId || !Array.isArray(violations) || violations.length === 0) {
      res.status(400).json({status:"error", message:"callSessionId and violations[] required"});
      return;
    }

    const db = getFirestore();
    const batch = db.batch();
    const truncatedChunk = transcriptChunk ? String(transcriptChunk).slice(0, 300) : null;

    for (const v of violations) {
      const ref = db.collection("compliance_violations").doc();
      batch.set(ref, {
        callSessionId,
        ownerId: ownerId || null,
        violationType: v.type,
        severity: v.severity,
        description: v.description || "",
        regulation: v.regulation || null,
        transcriptChunk: truncatedChunk,
        detectedAt: FieldValue.serverTimestamp(),
      });
    }

    // Tag the call session so the UI can show a compliance badge
    batch.set(db.collection("call_sessions").doc(callSessionId), {
      hasComplianceIssues: true,
      complianceViolationCount: FieldValue.increment(violations.length),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    await batch.commit();
    res.status(200).json({status:"ok", logged: violations.length});
  } catch (e) {
    logger.error("complianceLogViolation", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Per-call Compliance Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.complianceGetReport = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const callSessionId = req.query.callSessionId || safeJsonParse(req.body)?.callSessionId;
    if (!callSessionId) { res.status(400).json({status:"error",message:"callSessionId required"}); return; }

    const db = getFirestore();
    const sessionSnap = await db.collection("call_sessions").doc(callSessionId).get();
    if (!sessionSnap.exists) { res.status(404).json({status:"error",message:"Session not found"}); return; }
    const session = sessionSnap.data();
    if (session.ownerId !== uid) { res.status(403).json({status:"error",message:"Forbidden"}); return; }

    const violSnap = await db.collection("compliance_violations")
      .where("callSessionId","==",callSessionId)
      .orderBy("detectedAt","asc").get();

    const violations = violSnap.docs.map(d => ({
      id: d.id, ...d.data(),
      detectedAt: d.data().detectedAt?.toDate?.()?.toISOString() || null,
    }));

    const counts = violations.reduce((acc, v) => {
      acc[v.severity] = (acc[v.severity] || 0) + 1;
      return acc;
    }, {critical:0, high:0, medium:0, warning:0});

    // Score: start at 100, deduct per violation severity
    const score = Math.max(0, 100 - (counts.critical * 30) - (counts.high * 15) - (counts.medium * 5) - (counts.warning * 2));
    const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

    res.status(200).json({
      status: "ok",
      report: {
        callSessionId,
        score,
        grade,
        violationCounts: {...counts, total: violations.length},
        violations,
        disclosureCheck: session.tcpaDisclosures || null,
        summary: violations.length === 0
          ? "âœ… No compliance violations detected on this call"
          : `âš ï¸ ${violations.length} compliance issue${violations.length !== 1 ? "s" : ""} â€” grade ${grade}`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error("complianceGetReport", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Compliance Dashboard (aggregate â€” last 30 days) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.complianceDashboard = onRequest(corsOptions, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  try {
    const uid = await extractUidFromRequest(req);
    if (!uid) { res.status(401).json({status:"error",message:"Unauthorized"}); return; }

    const db = getFirestore();
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const [violSnap, dncCount, consentCount] = await Promise.all([
      db.collection("compliance_violations")
        .where("ownerId","==",uid)
        .where("detectedAt",">=",thirtyDaysAgo)
        .get(),
      db.collection("dnc_list").where("ownerId","==",uid).count().get(),
      db.collection("compliance_consents").where("ownerId","==",uid).where("active","==",true).count().get(),
    ]);

    const violations = violSnap.docs.map(d => d.data());
    const bySeverity = violations.reduce((acc, v) => { acc[v.severity] = (acc[v.severity]||0)+1; return acc; }, {});
    const byType     = violations.reduce((acc, v) => { acc[v.violationType] = (acc[v.violationType]||0)+1; return acc; }, {});
    const byDay      = violations.reduce((acc, v) => {
      const day = v.detectedAt?.toDate?.()?.toISOString?.()?.slice(0,10) || "unknown";
      acc[day] = (acc[day]||0)+1;
      return acc;
    }, {});

    res.status(200).json({
      status: "ok",
      stats: {
        violations30Days: violations.length,
        bySeverity,
        byType,
        byDay,
        dncListSize: dncCount.data().count,
        consentRecords: consentCount.data().count,
      },
    });
  } catch (e) {
    logger.error("complianceDashboard", e);
    res.status(500).json({status:"error", message: e.message});
  }
});

// â”€â”€ Exports for Cloud Run (no-HTTP, imported directly) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports.detectPiiViolations    = detectPiiViolations;
module.exports.checkTcpaTime          = checkTcpaTime;
module.exports.checkTcpaDisclosures   = checkTcpaDisclosures;
