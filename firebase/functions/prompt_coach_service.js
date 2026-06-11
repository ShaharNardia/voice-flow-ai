/**
 * Prompt Coach — AI assistant for improving voice-bot system prompts.
 *
 * The coach has full context about:
 *   - The assistant being edited (systemPrompt, language, voice, KB)
 *   - One or more call transcripts to analyse
 *   - A short analytics summary (success rate, common failure modes)
 *
 * It can:
 *   1. Diagnose what went wrong in a specific call
 *   2. Suggest targeted edits to the system prompt
 *   3. Apply an approved edit directly (calls assistantsUpdate internally)
 *
 * POST /promptCoachChat
 *   Body: { assistantId, messages: [{role, content}], callIds?: string[] }
 *   Returns: { reply: string, suggestedPrompt?: string, appliedPatch?: boolean }
 */

"use strict";

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {logger}    = require("firebase-functions");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {sanitizeObject, extractUidFromRequest} = require("./security_utils");
const axios = require("axios");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const REGION = "us-central1";
const CORS_OPTS = {
  cors: [
    "https://voiceflow-ai-202509231639.web.app",
    "https://voiceflow-ai-202509231639.firebaseapp.com",
    "https://voice.lancelotech.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
};

// ── LLM call (OpenAI gpt-4o — better at meta-analysis) ─────────────────────
async function callGpt4o(systemPrompt, messages, temperature = 0.4) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      temperature,
      max_tokens: 2000,
      messages: [
        {role: "system", content: systemPrompt},
        ...messages,
      ],
    },
    {
      headers: {"Authorization": `Bearer ${key}`, "Content-Type": "application/json"},
      timeout: 60000,
    },
  );
  return resp.data.choices[0].message.content || "";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Load admin turn-feedback annotations for a call. */
async function fetchTurnFeedback(db, callId) {
  try {
    const snap = await db.collection("call_turn_feedback")
      .where("callId", "==", callId).get();
    if (snap.empty) return "";
    const items = snap.docs.map((d) => d.data())
      .sort((a, b) => a.turnIndex - b.turnIndex);
    const lines = items
      .filter((f) => f.rating === "bad" || f.correction)
      .map((f) => {
        const parts = [`Turn ${f.turnIndex}: rated=${f.rating || "?"}`];
        if (f.correction) parts.push(`Admin correction: "${f.correction}"`);
        return parts.join(". ");
      });
    return lines.length ? `\n\n## Admin feedback on specific turns\n${lines.join("\n")}` : "";
  } catch (_) { return ""; }
}

/** Pull a call_session doc and render its transcript as readable text. */
async function fetchCallTranscript(db, callId) {
  try {
    const snap = await db.collection("call_sessions").doc(callId).get();
    if (!snap.exists) return `(Call ${callId} not found)`;
    const d = snap.data() || {};
    const hist = d.conversationHistory || [];
    const lines = hist
      .filter((m) => m.content)
      .map((m) => `[${m.role === "assistant" ? "Bot" : "User"}]: ${m.content}`)
      .join("\n");
    const meta = [
      `Call ID: ${callId}`,
      `Duration: ${d.callDuration || d.duration || "?"}s`,
      `Status: ${d.status || "?"}`,
      `Date: ${d.createdAt ? new Date(d.createdAt.toMillis()).toISOString().slice(0, 16) : "?"}`,
      d.nlpearlConversationStatusLabel ? `Outcome: ${d.nlpearlConversationStatusLabel}` : "",
    ].filter(Boolean).join(" | ");
    return `--- ${meta} ---\n${lines || "(no transcript)"}`;
  } catch (e) {
    return `(Error fetching call ${callId}: ${e.message})`;
  }
}

/** Pull the last N calls for this assistant and summarise outcomes. */
async function fetchRecentAnalytics(db, assistantId, n = 20) {
  try {
    const snap = await db.collection("call_sessions")
      .where("assistantId", "==", assistantId)
      .orderBy("createdAt", "desc")
      .limit(n)
      .get();
    if (snap.empty) return "No recent calls found.";
    const rows = snap.docs.map((d) => d.data());
    const total = rows.length;
    const statusCounts = {};
    for (const r of rows) {
      const s = r.status || r.nlpearlConversationStatusLabel || "unknown";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    const avgDur = Math.round(rows.reduce((a, r) => a + (r.callDuration || r.duration || 0), 0) / total);
    const lines = Object.entries(statusCounts).map(([s, c]) => `  ${s}: ${c}/${total}`).join("\n");
    return `Last ${total} calls:\nAvg duration: ${avgDur}s\nStatus breakdown:\n${lines}`;
  } catch (e) {
    return `(Analytics unavailable: ${e.message})`;
  }
}

/** Build the coach system prompt — the meta-prompt that drives the LLM. */
function buildCoachSystem(assistant, transcripts, analytics) {
  const lang = assistant.language || "he-IL";
  const isHebrew = lang.startsWith("he");

  return `You are an expert voice-AI prompt engineer and conversation designer.
Your job is to help improve the system prompt for a voice bot, based on real call transcripts and analytics.

## The assistant being reviewed
Name: ${assistant.name || assistant.assistantName || "Unnamed"}
Language: ${lang}
Voice provider: ${assistant.voiceProvider || (assistant.realtimeEnabled ? "openai-realtime" : "classic")}

## Current system prompt
\`\`\`
${assistant.systemPrompt || "(empty)"}
\`\`\`

## Recent analytics
${analytics}

## Call transcripts under review
${transcripts}

## Your capabilities
1. **Diagnose** — identify exactly what went wrong in a call (double responses, hallucinations, wrong scope, missing instructions, etc.)
2. **Suggest** — propose specific, targeted edits to the system prompt to fix each issue
3. **Rewrite** — if asked, produce a complete improved version of the system prompt
4. **Apply** — if the user types "apply" or "save this", output the final prompt in a code block tagged \`\`\`APPLY_PROMPT\n...\n\`\`\` so the UI can detect and save it automatically

## Rules
- Be direct and specific. Name the exact turn number that failed.
- When suggesting edits, show a before/after diff in plain text.
- ${isHebrew ? "The assistant speaks Hebrew. Keep the system prompt in Hebrew." : "Match the language of the existing prompt."}
- Keep prompts concise — shorter prompts are more reliable for voice bots.
- Never invent call data. Only reference what is in the transcripts above.
- When you write the final prompt for saving, put it inside \`\`\`APPLY_PROMPT ... \`\`\` — nothing else inside that block.`;
}

// ── Turn feedback: save inline annotation on a specific assistant turn ────────

exports.saveTurnFeedback = onRequest(
  {region: REGION, ...CORS_OPTS},
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({error: "POST required"}); return; }
    try {
      const {callId, turnIndex, rating, correction, callSessionId} = req.body || {};
      if (!callId || turnIndex === undefined) {
        res.status(400).json({error: "callId + turnIndex required"}); return;
      }
      // rating: "good" | "bad" | "neutral"
      // correction: free-text "what the bot should have said"
      const db = getFirestore();
      const docId = `${callId}_t${turnIndex}`;
      await db.collection("call_turn_feedback").doc(docId).set({
        callId,
        callSessionId: callSessionId || callId,
        turnIndex: Number(turnIndex),
        rating: rating || null,
        correction: correction || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      res.json({ok: true, id: docId});
    } catch (err) {
      logger.error("saveTurnFeedback error", err);
      res.status(500).json({error: err.message});
    }
  },
);

// ── Main endpoint ─────────────────────────────────────────────────────────────

exports.promptCoachChat = onRequest(
  {region: REGION, memory: "512MiB", timeoutSeconds: 120, ...CORS_OPTS, secrets: [OPENAI_API_KEY]},
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") {
      res.status(405).json({error: "POST required"});
      return;
    }

    try {
      const uid = await extractUidFromRequest(req);
      const payload = sanitizeObject(req.body || {});
      const {assistantId, messages, callIds} = payload;

      if (!assistantId) {
        res.status(400).json({error: "assistantId required"});
        return;
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({error: "messages array required"});
        return;
      }

      const db = getFirestore();

      // 1) Load assistant
      const aDoc = await db.collection("assistants").doc(assistantId).get();
      if (!aDoc.exists) {
        res.status(404).json({error: "Assistant not found"});
        return;
      }
      const assistant = {id: assistantId, ...aDoc.data()};

      // Ownership check
      if (uid && assistant.ownerId && assistant.ownerId !== uid) {
        const userDoc = await db.collection("users").doc(uid).get();
        const role = userDoc.exists ? userDoc.data().role : null;
        if (role !== "admin" && role !== "super_admin") {
          res.status(403).json({error: "Forbidden"});
          return;
        }
      }

      // 2) Fetch call transcripts (up to 3 most recent + any explicitly requested)
      const callIdsToFetch = Array.isArray(callIds) && callIds.length > 0
        ? callIds.slice(0, 5)
        : [];

      // Always include the 3 most recent calls for context
      if (callIdsToFetch.length === 0) {
        try {
          const recent = await db.collection("call_sessions")
            .where("assistantId", "==", assistantId)
            .orderBy("createdAt", "desc")
            .limit(3)
            .get();
          recent.docs.forEach((d) => {
            if (!callIdsToFetch.includes(d.id)) callIdsToFetch.push(d.id);
          });
        } catch (_) { /* no index yet — skip */ }
      }

      const [transcripts, analytics, feedbackBlock] = await Promise.all([
        Promise.all(callIdsToFetch.map((id) => fetchCallTranscript(db, id)))
          .then((ts) => ts.join("\n\n") || "No calls available yet."),
        fetchRecentAnalytics(db, assistantId),
        // Merge all feedback across the fetched calls
        Promise.all(callIdsToFetch.map((id) => fetchTurnFeedback(db, id)))
          .then((blocks) => blocks.join("")),
      ]);

      // 3) Call the coach LLM
      const systemPrompt = buildCoachSystem(assistant, transcripts + feedbackBlock, analytics);
      const llmMessages = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({role: m.role, content: String(m.content || "")}));

      const reply = await callGpt4o(systemPrompt, llmMessages);

      // 4) Detect APPLY_PROMPT block — if present, save it automatically
      const applyMatch = reply.match(/```APPLY_PROMPT\n([\s\S]*?)```/);
      let appliedPatch = false;
      let suggestedPrompt = null;

      if (applyMatch) {
        suggestedPrompt = applyMatch[1].trim();
      }

      // Auto-apply if message explicitly requests it
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      const autoApply = /\b(apply|save|update the prompt|שמור|החל|עדכן)\b/i.test(lastUserMsg);
      if (autoApply && suggestedPrompt) {
        await db.collection("assistants").doc(assistantId).update({
          systemPrompt: suggestedPrompt,
          updatedAt: FieldValue.serverTimestamp(),
        });
        appliedPatch = true;
        logger.info(`[PromptCoach] Auto-applied prompt update for ${assistantId}`);
      }

      // 5) Persist chat session for audit
      await db.collection("prompt_coach_sessions").add({
        assistantId,
        uid: uid || null,
        messages,
        reply,
        suggestedPrompt: suggestedPrompt || null,
        appliedPatch,
        createdAt: FieldValue.serverTimestamp(),
      });

      res.json({reply, suggestedPrompt, appliedPatch});
    } catch (err) {
      logger.error("promptCoachChat error", err);
      res.status(500).json({error: err.message});
    }
  },
);
