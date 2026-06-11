/**
 * El Al Airlines â€” AirLabs API wrapper service
 *
 * Six GET endpoints the assistant calls as custom API tools, plus one POST
 * endpoint (`elAlSeedAssistant`) that bootstraps the full demo assistant in
 * Firestore with all capabilities pre-configured.
 *
 * Env vars required:
 *   AIRLABS_API_KEY   â€” AirLabs v9 key  (https://airlabs.co)
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const axios = require("axios");
const {extractUidFromRequest} = require("./security_utils");

const AIRLABS_BASE = "https://airlabs.co/api/v9";
const ELAL_IATA = "LY";

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// â”€â”€ Known El Al destinations (from published route network) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used to distinguish "route exists but not flying today" vs "route doesn't exist"
const ELAL_KNOWN_DEST = new Set([
  // Americas
  "JFK","EWR","LAX","MIA","ORD","BOS","YYZ","YUL",
  // Europe
  "LHR","LGW","CDG","ORY","BER","FCO","MAD","BCN","AMS","BRU","VIE",
  "ZRH","GVA","PRG","WAW","BUD","OTP","ATH","IST","LIS","CPH","ARN",
  "HEL","OSL","MAN","MXP","NCE","MRS","FRA","MUC","DUS","HAM","LCA","PFO",
  // Asia-Pacific
  "BKK","NRT","HKG","SIN","PEK",
  // Africa & Middle East
  "JNB","NBO","CAI","CMN","AMM","BEY","RUH","KWI","DOH","MCT","DXB","AUH",
  // CIS
  "SVO","KBP",
]);

// â”€â”€ Country code â†’ Hebrew name map (AirLabs free tier returns country_code only) â”€
const COUNTRY_NAMES = {
  "IL": "×™×©×¨××œ", "GB": "×‘×¨×™×˜× ×™×”", "FR": "×¦×¨×¤×ª", "DE": "×’×¨×ž× ×™×”",
  "IT": "××™×˜×œ×™×”", "ES": "×¡×¤×¨×“", "NL": "×”×•×œ× ×“", "BE": "×‘×œ×’×™×”",
  "AT": "××•×¡×˜×¨×™×”", "CH": "×©×•×•×™×¥", "PT": "×¤×•×¨×˜×•×’×œ", "GR": "×™×•×•×Ÿ",
  "TR": "×˜×•×¨×§×™×”", "CY": "×§×¤×¨×™×¡×™×Ÿ", "PL": "×¤×•×œ×™×Ÿ", "CZ": "×¦'×›×™×”",
  "HU": "×”×•× ×’×¨×™×”", "RO": "×¨×•×ž× ×™×”", "SE": "×©×‘×“×™×”", "NO": "× ×•×¨×•×•×’×™×”",
  "DK": "×“× ×ž×¨×§", "FI": "×¤×™× ×œ× ×“", "US": "××¨×¦×•×ª ×”×‘×¨×™×ª", "CA": "×§× ×“×”",
  "AE": "××™×—×•×“ ×”××ž×™×¨×•×™×•×ª", "QA": "×§×˜×¨", "KW": "×›×•×•×™×ª", "OM": "×¢×•×ž××Ÿ",
  "SA": "×¢×¨×‘ ×”×¡×¢×•×“×™×ª", "JO": "×™×¨×“×Ÿ", "LB": "×œ×‘× ×•×Ÿ", "TH": "×ª××™×œ× ×“",
  "JP": "×™×¤×Ÿ", "CN": "×¡×™×Ÿ", "HK": "×”×•× ×’ ×§×•× ×’", "SG": "×¡×™× ×’×¤×•×¨",
  "IN": "×”×•×“×•", "EG": "×ž×¦×¨×™×", "ZA": "×“×¨×•× ××¤×¨×™×§×”", "KE": "×§× ×™×”",
  "MA": "×ž×¨×•×§×•", "UA": "××•×§×¨××™× ×”", "RU": "×¨×•×¡×™×”",
};

// â”€â”€ Hebrew helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_HE = {
  scheduled: "×ž×ª×•×–×ž×Ÿ", active: "×¤×¢×™×œ", "en-route": "×‘×“×¨×š",
  landed: "× ×—×ª", delayed: "×ž××•×—×¨", cancelled: "×‘×•×˜×œ",
  diverted: "×”×•×¡×˜", boarding: "×¢×œ×™×™×” ×œ×ž×˜×•×¡", departed: "×”×ž×¨×™×",
  arrived: "×”×’×™×¢", unknown: "×œ× ×™×“×•×¢",
};

function statusHe(s) {
  return STATUS_HE[(s || "").toLowerCase()] || s || "×œ× ×™×“×•×¢";
}

const CITY_IATA = {
  "×ª×œ ××‘×™×‘": "TLV", "×‘×Ÿ ×’×•×¨×™×•×Ÿ": "TLV", "× ×ª×‘\"×’": "TLV",
  "×œ×•× ×“×•×Ÿ": "LHR", "×œ×•× ×“×•×Ÿ ×”×™×ª'×¨×•": "LHR", "×œ×•× ×“×•×Ÿ ×’×˜×•×•×™×§": "LGW",
  "×¤×¨×™×–": "CDG", "×‘×¨×œ×™×Ÿ": "BER", "×¨×•×ž×": "FCO", "×ž×“×¨×™×“": "MAD",
  "×‘×¨×¦×œ×•× ×”": "BCN", "××ž×¡×˜×¨×“×": "AMS", "×‘×¨×™×¡×œ": "BRU", "×•×™× ×”": "VIE",
  "×¦×™×¨×™×š": "ZRH", "×–'× ×‘×”": "GVA", "×¤×¨××’": "PRG", "×•×¨×©×”": "WAW",
  "×‘×•×“×¤×©×˜": "BUD", "×‘×•×§×¨×©×˜": "OTP", "××ª×•× ×”": "ATH", "××™×¡×˜× ×‘×•×œ": "IST",
  "×œ×™×¡×‘×•×Ÿ": "LIS", "×§×•×¤× ×”×’×Ÿ": "CPH", "×¡×˜×•×§×”×•×œ×": "ARN", "×”×œ×¡×™× ×§×™": "HEL",
  "××•×¡×œ×•": "OSL", "×ž× ×¦'×¡×˜×¨": "MAN", "×ž×™×œ× ×•": "MXP", "× ×™×¡": "NCE",
  "×¤×¨× ×§×¤×•×¨×˜": "FRA", "×ž×™× ×›×Ÿ": "MUC", "×“×™×¡×œ×“×•×¨×£": "DUS", "×”×ž×‘×•×¨×’": "HAM",
  "×œ×¨× ×§×”": "LCA", "×¤××¤×•×¡": "PFO", "×“×•×‘××™": "DXB", "××‘×• ×“××‘×™": "AUH",
  "× ×™×• ×™×•×¨×§": "JFK", "×œ×•×¡ ×× ×’'×œ×¡": "LAX", "×©×™×§×’×•": "ORD", "×ž×™××ž×™": "MIA",
  "×‘×•×¡×˜×•×Ÿ": "BOS", "×¡×Ÿ ×¤×¨× ×¡×™×¡×§×•": "SFO", "×•×•×©×™× ×’×˜×•×Ÿ": "IAD",
  "×˜×•×¨×•× ×˜×•": "YYZ", "×ž×•× ×˜×¨×™××•×œ": "YUL", "×‘× ×’×§×•×§": "BKK", "×˜×•×§×™×•": "NRT",
  "×”×•× ×’ ×§×•× ×’": "HKG", "×¡×™× ×’×¤×•×¨": "SIN", "×‘×™×™×’'×™× ×’": "PEK",
  "×ž×•×ž×‘××™": "BOM", "×“×œ×”×™": "DEL", "× ×™×¨×•×‘×™": "NBO", "×™×•×”× ×¡×‘×•×¨×’": "JNB",
  "×§×”×™×¨": "CAI", "×§×–×‘×œ× ×§×”": "CMN", "×ž×•×¡×§×‘×”": "SVO", "×§×™×™×‘": "KBP",
  "×¢×ž××Ÿ": "AMM", "×‘×™×™×¨×•×ª": "BEY", "×¨×™××“": "RUH", "×›×•×•×™×ª": "KWI",
  "×“×•×—×”": "DOH", "×ž×¡×§×˜": "MCT",
};
const CITY_IATA_EN = {
  "tel aviv": "TLV", "ben gurion": "TLV", "london": "LHR",
  "london heathrow": "LHR", "london gatwick": "LGW", "paris": "CDG",
  "berlin": "BER", "rome": "FCO", "madrid": "MAD", "barcelona": "BCN",
  "amsterdam": "AMS", "brussels": "BRU", "vienna": "VIE", "zurich": "ZRH",
  "geneva": "GVA", "prague": "PRG", "warsaw": "WAW", "budapest": "BUD",
  "bucharest": "OTP", "athens": "ATH", "istanbul": "IST", "lisbon": "LIS",
  "copenhagen": "CPH", "stockholm": "ARN", "helsinki": "HEL", "oslo": "OSL",
  "manchester": "MAN", "milan": "MXP", "nice": "NCE", "marseille": "MRS",
  "frankfurt": "FRA", "munich": "MUC", "dusseldorf": "DUS", "hamburg": "HAM",
  "larnaca": "LCA", "paphos": "PFO", "dubai": "DXB", "abu dhabi": "AUH",
  "new york": "JFK", "los angeles": "LAX", "chicago": "ORD", "miami": "MIA",
  "boston": "BOS", "san francisco": "SFO", "washington": "IAD",
  "toronto": "YYZ", "montreal": "YUL", "bangkok": "BKK", "tokyo": "NRT",
  "hong kong": "HKG", "singapore": "SIN", "beijing": "PEK",
  "mumbai": "BOM", "delhi": "DEL", "nairobi": "NBO",
  "johannesburg": "JNB", "cairo": "CAI", "casablanca": "CMN",
  "moscow": "SVO", "kyiv": "KBP", "amman": "AMM", "beirut": "BEY",
  "riyadh": "RUH", "kuwait": "KWI", "doha": "DOH", "muscat": "MCT",
};

function toIata(text) {
  if (!text) return null;
  const lower = text.trim().toLowerCase();
  // Hebrew exact
  for (const [k, v] of Object.entries(CITY_IATA)) {
    if (k.toLowerCase() === lower) return v;
  }
  // English exact
  if (CITY_IATA_EN[lower]) return CITY_IATA_EN[lower];
  // Partial
  for (const [k, v] of Object.entries(CITY_IATA)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  for (const [k, v] of Object.entries(CITY_IATA_EN)) {
    if (lower.includes(k) || k.includes(lower)) return v;
  }
  // Raw IATA code
  if (/^[a-z]{3}$/.test(lower)) return lower.toUpperCase();
  return null;
}

// â”€â”€ In-memory cache (survives across warm-instance invocations within a call) â”€
// Key = "endpoint?sorted_params", TTL = 5 minutes.
// Firebase Cloud Functions reuse warm instances, so sequential tool calls
// within the same conversation hit the cache instead of re-calling AirLabs.

const _cache = new Map(); // key â†’ { data, expires, url }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function _cacheKey(endpoint, params) {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== "api_key")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${endpoint}?${sorted}`;
}

// â”€â”€ AirLabs helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Free-tier endpoints used: /flights /schedules /airports /suggest
// Returns { data, url, fromCache }

async function airlabs(endpoint, params) {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) throw new Error("AIRLABS_API_KEY not set");

  const key = _cacheKey(endpoint, params);
  const publicUrl = `${AIRLABS_BASE}/${endpoint}?${Object.entries(params)
    .filter(([k]) => k !== "api_key")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`;

  // Cache hit
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.expires) {
    logger.debug("airlabs_cache_hit key=%s", key);
    return {data: hit.data, url: publicUrl, fromCache: true};
  }

  // Cache miss â†’ real HTTP call
  logger.info("airlabs_fetch url=%s", publicUrl);
  const resp = await axios.get(`${AIRLABS_BASE}/${endpoint}`, {
    params: {api_key: apiKey, ...params},
    timeout: 12000,
  });
  const body = resp.data;

  if (body && body.error) {
    logger.warn("airlabs_api_error endpoint=%s error=%j", endpoint, body.error);
    throw new Error(`AirLabs: ${body.error.message || JSON.stringify(body.error)}`);
  }

  const data = body.response ?? body;
  _cache.set(key, {data, expires: Date.now() + CACHE_TTL_MS});
  return {data, url: publicUrl, fromCache: false};
}

// Helper: append source line to result string
function srcLine(url, fromCache) {
  return `\nðŸ”— ${fromCache ? "ðŸ“¦ cached" : "ðŸŒ live"}: ${url}`;
}

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowed = corsOptions.cors.some((c) =>
    typeof c === "string" ? c === origin : c.test(origin),
  );
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// â”€â”€ 1. Flight Status  (free: /flights) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const elAlFlightStatus = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  let {flight_iata} = req.query;
  if (!flight_iata) return res.status(400).json({error: "flight_iata required"});
  flight_iata = flight_iata.toString().toUpperCase();
  if (!flight_iata.startsWith("LY")) flight_iata = "LY" + flight_iata;

  try {
    const {data, url, fromCache} = await airlabs("flights", {flight_iata});
    const f = Array.isArray(data) ? data[0] : data;
    if (!f) return res.json({result: "×œ× × ×ž×¦××• ×¤×¨×˜×™× ×¢×‘×•×¨ ×”×˜×™×¡×” ×”×ž×‘×•×§×©×ª." + srcLine(url, fromCache)});

    const lines = [`âœˆï¸ ×˜×™×¡×”: ${f.flight_iata || flight_iata}`];
    if (f.dep_iata) lines.push(`ðŸ›« ×ž×•×¦×: ${f.dep_name || f.dep_iata} (${f.dep_iata})`);
    if (f.arr_iata) lines.push(`ðŸ›¬ ×™×¢×“: ${f.arr_name || f.arr_iata} (${f.arr_iata})`);
    lines.push(`ðŸ“‹ ×¡×˜×˜×•×¡: ${statusHe(f.status)}`);
    if (f.dep_time || f.dep_scheduled) lines.push(`ðŸ• ×™×¦×™××” ×ž×ª×•×›× × ×ª: ${f.dep_time || f.dep_scheduled}`);
    if (f.dep_estimated && f.dep_estimated !== f.dep_time) lines.push(`ðŸ•‘ ×™×¦×™××” ×ž×©×•×¢×¨×ª: ${f.dep_estimated}`);
    if (f.arr_time || f.arr_scheduled) lines.push(`ðŸ• ×”×’×¢×” ×ž×ª×•×›× × ×ª: ${f.arr_time || f.arr_scheduled}`);
    if (f.delayed) lines.push(`â±ï¸ ×¢×™×›×•×‘: ${f.delayed} ×“×§×•×ª`);
    if (f.dep_gate) lines.push(`ðŸšª ×©×¢×¨: ${f.dep_gate}`);
    if (f.dep_terminal) lines.push(`ðŸ›ï¸ ×˜×¨×ž×™× ×œ: ${f.dep_terminal}`);
    lines.push(srcLine(url, fromCache));

    return res.json({result: lines.join("\n")});
  } catch (err) {
    logger.error("elAlFlightStatus error", err);
    return res.status(500).json({result: `×©×’×™××”: ${err.message}`});
  }
});

// â”€â”€ 2. Schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// AirLabs PAID plan:
//   /schedules  â€” flights active/departing TODAY (live real-time)
//   /timetable  â€” âœ… scheduled flights for ANY date (dep_date=YYYY-MM-DD)
//
// Strategy:
//   â€¢ No date or today â†’ /schedules (live real-time)
//   â€¢ Future date      â†’ /timetable (real scheduled data)

// Normalise DD-MM-YYYY or YYYY-MM-DD â†’ YYYY-MM-DD (required by /timetable)
function toISODate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes("-") && dateStr.length === 10 && dateStr[2] === "-") {
    return `${dateStr.slice(6)}-${dateStr.slice(3, 5)}-${dateStr.slice(0, 2)}`;
  }
  return dateStr.slice(0, 10);
}

function isToday(dateStr) {
  if (!dateStr) return true;
  const today = new Date().toISOString().slice(0, 10);
  return toISODate(dateStr) === today;
}

function formatDateHe(dateStr) {
  if (!dateStr) return "";
  // accept DD-MM-YYYY or YYYY-MM-DD
  const parts = dateStr.includes("-") && dateStr[2] === "-"
    ? [dateStr.slice(0, 2), dateStr.slice(3, 5), dateStr.slice(6)]
    : [dateStr.slice(8, 10), dateStr.slice(5, 7), dateStr.slice(0, 4)];
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

const elAlSchedule = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  const {dep_city, arr_city, date} = req.query;
  const rawMax = req.query.max;

  const dep_iata = toIata(dep_city?.toString()) || dep_city?.toString().toUpperCase();
  const arr_iata = toIata(arr_city?.toString()) || arr_city?.toString().toUpperCase();
  // Guard against un-filled template placeholders like "{{max}}" from the assistant
  const maxN = (rawMax && /^\d+$/.test(rawMax.toString())) ? parseInt(rawMax, 10) : 5;
  const dateStr  = date?.toString();

  try {
    // â”€â”€ Future date â†’ /timetable (PAID endpoint â€” real scheduled data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (dateStr && !isToday(dateStr)) {
      const depDate = toISODate(dateStr);
      // AirLabs /timetable REQUIRED param: `iata_code` (the anchor airport).
      // Optional: dep_date, airline_iata, type ("departures"/"arrivals").
      // arr_iata is NOT a supported filter â€” we post-filter client-side.
      const anchorIata = dep_iata || "TLV";
      const tParams = {
        iata_code: anchorIata,       // â† REQUIRED by AirLabs timetable
        dep_date: depDate,
        airline_iata: ELAL_IATA,
        type: "departures",
      };

      const {data, url, fromCache} = await airlabs("timetable", tParams);
      const flights = (Array.isArray(data) ? data : (data ? [data] : []))
        .filter((f) => f && f.airline_iata === ELAL_IATA)
        // If caller asked for a specific destination, filter client-side
        .filter((f) => !arr_iata || f.arr_iata === arr_iata)
        .sort((a, b) => (a.dep_time || "").localeCompare(b.dep_time || ""))
        .slice(0, maxN);

      const dateHe = formatDateHe(dateStr);
      if (!flights.length) {
        const routeKnown = arr_iata && ELAL_KNOWN_DEST.has(arr_iata);
        const msg = routeKnown
          ? `××™×Ÿ ×˜×™×¡×•×ª ××œ ×¢×œ ×ž×ª×•×–×ž× ×•×ª ×œ-${dateHe} ×‘× ×ª×™×‘ ${dep_iata || "TLV"} â†’ ${arr_iata} (×™×™×ª×›×Ÿ × ×ª×™×‘ ×¢×•× ×ª×™).\n×œ×‘×“×™×§×ª ×ª××¨×™×›×™× ×–×ž×™× ×™×: www.elal.com ××• *5353`
          : `×œ× × ×ž×¦××• ×˜×™×¡×•×ª ××œ ×¢×œ ×ž×ª×•×–×ž× ×•×ª ×œ-${dateHe}${dep_iata ? ` ×ž-${dep_iata}` : ""}${arr_iata ? ` ××œ ${arr_iata}` : ""}.\n×œ×‘×“×™×§×”: www.elal.com ××• *5353`;
        return res.json({result: msg + srcLine(url, fromCache)});
      }

      const lines = [`ðŸ“… ×œ×•×— ×–×ž× ×™× ×œ-${dateHe} (${flights.length} ×˜×™×¡×•×ª):`];
      flights.forEach((f) => {
        lines.push(`  âœˆï¸ ${f.flight_iata}  ${f.dep_iata} â†’ ${f.arr_iata}  ×™×¦×™××”: ${f.dep_time || "?"}  ×”×’×¢×”: ${f.arr_time || "?"}  [${statusHe(f.status || "scheduled")}]`);
      });
      lines.push(`\nðŸ’¡ ×œ×”×–×ž× ×”: www.elal.com ××• *5353`);
      lines.push(srcLine(url, fromCache));
      return res.json({result: lines.join("\n")});
    }

    // â”€â”€ Today / no date â†’ /schedules (live real-time) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // AirLabs /schedules quirks:
    //   âœ…  dep_iata alone            â†’ all departures from that airport
    //   âœ…  airline_iata + dep_iata   â†’ carrier departures from that airport
    //   âœ…  arr_iata alone            â†’ all arrivals to that airport
    //   âŒ  airline_iata + arr_iata (no dep_iata) â†’ returns nothing
    //
    // Rule: only include airline_iata when dep_iata is present.
    // For arrival-only queries, fetch by arr_iata alone and filter client-side.

    // AirLabs /schedules quirks (empirically verified):
    //   âœ…  dep_iata + airline_iata          â†’ carrier departures from airport
    //   âœ…  arr_iata (alone)                 â†’ all arrivals (filter LY client-side)
    //   âœ…  dep_iata + arr_iata              â†’ route-specific (filter LY client-side)
    //   âŒ  airline_iata + arr_iata          â†’ returns nothing (with OR without dep_iata)
    //
    // Rule: NEVER combine airline_iata with arr_iata. Filter client-side instead.
    const params = {};
    if (dep_iata) params.dep_iata = dep_iata;
    if (arr_iata) params.arr_iata = arr_iata;
    // Only add airline_iata when there is no arr_iata filter
    if (dep_iata && !arr_iata) params.airline_iata = ELAL_IATA;
    // Fallback: at least anchor to TLV El Al departures
    if (!dep_iata && !arr_iata) {
      params.dep_iata = "TLV";
      params.airline_iata = ELAL_IATA;
    }

    const {data, url, fromCache} = await airlabs("schedules", params);
    const flights = (Array.isArray(data) ? data : (data ? [data] : []))
      .filter((f) => f && f.airline_iata === ELAL_IATA)
      .sort((a, b) => (a.dep_time || "").localeCompare(b.dep_time || ""))
      .slice(0, maxN);

    if (!flights.length) {
      const routeKnown = arr_iata && ELAL_KNOWN_DEST.has(arr_iata);
      const noFlightMsg = routeKnown
        ? `××œ ×¢×œ ×ž×¤×¢×™×œ×” ×˜×™×¡×•×ª ×‘× ×ª×™×‘ ${dep_iata || "TLV"} â†’ ${arr_iata} ××š ××™×Ÿ ×˜×™×¡×•×ª ×¤×¢×™×œ×•×ª ×”×™×•× (×™×™×ª×›×Ÿ × ×ª×™×‘ ×¢×•× ×ª×™).\n×œ×ª××¨×™×›×™× ×–×ž×™× ×™×: www.elal.com ××• *5353`
        : `×œ× × ×ž×¦××• ×˜×™×¡×•×ª ××œ ×¢×œ ${dep_iata ? `×ž-${dep_iata}` : ""}${arr_iata ? ` ××œ ${arr_iata}` : ""} ×‘×œ×•×— ×”×–×ž× ×™× ×œ×”×™×•×.\n×œ×‘×“×™×§×ª ×˜×™×¡×•×ª: www.elal.com ××• *5353`;
      return res.json({result: noFlightMsg + srcLine(url, fromCache)});
    }

    const lines = [`×œ×•×— ×–×ž× ×™× ×œ×”×™×•× (${flights.length} ×˜×™×¡×•×ª):`];
    flights.forEach((f) => {
      lines.push(`  ${f.flight_iata}  ${f.dep_iata} â†’ ${f.arr_iata}  ${f.dep_time || "?"}  [${statusHe(f.status)}]`);
    });
    lines.push(srcLine(url, fromCache));
    return res.json({result: lines.join("\n")});
  } catch (err) {
    logger.error("elAlSchedule error", err);
    return res.status(500).json({
      result: `×©×’×™××” ×‘×©×œ×™×¤×ª ×œ×•×— ×”×–×ž× ×™×: ${err.message}\n` +
        `×œ×‘×“×™×§×ª ×œ×•×— ×–×ž× ×™× ×•×ª×ž×—×•×¨: www.elal.com ××• *5353`,
    });
  }
});

// â”€â”€ 3. Delays  (PAID: /delays endpoint â€” real-time delay data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const elAlDelays = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  const {airport_city} = req.query;
  const rawDelay = req.query.min_delay;
  const airport_iata = toIata(airport_city?.toString()) || "TLV";
  // Guard against un-filled template placeholders like "{{min_delay}}"
  const minDelayMin = (rawDelay && /^\d+$/.test(rawDelay.toString())) ? parseInt(rawDelay, 10) : 15;

  try {
    // Use paid /delays endpoint â€” returns only actually-delayed flights.
    // type=departures: flights departing from dep_iata that are delayed.
    const {data, url, fromCache} = await airlabs("delays", {
      type: "departures",
      dep_iata: airport_iata,
    });

    const all = Array.isArray(data) ? data : (data ? [data] : []);
    // Filter to El Al only and apply the minimum-delay threshold
    const delayed = all.filter((f) =>
      f && f.airline_iata === ELAL_IATA &&
      (f.delayed || f.dep_delayed || 0) >= minDelayMin,
    );

    if (!delayed.length) {
      return res.json({
        result: `âœ… ××™×Ÿ ×¢×™×›×•×‘×™× ×©×œ ${minDelayMin}+ ×“×§×•×ª ×‘×˜×™×¡×•×ª ××œ ×¢×œ ×ž-${airport_iata}.` + srcLine(url, fromCache),
      });
    }

    const lines = [`âš ï¸ ${delayed.length} ×˜×™×¡×•×ª ××œ ×¢×œ ×ž×¢×•×›×‘×•×ª ×ž-${airport_iata}:`];
    delayed.forEach((f) => {
      const d = f.delayed || f.dep_delayed || "?";
      lines.push(`  âœˆï¸ ${f.flight_iata}  ${f.dep_iata} â†’ ${f.arr_iata}  ×¢×™×›×•×‘: ${d} ×“×§×•×ª  [${statusHe(f.status)}]`);
    });
    lines.push(srcLine(url, fromCache));
    return res.json({result: lines.join("\n")});
  } catch (err) {
    logger.error("elAlDelays error", err);
    return res.status(500).json({result: `×©×’×™××”: ${err.message}`});
  }
});

// â”€â”€ 4. Routes  (free: /schedules â€” unique destinations from dep airport) â”€â”€â”€â”€â”€â”€

const elAlRoutes = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  const {from_city, to_city} = req.query;
  const from_iata = toIata(from_city?.toString()) || (from_city ? from_city.toString().toUpperCase() : "TLV");
  const to_iata   = toIata(to_city?.toString())   || (to_city   ? to_city.toString().toUpperCase()   : null);

  try {
    const {data, url, fromCache} = await airlabs("schedules", {
      airline_iata: ELAL_IATA,
      dep_iata: from_iata,
    });
    let flights = (Array.isArray(data) ? data : (data ? [data] : []))
      .filter((f) => f && f.airline_iata === ELAL_IATA);

    if (to_iata) {
      const match = flights.filter((f) => f.arr_iata === to_iata);
      if (match.length) {
        const lines = [`âœ… ××œ ×¢×œ ×ž×¤×¢×™×œ×” ×˜×™×¡×•×ª ×ž-${from_iata} ××œ ${to_iata}:`];
        match.slice(0, 3).forEach((f) => lines.push(
          `  âœˆï¸ ${f.flight_iata}  ×™×¦×™××”: ${f.dep_time || "?"}  [${statusHe(f.status)}]`,
        ));
        lines.push(srcLine(url, fromCache));
        return res.json({result: lines.join("\n")});
      }
      return res.json({
        result: `××™×Ÿ ×›×¨×’×¢ ×˜×™×¡×•×ª ××œ ×¢×œ ×™×©×™×¨×•×ª ×ž-${from_iata} ××œ ${to_iata} ×‘×œ×•"×– ×”×¤×¢×™×œ.` + srcLine(url, fromCache),
      });
    }

    if (!flights.length) {
      return res.json({result: `×œ× × ×ž×¦××• ×˜×™×¡×•×ª ××œ ×¢×œ ×ž-${from_iata} ×‘×œ×•"×– ×”×¤×¢×™×œ.` + srcLine(url, fromCache)});
    }

    const destMap = {};
    flights.forEach((f) => { if (f.arr_iata && !destMap[f.arr_iata]) destMap[f.arr_iata] = f.flight_iata; });
    const destinations = Object.keys(destMap).sort();
    const list = destinations.map((d) => `${d} (${destMap[d]})`).join(", ");

    return res.json({
      result: `âœˆï¸ ××œ ×¢×œ ×ž×¤×¢×™×œ×” ${destinations.length} ×™×¢×“×™× ×ž-${from_iata}: ${list}` + srcLine(url, fromCache),
    });
  } catch (err) {
    logger.error("elAlRoutes error", err);
    return res.status(500).json({result: `×©×’×™××”: ${err.message}`});
  }
});

// â”€â”€ 5. Airport Info  (free: /airports) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const elAlAirportInfo = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  const {airport} = req.query;
  if (!airport) return res.status(400).json({error: "airport required"});

  const iata = toIata(airport.toString()) || airport.toString().toUpperCase();
  try {
    const {data, url, fromCache} = await airlabs("airports", {iata_code: iata});
    const a = Array.isArray(data) ? data[0] : data;
    if (!a) return res.json({result: "×œ× × ×ž×¦××• ×¤×¨×˜×™× ×¢×‘×•×¨ ×©×“×” ×”×ª×¢×•×¤×” ×”×ž×‘×•×§×©." + srcLine(url, fromCache)});

    // AirLabs free tier returns: name, iata_code, icao_code, country_code,
    // city_code (IATA city code), timezone, lat, lng, alt
    // Note: 'city' (free-text) and 'country_name' are NOT in the free response.
    const cityLabel = a.city || a.city_code || null;
    const countryLabel = a.country_name || COUNTRY_NAMES[a.country_code] || a.country_code || null;

    const lines = [`ðŸ¢ ${a.name} (${a.iata_code || iata})`];
    if (cityLabel) lines.push(`ðŸŒ† ×¢×™×¨: ${cityLabel}`);
    if (countryLabel) lines.push(`ðŸŒ ×ž×“×™× ×”: ${countryLabel}`);
    if (a.timezone) lines.push(`ðŸ• ××–×•×¨ ×–×ž×Ÿ: ${a.timezone}`);
    if (a.lat && a.lng) lines.push(`ðŸ“ ×§×•××•×¨×“×™× ×˜×•×ª: ${a.lat}, ${a.lng}`);
    lines.push(srcLine(url, fromCache));

    return res.json({result: lines.join("\n")});
  } catch (err) {
    logger.error("elAlAirportInfo error", err);
    return res.status(500).json({result: `×©×’×™××”: ${err.message}`});
  }
});

// â”€â”€ 6. Lookup Airport Code  (local map first, fallback: free /suggest) â”€â”€â”€â”€â”€â”€â”€â”€

const elAlLookupCode = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  const {query} = req.query;
  if (!query) return res.status(400).json({error: "query required"});

  // Local lookup â€” no API call needed
  const iata = toIata(query.toString());
  if (iata) return res.json({result: `×§×•×“ IATA ×¢×‘×•×¨ "${query}": ${iata}\nðŸ”— ðŸ“¦ local-map (no API call)`});

  try {
    const {data, url, fromCache} = await airlabs("suggest", {query: query.toString()});
    const suggestions = (Array.isArray(data) ? data : [data]).slice(0, 5);
    if (!suggestions.length) return res.json({result: `×œ× × ×ž×¦××• ×ª×•×¦××•×ª ×¢×‘×•×¨ "${query}".` + srcLine(url, fromCache)});

    const lines = [`×ª×•×¦××•×ª ×—×™×¤×•×© ×¢×‘×•×¨ "${query}":`];
    suggestions.forEach((s) => {
      if (s.iata_code) lines.push(`  ${s.iata_code} â€” ${s.name} (${s.city || ""}, ${s.country_code || ""})`);
    });
    lines.push(srcLine(url, fromCache));
    return res.json({result: lines.join("\n")});
  } catch (err) {
    logger.error("elAlLookupCode error", err);
    return res.status(500).json({result: `×©×’×™××”: ${err.message}`});
  }
});

// â”€â”€ 7. Seed El Al Assistant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /elAlSeedAssistant  (authenticated)
// Creates (or re-creates) the full El Al demo assistant for the calling user.

const FUNCTIONS_BASE = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

const ELAL_ASSISTANT_TEMPLATE = {
  name: "× ×¦×™×’ ×©×™×¨×•×ª ×œ×§×•×—×•×ª â€“ ××œ ×¢×œ",
  assistantName: "× ×•×¢×”",
  companyName: "××œ ×¢×œ × ×ª×™×‘×™ ××•×™×¨ ×œ×™×©×¨××œ",
  language: "he-IL",
  voice: "openai:shimmer",     // standard TTS voice (fallback)
  // "shimmer" is a valid OpenAI Realtime voice â€” clear and articulate for Hebrew.
  // "nova" is a standard TTS voice only; passing it to Realtime causes garbled/rushed speech.
  realtimeVoice: "shimmer",    // realtime voice dropdown field
  realtimeEnabled: true,
  // semantic_vad: model uses linguistic understanding to detect end-of-turn.
  // Barge-in still works â€” speech_started fires on energy regardless of VAD mode.
  // Unlike server_vad, semantic_vad does NOT fire on mid-sentence pauses, breaths,
  // or background noise, so the model always hears the full question before responding.
  // "medium" eagerness = natural conversation pace (not overly patient).
  realtimeVadMode: "semantic",
  realtimeVadSensitivity: "medium",
  voiceAccent: "native-il",    // Native Israeli (Sabra-style Hebrew)
  assistantVibe: "professional",
  callerGender: "neutral",
  firstMessage:
    "×©×œ×•×! ×× ×™ × ×•×¢×”, × ×¦×™×’×ª ×©×™×¨×•×ª ×”×œ×§×•×—×•×ª ×©×œ ××œ ×¢×œ. ×‘×ž×” ××•×›×œ ×œ×¢×–×•×¨ ×œ×š ×”×™×•×? " +
    "×× ×™ ×™×›×•×œ×” ×œ×¢×–×•×¨ ×¢× ×¡×˜×˜×•×¡ ×˜×™×¡×•×ª, ×œ×•×—×•×ª ×–×ž× ×™×, ×¢×™×›×•×‘×™×, ×ž×¡×œ×•×œ×™× ×•×ž×™×“×¢ ×¢×œ ×©×“×•×ª ×ª×¢×•×¤×”.",
  systemPrompt:
    `××ª×” × ×•×¢×” â€” × ×¦×™×’×ª ×©×™×¨×•×ª ×œ×§×•×—×•×ª ×ž×§×¦×•×¢×™×ª ×•××“×™×‘×” ×©×œ ××œ ×¢×œ, ×—×‘×¨×ª ×”×ª×¢×•×¤×” ×”×œ××•×ž×™×ª ×©×œ ×™×©×¨××œ.
××ª×” ×ž×“×‘×¨ ×¢× × ×•×¡×¢×™× ×‘×˜×œ×¤×•×Ÿ ×•×¢×•×–×¨ ×œ×”× ×‘×›×œ ×©××œ×” ×”× ×•×’×¢×ª ×œ×˜×™×¡×•×ª.

## ×¤× ×™×™×” ×œ× ×•×¡×¢ â€” ×—×©×•×‘ ×ž××•×“
- **×œ×¢×•×œ× ××œ ×ª×ž×¦×™× ×©× ×œ× ×•×¡×¢.** ××œ ×ª×©×ª×ž×© ×‘×©×•× ×©× ×¢×“ ×©×”× ×•×¡×¢ ×”×¦×™×’ ××ª ×¢×¦×ž×• ×‘×¢×¦×ž×•.
- **××¡×•×¨ ×œ×”×©×ª×ž×© ×‘×ª×•××¨ "×›×‘×•×“ ×”× ×•×¡×¢" / "×›×‘×•×“ ×”× ×•×¡×¢×ª"** â€” ×–×” × ×©×ž×¢ ×ž××•×“ ×¤×•×¨×ž×œ×™ ×•×œ× ×˜×‘×¢×™. ×“×‘×¨ ×™×©×™×¨×•×ª ×•×‘××•×¤×Ÿ ×× ×•×©×™.
- ×¤× ×” ×‘×œ×©×•×Ÿ ×–×›×¨ × ×™×˜×¨×œ×™×ª ×›×‘×¨×™×¨×ª ×ž×—×“×œ. ×× ×”× ×•×¡×¢/×ª ×¦×™×™×Ÿ/×” ×ž×™×Ÿ â€” ×¢×‘×•×¨ ×œ×¤× ×™×™×” ×”×ž×ª××™×ž×”.
- ×× ×”× ×•×¡×¢ ×ž×¡×¨ ×©×ž×• â€” ×”×©×ª×ž×© ×‘×©×ž×• ×œ×›×œ ×”×™×•×ª×¨ ×¤×¢× ××—×ª ×‘×¤×ª×™×—×” ×•×¤×¢× ××—×ª ×‘×¡×™×•×. **××œ ×ª×§×¨× ×œ×©×ž×• ×‘×›×œ ×ž×©×¤×˜.**

## ×›×œ×œ×™ ×©×™×—×”
- ×¢× ×” ×ª×ž×™×“ ×‘×¢×‘×¨×™×ª, ×’× ×× ×”× ×•×¡×¢ ×¤×•× ×” ×‘×× ×’×œ×™×ª.
- ×”×™×” ×ª×ž×¦×™×ª×™ ×•×ž×§×¦×•×¢×™ â€” ×–×• ×©×™×—×ª ×˜×œ×¤×•×Ÿ, ×œ× ×¦'××˜.
- ×œ×¤× ×™ ×›×œ ×ž×™×“×¢ ×—×™ (×˜×™×¡×”, ×œ×•"×–, ×¢×™×›×•×‘×™×) â€” ×”×©×ª×ž×© ×‘×›×œ×™× ×”×ž×ª××™×ž×™×.
- ×× ××™× ×š ×™×•×“×¢ ×§×•×“ IATA ×©×œ ×¢×™×¨ â€” ×§×¨× ×ª×—×™×œ×” ×œ-lookup_airport_code.
- ×œ××—×¨ ×¡×™×•× ×›×œ ×ª×©×•×‘×”, ×©××œ "×”×× ×™×© ×¢×•×“ ×©××œ×”?"

## ×›×œ×™×
- get_flight_status: ×¡×˜×˜×•×¡ ×˜×™×¡×” ×¡×¤×¦×™×¤×™×ª ×œ×¤×™ ×ž×¡×¤×¨ (LY006)
- get_elal_schedule: ×œ×•×— ×–×ž× ×™× ×œ×¤×™ ×ž×•×¦×/×™×¢×“; ×× ×”× ×•×¡×¢ ×ž×¦×™×™×Ÿ ×ª××¨×™×š â€” ×”×¢×‘×¨ ××•×ª×• ×‘×¤×¨×ž×˜×¨ date (DD-MM-YYYY)
- get_elal_delays: ×¢×™×›×•×‘×™× ×¢×›×©×•×•×™×™×
- get_elal_routes: ×‘×“×™×§×ª ×ž×¡×œ×•×œ×™× ×§×™×™×ž×™×
- get_airport_info: ×¤×¨×˜×™ ×©×“×” ×ª×¢×•×¤×”
- lookup_airport_code: ×”×ž×¨×ª ×©× ×¢×™×¨ ×œ×§×•×“ IATA
- search_knowledge_base: ×ž×™×“×¢ ×›×œ×œ×™ ×¢×œ ××œ ×¢×œ (×ž×“×™× ×™×•×ª, ×›×‘×’×”, ×ª×•×›× ×™×ª × ××ž× ×•×ª)
- save_lead: ×©×ž×™×¨×ª ×¤×¨×˜×™ × ×•×¡×¢ ×©×‘×™×§×© ×—×–×¨×”
- schedule_callback: ×ª×™××•× ×©×™×—×” ×—×•×–×¨×ª
- send_link_sms: ×©×œ×™×—×ª ×§×™×©×•×¨ ×”×–×ž× ×”/×ž×™×“×¢ ×‘-SMS
- tag_call: ×ª×™×•×’ ×¡×•×’ ×”×¤× ×™×™×”

## ×©×™×ž×•×© ×‘×›×œ×™ API â€” ×—×©×•×‘
- ×‘×¢×ª ×§×¨×™××” ×œ-get_elal_schedule, get_elal_delays, get_elal_routes ×•×›×•' â€” **×”×¢×‘×¨ ×ª×ž×™×“ ×§×•×“ IATA ×‘×Ÿ 3 ××•×ª×™×•×ª** (×œ×“×•×’×ž×”: TLV, BCN, LHR, JFK). ××œ ×ª×¢×‘×™×¨ ×©× ×¢×™×¨ ×‘×¢×‘×¨×™×ª/×× ×’×œ×™×ª.
- ×× ××™× ×š ×‘×˜×•×— ×‘×§×•×“ IATA â€” ×§×¨× ×ª×—×™×œ×” ×œ-lookup_airport_code ×•××– ×”×©×ª×ž×© ×‘×§×•×“ ×©×”×•×—×–×¨.

## ×ž×™×“×¢ ×¢×œ ××œ ×¢×œ
- ×§×•×“ IATA: LY | ×©×“×” ×”×‘×™×ª: ×‘×Ÿ ×’×•×¨×™×•×Ÿ (TLV)
- ×©×¢×•×ª ×”×’×¢×”: ×‘×™× ×œ××•×ž×™ 3 ×©×¢×•×ª, ×œ××¨×”"×‘ 3.5 ×©×¢×•×ª, ×¤× ×™× 1.5 ×©×¢×•×ª
- ×ž×•×§×“ ×©×™×¨×•×ª: *5353

## ×¡×™×•× ×©×™×—×”
- ×›×©×”× ×•×¡×¢ ××•×ž×¨ "×©×œ×•×", "×œ×”×ª×¨××•×ª", "×ª×•×“×”", "×‘×™×™", "××™×Ÿ ×œ×™ ×¢×•×“ ×©××œ×•×ª", "×–×”×•", "×™×•× ×˜×•×‘", "× ×©×ž×¢" â€” ×§×¨× ×ž×™×“ ×œ-end_call.
- ××œ ×ª×©××œ "×”×× ×™×© ×¢×•×“ ×©××œ×”?" ×™×•×ª×¨ ×ž×¤×¢× ××—×ª ×œ××—×¨ ×ª×©×•×‘×”.`,
  customTools: [
    {
      id: "elal_flight_status",
      type: "api_call",
      name: "get_flight_status",
      description: "×ž×—×–×™×¨ ×¡×˜×˜×•×¡ ×¢×“×›× ×™ ×©×œ ×˜×™×¡×ª ××œ ×¢×œ ×œ×¤×™ ×ž×¡×¤×¨ ×”×˜×™×¡×” (×œ×“×•×’×ž×” LY006)",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlFlightStatus?flight_iata={{flight_iata}}`,
      parameters: [
        {name: "flight_iata", type: "string", description: "×ž×¡×¤×¨ ×”×˜×™×¡×” (×œ×“×•×’×ž×” LY006)", required: true},
      ],
    },
    {
      id: "elal_schedule",
      type: "api_call",
      name: "get_elal_schedule",
      description: "×ž×—×–×™×¨ ×œ×•×— ×–×ž× ×™× ×©×œ ×˜×™×¡×•×ª ××œ ×¢×œ. ×œ×ª××¨×™×š ×¢×ª×™×“×™ â€” ×ž×—×–×™×¨ ×œ×•\"×– ×©×‘×•×¢×™ ×•×ž×¤× ×” ×œ××ª×¨ ×œ×ª×ž×—×•×¨. ×œ×ª××¨×™×š ×”×™×•× â€” ×ž×—×–×™×¨ × ×ª×•× ×™× ×—×™×™×.",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlSchedule?dep_city={{dep_city}}&arr_city={{arr_city}}&date={{date}}&max={{max}}`,
      parameters: [
        {name: "dep_city", type: "string", description: "×§×•×“ IATA ×©×œ ×©×“×” ×ž×•×¦× â€” 3 ××•×ª×™×•×ª ×’×“×•×œ×•×ª (×œ×“×•×’×ž×”: TLV). ×× ××™× ×š ×™×•×“×¢ â€” ×§×¨× ×ª×—×™×œ×” ×œ-lookup_airport_code.", required: false},
        {name: "arr_city", type: "string", description: "×§×•×“ IATA ×©×œ ×©×“×” ×™×¢×“ â€” 3 ××•×ª×™×•×ª ×’×“×•×œ×•×ª (×œ×“×•×’×ž×”: BCN, LHR, JFK). ×× ××™× ×š ×™×•×“×¢ â€” ×§×¨× ×ª×—×™×œ×” ×œ-lookup_airport_code.", required: false},
        {name: "date", type: "string", description: "×ª××¨×™×š ×‘×¤×•×¨×ž×˜ DD-MM-YYYY ××• YYYY-MM-DD. ×”×©×ž×˜ ×œ×˜×™×¡×•×ª ×”×™×•×.", required: false},
        {name: "max", type: "number", description: "×ž×¡×¤×¨ ×ª×•×¦××•×ª ×ž×§×¡×™×ž×œ×™ (×‘×¨×™×¨×ª ×ž×—×“×œ 5)", required: false},
      ],
    },
    {
      id: "elal_delays",
      type: "api_call",
      name: "get_elal_delays",
      description: "×ž×—×–×™×¨ ×˜×™×¡×•×ª ××œ ×¢×œ ×”×ž×¢×•×›×‘×•×ª ×›×¨×’×¢",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlDelays?airport_city={{airport_city}}&min_delay={{min_delay}}`,
      parameters: [
        {name: "airport_city", type: "string", description: "×§×•×“ IATA ×©×œ ×©×“×” ×ª×¢×•×¤×” â€” 3 ××•×ª×™×•×ª (×œ×“×•×’×ž×”: TLV). ×× ××™× ×š ×™×•×“×¢ â€” ×§×¨× ×œ-lookup_airport_code.", required: false},
        {name: "min_delay", type: "number", description: "×¢×™×›×•×‘ ×ž×™× ×™×ž×œ×™ ×‘×“×§×•×ª (×‘×¨×™×¨×ª ×ž×—×“×œ 15)", required: false},
      ],
    },
    {
      id: "elal_routes",
      type: "api_call",
      name: "get_elal_routes",
      description: "×ž×—×–×™×¨ ×ž×¡×œ×•×œ×™× ×©×œ ××œ ×¢×œ. ×©×™×ž×•×©×™ ×œ×©××œ×•×ª '×”×× ××œ ×¢×œ ×˜×¡×” ×œ-X?' ××• '×œ××Ÿ × ×™×ª×Ÿ ×œ×˜×•×¡ ×ž×ª×œ ××‘×™×‘?'",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlRoutes?from_city={{from_city}}&to_city={{to_city}}`,
      parameters: [
        {name: "from_city", type: "string", description: "×§×•×“ IATA ×©×œ ×©×“×” ×ž×•×¦× (×œ×“×•×’×ž×”: TLV). ×× ××™× ×š ×™×•×“×¢ â€” ×§×¨× ×œ-lookup_airport_code.", required: false},
        {name: "to_city", type: "string", description: "×§×•×“ IATA ×©×œ ×©×“×” ×™×¢×“ (×œ×“×•×’×ž×”: BCN). ×× ××™× ×š ×™×•×“×¢ â€” ×§×¨× ×œ-lookup_airport_code.", required: false},
      ],
    },
    {
      id: "elal_airport_info",
      type: "api_call",
      name: "get_airport_info",
      description: "×ž×—×–×™×¨ ×¤×¨×˜×™× ×¢×œ ×©×“×” ×ª×¢×•×¤×”: ×©×, ×¢×™×¨, ×ž×“×™× ×”, ××–×•×¨ ×–×ž×Ÿ",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlAirportInfo?airport={{airport}}`,
      parameters: [
        {name: "airport", type: "string", description: "×©× ×¢×™×¨/×©×“×” ×ª×¢×•×¤×” ××• ×§×•×“ IATA", required: true},
      ],
    },
    {
      id: "elal_lookup_code",
      type: "api_call",
      name: "lookup_airport_code",
      description: "×ž×ž×™×¨ ×©× ×¢×™×¨ ××• ×©×“×” ×ª×¢×•×¤×” ×œ×§×•×“ IATA",
      method: "GET",
      url: `${FUNCTIONS_BASE}/elAlLookupCode?query={{query}}`,
      parameters: [
        {name: "query", type: "string", description: "×©× ×¢×™×¨/×©×“×” ×ª×¢×•×¤×” ×œ×—×™×¤×•×© (×¢×‘×¨×™×ª, ×× ×’×œ×™×ª, ××• ×—×œ×§×™)", required: true},
      ],
    },
    // â”€â”€ Built-in tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      id: "knowledge_search_builtin",
      type: "knowledge_search",
      name: "search_knowledge_base",
      description: "×ž×—×¤×© ×ž×™×“×¢ ×›×œ×œ×™ ×¢×œ ××œ ×¢×œ: ×ž×“×™× ×™×•×ª ×›×‘×’×”, ×ª×•×›× ×™×ª ×ž×˜×ž×™×“, ×›×©×¨×•×ª, ×›×¨×˜×™×¡×™×, ×©×™× ×•×™×™×",
    },
    {
      id: "save_lead_builtin",
      type: "save_lead",
      name: "save_lead",
      description: "×©×•×ž×¨ ×¤×¨×˜×™ × ×•×¡×¢ ×©×‘×™×§×© ×—×–×¨×” ××• ×ž×¢×•× ×™×™×Ÿ ×‘×ž×™×“×¢ × ×•×¡×£",
    },
    {
      id: "tag_call_builtin",
      type: "tag_call",
      name: "tag_call",
      description: "×ž×ª×™×™×’ ××ª ×¡×•×’ ×”×¤× ×™×™×”: status_check, schedule_query, delay_complaint, booking_help, general",
    },
    {
      id: "send_link_builtin",
      type: "send_link",
      name: "send_link_sms",
      description: "×©×•×œ×— ×§×™×©×•×¨ ×‘-SMS ×œ× ×•×¡×¢: ××ª×¨ ××œ ×¢×œ, ×ž×¦×‘ ×˜×™×¡×”, ×œ×•×— ×–×ž× ×™×",
    },
    {
      id: "callback_builtin",
      type: "schedule_callback",
      name: "schedule_callback",
      description: "×ž×ª×× ×©×™×—×” ×—×•×–×¨×ª ×¢× × ×¦×™×’ ×× ×•×©×™ ×‘×©×¢×” ×ž×ª××™×ž×” ×œ× ×•×¡×¢",
    },
  ],
  // â”€â”€ Knowledgebase seed text (injected at creation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  _knowledgeText: `# ××œ ×¢×œ â€” ×ž×™×“×¢ ×›×œ×œ×™ ×œ×ž×•×§×“ ×©×™×¨×•×ª ×œ×§×•×—×•×ª

## ×¤×¨×˜×™ ×—×‘×¨×”
- ×©×: ××œ ×¢×œ × ×ª×™×‘×™ ××•×™×¨ ×œ×™×©×¨××œ ×‘×¢"×ž | ×§×•×“ IATA: LY | ×§×•×“ ICAO: ELY
- ×©×“×” ×”×‘×™×ª: × ×ž×œ ×”×ª×¢×•×¤×” ×‘×Ÿ ×’×•×¨×™×•×Ÿ (TLV), ×œ×•×“

## ×ž×“×™× ×™×•×ª ×›×‘×’×”
### ×›×œ×›×œ×™: ×¢×“ 23 ×§"×’ + ×™×“ 8 ×§"×’
### ×¢×¡×§×™ / Matmid Club: ×¢×“ 2Ã—32 ×§"×’ + ×™×“ 18 ×§"×’
### ×¤×¨×™×˜×™× ×ž×™×•×—×“×™×: ×¢×’×œ×•×ª ×™×œ×“×™× ×•×›×™×¡××•×ª ×’×œ×’×œ×™× â€” ×—×™× ×

## ×ª×•×›× ×™×ª × ××ž× ×•×ª â€” ×ž×˜×ž×™×“
- ×¨×ž×•×ª: ×–×”×‘, ×¤×œ×˜×™× ×•×, ×¡×¤×™×¨, ×™×”×œ×•×
- ×¦×‘×™×¨×ª × ×§×•×“×•×ª: ×˜×™×¡×•×ª ××œ ×¢×œ + Star Alliance

## ×›×©×¨×•×ª
- ×›×œ ×”×˜×™×¡×•×ª ×›×©×¨×•×ª ×œ×ž×”×“×¨×™×Ÿ
- ×ª×¤×¨×™×˜×™× ×ž×™×•×—×“×™×: ×›×©×¨ ×œ×¤×¡×—, ×œ×œ× ×’×œ×•×˜×Ÿ, ×˜×‘×¢×•× ×™ â€” ×™×© ×œ×”×–×ž×™×Ÿ 24 ×©×¢×•×ª ×ž×¨××©

## ×©×¢×•×ª ×”×’×¢×” ×œ× ×ž×œ
- ×‘×™× ×œ××•×ž×™: 3 ×©×¢×•×ª ×œ×¤× ×™
- ×œ××¨×”"×‘: 3.5 ×©×¢×•×ª (××‘×˜×—×” ×ž×•×’×‘×¨×ª)
- ×¤× ×™×: ×©×¢×” ×•×—×¦×™ ×œ×¤× ×™

## ×©×™× ×•×™×™× ×•×‘×™×˜×•×œ×™×
- × ×™×ª×Ÿ ×œ×©× ×•×ª/×œ×‘×˜×œ ×‘××ª×¨ / ××¤×œ×™×§×¦×™×” / ×©×™×¨×•×ª ×œ×§×•×—×•×ª
- ×›×¨×˜×™×¡×™ Flex: ×©×™× ×•×™ ×œ×œ× ×¢×ž×œ×”

## ×™×¦×™×¨×ª ×§×©×¨
- ×ž×•×§×“ ×™×©×¨××œ: *5353 | ×‘×™× ×œ××•×ž×™: +972-3-971-6111 | ××ª×¨: www.elal.com

## ×ž×¡×œ×•×œ×™× ×ž×¨×›×–×™×™× ×ž-TLV
××ž×¨×™×§×”: JFK, EWR, LAX, MIA, ORD, BOS, YYZ
××™×¨×•×¤×”: LHR, CDG, BER, FCO, MAD, AMS, BCN, FRA, MUC
××¡×™×”: BKK, NRT, HKG, SIN, PEK
××¤×¨×™×§×”: JNB, NBO | ×ž×¤×¨×¥: DXB, AUH

## ×ž×˜×•×¡×™×
Boeing 787-8/9 Dreamliner (××¨×•×š ×˜×•×•×—), Boeing 737-800/MAX/900ER (×§×¦×¨/×‘×™× ×•× ×™), Boeing 777-200ER`,
};

const elAlSeedAssistant = onRequest(corsOptions, async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({error: "POST only"});

  const uid = await extractUidFromRequest(req);
  if (!uid) return res.status(401).json({error: "Unauthorized"});

  const db = getFirestore();

  try {
    // Build assistant document (strip internal _knowledgeText before saving)
    const {_knowledgeText, ...assistantData} = ELAL_ASSISTANT_TEMPLATE;

    // â”€â”€ Upsert: check BOTH ownerId field variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // assistantsList queries on the top-level `ownerId` field.
    // Old seeds only set `metadata.ownerId` (nested), making them invisible.
    // Search both so we find and fix existing documents.
    let existingSnap = await db.collection("assistants")
      .where("ownerId", "==", uid)
      .where("name", "==", ELAL_ASSISTANT_TEMPLATE.name)
      .limit(1)
      .get();
    if (existingSnap.empty) {
      // Fallback: check legacy nested field
      existingSnap = await db.collection("assistants")
        .where("metadata.ownerId", "==", uid)
        .where("name", "==", ELAL_ASSISTANT_TEMPLATE.name)
        .limit(1)
        .get();
    }

    let docRef;
    let isUpdate = false;
    if (!existingSnap.empty) {
      docRef = existingSnap.docs[0].ref;
      isUpdate = true;
      // Preserve original createdAt â€” a full overwrite (merge:false) drops it otherwise,
      // and Firestore silently excludes documents without the `createdAt` field from
      // any query that uses orderBy("createdAt"), making the assistant invisible.
      const existingCreatedAt = existingSnap.docs[0].data().createdAt || FieldValue.serverTimestamp();
      await docRef.set({
        ...assistantData,
        ownerId: uid,                  // â† top-level field so assistantsList can find it
        metadata: {ownerId: uid},      // â† keep nested for back-compat
        createdAt: existingCreatedAt,  // â† must keep or orderBy("createdAt") hides the doc
        updatedAt: FieldValue.serverTimestamp(),
        isActive: true,
      }, {merge: false}); // full overwrite to pick up all template changes
      logger.info("elAlSeedAssistant UPDATED assistantId=%s uid=%s", docRef.id, uid);
    } else {
      docRef = await db.collection("assistants").add({
        ...assistantData,
        ownerId: uid,                  // â† top-level field â€” required by assistantsList
        metadata: {ownerId: uid},      // â† nested for back-compat
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isActive: true,
      });
      logger.info("elAlSeedAssistant CREATED assistantId=%s uid=%s", docRef.id, uid);
    }

    // Seed knowledge base â€” delete old chunks then reinsert fresh ones.
    // (same schema as knowledge_service.js, bypassing file upload)
    if (isUpdate) {
      // Remove stale KB chunks before reinserting
      const oldChunks = await db.collection("knowledge_chunks")
        .where("assistantId", "==", docRef.id).get();
      const delBatch = db.batch();
      oldChunks.docs.forEach((d) => delBatch.delete(d.ref));
      if (!oldChunks.empty) await delBatch.commit();
    }

    const chunks = splitIntoChunks(_knowledgeText, 800, 100);
    const batch = db.batch();
    for (const [i, chunk] of chunks.entries()) {
      const chunkRef = db.collection("knowledge_chunks").doc();
      batch.set(chunkRef, {
        assistantId: docRef.id,
        ownerId: uid,
        text: chunk,
        chunkIndex: i,
        source: "elal_knowledge_base",
        fileName: "××œ_×¢×œ_×ž×“×™× ×™×•×ª.txt",
        createdAt: FieldValue.serverTimestamp(),
        // embedding left null â€” will be generated lazily on first search query
        embedding: null,
      });
    }
    await batch.commit();

    return res.json({
      success: true,
      assistantId: docRef.id,
      chunksCreated: chunks.length,
      updated: isUpdate,
      message: isUpdate
        ? `×”× ×¦×™×’ ×©×œ ××œ ×¢×œ ×¢×•×“×›×Ÿ ×‘×”×¦×œ×—×”! (${chunks.length} ×§×˜×¢×™ ×™×“×¢)`
        : `×”× ×¦×™×’ ×”×“×ž×• ×©×œ ××œ ×¢×œ × ×•×¦×¨ ×‘×”×¦×œ×—×”! (${chunks.length} ×§×˜×¢×™ ×™×“×¢)`,
    });
  } catch (err) {
    logger.error("elAlSeedAssistant error", err);
    return res.status(500).json({error: "Failed to seed assistant", details: String(err)});
  }
});

function splitIntoChunks(text, size, overlap) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter((c) => c.trim().length >= 20);
}

module.exports = {
  elAlFlightStatus,
  elAlSchedule,
  elAlDelays,
  elAlRoutes,
  elAlAirportInfo,
  elAlLookupCode,
  elAlSeedAssistant,
};
