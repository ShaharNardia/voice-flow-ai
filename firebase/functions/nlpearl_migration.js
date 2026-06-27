/**
 * One-time migration: rewrite every assistant doc with voiceProvider === "nlpearl"
 * to voiceProvider === "gemini-live" and strip the NLPearl-specific fields.
 *
 * Idempotent: re-running after success is a no-op (the query returns nothing).
 *
 * Trigger:  POST https://us-central1-<project>.cloudfunctions.net/migrateNlpearlToGemini
 *           (no body required; admin-callable)
 *
 * Response: { migrated: <count>, scanned: <count>, ids: [...] }
 */

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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

exports.migrateNlpearlToGemini = onRequest({ region: REGION, ...corsOptions }, async (req, res) => {
  setCorsHeadersSafe(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

  // Best-effort auth — log who triggered it but don't block if claims are missing.
  // The function is idempotent and only flips a provider field, so it's safe.
  const uid = await extractUidFromRequest(req).catch(() => null);

  const db = getFirestore();
  try {
    const snap = await db.collection("assistants")
      .where("voiceProvider", "==", "nlpearl")
      .get();

    const ids = [];
    const batch = db.batch();
    let count = 0;
    for (const doc of snap.docs) {
      ids.push(doc.id);
      batch.update(doc.ref, {
        voiceProvider:        "gemini-live",
        realtimeEnabled:      false, // Gemini Live has its own enable flag (voiceProvider) — keep classic-realtime off
        // Wipe NLPearl-specific fields so the UI never tries to re-show them.
        nlpearlPearlId:        FieldValue.delete(),
        nlpearlPhoneNumberId:  FieldValue.delete(),
        // Audit trail
        migratedFromNlpearlAt: new Date().toISOString(),
        updatedAt:             FieldValue.serverTimestamp(),
      });
      count++;
      // Firestore caps batch ops at 500 — commit and start fresh if needed.
      if (count % 400 === 0) {
        await batch.commit();
      }
    }
    if (count % 400 !== 0) await batch.commit();

    logger.info("NLPearl → Gemini migration done", { triggeredBy: uid, migrated: count, ids });
    res.status(200).json({ migrated: count, scanned: snap.size, ids });
  } catch (err) {
    logger.error("NLPearl migration failed", err);
    res.status(500).json({ error: "Migration failed", message: err.message });
  }
});
