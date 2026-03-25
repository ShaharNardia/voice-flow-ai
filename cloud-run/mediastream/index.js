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

// ── Init ──────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp();
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

// ── Latency constants ─────────────────────────────────────────────────
const BARGE_IN_CONFIDENCE_THRESHOLD = 0.35;
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

// ── Health check ──────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({status: "ok", ts: Date.now()}));

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
  const language = assistant.language || "en-US";
  const voiceId = assistant.voice || "Google.en-US-Neural2-F";

  // Normalise for Twilio Say
  const sayLanguage = language.startsWith("he") ? "he-IL"
    : language.startsWith("ar") ? "ar-XA"
    : "en-US";

  // Deepgram language code (base code)
  const deepgramLang = language.startsWith("he") ? "he"
    : language.startsWith("ar") ? "ar"
    : "en";

  let callSid = null; // extracted from the Twilio 'start' event
  let deepgramConnection = null;
  let deepgramReady = false;
  let audioPacketCount = 0;
  let isBotSpeaking = false;
  let lastInterimTime = 0;
  let transcriptStartTime = Date.now();
  let llmRunning = false; // prevent concurrent LLM calls on rapid final transcripts
  let pendingTranscriptTimer = null; // debounce: wait after final to catch mid-sentence pauses
  let pendingTranscriptText = ""; // accumulated text during debounce window
  let knowledgePrefetch = null; // {query, promise} — started on high-confidence interim
  let callEnding = false; // set true after goodbye TwiML sent — stops further transcript processing

  // Pre-check: does this assistant have any knowledge chunks?
  // Cached once at session open to avoid embedding API calls on every turn.
  let hasKnowledgeBase = false;
  if (assistantId) {
    try {
      const kSnap = await db.collection("knowledge_chunks")
        .where("assistantId", "==", assistantId)
        .limit(1)
        .get();
      hasKnowledgeBase = !kSnap.empty;
      console.log(`[${callSessionId}] Knowledge base: ${hasKnowledgeBase ? "YES" : "none"}`);
    } catch (_) {}
  }

  // ── Caller identification: look up call history by phone number ────
  let callerName = data.leadName || null;
  let callerHistory = [];
  const leadNumber = data.leadNumber || null;
  if (leadNumber) {
    try {
      const prevSnap = await db.collection("call_sessions")
        .where("leadNumber", "==", leadNumber)
        .orderBy("createdAt", "desc")
        .limit(4)
        .get();
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
    } catch (e) {
      console.warn(`[${callSessionId}] Caller lookup failed:`, e.message);
    }
  }

  // ── In-memory conversation history ────────────────────────────────
  // Read from Firestore once at session start; maintained in-memory per turn
  // to avoid stale reads caused by the non-blocking Firestore write.
  let sessionHistory = data.conversationHistory || [];

  // ── Cache company data once at session start (avoids per-turn Firestore read) ──
  const companyId = data.companyId || null;
  let companyData = {};
  if (companyId) {
    try {
      const cd = await db.collection("Company").doc(companyId).get();
      if (cd.exists) companyData = cd.data();
    } catch (_) {}
  }

  // ── Send TwiML to Twilio via REST API update ──────────────────────
  const sendTwiML = async (twimlXml, reason = "response") => {
    if (!twilioClient || !callSid) return false;
    try {
      await twilioClient.calls(callSid).update({twiml: twimlXml});
      return true;
    } catch (err) {
      console.error(`[${callSessionId}] TwiML send failed (${reason}):`, err.message);
      return false;
    }
  };

  // ── Build TwiML for <Say> (stream persists from initial webhook TwiML) ──

  // NOTE: We do NOT include <Start><Stream> in response TwiML.
  // Twilio docs: "Existing streams are not stopped when new TwiML is returned."
  // The stream started in the initial webhook TwiML persists through <Say>+<Pause> updates.
  // Adding <Start><Stream> in responses creates duplicate WebSocket connections.
  const makeSayTwiML = (text) => {
    const r = new twilio.twiml.VoiceResponse();
    r.say({voice: voiceId, language: sayLanguage}, text);
    r.pause({length: "120"}); // Keep call alive while existing stream captures user audio
    return r.toString();
  };

  const makeBargeInTwiML = () => {
    const r = new twilio.twiml.VoiceResponse();
    r.pause({length: "120"}); // Interrupt current <Say>, existing stream continues
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
    return {
      text: choice.message.content || null,
      toolCalls: choice.message.tool_calls || [],
      tokensUsed: resp.data.usage?.total_tokens || 0,
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
      ? `CRITICAL: You MUST respond ONLY in Hebrew. Every single word must be in Hebrew. Never use English.
Sound like a natural, warm Israeli service rep — friendly, direct, casual.

Rules:
- Max 1–2 short sentences per reply.
- Use casual Hebrew openers: "בטח!", "מעולה!", "אשמח לעזור!", "רגע אחד"
- Never use formal language. Use everyday spoken Hebrew.
- Match caller energy. Fast caller → fast reply.
- Never ask for information already given in this conversation.
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

Today is ${dateStr}. When booking appointments always state the specific date (day + month + year) AND time.`;

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
    }
    return "Done";
  }

  // ── Main transcript handler (called by Deepgram events) ────────────
  const onTranscript = async ({text, isFinal, confidence}) => {
    // Stop all processing once goodbye TwiML has been sent (call is ending)
    if (callEnding) return;

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

    const sttLatency = Date.now() - transcriptStartTime;
    console.log(`[${callSessionId}] Final: "${text}" (stt ${sttLatency}ms)`);
    llmRunning = true;

    // Send filler phrase immediately — eliminates silence while LLM processes (~1-3s)
    const FILLERS = {
      he: ["רגע...", "כן...", "אוקיי...", "אה..."],
      en: ["Sure...", "Got it...", "One moment...", "Okay..."],
      ar: ["لحظة...", "حسنًا...", "نعم..."],
    };
    const fillerList = FILLERS[deepgramLang] || FILLERS.en;
    const filler = fillerList[Math.floor(Math.random() * fillerList.length)];
    sendTwiML(makeSayTwiML(filler), "filler").catch(() => {});

    // Detect explicit goodbye from caller — will trigger auto-hangup after bot's reply
    const GOODBYE_RE = /\b(bye|goodbye|good\s*bye|see\s*you|that'?s?\s*all|thanks?\s*(that'?s?\s*all|bye|goodbye)|thank\s*you\s*(bye|goodbye)|shalom|להתראות|ביי|זהו|תודה\s*רבה)\b/i;
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

      let systemPrompt = buildSystemPrompt(assistant, companyData, {leadNumber, callerName, callerHistory});

      // Inject knowledge base context if available
      if (knowledgeChunks.length > 0) {
        systemPrompt += "\n\n## Reference Information\n" +
          knowledgeChunks.map((c) => c.content).join("\n\n---\n\n");
        console.log(`[${callSessionId}] Injected ${knowledgeChunks.length} knowledge chunks`);
      }

      const llmHistory = history.map((m) => ({role: m.role, content: m.content}));

      // Add user turn to history
      history.push({role: "user", content: text, timestamp: new Date()});

      // LLM call with tools
      const llmStart = Date.now();
      const llmResult = await callLLM(systemPrompt, text, llmHistory, {
        tools: AGENT_TOOLS,
        maxTokens: 150,
        temperature: 0.8,
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
            {maxTokens: 60, temperature: 0.8},
          );
          aiText = confirmResult.text || "Done! Anything else I can help with?";
        }
      }

      aiText = aiText || "Is there anything else I can help you with?";
      history.push({role: "assistant", content: aiText, timestamp: new Date()});

      const shouldHangup = executeTool._shouldHangup || callerSaidGoodbye;

      if (shouldHangup) {
        // Block all further transcript processing while Twilio plays goodbye and hangs up
        callEnding = true;
        // Say goodbye and hang up in a single TwiML — no gap between goodbye and disconnect
        const r = new twilio.twiml.VoiceResponse();
        r.say({voice: voiceId, language: sayLanguage}, aiText);
        r.hangup();
        await sendTwiML(r.toString(), "goodbye-hangup");
        console.log(`[${callSessionId}] Hanging up after goodbye`);
      } else {
        await sendTwiML(makeSayTwiML(aiText), "llm-response");
      }
      isBotSpeaking = !shouldHangup;

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
      transcriptStartTime = Date.now();
    } catch (err) {
      console.error(`[${callSessionId}] Transcript processing error:`, err.message);
      const recovery = deepgramLang === "he" ? "סליחה, רגע אחד בבקשה..." : "Sorry, one moment please...";
      await sendTwiML(makeSayTwiML(recovery), "error-recovery").catch(() => {});
    } finally {
      llmRunning = false;
    }
  };

  // ── Deepgram connection ────────────────────────────────────────────
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  // nova-2 does not support Hebrew or Arabic. Use nova-3 for those languages.
  // IMPORTANT: Deepgram requires "nova-3" (not "nova-3-general") and "he" (not "he-IL").
  const deepgramModel = (deepgramLang === "he" || deepgramLang === "ar") ? "nova-3" : "nova-2";
  const dgOpts = {
    model: deepgramModel,
    language: deepgramLang === "en" ? "en-US" : deepgramLang,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    smart_format: true,
    punctuate: true,
    interim_results: true,
    endpointing: 200,
  };
  // utterance_end_ms is NOT supported for nova-3 + non-English languages
  if (deepgramModel === "nova-2") {
    dgOpts.utterance_end_ms = 800;
  }
  console.log(`[${callSessionId}] Deepgram config: model=${dgOpts.model} lang=${dgOpts.language}`);
  deepgramConnection = deepgram.listen.live(dgOpts);

  // Deepgram SDK v3 uses "Results" (not "transcript") for live transcription events
  deepgramConnection.on("Results", (evt) => {
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
        // Final: debounce 300ms to catch mid-sentence pauses before firing LLM
        if (pendingTranscriptTimer) clearTimeout(pendingTranscriptTimer);
        pendingTranscriptText += (pendingTranscriptText ? " " : "") + transcript.trim();
        pendingTranscriptTimer = setTimeout(() => {
          const combined = pendingTranscriptText;
          pendingTranscriptText = "";
          pendingTranscriptTimer = null;
          onTranscript({text: combined, isFinal: true, confidence}).catch(console.error);
        }, 300);
      }
    } else if (isFinal) {
      console.log(`[${callSessionId}] DG final (empty) conf=${confidence.toFixed(2)}`);
    }
  });

  deepgramConnection.on("open", () => {
    deepgramReady = true;
    console.log(`[${callSessionId}] Deepgram connected OK`);
  });

  deepgramConnection.on("error", (err) => {
    console.error(`[${callSessionId}] Deepgram error:`, err.message || JSON.stringify(err));
  });

  deepgramConnection.on("close", () => {
    console.log(`[${callSessionId}] Deepgram closed`);
  });

  deepgramConnection.on("SpeechStarted", () => {
    console.log(`[${callSessionId}] Deepgram: speech_started`);
  });

  deepgramConnection.on("UtteranceEnd", (evt) => {
    console.log(`[${callSessionId}] Deepgram: utterance_end`);
  });

  deepgramConnection.on("Metadata", (meta) => {
    console.log(`[${callSessionId}] Deepgram metadata: requestId=${meta?.request_id}`);
  });

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
    } else if (parsed.event === "media") {
      // Inbound audio from caller — forward to Deepgram
      if (parsed.media?.track === "inbound" && parsed.media?.payload) {
        audioPacketCount++;
        const audio = Buffer.from(parsed.media.payload, "base64");
        if (audioPacketCount === 1 || audioPacketCount === 50 || audioPacketCount % 200 === 0) {
          console.log(`[${callSessionId}] Audio pkt #${audioPacketCount}, deepgramReady=${deepgramReady}, bytes=${audio.length}`);
        }
        if (deepgramReady && deepgramConnection?.send) deepgramConnection.send(audio);
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

  ws.on("close", () => {
    console.log(`[${callSessionId}] WebSocket closed`);
    if (pendingTranscriptTimer) { clearTimeout(pendingTranscriptTimer); pendingTranscriptTimer = null; }
    if (deepgramConnection?.finish) {
      try { deepgramConnection.finish(); } catch (_) {}
    }
    if (callSid) activeConnections.delete(callSid);
  });

  ws.on("error", (err) => {
    console.error(`[${callSessionId}] WebSocket error:`, err.message);
  });
});

// ── Start server ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Twilio Media Stream service listening on :${PORT}`);
});
