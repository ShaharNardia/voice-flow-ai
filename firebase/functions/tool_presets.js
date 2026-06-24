/**
 * tool_presets.js — GLOBAL, code-defined tool packs available to EVERY assistant.
 *
 * Unlike tool_library (per-company Firestore rows), these packs are version-
 * controlled here and exposed read-only to all tenants. The assistant editor
 * lets any assistant "add a pack", which copies the pack's tool definitions into
 * that assistant's `customTools[]`. Cloud Run already executes customTools
 * generically (executeCustomApiTool with {{param}} substitution), so no
 * call-path changes are needed — adding a pack is pure config.
 *
 * Each tool object is already shaped like a CustomTool:
 *   { name, displayName, description, method, url, headers, parameters[] }
 * URLs use {{paramName}} placeholders (substituted + URL-encoded at call time).
 *
 * Endpoint:
 *   GET /toolPresetsList  → { packs: [...] }   (any authenticated user)
 */
"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
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

const MORAN_BASE = "https://api.lancelotech.com";

// p() — concise parameter builder.
const p = (name, type, description, required = false) => ({ name, type, description, required });

// ── Pack: Moran public-transport real-time info (SIRI 2.8) ─────────────────
const MORAN_PACK = {
  id: "moran_transit_siri",
  title: "מורן – מידע תחבורה ציבורית (SIRI 2.8)",
  description:
    "9 כלים לנתוני אוטובוסים בזמן אמת ממורן (משרד התחבורה): זמני הגעה לתחנה, עיכובים, מיקום רכב, מצב קו, שיבושים ואירועים.",
  // Recommended assistant instructions to pair with the pack (offered to append).
  systemPrompt: [
    "אתה נציג קולי של מוקד מידע תחבורה ציבורית בישראל. אתה עונה על שאלות נוסעים בזמן אמת על אוטובוסים, תחנות, קווים, עיכובים ושיבושים.",
    "כל המידע בזמן אמת מגיע מ-APIs של מורן (פרוטוקול SIRI 2.8). לפני שאתה עונה על זמני הגעה, עיכובים, מיקום אוטובוס, מצב קו או שיבושים — חובה לקרוא ל-tool המתאים. אל תמציא זמנים, מספרי קווים או מיקומים.",
    "ברירת מחדל לשאלת 'מתי מגיע האוטובוס': get_stop_arrivals_voice עם station (ומספר קו אם נמסר) — קרא את שדה ה-voiceText שחוזר. עיכובים: get_stop_delays. סינון לפי חברה: get_stop_by_operator. מיקום רכב: get_vehicle_location. מצב קו: get_line_status. שיבושים: get_general_messages + get_situation_exchange.",
    "ענה בעברית, קצר וברור (2–3 משפטים לקו). זמנים: 'בעוד X דקות'. מיין קווים לפי minutesToArrival מהקרוב לרחוק. אם אין נתונים: 'כרגע אין מידע על מעבר קווים בתחנה, מומלץ לבדוק קווים חלופיים'. אל תקרא GPS/כיוון/מהירות אלא אם נשאלת במפורש.",
  ].join("\n"),
  tools: [
    {
      name: "get_stop_arrivals_voice",
      displayName: "זמני הגעה לתחנה (קולי)",
      description:
        "ברירת מחדל לשיחה קולית. מחזיר זמני הגעת אוטובוסים לתחנה כולל שדה voiceText מוכן ל-TTS. קרא כשהנוסע שואל 'מתי מגיע האוטובוס', 'מה הזמנים בתחנה', או כל שאלה כללית על הגעות לתחנה. קרא את שדה ה-voiceText לנוסע.",
      method: "GET",
      // Use /stop-monitoring (NOT /stop-monitoring/voice): the /voice endpoint
      // rejected valid requests ("station field is required") and required
      // phoneCallId/userId; /stop-monitoring works with station+line alone and
      // already returns a ready `voiceText` field.
      url: `${MORAN_BASE}/Moran/stop-monitoring?station={{station}}&line={{line}}&operatorRef={{operatorRef}}`,
      headers: {},
      parameters: [
        p("station", "string", "מספר תחנה (MonitoringRef), ספרות בלבד. דוגמה: 32902", true),
        p("line", "string", "מספר קו לסינון (אופציונלי). דוגמה: 5"),
        p("operatorRef", "string", "קוד חברת אוטובוס לסינון (אופציונלי). דוגמה: 3 לאגד"),
      ],
    },
    {
      name: "get_stop_arrivals",
      displayName: "זמני הגעה לתחנה (מפורט)",
      description:
        "Stop Monitoring (SM) – JSON מובנה עם כל השדות: זמני הגעה, עיכוב, GPS, כיוון, חברה, יעד. קרא כשצריך נתונים מפורטים או מידע טכני.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/stop-monitoring?station={{station}}&line={{line}}&operatorRef={{operatorRef}}`,
      headers: {},
      parameters: [
        p("station", "string", "מספר תחנה (MonitoringRef)", true),
        p("line", "string", "מספר קו (אופציונלי)"),
        p("operatorRef", "string", "קוד חברה (אופציונלי)"),
      ],
    },
    {
      name: "get_stop_delays",
      displayName: "עיכובים בתחנה",
      description:
        "רשימת אוטובוסים מעוכבים בתחנה. קרא כשהנוסע שואל על עיכובים, 'האוטובוס מאחר?', 'יש בעיות בתחנה?'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/stop-monitoring/delays?station={{station}}&minDelaySeconds={{minDelaySeconds}}`,
      headers: {},
      parameters: [
        p("station", "string", "מספר תחנה", true),
        p("minDelaySeconds", "integer", "סף עיכוב מינימלי בשניות (ברירת מחדל 60)"),
      ],
    },
    {
      name: "get_stop_by_operator",
      displayName: "זמני הגעה לפי חברה",
      description:
        "זמני הגעה בתחנה מסוננים לפי חברת אוטובוס. קרא כשהנוסע מבקש 'רק אגד', 'קווי דן', 'של אלקטרה'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/stop-monitoring/by-operator?station={{station}}&operatorRef={{operatorRef}}&line={{line}}`,
      headers: {},
      parameters: [
        p("station", "string", "מספר תחנה", true),
        p("operatorRef", "string", "קוד חברת האוטובוס (אגד=3, דן=5, אקסטרה=7, מטרופולין=15, סופרבוס=18)", true),
        p("line", "string", "מספר קו (אופציונלי)"),
      ],
    },
    {
      name: "get_vehicle_location",
      displayName: "מיקום רכב",
      description:
        "Vehicle Monitoring (VM) – מיקום GPS, מהירות, כיוון ומצב רכב ספציפי. קרא כשהנוסע שואל 'איפה האוטובוס?', 'מיקום הרכב', 'GPS'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/vehicle-monitoring?vehicleRef={{vehicleRef}}`,
      headers: {},
      parameters: [p("vehicleRef", "string", "מזהה רכב (VehicleRef), ספרות", true)],
    },
    {
      name: "get_line_status",
      displayName: "מצב קו",
      description:
        "Line Monitoring (LM) – מצב כל התחנות בקו. קרא כשהנוסע שואל 'מה המצב בקו X?', 'כל התחנות בקו', 'ניטור קו'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/line-monitoring?lineRef={{lineRef}}`,
      headers: {},
      parameters: [p("lineRef", "string", "מספר/מזהה קו (LineRef)", true)],
    },
    {
      name: "get_general_messages",
      displayName: "הודעות מערכת",
      description:
        "General Message (GM) – הודעות מערכת ושיבושים כלליים. קרא כשהנוסע שואל 'יש שיבושים?', 'הודעות מערכת'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/general-messages`,
      headers: {},
      parameters: [],
    },
    {
      name: "get_situation_exchange",
      displayName: "אירועים ותקלות",
      description:
        "Situation Exchange (SX) – אירועים, תקלות, סגירות כביש. קרא כשהנוסע שואל על 'תקלה', 'אירוע', 'סגירת כביש', 'בעיה בקו ספציפי'.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/situation-exchange?lineRef={{lineRef}}&station={{station}}`,
      headers: {},
      parameters: [
        p("lineRef", "string", "סינון לפי קו (אופציונלי)"),
        p("station", "string", "סינון לפי תחנה (אופציונלי)"),
      ],
    },
    {
      name: "check_moran_services",
      displayName: "בדיקת זמינות שירות",
      description:
        "בדיקת זמינות שירותי SIRI (SM/VM/LM/GM/SX). קרא רק כשהנוסע מתלונן שהמערכת לא עובדת, או ל-debug.",
      method: "GET",
      url: `${MORAN_BASE}/Moran/services`,
      headers: {},
      parameters: [],
    },
  ],
};

const TOOL_PRESET_PACKS = [MORAN_PACK];

// ── Endpoint ───────────────────────────────────────────────────────────────
exports.toolPresetsList = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  // Any authenticated user can browse the global preset catalog.
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    res.json({ packs: TOOL_PRESET_PACKS });
  } catch (e) {
    logger.error("toolPresetsList failed", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Exposed for unit tests + potential reuse (e.g. seeding).
exports._packs = TOOL_PRESET_PACKS;
