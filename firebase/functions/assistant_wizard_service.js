/**
 * Assistant Wizard Service â€” chat-based "describe your business in plain
 * English and I'll build an assistant" flow.
 *
 * Pattern: client POSTs the running message list; server appends the LLM's
 * reply (which may contain tool calls that accumulate state in Firestore)
 * and returns the new message + current accumulated config. When the model
 * calls `finalize`, we return a ready-to-create assistant config object
 * that the frontend then passes to the existing `assistantsCreate` endpoint.
 *
 * Feature-gated on `cap.assistantWizard`.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger} = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const axios = require("axios");
const {extractUidFromRequest} = require("./security_utils");
const {requireFeature} = require("./feature_gate");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const corsOptions = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

const WIZARD_TOOLS = [
  {
    type: "function",
    function: {
      name: "setBasics",
      description: "Record core assistant identity. Call this early once you know the business name and what the assistant is for.",
      parameters: {
        type: "object",
        properties: {
          name: {type: "string", description: "Assistant display name (e.g. 'Receptionist Sara')"},
          companyName: {type: "string"},
          language: {type: "string", description: "BCP-47 language code (e.g. en-US, he-IL, es-ES, ar)"},
          firstMessage: {type: "string", description: "The greeting the assistant says at the start of each call"},
          industry: {type: "string", description: "Short industry label, e.g. 'dentist', 'plumbing', 'real estate'"},
        },
        required: ["name", "language", "firstMessage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setPersonality",
      description: "Record the voice, tone, and system prompt. Call after you understand the persona.",
      parameters: {
        type: "object",
        properties: {
          voice: {type: "string", description: "Voice ID â€” one of: alloy, echo, fable, onyx, nova, shimmer, coral, ash, sage, verse"},
          tone: {type: "string", description: "Short tone label: 'warm', 'professional', 'casual', 'empathetic', etc."},
          systemPrompt: {type: "string", description: "Full system prompt for the assistant (5-20 lines). Include role, rules, and any do/don'ts."},
        },
        required: ["voice", "systemPrompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enableTool",
      description: "Enable a specific capability on the assistant. Call for each tool the customer needs.",
      parameters: {
        type: "object",
        properties: {
          toolId: {type: "string", enum: ["send_email", "send_whatsapp", "transfer_call", "book_appointment", "create_appointment"]},
          reason: {type: "string", description: "Why this tool is needed for this business"},
        },
        required: ["toolId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize",
      description: "Call this ONLY when all required info is collected and the user confirms they're happy with the summary. This signals the UI to show a 'Create assistant' button.",
      parameters: {type: "object", properties: {}},
    },
  },
];

const WIZARD_SYSTEM = `You are a friendly onboarding assistant for VoiceFlow AI â€” a phone-bot platform. Your job is to interview the user about their business in plain language and use the provided tools to fill out a phone-bot configuration.

Rules:
- Ask ONE question at a time; keep it short and conversational.
- Call setBasics as soon as you know the business name, language, and greeting.
- Call setPersonality once you understand the role. Suggest a good voice based on the audience (coral/shimmer for warm customer-facing, ash/onyx for serious/professional).
- Call enableTool for each capability you detect from the conversation. Default to enabling transfer_call on anything customer-facing. Enable book_appointment if they mention scheduling.
- Write the systemPrompt IN ENGLISH even if the assistant speaks another language.
- When you have basics + personality + at least one tool + the user confirms the summary, call finalize.
- Keep messages under 2 short sentences.`;

const WIZARD_SYSTEM_VOICE_SUFFIX = `

VOICE MODE — the user is speaking and will hear your reply spoken aloud:
- Never use markdown, bullets, code blocks, or symbols (* _ # \`).
- Spell out numbers, URLs, and acronyms phonetically when natural.
- Keep replies to one short spoken sentence whenever possible.
- Ask one question; pause and listen.`;

async function callOpenAi(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      messages,
      tools: WIZARD_TOOLS,
      temperature: 0.6,
      max_tokens: 500,
    },
    {headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"}, timeout: 30000},
  );
  return resp.data.choices[0];
}

function applyToolCall(state, name, args) {
  switch (name) {
    case "setBasics":
      state.basics = {...(state.basics || {}), ...args};
      break;
    case "setPersonality":
      state.personality = {...(state.personality || {}), ...args};
      break;
    case "enableTool":
      state.tools = state.tools || [];
      if (!state.tools.some((t) => t.toolId === args.toolId)) state.tools.push(args);
      break;
    case "finalize":
      state.finalized = true;
      break;
  }
}

/**
 * POST /wizardChat
 *   body: { sessionId?: string, userMessage: string }
 *   returns: { sessionId, reply: string, state: {...}, done: boolean }
 */
exports.wizardChat = onRequest({...corsOptions, secrets: [OPENAI_API_KEY]}, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({error: "Method not allowed"}); return; }
  const uid = await extractUidFromRequest(req);
  if (!uid) { res.status(401).json({error: "Unauthorized"}); return; }
  if (!(await requireFeature(req, res, uid, "cap.assistantWizard"))) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const userMessage = (body.userMessage || "").toString().slice(0, 4000);
    if (!userMessage) { res.status(400).json({error: "userMessage required"}); return; }
    const voiceMode = !!body.voiceMode;
    const db = getFirestore();

    let sessionId = body.sessionId;
    let history = [];
    let state = {basics: {}, personality: {}, tools: [], finalized: false};

    if (sessionId) {
      const snap = await db.collection("wizard_sessions").doc(sessionId).get();
      if (snap.exists && snap.data().ownerId === uid) {
        history = snap.data().history || [];
        state = snap.data().state || state;
      } else {
        sessionId = null;
      }
    }
    if (!sessionId) {
      const ref = db.collection("wizard_sessions").doc();
      sessionId = ref.id;
      await ref.set({
        ownerId: uid,
        history: [],
        state,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    history.push({role: "user", content: userMessage});

    // Up to 3 tool-loop iterations so the model can chain a couple of tool calls
    // before returning a plain text reply.
    let replyText = null;
    for (let i = 0; i < 4; i++) {
      const sysPrompt = voiceMode ? WIZARD_SYSTEM + WIZARD_SYSTEM_VOICE_SUFFIX : WIZARD_SYSTEM;
      const messages = [{role: "system", content: sysPrompt}, ...history];
      const choice = await callOpenAi(messages);
      const msg = choice?.message || {};
      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        replyText = msg.content || "";
        history.push({role: "assistant", content: replyText});
        break;
      }
      history.push({role: "assistant", content: msg.content || null, tool_calls: toolCalls});
      for (const tc of toolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* ignore */ }
        applyToolCall(state, tc.function?.name, args);
        history.push({role: "tool", tool_call_id: tc.id, content: "ok"});
      }
      if (state.finalized) {
        replyText = msg.content || "All set! You can create the assistant whenever you're ready.";
        break;
      }
    }
    if (replyText === null) replyText = "Got it. What else should I know?";

    await db.collection("wizard_sessions").doc(sessionId).set({
      history: history.slice(-40), // cap at 40 messages
      state,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    // Build the assistant config that the client will POST to assistantsCreate.
    const assistantConfig = {
      name: state.basics?.name || "",
      assistantName: state.basics?.name || "",
      companyName: state.basics?.companyName || "",
      language: state.basics?.language || "en-US",
      firstMessage: state.basics?.firstMessage || "",
      voice: state.personality?.voice || "coral",
      systemPrompt: state.personality?.systemPrompt || "",
      industry: state.basics?.industry || "",
      tools: (state.tools || []).map((t) => t.toolId),
    };

    res.status(200).json({
      sessionId,
      reply: replyText,
      state,
      assistantConfig,
      done: !!state.finalized,
    });
  } catch (e) {
    logger.error("wizardChat failed", e?.response?.data || e);
    res.status(500).json({error: e.message || "Failed"});
  }
});
