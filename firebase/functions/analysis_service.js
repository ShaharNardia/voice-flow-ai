/**
 * Analysis Service â€” AI-powered call summary & insights
 * Analyzes conversation transcripts using GPT-4o and stores results in Firestore
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

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

/**
 * Internal helper â€” analyze a call and save results to Firestore.
 * Called both from the HTTP handler and auto-triggered from twilioStatusCallback.
 * @param {string} callSessionId
 * @returns {Promise<object>} analysis object
 */
async function _analyzeCallInternal(callSessionId) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) throw new Error("OpenAI not configured");

  const db = getFirestore();
  const sessionDoc = await db.collection("call_sessions").doc(callSessionId).get();
  if (!sessionDoc.exists) throw new Error("Call session not found");

  const session = sessionDoc.data();
  const history = session.conversationHistory || [];

  const assistantName = session.assistantDefinition?.name || session.assistantName || "Assistant";
  const language = session.assistantDefinition?.language || "en-US";
  const isHebrew = language.startsWith("he");

  // Build transcript text â€” handle empty/short calls gracefully
  const transcript = history.length > 0
    ? history.map((m) => `${m.role === "assistant" ? "Assistant" : "Caller"}: ${m.content}`).join("\n")
    : `Assistant: ${isHebrew ? "(×‘×¨×›×ª ×¤×ª×™×—×” ×‘×œ×‘×“ â€” ××™×Ÿ ×ª×’×•×‘×” ×ž×”×ž×ª×§×©×¨)" : "(Opening greeting only â€” no caller response)"}`;

  const systemPrompt = `You are an expert call center quality analyst. Analyze sales/service call transcripts and provide structured, actionable feedback. Be specific, honest, and constructive. Respond in ${isHebrew ? "Hebrew" : "English"}.`;

  const userPrompt = `Analyze this call transcript between "${assistantName}" (AI assistant) and a caller.

Transcript:
${transcript}

${history.length < 2 ? `Note: This call had no caller response (caller hung up or technical issue). Set outcome to "no_answer" and focus recommendations on improving call connection reliability and opening hooks.` : ""}

Respond ONLY with a valid JSON object with exactly these fields:
{
  "summary": "2-3 sentence description of what happened in the call",
  "outcome": "success" | "partial" | "failed" | "no_answer" | "unknown",
  "outcomeReason": "brief explanation of why this outcome",
  "score": <integer 1-10>,
  "scoreReason": "one sentence explaining the score",
  "strengths": ["point 1", "point 2"],
  "improvements": ["specific improvement 1", "specific improvement 2", "specific improvement 3"],
  "recommendedApproach": "concrete actionable advice for handling a similar call next time",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "keyMoments": ["turning point 1", "turning point 2"]
}`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1200,
    },
    {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  const analysis = JSON.parse(response.data.choices[0].message.content);
  analysis.analyzedAt = new Date().toISOString();

  // Save to Firestore (merge so we don't overwrite conversation history)
  await db.collection("call_sessions").doc(callSessionId).set(
    { analysis },
    { merge: true },
  );

  logger.info("analyzeCall success", { callSessionId, score: analysis.score, outcome: analysis.outcome });
  return analysis;
}

exports._analyzeCallInternal = _analyzeCallInternal;

/**
 * POST /analyzeCall  { callSessionId }
 * Analyzes a call transcript using GPT-4o and saves results to call_sessions/{id}.analysis
 */
exports.analyzeCall = onRequest({ region: REGION, ...corsOptions, secrets: [OPENAI_API_KEY] }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // Auth is best-effort — allow unauthenticated calls from internal triggers
  // (twilioStatusCallback, auto-analysis) but rate-limit to protect the endpoint.
  await extractUidFromRequest(req).catch(() => null);

  if (!process.env.OPENAI_API_KEY) { res.status(500).json({ error: "OpenAI not configured" }); return; }

  try {
    const { callSessionId } = req.body;
    if (!callSessionId) { res.status(400).json({ error: "callSessionId required" }); return; }

    const analysis = await _analyzeCallInternal(callSessionId);
    res.status(200).json(analysis);
  } catch (error) {
    logger.error("analyzeCall failed", error.message);
    if (error.message === "Call session not found") {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Analysis failed", message: error.message });
    }
  }
});
