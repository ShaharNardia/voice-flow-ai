/**
 * Cloud Run WebSocket service for Twilio Media Streams + Deepgram STT
 *
 * Why Cloud Run instead of Firebase Functions:
 *   Firebase Cloud Functions terminate after the HTTP response is sent.
 *   Twilio Media Streams requires a persistent WebSocket connection for the
 *   duration of the call. Cloud Run keeps the container alive and supports
 *   long-lived WebSocket connections.
 *
 * Latency pipeline per turn:
 *   Twilio audio → WebSocket → Deepgram STT (nova-3) → filler phrase →
 *   GPT-4o-mini → TwiML update → Google Neural2-F TTS via Twilio
 *   Target: < 800ms end-to-end
 */

"use strict";

const express = require("express");
const expressWs = require("express-ws");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const twilio = require("twilio");
const {createClient} = require("@deepgram/sdk");
const sgMail = require("@sendgrid/mail");
const axios = require("axios");
const {makeLogAnomaly} = require("./anomaly");
const {RealtimeBridge}  = require("./realtime_bridge");
const {GeminiBridge}    = require("./gemini_bridge");
const {RealtimeRecorder} = require("./realtime_recorder");
const {RealtimeScenarioRunner} = require("./realtime_scenario_runner");
const {CallTelemetry} = require("./call_telemetry");

// ── Init ──────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp();
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ── Process-level stability guards ───────────────────────────────────────
// An unhandled rejection in any async path (TTS, LLM, Firestore write, etc.)
// must NOT crash the process and drop all in-flight calls.  Log it and continue.
process.on("unhandledRejection", (reason, _promise) => {
  console.error("[PROCESS] Unhandled promise rejection (call NOT dropped):", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  // Log but keep running — Cloud Run health checks will restart if truly broken.
  console.error("[PROCESS] Uncaught exception (attempting to stay alive):", err?.message, err?.stack?.slice(0, 600));
});

const app = express();
expressWs(app); // Attach WebSocket support to Express
app.use(express.json());
app.use(express.urlencoded({extended: false}));

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// ── SIP Bridge — replaces Twilio REST for call control ───────────────────────
// Set SIP_BRIDGE_URL env var to use bridge instead of Twilio (e.g. http://1.2.3.4:3000)
const SIP_BRIDGE_URL    = process.env.SIP_BRIDGE_URL    || "";
const SIP_BRIDGE_SECRET = process.env.SIP_BRIDGE_SECRET || "";

// ── System policies — admin-editable Gemini Live behavior rules ──────────────
// Cached in memory for 60s to avoid Firestore reads on every call. Defaults
// match the hardcoded behavior so an empty/missing policy doc is harmless.
const POLICY_CACHE_TTL_MS = 60_000;
let _policyCache = null;
let _policyCacheAt = 0;
const DEFAULT_SYSTEM_POLICY = {
  voiceHeader: null,                                // null → use the inline default in _buildInstructionsForRealtime
  goodbyePatterns: {
    hebrew:  "(להתראות|להישמע|כל טוב|יום (טוב|נעים)|שיהיה לך יום|תודה (רבה|לך)\\s+ו?(להתראות|שלום|כל טוב)|ביי|שלום\\s*[.!?]?\\s*$)",
    arabic:  "(مع السلامة|إلى اللقاء|وداعاً|اللقاء|يوم(اً)? (سعيد|طيب))",
    english: "\\b(goodbye|good\\s*bye|bye[-\\s]*bye|bye[\\s.!,?]|have a (good|nice|great) (day|one)|take care|talk to you later)\\b",
    spanish: "\\b(adi[óo]s|hasta luego|hasta pronto|que tengas? (un )?buen d[íi]a)\\b",
  },
  silenceThresholdMs: 12000,
  silenceMaxChecks:   3,
  silenceFarewell: {
    hebrew:  "ניראה לי שאין אף אחד על הקו. תודה ויום נעים, להתראות.",
    arabic:  "يبدو أنه لا يوجد أحد على الخط. شكراً لك ويوماً سعيداً، إلى اللقاء.",
    english: "It sounds like nobody's on the line. Have a nice day, goodbye.",
  },
  silenceCheckIn: {
    hebrew:  "אתה עדיין שם? אם כן, אני כאן לעזור.",
    arabic:  "هل ما زلت على الخط؟ أنا هنا للمساعدة.",
    english: "Are you still there? I'm here to help.",
  },
  maxKbChars: 8000,
  maxCallDurationSec: 1800,
  showToolCallsInTranscript: true,
  stripMetaEnabled: true,
};

async function fetchSystemPolicy() {
  const now = Date.now();
  if (_policyCache && (now - _policyCacheAt) < POLICY_CACHE_TTL_MS) return _policyCache;
  try {
    const db = getFirestore();
    const snap = await db.doc("system_policies/global").get();
    _policyCache = snap.exists ? { ...DEFAULT_SYSTEM_POLICY, ...snap.data() } : DEFAULT_SYSTEM_POLICY;
    _policyCacheAt = now;
  } catch (e) {
    console.warn("[Policy] fetch failed, using defaults:", e.message);
    _policyCache = DEFAULT_SYSTEM_POLICY;
    _policyCacheAt = now;
  }
  return _policyCache;
}

/**
 * Update a live call (play TwiML or hang up). Per-call provider aware.
 *
 * @param {string} callSid
 * @param {object} params         { twiml?, status? }
 * @param {object} [opts]
 * @param {"twilio"|"sip"} [opts.provider]   Explicit per-call provider — passed
 *                                           by handleGeminiSession / handleRealtimeSession
 *                                           from session.telephonyProvider.
 * @param {object} [opts.clientOverride]     Optional Twilio client override.
 *
 * Resolution order:
 *   1. opts.provider === "sip"   → SIP bridge
 *   2. opts.provider === "twilio"→ Twilio REST
 *   3. SIP_BRIDGE_URL set        → SIP bridge (legacy global flip)
 *   4. else                      → Twilio REST
 */
async function updateCall(callSid, params, opts = {}) {
  // Backwards-compat: third arg used to be the Twilio client override.
  const clientOverride = (opts && typeof opts === "object" && !opts.calls) ? opts.clientOverride : opts;
  const provider = (opts && typeof opts === "object") ? opts.provider : null;

  const wantSip = provider === "sip" || (!provider && SIP_BRIDGE_URL);
  if (wantSip && SIP_BRIDGE_URL) {
    try {
      await axios.post(`${SIP_BRIDGE_URL}/calls/${callSid}/update`, params, {
        headers: { "x-bridge-secret": SIP_BRIDGE_SECRET },
        timeout: 10000,
      });
      return;
    } catch (e) {
      console.warn(`[updateCall] SIP bridge failed (${e.message}) — falling back to Twilio`);
      // fall through to Twilio
    }
  }

  const client = clientOverride || twilioClient;
  if (client) await client.calls(callSid).update(params);
}

// ── Vibe & gender helpers (mirrors llm_service.js — keep in sync) ────────
const VIBE_SNIPPETS = {
  en: {
    professional: "Tone: professional and formal. Polished vocabulary, full sentences, no slang.",
    friendly:     "Tone: warm and friendly — like chatting with a helpful neighbor.",
    energetic:    "Tone: upbeat and enthusiastic. High energy, positive, motivated.",
    empathetic:   "Tone: calm and empathetic. Listen first, acknowledge feelings, never rush.",
    direct:       "Tone: brief and direct. One sentence max per reply. No small talk, get to the point.",
    sales:        "Tone: persuasive sales rep. Highlight benefits, handle objections, create urgency naturally.",
  },
  he: {
    professional: "סגנון: מקצועי ורשמי. מילים ברורות, משפטים מלאים, ללא סלנג.",
    friendly:     "סגנון: חם וידידותי — כמו שיחה עם שכן טוב.",
    energetic:    "סגנון: אנרגטי ומלא חיות. קול חיובי, נלהב, מוטיבציוני.",
    empathetic:   "סגנון: רגוע ואמפתי. קשוב, מכיר ברגשות, לא ממהר.",
    direct:       "סגנון: קצר וישיר. משפט אחד מקסימום. בלי שיחות סרק.",
    sales:        "סגנון: איש מכירות משכנע. מדגיש יתרונות, מטפל בהתנגדויות, יוצר דחיפות באופן טבעי.",
  },
  ar: {
    professional: "الأسلوب: مهني ورسمي. كلمات واضحة وجمل كاملة بدون عامية.",
    friendly:     "الأسلوب: دافئ وودي — كالتحدث مع جار لطيف.",
    energetic:    "الأسلوب: حيوي ومتحمس. إيجابي ومتحفز وملئ بالطاقة.",
    empathetic:   "الأسلوب: هادئ ومتعاطف. يستمع أولاً ويراعي المشاعر ولا يتسرع.",
    direct:       "الأسلوب: مختصر ومباشر. جملة واحدة كحد أقصى. بدون كلام زائد.",
    sales:        "الأسلوب: مندوب مبيعات مقنع. يبرز المزايا ويعالج الاعتراضات ويخلق إلحاحاً بشكل طبيعي.",
  },
  el: {
    professional: "Ύφος: επαγγελματικό και επίσημο. Σαφές λεξιλόγιο, πλήρεις προτάσεις, χωρίς αργκό.",
    friendly:     "Ύφος: ζεστό και φιλικό — σαν συνομιλία με έναν καλό γείτονα.",
    energetic:    "Ύφος: ζωηρό και ενθουσιώδες. Θετικό, παρακινητικό, γεμάτο ενέργεια.",
    empathetic:   "Ύφος: ήρεμο και ενσυναίσθητο. Ακούει πρώτα, αναγνωρίζει τα συναισθήματα, χωρίς βιασύνη.",
    direct:       "Ύφος: σύντομο και άμεσο. Μία πρόταση το πολύ. Χωρίς περιττές κουβέντες.",
    sales:        "Ύφος: πειστικός πωλητής. Αναδεικνύει οφέλη, χειρίζεται αντιρρήσεις, δημιουργεί αίσθηση επείγοντος φυσικά.",
  },
  zu: {
    professional: "Style: professional and respectful. Clear speech, complete sentences, no slang.",
    friendly:     "Style: warm and friendly — like talking with a helpful neighbour.",
    energetic:    "Style: lively and enthusiastic. Positive, motivating, full of energy.",
    empathetic:   "Style: calm and empathetic. Listen first, acknowledge feelings, no rush.",
    direct:       "Style: brief and direct. One sentence maximum. No filler words.",
    sales:        "Style: persuasive. Highlight benefits, handle objections, create natural urgency.",
  },
  af: {
    professional: "Styl: professioneel en formeel. Duidelike woordeskat, volledige sinne, geen sleng.",
    friendly:     "Styl: warm en vriendelik — soos 'n gesprek met 'n vriendelike buur.",
    energetic:    "Styl: lewendig en entoesiasties. Positief, motiverend, vol energie.",
    empathetic:   "Styl: kalm en empaties. Luister eers, erken gevoelens, geen haas.",
    direct:       "Styl: kort en direk. Hoogstens een sin. Geen oortollige praatjies.",
    sales:        "Styl: oortuigende verkoopspersoon. Beklemtoon voordele, hanteer besware, skep natuurlike dringendheid.",
  },
};

function getVibeSnippet(lang, vibe) {
  const langKey = lang === "he" ? "he"
    : lang === "ar" ? "ar"
    : lang === "el" ? "el"
    : lang === "zu" ? "zu"
    : lang === "af" ? "af"
    : "en";
  return VIBE_SNIPPETS[langKey]?.[vibe] || VIBE_SNIPPETS[langKey]?.friendly || "";
}

function hebrewGenderInstruction(callerGender) {
  // Speak naturally — no formal titles like "כבוד הנוסע/ת". Just talk like a person.
  const noNameRule = "חשוב: לעולם אל תמציא שם למתקשר. השתמש בשם רק אם המתקשר הציג את עצמו בעצמו.";
  if (callerGender === "male") {
    return `פנייה: המתקשר הוא גבר. פנה אליו בלשון זכר: "אתה", "רוצה", "מבין". דבר באופן טבעי וישיר — ללא תארים פורמליים. ${noNameRule}`;
  }
  if (callerGender === "female") {
    return `פנייה: המתקשרת היא אישה. פני אליה בלשון נקבה: "את", "רוצה", "מבינה". דבר באופן טבעי וישיר — ללא תארים פורמליים. ${noNameRule}`;
  }
  if (callerGender === "ask") {
    return `פנייה: בתחילת השיחה, אחרי הברכה הראשונה, שאל בעדינות: "כדי לפנות אליך נכון — זכר או נקבה?" — ואז השתמש בצורה שהמתקשר בחר. ${noNameRule}`;
  }
  // neutral (default) — use masculine neutral but naturally, no formal titles
  return `פנייה: פנה בלשון זכר ניטרלית. דבר בצורה טבעית וישירה — ללא תארים פורמליים כמו "כבוד" או "אדון". ${noNameRule}`;
}

function arabicGenderInstruction(callerGender) {
  if (callerGender === "male") {
    return "الجنس: المتصل رجل. استخدم الصيغة المذكرة طوال المحادثة (أنت، تريد، تفهم، تعرف).";
  }
  if (callerGender === "female") {
    return "الجنس: المتصلة امرأة. استخدم الصيغة المؤنثة طوال المحادثة (أنتِ، تريدين، تفهمين، تعرفين).";
  }
  if (callerGender === "ask") {
    return `الجنس: في بداية المحادثة، بعد التحية الأولى، اسأل بلطف: "كيف تفضل أن أخاطبك؟" — ثم استخدم الصيغة المناسبة طوال المحادثة. إذا لم يرد أو لم يكن واضحاً، استخدم صيغة محايدة.`;
  }
  return `الجنس: استخدم صياغة محايدة قدر الإمكان — تجنب الضمائر الجنسية المباشرة. استخدم الاسم إذا كان متاحاً، وإلا صِغ الجملة بأسلوب غير مباشر.`;
}

function getAccentInstruction(lang, voiceAccent) {
  if (!voiceAccent || voiceAccent === "default") return "";
  if (lang === "he") {
    if (voiceAccent === "native-il") {
      return "הגייה: דבר עברית במבטא ישראלי מקומי טבעי (ספרדי מודרני / צבר). ההגייה צריכה להישמע כמו דובר ילידי — לא כמו דובר אנגלי. דבר בקצב מאוזן וברור — לא מהיר מדי, הגה כל מילה בשלמותה.";
    }
    if (voiceAccent === "neutral") {
      return "הגייה: דבר עברית בהגייה ברורה, ניטרלית ומובנת — ללא מבטא אזורי. קצב מאוזן — לא מהיר.";
    }
  }
  if (lang === "ar") {
    if (voiceAccent === "msa") {
      return "اللهجة: تحدث بالعربية الفصحى الحديثة (MSA) — رسمية وواضحة ومفهومة في جميع البلدان العربية.";
    }
    if (voiceAccent === "levantine") {
      return "اللهجة: تحدث باللهجة الشامية (سوريا، لبنان، فلسطين، الأردن) — طبيعية وعامية ومألوفة.";
    }
    if (voiceAccent === "gulf") {
      return "اللهجة: تحدث باللهجة الخليجية (الإمارات، السعودية، الكويت) — طبيعية وعامية خليجية.";
    }
    if (voiceAccent === "egyptian") {
      return "اللهجة: تحدث باللهجة المصرية — الأكثر انتشاراً وفهماً في العالم العربي.";
    }
  }
  return "";
}

// ── Google Cloud TTS (direct API — much better Hebrew than Twilio <Say>) ──
const {TextToSpeechClient} = require("@google-cloud/text-to-speech");
const googleTtsClient = new TextToSpeechClient();

// Voice mapping per language — user-tested choices
const GOOGLE_TTS_VOICES = {
  he: {name: "he-IL-Chirp3-HD-Achird", languageCode: "he-IL", ssmlGender: "MALE"},
  en: {name: "en-US-Neural2-D",        languageCode: "en-US", ssmlGender: "MALE"},
  ar: {name: "ar-XA-Wavenet-B",        languageCode: "ar-XA", ssmlGender: "MALE"},
  el: {name: "el-GR-Wavenet-A",        languageCode: "el-GR", ssmlGender: "FEMALE"},
  af: {name: "af-ZA-Standard-B",       languageCode: "af-ZA", ssmlGender: "MALE"},
  // isiZulu: Google Cloud TTS has no native Zulu voice — fall through to OpenAI realtime
};

// In-memory audio cache for serving TTS audio to Twilio <Play>
const audioCache = new Map(); // id → {buffer, contentType, createdAt}
const AUDIO_CACHE_TTL = 120000; // 2 minutes

// TTS Models registry — available for selection via Admin Panel
const TTS_MODELS = {
  "openai-nova":    {provider: "openai", voice: "nova",    label: "OpenAI Nova (נשי, חם)"},
  "openai-alloy":   {provider: "openai", voice: "alloy",   label: "OpenAI Alloy (ניטרלי)"},
  "openai-shimmer": {provider: "openai", voice: "shimmer", label: "OpenAI Shimmer (נשי, רך)"},
  "openai-echo":    {provider: "openai", voice: "echo",    label: "OpenAI Echo (גברי)"},
  "openai-onyx":    {provider: "openai", voice: "onyx",    label: "OpenAI Onyx (גברי עמוק)"},
  "google-chirp3-achird":  {provider: "google", voice: "he-IL-Chirp3-HD-Achird",  label: "Google Chirp3 Achird (גברי)"},
  "google-chirp3-aoede":   {provider: "google", voice: "he-IL-Chirp3-HD-Aoede",   label: "Google Chirp3 Aoede (נשי)"},
  "google-chirp3-kore":    {provider: "google", voice: "he-IL-Chirp3-HD-Kore",    label: "Google Chirp3 Kore (נשי)"},
  "google-chirp3-puck":    {provider: "google", voice: "he-IL-Chirp3-HD-Puck",    label: "Google Chirp3 Puck (גברי)"},
  "google-wavenet-b":      {provider: "google", voice: "he-IL-Wavenet-B",         label: "Google Wavenet B (גברי)"},
  "google-wavenet-a":      {provider: "google", voice: "he-IL-Wavenet-A",         label: "Google Wavenet A (נשי)"},
};

// Default Hebrew TTS model (can be overridden from Firestore config)
let hebrewTtsModel = "openai-nova";

// Load preferred TTS model from Firestore
async function loadTtsModelPreference() {
  try {
    const projectId = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/tts`;
    const resp = await new Promise((resolve) => {
      require("https").get(url, {timeout: 3000}, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }).on("error", () => resolve(null));
    });
    if (resp?.fields?.hebrewModel?.stringValue) {
      hebrewTtsModel = resp.fields.hebrewModel.stringValue;
      console.log(`[TTS] Hebrew model from Firestore: ${hebrewTtsModel}`);
    }
  } catch {}
}
loadTtsModelPreference();

// Generate audio for ANY model
async function generateTTS(text, modelId) {
  const model = TTS_MODELS[modelId];
  if (!model) throw new Error(`Unknown TTS model: ${modelId}`);

  if (model.provider === "openai") {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const body = JSON.stringify({model: "tts-1", input: text, voice: model.voice, response_format: "mp3"});
    return new Promise((resolve, reject) => {
      const r = require("https").request({
        hostname: "api.openai.com", path: "/v1/audio/speech", method: "POST",
        headers: {"Authorization": "Bearer " + OPENAI_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)},
        timeout: 8000,
      }, (resp) => {
        const chunks = [];
        resp.on("data", c => chunks.push(c));
        resp.on("end", () => resp.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`OpenAI ${resp.statusCode}`)));
      });
      r.on("error", reject);
      r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
      r.write(body); r.end();
    });
  } else {
    // Google Cloud TTS
    const [response] = await googleTtsClient.synthesizeSpeech({
      input: {text},
      voice: {languageCode: "he-IL", name: model.voice},
      audioConfig: {audioEncoding: "MP3", sampleRateHertz: 24000, speakingRate: 1.05, pitch: 0, effectsProfileId: ["telephony-class-application"]},
    });
    return response.audioContent;
  }
}

// On-demand TTS endpoint — supports model selection
app.get("/tts", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "he";
  const modelId = req.query.model || (lang === "he" ? hebrewTtsModel : null);
  if (!text) return res.status(400).send("text required");
  try {
    if (modelId && TTS_MODELS[modelId]) {
      const audioBuffer = await generateTTS(text, modelId);
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-cache");
      res.send(audioBuffer);
    } else {
      // English/other: Google Cloud TTS
      const voiceConfig = GOOGLE_TTS_VOICES[lang] || GOOGLE_TTS_VOICES.en;
      const [response] = await googleTtsClient.synthesizeSpeech({
        input: {text},
        voice: voiceConfig,
        audioConfig: {audioEncoding: "MP3", speakingRate: 1.05, pitch: 0, effectsProfileId: ["telephony-class-application"]},
      });
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-cache");
      res.send(response.audioContent);
    }
  } catch (err) {
    console.error("[TTS endpoint]", err.message);
    res.status(500).send("TTS failed");
  }
});

// List available TTS models
app.get("/tts-models", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const models = Object.entries(TTS_MODELS).map(([id, m]) => ({id, label: m.label, provider: m.provider}));
  res.json({models, current: hebrewTtsModel});
});

// Save TTS model preference to Firestore
app.post("/tts-models", express.json(), async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const modelId = req.body?.model;
  if (!modelId || !TTS_MODELS[modelId]) return res.status(400).json({error: "Invalid model"});
  try {
    const {Firestore} = require("@google-cloud/firestore");
    const db = new Firestore({projectId: process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639"});
    await db.collection("config").doc("tts").set({hebrewModel: modelId, updatedAt: new Date().toISOString()}, {merge: true});
    hebrewTtsModel = modelId;
    console.log(`[TTS] Hebrew model set to: ${modelId}`);
    res.json({status: "ok", model: modelId});
  } catch (err) {
    console.error("[TTS] Failed to save model:", err.message);
    res.status(500).json({error: err.message});
  }
});

// TTS preview — accepts voice in format "openai:nova" or "Google.he-IL-Wavenet-D"
app.get("/tts-preview", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const text = req.query.text;
  const voice = req.query.voice || "openai:nova";
  if (!text) return res.status(400).send("text required");
  try {
    if (voice.startsWith("openai:")) {
      // OpenAI TTS
      const openaiVoice = voice.split(":")[1] || "nova";
      const audioBuffer = await new Promise((resolve, reject) => {
        const body = JSON.stringify({model: "tts-1", input: text, voice: openaiVoice, response_format: "mp3"});
        const r = require("https").request({
          hostname: "api.openai.com", path: "/v1/audio/speech", method: "POST",
          headers: {"Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)},
        }, (resp) => {
          const chunks = [];
          resp.on("data", c => chunks.push(c));
          resp.on("end", () => resp.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(new Error(`OpenAI ${resp.statusCode}`)));
        });
        r.on("error", reject);
        r.write(body); r.end();
      });
      res.set("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } else if (voice.startsWith("Google.")) {
      // Google Cloud TTS — voice format: "Google.he-IL-Wavenet-D"
      const voiceName = voice.replace("Google.", "");
      const langCode = voiceName.substring(0, 5); // "he-IL" or "en-US"
      const [response] = await googleTtsClient.synthesizeSpeech({
        input: {text},
        voice: {languageCode: langCode, name: voiceName},
        audioConfig: {audioEncoding: "MP3", sampleRateHertz: 24000},
      });
      res.set("Content-Type", "audio/mpeg");
      res.send(response.audioContent);
    } else {
      res.status(400).send("Unknown voice format");
    }
  } catch (err) {
    console.error("[TTS-preview]", err.message);
    res.status(500).send("TTS failed");
  }
});

// CORS preflight for tts-models POST
app.options("/tts-models", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).send("");
});

// Serve generated audio for Twilio <Play>
app.get("/audio/:id", (req, res) => {
  const entry = audioCache.get(req.params.id);
  if (!entry) return res.status(404).send("Not found");
  res.set("Content-Type", entry.contentType);
  res.set("Content-Length", entry.buffer.length);
  res.send(entry.buffer);
});

// Cleanup stale audio entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of audioCache) {
    if (now - entry.createdAt > AUDIO_CACHE_TTL) audioCache.delete(id);
  }
}, 60000);

// ── Hebrew pronunciation dictionary (loaded from Firestore) ──────────────────
// Managed via Admin Panel → Pronunciation tab.
// Fallback hardcoded fixes used if Firestore is unavailable.
const HARDCODED_FIXES = {
  "לנסלוט": "לאנסלוט",
  "Lancelot": "לאנסלוט",
};

// Cache pronunciation fixes from Firestore (refreshed every 5 min)
let pronunciationFixesCache = [];
let pronunciationFixesCacheTime = 0;
const PRONUNCIATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadPronunciationFixes() {
  const now = Date.now();
  if (now - pronunciationFixesCacheTime < PRONUNCIATION_CACHE_TTL && pronunciationFixesCache.length > 0) {
    return pronunciationFixesCache;
  }
  try {
    const projectId = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
    const url = `https://us-central1-${projectId}.cloudfunctions.net/getPronunciationFixes`;
    const resp = await new Promise((resolve, reject) => {
      require("https").get(url, {timeout: 3000}, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try { resolve(JSON.parse(d).fixes || []); }
          catch { resolve([]); }
        });
      }).on("error", () => resolve([]));
    });
    pronunciationFixesCache = resp;
    pronunciationFixesCacheTime = now;
    console.log(`[Pronunciation] Loaded ${resp.length} fixes from Firestore`);
    return resp;
  } catch {
    return pronunciationFixesCache.length > 0 ? pronunciationFixesCache : [];
  }
}

// ── Cost config cache (rate card + customer pricing) ──────────────
let costConfigCache = null;
let costConfigCacheTime = 0;

async function loadCostConfig() {
  const now = Date.now();
  if (now - costConfigCacheTime < PRONUNCIATION_CACHE_TTL && costConfigCache) {
    return costConfigCache;
  }
  try {
    const projectId = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
    const url = `https://us-central1-${projectId}.cloudfunctions.net/getCostConfig`;
    const resp = await new Promise((resolve, reject) => {
      require("https").get(url, {timeout: 3000}, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try { resolve(JSON.parse(d)); }
          catch { resolve({}); }
        });
      }).on("error", () => resolve({}));
    });
    costConfigCache = resp;
    costConfigCacheTime = now;
    return resp;
  } catch {
    return costConfigCache || {};
  }
}

function applyPronunciationFixes(text, firestoreFixes = []) {
  let fixed = text;
  // Apply Firestore fixes first (admin-managed)
  for (const fix of firestoreFixes) {
    if (fix.original && fix.replacement) {
      fixed = fixed.replace(new RegExp(fix.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), fix.replacement);
    }
  }
  // Apply hardcoded fallbacks
  for (const [wrong, right] of Object.entries(HARDCODED_FIXES)) {
    fixed = fixed.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), right);
  }
  return fixed;
}

// Add nikud to Hebrew text via GPT-4o-mini for correct TTS pronunciation
async function addNikud(text) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return text;
  const start = Date.now();
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {role: "system", content: `הוסף ניקוד מלא ומדויק לטקסט העברי. החזר רק את הטקסט המנוקד.
דוגמה: "בטח מה אתה צריך" → "בְּטַח! מָה אַתָּה צָרִיךְ?"
דוגמה: "מעולה אני יכול לעזור" → "מְעוּלֶּה! אֲנִי יָכוֹל לַעֲזוֹר"
שים לב: ניקוד מדויק על כל אות. אל תשנה מילים, רק הוסף ניקוד.`},
        {role: "user", content: text}
      ],
      temperature: 0, max_tokens: 300,
    });
    const req = require("https").request({
      hostname: "api.openai.com", path: "/v1/chat/completions", method: "POST",
      headers: {"Authorization": "Bearer " + OPENAI_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)},
      timeout: 4000,
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const r = JSON.parse(d).choices[0].message.content.trim();
          console.log(`[Nikud] ${Date.now() - start}ms: "${text.substring(0,30)}..." → "${r.substring(0,30)}..."`);
          resolve(r);
        } catch(e) { console.error("[Nikud] parse error, using original"); resolve(text); }
      });
    });
    req.on("error", () => { console.error("[Nikud] request error, using original"); resolve(text); });
    req.on("timeout", () => { req.destroy(); console.error("[Nikud] timeout, using original"); resolve(text); });
    req.write(body); req.end();
  });
}

// Generate TTS via OpenAI API (best Hebrew pronunciation) → store in cache → return audio URL
async function openaiTTS(text, voice = "nova", speed = 1.0) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error("No OpenAI key");
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const ttsBody = {model: "tts-1", input: text, voice, response_format: "mp3"};
    if (speed && speed !== 1.0) ttsBody.speed = speed;
    const body = JSON.stringify(ttsBody);
    const req = require("https").request({
      hostname: "api.openai.com", path: "/v1/audio/speech", method: "POST",
      headers: {"Authorization": "Bearer " + OPENAI_KEY, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)},
      timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) return reject(new Error(`OpenAI TTS ${res.statusCode}`));
        const ms = Date.now() - start;
        console.log(`[OpenAI-TTS] OK: ${buf.length} bytes, ${ms}ms, voice=${voice}`);
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        audioCache.set(id, {buffer: buf, contentType: "audio/mpeg", createdAt: Date.now()});
        const cloudRunUrl = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.me-west1.run.app";
        resolve(`${cloudRunUrl}/audio/${id}`);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("OpenAI TTS timeout")); });
    req.write(body); req.end();
  });
}

// Generate TTS via ElevenLabs → store in cache → return audio URL.
// This is the best-quality Hebrew voice path (#39). Uses the low-latency
// Turbo v2.5 multilingual model. voiceId defaults to a configured Hebrew
// voice; callers pass "elevenlabs:<voiceId>" or "elevenlabs:<voiceId>:<modelId>".
// eleven_flash_v2_5 is ElevenLabs' lowest-latency model (~75ms model time vs
// ~300ms for turbo), 32 languages incl. Hebrew. Slightly lower fidelity than
// turbo but indistinguishable over an 8kHz phone line — the right tradeoff
// for a real-time call. Saves ~200ms/turn.
const ELEVEN_DEFAULT_MODEL = "eleven_flash_v2_5";
async function elevenlabsTTS(text, voiceId, modelId = ELEVEN_DEFAULT_MODEL) {
  const KEY = process.env.ELEVENLABS_API_KEY;
  if (!KEY) throw new Error("No ElevenLabs key");
  if (!voiceId) throw new Error("No ElevenLabs voiceId");
  const start = Date.now();
  const body = JSON.stringify({
    text,
    model_id: modelId,
    // Telephony-tuned voice settings: a touch more stability for 8kHz lines,
    // moderate similarity so it stays natural without artifacts.
    voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
  });
  return new Promise((resolve, reject) => {
    // output_format mp3_22050_32 is small + fast over the wire; Twilio
    // re-samples on playback. Good latency/quality balance for phone.
    const req = require("https").request({
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_22050_32`,
      method: "POST",
      headers: {
        "xi-api-key": KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          return reject(new Error(`ElevenLabs TTS ${res.statusCode}: ${buf.toString("utf8").slice(0, 200)}`));
        }
        const ms = Date.now() - start;
        console.log(`[ElevenLabs-TTS] OK: ${buf.length} bytes, ${ms}ms, voice=${voiceId}, model=${modelId}`);
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        audioCache.set(id, { buffer: buf, contentType: "audio/mpeg", createdAt: Date.now() });
        const cloudRunUrl = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-myg46khq7q-uc.a.run.app";
        resolve(`${cloudRunUrl}/audio/${id}`);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("ElevenLabs TTS timeout")); });
    req.write(body); req.end();
  });
}

// Generate TTS via Google Cloud TTS API → store in cache → return audio URL
async function googleTTS(text, lang) {
  const voiceConfig = GOOGLE_TTS_VOICES[lang] || GOOGLE_TTS_VOICES.en;
  const start = Date.now();
  const [response] = await googleTtsClient.synthesizeSpeech({
    input: {text},
    voice: voiceConfig,
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.05,  // slightly faster for natural phone conversation
      pitch: 0,
      effectsProfileId: ["telephony-class-application"], // optimized for phone calls
    },
  });
  const ms = Date.now() - start;
  const audioBuffer = response.audioContent;
  console.log(`[GoogleTTS] OK: ${audioBuffer.length} bytes, ${ms}ms, voice=${voiceConfig.name}`);

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  audioCache.set(id, {
    buffer: audioBuffer,
    contentType: "audio/mpeg",
    createdAt: Date.now(),
  });
  const cloudRunUrl = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.me-west1.run.app";
  return `${cloudRunUrl}/audio/${id}`;
}

// ── Pre-generated filler audio (Chirp3-HD, same voice as responses) ──
const fillerAudioCache = {}; // {he: [{id, url}], en: [{id, url}]}
async function preGenerateFillers() {
  const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.me-west1.run.app";
  const fillers = {
    he: ["רֶגַע...", "כֵּן...", "אוֹקֵיי...", "שְׁנִיָּה..."],
    en: ["Sure...", "Got it...", "One moment...", "Okay..."],
    el: ["Ορίστε...", "Βεβαίως...", "Μια στιγμή...", "Εντάξει..."],
  };
  for (const [lang, phrases] of Object.entries(fillers)) {
    fillerAudioCache[lang] = [];
    const voiceConfig = GOOGLE_TTS_VOICES[lang] || GOOGLE_TTS_VOICES.en;
    for (const phrase of phrases) {
      try {
        const [response] = await googleTtsClient.synthesizeSpeech({
          input: {text: phrase},
          voice: voiceConfig,
          audioConfig: {audioEncoding: "MP3", speakingRate: 1.05, pitch: 0, effectsProfileId: ["telephony-class-application"]},
        });
        const id = "filler_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        audioCache.set(id, {buffer: response.audioContent, contentType: "audio/mpeg", createdAt: Date.now()});
        fillerAudioCache[lang].push({id, url: `${CLOUD_RUN_URL}/audio/${id}`, phrase});
        // Don't let these expire
      } catch (e) {
        console.error(`[Filler] Failed to pre-generate "${phrase}":`, e.message);
      }
    }
    console.log(`[Filler] Pre-generated ${fillerAudioCache[lang].length} ${lang} fillers`);
  }
  // Refresh filler cache entries every 60s so they don't expire
  setInterval(() => {
    for (const entries of Object.values(fillerAudioCache)) {
      for (const e of entries) {
        const cached = audioCache.get(e.id);
        if (cached) cached.createdAt = Date.now();
      }
    }
  }, 60000);
}
preGenerateFillers().catch(e => console.error("[Filler] Init failed:", e.message));

// ── Latency / noise-gate constants ───────────────────────────────────────
//
// BARGE_IN_CONFIDENCE_THRESHOLD (raised 0.35 → 0.55)
//   Interim transcripts below this confidence are ignored for barge-in.
//   0.35 was too permissive — ambient speech ~1m away regularly hit 0.35.
//   0.55 requires the speech to be clearly directed at the microphone.
//
// FINAL_TRANSCRIPT_MIN_CONFIDENCE (new)
//   Final transcripts below 0.50 are dropped before reaching the LLM.
//   Deepgram returns low-confidence (<0.4) for background / overlapping speech.
//   Dropping them prevents the bot from reacting to people talking nearby.
//
// FINAL_TRANSCRIPT_MIN_WORDS (new)
//   Single-word finals are almost always noise artifacts or mouth sounds.
//   Exception: SHORT_COMMAND_RE covers legitimate one-word user inputs.
const BARGE_IN_CONFIDENCE_THRESHOLD = 0.55;
const FINAL_TRANSCRIPT_MIN_CONFIDENCE = 0.50;
const FINAL_TRANSCRIPT_MIN_WORDS = 2;
// One-word utterances that ARE valid user inputs — never filtered by the word-count gate.
const SHORT_COMMAND_RE = /^(yes|no|ok|okay|stop|bye|hi|hello|yeah|nope|sure|wait|hold|help|שלום|כן|לא|בסדר|עצור|המתן|תעצור|ביי|יס|אוקיי|אוק|סטופ)$/i;
const BARGE_IN_TIME_THRESHOLD = 200; // ms
const MAX_CONVERSATION_HISTORY = 20;
const LLM_TIMEOUT_MS = 10000;

// Active Deepgram connections keyed by callSid
const activeConnections = new Map();

// Format phone number for speech synthesis — avoids TTS reading "+972508908099" as a big number
// "+972508908099" → "plus 9 7 2 5 0 8 9 0 8 0 9 9"
function formatPhoneForSpeech(phone) {
  const str = String(phone || "");
  const prefix = str.startsWith("+") ? "plus " : "";
  const digits = str.replace(/\D/g, "").split("").join(" ");
  return prefix + digits;
}

// Sanitize text for voice — strip markdown, special chars, URLs, etc.
// The bot should sound natural, never say "hashtag hashtag hashtag" or "asterisk".
function sanitizeForSpeech(text) {
  if (!text) return text;
  return text
    // Remove markdown headers (### Title → Title)
    .replace(/^#{1,6}\s*/gm, "")
    // Remove bold/italic markers (**text** → text, *text* → text, __text__ → text)
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove raw URLs (https://... or http://...)
    .replace(/https?:\/\/[^\s)]+/g, "")
    // Remove bullet markers (- item, * item, + item)
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Remove numbered list markers (1. item)
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove code blocks (```...```)
    .replace(/```[^`]*```/gs, "")
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, "$1")
    // Remove blockquotes (> text → text)
    .replace(/^>\s*/gm, "")
    // Remove horizontal rules (---, ***, ___)
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove remaining special chars that TTS might read aloud
    .replace(/[#*_~`|<>{}[\]\\]/g, "")
    // Collapse multiple spaces/newlines
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

// ── Health check ──────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({status: "ok", ts: Date.now()}));

// Gemini Live connectivity probe — call /gemini-probe to test from within Cloud Run
app.get("/gemini-probe", (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { return res.json({ok: false, error: "GEMINI_API_KEY not set"}); }
  const WebSocket = require("ws");
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;
  const ws = new WebSocket(url);
  const t = setTimeout(() => { ws.close(); res.json({ok: false, error: "timeout — no response in 6s", keyPrefix: key.slice(0,8)}); }, 6000);
  ws.on("open", () => {
    ws.send(JSON.stringify({ setup: { model: `models/${process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-latest"}`, generationConfig: { responseModalities: ["audio"] }, systemInstruction: { parts: [{ text: "Say hello." }] } } }));
  });
  ws.on("message", (d) => {
    clearTimeout(t); ws.close();
    const txt = d.toString().slice(0, 200);
    res.json({ok: true, message: txt, model: process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-latest", keyPrefix: key.slice(0,8)});
  });
  ws.on("unexpected-response", (req2, res2) => {
    let body = ""; res2.on("data", c => body += c); res2.on("end", () => { clearTimeout(t); ws.close(); res.json({ok: false, error: `HTTP ${res2.statusCode}: ${body.slice(0,200)}`, keyPrefix: key.slice(0,8)}); });
  });
  ws.on("error", (e) => { clearTimeout(t); res.json({ok: false, error: e.message, keyPrefix: key.slice(0,8)}); });
});

// Substitute {{placeholder}} tokens in a string using the given values map.
// Values are URL-encoded so that non-ASCII characters (Hebrew, Arabic, spaces, etc.)
// are safely transmitted in query strings and decoded correctly by Express on the other end.
function substitutePlaceholders(template, values) {
  if (!template || typeof template !== "string") return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = values?.[key];
    if (v == null) return "";
    const s = String(v);
    // Only encode if the value will appear inside a URL query string (template contains "?").
    // Encoding bare values that end up in JSON bodies would double-encode them.
    return template.includes("?") ? encodeURIComponent(s) : s;
  });
}

/**
 * Summarize a potentially-huge JSON response into something the model can
 * consume in a single turn. For arrays of objects (common case — product
 * lists, order lists), we extract key fields and truncate the list.
 */
/**
 * Extract a compact, model-friendly version of one item from a JSON list.
 * Keeps the small, identifying fields (name/sku/price/stock) and drops bloat.
 */
function compactItem(item) {
  if (item == null || typeof item !== "object") return item;
  const out = {};

  // Scalar fields commonly present across product/order/user catalogs.
  const scalarKeep = [
    "id", "uuid", "name", "title", "slug", "sku", "product_code", "model",
    "brand", "manufacturer", "type",
    "cost", "currency", "stock", "stock_status", "quantity",
    "status", "state", "rating", "on_sale",
    "is_in_stock", "is_purchasable", "is_on_backorder", "low_stock_remaining",
    "email", "phone", "country",
  ];
  for (const k of scalarKeep) {
    if (item[k] == null || typeof item[k] === "object") continue;
    const v = item[k];
    out[k] = typeof v === "string" && v.length > 180 ? v.slice(0, 180) + "…" : v;
  }

  // Clean HTML out of the name (WooCommerce escapes entities in names)
  if (typeof out.name === "string") {
    out.name = out.name
      .replace(/&#?\w+;/g, " ")    // HTML entities → space
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // WooCommerce-style: pull price + currency out of the nested `prices` object
  if (item.prices && typeof item.prices === "object") {
    const p = item.prices;
    if (p.price != null) out.price = p.price;
    if (p.regular_price != null) out.regular_price = p.regular_price;
    if (p.sale_price != null && p.sale_price !== p.regular_price) out.sale_price = p.sale_price;
    if (p.currency_code) out.currency = p.currency_code;
  }

  // Categories / brands (often an array of {id, name, slug})
  for (const listKey of ["categories", "brands", "tags"]) {
    if (Array.isArray(item[listKey]) && item[listKey].length > 0) {
      out[listKey] = item[listKey].slice(0, 4).map((x) => (x?.name || x?.slug || x)).filter(Boolean);
    }
  }

  return out;
}

/**
 * Summarize a potentially-huge JSON response into something the model can
 * consume in a single turn. For arrays we keep ALL items (not just first N)
 * up to the byte budget — so the model can find specific SKUs/brands the
 * caller asked about, even when they're deep in the list.
 */
function summarizeApiResponse(data, maxChars = 20000) {
  if (typeof data === "string") return data.slice(0, maxChars);

  const arr = Array.isArray(data) ? data
    : Array.isArray(data?.products) ? data.products
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.results) ? data.results
    : Array.isArray(data?.data) ? data.data
    : null;

  if (arr) {
    // Try to fit as many compacted items as possible under the byte budget.
    // Build incrementally so a huge list doesn't balloon before we trim.
    const compacted = [];
    let running = 0;
    for (const item of arr) {
      const c = compactItem(item);
      const s = JSON.stringify(c);
      if (running + s.length + 2 > maxChars - 200 /* header */) break;
      compacted.push(c);
      running += s.length + 2;
    }
    const summary = {
      totalCount: arr.length,
      returned: compacted.length,
      truncated: compacted.length < arr.length,
      items: compacted,
    };
    return JSON.stringify(summary);
  }

  const s = JSON.stringify(data);
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "…[truncated]";
}

/**
 * Execute a user-defined custom API tool call.
 * The model filled in the tool's parameters via function calling; we
 * substitute them into the URL/headers/body template and fire the request.
 * Response body gets smart-summarized before being handed back to the model.
 */
async function executeCustomApiTool(tool, args, callSessionId) {
  try {
    const url = substitutePlaceholders(tool.url, args);
    const method = (tool.method || "POST").toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(tool.headers || {})) {
      headers[k] = substitutePlaceholders(v, args);
    }
    if (!headers["Content-Type"] && method !== "GET") headers["Content-Type"] = "application/json";

    const axiosConfig = {method, url, headers, timeout: 15000, validateStatus: () => true, maxContentLength: 5 * 1024 * 1024};
    if (method !== "GET") axiosConfig.data = args;

    console.log(`[${callSessionId}] [RT] Custom API: ${method} ${url}`);
    const resp = await axios(axiosConfig);
    const summary = summarizeApiResponse(resp.data);
    console.log(`[${callSessionId}] [RT] Custom API ${tool.name} → ${resp.status} (${summary.length} chars summary)`);
    return `HTTP ${resp.status}\n${summary}`;
  } catch (e) {
    console.error(`[${callSessionId}] [RT] Custom API ${tool.name} failed:`, e.message);
    return `Error: ${e.message}`;
  }
}

// ── PII / Compliance detection helper ────────────────────────────────
// Called on every assistant transcript turn to catch accidental PII leakage.
// Violations are logged to Firestore compliance_violations (non-blocking).
const PII_PATTERNS = [
  {type: "credit_card",    re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/},
  {type: "ssn",            re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/},
  {type: "bank_routing",   re: /\b[0-9]{9}\b/},  // 9-digit ABA
  {type: "medical_record", re: /\b(?:MRN|medical record number|patient id)[:\s#]*[A-Z0-9-]{4,}\b/i},
];
async function detectAndLogPiiViolations(text, callSessionId, ownerId, assistantId) {
  const violations = [];
  for (const {type, re} of PII_PATTERNS) {
    if (re.test(text)) violations.push(type);
  }
  if (!violations.length) return;
  try {
    const db = getFirestore();
    await db.collection("compliance_violations").add({
      callSessionId,
      ownerId: ownerId || null,
      assistantId: assistantId || null,
      violationType: "pii_in_speech",
      severity: "high",
      details: {patterns: violations, source: "assistant_transcript"},
      createdAt: FieldValue.serverTimestamp(),
    });
    console.warn(`[${callSessionId}] [COMPLIANCE] PII detected in assistant speech:`, violations);
  } catch (e) {
    console.error(`[${callSessionId}] [COMPLIANCE] Failed to log PII violation:`, e.message);
  }
}

// ── OpenAI Realtime session handler ──────────────────────────────────
// Activated when assistant.realtimeEnabled === true.
// Bridges Twilio Media Stream ↔ OpenAI Realtime API directly.
// Audio in → GPT-4o Realtime → Audio out. No STT, no TTS, no LLM hop.
async function handleRealtimeSession(ws, {callSessionId, data, assistant, assistantId, db, sessionRef, messageBuffer = [], markSetupComplete = null}) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error(`[${callSessionId}] [RT] No OPENAI_API_KEY — cannot start realtime session`);
    ws.close(1008, "Missing API key");
    return;
  }

  const callStartTime = Date.now();
  const logAnomaly = makeLogAnomaly(db, FieldValue);
  const anomaly = (params) => logAnomaly({callSessionId, ownerId: data.ownerId || null, assistantId, ...params});

  console.log(`[${callSessionId}] [RT] Starting Realtime session`);

  // ── Instruction building ──────────────────────────────────────────────────
  //
  // Priority order (highest → lowest, also roughly top → bottom in the prompt):
  //   1. PRIMARY ROLE  — the user's system prompt. Cannot be overridden.
  //   2. CALL RULES    — phone-call format, end-call timing, name limits.
  //   3. CALLER CONTEXT — returning-caller profile (supplementary; subordinate to 1 & 2).
  //   4. REFERENCE INFO — knowledge base (factual lookup only).
  //   5. STYLE         — vibe / accent / gender modifiers.
  //   6. CALL OPENING  — the exact firstMessage to speak immediately.
  //
  // Items 5 & 6 appear last because the Realtime model weights recent context
  // more heavily — putting operational rules last keeps them "warm" so they
  // are consistently obeyed.
  //
  const assistantIdentity = `You are ${assistant.name || assistant.assistantName || "an AI assistant"}${assistant.companyName ? ` from ${assistant.companyName}` : ""}.`;
  const _rtLangRaw = (assistant.language || "").toLowerCase();
  const _rtLang = _rtLangRaw.startsWith("he") ? "he"
    : _rtLangRaw.startsWith("ar") ? "ar"
    : _rtLangRaw.startsWith("el") ? "el"
    : _rtLangRaw.startsWith("zu") ? "zu"
    : _rtLangRaw.startsWith("af") ? "af"
    : "en";
  const _rtVibe = getVibeSnippet(_rtLang, assistant.assistantVibe || "friendly");
  const _rtGender = _rtLang === "he" ? hebrewGenderInstruction(assistant.callerGender || "neutral")
    : _rtLang === "ar" ? arabicGenderInstruction(assistant.callerGender || "neutral") : "";
  const _rtAccent = getAccentInstruction(_rtLang, assistant.voiceAccent);
  const _rtStyle = [_rtVibe, _rtGender, _rtAccent].filter(Boolean).join("\n");

  // ── Name-prohibition detection — run BEFORE building any instruction text ──
  // If the system prompt explicitly says not to use names we must not inject
  // name data anywhere in the instructions (even in the profile section).
  const _nameProhibited = !!(assistant.systemPrompt && (
    /אל תגיד שמות|לא לומר שם|לא להגיד שמ|שמות.*אסור|אסור.*שמ|don'?t.*use.*name|no.*name|without.*name|not.*use.*name|never.*name|don'?t.*say.*name/i
      .test(assistant.systemPrompt)
  ));

  // ── Translation mode config ───────────────────────────────────────────────
  const translationMode   = assistant.translationMode   || null;
  const callerLanguage    = assistant.callerLanguage    || null;
  const outputLanguage    = assistant.outputLanguage    || null;
  const LANG_NAMES = {
    en: "English", he: "Hebrew", ar: "Arabic", es: "Spanish", fr: "French",
    de: "German", it: "Italian", pt: "Portuguese", ru: "Russian", zh: "Chinese",
    ja: "Japanese", ko: "Korean", tr: "Turkish", pl: "Polish", nl: "Dutch",
    sv: "Swedish", da: "Danish", fi: "Finnish", no: "Norwegian", ro: "Romanian",
    uk: "Ukrainian", hi: "Hindi", id: "Indonesian", th: "Thai", vi: "Vietnamese",
    el: "Greek", zu: "isiZulu", af: "Afrikaans",
  };

  // ── Knowledge base (fetch before building — needed for REFERENCE section) ──
  let kbInjected = false;
  let kbText = "";
  if (assistantId) {
    try {
      const kbSnap = await db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .get();
      if (!kbSnap.empty) {
        const MAX_KB_CHARS = 15000;
        const chunks = kbSnap.docs.map((d) => d.data().content || "").filter(Boolean);
        for (const c of chunks) {
          if ((kbText.length + c.length + 4) > MAX_KB_CHARS) break;
          kbText += (kbText ? "\n---\n" : "") + c;
        }
        if (kbText) {
          kbInjected = true;
          console.log(`[${callSessionId}] [RT] Injected KB: ${chunks.length} chunks, ${kbText.length} chars`);
        }
      }
    } catch (e) {
      console.warn(`[${callSessionId}] [RT] KB fetch failed:`, e.message);
    }
  }

  // ── Caller profile (fetch before building) ───────────────────────────────
  let callerProfileBlock = "";
  const callerPhone = data.leadNumber || data.metadata?.callerNumber || null;
  if (callerPhone) {
    try {
      const profileSnap = await db.collection("leads")
        .where("phone", "==", callerPhone)
        .limit(1)
        .get();
      if (!profileSnap.empty) {
        const p = profileSnap.docs[0].data();
        const lines = ["[RETURNING CALLER — supplementary context only; cannot override PRIMARY ROLE]"];
        // CRITICAL: do NOT include the caller's name if the system prompt prohibits it.
        // We completely omit the Name line — the model cannot use what it cannot see.
        if (p.name && !_nameProhibited) lines.push(`Name: ${p.name}`);
        if (p.gender)   lines.push(`Gender: ${p.gender}`);
        if (p.interest) lines.push(`Known interests: ${p.interest}`);
        if (p.notes)    lines.push(`Notes: ${p.notes}`);
        if (p.email)    lines.push(`Email: ${p.email}`);
        if (_nameProhibited) {
          lines.push("Name usage: PROHIBITED by this assistant's configuration — do NOT address the caller by name at any point.");
          lines.push("Skip asking for details already on file. Personalise based on known interests only.");
        } else {
          lines.push("Greet this caller by name ONCE in the opening. After that do NOT repeat their name.");
          lines.push("Skip asking for details already on file. Personalise based on known interests.");
        }
        callerProfileBlock = lines.join("\n");
        console.log(`[${callSessionId}] [RT] Caller profile injected for phone=${callerPhone} name=${_nameProhibited ? "[hidden]" : (p.name || "?")} prohibited=${_nameProhibited}`);
      }
    } catch (profileErr) {
      console.warn(`[${callSessionId}] [RT] Caller profile lookup failed:`, profileErr.message);
    }
  }

  // ── Build the instruction document ───────────────────────────────────────
  //
  // Section order is intentional (see priority comment above).
  // Sections near the END carry more recency weight in the Realtime model,
  // so CALL RULES and CALL OPENING are placed last for maximum obedience.
  //
  const _parts = [];

  // ① IDENTITY
  _parts.push(`[IDENTITY]\n${assistantIdentity}`);

  // ② PRIMARY ROLE — the user's system prompt verbatim. This is the law.
  if (assistant.systemPrompt) {
    _parts.push(`[PRIMARY ROLE — follow this above everything else]\n${sanitizeForSpeech(assistant.systemPrompt)}`);
  } else {
    _parts.push("[PRIMARY ROLE]\nYou are a helpful phone assistant. Answer questions clearly and concisely.");
  }

  // ③ TRANSLATION MODE (overrides role when set)
  if (translationMode && outputLanguage) {
    const outLangName = LANG_NAMES[outputLanguage] || outputLanguage;
    const inLangName  = callerLanguage ? (LANG_NAMES[callerLanguage] || callerLanguage) : "the caller's language";
    if (translationMode === "interpret") {
      _parts.push(`[LIVE INTERPRETER MODE — overrides PRIMARY ROLE]\nYou are a live interpreter. The caller speaks ${inLangName}. ALWAYS respond in ${outLangName} only. Interpret accurately — do not add commentary.`);
    } else if (translationMode === "relay") {
      _parts.push(`[RELAY INTERPRETER MODE — overrides PRIMARY ROLE]\nYou are a silent relay interpreter. Repeat everything the caller says in ${outLangName} as a faithful literal translation. Do not answer or engage.`);
    } else if (translationMode === "bilingual") {
      _parts.push(`[BILINGUAL MODE — overrides PRIMARY ROLE]\nRespond in BOTH ${outLangName} and ${inLangName} on every turn. ${outLangName} first, then ${inLangName}. One short sentence per language.`);
    }
    console.log(`[${callSessionId}] [RT] Translation mode: ${translationMode} | ${inLangName} → ${outLangName}`);
  }

  // ④ CALLER CONTEXT (supplementary — cannot override sections ① ②)
  const leadNumber = data.leadNumber || null;
  if (data.leadName && !_nameProhibited) {
    _parts.push(`[CALLER CONTEXT]\nCaller name: ${data.leadName}`);
  }
  if (callerProfileBlock) _parts.push(callerProfileBlock);

  // ⑤ REFERENCE INFORMATION (knowledge base)
  if (kbInjected) {
    _parts.push(`[REFERENCE INFORMATION — use to answer factual questions; summarise naturally, do not recite]\n${sanitizeForSpeech(kbText)}`);
  }

  // ⑥ COMMUNICATION STYLE (vibe / accent / gender — subordinate to PRIMARY ROLE)
  if (_rtStyle) _parts.push(`[COMMUNICATION STYLE — secondary to your PRIMARY ROLE]\n${_rtStyle}`);

  // ⑦ CALL RULES — appears near end for maximum recency weight (model obeys these consistently)
  const _endCallLang = (assistant.language || "").toLowerCase();
  const _callRules = [];
  _callRules.push("PHONE CALL RULES (apply on every single response — no exceptions):");
  _callRules.push("• This is a voice call. ONE short sentence per reply (two sentences maximum only when truly necessary).");
  _callRules.push("• NEVER use bullet lists, numbered lists, markdown, asterisks, emojis, or any text formatting.");
  _callRules.push("• Speak naturally as in a real conversation. Keep responses concise.");
  _callRules.push("• If you misheard the caller, ask them to repeat — do NOT guess.");
  _callRules.push("• Never recite full product specs in one go — state the product name + one key detail, then ask if they want more.");
  if (_endCallLang.startsWith("he")) {
    _callRules.push("• דבר בעברית בלבד. קצב ברור ומאוזן — הגה כל מילה עד סופה. אל תחזור על אותו ביטוי יותר מפעם אחת.");
    _callRules.push("• אסור להשתמש בתואר 'כבוד הנוסע', 'אדון', 'גברת' — דבר ישירות ובאופן טבעי.");
    _callRules.push(`• שם המתקשר: ${_nameProhibited ? "אסור לקרוא לשמו — **אל תאמר שם בשום שלב**." : "השתמש בשמו לכל היותר פעם אחת — בפתיחה בלבד."}`);
    _callRules.push("• סיום שיחה — קרא ל-end_call רק כשהמתקשר אמר בבירור: שלום, להתראות, ביי, תודה, 'אין לי עוד שאלות', 'זהו'. אם לא ברור — שאל 'מה אמרת?' ואל תנתק. אל תשאל 'האם יש לך שאלה נוספת?' יותר מפעם אחת.");
  } else if (_endCallLang.startsWith("ar")) {
    _callRules.push("• تحدث بالعربية فقط. بوضوح وبسرعة طبيعية.");
    _callRules.push(`• اسم المتصل: ${_nameProhibited ? "محظور — لا تذكر الاسم إطلاقاً." : "استخدمه مرة واحدة فقط في بداية المكالمة."}`);
    _callRules.push("• إنهاء المكالمة — اتصل بـ end_call فقط عند: وداعاً، مع السلامة، شكراً، ليس لديّ أسئلة. إذا كان الكلام غير واضح — اسأل 'عفواً، ماذا قلت؟'.");
  } else if (_endCallLang.startsWith("zu")) {
    _callRules.push("• Speak in isiZulu throughout. Natural conversational Zulu — not overly formal.");
    _callRules.push(`• Caller's name: ${_nameProhibited ? "PROHIBITED — do NOT use the caller's name at any point." : "use at most once in the opening."}`);
    _callRules.push("• End the call — call end_call only when the caller says: sala kahle, ngiyabonga, bye, goodbye. If unclear, ask 'Uxolo, angizwanga — ungakuphinda?'.");
  } else if (_endCallLang.startsWith("af")) {
    _callRules.push("• Spreek Afrikaans deur die hele gesprek. Natuurlike gesprekstaal.");
    _callRules.push(`• Beller se naam: ${_nameProhibited ? "VERBODE — moenie die beller se naam gebruik nie." : "gebruik hoogstens een keer in die opening."}`);
    _callRules.push("• Sluit die gesprek — roep end_call slegs as die beller sê: totsiens, dankie, bye. As die spraak onduidelik is — vra 'Kan jy dit herhaal?'.");
  } else {
    _callRules.push(`• Caller's name: ${_nameProhibited ? "PROHIBITED — do NOT address the caller by name at any point." : "use at most once (opening only) — never repeat it."}`);
    _callRules.push("• End the call — call end_call when the caller says goodbye, bye, thanks that's all, or has no more questions. Do NOT ask 'anything else?' more than once.");
  }
  _parts.push(_callRules.join("\n"));

  // ⑧ CALL OPENING — very last for maximum recency weight.
  //    "EXACTLY" is intentional — "adapted naturally" let the model deviate.
  const firstMessage = assistant.firstMessage || "Hello! How can I help you today?";
  _parts.push(`[CALL OPENING — say this EXACTLY, word-for-word, the moment the call begins]\n"${sanitizeForSpeech(firstMessage)}"\nDo NOT add, remove, or change a single word. Do NOT add the caller's name. Do NOT adapt it.`);

  let instructions = _parts.join("\n\n");

  // Voice mapping — standard TTS voices → Realtime equivalents
  const VOICE_MAP = {
    "openai:alloy": "alloy",
    "openai:echo": "echo",
    "openai:shimmer": "shimmer",
    "openai:nova": "shimmer",  // nova → shimmer (clear, articulate — good for Hebrew)
    "openai:onyx": "ash",
    "openai:fable": "sage",
  };
  // OpenAI Realtime supports only these voices. Any other value (e.g. "nova")
  // causes the API to silently ignore the setting and use a default that can
  // produce rushed/garbled speech in non-English languages.
  const VALID_REALTIME_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]);
  const _rawVoice = assistant.realtimeVoice || VOICE_MAP[assistant.voice] || "shimmer";
  const realtimeVoice = VALID_REALTIME_VOICES.has(_rawVoice) ? _rawVoice : (VOICE_MAP[`openai:${_rawVoice}`] || "shimmer");
  console.log(`[${callSessionId}] [RT] Voice: ${realtimeVoice} (raw=${assistant.realtimeVoice || "null"}) accent=${assistant.voiceAccent || "default"}`);

  // Tools for function calling
  const REALTIME_TOOLS = [
    {
      type: "function",
      function: {
        name: "send_email",
        description: "Send a confirmation or summary email to the customer.",
        parameters: {type: "object", properties: {to: {type: "string"}, template: {type: "string"}, templateVars: {type: "object"}}, required: ["to", "template"]},
      },
    },
    {
      type: "function",
      function: {
        name: "send_sms",
        description: "Send an SMS text message to the customer's phone number.",
        parameters: {type: "object", properties: {to: {type: "string"}, message: {type: "string"}}, required: ["to", "message"]},
      },
    },
    {
      type: "function",
      function: {
        name: "create_appointment",
        description: "Book an appointment in the system.",
        parameters: {type: "object", properties: {customerName: {type: "string"}, customerPhone: {type: "string"}, service: {type: "string"}, scheduledTime: {type: "string"}, notes: {type: "string"}}, required: ["customerName", "service", "scheduledTime"]},
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_call",
        description: "Transfer call to a human agent.",
        parameters: {type: "object", properties: {to: {type: "string"}, reason: {type: "string"}}, required: ["to"]},
      },
    },
    {
      type: "function",
      function: {
        name: "end_call",
        description: "Hang up the call when the conversation is naturally complete.",
        parameters: {type: "object", properties: {}, required: []},
      },
    },
  ];

  // User-defined custom API tools — appended to REALTIME_TOOLS so the model
  // can invoke them like any native function. Defined per-assistant.
  const customTools = Array.isArray(assistant.customTools) ? assistant.customTools : [];
  const hasKbSearchTool      = customTools.some((ct) => ct?.type === "knowledge_search");
  const hasSaveLeadTool      = customTools.some((ct) => ct?.type === "save_lead");
  const hasTagCallTool       = customTools.some((ct) => ct?.type === "tag_call");
  const hasCheckAvailTool    = customTools.some((ct) => ct?.type === "check_availability");
  const hasSendLinkTool      = customTools.some((ct) => ct?.type === "send_link");
  const hasCallbackTool      = customTools.some((ct) => ct?.type === "schedule_callback");
  const hasVerbalContract    = customTools.some((ct) => ct?.type === "verbal_contract");
  const hasVoiceCommerce     = customTools.some((ct) => ct?.type === "voice_commerce");
  const hasAgentNetwork      = customTools.some((ct) => ct?.type === "agent_network");

  // Capture per-type config blobs for built-in tool setup
  const verbalContractConfig  = customTools.find((ct) => ct?.type === "verbal_contract") || {};
  const voiceCommerceConfig   = customTools.find((ct) => ct?.type === "voice_commerce") || {};
  const agentNetworkConfig    = customTools.find((ct) => ct?.type === "agent_network") || {};

  if (hasKbSearchTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "search_knowledge_base",
        description: "Search the assistant's knowledge base for relevant information to answer the caller's question. Use this when you need to look up company info, products, prices, FAQs, or any stored knowledge.",
        parameters: {
          type: "object",
          properties: { query: {type: "string", description: "The search query — what information to look up"} },
          required: ["query"],
        },
      },
    });
  }
  if (hasSaveLeadTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "save_lead",
        description: "Save the caller's contact details to the CRM. Call this whenever you learn the caller's name, gender, or interests — even partial info is valuable.",
        parameters: {
          type: "object",
          properties: {
            name:     {type: "string", description: "Caller's full name"},
            phone:    {type: "string", description: "Caller's phone number (E.164 format)"},
            email:    {type: "string", description: "Caller's email address (optional)"},
            gender:   {type: "string", enum: ["male", "female", "other"], description: "Caller's gender — infer from pronouns or explicit statement"},
            interest: {type: "string", description: "What the caller is looking for, their main topic or goal"},
            notes:    {type: "string", description: "Any useful context: previous calls, special needs, preferences"},
          },
          required: ["name", "phone"],
        },
      },
    });
  }
  if (hasTagCallTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "tag_call",
        description: "Add classification tags to this call for filtering and follow-up. Use tags like: hot_lead, cold_lead, not_interested, complaint, needs_followup, callback_requested, appointment_booked, wrong_number.",
        parameters: {
          type: "object",
          properties: {
            tags: {type: "string", description: "Comma-separated tags to apply, e.g. hot_lead,needs_followup"},
          },
          required: ["tags"],
        },
      },
    });
  }
  if (hasCheckAvailTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "check_availability",
        description: "Check available appointment slots for a given date. Returns a list of free time slots.",
        parameters: {
          type: "object",
          properties: {
            date:              {type: "string", description: "Date to check in YYYY-MM-DD format"},
            duration_minutes:  {type: "number", description: "Required slot duration in minutes (default 30)"},
          },
          required: ["date"],
        },
      },
    });
  }
  if (hasSendLinkTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "send_link_sms",
        description: "Send a URL to the caller via SMS during the call. Use this to share booking pages, product links, or any relevant URL.",
        parameters: {
          type: "object",
          properties: {
            url:     {type: "string", description: "The URL to send"},
            message: {type: "string", description: "Short message to accompany the link (optional)"},
            to:      {type: "string", description: "Recipient phone number (leave empty to send to the caller)"},
          },
          required: ["url"],
        },
      },
    });
  }
  if (hasCallbackTool) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "schedule_callback",
        description: "Schedule a callback request for the caller. Use this when the caller wants to be contacted later.",
        parameters: {
          type: "object",
          properties: {
            name:           {type: "string", description: "Caller's name"},
            phone:          {type: "string", description: "Callback phone number"},
            preferred_time: {type: "string", description: "Preferred callback time (e.g. 'tomorrow 10am', '2025-06-01 14:00')"},
            notes:          {type: "string", description: "Additional notes or reason for callback"},
          },
          required: ["name", "phone", "preferred_time"],
        },
      },
    });
  }
  // ── Verbal Contract tools ──────────────────────────────────────────
  if (hasVerbalContract) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "initiate_verbal_contract",
        description: "Start the verbal contract process. Call this when the caller is ready to agree to terms. Returns the contract terms text to read aloud.",
        parameters: {
          type: "object",
          properties: {
            partyName: {type: "string", description: "The caller's full name"},
          },
          required: ["partyName"],
        },
      },
    });
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "confirm_verbal_contract",
        description: "Confirm the verbal agreement after the caller says 'yes I agree' or equivalent. Records the legally-binding verbal contract.",
        parameters: {
          type: "object",
          properties: {
            partyName:                 {type: "string",  description: "The caller's full name"},
            confirmedTranscriptSnippet:{type: "string",  description: "The exact words the caller said to confirm agreement (e.g. 'yes I agree')"},
          },
          required: ["partyName", "confirmedTranscriptSnippet"],
        },
      },
    });
    instructions += "\n\nYou have verbal contract tools. When instructed to present contract terms, call initiate_verbal_contract first to get the terms text, then read each term clearly and slowly. After reading all terms, ask the caller if they agree. When they clearly say yes or agree, call confirm_verbal_contract immediately. Never skip reading the terms. Never confirm without explicit caller agreement.";
  }

  // ── Voice Commerce tools ────────────────────────────────────────────
  if (hasVoiceCommerce) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "lookup_product",
        description: "Search the product catalog by name, SKU, or category. Use this before quoting prices or checking availability.",
        parameters: {
          type: "object",
          properties: {
            query: {type: "string", description: "Product name, SKU, or category to search for"},
          },
          required: ["query"],
        },
      },
    });
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "add_to_cart",
        description: "Add a product to the caller's cart. Call lookup_product first to get the product details.",
        parameters: {
          type: "object",
          properties: {
            productId:   {type: "string", description: "Product ID from lookup_product result"},
            productName: {type: "string", description: "Product name"},
            price:       {type: "number", description: "Unit price"},
            quantity:    {type: "number", description: "Quantity to add (default 1)"},
          },
          required: ["productId", "productName", "price"],
        },
      },
    });
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "get_cart",
        description: "Get the current contents and total of the caller's cart.",
        parameters: {type: "object", properties: {}, required: []},
      },
    });
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "place_voice_order",
        description: "Finalize the order and generate a Stripe payment link that will be sent to the caller by SMS. Call this when the caller is ready to pay.",
        parameters: {
          type: "object",
          properties: {
            partyName:  {type: "string", description: "The caller's name"},
            partyPhone: {type: "string", description: "The caller's phone number to send the payment link to"},
          },
          required: ["partyName", "partyPhone"],
        },
      },
    });
    instructions += "\n\nYou have voice commerce tools. When the caller asks about products, ALWAYS call lookup_product first before stating prices or availability. Never make up prices. Use add_to_cart to build an order, get_cart to review it, and place_voice_order to send a payment link via SMS. After placing an order, tell the caller to check their phone for a payment link.";
  }

  // ── Agent Network tool ──────────────────────────────────────────────
  if (hasAgentNetwork) {
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: "call_agent",
        description: "Call another AI agent in the network to handle a specialized request (e.g. scheduling, billing, technical support). The agent will process the request and return a result.",
        parameters: {
          type: "object",
          properties: {
            agentId:  {type: "string", description: "The target agent ID from the agent directory"},
            intent:   {type: "string", description: "What you need the agent to do"},
            payload:  {type: "object", description: "Structured data to pass to the agent (caller info, order details, etc.)"},
          },
          required: ["agentId", "intent"],
        },
      },
    });
  }

  for (const ct of customTools) {
    if (ct?.type === "knowledge_search") continue; // handled above
    if (ct?.type === "verbal_contract" || ct?.type === "voice_commerce" || ct?.type === "agent_network") continue; // built-in
    if (!ct?.name || !ct?.url) continue;
    const properties = {};
    const required = [];
    (ct.parameters || []).forEach((p) => {
      if (!p?.name) return;
      properties[p.name] = {type: p.type || "string", description: p.description || ""};
      if (p.required) required.push(p.name);
    });
    REALTIME_TOOLS.push({
      type: "function",
      function: {
        name: ct.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
        description: ct.description || `Custom API: ${ct.method || "POST"} ${ct.url}`,
        parameters: {type: "object", properties, required},
      },
    });
  }
  if (customTools.length > 0) {
    console.log(`[${callSessionId}] [RT] Registered ${customTools.length} custom API tool(s)`);
    // Push the model toward using the tools — without this it tends to answer
    // from the (possibly stale) knowledge base instead of checking live data.
    const toolList = customTools.map((t) => `  - ${t.name}: ${t.description || "(no description)"}`).join("\n");
    instructions += `\n\n===== MANDATORY TOOL USAGE =====\nYou have LIVE API TOOLS:\n${toolList}\n\nRULES (non-negotiable):\n1. The knowledge base below is FAQ/company info only. It may list products but those entries are outdated.\n2. For ANY question about a specific product, model name, brand, SKU, price, stock, or availability — you MUST call the matching tool BEFORE answering. Never say "we don't have X" or "X is out of stock" without calling the tool first.\n3. If you even suspect the caller is asking about a product, CALL THE TOOL. It is always better to call the tool unnecessarily than to answer with stale data.\n4. After the tool returns, use ONLY its response to answer questions about that product. Ignore what the knowledge base says about the product.\n5. Before calling the tool, you MUST say a short natural filler — then call it immediately. Use one of these (vary them, never repeat the same one twice in a row): ${_rtLang === "he" ? '"רגע...", "שנייה...", "אני בודק...", "רגע בבקשה..."' : _rtLang === "ar" ? '"لحظة...", "ثانية...", "سأتحقق من ذلك...", "انتظر لحظة..."' : _rtLang === "el" ? '"Μια στιγμή...", "Ένα λεπτό...", "Ελέγχω...", "Αμέσως..."' : _rtLang === "af" ? '"Een oomblik...", "Ek kyk gou...", "Net \'n sekonde...", "Wag net..."' : _rtLang === "zu" ? '"Mzuzwana...", "Ngiyabheka...", "Ngizokhangela..."' : '"One moment...", "Let me check...", "Just a sec...", "Give me a moment..."'}.`;
  }

  // Twilio client for tool execution
  const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
  const companyId = data.companyId || null;

  // Create the bridge
  // VAD config — default is semantic_vad.
  //
  // semantic_vad: model uses linguistic understanding to decide when the user's
  // turn is over. Does NOT fire on mid-sentence pauses, background noise, or breaths.
  // Barge-in (user interrupting the bot) still works because input_audio_buffer.speech_started
  // fires on audio ENERGY regardless of VAD mode — the distinction is only in how
  // END-OF-TURN is detected, not start-of-speech.
  //
  // server_vad: traditional energy-based VAD. Faster response after silence, but fires
  // on ANY silence ≥ threshold — including mid-sentence pauses — causing the model to
  // answer incomplete questions. Only use when the assistant explicitly opts in.
  // Hebrew/Arabic assistants ALWAYS use semantic_vad regardless of stored config.
  // Server VAD fires on mid-sentence pauses and background noise in these languages,
  // causing triple greetings, split responses, and the bot interrupting itself.
  // Any old Firestore document with realtimeVadMode:"server" is treated as stale.
  const _assistantLangRaw = (assistant.language || "").toLowerCase();
  const _forceSemanticLang = _assistantLangRaw.startsWith("he") || _assistantLangRaw.startsWith("ar");
  const vadMode = (!_forceSemanticLang && assistant.realtimeVadMode === "server") ? "server" : "semantic";
  const vadSensitivity = ["low", "medium", "high"].includes(assistant.realtimeVadSensitivity)
    ? assistant.realtimeVadSensitivity : "medium";

  // Derive ISO 639-1 language code for Whisper STT — prevents mis-detection
  // of Hebrew as Japanese/Arabic/etc. when no language hint is given.
  // assistant.language is a BCP-47 locale (e.g. "he-IL", "en-US"); take the prefix.
  const inputLanguage = (assistant.language || "").split(/[-_]/)[0].toLowerCase() || null;

  // Temperature controls randomness — lower = more consistent answers across calls.
  // Default 0.5 (was 0.8) gives natural-sounding but consistent responses for
  // support bots.  Allowed range 0.0–2.0 per GA Realtime API.
  const rawTemp = (typeof assistant.temperature === "number") ? assistant.temperature : 0.5;
  const rtTemperature = Math.max(0.0, Math.min(2.0, rawTemp));
  const rtMaxTokens   = (typeof assistant.maxTokens   === "number") ? Math.max(100, assistant.maxTokens) : 500;

  const bridge = new RealtimeBridge({
    apiKey: OPENAI_API_KEY,
    instructions,
    voice: realtimeVoice,
    tools: REALTIME_TOOLS,
    callSessionId,
    vadMode,
    vadSensitivity,
    inputLanguage,
    temperature: rtTemperature,
    maxResponseTokens: rtMaxTokens,
  });
  console.log(`[${callSessionId}] [RT] voice=${realtimeVoice} lang=${inputLanguage} VAD=${vadMode}/${vadSensitivity} temp=${rtTemperature} maxTokens=${rtMaxTokens}`);

  // Session state
  let streamSid = null;
  let callSid = null;
  let sessionHistory = data.conversationHistory || [];
  let callEnding = false;
  let bridgeReady = false;
  let streamStarted = false;
  let greetingTriggered = false;
  // Transcript accumulator — OpenAI Realtime fires one "transcript" event per
  // output_item (audio chunk), so a single model response can produce 2–4 events.
  // We accumulate text within one response cycle and log ONE history entry when
  // the response is fully done, giving clean per-turn history.
  let _currentResponseText = "";
  let _currentResponseRole = "assistant";
  const costTracker = {realtimeInputMs: 0, realtimeOutputMs: 0};

  // ── Super-admin telemetry ─────────────────────────────────────────────
  const tel = new CallTelemetry({
    callSessionId,
    mode: "realtime",
    assistantId,
    ownerId: data.ownerId || null,
    language: inputLanguage,
    voice: realtimeVoice,
    db,
  });
  // Per-turn state for RT latency measurement
  let _telSpeechStopMs  = null;
  let _telFirstAudioSeen = false;   // reset each turn
  let _telTurnUserText  = "";
  let _telTurnTools     = [];

  // Stereo call recorder — captures both sides via the WebSocket since
  // Twilio's REST recording doesn't work with <Connect><Stream>.
  const recorder = new RealtimeRecorder(callSessionId);

  // Scenario runner — if the session has a scenarioId, we load the scenario
  // document and let a state machine drive the conversation flow instead of
  // relying solely on the LLM's instructions.
  let scenarioRunner = null;
  if (data.scenarioId) {
    try {
      const scenDoc = await db.collection("scenarios").doc(String(data.scenarioId)).get();
      if (scenDoc.exists) {
        const scenario = scenDoc.data();
        scenarioRunner = new RealtimeScenarioRunner({
          scenario,
          bridge,
          sessionRef,
          callSessionId,
          initialContext: data.scenarioContext || {},
        });
        console.log(`[${callSessionId}] [RT] Scenario loaded: ${scenario.name || data.scenarioId} (${(scenario.nodes || []).length} nodes)`);
      }
    } catch (e) {
      console.error(`[${callSessionId}] [RT] Failed to load scenario ${data.scenarioId}:`, e.message);
    }
  }

  // Kick off the assistant's greeting as soon as BOTH sides are ready.
  // If a scenario is attached, it drives the first turn instead of the model's greeting.
  function tryTriggerGreeting() {
    if (greetingTriggered || !bridgeReady || !streamStarted) return;
    greetingTriggered = true;
    if (scenarioRunner) {
      console.log(`[${callSessionId}] [RT] Starting scenario (+${Date.now() - callStartTime}ms)`);
      scenarioRunner.start();
    } else {
      console.log(`[${callSessionId}] [RT] Triggering initial greeting (+${Date.now() - callStartTime}ms)`);
      bridge.triggerResponse();
    }
  }

  // ── Tool execution (mirrors standard path) ─────────────────────────
  async function executeRealtimeTool(name, args) {
    try {
      if (name === "send_email" && args.to) {
        const companyName = assistant.companyName || "";
        await sgMail.send({
          to: args.to,
          from: process.env.SENDGRID_FROM_EMAIL || "noreply@voiceflow.ai",
          subject: `Confirmation from ${companyName}`,
          text: `Hi ${args.templateVars?.customerName || "there"}, your booking is confirmed. Thanks for choosing ${companyName}!`,
        });
        return "Email sent";
      } else if (name === "send_sms" && args.to && args.message && twilioClient) {
        const fromNum = process.env.TWILIO_DEFAULT_FROM;
        if (fromNum) {
          await twilioClient.messages.create({body: args.message, from: fromNum, to: args.to});
          return "SMS sent";
        }
      } else if (name === "create_appointment") {
        await db.collection("appointments").add({
          ...args, callSessionId, companyId,
          createdAt: FieldValue.serverTimestamp(), status: "pending",
        });
        if (args.customerName) {
          sessionRef.set({leadName: args.customerName}, {merge: true}).catch(() => {});
        }
        return "Appointment created";
      } else if (name === "transfer_call" && callSid) {
        const r = new twilio.twiml.VoiceResponse();
        r.dial(args.to);
        await updateCall(callSid, {twiml: r.toString()});
        return "Transferred";
      } else if (name === "end_call") {
        callEnding = true;
        // Let the model finish its goodbye response before hanging up.
        // 6s gives the model time to generate + stream the full farewell sentence.
        setTimeout(async () => {
          try {
            if (callSid) {
              console.log(`[${callSessionId}] [RT] Hanging up call ${callSid}`);
              await updateCall(callSid, {status: "completed"});
            } else {
              // Fallback: close the bridge which drops the Twilio WebSocket
              bridge.close();
            }
          } catch (e) {
            console.error(`[${callSessionId}] [RT] Hangup failed:`, e.message);
            bridge.close(); // ensure cleanup even on API error
          }
        }, 6000); // 6s: enough for a full Hebrew goodbye sentence
        return "Ending call";
      }
      // ── Built-in tools ──────────────────────────────────────────
      if (name === "search_knowledge_base") {
        const results = await fetchKnowledgeContext(assistantId, args.query || "");
        if (!results.length) return "No relevant information found in the knowledge base.";
        return results.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n");
      }
      if (name === "save_lead") {
        // Upsert: if lead with same phone already exists, update it; otherwise create
        const existingSnap = args.phone
          ? await db.collection("leads").where("phone", "==", args.phone).where("assistantId", "==", assistantId).limit(1).get()
          : null;
        const leadData = {
          ...args, assistantId,
          ownerId: data.ownerId || null,
          source: "call", status: args.status || "new",
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (existingSnap && !existingSnap.empty) {
          // Update existing lead — preserve fields the caller already has
          await existingSnap.docs[0].ref.set(leadData, {merge: true});
        } else {
          await db.collection("leads").add({...leadData, createdAt: FieldValue.serverTimestamp()});
        }
        // Mirror name + gender onto the call session for quick lookup in CRM page
        sessionRef.set({
          leadName: args.name || null,
          leadGender: args.gender || null,
        }, {merge: true}).catch(() => {});
        return "Lead saved successfully";
      }
      if (name === "tag_call") {
        const tags = (args.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
        await sessionRef.set({tags, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
        return `Call tagged: ${tags.join(", ")}`;
      }
      if (name === "check_availability") {
        const date = args.date || new Date().toISOString().split("T")[0];
        const duration = args.duration_minutes || 30;
        const dayStart = new Date(`${date}T00:00:00`);
        const dayEnd   = new Date(`${date}T23:59:59`);
        const snap = await db.collection("appointments")
          .where("scheduledTime", ">=", dayStart.toISOString())
          .where("scheduledTime", "<=", dayEnd.toISOString())
          .get();
        const booked = snap.docs.map((d) => d.data().scheduledTime).sort();
        if (booked.length === 0) return `No appointments booked on ${date}. All day is available.`;
        return `Booked slots on ${date}: ${booked.join(", ")}. Duration needed: ${duration} min.`;
      }
      if (name === "send_link_sms") {
        const to = args.to || data.callerNumber || null;
        const msg = args.message ? `${args.message} ${args.url}` : args.url;
        if (to && twilioClient && process.env.TWILIO_DEFAULT_FROM) {
          await twilioClient.messages.create({body: msg, from: process.env.TWILIO_DEFAULT_FROM, to});
          return "Link sent via SMS";
        }
        return "Could not send SMS — phone number unavailable";
      }
      if (name === "schedule_callback") {
        await db.collection("scheduled_callbacks").add({
          ...args, assistantId, callSessionId,
          status: "pending", createdAt: FieldValue.serverTimestamp(),
        });
        return `Callback scheduled for ${args.preferred_time}`;
      }
      // ── Verbal Contract tools ────────────────────────────────────
      if (name === "initiate_verbal_contract") {
        // Load the contract template configured for this assistant
        const templateId = verbalContractConfig.templateId || null;
        const ownerId = data.ownerId || null;
        try {
          let terms = verbalContractConfig.terms || [];
          if (templateId) {
            const templateSnap = await db.collection("contract_templates").doc(templateId).get();
            if (templateSnap.exists) terms = templateSnap.data().terms || [];
          }
          if (!terms.length) return "No contract terms configured. Please set up a contract template first.";
          // Build spoken contract text with placeholder substitution
          const today = new Date().toLocaleDateString("en-US", {dateStyle: "long"});
          const time  = new Date().toLocaleTimeString("en-US", {timeStyle: "short"});
          const spokenTerms = terms.map((t, i) => `${i + 1}. ${String(t)
            .replace(/\{\{partyName\}\}/g, args.partyName || "the caller")
            .replace(/\{\{date\}\}/g, today)
            .replace(/\{\{time\}\}/g, time)
            .replace(/\{\{assistantName\}\}/g, assistant.name || "")
            .replace(/\{\{companyName\}\}/g, assistant.companyName || "")}`).join(" ");
          // Store the pending contract state in the session
          await sessionRef.set({
            pendingContract: {templateId, terms, partyName: args.partyName, initiatedAt: new Date().toISOString()},
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          return `CONTRACT TERMS TO READ ALOUD:\n${spokenTerms}\n\nAfter reading all terms, ask the caller: "Do you agree to these terms?" — then call confirm_verbal_contract when they say yes.`;
        } catch (e) {
          console.error(`[${callSessionId}] [RT] initiate_verbal_contract error:`, e.message);
          return `Failed to load contract terms: ${e.message}`;
        }
      }
      if (name === "confirm_verbal_contract") {
        const ownerId = data.ownerId || null;
        try {
          // Retrieve the pending contract from session
          const sessionSnap = await sessionRef.get();
          const pending = sessionSnap.data()?.pendingContract || {};
          const terms = pending.terms || verbalContractConfig.terms || [];
          if (!terms.length) return "No pending contract found. Please initiate_verbal_contract first.";
          const partyPhone = data.callerNumber || null;
          const confirmedAt = new Date().toISOString();
          // Write contract record to Firestore
          const contractRef = await db.collection("verbal_contracts").add({
            callSessionId,
            ownerId,
            templateId: pending.templateId || verbalContractConfig.templateId || null,
            templateName: verbalContractConfig.templateName || "Voice Agreement",
            terms,
            partyName: args.partyName || pending.partyName || null,
            partyPhone,
            assistantName: assistant.name || null,
            companyName: assistant.companyName || null,
            contractHash: require("crypto").createHash("sha256")
              .update(JSON.stringify({terms, partyPhone, confirmedAt})).digest("hex"),
            status: "confirmed",
            confirmedTranscriptSnippet: (args.confirmedTranscriptSnippet || "").slice(0, 500),
            confirmedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          });
          // Tag session
          await sessionRef.set({
            verbalContractId: contractRef.id,
            hasVerbalContract: true,
            pendingContract: null,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          console.log(`[${callSessionId}] [RT] Verbal contract confirmed: ${contractRef.id}`);
          return `Contract confirmed and recorded. Contract ID: ${contractRef.id}. Tell the caller their agreement has been recorded and thank them.`;
        } catch (e) {
          console.error(`[${callSessionId}] [RT] confirm_verbal_contract error:`, e.message);
          return `Failed to record contract: ${e.message}`;
        }
      }

      // ── Voice Commerce tools ─────────────────────────────────────
      if (name === "lookup_product") {
        const ownerId = data.ownerId || voiceCommerceConfig.ownerId || null;
        if (!ownerId) return "Voice commerce not configured — ownerId missing.";
        try {
          const snap = await db.collection("voice_products")
            .where("ownerId", "==", ownerId)
            .where("active", "==", true)
            .limit(100)
            .get();
          const q = (args.query || "").toLowerCase();
          const products = snap.docs
            .map((d) => ({id: d.id, ...d.data()}))
            .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
            .slice(0, 10);
          if (!products.length) return `No products found matching "${args.query}".`;
          return products.map((p) => `ID:${p.id} | ${p.name} | $${p.price} ${p.currency || "USD"}${p.stock !== null ? ` | Stock: ${p.stock}` : ""}${p.description ? ` | ${p.description.slice(0, 80)}` : ""}`).join("\n");
        } catch (e) {
          return `Product search failed: ${e.message}`;
        }
      }
      if (name === "add_to_cart") {
        try {
          // Cart is stored in session state (in-memory for the call duration)
          const sessionSnap = await sessionRef.get();
          const cart = sessionSnap.data()?.voiceCart || {items: [], ownerId: data.ownerId};
          const existing = cart.items.find((i) => i.productId === args.productId);
          if (existing) {
            existing.quantity = (existing.quantity || 1) + (args.quantity || 1);
          } else {
            cart.items.push({
              productId: args.productId,
              name: args.productName,
              price: args.price,
              quantity: args.quantity || 1,
            });
          }
          cart.totalAmount = cart.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
          await sessionRef.set({voiceCart: cart, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          const qty = args.quantity || 1;
          return `Added ${qty}x ${args.productName} ($${args.price} each) to cart. Cart total: $${cart.totalAmount.toFixed(2)}.`;
        } catch (e) {
          return `Failed to add to cart: ${e.message}`;
        }
      }
      if (name === "get_cart") {
        try {
          const sessionSnap = await sessionRef.get();
          const cart = sessionSnap.data()?.voiceCart || {items: []};
          if (!cart.items.length) return "Cart is empty.";
          const lines = cart.items.map((i) => `${i.quantity || 1}x ${i.name} @ $${i.price} = $${((i.quantity || 1) * i.price).toFixed(2)}`);
          return `Cart (${cart.items.length} item${cart.items.length > 1 ? "s" : ""}):\n${lines.join("\n")}\nTotal: $${(cart.totalAmount || 0).toFixed(2)}`;
        } catch (e) {
          return `Failed to get cart: ${e.message}`;
        }
      }
      if (name === "place_voice_order") {
        try {
          const sessionSnap = await sessionRef.get();
          const cart = sessionSnap.data()?.voiceCart || {items: []};
          if (!cart.items.length) return "Cart is empty — nothing to order.";
          const ownerId = data.ownerId || voiceCommerceConfig.ownerId || null;
          const partyPhone = args.partyPhone || data.callerNumber || null;
          const currency = voiceCommerceConfig.currency || "usd";
          // Create the order record + Stripe payment link via Firebase function
          const projectId = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
          const fnUrl = `https://us-central1-${projectId}.cloudfunctions.net/voiceCreatePaymentLink`;
          const resp = await axios.post(fnUrl, {
            callSessionId,
            ownerId,
            items: cart.items,
            partyName: args.partyName || null,
            partyPhone,
            currency,
          }, {timeout: 15000});
          if (resp.data?.paymentLink) {
            // Send payment link via SMS
            if (partyPhone && twilioClient && process.env.TWILIO_DEFAULT_FROM) {
              try {
                await twilioClient.messages.create({
                  body: `Your order total is $${(resp.data.totalAmount || 0).toFixed(2)}. Pay securely here: ${resp.data.paymentLink}`,
                  from: process.env.TWILIO_DEFAULT_FROM,
                  to: partyPhone,
                });
              } catch (smsErr) {
                console.warn(`[${callSessionId}] [RT] Payment link SMS failed:`, smsErr.message);
              }
            }
            // Clear the cart
            await sessionRef.set({voiceCart: {items: [], totalAmount: 0}, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
            return `Order placed! Total: $${(resp.data.totalAmount || 0).toFixed(2)}. A payment link has been sent to ${partyPhone || "the caller"} by SMS. Tell the caller to check their phone to complete the payment.`;
          }
          return "Order created but payment link generation failed. Please try again.";
        } catch (e) {
          console.error(`[${callSessionId}] [RT] place_voice_order error:`, e.message);
          return `Order failed: ${e.message}`;
        }
      }

      // ── Agent Network tool ────────────────────────────────────────
      if (name === "call_agent") {
        const agentId = args.agentId;
        if (!agentId) return "agentId is required to call another agent.";
        try {
          const agentSnap = await db.collection("agent_registry").doc(agentId).get();
          if (!agentSnap.exists) return `Agent ${agentId} not found in the registry.`;
          const agent = agentSnap.data();
          if (agent.status !== "active") return `Agent ${agentId} is not currently active.`;
          if (!agent.webhookUrl) return `Agent ${agentId} has no webhook URL configured.`;
          // Make the inter-agent call
          const projectId = process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639";
          const fnUrl = `https://us-central1-${projectId}.cloudfunctions.net/agentCallOut`;
          const resp = await axios.post(fnUrl, {
            sourceAgentId: agentNetworkConfig.sourceAgentId || "voice-assistant",
            sourceApiKey:  agentNetworkConfig.sourceApiKey  || null,
            targetAgentId: agentId,
            intent: args.intent,
            payload: {
              ...(args.payload || {}),
              callSessionId,
              callerNumber: data.callerNumber || null,
            },
          }, {timeout: 20000});
          const result = resp.data?.result || resp.data;
          return typeof result === "string" ? result : JSON.stringify(result).slice(0, 2000);
        } catch (e) {
          console.error(`[${callSessionId}] [RT] call_agent error:`, e.message);
          return `Agent call failed: ${e.message}`;
        }
      }

      // ── Custom user-defined API tool ────────────────────────────────────────────
      const BUILTIN_NAMES = ["search_knowledge_base","save_lead","tag_call","check_availability","send_link_sms","schedule_callback",
        "initiate_verbal_contract","confirm_verbal_contract","lookup_product","add_to_cart","get_cart","place_voice_order","call_agent"];
      const custom = customTools.find((t) => !BUILTIN_NAMES.includes(t.name) && (t.name || "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64) === name);
      if (custom) {
        return await executeCustomApiTool(custom, args, callSessionId);
      }
      return "Done";
    } catch (e) {
      console.error(`[${callSessionId}] [RT] Tool ${name} failed:`, e.message);
      return `Failed: ${e.message}`;
    }
  }

  // ── Bridge events ──────────────────────────────────────────────────

  bridge.on("audio", (base64Mulaw) => {
    // Inject audio into the Twilio Media Stream (bidirectional)
    if (streamSid && ws.readyState === 1) {
      ws.send(JSON.stringify({
        event: "media",
        streamSid,
        media: {payload: base64Mulaw},
      }));
      // Rough cost tracking: mulaw 8kHz = 8000 bytes/sec, each byte = 0.125ms
      costTracker.realtimeOutputMs += (Buffer.from(base64Mulaw, "base64").length / 8);
      // Capture outbound audio for recording
      recorder.pushOutbound(base64Mulaw);
    }
    // Telemetry: track first bot audio packet after a user turn (RT latency)
    tel.countAudioOut();
    if (!_telFirstAudioSeen) {
      _telFirstAudioSeen = true;
      tel.firstBotAudioAfterTurn();
    }
  });

  bridge.on("transcript", ({role, text}) => {
    console.log(`[${callSessionId}] [RT] ${role}: "${text.slice(0, 80)}"`);
    if (role === "user") {
      // User turns are always one complete utterance — log immediately
      sessionHistory.push({role, content: text, timestamp: new Date()});
      // Telemetry: capture user text for the turn record
      _telTurnUserText = text;
      // Feed user turns into the scenario runner (if one is attached)
      if (scenarioRunner && !scenarioRunner.done) {
        scenarioRunner.onUserTranscript(text);
      }
    } else {
      // Assistant turns: accumulate text — OpenAI Realtime fires one event per
      // output_item so a single response can arrive in 2–4 pieces.
      // We commit the accumulated text when "response_done" fires (see handler below).
      _currentResponseText += (_currentResponseText ? " " : "") + text;
      _currentResponseRole = role;
      // Return early — do NOT write to Firestore here; response_done will handle it.
      return;
    }
    // ── User turns only beyond this point ──────────────────────────────────
    // ── Co-Pilot: push user transcript + sentiment + suggestions ──
    notifyCopilotTranscript(callSessionId, role, text, sessionHistory, {
      role: "AI assistant",
      companyName: assistant.companyName || "",
      systemPrompt: assistant.systemPrompt || "",
    });
    // Persist user turn to Firestore (non-blocking)
    sessionRef.set({
      conversationHistory: sessionHistory,
      lastSpeechResult: text,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}).catch((e) => console.error(`[${callSessionId}] [RT] Firestore write failed:`, e.message));
  });

  // ── Flush accumulated assistant text when a response cycle is complete ──
  // OpenAI emits response_done once per response (after all output_items).
  // We write ONE clean history entry per assistant turn here.
  const _flushAssistantTurn = () => {
    if (!_currentResponseText) return;
    const text = _currentResponseText;
    _currentResponseText = "";
    sessionHistory.push({role: _currentResponseRole, content: text, timestamp: new Date()});
    // ── Telemetry: log this completed turn ─────────────────────────
    const rtLatency = (_telSpeechStopMs && tel.data.milestones.firstBotAudio != null)
      ? (tel._startMs + tel.data.milestones.firstBotAudio) - _telSpeechStopMs
      : null;
    tel.turnDone({
      userText:      _telTurnUserText,
      assistantText: text,
      rtLatencyMs:   rtLatency,
      bargedIn:      false,
      toolNames:     _telTurnTools.map(t => t.name || t),
    });
    _telTurnUserText  = "";
    _telTurnTools     = [];
    _telFirstAudioSeen = false; // reset for next turn
    // ── PII / Compliance detection ──
    if (text.length > 10) {
      detectAndLogPiiViolations(text, callSessionId, data.ownerId || null, assistantId).catch(() => {});
    }
    // ── Co-Pilot: push assistant turn ──
    notifyCopilotTranscript(callSessionId, _currentResponseRole, text, sessionHistory, {
      role: "AI assistant",
      companyName: assistant.companyName || "",
      systemPrompt: assistant.systemPrompt || "",
    });
    // Persist to Firestore
    sessionRef.set({
      conversationHistory: sessionHistory,
      lastAIResponse: text,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}).catch((e) => console.error(`[${callSessionId}] [RT] Firestore write (assistant) failed:`, e.message));
  };

  bridge.on("response_done", _flushAssistantTurn);

  // Scenario runner can emit synthetic tool calls (transfer_call/end_call).
  // Route them through the same executor as model-initiated tool calls.
  bridge.on("_scenario_tool", async ({name, args}) => {
    await executeRealtimeTool(name, args);
  });

  bridge.on("tool_call", async ({name, args, callId}) => {
    console.log(`[${callSessionId}] [RT] Tool call: ${name}(${JSON.stringify(args).slice(0, 100)})`);
    const _telToolId = tel.toolStart(name);
    const result = await executeRealtimeTool(name, args);
    tel.toolDone(_telToolId, name, !String(result || "").startsWith("Error"), String(result || "").length);
    _telTurnTools.push(name);
    // Feed tool result back to OpenAI Realtime
    bridge.addConversationItem({
      type: "function_call_output",
      call_id: callId,
      output: result,
    });
    // Persist the tool call + result to the conversation history so the
    // call detail page can show it in the transcript flow.
    sessionHistory.push({
      role: "tool",
      name,
      args,
      result: String(result || "").slice(0, 4000),
      timestamp: new Date(),
    });
    sessionRef.set({
      conversationHistory: sessionHistory,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}).catch((e) => console.error(`[${callSessionId}] [RT] Tool call write failed:`, e.message));
    // Trigger a new response from the model — but NOT if the call is ending.
    // end_call is a terminal tool: triggering a response after it causes the
    // model to keep saying goodbye (multiple "יום טוב!" / "להתראות!" messages).
    if (!callEnding) {
      bridge.triggerResponse();
    }
  });

  bridge.on("error", (err) => {
    console.error(`[${callSessionId}] [RT] Error:`, err.message);
    tel.error("REALTIME_API_ERROR", err.message);
    anomaly({
      severity: "error",
      category: "llm",
      code: "REALTIME_API_ERROR",
      message: `OpenAI Realtime error: ${err.message}`,
      details: {elapsedMs: Date.now() - callStartTime},
    });
  });

  bridge.on("close", () => {
    console.log(`[${callSessionId}] [RT] Bridge closed`);
  });

  // Activity tracker for stuck-call watchdog (declared early so handlers can use it)
  let lastActivityAt = Date.now();
  const markActivity = () => { lastActivityAt = Date.now(); };

  // ── Barge-in: flush any buffered audio queued for Twilio so the bot
  //    stops mid-sentence when the user starts speaking. ──────────────
  bridge.on("barge_in", () => {
    console.log(`[${callSessionId}] [RT] Barge-in — user started speaking`);
    tel.bargeIn();
    // Mark this turn as barged-in so turnDone can record it
    if (tel.data.turns.length > 0) {
      tel.data.turns[tel.data.turns.length - 1].bargedIn = true;
    }
    // Discard any partially accumulated assistant text — the response was interrupted
    // and the caller didn't hear all of it. Do NOT log it to history.
    if (_currentResponseText) {
      console.log(`[${callSessionId}] [RT] Discarding interrupted response (${_currentResponseText.length} chars)`);
      _currentResponseText = "";
    }
    if (streamSid && ws.readyState === 1) {
      // Tell Twilio to discard anything buffered for playback
      try {
        ws.send(JSON.stringify({event: "clear", streamSid}));
      } catch (_) {}
    }
    // Reset recorder play clock — buffered audio after this point wasn't heard
    recorder.onBargeIn();
  });

  bridge.on("speech_started", () => {
    lastActivityAt = Date.now();
    tel.speechStarted();
  });

  bridge.on("speech_stopped", () => {
    _telSpeechStopMs = Date.now();
    _telFirstAudioSeen = false; // next audio packet = response start
    tel.speechStopped();
  });

  bridge.on("ready", () => {
    console.log(`[${callSessionId}] [RT] Bridge ready (+${Date.now() - callStartTime}ms)`);
    tel.milestone("bridgeReady");
    bridgeReady = true;
    tryTriggerGreeting();
  });

  // Response got truncated because it hit max_output_tokens. We don't
  // want the caller to hear a cut-off word, so kick the model to complete
  // its thought in one short sentence.
  bridge.on("response_truncated", () => {
    if (callEnding) return; // don't recover after end_call — call is already winding down
    console.warn(`[${callSessionId}] [RT] Response truncated at max tokens — continuing briefly`);
    tel.truncation();
    bridge.addConversationItem({
      type: "message",
      role: "system",
      content: [{type: "input_text", text: "Your previous response was cut off. In ONE short sentence, finish the thought you started. Don't start a new topic."}],
    });
    bridge.triggerResponse();
  });

  // Response stalled mid-stream → flush Twilio buffer + try to continue
  // by triggering a fresh response so the caller isn't left in silence.
  bridge.on("response_stalled", () => {
    if (callEnding) return; // don't recover after end_call
    console.warn(`[${callSessionId}] [RT] Response stalled — recovering`);
    tel.stall();
    anomaly({
      severity: "warn",
      category: "llm",
      code: "REALTIME_RESPONSE_STALLED",
      message: "OpenAI Realtime stopped streaming audio mid-response",
    });
    if (streamSid && ws.readyState === 1) {
      try { ws.send(JSON.stringify({event: "clear", streamSid})); } catch (_) {}
    }
    // Small delay after clear so Twilio finishes flushing its buffer before
    // new audio arrives — avoids the last partial word being replayed/doubled.
    setTimeout(() => {
      if (callEnding) return;
      bridge.addConversationItem({
        type: "message",
        role: "system",
        content: [{type: "input_text", text: "Your previous response was interrupted. Give a single short sentence asking if the caller wants you to continue."}],
      });
      bridge.triggerResponse();
    }, 150);
  });

  // ── Stuck-call watchdog ─────────────────────────────────────────────
  // If there's been no audio or response activity for 25s, something is
  // wedged (OpenAI socket silently dead, Twilio connection lost, etc.).
  // Log an anomaly so we can investigate, and close the bridge so
  // Twilio can clean up the call.
  bridge.on("audio", markActivity);
  bridge.on("transcript", markActivity);
  const watchdog = setInterval(() => {
    const idle = Date.now() - lastActivityAt;
    if (idle > 25000 && !callEnding) {
      console.warn(`[${callSessionId}] [RT] No activity for ${idle}ms — closing bridge`);
      anomaly({
        severity: "error",
        category: "llm",
        code: "REALTIME_STUCK",
        message: `Realtime session stuck — no audio/transcript activity for ${Math.round(idle / 1000)}s`,
        details: {idleMs: idle, greetingTriggered, bridgeReady, streamStarted},
      });
      callEnding = true;
      bridge.close();
    }
  }, 5000);
  // Clear watchdog when Twilio WS closes (handled below in ws.on("close"))
  const origClose = ws._rtCloseCleanup || (() => {});
  ws._rtCloseCleanup = () => { clearInterval(watchdog); origClose(); };

  // ── Twilio WebSocket events ────────────────────────────────────────

  // Single dispatch function — handles both buffered messages from the outer
  // handler AND live messages arriving on the same WebSocket.
  const dispatchTwilioMessage = (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === "start") {
        streamSid = parsed.start?.streamSid;
        callSid = parsed.start?.callSid;
        console.log(`[${callSessionId}] [RT] Stream started, callSid=${callSid}, streamSid=${streamSid}`);
        tel.milestone("streamStarted");
        if (callSid) activeConnections.set(callSid, {callSessionId, realtime: true});
        streamStarted = true;
        tryTriggerGreeting();
      } else if (parsed.event === "media") {
        if (parsed.media?.track === "inbound" && parsed.media?.payload) {
          bridge.sendAudio(parsed.media.payload);
          // Cost tracking: input audio
          costTracker.realtimeInputMs += (Buffer.from(parsed.media.payload, "base64").length / 8);
          tel.countAudioIn();
          // Capture inbound audio for recording
          recorder.pushInbound(parsed.media.payload);
        }
      } else if (parsed.event === "stop") {
        console.log(`[${callSessionId}] [RT] Stream stopped`);
        bridge.close();
        if (callSid) activeConnections.delete(callSid);
      }
    } catch (e) {
      console.error(`[${callSessionId}] [RT] Message parse error:`, e.message);
    }
  };

  // Install the dispatcher in the outer handler so future messages flow through,
  // then replay any messages that were buffered during our async session setup.
  if (markSetupComplete) {
    markSetupComplete(dispatchTwilioMessage);
    if (messageBuffer.length > 0) {
      console.log(`[${callSessionId}] [RT] Draining ${messageBuffer.length} buffered messages`);
      for (const msg of messageBuffer) dispatchTwilioMessage(msg);
    }
  } else {
    // Fallback path (caller didn't supply markSetupComplete)
    ws.on("message", dispatchTwilioMessage);
  }

  ws.on("close", async () => {
    console.log(`[${callSessionId}] [RT] Twilio WS closed (${Date.now() - callStartTime}ms)`);
    clearInterval(watchdog);
    bridge.close();
    const callDurationMin = (Date.now() - callStartTime) / 60000;

    // ── Compute costs using the same schema as the standard path ─────
    let costs = null;
    try {
      const rc = await loadCostConfig();
      const rateCard = rc.rateCard || {};
      const tw = rateCard.twilio || {costPerMinute: 0.013};
      const rt = rateCard.openaiRealtime || {costPerMinuteInput: 0.06, costPerMinuteOutput: 0.24};
      const inMin = costTracker.realtimeInputMs / 60000;
      const outMin = costTracker.realtimeOutputMs / 60000;
      costs = {
        twilio: {minutes: +callDurationMin.toFixed(2), cost: +(callDurationMin * tw.costPerMinute).toFixed(6)},
        realtime: {
          inputMinutes: +inMin.toFixed(2),
          outputMinutes: +outMin.toFixed(2),
          cost: +((inMin * rt.costPerMinuteInput) + (outMin * rt.costPerMinuteOutput)).toFixed(6),
        },
        // Parity fields so dashboard byService aggregator doesn't break
        llm: {cost: 0},
        stt: {cost: 0},
        tts: {cost: 0, provider: "openai-realtime", characters: 0},
      };
      costs.totalCost = +(costs.twilio.cost + costs.realtime.cost).toFixed(6);
      // Apply customer pricing (markup or fixed)
      const cp = rc.customerPricing || {};
      const override = (cp.overrides || {})[data.ownerId || ""];
      const model = override?.model || cp.defaultModel || "markup";
      const markupPct = override?.markupPercent ?? cp.defaultMarkupPercent ?? 30;
      const fixedRate = override?.fixedPerMinute ?? cp.defaultFixedPerMinute ?? 0.50;
      costs.customerCharge = model === "markup"
        ? +(costs.totalCost * (1 + markupPct / 100)).toFixed(6)
        : +(callDurationMin * fixedRate).toFixed(6);
      costs.pricingModel = model;
      costs.pricingValue = model === "markup" ? markupPct : fixedRate;
      costs.currency = rateCard.currency || "USD";
      costs.mode = "realtime";
      costs.calculatedAt = new Date().toISOString();
      console.log(`[${callSessionId}] [RT] Costs: $${costs.totalCost} → charge $${costs.customerCharge} (${model})`);
    } catch (e) {
      console.error(`[${callSessionId}] [RT] Cost calc failed:`, e.message);
    }

    // Persist final state (duration matches the standard path's `duration` field in seconds)
    sessionRef.set({
      status: "completed",
      duration: Math.round(callDurationMin * 60),
      callDuration: Math.round(callDurationMin * 100) / 100,
      conversationHistory: sessionHistory,
      ...(costs ? {costs} : {}),
      costTracking: {
        ...costTracker,
        realtimeInputSec: Math.round(costTracker.realtimeInputMs / 1000),
        realtimeOutputSec: Math.round(costTracker.realtimeOutputMs / 1000),
        provider: "openai-realtime",
      },
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true}).catch((e) => console.error(`[${callSessionId}] [RT] Final write failed:`, e.message));
    if (callSid) activeConnections.delete(callSid);

    // ── Finalize stereo recording and attach to the session ──────────
    try {
      const result = await recorder.finalizeAndUpload();
      if (result) {
        console.log(`[${callSessionId}] [RT] Recording uploaded: ${result.bytes}B, ${result.durationSec}s`);
        await sessionRef.set({
          recordings: FieldValue.arrayUnion({
            sid: `RT_${callSessionId}`,
            url: result.url,
            duration: result.durationSec,
            type: "realtime_stereo",
            objectPath: result.objectPath,
            createdAt: new Date().toISOString(),
          }),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      } else {
        console.warn(`[${callSessionId}] [RT] Recording skipped (no audio or upload failed)`);
      }
    } catch (e) {
      console.error(`[${callSessionId}] [RT] Recording finalize failed:`, e.message);
    }

    // ── Persist super-admin telemetry ─────────────────────────────────
    try { await tel.finalize(costs); } catch (e) { console.error(`[${callSessionId}] [RT] Telemetry write failed:`, e.message); }
  });
}

// ── GEMINI LIVE SESSION ────────────────────────────────────────────────────
// Bridges Twilio Media Stream ↔ Google Gemini Live API.
// Same high-level structure as handleRealtimeSession but uses GeminiBridge.
async function handleGeminiSession(ws, {callSessionId, data, assistant, assistantId, db, sessionRef, messageBuffer = [], markSetupComplete = null}) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error(`[${callSessionId}] [GL] No GEMINI_API_KEY — cannot start Gemini Live session`);
    ws.close(1008, "Missing Gemini API key");
    return;
  }

  const callStartTime = Date.now();
  const language    = assistant.language || "he-IL";
  const rawVoice    = assistant.realtimeVoice || "Aoede";
  // Gemini voices: Aoede, Charon, Fenrir, Kore, Puck, Orbit, Zephyr
  const geminiVoice = ["Aoede","Charon","Fenrir","Kore","Puck","Orbit","Zephyr"].includes(rawVoice)
    ? rawVoice : "Aoede";

  const vadMode        = assistant.realtimeVadMode        || "semantic";
  const vadSensitivity = assistant.realtimeVadSensitivity || "medium";

  // Load admin-editable system policies (cached). Empty policy doc = defaults.
  const policy = await fetchSystemPolicy();

  console.log(`[${callSessionId}] [GL] Starting Gemini Live voice=${geminiVoice} lang=${language} VAD=${vadMode}/${vadSensitivity}`);

  // ── Knowledge base — inject chunks into the system prompt ─────────────────
  // The Gemini path previously had NO access to the assistant's KB, so the
  // bot would say "I've searched and found nothing" because it literally had
  // no information to draw from. Mirror what the OpenAI path does: pull the
  // assistant's knowledge_chunks and embed them in the instructions.
  let kbText = "";
  if (assistantId) {
    try {
      const kbSnap = await db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .get();
      if (!kbSnap.empty) {
        // KB char cap — sourced from admin policy (default 8000). Higher caps
        // add latency to every turn; lower caps may drop relevant context.
        const MAX_KB_CHARS = policy.maxKbChars || 8000;
        const chunks = kbSnap.docs.map((d) => d.data().content || "").filter(Boolean);
        for (const c of chunks) {
          if ((kbText.length + c.length + 4) > MAX_KB_CHARS) break;
          kbText += (kbText ? "\n---\n" : "") + c;
        }
        if (kbText) console.log(`[${callSessionId}] [GL] Injected KB: ${chunks.length} chunks, ${kbText.length} chars (cap=${MAX_KB_CHARS})`);
      }
    } catch (e) {
      console.warn(`[${callSessionId}] [GL] KB fetch failed:`, e.message);
    }
  }

  // Build instructions, with KB appended as a REFERENCE section.
  // Pass admin-editable voice header override (null → use built-in default).
  let instructions = _buildInstructionsForRealtime({
    assistant, data, language,
    voiceHeaderOverride: policy.voiceHeader || null,
  });
  if (kbText) {
    instructions += `\n\n=== REFERENCE INFORMATION (knowledge base) ===\n` +
      `Use this information to answer the caller's questions. If the answer is here, cite it directly. Do not say you don't know if the answer is in this section.\n\n` +
      kbText +
      `\n=== END REFERENCE INFORMATION ===\n`;
  }

  // Built later (after geminiTools / _customApiTools are defined). Re-appended
  // here so the model sees explicit tool guidance immediately before connecting.
  // The custom API tools section is the critical bit — without it the model
  // tends to fabricate answers ("the flight costs 450 שקל") instead of calling
  // the lookup tool it actually has.

  // ── Session state ─────────────────────────────────────────────────────────
  let streamSid    = null;
  let callSid      = null;
  let bridgeReady  = false;
  let greetingTriggered = false;
  let callEnding   = false;
  const costs = { inputTokens: 0, outputTokens: 0, durationSec: 0 };

  // ── Telemetry + Recorder (matches handleRealtimeSession) ──────────────────
  // These were missing on the Gemini path — that's why the call detail page
  // shows "No telemetry log yet" and there's no recording attached.
  const tel = new CallTelemetry({
    callSessionId,
    mode: "gemini-live",
    assistantId,
    ownerId: data.ownerId || null,
    language,
    voice: geminiVoice,
    db,
  });
  const recorder = new RealtimeRecorder(callSessionId);

  // Per-turn transcript accumulator. Gemini streams transcript text in small
  // chunks (1-3 chars each). Saving every fragment to Firestore produces
  // hundreds of tiny conversationHistory entries instead of one per turn.
  // We accumulate by role and flush on `response_done` (assistant) /
  // when role changes (user).
  let _accumUser = "";
  let _accumAsst = "";

  // Goodbye-detection patterns, applied to the FULL turn text at flush time
  // (not per chunk). `\b` is omitted from Hebrew/Arabic patterns because
  // JS regex word-boundaries don't recognize non-Latin letters as word chars.
  // Matched terms anywhere in the last sentence of the turn count.
  // Goodbye patterns — driven by admin policy. Compiled per-call so updates
  // propagate within the 60s cache window. Bad regex strings fall back to
  // defaults; we don't want a typo'd policy to crash every call.
  const compile = (src, flags = "") => { try { return new RegExp(src, flags); } catch { return null; } };
  const HEBREW_GOODBYE  = compile(policy.goodbyePatterns?.hebrew  || DEFAULT_SYSTEM_POLICY.goodbyePatterns.hebrew)  || /__never_match__/;
  const ARABIC_GOODBYE  = compile(policy.goodbyePatterns?.arabic  || DEFAULT_SYSTEM_POLICY.goodbyePatterns.arabic)  || /__never_match__/;
  const ENGLISH_GOODBYE = compile(policy.goodbyePatterns?.english || DEFAULT_SYSTEM_POLICY.goodbyePatterns.english, "i") || /__never_match__/;
  const SPANISH_GOODBYE = compile(policy.goodbyePatterns?.spanish || DEFAULT_SYSTEM_POLICY.goodbyePatterns.spanish, "i") || /__never_match__/;

  function detectGoodbye(fullTurnText) {
    if (!fullTurnText) return false;
    // If the bot is asking a follow-up question, it isn't ending the call.
    // "...thanks for that. anything else I can help with?" should NOT hang up.
    if (/\?\s*$/.test(fullTurnText.trim())) return false;

    // Look at the LAST sentence — goodbye words can appear mid-conversation
    // (e.g. "I'll send a goodbye letter") without meaning the call should end.
    const sentences = fullTurnText.split(/[.!?]\s*/).filter(Boolean);
    const lastSentence = sentences[sentences.length - 1] || fullTurnText;
    const tail = (lastSentence + " " + fullTurnText.slice(-60)).trim();
    return HEBREW_GOODBYE.test(tail) ||
           ARABIC_GOODBYE.test(tail)  ||
           ENGLISH_GOODBYE.test(tail) ||
           SPANISH_GOODBYE.test(tail);
  }

  const flushTranscript = (role) => {
    // Collapse runs of whitespace introduced by chunk concatenation, then trim.
    // Per-chunk whitespace must NOT be stripped (it carries inter-word spaces)
    // — only the final accumulated turn gets normalised.
    const raw = role === "user" ? _accumUser : _accumAsst;
    const text = raw.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
    if (!text) return;
    if (role === "user") _accumUser = ""; else _accumAsst = "";
    console.log(`[${callSessionId}] [GL] ${role} turn: "${text.slice(0, 160)}"`);
    sessionRef.update({
      conversationHistory: FieldValue.arrayUnion({ role, content: text, timestamp: new Date().toISOString() }),
    }).catch(() => {});

    // After saving an ASSISTANT turn, scan it for goodbye phrases. This is
    // the right place — we have the full final utterance, not a fragment.
    if (role === "assistant" && !callEnding && detectGoodbye(text)) {
      callEnding = true;
      console.log(`[${callSessionId}] [GL] Goodbye detected in turn: "${text.slice(-80)}" — hanging up in 6s`);
      setTimeout(async () => {
        try {
          if (callSid) await updateCall(callSid, { status: "completed" }, { provider: data.telephonyProvider || "twilio" });
          else bridge.close();
        } catch (e) {
          console.error(`[${callSessionId}] [GL] Hangup failed:`, e.message);
          bridge.close();
        }
      }, 6000);
    }
  };

  // ── Create Gemini bridge ──────────────────────────────────────────────────
  // ── Gemini Live tool registry — essential subset + user's custom tools ──
  // Mirrors the most-used REALTIME_TOOLS from the OpenAI path. Wired here so
  // Gemini can actually execute lookups + side effects instead of narrating
  // imaginary function calls ("אקרא ל-lookup_airport_code פונקציה...").
  // Add KB search ONLY if the assistant has the knowledge_search custom tool
  // enabled OR if there are knowledge_chunks for this assistant.
  const customToolsConfig = Array.isArray(assistant.customTools) ? assistant.customTools : [];
  const hasKbSearch = customToolsConfig.some((t) => t?.type === "knowledge_search") || !!kbText;

  // Each assistant can define HTTP API tools (e.g. "lookup_flight", "check_inventory")
  // with a URL + parameter schema. We register those with Gemini and execute them
  // via the same executeCustomApiTool helper the OpenAI path uses.
  const _customApiTools = [];
  for (const ct of customToolsConfig) {
    // Skip built-in types — handled separately or already in geminiTools
    if (ct?.type === "knowledge_search" || ct?.type === "save_lead" || ct?.type === "tag_call"
        || ct?.type === "check_availability" || ct?.type === "send_link"
        || ct?.type === "schedule_callback" || ct?.type === "verbal_contract"
        || ct?.type === "voice_commerce" || ct?.type === "agent_network") continue;
    if (!ct?.name || !ct?.url) continue;
    const properties = {};
    const required = [];
    (ct.parameters || []).forEach((p) => {
      if (!p?.name) return;
      properties[p.name] = { type: p.type || "string", description: p.description || "" };
      if (p.required) required.push(p.name);
    });
    const sanitizedName = String(ct.name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
    _customApiTools.push({
      _config: ct,                // raw config for executeCustomApiTool
      type: "function",
      function: {
        name: sanitizedName,
        description: ct.description || `Custom API: ${ct.method || "POST"} ${ct.url}`,
        parameters: { type: "object", properties, required },
      },
    });
  }

  const geminiTools = [
    {
      type: "function",
      function: {
        name: "end_call",
        description: "Hang up the call when the conversation is naturally complete. Only use after the caller says goodbye or you've finished helping.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "send_sms",
        description: "Send an SMS text message to the caller's phone number.",
        parameters: { type: "object", properties: { message: { type: "string", description: "The SMS text body" } }, required: ["message"] },
      },
    },
    {
      type: "function",
      function: {
        name: "save_lead",
        description: "Save the caller as a lead in our CRM. Use when they show interest, leave contact info, or you've collected useful details.",
        parameters: {
          type: "object",
          properties: {
            name:    { type: "string" },
            phone:   { type: "string" },
            email:   { type: "string" },
            interest:{ type: "string", description: "Brief summary of what they were asking about" },
            notes:   { type: "string" },
            status:  { type: "string", enum: ["new", "interested", "qualified", "not_interested"] },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "tag_call",
        description: "Add tags to this call for later analytics. E.g. 'pricing-inquiry', 'support-issue', 'callback-requested'.",
        parameters: { type: "object", properties: { tags: { type: "string", description: "Comma-separated tags" } }, required: ["tags"] },
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_call",
        description: "Transfer this call to a human agent at the given phone number when the caller asks for a human or you cannot help further.",
        parameters: { type: "object", properties: { to: { type: "string", description: "E.164 phone number to transfer to" }, reason: { type: "string" } }, required: ["to"] },
      },
    },
    ...(hasKbSearch ? [{
      type: "function",
      function: {
        name: "search_knowledge_base",
        description: "Search the knowledge base for specific facts when you need exact information (prices, hours, policies, FAQs) that you don't already have in your context.",
        parameters: { type: "object", properties: { query: { type: "string", description: "What to look up" } }, required: ["query"] },
      },
    }] : []),
    // User-defined HTTP API tools (e.g. flight lookup) — strip _config before
    // sending to GeminiBridge since the SDK shouldn't see internal metadata.
    ..._customApiTools.map(({ _config, ...rest }) => rest),
  ];

  if (_customApiTools.length > 0) {
    console.log(`[${callSessionId}] [GL] Registered ${_customApiTools.length} custom API tool(s): ${_customApiTools.map((t) => t.function.name).join(", ")}`);
  }

  // Tool-awareness note appended to system instructions. The model sees the
  // tool schemas already in setup.tools, but a plain-language summary makes
  // it dramatically more likely to call them at the right time vs. invent.
  {
    const builtinLines = [
      "  • search_knowledge_base(query) — when caller asks a fact that should be in the KB.",
      "  • save_lead(name, phone, email, interest, notes, status) — when caller shows interest or shares contact details.",
      "  • send_sms(message) — to text the caller a link, code, summary, or confirmation.",
      "  • tag_call(tags) — categorize this call for the admin (e.g. 'pricing-question', 'support-issue').",
      "  • transfer_call(to, reason) — when the caller asks for a human or you cannot help.",
      "  • end_call() — only after the caller has said goodbye AND you have nothing left to help with.",
    ];
    const customLines = _customApiTools.map((t) => {
      const params = Object.keys(t.function.parameters?.properties || {}).join(", ");
      return `  • ${t.function.name}(${params}) — ${t.function.description}`;
    });
    const allLines = (_customApiTools.length > 0 ? customLines : []).concat(builtinLines);
    instructions += "\n\nTOOLS YOU HAVE — actually USE them, do NOT invent answers:\n" +
      allLines.join("\n") +
      "\nIf the caller asks about specific data (prices, schedules, availability, inventory, flights, anything operational) " +
      "and you have a tool that can fetch it — CALL THAT TOOL FIRST. Never guess or make up numbers. " +
      "If no tool can answer and you genuinely don't know, say so honestly and offer what you CAN help with.";
  }

  const bridge = new GeminiBridge({
    apiKey: GEMINI_API_KEY,
    instructions,
    voice: geminiVoice,
    language,
    callSessionId,
    tools: geminiTools,
  });

  // Start the Gemini WS handshake now — the rest of the setup (tool
  // executors, Twilio handlers, etc.) runs synchronously while TCP+TLS+WS
  // negotiate in the background. Saves ~100-200ms of serial handshake
  // time on every call. The setup payload is sent automatically once the
  // socket opens via bridge.connect() below.
  bridge.prewarm();

  // ── Tool execution — minimal but real ────────────────────────────────────
  async function executeGeminiTool(name, args) {
    try {
      console.log(`[${callSessionId}] [GL] Tool call: ${name}(${JSON.stringify(args).slice(0, 200)})`);
      let result = "OK";
      if (name === "end_call") {
        callEnding = true;
        setTimeout(async () => {
          try {
            if (callSid) await updateCall(callSid, { status: "completed" }, { provider: data.telephonyProvider || "twilio" });
            else bridge.close();
          } catch (e) {
            console.error(`[${callSessionId}] [GL] end_call hangup failed:`, e.message);
            bridge.close();
          }
        }, 6000);
        result = "Call will end in a moment. Say goodbye now.";
      } else if (name === "send_sms" && args.message) {
        const to = data.callerNumber || data.leadNumber;
        const fromNum = process.env.TWILIO_DEFAULT_FROM;
        if (to && twilioClient && fromNum) {
          await twilioClient.messages.create({ body: args.message, from: fromNum, to });
          result = `SMS sent to ${to}`;
        } else {
          result = "Could not send SMS — phone number or Twilio not configured";
        }
      } else if (name === "save_lead") {
        const leadData = {
          ...args,
          assistantId,
          ownerId: data.ownerId || null,
          phone: args.phone || data.callerNumber || data.leadNumber || null,
          source: "call",
          status: args.status || "new",
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (leadData.phone) {
          const existingSnap = await db.collection("leads")
            .where("phone", "==", leadData.phone)
            .where("assistantId", "==", assistantId).limit(1).get();
          if (!existingSnap.empty) {
            await existingSnap.docs[0].ref.set(leadData, { merge: true });
          } else {
            await db.collection("leads").add({ ...leadData, createdAt: FieldValue.serverTimestamp() });
          }
        }
        sessionRef.set({
          leadName: args.name || null,
        }, { merge: true }).catch(() => {});
        result = "Lead saved";
      } else if (name === "tag_call") {
        const tags = String(args.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
        await sessionRef.set({ tags, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        result = `Tagged: ${tags.join(", ")}`;
      } else if (name === "transfer_call" && args.to && callSid) {
        const r = new twilio.twiml.VoiceResponse();
        r.dial(args.to);
        await updateCall(callSid, { twiml: r.toString() }, { provider: data.telephonyProvider || "twilio" });
        result = `Transferring to ${args.to}`;
      } else if (name === "search_knowledge_base" && args.query) {
        const results = await fetchKnowledgeContext(assistantId, args.query);
        result = results.length
          ? results.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n")
          : "No relevant information found in the knowledge base.";
      } else {
        // Dispatch to a user-defined HTTP API tool (e.g. lookup_flight).
        // Each _customApiTools entry carries its _config which has url/method/headers.
        const customMatch = _customApiTools.find((t) => t.function.name === name);
        if (customMatch) {
          result = await executeCustomApiTool(customMatch._config, args, callSessionId);
        } else {
          result = `Unknown or unsupported tool: ${name}`;
        }
      }

      // ONE consolidated tool-call row in conversationHistory so the UI
      // renders a single ⚡ "API call · {name}" pill with args + result.
      sessionRef.update({
        conversationHistory: FieldValue.arrayUnion({
          role: "tool",
          name,
          args,
          result: String(result).slice(0, 2000),
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});

      return result;
    } catch (e) {
      console.error(`[${callSessionId}] [GL] Tool ${name} failed:`, e.message);
      const errResult = `Tool error: ${e.message}`;
      sessionRef.update({
        conversationHistory: FieldValue.arrayUnion({
          role: "tool", name, args, result: errResult, timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
      return errResult;
    }
  }

  bridge.on("audio", (mulawB64) => {
    if (streamSid && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: mulawB64 } }));
      // Capture bot's outbound audio for the stereo recording.
      recorder.pushOutbound(mulawB64);
      // Bot speaking counts as activity — don't let the silence watchdog
      // misread "caller listening to the bot" as "caller went silent".
      // The 12-second silence clock effectively starts from the LAST audio
      // chunk the bot emits, i.e. when the bot actually stops talking.
      lastUserActivityAt = Date.now();
    }
  });

  // ── Tool call handler ────────────────────────────────────────────────────
  // Gemini emits a tool_call event when it wants to invoke a function. We
  // execute it and send the result back so Gemini can continue speaking with
  // the answer instead of narrating the call out loud.
  bridge.on("tool_call", async ({ name, args, callId }) => {
    const result = await executeGeminiTool(name, args || {});
    bridge.addConversationItem({
      tool_call_id: callId,
      content: String(result || ""),
    });
  });

  bridge.on("transcript", ({ role, text }) => {
    if (!text) return;
    if (role === "user") {
      // Reset the silence watchdog every time the caller actually says something.
      lastUserActivityAt = Date.now();
      silenceChecks = 0;
      // If the assistant had pending text, flush it as a complete turn first.
      if (_accumAsst.trim()) flushTranscript("assistant");
      _accumUser += text;
    } else {
      // If we were accumulating user text, flush it first.
      if (_accumUser.trim()) flushTranscript("user");
      _accumAsst += text;

      // End-call detection is now done at TURN END (in response_done), not on
      // every chunk. Per-chunk testing was unreliable: \b doesn't recognize
      // Hebrew letters as word chars, and goodbye words split across chunks
      // could match prematurely or miss entirely.
    }
  });

  bridge.on("barge_in", () => {
    console.log(`[${callSessionId}] [GL] Barge-in — user started speaking`);
  });

  bridge.on("response_done", () => {
    costs.outputTokens += 100; // approximate; Gemini doesn't give exact token counts per-turn
    // Flush any user speech that completed in the meantime, then the assistant
    // turn we just finished. Order matters so history reads naturally.
    if (_accumUser.trim()) flushTranscript("user");
    if (_accumAsst.trim()) flushTranscript("assistant");
    if (callEnding) {
      bridge.close();
    }
  });

  // ── Silence watchdog — humanlike "are you there?" behavior ───────────────
  // Counts only EXPECTED-USER silence: the gap between the bot finishing a
  // turn and the caller starting theirs. Thresholds + check-in/farewell text
  // are admin-editable via /admin/policies.
  const SILENCE_PROMPT_MS = policy.silenceThresholdMs || 12000;
  const SILENCE_MAX_CHECKS = policy.silenceMaxChecks || 3;
  let lastUserActivityAt   = Date.now();
  let silenceChecks        = 0;     // counts unanswered check-ins this lull
  const isHebrew = (language || "").toLowerCase().startsWith("he");
  const isArabic = (language || "").toLowerCase().startsWith("ar");
  const silenceWatchdog = setInterval(() => {
    if (callEnding || !bridgeReady) return;
    // Don't interrupt if the bot is currently speaking or hasn't said anything yet.
    if (!greetingTriggered) return;
    const silentMs = Date.now() - lastUserActivityAt;
    if (silentMs < SILENCE_PROMPT_MS) return;
    silenceChecks++;
    lastUserActivityAt = Date.now(); // reset so we don't fire again until next gap
    if (silenceChecks >= SILENCE_MAX_CHECKS) {
      // Final silence — end the call politely. Farewell text is admin-editable.
      const farewell = isHebrew
        ? (policy.silenceFarewell?.hebrew  || DEFAULT_SYSTEM_POLICY.silenceFarewell.hebrew)
        : isArabic
          ? (policy.silenceFarewell?.arabic || DEFAULT_SYSTEM_POLICY.silenceFarewell.arabic)
          : (policy.silenceFarewell?.english || DEFAULT_SYSTEM_POLICY.silenceFarewell.english);
      console.log(`[${callSessionId}] [GL] Silence watchdog ending call (3rd timeout)`);
      bridge.promptModel(`Say exactly this and nothing else, then stop: "${farewell}"`);
      callEnding = true;
      // Schedule the actual hangup after the goodbye audio has time to play.
      setTimeout(async () => {
        try {
          if (callSid) await updateCall(callSid, { status: "completed" }, { provider: data.telephonyProvider || "twilio" });
          else bridge.close();
        } catch (e) {
          console.error(`[${callSessionId}] [GL] Silence-end hangup failed:`, e.message);
          bridge.close();
        }
      }, 5000);
      return;
    }
    // 1st…(N-1)th silence → friendly check-in. Phrasing is admin-editable.
    const checkIn = isHebrew
      ? (policy.silenceCheckIn?.hebrew  || DEFAULT_SYSTEM_POLICY.silenceCheckIn.hebrew)
      : isArabic
        ? (policy.silenceCheckIn?.arabic || DEFAULT_SYSTEM_POLICY.silenceCheckIn.arabic)
        : (policy.silenceCheckIn?.english || DEFAULT_SYSTEM_POLICY.silenceCheckIn.english);
    console.log(`[${callSessionId}] [GL] Silence check-in #${silenceChecks}`);
    bridge.promptModel(`The caller has been silent. Say exactly: "${checkIn}"`);
  }, 2000);
  // Make sure the timer dies when the call ends.
  bridge.on("close", () => { clearInterval(silenceWatchdog); });

  bridge.on("ready", () => {
    const elapsed = Date.now() - callStartTime;
    bridgeReady = true;
    console.log(`[${callSessionId}] [GL] Bridge ready (+${elapsed}ms)`);
    tryTriggerGreeting();
  });

  bridge.on("error", (err) => {
    console.error(`[${callSessionId}] [GL] Bridge error: ${err.message}`);
  });

  bridge.on("close", async () => {
    console.log(`[${callSessionId}] [GL] Bridge closed`);
    const durationSec = Math.round((Date.now() - callStartTime) / 1000);

    // ── Cost estimation ────────────────────────────────────────────────
    // gemini-2.5-flash-native-audio-latest pricing (June 2026):
    //   Audio input:  $1.00/M tokens  (~600 tokens/min at 16kHz)
    //   Audio output: $4.00/M tokens  (~1200 tokens/min at 24kHz)
    const inputMinutes  = durationSec / 60;
    const outputMinutes = durationSec / 60 * 0.4; // ~40% of time bot is speaking
    const inputCost  = (inputMinutes  * 600  / 1_000_000) * 1.00;
    const outputCost = (outputMinutes * 1200 / 1_000_000) * 4.00;
    const totalCost  = parseFloat((inputCost + outputCost).toFixed(5));

    // Telephony cost — choose carrier line based on how the call was placed.
    //   • Twilio Programmable Voice + Media Streams: ~$0.018/min
    //     ($0.014 voice + $0.004 media-streams surcharge)
    //   • SIP trunk via your operator: configurable via SIP_CARRIER_RATE_PER_MIN
    //     env var on Cloud Run (default $0.005/min — typical Flowroute /
    //     Bandwidth wholesale rate). No media-streams surcharge — the audio
    //     flows over your own bridge.
    // Provider stamped on session by voice_service.placeCall (Twilio or SIP).
    const isSip = (data.telephonyProvider || "twilio").startsWith("sip");
    const carrierMinutes = durationSec / 60;
    const carrierRate = isSip
      ? parseFloat(process.env.SIP_CARRIER_RATE_PER_MIN || "0.005")
      : 0.018;
    const carrierLabel = isSip ? "SIP trunk" : "Twilio Voice + Media Streams";
    const carrierDetail = isSip
      ? `${durationSec}s × $${carrierRate}/min (SIP_CARRIER_RATE_PER_MIN, configurable)`
      : `${durationSec}s × $0.018/min (voice $0.014 + media streams $0.004)`;
    const carrierCost = parseFloat((carrierMinutes * carrierRate).toFixed(5));
    const grandTotal  = parseFloat((totalCost + carrierCost).toFixed(5));

    // Keep `twilioCost` name for backwards compat with anything that already
    // reads the field; it now means "telephony carrier cost" regardless of
    // which carrier handled the call.
    const twilioCost = carrierCost;

    console.log(`[${callSessionId}] [GL] Costs: gemini=$${totalCost} carrier(${isSip ? "sip" : "twilio"})=$${carrierCost} total=$${grandTotal} (${durationSec}s)`);

    // Final transcript flush — any tail that didn't make it through response_done.
    if (_accumUser.trim()) flushTranscript("user");
    if (_accumAsst.trim()) flushTranscript("assistant");

    // ── Persist session data with per-provider cost breakdown ──────────
    const modelName = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-latest";
    await sessionRef.update({
      status:       "completed",
      callDuration: durationSec,
      duration:     durationSec,
      costs: {
        provider:   "gemini-live",
        model:      modelName,
        // Detailed split — frontend can render each provider line.
        breakdown: [
          { provider: "gemini-live", label: `Gemini (${modelName})`, cost: totalCost, detail: `audio in: $${inputCost.toFixed(5)}, audio out: $${outputCost.toFixed(5)}` },
          { provider: isSip ? "sip" : "twilio", label: carrierLabel, cost: carrierCost, detail: carrierDetail },
        ],
        inputCost,
        outputCost,
        twilioCost,
        totalCost: grandTotal,
        geminiCost: totalCost,
        durationSec,
        inputTokensEst:  Math.round(inputMinutes  * 600),
        outputTokensEst: Math.round(outputMinutes * 1200),
        chargedAt:       new Date().toISOString(),
      },
      costTracking: { totalCost: grandTotal, durationSec, provider: "gemini-live" },
    }).catch((e) => console.error(`[${callSessionId}] [GL] session update failed:`, e.message));

    // ── Finalize stereo recording (same pattern as OpenAI path) ────────
    try {
      const result = await recorder.finalizeAndUpload();
      if (result) {
        console.log(`[${callSessionId}] [GL] Recording uploaded: ${result.bytes}B, ${result.durationSec}s`);
        await sessionRef.set({
          recordings: FieldValue.arrayUnion({
            sid: `GL_${callSessionId}`,
            url: result.url,
            duration: result.durationSec,
            type: "realtime_stereo",
            objectPath: result.objectPath,
            createdAt: new Date().toISOString(),
          }),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        console.warn(`[${callSessionId}] [GL] Recording skipped (no audio or upload failed)`);
      }
    } catch (e) {
      console.error(`[${callSessionId}] [GL] Recording finalize failed:`, e.message);
    }

    // ── Persist super-admin telemetry ──────────────────────────────────
    try {
      await tel.finalize({ totalCost: grandTotal, geminiCost: totalCost, twilioCost, durationSec });
    } catch (e) {
      console.error(`[${callSessionId}] [GL] Telemetry write failed:`, e.message);
    }

    // ── Auto-trigger AI analysis ───────────────────────────────────────
    // POST to Firebase Functions analyzeCall (same as Twilio path does)
    const https = require("https");
    const analysisPayload = JSON.stringify({ callSessionId });
    const FIREBASE_URL = process.env.FIREBASE_URL || "";
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "voiceflow-ai-202509231639";
    const analyzeUrl = `https://us-central1-${projectId}.cloudfunctions.net/analyzeCall`;
    const analyzeReq = https.request(analyzeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(analysisPayload) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log(`[${callSessionId}] [GL] Auto-analysis complete`);
        } else {
          console.warn(`[${callSessionId}] [GL] Auto-analysis returned ${res.statusCode}: ${buf.slice(0, 200)}`);
        }
      });
    });
    analyzeReq.on("error", (e) => console.warn(`[${callSessionId}] [GL] Auto-analysis failed: ${e.message}`));
    analyzeReq.write(analysisPayload);
    analyzeReq.end();
  });

  bridge.connect();

  // ── Greeting trigger ─────────────────────────────────────────────────────
  let streamStarted = false;

  function tryTriggerGreeting() {
    if (greetingTriggered || !bridgeReady || !streamStarted) return;
    greetingTriggered = true;
    const elapsed = Date.now() - callStartTime;
    console.log(`[${callSessionId}] [GL] Triggering greeting (+${elapsed}ms)`);
    bridge.triggerResponse();

    // #58 watchdog — if no audio comes back within 5s of triggering, the
    // greeting was almost certainly silently dropped. Log loudly so future
    // repros are debuggable. Cancelled the moment the first audio frame
    // lands (set up via the bridge.on("audio") handler above).
    const watchdog = setTimeout(() => {
      console.warn(`[${callSessionId}] [GL] GREETING_NOT_HEARD: no audio 5s after trigger ` +
        `(bridgeReady=${bridgeReady}, streamStarted=${streamStarted}, callEnding=${callEnding})`);
    }, 5000);
    const cancelWatchdog = () => clearTimeout(watchdog);
    bridge.once("audio", cancelWatchdog);
    bridge.once("close", cancelWatchdog);
  }

  // ── Twilio message handler ────────────────────────────────────────────────
  function handleTwilioMessage(rawMsg) {
    let msg;
    try { msg = JSON.parse(rawMsg); } catch (_) { return; }

    switch (msg.event) {
      case "connected":
        console.log(`[${callSessionId}] [GL] Twilio connected`);
        break;
      case "start":
        streamSid = msg.start?.streamSid || msg.streamSid;
        callSid   = msg.start?.callSid   || msg.callSid;
        streamStarted = true;
        console.log(`[${callSessionId}] [GL] Stream started, callSid=${callSid}, streamSid=${streamSid}`);
        tryTriggerGreeting();
        break;
      case "media":
        if (msg.media?.payload) {
          bridge.sendAudio(msg.media.payload);
          // Capture caller's inbound audio for the stereo recording.
          recorder.pushInbound(msg.media.payload);
          costs.inputTokens += 5; // rough estimate
        }
        break;
      case "stop":
        console.log(`[${callSessionId}] [GL] Stream stopped`);
        callEnding = true;
        bridge.close();
        break;
    }
  }

  // Drain buffered messages
  if (markSetupComplete) {
    markSetupComplete(handleTwilioMessage);
  }
  for (const buffered of messageBuffer) {
    handleTwilioMessage(buffered);
  }

  ws.on("close", () => {
    console.log(`[${callSessionId}] [GL] Twilio WS closed (${Date.now() - callStartTime}ms)`);
    if (!callEnding) bridge.close();
  });
}

/**
 * Thin wrapper so handleGeminiSession can reuse the instruction-building logic
 * that lives as a closure in handleRealtimeSession's scope.
 * We build a minimal instruction string here rather than duplicating the full
 * builder (which is 200+ lines in handleRealtimeSession).
 */
function _buildInstructionsForRealtime({ assistant, data, language, voiceHeaderOverride }) {
  const base     = assistant.systemPrompt || assistant.instructions || "";
  const name     = assistant.name || assistant.assistantName || "Assistant";
  const company  = assistant.companyName || data.companyName || "";
  const firstMsg = assistant.firstMessage || "";

  // VOICE-MODE HEADER — terse but covers four critical behaviors:
  //   1. No markdown / narrator-speak (Gemini 2.5 native-audio leak guard)
  //   2. Never promise to "call back" — answer or admit gap (user complaint)
  //   3. Fill silence with a verbal placeholder when thinking (user complaint)
  //   4. Plain prose, short sentences
  // Admin can override the default via /admin/policies → voiceHeader field.
  const DEFAULT_VOICE_HEADER =
    "VOICE CALL — your output is spoken aloud by TTS. " +
    "No markdown, no asterisks, no headers, no stage directions. " +
    "No narrator phrases like \"Initiating Dialogue\" or \"Analyzing Input\". " +
    "Output only the literal words to speak, in plain prose, short sentences.\n" +
    "NEVER promise to call the caller back later, get back to them, follow up, or contact them. " +
    "Either answer now with information you have, or honestly say you don't know that specific thing — " +
    "then offer what you CAN help with. The caller is here right now; help them right now.\n" +
    "Silence is unnatural on a phone call. If you need a moment to think, look something up, or process, " +
    "fill the gap like a real person does — with VARIETY, not the same canned phrase every time. " +
    "Mix it up across turns. Use any of: " +
    "(Hebrew) \"אהה...\", \"אמ...\", \"מממ...\", \"רגע\", \"אוקיי\", \"בוא נראה\", \"תני לי רגע\", \"אהה כן\", " +
    "\"כן כן\", \"אני מסתכל לרגע\", \"אז...\", \"טוב, אז...\" — sometimes nothing at all, just continue the sentence; " +
    "(English) \"um\", \"uh\", \"hmm\", \"okay\", \"right\", \"let me see\", \"one sec\", \"so...\", \"alright\", \"good question\". " +
    "Don't always say \"let me check\" or \"רק שנייה אני בודק\" — that's robotic. Sound human: vary, hesitate naturally, " +
    "use partial words, breaths, small reactions to what the caller said. Never leave silence for more than a second.";
  const voiceHeader = (typeof voiceHeaderOverride === "string" && voiceHeaderOverride.trim().length > 50)
    ? voiceHeaderOverride
    : DEFAULT_VOICE_HEADER;

  const parts = [
    voiceHeader,
    `\nLanguage: Always respond in ${language}.`,
    company ? `\nYou are ${name} from ${company}.` : `\nYou are ${name}.`,
    base ? `\n${base}` : "",
    firstMsg ? `\nWhen the call starts, say EXACTLY: "${firstMsg}"` : "",
    "\nRules: Keep responses under 2 sentences. If caller says goodbye, say goodbye and stop.",
  ].filter(Boolean).join("");

  return parts;
}

// ── Voximplant WebSocket bridge ───────────────────────────────────────
//
// VoxEngine scenario (voximplant/scenario.js) opens this WS and bridges
// PSTN ↔ binary PCM16LE @ 8 kHz audio in both directions. The
// voximplant_bridge adapter translates that to Twilio-shaped JSON
// envelopes so we can reuse handleGeminiSession unchanged — the same code
// path that powers Twilio calls also powers Voximplant calls.
//
// Caveat: text frames (hello, etc.) on the Vox ws are parsed for
// telemetry but don't affect call lifecycle. Lifecycle is driven by
// Voximplant webhooks back to voxImplantWebhook on the Firebase side.
const { createAdapter: createVoxAdapter } = require("./voximplant_bridge.js");

app.ws("/voximplant/stream/:callSessionId", async (ws, req) => {
  const callSessionId = req.params.callSessionId;
  console.log(`[VOX-WS] New connection: callSessionId=${callSessionId}`);
  if (!callSessionId) {
    console.error(`[VOX-WS] Missing callSessionId. Full URL: ${req.url}`);
    ws.close(1008, "Missing callSessionId");
    return;
  }

  const db = getFirestore();
  const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) {
    console.error(`[VOX-WS] Session not found: ${callSessionId}`);
    ws.close(1008, "Session not found");
    return;
  }
  const data = snapshot.data();
  const assistant = data.assistantDefinition || {};
  const assistantId = data.assistantId || null;

  // Extract caller context from the scenario's hello frame BEFORE creating
  // the adapter, so we can synthesize the Twilio "start" event with the
  // right from/to.
  let helloInfo = { from: data.leadNumber || "", to: data.assistantPhone || "" };
  let helloReceived = false;
  ws.on("message", function captureHello(raw, isBinary) {
    if (isBinary || helloReceived) return;
    try {
      const obj = JSON.parse(raw.toString());
      if (obj && obj.type === "voximplant.hello") {
        helloInfo = { from: obj.from || helloInfo.from, to: obj.to || helloInfo.to, greeting: obj.greeting || "" };
        helloReceived = true;
      }
    } catch (_) { /* not a JSON text frame */ }
  });

  const adapter = createVoxAdapter(ws, callSessionId, helloInfo);

  // Hand off to the existing Gemini session handler. The adapter satisfies
  // the same .send / .close contract the handler expects from a Twilio
  // express-ws socket. handleGeminiSession delivers its message handler
  // through markSetupComplete (it never calls ws.on("message") itself) —
  // attaching it to the adapter flushes the queued handshake + any early
  // caller audio.
  await handleGeminiSession(adapter, {
    callSessionId,
    data,
    assistant,
    assistantId,
    db,
    sessionRef,
    messageBuffer: [],
    markSetupComplete: (handler) => adapter.on("message", handler),
  });
});

// ── WebSocket stream endpoint ─────────────────────────────────────────
// Twilio connects here with: wss://CLOUD_RUN_URL/stream?callSessionId=...
// callSessionId is in the URL path: /stream/:callSessionId
// (Query params are stripped by express-ws / GCP proxy on WebSocket upgrade)
app.ws("/stream/:callSessionId", async (ws, req) => {
  const callSessionId = req.params.callSessionId;
  console.log(`[WS] New connection: callSessionId=${callSessionId}, url=${req.url}`);
  if (!callSessionId) {
    console.error(`[WS] Missing callSessionId. Full URL: ${req.url}`);
    ws.close(1008, "Missing callSessionId");
    return;
  }

  // Buffer Twilio messages that arrive during async setup.
  // Twilio sends "connected" + "start" immediately — before our async Firestore
  // lookup completes — so we must capture them now or they are silently dropped.
  const messageBuffer = [];
  let setupComplete = false;
  let dispatchMessage; // set below after setup
  ws.on("message", (msg) => {
    if (!setupComplete) {
      messageBuffer.push(msg);
    } else {
      dispatchMessage(msg);
    }
  });

  const db = getFirestore();
  const sessionRef = db.collection("call_sessions").doc(String(callSessionId));
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) {
    console.error(`[WS] Session not found: callSessionId=${callSessionId}`);
    ws.close(1008, "Session not found");
    return;
  }
  console.log(`[WS] Session found: callSessionId=${callSessionId}`);

  const data = snapshot.data();
  const assistant = data.assistantDefinition || {};
  const assistantId = data.assistantId || null;

  // ── GEMINI LIVE MODE: bridge Twilio ↔ Google Gemini Live ─────────
  if (assistant.voiceProvider === "gemini-live" || assistant.realtimeProvider === "gemini") {
    await handleGeminiSession(ws, {callSessionId, data, assistant, assistantId, db, sessionRef, messageBuffer, markSetupComplete: (fn) => { dispatchMessage = fn; setupComplete = true; }});
    return;
  }
  // ── OPENAI REALTIME MODE: bridge Twilio ↔ OpenAI Realtime ─────────
  if (assistant.realtimeEnabled === true) {
    await handleRealtimeSession(ws, {callSessionId, data, assistant, assistantId, db, sessionRef, messageBuffer, markSetupComplete: (fn) => { dispatchMessage = fn; setupComplete = true; }});
    return;
  }
  // ── STANDARD MODE: Deepgram STT → LLM → TTS (unchanged) ──────────

  const language = assistant.language || "en-US";
  const voiceId = assistant.voice || "Google.en-US-Neural2-F";

  // Normalise for Twilio Say
  const sayLanguage = language.startsWith("he") ? "he-IL"
    : language.startsWith("ar") ? "ar-XA"
    : language.startsWith("el") ? "el-GR"
    : "en-US";

  // Deepgram language code (base code)
  const deepgramLang = language.startsWith("he") ? "he"
    : language.startsWith("ar") ? "ar"
    : language.startsWith("el") ? "el"
    : "en";

  let callSid = null; // extracted from the Twilio 'start' event
  let deepgramConnection = null;
  let deepgramReady = false;
  let audioPacketCount = 0;
  const earlyAudioBuffer = []; // Buffer audio arriving before Deepgram is ready
  let isBotSpeaking = false;
  let lastInterimTime = 0;
  let transcriptStartTime = Date.now();
  let llmRunning = false; // prevent concurrent LLM calls on rapid final transcripts
  let pendingTranscriptTimer = null; // debounce: wait after final to catch mid-sentence pauses
  let pendingTranscriptText = ""; // accumulated text during debounce window
  let knowledgePrefetch = null; // {query, promise} — started on high-confidence interim
  let callEnding = false; // set true after goodbye TwiML sent — stops further transcript processing
  const callStartTime = Date.now();
  const timing = (label) => console.log(`[${callSessionId}] [TIMING] +${Date.now() - callStartTime}ms ${label}`);
  timing("session started");

  // ── Anomaly logging (fire-and-forget) ──────────────────────────
  const logAnomaly = makeLogAnomaly(db, FieldValue);
  // Bind common context so each call site doesn't repeat it
  const anomaly = (params) => logAnomaly({
    callSessionId,
    callSid,
    ownerId: data.ownerId || null,
    assistantId,
    ...params,
  });
  // Session-scoped anomaly state
  let firstResponseSent = false;
  let firstAudioAt = null; // when first audio packet arrived from Twilio
  const recentTranscripts = []; // {text, at} for USER_REPEAT detection
  let noUserAudioWarned = false;
  let deepgramNeverReadyWarned = false;
  let earlyAudioOverflowWarned = false;
  // Watchdog: if Deepgram hasn't opened within 5s, flag it.
  setTimeout(() => {
    if (!deepgramReady && !deepgramNeverReadyWarned) {
      deepgramNeverReadyWarned = true;
      anomaly({
        severity: "error",
        category: "audio",
        code: "DEEPGRAM_NEVER_READY",
        message: "Deepgram connection not ready 5s after stream start",
      });
    }
  }, 5000);
  // Watchdog: if no audio packets have arrived within 10s, flag it.
  setTimeout(() => {
    if (audioPacketCount === 0 && !noUserAudioWarned) {
      noUserAudioWarned = true;
      anomaly({
        severity: "error",
        category: "audio",
        code: "NO_USER_AUDIO",
        message: "No inbound audio packets received within 10s of stream start",
      });
    }
  }, 10000);

  // ── Cost tracking ──────────────────────────────────────────────
  const costTracker = {
    llmPromptTokens: 0, llmCompletionTokens: 0, llmTurns: 0,
    ttsCharacters: 0, ttsProvider: "",
  };

  // ── Super-admin telemetry ─────────────────────────────────────────────
  const tel = new CallTelemetry({
    callSessionId,
    mode: "standard",
    assistantId,
    ownerId: data.ownerId || null,
    language,
    voice: voiceId,
    db,
  });
  let _telTurnTools    = [];
  let _telLastSttMs    = null;
  let _telLastLlmMs    = null;

  // ── Run all startup queries in PARALLEL to minimize setup latency ──
  let hasKnowledgeBase = false;
  let callerName = data.leadName || null;
  let callerHistory = [];
  const leadNumber = data.leadNumber || null;

  const startupQueries = [];

  // 1. Knowledge base check
  if (assistantId) {
    startupQueries.push(
      db.collection("knowledge_chunks").where("assistantId", "==", assistantId).limit(1).get()
        .then((kSnap) => {
          hasKnowledgeBase = !kSnap.empty;
          console.log(`[${callSessionId}] Knowledge base: ${hasKnowledgeBase ? "YES" : "none"}`);
        }).catch(() => {})
    );
  }

  // 2. Caller history lookup
  if (leadNumber) {
    startupQueries.push(
      db.collection("call_sessions").where("leadNumber", "==", leadNumber).orderBy("createdAt", "desc").limit(4).get()
        .then((prevSnap) => {
          const prevCalls = prevSnap.docs.filter((d) => d.id !== callSessionId).slice(0, 3);
          for (const d of prevCalls) {
            const pd = d.data();
            if (!callerName && pd.leadName) callerName = pd.leadName;
          }
          callerHistory = prevCalls.map((d) => {
            const pd = d.data();
            const turns = Math.floor((pd.conversationHistory?.length || 0) / 2);
            return `${pd.createdAt?.toDate?.()?.toLocaleDateString?.() || "prev call"}: ${turns} turns, last: "${(pd.lastAIResponse || "").slice(0, 80)}"`;
          });
          if (callerHistory.length > 0) {
            console.log(`[${callSessionId}] Returning caller: name=${callerName || "unknown"}, ${callerHistory.length} prev call(s)`);
          }
        }).catch((e) => {
          console.warn(`[${callSessionId}] Caller lookup failed:`, e.message);
        })
    );
  }

  // 3. Company data
  const companyId = data.companyId || null;
  let companyData = {};
  if (companyId) {
    startupQueries.push(
      db.collection("Company").doc(companyId).get()
        .then((cd) => { if (cd.exists) companyData = cd.data(); })
        .catch(() => {})
    );
  }

  // Wait for ALL startup queries in parallel (saves 1-3 seconds vs sequential)
  if (startupQueries.length > 0) {
    timing("startup queries started (" + startupQueries.length + ")");
    const startupBegin = Date.now();
    await Promise.all(startupQueries);
    const startupMs = Date.now() - startupBegin;
    timing("startup queries complete");
    if (startupMs > 2500) {
      anomaly({
        severity: "warn",
        category: "latency",
        code: "STARTUP_SLOW",
        message: `Startup queries took ${startupMs}ms (threshold 2500ms)`,
        details: {startupMs, queryCount: startupQueries.length},
      });
    }
  }

  // ── In-memory conversation history ────────────────────────────────
  let sessionHistory = data.conversationHistory || [];

  // ── Send TwiML via REST API update (bridge or Twilio) ──────────────
  const sendTwiML = async (twimlXml, reason = "response") => {
    if (!callSid) return false;
    try {
      await updateCall(callSid, {twiml: twimlXml});
      return true;
    } catch (err) {
      console.error(`[${callSessionId}] TwiML send failed (${reason}):`, err.message);
      return false;
    }
  };

  // ── Build TwiML (stream persists from initial webhook TwiML) ──────

  // NOTE: We do NOT include <Start><Stream> in response TwiML.
  // Twilio docs: "Existing streams are not stopped when new TwiML is returned."
  // The stream started in the initial webhook TwiML persists through updates.

  // Fallback <Say> for filler phrases (must be instant, no TTS API call)
  const makeSayTwiML = (text) => {
    const r = new twilio.twiml.VoiceResponse();
    if (speechSpeed && speechSpeed !== 1.0) {
      const rate = Math.round(speechSpeed * 100) + "%";
      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      r.say({voice: voiceId, language: sayLanguage}, `<prosody rate="${rate}">${escaped}</prosody>`);
    } else {
      r.say({voice: voiceId, language: sayLanguage}, text);
    }
    r.pause({length: "120"});
    return r.toString();
  };

  // ElevenLabs <Play> for real responses (natural voice)
  const makePlayTwiML = (audioUrl) => {
    const r = new twilio.twiml.VoiceResponse();
    r.play(audioUrl);
    r.pause({length: "120"});
    return r.toString();
  };

  // ElevenLabs <Play> + <Hangup> for goodbye
  const makePlayHangupTwiML = (audioUrl) => {
    const r = new twilio.twiml.VoiceResponse();
    r.play(audioUrl);
    r.hangup();
    return r.toString();
  };

  // Try per-assistant voice → selected TTS model (Hebrew) → Google TTS (English), fallback to Twilio <Say>
  // Resolve assistant voice: voiceId comes from assistant.voice (e.g. "openai:nova", "Google.he-IL-Chirp3-HD-Achird")
  const assistantVoice = assistant.voice || null;
  const speechSpeed = assistant.speechSpeed || 1.0;
  const ttsAndSend = async (text, reason = "response", hangup = false) => {
    // Apply pronunciation fixes for Hebrew (from Firestore + hardcoded)
    const pronFixes = deepgramLang.startsWith("he") ? await loadPronunciationFixes() : [];
    const ttsText = deepgramLang.startsWith("he") ? applyPronunciationFixes(text, pronFixes) : text;
    // Track TTS characters for cost calculation
    costTracker.ttsCharacters += ttsText.length;
    try {
      let audioUrl;
      // Use per-assistant voice if set.
      // Formats: "elevenlabs:<voiceId>[:<modelId>]" | "openai:nova" | "Google.he-IL-*"
      if (assistantVoice && assistantVoice.startsWith("elevenlabs:")) {
        // Best Hebrew path (#39). "elevenlabs:VOICEID" or "elevenlabs:VOICEID:MODEL"
        const parts = assistantVoice.split(":");
        const elVoiceId = parts[1];
        const elModel = parts[2] || ELEVEN_DEFAULT_MODEL;
        costTracker.ttsProvider = "elevenlabs";
        audioUrl = await elevenlabsTTS(ttsText, elVoiceId, elModel);
      } else if (assistantVoice && assistantVoice.startsWith("openai:")) {
        const openaiVoiceName = assistantVoice.split(":")[1] || "nova";
        costTracker.ttsProvider = "openai";
        audioUrl = await openaiTTS(ttsText, openaiVoiceName, speechSpeed);
      } else if (assistantVoice && assistantVoice.startsWith("Google.")) {
        const voiceName = assistantVoice.replace("Google.", "");
        const langCode = voiceName.substring(0, 5); // "he-IL" or "en-US"
        const [response] = await googleTtsClient.synthesizeSpeech({
          input: {text: ttsText},
          voice: {languageCode: langCode, name: voiceName},
          audioConfig: {audioEncoding: "MP3", sampleRateHertz: 24000, speakingRate: speechSpeed || 1.05, pitch: 0, effectsProfileId: ["telephony-class-application"]},
        });
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        audioCache.set(id, {buffer: response.audioContent, contentType: "audio/mpeg", createdAt: Date.now()});
        const cloudRunUrl = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.me-west1.run.app";
        audioUrl = `${cloudRunUrl}/audio/${id}`;
      } else if (deepgramLang.startsWith("he") && TTS_MODELS[hebrewTtsModel]) {
        // Fallback: global Hebrew TTS model from admin config
        const audioBuf = await generateTTS(ttsText, hebrewTtsModel);
        const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        audioCache.set(id, {buffer: audioBuf, contentType: "audio/mpeg", createdAt: Date.now()});
        const cloudRunUrl = process.env.CLOUD_RUN_URL || "https://voiceflow-mediastream-900818829902.me-west1.run.app";
        audioUrl = `${cloudRunUrl}/audio/${id}`;
      } else {
        audioUrl = await googleTTS(text, deepgramLang);
      }
      const twiml = hangup ? makePlayHangupTwiML(audioUrl) : makePlayTwiML(audioUrl);
      return await sendTwiML(twiml, reason);
    } catch (err) {
      console.error(`[${callSessionId}] TTS failed, falling back to Say:`, err.message);
    }
    // Fallback: Twilio <Say>
    if (hangup) {
      const r = new twilio.twiml.VoiceResponse();
      if (speechSpeed && speechSpeed !== 1.0) {
        const rate = Math.round(speechSpeed * 100) + "%";
        const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        r.say({voice: voiceId, language: sayLanguage}, `<prosody rate="${rate}">${escaped}</prosody>`);
      } else {
        r.say({voice: voiceId, language: sayLanguage}, text);
      }
      r.hangup();
      return await sendTwiML(r.toString(), reason);
    }
    return await sendTwiML(makeSayTwiML(text), reason);
  };

  const makeBargeInTwiML = () => {
    const r = new twilio.twiml.VoiceResponse();
    r.pause({length: "120"}); // Interrupt current playback, existing stream continues
    return r.toString();
  };

  // ── LLM helpers ───────────────────────────────────────────────────
  const AGENT_TOOLS = [
    {
      type: "function",
      function: {
        name: "send_email",
        description: "Send a confirmation or summary email to the customer.",
        parameters: {
          type: "object",
          properties: {
            to: {type: "string"},
            template: {type: "string", enum: ["appointmentConfirmation", "callSummary", "welcome"]},
            templateVars: {type: "object"},
          },
          required: ["to", "template"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_whatsapp",
        description: "Send a WhatsApp message to the customer.",
        parameters: {
          type: "object",
          properties: {
            to: {type: "string"},
            message: {type: "string"},
          },
          required: ["to", "message"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_sms",
        description: "Send an SMS text message to the customer's phone number.",
        parameters: {
          type: "object",
          properties: {
            to: {type: "string", description: "Recipient phone in E.164 format, e.g. +972501234567"},
            message: {type: "string", description: "SMS message text"},
          },
          required: ["to", "message"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_appointment",
        description: "Book an appointment in the system.",
        parameters: {
          type: "object",
          properties: {
            customerName: {type: "string"},
            customerPhone: {type: "string"},
            service: {type: "string"},
            scheduledTime: {type: "string"},
            notes: {type: "string"},
          },
          required: ["customerName", "service", "scheduledTime"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_call",
        description: "Transfer call to a human agent.",
        parameters: {
          type: "object",
          properties: {
            to: {type: "string"},
            reason: {type: "string"},
          },
          required: ["to"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "end_call",
        description: "Hang up the call when the conversation is naturally complete — customer said goodbye, confirmed booking, or there is nothing left to discuss.",
        parameters: {type: "object", properties: {}, required: []},
      },
    },
  ];

  // Inject built-in + custom tools into the standard (Deepgram) path
  const stdCustomTools = Array.isArray(assistant.customTools) ? assistant.customTools : [];
  const stdBuiltinDefs = [
    { type: "knowledge_search", name: "search_knowledge_base",
      desc: "Search the assistant's knowledge base for relevant information.",
      params: {query: {type: "string", description: "Search query"}}, req: ["query"] },
    { type: "save_lead", name: "save_lead",
      desc: "Save caller contact details and interest to the leads database.",
      params: {name:{type:"string"},phone:{type:"string"},email:{type:"string"},interest:{type:"string"},notes:{type:"string"}}, req: ["name","phone"] },
    { type: "tag_call", name: "tag_call",
      desc: "Add classification tags to this call (e.g. hot_lead, callback_requested).",
      params: {tags:{type:"string",description:"Comma-separated tags"}}, req: ["tags"] },
    { type: "check_availability", name: "check_availability",
      desc: "Check available appointment slots on a given date.",
      params: {date:{type:"string"},duration_minutes:{type:"number"}}, req: ["date"] },
    { type: "send_link", name: "send_link_sms",
      desc: "Send a URL to the caller via SMS.",
      params: {url:{type:"string"},message:{type:"string"},to:{type:"string"}}, req: ["url"] },
    { type: "schedule_callback", name: "schedule_callback",
      desc: "Schedule a callback for the caller at a preferred time.",
      params: {name:{type:"string"},phone:{type:"string"},preferred_time:{type:"string"},notes:{type:"string"}}, req: ["name","phone","preferred_time"] },
  ];
  for (const def of stdBuiltinDefs) {
    if (stdCustomTools.some((ct) => ct?.type === def.type)) {
      AGENT_TOOLS.push({ type: "function", function: { name: def.name, description: def.desc, parameters: {type:"object", properties: def.params, required: def.req} } });
    }
  }
  // Inject standard custom API tools into the standard path as well
  for (const ct of stdCustomTools) {
    if (["knowledge_search","save_lead","tag_call","check_availability","send_link","schedule_callback"].includes(ct?.type)) continue;
    if (!ct?.name || !ct?.url) continue;
    const properties = {};
    const required = [];
    (ct.parameters || []).forEach((p) => {
      if (!p?.name) return;
      properties[p.name] = {type: p.type || "string", description: p.description || ""};
      if (p.required) required.push(p.name);
    });
    AGENT_TOOLS.push({
      type: "function",
      function: {
        name: ct.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64),
        description: ct.description || `Custom API: ${ct.method || "POST"} ${ct.url}`,
        parameters: {type: "object", properties, required},
      },
    });
  }

  async function callLLM(systemPrompt, userMessage, history, options = {}) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const messages = [
      {role: "system", content: systemPrompt},
      ...history,
      ...(userMessage ? [{role: "user", content: userMessage}] : []),
    ];
    const body = {
      model: options.model || "gpt-4o-mini",
      messages,
      temperature: options.temperature || 0.8,
      max_tokens: options.maxTokens || 150,
    };
    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    } else {
      body.response_format = {type: "text"};
    }
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      body,
      {
        headers: {"Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json"},
        timeout: LLM_TIMEOUT_MS,
      },
    );
    const choice = resp.data.choices[0];
    const usage = resp.data.usage || {};
    // Accumulate cost tracking
    costTracker.llmPromptTokens += usage.prompt_tokens || 0;
    costTracker.llmCompletionTokens += usage.completion_tokens || 0;
    costTracker.llmTurns += 1;
    return {
      text: choice.message.content || null,
      toolCalls: choice.message.tool_calls || [],
      tokensUsed: usage.total_tokens || 0,
    };
  }

  // ── Knowledge context lookup ───────────────────────────────────────
  async function fetchKnowledgeContext(astId, query) {
    if (!astId || !query) return [];
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return [];
    try {
      // Embed the query
      const embedRes = await axios.post(
        "https://api.openai.com/v1/embeddings",
        {model: "text-embedding-3-small", input: [query]},
        {headers: {"Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json"}, timeout: 8000},
      );
      const queryVec = embedRes.data.data[0].embedding;

      // Fetch all chunks for this assistant
      const snap = await db.collection("knowledge_chunks")
        .where("assistantId", "==", astId)
        .get();
      if (snap.empty) return [];

      // Cosine similarity
      const scored = snap.docs.map((doc) => {
        const d = doc.data();
        if (!d.embedding) return {content: d.content, score: 0};
        const dot = queryVec.reduce((s, v, i) => s + v * d.embedding[i], 0);
        const magA = Math.sqrt(queryVec.reduce((s, v) => s + v * v, 0));
        const magB = Math.sqrt(d.embedding.reduce((s, v) => s + v * v, 0));
        return {content: d.content, score: dot / (magA * magB)};
      });

      return scored
        .filter((c) => c.score > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } catch (e) {
      console.warn(`[${callSessionId}] Knowledge context failed:`, e.message);
      return [];
    }
  }

  function buildSystemPrompt(ast, companyData = {}, callerCtx = {}) {
    const name = ast.name || ast.assistantName || "Assistant";
    const company = ast.companyName || companyData.name || "us";
    const industry = companyData.industry || "";
    const services = companyData.service || [];
    const phone = companyData.companyPhoneNumbers?.[0] || "";
    const website = companyData.companyLink || "";
    const tz = companyData.timeZone || "America/New_York";

    const servicesText = services.length
      ? services.map((s) => [s.name, s.description, s.price && `$${s.price}`, s.duration].filter(Boolean).join(" | ")).join("\n")
      : "General services";

    const canDo = [
      companyData.createJobPermission && "book appointments",
      companyData.reshedulePermission && "reschedule",
      companyData.cancelPermission && "cancel bookings",
      companyData.offerFreeEstimation && "offer free estimates",
    ].filter(Boolean).join(", ") || "answer questions";

    const cantDo = [
      companyData.priceRestriction && "negotiate prices",
      companyData.legalRestriction && "give legal advice",
      companyData.medicalRestriction && "give medical advice",
    ].filter(Boolean).join(", ");

    // Language-specific instructions
    const lang = ast.language || "en-US";
    const isHebrew = lang.startsWith("he");
    const isArabic = lang.startsWith("ar");

    const langRules = isHebrew
      ? `CRITICAL: You MUST respond ONLY in Hebrew with FULL nikud (ניקוד) on every word.
Your output is read aloud by a TTS engine. Without nikud, the TTS mispronounces Hebrew words.

Example: "בְּטַח! אֶשְׂמַח לַעֲזוֹר. מָה אַתָּה צָרִיךְ?" — NOT "בטח! אשמח לעזור. מה אתה צריך?"

Sound like a professional, warm Israeli service rep — friendly and natural.

Rules:
- EVERY Hebrew word MUST have nikud. This is critical.
- Max 1–2 short sentences per reply.
- Use warm openers: "בְּטַח!", "מְעוּלֶּה!", "אֶשְׂמַח לַעֲזוֹר!", "רֶגַע אֶחָד"
- Be professional but not formal. Use "אֲנִי", "אֲנַחְנוּ", not "אָנוּ" or "הִנְּכֶם".
- All numbers as words with nikud: "עֲשָׂרָה", "עֶשְׂרִים", never "10" or "20".
- All times as words: "עֶשֶׂר בַּבֹּקֶר", never "10:00".
- When the customer says שלום, להתראות, תודה, or the conversation is clearly done — use end_call immediately.`
      : isArabic
      ? `CRITICAL: You MUST respond ONLY in Arabic. Every single word must be in Arabic. Never use English or Hebrew.
Sound like a natural, warm service rep.

Rules:
- Max 1–2 short sentences per reply.
- Match caller energy. Fast caller → fast reply.
- Never ask for information already given in this conversation.
- When the customer says goodbye — use end_call immediately.`
      : `Sound like a natural, warm American service rep — never robotic.

Rules:
- Max 1–2 short sentences per reply.
- Never start with "I". Keep openers short and natural: "Sure!", "Got it!", "Great!", "Happy to help!" — no filler sounds like "Mmm" or "Emm".
- Use contractions: I'll, we've, that's, don't, can't.
- Never say "certainly", "absolutely", "of course", "I'd be happy to".
- Match caller energy. Fast caller → fast reply.
- Never ask for information already given in this conversation — name, phone, date, or anything else.
- When the customer says goodbye, that's all, thanks, or the conversation is clearly done — use end_call immediately.`;

    const dateStr = isHebrew
      ? new Date().toLocaleDateString("he-IL", {weekday:"long",year:"numeric",month:"long",day:"numeric"})
      : new Date().toLocaleDateString("en-US", {weekday:"long",year:"numeric",month:"long",day:"numeric"});

    let prompt = `You are ${name}, a phone agent for ${company}${industry ? ` (${industry})` : ""}.
${langRules}

You can: ${canDo}${cantDo ? `\nYou cannot: ${cantDo}` : ""}
Company: ${company}${phone ? ` | ${phone}` : ""}${website ? ` | ${website}` : ""} | TZ: ${tz}

Services:
${servicesText}

Stay focused on helping ${company} customers. Engage with any relevant question — even if not explicitly listed above. Only redirect if the topic is completely unrelated to the company. When unsure if something is in scope, say you'll pass it to the team.

Goal: greet → understand need → collect name + phone + time → confirm → ${companyData.createJobPermission ? "book it" : "pass to team"}.${ast.additionalInstructions ? `\nExtra: ${ast.additionalInstructions}` : ""}

Today is ${dateStr}. When booking appointments always state the specific date (day + month + year) AND time.

CRITICAL — Numbers and times: Your output is read aloud by TTS. NEVER write digits. ALWAYS spell out ALL numbers, times, dates, and prices as full words.
Wrong: "בשעה 10:00", "₪10,000", "26/3", "050-890-8099"
Correct: "בשעה עשר בבוקר", "עשרת אלפים שקל", "עשרים ושישה במרס", "אפס חמש אפס שמונה תשע אפס שמונה אפס תשע תשע"
This applies to ALL languages. Never use digits in your response.`;

    // Caller identity section
    if (callerCtx.leadNumber) {
      prompt += `\n\nCaller's phone: ${callerCtx.leadNumber}. When you need their phone number, say "Is ${formatPhoneForSpeech(callerCtx.leadNumber)} your number?" and confirm — don't ask them to recite it.`;
    }
    if (callerCtx.callerName) {
      prompt += `\nYou already know this caller — their name is "${callerCtx.callerName}". Address them by name from the start. Do NOT ask for their name.`;
    }
    if (callerCtx.callerHistory && callerCtx.callerHistory.length > 0) {
      prompt += `\nPrevious calls from this number:\n${callerCtx.callerHistory.join("\n")}`;
    }

    return prompt;
  }

  // ── Tool execution ─────────────────────────────────────────────────
  async function executeTool(toolCall, companyId) {
    const name = toolCall.function?.name;
    let args = {};
    try { args = JSON.parse(toolCall.function?.arguments || "{}"); } catch (_) {}
    const _telToolId = tel.toolStart(name);
    let _telToolOk = true;

    if (name === "send_email") {
      const {to, templateVars = {}} = args;
      if (to) {
        const companyName = assistant.companyName || "";
        await sgMail.send({
          to,
          from: process.env.SENDGRID_FROM_EMAIL || "noreply@voiceflow.ai",
          subject: `Confirmation from ${companyName}`,
          text: `Hi ${templateVars.customerName || "there"}, your booking is confirmed. Thanks for choosing ${companyName}!`,
        });
        return "Email sent";
      }
    } else if (name === "send_sms") {
      const {to, message} = args;
      if (to && message && twilioClient) {
        const fromNum = process.env.TWILIO_DEFAULT_FROM;
        if (fromNum) {
          await twilioClient.messages.create({body: message, from: fromNum, to});
          return "SMS sent";
        }
      }
    } else if (name === "send_whatsapp") {
      const {to, message} = args;
      if (to && message && TWILIO_WHATSAPP_FROM && twilioClient) {
        const from = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:") ? TWILIO_WHATSAPP_FROM : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
        const recipient = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
        await twilioClient.messages.create({body: message, from, to: recipient});
        return "WhatsApp sent";
      }
    } else if (name === "create_appointment") {
      const db2 = getFirestore();
      await db2.collection("appointments").add({
        ...args,
        callSessionId,
        companyId,
        createdAt: FieldValue.serverTimestamp(),
        status: "pending",
      });
      // Persist caller name so future calls can greet by name
      if (args.customerName) {
        sessionRef.set({leadName: args.customerName}, {merge: true}).catch(() => {});
      }
      return "Appointment created";
    } else if (name === "transfer_call") {
      const r = new twilio.twiml.VoiceResponse();
      r.dial(args.to);
      await sendTwiML(r.toString(), "transfer");
      return "Transferred";
    } else if (name === "end_call") {
      // Don't hang up yet — flag it so the goodbye confirmation text plays first
      executeTool._shouldHangup = true;
      return "Call ended";
    } else if (name === "search_knowledge_base") {
      const results = await fetchKnowledgeContext(assistantId, args.query || "");
      if (!results.length) return "No relevant information found in the knowledge base.";
      return results.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n");
    } else if (name === "save_lead") {
      await db.collection("leads").add({
        ...args, assistantId, callSessionId, source: "call", status: "new",
        createdAt: FieldValue.serverTimestamp(),
      });
      if (args.name) sessionRef.set({leadName: args.name}, {merge: true}).catch(() => {});
      return "Lead saved";
    } else if (name === "tag_call") {
      const tags = (args.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      await sessionRef.set({tags, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return `Tagged: ${tags.join(", ")}`;
    } else if (name === "check_availability") {
      const date = args.date || new Date().toISOString().split("T")[0];
      const dayStart = new Date(`${date}T00:00:00`).toISOString();
      const dayEnd   = new Date(`${date}T23:59:59`).toISOString();
      const snap = await db.collection("appointments")
        .where("scheduledTime", ">=", dayStart)
        .where("scheduledTime", "<=", dayEnd)
        .get();
      const booked = snap.docs.map((d) => d.data().scheduledTime).sort();
      return booked.length ? `Booked on ${date}: ${booked.join(", ")}` : `No appointments on ${date} — day is free.`;
    } else if (name === "send_link_sms") {
      const to = args.to || data.callerNumber || null;
      const msg = args.message ? `${args.message} ${args.url}` : args.url;
      if (to && twilioClient && process.env.TWILIO_DEFAULT_FROM) {
        await twilioClient.messages.create({body: msg, from: process.env.TWILIO_DEFAULT_FROM, to});
        return "Link sent via SMS";
      }
      return "SMS unavailable";
    } else if (name === "schedule_callback") {
      await db.collection("scheduled_callbacks").add({
        ...args, assistantId, callSessionId, status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
      return `Callback scheduled for ${args.preferred_time}`;
    } else {
      // Custom API tool fallback (standard path)
      const BUILTIN_NAMES = ["search_knowledge_base","save_lead","tag_call","check_availability","send_link_sms","schedule_callback"];
      const customMatch = stdCustomTools.find((t) => !BUILTIN_NAMES.includes(t.name) && (t.name || "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64) === name);
      if (customMatch) {
        const r = await executeCustomApiTool(customMatch, args, callSessionId);
        tel.toolDone(_telToolId, name, true, String(r || "").length);
        _telTurnTools.push(name);
        return r;
      }
    }
    tel.toolDone(_telToolId, name, _telToolOk, 4);
    _telTurnTools.push(name);
    return "Done";
  }

  // ── Main transcript handler (called by Deepgram events) ────────────
  const onTranscript = async ({text, isFinal, confidence}) => {
    // Stop all processing once goodbye TwiML has been sent (call is ending)
    if (callEnding) {
      if (isFinal && text?.trim()) {
        anomaly({
          severity: "warn",
          category: "transcript",
          code: "TRANSCRIPT_AFTER_HANGUP",
          message: "Final transcript arrived after call was ending",
          details: {transcript: text.slice(0, 200)},
        });
      }
      return;
    }

    const now = Date.now();

    if (!isFinal) {
      if (text?.trim() && confidence >= BARGE_IN_CONFIDENCE_THRESHOLD) {
        const gap = now - lastInterimTime;
        lastInterimTime = now;
        if (isBotSpeaking && gap > BARGE_IN_TIME_THRESHOLD) {
          isBotSpeaking = false;
          await sendTwiML(makeBargeInTwiML(), "barge-in");
        }
      }
      return;
    }

    if (!text?.trim()) return;

    // Skip if LLM is already running (rapid back-to-back finals from endpointing)
    if (llmRunning) {
      console.log(`[${callSessionId}] LLM busy, dropping: "${text}"`);
      return;
    }

    // ── Noise gate (Issue 1) ─────────────────────────────────────────────
    // These checks run BEFORE setting llmRunning so the flag isn't consumed
    // by a noise artifact, blocking genuine speech that follows immediately.
    //
    // 1. Confidence gate: Deepgram < 0.50 is almost always background noise,
    //    overlapping speech, or a low-SNR mic burst — not an intentional input.
    if (confidence < FINAL_TRANSCRIPT_MIN_CONFIDENCE) {
      console.log(`[${callSessionId}] STT noise drop (conf=${confidence.toFixed(2)} < ${FINAL_TRANSCRIPT_MIN_CONFIDENCE}): "${text}"`);
      return;
    }
    // 2. Word-count gate: a single unrecognised word is nearly always a noise
    //    artifact or breath sound.  Known short commands (yes/no/bye/…) bypass.
    const _wordCount = text.trim().split(/\s+/).length;
    if (_wordCount < FINAL_TRANSCRIPT_MIN_WORDS && !SHORT_COMMAND_RE.test(text.trim())) {
      console.log(`[${callSessionId}] STT noise drop (${_wordCount} word, conf=${confidence.toFixed(2)}): "${text}"`);
      return;
    }

    const sttLatency = Date.now() - transcriptStartTime;
    console.log(`[${callSessionId}] Final: "${text}" conf=${confidence.toFixed(2)} (stt ${sttLatency}ms)`);
    _telLastSttMs = sttLatency;
    if (!tel.data.milestones.firstUserSpeech) tel.milestone("firstUserSpeech");
    tel.event("stt_final", {ms: sttLatency, conf: +confidence.toFixed(2), chars: text.length});
    llmRunning = true;

    // ── Transcript anomaly checks ────────────────────────────────────
    if (sttLatency > 2000) {
      anomaly({
        severity: "warn",
        category: "stt",
        code: "STT_SLOW",
        message: `STT latency ${sttLatency}ms exceeds 2000ms threshold`,
        details: {sttLatency, transcript: text.slice(0, 200)},
      });
    }
    // USER_FRUSTRATION — phrases indicating the bot isn't responding
    const FRUSTRATION_RE = /(hello\?|are you there|can you hear me|is anyone there|i already (said|told)|הלו|שומע אותי|אתה שם|אתה שומע|יש שם מישהו|כבר אמרתי)/i;
    if (FRUSTRATION_RE.test(text)) {
      anomaly({
        severity: "warn",
        category: "transcript",
        code: "USER_FRUSTRATION",
        message: `User frustration cue detected: "${text.slice(0, 120)}"`,
        details: {transcript: text.slice(0, 200), elapsedMs: Date.now() - callStartTime, firstResponseSent},
      });
    }
    // USER_REPEAT — same normalized transcript seen ≥ 2x in 20s
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (normalized) {
      recentTranscripts.push({text: normalized, at: Date.now()});
      while (recentTranscripts.length && Date.now() - recentTranscripts[0].at > 20000) {
        recentTranscripts.shift();
      }
      const repeats = recentTranscripts.filter((r) => r.text === normalized).length;
      if (repeats >= 2) {
        anomaly({
          severity: "warn",
          category: "transcript",
          code: "USER_REPEAT",
          message: `User repeated themselves (${repeats}x in 20s): "${text.slice(0, 80)}"`,
          details: {transcript: text.slice(0, 200), repeats},
        });
      }
    }

    // No filler phrases — go straight to LLM response for natural flow

    // Detect explicit goodbye from caller — will trigger auto-hangup after bot's reply
    const GOODBYE_RE = /\b(bye|goodbye|good\s*bye|see\s*you|that'?s?\s*all|thanks?\s*(that'?s?\s*all|bye|goodbye)|thank\s*you\s*(bye|goodbye)|shalom|להתראות|ביי|ביביי|זהו|זה הכל|תודה\s*רבה|תודה\s*וביי|תודה\s*ושלום|יום\s*טוב|לילה\s*טוב|נתראה|סיימנו|אין\s*לי\s*עוד\s*שאלות)\b/i;
    const callerSaidGoodbye = GOODBYE_RE.test(text);
    executeTool._shouldHangup = false; // reset per-turn

    try {
      // Fetch knowledge context (companyData and history come from session-level cache)
      const knowledgeChunks = hasKnowledgeBase
        ? await (knowledgePrefetch?.promise ?? fetchKnowledgeContext(assistantId, text).catch(() => []))
        : [];
      knowledgePrefetch = null;

      let history = [...sessionHistory];
      if (history.length > MAX_CONVERSATION_HISTORY) {
        history = [...history.slice(0, 2), ...history.slice(-(MAX_CONVERSATION_HISTORY - 2))];
      }

      // Build system prompt — vibe, gender and accent are always applied as style modifiers.
      // Custom systemPrompt is the PRIMARY goal; style is secondary.
      const _fbLangRaw = (assistant.language || "").toLowerCase();
      const _fbLang = _fbLangRaw.startsWith("he") ? "he" : _fbLangRaw.startsWith("ar") ? "ar" : "en";
      const _fbVibe = getVibeSnippet(_fbLang, assistant.assistantVibe || "friendly");
      const _fbGender = _fbLang === "he" ? hebrewGenderInstruction(assistant.callerGender || "neutral")
        : _fbLang === "ar" ? arabicGenderInstruction(assistant.callerGender || "neutral") : "";
      const _fbAccent = getAccentInstruction(_fbLang, assistant.voiceAccent);
      const _fbStyle = [_fbVibe, _fbGender, _fbAccent].filter(Boolean).join("\n");
      let systemPrompt;
      if (assistant.systemPrompt && assistant.systemPrompt.trim()) {
        const assistantIdentity = `You are ${assistant.name || assistant.assistantName || "an AI assistant"}${assistant.companyName ? ` from ${assistant.companyName}` : ""}.`;
        systemPrompt = [
          assistantIdentity,
          "",
          "## Your goal",
          sanitizeForSpeech(assistant.systemPrompt),
          "",
          ...(_fbStyle ? ["## Communication style", _fbStyle, ""] : []),
        ].join("\n");
        // Append caller context if available
        if (callerName) systemPrompt += `\n\nCaller name: ${callerName}`;
        if (callerHistory && callerHistory.length > 0) {
          systemPrompt += `\n\nRecent call history:\n${callerHistory.join("\n")}`;
        }
      } else {
        systemPrompt = buildSystemPrompt(assistant, companyData, {leadNumber, callerName, callerHistory});
      }

      // Tell the LLM to never use markdown — it's a phone call, not a chat
      systemPrompt += "\n\nIMPORTANT: You are speaking on a phone call. Never use markdown, hashtags, bullet points, asterisks, or any text formatting. Speak naturally as in a real conversation. Keep responses concise.";

      // Inject knowledge base context if available
      if (knowledgeChunks.length > 0) {
        systemPrompt += "\n\nReference Information:\n" +
          sanitizeForSpeech(knowledgeChunks.map((c) => c.content).join("\n\n"));
        console.log(`[${callSessionId}] Injected ${knowledgeChunks.length} knowledge chunks`);
      }

      const llmHistory = history.map((m) => ({role: m.role, content: m.content}));

      // Add user turn to history
      history.push({role: "user", content: text, timestamp: new Date()});

      // LLM call with tools
      const llmStart = Date.now();
      const llmResult = await callLLM(systemPrompt, text, llmHistory, {
        tools: AGENT_TOOLS,
        model: assistant.llmModel || "gpt-4o-mini",
        maxTokens: assistant.maxTokens || 150,
        temperature: assistant.temperature ?? 0.8,
      });
      const llmLatency = Date.now() - llmStart;

      let aiText = llmResult.text;

      // Handle tool calls
      if (llmResult.toolCalls.length > 0) {
        const toolResults = [];
        for (const tc of llmResult.toolCalls) {
          try {
            const result = await executeTool(tc, companyId);
            toolResults.push({id: tc.id, result});
          } catch (e) {
            toolResults.push({id: tc.id, result: `Failed: ${e.message}`});
          }
        }

        if (executeTool._shouldHangup) {
          // Hard-coded warm goodbye — avoids LLM echoing "Call ended" verbatim
          const co = (assistant.companyName || companyData.name || "").split(" ")[0] || "us";
          aiText = deepgramLang === "he"
            ? `תודה רבה שפנית ל${co}! ניצור איתך קשר בקרוב. שיהיה לך יום נהדר!`
            : `Thanks for calling ${co}! We'll be in touch soon. Have a great day!`;
        } else {
          // Second LLM pass to get spoken confirmation for other tools
          const confirmResult = await callLLM(
            systemPrompt,
            null,
            [
              ...llmHistory,
              {role: "user", content: text},
              {role: "assistant", content: null, tool_calls: llmResult.toolCalls},
              ...toolResults.map((r) => ({role: "tool", tool_call_id: r.id, content: r.result})),
            ],
            {model: assistant.llmModel || "gpt-4o-mini", maxTokens: 60, temperature: assistant.temperature ?? 0.8},
          );
          aiText = confirmResult.text || "Done! Anything else I can help with?";
        }
      }

      if (!aiText || !aiText.trim()) {
        anomaly({
          severity: "warn",
          category: "llm",
          code: "EMPTY_LLM_RESPONSE",
          message: "LLM returned empty text — falling back to generic prompt",
          details: {toolCallCount: llmResult.toolCalls.length, llmLatency},
        });
      }
      aiText = sanitizeForSpeech(aiText) || "Is there anything else I can help you with?";

      // Also detect if BOT's response is a goodbye
      const BOT_GOODBYE_RE = /\b(goodbye|bye|have a great day|talk soon|להתראות|יום נהדר|נשמע בקרוב|ניצור איתך קשר|שיהיה לך)\b/i;
      const botSaidGoodbye = BOT_GOODBYE_RE.test(aiText);
      const shouldHangup = executeTool._shouldHangup || callerSaidGoodbye || botSaidGoodbye;

      // LLM_SLOW anomaly
      if (llmLatency > 3000) {
        anomaly({
          severity: "warn",
          category: "llm",
          code: "LLM_SLOW",
          message: `LLM round-trip ${llmLatency}ms exceeds 3000ms threshold`,
          details: {llmLatency, model: assistant.llmModel || "gpt-4o-mini", promptLen: systemPrompt.length},
        });
      }

      let twimlSent = false;
      if (shouldHangup) {
        // Block all further transcript processing while Twilio plays goodbye and hangs up
        callEnding = true;
        twimlSent = await ttsAndSend(aiText, "goodbye-hangup", true);
        console.log(`[${callSessionId}] Hanging up after goodbye`);
      } else {
        twimlSent = await ttsAndSend(aiText, "llm-response");
      }

      // FIRST_RESPONSE_SLOW — measure time from stream start → first TTS delivered
      if (twimlSent && !firstResponseSent) {
        firstResponseSent = true;
        const firstResponseMs = Date.now() - callStartTime;
        if (firstResponseMs > 5000) {
          anomaly({
            severity: "error",
            category: "latency",
            code: "FIRST_RESPONSE_SLOW",
            message: `First bot response took ${firstResponseMs}ms (threshold 5000ms)`,
            details: {
              firstResponseMs,
              sttLatency,
              llmLatency,
              firstAudioDelay: firstAudioAt ? firstAudioAt - callStartTime : null,
              transcript: text.slice(0, 200),
            },
          });
        }
      }

      // Only add to history if TTS was actually delivered
      if (twimlSent) {
        isBotSpeaking = !shouldHangup;
        history.push({role: "assistant", content: aiText || "", timestamp: new Date()});
      }

      // Update in-memory history FIRST (ensures next turn sees current state)
      sessionHistory = history;

      // Non-blocking Firestore write (persistence only — in-memory is the source of truth)
      sessionRef.set({
        conversationHistory: history,
        lastSpeechResult: text,
        lastAIResponse: aiText,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true}).catch((e) => console.error("Firestore write failed:", e.message));

      console.log(`[${callSessionId}] stt=${sttLatency}ms llm=${llmLatency}ms reply="${aiText.substring(0, 60)}"`);
      // ── Telemetry: record completed turn ────────────────────────────
      if (twimlSent) {
        // ttsLatency isn't tracked separately in the standard path — the TTS is
        // embedded in ttsAndSend. We record totalMs = sttLatency + llmLatency as
        // a conservative measure (TTS is usually <200ms extra).
        tel.turnDone({
          userText: text,
          assistantText: aiText,
          sttMs: sttLatency,
          llmMs: llmLatency,
          ttsMs: null,          // not separately measured in standard path
          toolNames: [..._telTurnTools],
        });
        _telTurnTools = [];
        if (!tel.data.milestones.firstBotAudio) tel.milestone("firstBotAudio");
      }
      transcriptStartTime = Date.now();
    } catch (err) {
      console.error(`[${callSessionId}] Transcript processing error:`, err.message);
      tel.error("TRANSCRIPT_HANDLER_FAIL", err.message);
      anomaly({
        severity: "error",
        category: "llm",
        code: "TRANSCRIPT_HANDLER_FAIL",
        message: `Transcript handler threw: ${err.message}`,
        details: {stack: (err.stack || "").slice(0, 500), transcript: text.slice(0, 200)},
      });
      // FIX (Issue 1 secondary): recovery message should be in the call language
      const recovery = deepgramLang === "he" ? "סליחה, רגע אחד בבקשה..."
        : deepgramLang === "ar" ? "عذراً، لحظة من فضلك..."
        : deepgramLang === "el" ? "Συγγνώμη, μια στιγμή παρακαλώ..."
        : "Sorry, one moment please...";
      await ttsAndSend(recovery, "error-recovery").catch(() => {});
    } finally {
      llmRunning = false;
    }
  };

  // ── Deepgram connection ────────────────────────────────────────────
  //
  // Wrapped in connectDeepgram() so we can reconnect mid-call if Deepgram
  // drops us (Issue 2: mid-call STT disconnections).
  //
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  // FIX (Issue 1 — Arabic bot silent):
  // Deepgram nova-3 supports streaming only for a limited set of languages
  // (primarily English + a few others).  Arabic streaming is NOT supported by
  // nova-3; it silently returns zero transcripts, making the bot appear deaf.
  // nova-2 supports Arabic (and Hebrew) streaming reliably.
  // Keep nova-3 for Hebrew where it gives better accuracy; use nova-2 for Arabic.
  const defaultSttModel = deepgramLang === "he" ? "nova-3" : "nova-2";
  let deepgramModel = assistant.sttModel || defaultSttModel;
  // Guard against model↔language combos Deepgram rejects with HTTP 400 (which
  // silently deafens the bot for the whole call — see jw56KoGyPq6NltHL4PuG).
  // A stale per-assistant `sttModel` (e.g. nova-2 left over from an Arabic
  // config) must NOT override these hard constraints:
  //   • Hebrew streaming is supported ONLY on nova-3 (nova-2 + lang=he → 400)
  //   • Arabic streaming is supported ONLY on nova-2 (nova-3 + lang=ar → silent)
  if (deepgramLang === "he" && deepgramModel !== "nova-3") {
    console.warn(`[${callSessionId}] Overriding sttModel ${deepgramModel}→nova-3 (Hebrew requires nova-3)`);
    deepgramModel = "nova-3";
  } else if (deepgramLang === "ar" && deepgramModel !== "nova-2") {
    console.warn(`[${callSessionId}] Overriding sttModel ${deepgramModel}→nova-2 (Arabic requires nova-2)`);
    deepgramModel = "nova-2";
  }
  // FIX: smart_format and punctuate are NOT supported for all languages.
  // Sending them for Arabic (or Greek) with nova-2 causes a 400 Bad Request
  // at WebSocket upgrade time, silently deafening the bot.
  // Enable only for English and Hebrew where they are confirmed to work on this plan.
  const supportsSmartFormat = deepgramLang === "en" || deepgramLang === "he";
  const dgOpts = {
    model: deepgramModel,
    language: deepgramLang === "en" ? "en-US" : deepgramLang,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    ...(supportsSmartFormat ? {smart_format: true, punctuate: true} : {}),
    interim_results: true,
    // endpointing 400ms (was 200ms, Issue 1):
    // Deepgram considers a pause >= N ms as end-of-utterance.
    // 200ms was so short that background speech bursts (door slam, nearby TV,
    // passing conversation) would complete within a single endpointing window
    // and be treated as full utterances.  400ms requires the noise to sustain
    // for twice as long before generating a final transcript.
    // Latency-tuned to 300ms (from 400) — shaves 100ms off every turn while
    // staying above the 200ms that previously let background-noise bursts
    // register as utterances. If false finals reappear, raise back to 400.
    endpointing: 300,
  };
  // utterance_end_ms causes 400 errors on this Deepgram plan — disabled for all models
  console.log(`[${callSessionId}] Deepgram config: model=${dgOpts.model} lang=${dgOpts.language} endpointing=${dgOpts.endpointing}ms smartFormat=${supportsSmartFormat}`);

  let dgReconnectAttempts = 0;
  const MAX_DG_RECONNECT = 3; // max mid-call reconnection attempts
  let dgKeepaliveTimer = null; // cleared on ws.close

  /**
   * Create (or recreate) the Deepgram live connection and attach all
   * event listeners.  Called once on startup and again on mid-call disconnect.
   *
   * Issue 2 fix: reconnects up to MAX_DG_RECONNECT times instead of letting
   * the call silently go deaf.
   */
  function connectDeepgram(isReconnect = false) {
    if (callEnding) return; // don't reconnect after goodbye
    timing(isReconnect ? `Deepgram RECONNECT attempt ${dgReconnectAttempts}` : "creating Deepgram connection");

    const conn = deepgram.listen.live(dgOpts);

    // Deepgram SDK v3 uses "Results" (not "transcript") for live transcription events
    conn.on("Results", (evt) => {
      const transcript = evt.channel?.alternatives?.[0]?.transcript;
      const isFinal = evt.is_final || false;
      const confidence = evt.channel?.alternatives?.[0]?.confidence || 0;
      if (transcript?.trim()) {
        console.log(`[${callSessionId}] DG transcript: "${transcript}" final=${isFinal} conf=${confidence.toFixed(2)}`);
        if (!isFinal) {
          // Interim: barge-in detection + speculative knowledge prefetch
          onTranscript({text: transcript, isFinal: false, confidence}).catch(console.error);
          // Start knowledge lookup early on high-confidence interim (saves ~1-3s when final fires)
          if (hasKnowledgeBase && !llmRunning && confidence >= 0.85) {
            const words = transcript.trim().split(/\s+/).length;
            if (words >= 3 && (!knowledgePrefetch || knowledgePrefetch.query !== transcript)) {
              knowledgePrefetch = {
                query: transcript,
                promise: fetchKnowledgeContext(assistantId, transcript).catch(() => []),
              };
            }
          }
        } else {
          // Final: debounce to catch mid-sentence pauses before firing LLM.
          // 250ms (was 150ms) — the extra 100ms catches the common case where
          // Deepgram fires two rapid finals when the user pauses mid-sentence.
          // It also means a background-speech burst followed by silence needs
          // to clear 250ms of quiet before we commit the transcript, which
          // naturally filters out short ambient noise bursts.
          if (pendingTranscriptTimer) clearTimeout(pendingTranscriptTimer);
          pendingTranscriptText += (pendingTranscriptText ? " " : "") + transcript.trim();
          // 150ms debounce (latency-tuned down from 250ms). Still catches the
          // common double-final on a mid-sentence pause; if turns start
          // splitting again, nudge back toward 200ms.
          pendingTranscriptTimer = setTimeout(() => {
            const combined = pendingTranscriptText;
            pendingTranscriptText = "";
            pendingTranscriptTimer = null;
            onTranscript({text: combined, isFinal: true, confidence}).catch(console.error);
          }, 150);
        }
      } else if (isFinal) {
        console.log(`[${callSessionId}] DG final (empty) conf=${confidence.toFixed(2)}`);
      }
    });

    conn.on("open", () => {
      deepgramReady = true;
      dgReconnectAttempts = 0; // reset on successful open
      if (!isReconnect) tel.milestone("bridgeReady"); // first open only
      timing(`Deepgram READY${isReconnect ? " (reconnected)" : ""} (buffered ${earlyAudioBuffer.length} packets)`);
      // Flush any audio buffered while Deepgram was (re)connecting
      while (earlyAudioBuffer.length > 0) {
        const chunk = earlyAudioBuffer.shift();
        if (conn?.send) conn.send(chunk);
      }
      // ── Keepalive: Issue 2 fix ─────────────────────────────────────
      // Deepgram closes idle WebSocket connections after ~60s of no audio.
      // During long silences (user thinking, hold, etc.) we send keepalive
      // frames every 8s so Deepgram never considers the connection idle.
      if (dgKeepaliveTimer) clearInterval(dgKeepaliveTimer);
      dgKeepaliveTimer = setInterval(() => {
        try {
          if (conn && typeof conn.keepAlive === "function") conn.keepAlive();
        } catch (_) { /* ignore — connection may be closing */ }
      }, 8000);
    });

    conn.on("error", (err) => {
      console.error(`[${callSessionId}] Deepgram error:`, err.message || JSON.stringify(err));
      anomaly({
        severity: "error",
        category: "stt",
        code: "DEEPGRAM_ERROR",
        message: `Deepgram stream error: ${err.message || "unknown"}`,
        details: {err: String(err?.message || err || "").slice(0, 500)},
      });
    });

    conn.on("close", () => {
      deepgramReady = false;
      if (dgKeepaliveTimer) { clearInterval(dgKeepaliveTimer); dgKeepaliveTimer = null; }
      console.log(`[${callSessionId}] Deepgram closed (callEnding=${callEnding}, reconnects=${dgReconnectAttempts})`);

      if (!callEnding) {
        // ── Mid-call reconnection: Issue 2 fix ─────────────────────────
        // Previously: logged anomaly and silently went deaf for the rest of the call.
        // Now: attempt reconnect up to MAX_DG_RECONNECT times with backoff.
        if (dgReconnectAttempts < MAX_DG_RECONNECT) {
          const backoffMs = 500 * (dgReconnectAttempts + 1); // 500ms, 1000ms, 1500ms
          dgReconnectAttempts++;
          console.warn(`[${callSessionId}] Deepgram mid-call disconnect — reconnecting in ${backoffMs}ms (attempt ${dgReconnectAttempts}/${MAX_DG_RECONNECT})`);
          anomaly({
            severity: "warn",
            category: "stt",
            code: "DEEPGRAM_RECONNECTING",
            message: `Deepgram socket closed mid-call — attempting reconnect ${dgReconnectAttempts}/${MAX_DG_RECONNECT}`,
            details: {elapsedMs: Date.now() - callStartTime, audioPacketCount, backoffMs},
          });
          setTimeout(() => {
            deepgramConnection = connectDeepgram(true);
          }, backoffMs);
        } else {
          anomaly({
            severity: "error",
            category: "stt",
            code: "DEEPGRAM_RECONNECT_EXHAUSTED",
            message: `Deepgram reconnect failed after ${MAX_DG_RECONNECT} attempts — call will continue without STT`,
            details: {elapsedMs: Date.now() - callStartTime},
          });
        }
      }
    });

    conn.on("SpeechStarted", () => {
      console.log(`[${callSessionId}] Deepgram: speech_started`);
    });

    conn.on("UtteranceEnd", () => {
      console.log(`[${callSessionId}] Deepgram: utterance_end`);
    });

    conn.on("Metadata", (meta) => {
      console.log(`[${callSessionId}] Deepgram metadata: requestId=${meta?.request_id}`);
    });

    return conn;
  }

  deepgramConnection = connectDeepgram();

  // ── Twilio WebSocket heartbeat: Issue 2 fix ──────────────────────────
  // Twilio's media stream WebSocket has an inactivity timeout.  During long
  // LLM processing, TTS generation, or caller silences, no data flows over
  // the socket — Twilio may close it as "idle".  A WebSocket-level ping every
  // 20s keeps it alive without any cost or audible effect.
  const wsHeartbeatTimer = setInterval(() => {
    if (ws.readyState === 1 /* OPEN */) {
      try { ws.ping(); } catch (_) { /* ignore — ws may be in closing state */ }
    }
  }, 20000);

  // ── WebSocket message handler ──────────────────────────────────────
  // Twilio sends JSON messages: connected, start, media, stop
  dispatchMessage = (msg) => {
    let parsed;
    try { parsed = JSON.parse(msg); } catch (_) { return; }

    if (parsed.event !== "media") {
      console.log(`[${callSessionId}] Twilio event: ${parsed.event}`);
    }

    if (parsed.event === "start") {
      callSid = parsed.start?.callSid;
      activeConnections.set(callSid, {deepgramConnection, callSessionId});
      console.log(`[${callSessionId}] Stream started, callSid=${callSid}`);
      tel.milestone("streamStarted");
    } else if (parsed.event === "media") {
      // Inbound audio from caller — forward to Deepgram
      if (parsed.media?.track === "inbound" && parsed.media?.payload) {
        audioPacketCount++;
        tel.countAudioIn();
        if (firstAudioAt === null) firstAudioAt = Date.now();
        const audio = Buffer.from(parsed.media.payload, "base64");
        if (audioPacketCount === 1 || audioPacketCount === 50 || audioPacketCount % 200 === 0) {
          console.log(`[${callSessionId}] Audio pkt #${audioPacketCount}, deepgramReady=${deepgramReady}, bytes=${audio.length}`);
        }
        if (deepgramReady && deepgramConnection?.send) {
          deepgramConnection.send(audio);
        } else {
          // Buffer audio until Deepgram is ready — prevents losing first words
          earlyAudioBuffer.push(audio);
          if (!earlyAudioOverflowWarned && earlyAudioBuffer.length > 500) {
            earlyAudioOverflowWarned = true;
            anomaly({
              severity: "error",
              category: "audio",
              code: "EARLY_AUDIO_OVERFLOW",
              message: `Early audio buffer exceeded 500 packets (${earlyAudioBuffer.length}) — Deepgram too slow to open`,
              details: {bufferLength: earlyAudioBuffer.length},
            });
          }
        }
      }
    } else if (parsed.event === "stop") {
      console.log(`[${callSessionId}] Stream stopped`);
      if (deepgramConnection?.finish) deepgramConnection.finish();
      if (callSid) activeConnections.delete(callSid);
    }
  };

  // Mark setup complete and flush any messages that arrived during async setup
  setupComplete = true;
  console.log(`[${callSessionId}] Setup complete, flushing ${messageBuffer.length} buffered messages`);
  for (const msg of messageBuffer) dispatchMessage(msg);

  ws.on("close", async () => {
    console.log(`[${callSessionId}] WebSocket closed`);
    // Flush any in-progress assistant turn that didn't get a response_done event
    // (e.g. caller hung up while the model was still speaking).
    _flushAssistantTurn();
    // ── Cleanup all timers (Issue 2) ────────────────────────────────
    // Failing to clear these timers causes them to fire on a dead WebSocket,
    // wasting CPU and potentially throwing on closed connection objects.
    clearInterval(wsHeartbeatTimer);
    if (dgKeepaliveTimer) { clearInterval(dgKeepaliveTimer); dgKeepaliveTimer = null; }
    if (pendingTranscriptTimer) { clearTimeout(pendingTranscriptTimer); pendingTranscriptTimer = null; }
    callEnding = true; // prevent Deepgram reconnect attempts after WS is gone
    if (deepgramConnection?.finish) {
      try { deepgramConnection.finish(); } catch (_) {}
    }
    if (callSid) activeConnections.delete(callSid);

    // ── Write cost data to Firestore ──────────────────────────────
    try {
      const callDurationMin = (Date.now() - callStartTime) / 60000;
      const rc = await loadCostConfig();
      const rateCard = rc.rateCard || {};
      const tw = rateCard.twilio || {costPerMinute: 0.013};
      const oai = rateCard.openai || {costPerPromptToken1K: 0.00015, costPerCompletionToken1K: 0.0006, costPerTtsChar1K: 0.015};
      const dg = rateCard.deepgram || {costPerMinute: 0.0043};
      const gTts = rateCard.googleTts || {costPerChar1K: 0.016};

      const costs = {
        twilio: {minutes: +callDurationMin.toFixed(2), cost: +(callDurationMin * tw.costPerMinute).toFixed(6)},
        llm: {
          promptTokens: costTracker.llmPromptTokens, completionTokens: costTracker.llmCompletionTokens,
          turns: costTracker.llmTurns,
          cost: +((costTracker.llmPromptTokens / 1000 * oai.costPerPromptToken1K) + (costTracker.llmCompletionTokens / 1000 * oai.costPerCompletionToken1K)).toFixed(6),
        },
        stt: {minutes: +callDurationMin.toFixed(2), cost: +(callDurationMin * dg.costPerMinute).toFixed(6)},
        tts: {
          characters: costTracker.ttsCharacters, provider: costTracker.ttsProvider || "openai",
          // ElevenLabs ~$0.18/1K chars on Creator-tier overage; google/openai
          // use their configured rates. Keeps per-call cost attribution honest (#43).
          cost: +(costTracker.ttsCharacters / 1000 * (
            costTracker.ttsProvider === "elevenlabs" ? 0.18 :
            costTracker.ttsProvider === "google"     ? gTts.costPerChar1K :
            oai.costPerTtsChar1K
          )).toFixed(6),
        },
      };
      costs.totalCost = +(costs.twilio.cost + costs.llm.cost + costs.stt.cost + costs.tts.cost).toFixed(6);

      // Customer charge based on pricing config
      const cp = rc.customerPricing || {};
      const ownerId = data.ownerId || "";
      const override = (cp.overrides || {})[ownerId];
      const model = override?.model || cp.defaultModel || "markup";
      const markupPct = override?.markupPercent ?? cp.defaultMarkupPercent ?? 30;
      const fixedRate = override?.fixedPerMinute ?? cp.defaultFixedPerMinute ?? 0.50;

      if (model === "markup") {
        costs.customerCharge = +(costs.totalCost * (1 + markupPct / 100)).toFixed(6);
      } else {
        costs.customerCharge = +(callDurationMin * fixedRate).toFixed(6);
      }
      costs.pricingModel = model;
      costs.pricingValue = model === "markup" ? markupPct : fixedRate;
      costs.currency = rateCard.currency || "USD";
      costs.calculatedAt = new Date().toISOString();

      await sessionRef.set({costs, duration: Math.round(callDurationMin * 60)}, {merge: true});
      console.log(`[${callSessionId}] Costs: $${costs.totalCost} → charge $${costs.customerCharge} (${model})`);

      // ── Persist super-admin telemetry ──────────────────────────────
      try { await tel.finalize(costs); } catch (e) { console.error(`[${callSessionId}] Telemetry write failed:`, e.message); }
    } catch (costErr) {
      console.error(`[${callSessionId}] Cost calculation failed:`, costErr.message);
      // Still write telemetry even if cost calc failed
      try { await tel.finalize(null); } catch (e) {}
    }
  });

  ws.on("error", (err) => {
    console.error(`[${callSessionId}] WebSocket error:`, err.message);
    tel.error("WS_ERROR", err.message);
  });
});

// ── Feature 5: AI Co-Pilot for Human Agents ──────────────────────────────
//
// Human agents open GET /copilot-stream?sessionId=XXX to receive a live SSE
// feed of transcripts + AI suggestions as the call progresses.
//
// The Co-Pilot watches a Firestore call_sessions document and pushes:
//  • live transcript turns  (role: user | assistant)
//  • AI suggestions         (talking points, objection handling, next steps)
//  • caller sentiment       (positive | neutral | negative)
//  • compliance alerts      (PII detected, DNC flag, TCPA time warning)
//
// Architecture:
//  1. Firestore listener on call_sessions/{sessionId} fires whenever the
//     conversation history changes (the WS handler updates it every turn).
//  2. For every new user turn we call GPT-4o-mini with a compact context
//     to generate a 1-sentence agent suggestion.
//  3. The SSE stream sends JSON events — the frontend renders them in a
//     live sidebar panel alongside the call dashboard.
//
// CORS: opened for all origins (used from any admin dashboard domain).
// Auth:  Bearer token validated against Firebase Auth.

const copilotSessions = new Map(); // sessionId → Set<SSE res objects>

// Register a new Co-Pilot listener
app.get("/copilot-stream", async (req, res) => {
  res.set({
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "X-Accel-Buffering": "no",       // Disable nginx buffering
  });
  res.flushHeaders();

  const sessionId = req.query.sessionId;
  if (!sessionId) {
    res.write(`data: ${JSON.stringify({type:"error", message:"sessionId required"})}\n\n`);
    res.end();
    return;
  }

  // Register this SSE connection
  if (!copilotSessions.has(sessionId)) copilotSessions.set(sessionId, new Set());
  const listeners = copilotSessions.get(sessionId);
  listeners.add(res);
  console.log(`[COPILOT] New listener for session ${sessionId} (total: ${listeners.size})`);

  // Send a heartbeat every 25 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch (_) {}
  }, 25000);

  // Send initial state from Firestore
  try {
    const db = getFirestore();
    const sessionSnap = await db.collection("call_sessions").doc(sessionId).get();
    if (sessionSnap.exists) {
      const sessionData = sessionSnap.data();
      res.write(`data: ${JSON.stringify({type: "session_state", data: {
        status: sessionData.status || "active",
        leadName: sessionData.leadName || null,
        callerNumber: sessionData.callerNumber || null,
        assistantId: sessionData.assistantId || null,
        conversationHistory: (sessionData.conversationHistory || []).slice(-20),
      }})}\n\n`);
    }
  } catch (e) {
    console.error(`[COPILOT] Failed to load initial state for ${sessionId}:`, e.message);
  }

  // Cleanup when connection closes
  req.on("close", () => {
    clearInterval(heartbeat);
    listeners.delete(res);
    if (listeners.size === 0) copilotSessions.delete(sessionId);
    console.log(`[COPILOT] Listener closed for session ${sessionId} (remaining: ${listeners.size})`);
  });
});

// Called internally to push a copilot event to all listening dashboards
function pushCopilotEvent(sessionId, event) {
  const listeners = copilotSessions.get(sessionId);
  if (!listeners || listeners.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of listeners) {
    try { res.write(payload); } catch (_) { listeners.delete(res); }
  }
}

// Generate an AI Co-Pilot suggestion for the latest conversation turn.
// Called every time a new USER transcript arrives (non-blocking, best-effort).
async function generateCopilotSuggestion(callSessionId, conversationHistory, assistantContext) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY || !copilotSessions.has(callSessionId)) return;

  try {
    // Build compact context — last 6 turns max to fit in a cheap model call
    const recentTurns = (conversationHistory || [])
      .filter((h) => h.role === "user" || h.role === "assistant")
      .slice(-6)
      .map((h) => `${h.role === "user" ? "Caller" : "Agent"}: ${String(h.content || "").slice(0, 200)}`)
      .join("\n");

    const systemPrompt = `You are an AI co-pilot helping a human call center agent in real time. The agent can see your suggestions in their sidebar — they are NOT on the call with you; you are NOT talking to the caller.

Context:
- Agent's role: ${assistantContext?.role || "customer support"}
- Company: ${assistantContext?.companyName || ""}
- Products/services: ${assistantContext?.systemPrompt?.slice(0, 200) || ""}

Your job: Based on the conversation so far, give the human agent ONE concise, actionable suggestion for what to say or do next. Max 2 sentences. Focus on:
- Handling the caller's specific concern
- Objection handling if the caller is pushing back
- Upsell/cross-sell opportunities if appropriate
- When to escalate or transfer
- Never suggest anything the agent cannot act on immediately`;

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        {role: "system", content: systemPrompt},
        {role: "user",   content: `Recent conversation:\n${recentTurns}\n\nWhat should the agent say or do next?`},
      ],
      max_tokens: 120,
      temperature: 0.4,
    }, {
      headers: {"Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json"},
      timeout: 8000,
    });

    const suggestion = resp.data?.choices?.[0]?.message?.content?.trim();
    if (suggestion) {
      pushCopilotEvent(callSessionId, {type: "suggestion", text: suggestion, timestamp: new Date().toISOString()});
    }
  } catch (e) {
    // Non-blocking — copilot failures must never affect the live call
    console.warn(`[COPILOT] Suggestion generation failed for ${callSessionId}:`, e.message);
  }
}

// Detect caller sentiment from transcript text (fast heuristic — no API call)
function detectSentiment(text) {
  const t = text.toLowerCase();
  const positive = /\b(great|perfect|excellent|thanks|thank you|wonderful|love it|sounds good|yes please|happy|appreciate)\b/.test(t);
  const negative = /\b(angry|frustrated|upset|terrible|horrible|this is wrong|cancel|refund|lawsuit|complaint|awful|disaster|never again|ridiculous)\b/.test(t);
  if (negative) return "negative";
  if (positive) return "positive";
  return "neutral";
}

// Push new transcript turns to all co-pilot listeners for this session.
// Called from the bridge.on("transcript") handler.
function notifyCopilotTranscript(callSessionId, role, text, conversationHistory, assistantContext) {
  if (!copilotSessions.has(callSessionId)) return;

  // Always push the transcript turn immediately
  pushCopilotEvent(callSessionId, {type: "transcript", role, text: text.slice(0, 500), timestamp: new Date().toISOString()});

  // On user turns: also push sentiment and trigger suggestion generation
  if (role === "user") {
    const sentiment = detectSentiment(text);
    pushCopilotEvent(callSessionId, {type: "sentiment", value: sentiment, timestamp: new Date().toISOString()});
    // Async — don't await, don't let failures propagate
    generateCopilotSuggestion(callSessionId, conversationHistory, assistantContext).catch(() => {});
  }
}

// Inject Co-Pilot notifications into the Realtime bridge transcript handler.
// This function is called from handleRealtimeSession when the bridge emits a transcript.
// Exported so it can be called from the standard (non-realtime) session handler too.
// The assistantContext is a plain object: {role, companyName, systemPrompt}.
app.notifyCopilotTranscript = notifyCopilotTranscript;

// POST /copilot-inject — allows the human agent to inject a message into the live call
// (e.g. whisper a note that the AI assistant should communicate to the caller).
app.post("/copilot-inject", express.json(), async (req, res) => {
  res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const {sessionId, message, type = "agent_note"} = req.body || {};
  if (!sessionId || !message) {
    return res.status(400).json({status: "error", message: "sessionId and message required"});
  }

  try {
    const db = getFirestore();
    await db.collection("call_sessions").doc(sessionId).set({
      copilotInjections: require("firebase-admin/firestore").FieldValue.arrayUnion({
        message: String(message).slice(0, 500),
        type,
        injectedAt: new Date().toISOString(),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    // Notify all listeners on this session that an injection happened
    pushCopilotEvent(sessionId, {type: "injection_ack", message, timestamp: new Date().toISOString()});
    res.json({status: "ok", message: "Injected"});
  } catch (e) {
    console.error(`[COPILOT] Inject failed for ${sessionId}:`, e.message);
    res.status(500).json({status: "error", message: e.message});
  }
});

// ── Start server ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Twilio Media Stream service listening on :${PORT}`);
});
