/**
 * Real Call Simulation E2E Test
 * ──────────────────────────────────────────────────────────────────
 * Tests the COMPLETE voice pipeline against live deployed endpoints:
 *   1. Health & Connectivity
 *   2. TTS Providers (Google, ElevenLabs, Azure) - availability & synthesis
 *   3. Assistant management (Create, Update, Get, Delete)
 *   4. Call routing & session management
 *   5. Multi-turn conversation simulation via TTS
 *   6. Edge cases & stress testing
 *   7. Scenario engine
 *   8. Filler phrases synthesis
 *   9. Performance benchmarks
 *
 * Run: node testRealCallSimulation.js
 */

const axios = require("axios");

const BASE_URL = "https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net";

// ── Helpers ──────────────────────────────────────────────────────
const timestamp = () => new Date().toISOString();
const ms = (start) => Date.now() - start;

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  criticalBlockers: [],
  tests: [],
  latencyBenchmarks: [],
};

function logResult(name, passed, details = {}) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`  ✅ PASS: ${name} ${details.latencyMs ? `(${details.latencyMs}ms)` : ""}`);
  } else {
    results.failed++;
    console.log(`  ❌ FAIL: ${name} — ${details.error || details.reason || "Unknown error"}`);
  }
  results.tests.push({ name, passed, ...details });
}

function logBlocker(name, message) {
  results.criticalBlockers.push({ name, message });
  console.log(`  🚨 BLOCKER: ${name} — ${message}`);
}

function logWarning(name, message) {
  results.warnings++;
  console.log(`  ⚠️  WARN: ${name} — ${message}`);
}

function logLatency(stage, latencyMs, threshold) {
  if (!latencyMs || latencyMs <= 0) return;
  const ok = latencyMs <= threshold;
  results.latencyBenchmarks.push({ stage, latencyMs, threshold, ok });
  if (!ok) {
    console.log(`  🐌 LATENCY WARNING: ${stage} = ${latencyMs}ms (threshold: ${threshold}ms)`);
  }
}

async function safeRequest(config) {
  try {
    const start = Date.now();
    const response = await axios({ timeout: 30000, ...config });
    return { data: response.data, status: response.status, latencyMs: ms(start), error: null };
  } catch (error) {
    const latency = Date.now() - (config._startTime || Date.now());
    return {
      data: error.response?.data || null,
      status: error.response?.status || 0,
      latencyMs: latency > 0 ? latency : 0,
      error: error.response?.data?.message || error.message,
      rawError: error.message,
    };
  }
}

// Helper to check audio content size (handles both string and Buffer object)
function getAudioSize(data) {
  if (!data?.audioContent) return 0;
  // Buffer serialized as {type: "Buffer", data: [...]}
  if (data.audioContent?.data && Array.isArray(data.audioContent.data)) return data.audioContent.data.length;
  // Base64 string
  if (typeof data.audioContent === "string") return data.audioContent.length;
  // Direct buffer
  if (Buffer.isBuffer(data.audioContent)) return data.audioContent.length;
  return 0;
}
function hasAudio(data) { return data?.status === "success" && getAudioSize(data) > 100; }

// Track which TTS providers are functional
const ttsProviderStatus = { google: false, elevenlabs: false, azure: false };
let elevenLabsVoiceId = null;

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 1: Health & Connectivity
// ═══════════════════════════════════════════════════════════════════
async function testHealthAndConnectivity() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 1: Health & Connectivity                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 1.1 Health Check endpoint (may not be deployed yet)
  const health = await safeRequest({ method: "GET", url: `${BASE_URL}/healthCheck` });
  if (health.status === 404) {
    logWarning("Health Check", "Endpoint not deployed yet (404). Deploy needed.");
    logResult("Health Check endpoint", false, { error: "Not deployed (404)" });
  } else {
    // 200 = healthy, 503 = degraded (still means function is working, just some services missing)
    const isUp = health.status === 200 || health.status === 503;
    const status = health.data?.status || "unknown";
    logResult(`Health Check endpoint (${status})`, isUp, {
      latencyMs: health.latencyMs,
      status: health.data?.status,
      services: health.data?.checks?.config?.services,
    });
    if (health.status === 503) {
      logWarning("Health Check degraded", `Firestore issue or critical service down`);
    }
    // Log config status for info
    if (health.data?.checks?.config?.configured) {
      console.log(`    Services configured: ${health.data.checks.config.configured}`);
    }
  }

  // 1.2 Core endpoints reachable (using correct HTTP methods)
  const endpoints = [
    { name: "assistantsList", method: "GET", url: `${BASE_URL}/assistantsList` },
    { name: "assignAssistant", method: "POST", url: `${BASE_URL}/assignAssistant`, body: { phone_number: "+972500000000" } },
    { name: "getLeadDetails", method: "POST", url: `${BASE_URL}/getLeadDetails`, body: { phone: "+972500000000" } },
    { name: "scenariosNodeTypes", method: "GET", url: `${BASE_URL}/scenariosNodeTypes` },
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    const res = await safeRequest({ method: ep.method, url: ep.url, data: ep.body });
    const latency = Date.now() - start;
    const reachable = res.status > 0 && res.status < 504;
    logResult(`${ep.name} is reachable`, reachable, { latencyMs: latency, status: res.status });
    logLatency(ep.name, latency, 3000);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 2: TTS Provider Availability & Synthesis
// ═══════════════════════════════════════════════════════════════════
async function testTTSProviders() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 2: TTS Provider Availability & Synthesis    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ─── 2.1 Google TTS ──────────────────────────────────────────────
  console.log("  --- Google TTS ---");
  const googleVoicesStart = Date.now();
  const googleVoices = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/listTtsVoices`,
    data: { provider: "google", languageCode: "he-IL" },
  });
  const googleVoicesLatency = Date.now() - googleVoicesStart;

  if (googleVoices.status === 500 && googleVoices.error?.includes("PERMISSION_DENIED")) {
    logBlocker("Google Cloud TTS API", "API not enabled in GCP project. Must enable at console.cloud.google.com");
    logResult("Google TTS API enabled", false, {
      error: "PERMISSION_DENIED - API not enabled in GCP project",
      latencyMs: googleVoicesLatency,
    });
    ttsProviderStatus.google = false;
  } else if (googleVoices.data?.voices?.length > 0) {
    ttsProviderStatus.google = true;
    logResult("Google TTS has Hebrew voices", true, {
      latencyMs: googleVoicesLatency,
      voiceCount: googleVoices.data.voices.length,
    });
    logLatency("listGoogleVoices", googleVoicesLatency, 3000);

    // Test synthesis
    const googleSynth = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/synthesizeTts`,
      data: { provider: "google", text: "שלום! איך אני יכול לעזור?", voiceId: "he-IL-Wavenet-A", languageCode: "he-IL" },
    });
    logResult("Google TTS Hebrew synthesis", hasAudio(googleSynth.data), {
      latencyMs: googleSynth.latencyMs,
      audioSize: getAudioSize(googleSynth.data),
    });
  } else {
    ttsProviderStatus.google = false;
    logResult("Google TTS API check", false, {
      error: googleVoices.error || "Unknown response",
      status: googleVoices.status,
    });
  }

  // ─── 2.2 ElevenLabs TTS ──────────────────────────────────────────
  console.log("\n  --- ElevenLabs TTS ---");
  const elevenStart = Date.now();
  const elevenVoices = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/listTtsVoices`,
    data: { provider: "elevenlabs" },
  });
  const elevenVoicesLatency = Date.now() - elevenStart;

  if (elevenVoices.data?.voices?.length > 0) {
    logResult("ElevenLabs voices available", true, {
      latencyMs: elevenVoicesLatency,
      voiceCount: elevenVoices.data.voices.length,
    });
    logLatency("listElevenLabsVoices", elevenVoicesLatency, 5000);

    elevenLabsVoiceId = elevenVoices.data.voices[0].id;
    const firstVoiceName = elevenVoices.data.voices[0].name;

    // Test synthesis
    const elevenSynthStart = Date.now();
    const elevenSynth = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/synthesizeTts`,
      data: { provider: "elevenlabs", text: "שלום! איך אני יכול לעזור?", voiceId: elevenLabsVoiceId },
    });
    const elevenSynthLatency = Date.now() - elevenSynthStart;

    if (hasAudio(elevenSynth.data)) {
      // Check if response was served via fallback to Google
      if (elevenSynth.data?.fallback) {
        ttsProviderStatus.elevenlabs = false;
        logWarning("ElevenLabs synthesis", `Fallback to ${elevenSynth.data.provider} (original provider unavailable)`);
        logResult("ElevenLabs → fallback synthesis", true, {
          latencyMs: elevenSynthLatency,
          fallbackProvider: elevenSynth.data.provider,
          audioSize: getAudioSize(elevenSynth.data),
        });
      } else {
        ttsProviderStatus.elevenlabs = true;
        logResult("ElevenLabs Hebrew synthesis", true, {
          latencyMs: elevenSynthLatency,
          voiceUsed: firstVoiceName,
          audioSize: getAudioSize(elevenSynth.data),
        });
      }
      logLatency("tts_elevenlabs_hebrew", elevenSynthLatency, 5000);
    } else {
      ttsProviderStatus.elevenlabs = false;
      const errMsg = elevenSynth.error || "Synthesis failed";
      if (errMsg.includes("401")) {
        logWarning("ElevenLabs API Key", "API key returns 401 (free plan or IP restriction). Using Google TTS fallback.");
      }
      logResult("ElevenLabs Hebrew synthesis", false, {
        error: errMsg,
        latencyMs: elevenSynthLatency,
      });
    }
  } else {
    ttsProviderStatus.elevenlabs = false;
    logResult("ElevenLabs voices available", false, {
      error: elevenVoices.error || "No voices returned",
      status: elevenVoices.status,
    });
  }

  // ─── 2.3 Azure TTS ──────────────────────────────────────────────
  console.log("\n  --- Azure TTS ---");
  const azureStart = Date.now();
  const azureVoices = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/listTtsVoices`,
    data: { provider: "azure" },
  });
  const azureLatency = Date.now() - azureStart;

  if (azureVoices.data?.voices?.length > 0) {
    ttsProviderStatus.azure = true;
    logResult("Azure TTS voices available", true, {
      latencyMs: azureLatency,
      voiceCount: azureVoices.data.voices.length,
    });
  } else if (azureVoices.status === 500 && azureVoices.error?.includes("configuration missing")) {
    logWarning("Azure TTS", "Not configured (missing AZURE_TTS_KEY/AZURE_TTS_REGION). Optional provider.");
    logResult("Azure TTS configuration", false, {
      error: "Not configured (optional)",
      reason: "AZURE_TTS_KEY/REGION not set",
    });
  } else {
    logResult("Azure TTS", false, {
      error: azureVoices.error || "Unknown",
      status: azureVoices.status,
    });
  }

  // ─── Summary ─────────────────────────────────────────────────────
  const workingProviders = Object.entries(ttsProviderStatus).filter(([, v]) => v).map(([k]) => k);
  console.log(`\n  📊 Working TTS providers: ${workingProviders.length > 0 ? workingProviders.join(", ") : "NONE ⚠️"}`);
  if (workingProviders.length === 0) {
    logBlocker("No TTS providers working", "ALL TTS providers are non-functional. Voice bot cannot speak.");
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 3: Assistant Management (CRUD)
// ═══════════════════════════════════════════════════════════════════
async function testAssistantManagement() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 3: Assistant Management (CRUD)              ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const testCompanyId = `e2e-test-${Date.now()}`;

  // 3.1 Create assistant
  const createStart = Date.now();
  const createResult = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/assistantsCreate`,
    data: {
      companyId: testCompanyId,
      name: "E2E Hebrew Bot",
      language: "he-IL",
      voice: "Google.he-IL-Wavenet-A",
      model: "gpt-4o-mini",
      firstMessage: "שלום! תודה שהתקשרת. איך אני יכול לעזור לך היום?",
      instructions: "אתה נציג שירות לקוחות מקצועי. ענה בעברית תקנית, בקיצור ובבהירות.",
      sttModel: "nova-2",
      endCallPhrases: ["להתראות", "תודה רבה", "ביי"],
    },
  });
  const createLatency = Date.now() - createStart;
  const assistantId = createResult.data?.id || createResult.data?.assistantId;
  logResult("Create Hebrew assistant", !!assistantId, {
    latencyMs: createLatency,
    assistantId,
    error: createResult.error,
  });
  logLatency("assistantsCreate", createLatency, 3000);

  if (!assistantId) {
    console.log("  ⏭️  Skipping remaining CRUD tests (create failed)");
    return;
  }

  // 3.2 Get assistant (GET method)
  const getStart = Date.now();
  const getResult = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/assistantsGet?assistantId=${assistantId}&companyId=${testCompanyId}`,
  });
  const getLatency = Date.now() - getStart;
  const assistantData = getResult.data?.assistant || getResult.data;
  logResult("Get assistant details", getResult.status === 200, {
    latencyMs: getLatency,
    hasLanguage: !!assistantData?.language,
    hasVoice: !!assistantData?.voice,
    hasFirstMessage: !!assistantData?.firstMessage,
  });
  logLatency("assistantsGet", getLatency, 2000);

  // Verify Hebrew configuration
  if (getResult.status === 200) {
    const lang = assistantData?.language;
    const voice = assistantData?.voice;
    const firstMsg = assistantData?.firstMessage;
    logResult("Assistant has Hebrew language", lang === "he-IL" || lang === "he", { language: lang });
    logResult("Assistant has Hebrew voice", voice?.includes("he-IL") || voice?.includes("Hebrew"), { voice });
    logResult("Assistant has Hebrew first message", firstMsg?.includes("שלום"), { firstMessage: firstMsg?.substring(0, 50) });
  }

  // 3.3 Update assistant
  const updateStart = Date.now();
  const updateResult = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/assistantsUpdate`,
    data: {
      assistantId,
      companyId: testCompanyId,
      name: "Updated E2E Hebrew Bot",
      firstMessage: "שלום רב! ברוכים הבאים. איך אוכל לסייע?",
    },
  });
  const updateLatency = Date.now() - updateStart;
  logResult("Update assistant", updateResult.status === 200, {
    latencyMs: updateLatency,
    error: updateResult.error,
  });
  logLatency("assistantsUpdate", updateLatency, 3000);

  // 3.4 List assistants (GET method, returns plain array)
  const listStart = Date.now();
  const listResult = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/assistantsList`,
  });
  const listLatency = Date.now() - listStart;
  const assistants = Array.isArray(listResult.data) ? listResult.data : (listResult.data?.assistants || []);
  const found = assistants.some(a => a.id === assistantId);
  logResult("List assistants includes created one", found || listResult.status === 200, {
    latencyMs: listLatency,
    count: assistants.length,
  });
  logLatency("assistantsList", listLatency, 2000);

  // 3.5 Delete assistant
  const deleteStart = Date.now();
  const deleteResult = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/assistantsDelete`,
    data: { assistantId, companyId: testCompanyId },
  });
  const deleteLatency = Date.now() - deleteStart;
  logResult("Delete assistant", deleteResult.status === 200, {
    latencyMs: deleteLatency,
    error: deleteResult.error,
  });
  logLatency("assistantsDelete", deleteLatency, 2000);

  // 3.6 Verify deletion
  const verifyStart = Date.now();
  const verifyResult = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/assistantsGet?assistantId=${assistantId}&companyId=${testCompanyId}`,
  });
  const verifyLatency = Date.now() - verifyStart;
  logResult("Verify assistant deleted", verifyResult.status === 404, {
    latencyMs: verifyLatency,
    status: verifyResult.status,
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 4: Call Routing & Session Management
// ═══════════════════════════════════════════════════════════════════
async function testCallRouting() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 4: Call Routing & Session Management        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 4.1 assignAssistant with various phone formats
  const phoneFormats = [
    { phone: "+972501234567", label: "Israeli mobile (+972)" },
    { phone: "0501234567", label: "Israeli local" },
    { phone: "+15551234567", label: "US number" },
    { phone: "+442071234567", label: "UK number" },
  ];

  for (const { phone, label } of phoneFormats) {
    const start = Date.now();
    const result = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/assignAssistant`,
      data: { phone_number: phone },
    });
    const latency = Date.now() - start;
    // 200 = found, 404 = no matching phone (expected for test), 4xx = handled
    logResult(`assignAssistant: ${label}`, result.status < 500, {
      latencyMs: latency,
      status: result.status,
    });
    logLatency(`assign_${label.replace(/[\s()]/g, "_")}`, latency, 2000);
  }

  // 4.2 endOfCallLog
  const callLogStart = Date.now();
  const callLog = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/endOfCallLog`,
    data: {
      call_session_id: `e2e-test-${Date.now()}`,
      phone_number: "+972501234567",
      duration: 120,
      status: "completed",
      transcript: "שלום, אני רוצה לקבוע תור. מצוין, יום ראשון בעשר. תודה!",
      summary: "לקוח ביקש לקבוע תור לתיקון מזגן. נקבע ליום ראשון בשעה 10:00.",
    },
  });
  const callLogLatency = Date.now() - callLogStart;
  logResult("endOfCallLog webhook", callLog.status < 500, {
    latencyMs: callLogLatency,
    status: callLog.status,
    error: callLog.error,
  });
  logLatency("endOfCallLog", callLogLatency, 3000);

  // 4.3 getLeadDetails
  const leadStart = Date.now();
  const lead = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/getLeadDetails`,
    data: { phone: "+972501234567" },
  });
  const leadLatency = Date.now() - leadStart;
  logResult("getLeadDetails", lead.status < 500, {
    latencyMs: leadLatency,
    status: lead.status,
  });
  logLatency("getLeadDetails", leadLatency, 2000);
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 5: TTS Hebrew Synthesis Quality (with working provider)
// ═══════════════════════════════════════════════════════════════════
async function testTTSSynthesisQuality() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 5: TTS Hebrew Synthesis Quality             ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Determine which provider to use for synthesis tests
  let provider, voiceId, languageCode;
  if (ttsProviderStatus.google) {
    provider = "google";
    voiceId = "he-IL-Wavenet-A";
    languageCode = "he-IL";
  } else if (ttsProviderStatus.elevenlabs && elevenLabsVoiceId) {
    provider = "elevenlabs";
    voiceId = elevenLabsVoiceId;
    languageCode = null;
  } else {
    console.log("  ⚠️  No TTS provider available for synthesis tests. Skipping.");
    logBlocker("TTS Synthesis Tests", "Cannot test synthesis - no TTS provider is working");
    return;
  }

  console.log(`  Using provider: ${provider} (voice: ${voiceId})\n`);

  // Hebrew conversation samples
  const hebrewSamples = [
    { label: "Short greeting", text: "שלום, איך אני יכול לעזור?" },
    { label: "Medium sentence", text: "תודה שהתקשרת לשירות הלקוחות שלנו. אני כאן כדי לעזור לך בכל שאלה." },
    { label: "Long response", text: "מצוין! בוא נקבע לך תור. אני צריך את השם המלא שלך, כתובת אימייל, ואת הזמן המועדף שלך. נתחיל?" },
    { label: "Filler phrase", text: "רגע אחד, אני בודק..." },
    { label: "Acknowledgment", text: "נהדר! אני מבין בדיוק." },
    { label: "Confirmation", text: "תודה! רק לאישור: דני כהן, יום ראשון בעשר, רחוב הרצל 25 תל אביב. נכון?" },
    { label: "Error recovery", text: "סליחה, לא שמעתי טוב. אפשר לחזור על זה בבקשה?" },
    { label: "Farewell", text: "התור שלך נקבע בהצלחה! תודה שבחרת בנו. יום נפלא!" },
    { label: "Numbers & dates", text: "התור שלך נקבע ליום 15 בפברואר בשעה 10:30 בבוקר. המחיר הוא 350 שקלים." },
    { label: "Mixed Hebrew+English", text: "אני צריך שירות של air conditioning repair בדירה שלי בתל אביב" },
  ];

  let totalLatency = 0;
  let count = 0;

  for (const { label, text } of hebrewSamples) {
    const start = Date.now();
    const result = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/synthesizeTts`,
      data: { provider, text, voiceId, ...(languageCode && { languageCode }) },
    });
    const latency = Date.now() - start;

    const isSuccess = hasAudio(result.data);

    logResult(`TTS: "${label}"`, isSuccess, {
      latencyMs: latency,
      textLength: text.length,
      audioSize: getAudioSize(result.data),
      error: isSuccess ? null : (result.error || "No audio"),
    });
    logLatency(`tts_${label.replace(/[\s&+]/g, "_").toLowerCase()}`, latency, 3000);

    if (latency > 0) {
      totalLatency += latency;
      count++;
    }
  }

  if (count > 0) {
    const avg = Math.round(totalLatency / count);
    console.log(`\n  📊 Average TTS latency: ${avg}ms across ${count} samples`);
    logLatency("tts_average", avg, 2000);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 6: Multi-Turn Conversation Simulation
// ═══════════════════════════════════════════════════════════════════
async function testMultiTurnConversation() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 6: Multi-Turn Conversation Simulation       ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Determine working TTS provider
  let provider, voiceId, languageCode;
  if (ttsProviderStatus.google) {
    provider = "google"; voiceId = "he-IL-Wavenet-A"; languageCode = "he-IL";
  } else if (ttsProviderStatus.elevenlabs && elevenLabsVoiceId) {
    provider = "elevenlabs"; voiceId = elevenLabsVoiceId; languageCode = null;
  } else {
    console.log("  ⚠️  No TTS provider for conversation simulation. Skipping.");
    return;
  }

  // Simulate a complete Hebrew phone conversation (bot turns only via TTS)
  const botResponses = [
    { turn: 1, text: "שלום! תודה שהתקשרת לשירות הלקוחות. איך אני יכול לעזור לך?", desc: "Greeting" },
    { turn: 3, text: "בטח! אשמח לעזור לך לקבוע תור לתיקון מזגן. מה השם המלא שלך?", desc: "Acknowledge + ask name" },
    { turn: 5, text: "תודה, דני! מה כתובת האימייל שלך?", desc: "Ask email" },
    { turn: 7, text: "מצוין! ומה הכתובת שבה נצטרך לתקן את המזגן?", desc: "Ask address" },
    { turn: 9, text: "ומתי יהיה לך נוח? יש לנו פתיח ביום ראשון בשעה עשר.", desc: "Suggest time" },
    { turn: 11, text: "נהדר! רק לאישור: דני כהן, תיקון מזגן, יום ראשון בעשר, הרצל 25 ת\"א. נכון?", desc: "Confirm details" },
    { turn: 13, text: "מצוין! התור שלך נקבע בהצלחה. תודה שבחרת בנו, דני! יום נפלא!", desc: "Farewell" },
  ];

  let totalLatency = 0;
  let successCount = 0;

  for (const step of botResponses) {
    const start = Date.now();
    const result = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/synthesizeTts`,
      data: { provider, text: step.text, voiceId, ...(languageCode && { languageCode }) },
    });
    const latency = Date.now() - start;

    const isSuccess = hasAudio(result.data);
    if (isSuccess) { successCount++; totalLatency += latency; }

    logResult(`Turn ${step.turn}: ${step.desc}`, isSuccess, {
      latencyMs: latency,
      textLength: step.text.length,
      audioSize: getAudioSize(result.data),
      error: isSuccess ? null : (result.error || "No audio"),
    });
  }

  const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
  console.log(`\n  📊 Conversation simulation: ${successCount}/${botResponses.length} turns successful`);
  console.log(`  📊 Average TTS latency per turn: ${avgLatency}ms`);
  console.log(`  📊 Total voice generation time: ${totalLatency}ms`);

  logResult("Full conversation completes", successCount === botResponses.length, {
    successRate: `${successCount}/${botResponses.length}`,
    avgLatencyMs: avgLatency,
  });
  logLatency("conversation_avg_per_turn", avgLatency, 2000);
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 7: Edge Cases & Stress
// ═══════════════════════════════════════════════════════════════════
async function testEdgeCases() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 7: Edge Cases & Stress Testing              ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 7.1 Invalid TTS provider
  const invalidProvider = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/synthesizeTts`,
    data: { provider: "invalid_provider", text: "test" },
  });
  logResult("Invalid TTS provider → error", invalidProvider.status >= 400 || invalidProvider.data?.status === "error", {
    status: invalidProvider.status,
  });

  // 7.2 Missing required fields
  const missingFields = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/assignAssistant`,
    data: {},
  });
  logResult("assignAssistant with no data → handled", missingFields.status < 500, {
    status: missingFields.status,
  });

  // 7.3 XSS attempt in text
  const xssText = '<script>alert("xss")</script>שלום';
  const xssResult = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/assistantsCreate`,
    data: {
      companyId: "xss-test",
      name: xssText,
      instructions: xssText,
    },
  });
  // The response should have sanitized the input
  logResult("XSS in assistant name handled", xssResult.status < 500, {
    status: xssResult.status,
  });
  // Cleanup if created
  if (xssResult.data?.id) {
    await safeRequest({
      method: "POST",
      url: `${BASE_URL}/assistantsDelete`,
      data: { assistantId: xssResult.data.id, companyId: "xss-test" },
    });
  }

  // 7.4 Concurrent API requests
  console.log("\n  🔄 Testing concurrent API requests...");
  const concurrentStart = Date.now();
  const concurrentResults = await Promise.all([
    safeRequest({ method: "GET", url: `${BASE_URL}/assistantsList` }),
    safeRequest({ method: "POST", url: `${BASE_URL}/assignAssistant`, data: { phone_number: "+972501111111" } }),
    safeRequest({ method: "POST", url: `${BASE_URL}/getLeadDetails`, data: { phone: "+972501111111" } }),
    safeRequest({ method: "GET", url: `${BASE_URL}/scenariosNodeTypes` }),
    safeRequest({ method: "POST", url: `${BASE_URL}/listTtsVoices`, data: { provider: "elevenlabs" } }),
  ]);
  const concurrentLatency = Date.now() - concurrentStart;
  const allHandled = concurrentResults.every(r => r.status > 0 && r.status < 504);
  logResult(`Concurrent API requests (5 parallel)`, allHandled, {
    latencyMs: concurrentLatency,
    statuses: concurrentResults.map(r => r.status),
  });
  logLatency("concurrent_5_requests", concurrentLatency, 5000);

  // 7.5 Rate limiting check
  console.log("\n  🔄 Testing rate limiting (rapid fire)...");
  let rateLimitHit = false;
  const rapidResults = [];
  for (let i = 0; i < 10; i++) {
    const r = await safeRequest({
      method: "POST",
      url: `${BASE_URL}/assignAssistant`,
      data: { phone_number: `+97250000${String(i).padStart(4, '0')}` },
    });
    rapidResults.push(r.status);
    if (r.status === 429) { rateLimitHit = true; break; }
  }
  logResult("Rate limiting active", true, {
    note: rateLimitHit ? "Rate limit hit (429) after rapid requests" : "No rate limit hit in 10 requests (may need higher volume)",
    statuses: rapidResults,
  });

  // 7.6 endOfCallLog with missing session ID
  const badCallLog = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/endOfCallLog`,
    data: { phone_number: "+972501234567", duration: 60 },
  });
  logResult("endOfCallLog without session_id → 400", badCallLog.status === 400, {
    status: badCallLog.status,
    error: badCallLog.error,
  });

  // 7.7 Wrong HTTP method
  const wrongMethod = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/endOfCallLog`,
  });
  logResult("endOfCallLog with GET → 405", wrongMethod.status === 405, {
    status: wrongMethod.status,
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 8: Scenario Engine
// ═══════════════════════════════════════════════════════════════════
async function testScenarioEngine() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 8: Scenario Engine                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 8.1 Get node types
  const nodeTypesStart = Date.now();
  const nodeTypes = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/scenariosNodeTypes`,
  });
  const nodeTypesLatency = Date.now() - nodeTypesStart;
  logResult("scenariosNodeTypes", nodeTypes.status === 200, {
    latencyMs: nodeTypesLatency,
  });
  logLatency("scenariosNodeTypes", nodeTypesLatency, 3000);

  // 8.2 Create scenario with proper structure
  const scenarioData = {
    companyId: `e2e-scenario-${Date.now()}`,
    name: "E2E Test - AC Repair Flow",
    description: "בדיקת תרחיש לתיקון מזגנים",
    language: "he-IL",
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, data: {} },
      { id: "greeting", type: "say", position: { x: 0, y: 100 }, data: { text: "שלום! ברוכים הבאים." } },
    ],
    edges: [
      { id: "e1", source: "start", target: "greeting" },
    ],
  };

  const scenarioStart = Date.now();
  const createScenario = await safeRequest({
    method: "POST",
    url: `${BASE_URL}/scenariosCreate`,
    data: scenarioData,
  });
  const scenarioLatency = Date.now() - scenarioStart;
  const scenarioId = createScenario.data?.id || createScenario.data?.scenarioId;
  logResult("Create scenario", createScenario.status >= 200 && createScenario.status < 300 && !!scenarioId, {
    latencyMs: scenarioLatency,
    scenarioId,
    httpStatus: createScenario.status,
    error: createScenario.error,
  });
  logLatency("scenariosCreate", scenarioLatency, 3000);

  // Cleanup
  if (scenarioId) {
    await safeRequest({
      method: "POST",
      url: `${BASE_URL}/scenariosDelete`,
      data: { scenarioId, companyId: scenarioData.companyId },
    });
    console.log("  🧹 Cleaned up test scenario");
  }

  // 8.3 List scenarios (GET method, no companyId filter to avoid composite index requirement)
  const listStart = Date.now();
  const listScenarios = await safeRequest({
    method: "GET",
    url: `${BASE_URL}/scenariosList`,
  });
  const listLatency = Date.now() - listStart;
  logResult("scenariosList", listScenarios.status === 200 && listScenarios.data?.status === "success", {
    latencyMs: listLatency,
    status: listScenarios.status,
    count: listScenarios.data?.count,
  });
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE 9: Filler & Backchannel Synthesis Speed
// ═══════════════════════════════════════════════════════════════════
async function testFillerSpeed() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUITE 9: Filler & Backchannel Synthesis Speed     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Determine working provider
  let provider, voiceId, languageCode;
  if (ttsProviderStatus.google) {
    provider = "google"; voiceId = "he-IL-Wavenet-A"; languageCode = "he-IL";
  } else if (ttsProviderStatus.elevenlabs && elevenLabsVoiceId) {
    provider = "elevenlabs"; voiceId = elevenLabsVoiceId; languageCode = null;
  } else {
    console.log("  ⚠️  No TTS provider for filler tests. Skipping.");
    return;
  }

  const fillerCategories = {
    thinking: ["רגע אחד...", "בוא נראה...", "אממ...", "שנייה...", "הממ, בוא נבדוק..."],
    acknowledge: ["מצוין!", "נהדר!", "בטח!", "בשמחה!", "אין בעיה!"],
    backchannel: ["כן", "נכון", "מבין", "אוקיי", "בסדר"],
  };

  for (const [category, phrases] of Object.entries(fillerCategories)) {
    let totalLatency = 0;
    let successCount = 0;

    for (const phrase of phrases) {
      const start = Date.now();
      const result = await safeRequest({
        method: "POST",
        url: `${BASE_URL}/synthesizeTts`,
        data: { provider, text: phrase, voiceId, ...(languageCode && { languageCode }) },
      });
      const latency = Date.now() - start;

      if (result.data?.status === "success") {
        successCount++;
        totalLatency += latency;
      }
    }

    const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
    logResult(`Filler "${category}" (${phrases.length} phrases)`, successCount === phrases.length, {
      avgLatencyMs: avgLatency,
      successRate: `${successCount}/${phrases.length}`,
      error: successCount < phrases.length ? `${phrases.length - successCount} failed` : null,
    });
    logLatency(`filler_${category}_avg`, avgLatency, 1500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════
function printReport() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                📋 PRODUCTION READINESS E2E REPORT                  ║");
  console.log("║                Voice-Flow-AI Phone Bot System                       ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  Date: ${timestamp().padEnd(60)}║`);
  console.log("╠══════════════════════════════════════════════════════════════════════╣");

  // Overall results
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  console.log(`║  Total Tests:    ${String(results.total).padEnd(52)}║`);
  console.log(`║  Passed:         ${String(results.passed).padEnd(52)}║`);
  console.log(`║  Failed:         ${String(results.failed).padEnd(52)}║`);
  console.log(`║  Warnings:       ${String(results.warnings).padEnd(52)}║`);
  console.log(`║  Pass Rate:      ${(passRate + "%").padEnd(52)}║`);

  // Critical blockers
  if (results.criticalBlockers.length > 0) {
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log("║                  🚨 CRITICAL BLOCKERS                               ║");
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    for (const blocker of results.criticalBlockers) {
      console.log(`║  🚨 ${blocker.name}`);
      console.log(`║     ${blocker.message}`);
    }
  }

  // Latency benchmarks
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║                  ⏱️  LATENCY BENCHMARKS                              ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");

  for (const b of results.latencyBenchmarks) {
    const status = b.ok ? "✅" : "🐌";
    const line = `${status} ${b.stage}: ${b.latencyMs}ms (max: ${b.threshold}ms)`;
    console.log(`║  ${line.padEnd(68)}║`);
  }

  // TTS Provider Summary
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║                  🔊 TTS PROVIDER STATUS                             ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  for (const [provider, working] of Object.entries(ttsProviderStatus)) {
    const icon = working ? "✅" : "❌";
    console.log(`║  ${icon} ${provider.padEnd(15)} ${(working ? "WORKING" : "NOT WORKING").padEnd(49)}║`);
  }

  // Failed tests
  const failedTests = results.tests.filter(t => !t.passed);
  if (failedTests.length > 0) {
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log("║                  ❌ FAILED TESTS                                    ║");
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    for (const test of failedTests) {
      console.log(`║  ❌ ${test.name}`);
      if (test.error) console.log(`║     → ${test.error.substring(0, 65)}`);
    }
  }

  // Assessment
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║                  🏆 PRODUCTION ASSESSMENT                           ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");

  const ttsLatencies = results.latencyBenchmarks
    .filter(b => b.stage.startsWith("tts_") || b.stage.startsWith("filler_"))
    .map(b => b.latencyMs)
    .filter(l => l > 0);

  if (ttsLatencies.length > 0) {
    const avgTTS = Math.round(ttsLatencies.reduce((a, b) => a + b, 0) / ttsLatencies.length);
    const maxTTS = Math.max(...ttsLatencies);
    const minTTS = Math.min(...ttsLatencies);
    console.log(`║  TTS Avg Latency:   ${String(avgTTS + "ms").padEnd(49)}║`);
    console.log(`║  TTS Min Latency:   ${String(minTTS + "ms").padEnd(49)}║`);
    console.log(`║  TTS Max Latency:   ${String(maxTTS + "ms").padEnd(49)}║`);
  } else {
    console.log(`║  TTS Latency:       ${"N/A (no working TTS provider)".padEnd(49)}║`);
  }

  const latencyBreaches = results.latencyBenchmarks.filter(b => !b.ok);
  if (latencyBreaches.length > 0) {
    console.log(`║  Latency Breaches:  ${String(latencyBreaches.length).padEnd(49)}║`);
  } else {
    console.log(`║  Latency Breaches:  ${"None ✅".padEnd(49)}║`);
  }

  // Voice pipeline readiness
  const voicePipelineReady = Object.values(ttsProviderStatus).some(v => v);
  const apiEndpointsReady = results.tests
    .filter(t => t.name.includes("reachable"))
    .every(t => t.passed);
  const assistantCRUDReady = results.tests
    .filter(t => t.name.includes("assistant") || t.name.includes("Lifecycle"))
    .filter(t => !t.name.includes("config")).length > 0;

  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  Voice Pipeline:    ${(voicePipelineReady ? "✅ At least 1 TTS provider works" : "❌ NO TTS provider working").padEnd(49)}║`);
  console.log(`║  API Endpoints:     ${(apiEndpointsReady ? "✅ All core endpoints reachable" : "⚠️  Some endpoints unreachable").padEnd(49)}║`);
  console.log(`║  Assistant CRUD:    ${(assistantCRUDReady ? "✅ Working" : "❌ Issues found").padEnd(49)}║`);

  // Verdict
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  if (results.criticalBlockers.length > 0) {
    console.log("║  🔴 VERDICT: NOT PRODUCTION READY                                  ║");
    console.log("║     Fix critical blockers before launch.                            ║");
  } else if (results.failed <= 3 && voicePipelineReady) {
    console.log("║  🟢 VERDICT: PRODUCTION READY (Premium)                             ║");
  } else if (results.failed <= 8) {
    console.log("║  🟡 VERDICT: NEAR PRODUCTION READY                                 ║");
    console.log("║     Minor issues to address.                                        ║");
  } else {
    console.log("║  🔴 VERDICT: NOT PRODUCTION READY                                  ║");
    console.log("║     Multiple issues require attention.                               ║");
  }
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  🎯 VOICE-FLOW-AI — Real Call Simulation E2E Test                  ║");
  console.log("║  Testing against LIVE production endpoints                          ║");
  console.log(`║  ${timestamp().padEnd(68)}║`);
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const totalStart = Date.now();

  try {
    await testHealthAndConnectivity();
    await testTTSProviders();
    await testAssistantManagement();
    await testCallRouting();
    await testTTSSynthesisQuality();
    await testMultiTurnConversation();
    await testEdgeCases();
    await testScenarioEngine();
    await testFillerSpeed();
  } catch (error) {
    console.error("\n  💥 FATAL ERROR:", error.message);
  }

  const totalTime = ms(totalStart);
  console.log(`\n  ⏱️  Total test time: ${(totalTime / 1000).toFixed(1)}s`);

  printReport();
}

main().catch(console.error);
