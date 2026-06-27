/**
 * ElevenLabs Voice Cloning — backend proxy + Firestore bookkeeping.
 *
 * Endpoints (all admin/authenticated, scoped by companyId):
 *   POST   /elevenlabsCloneVoice    — multipart upload: consent audio + sample audio
 *   GET    /elevenlabsListVoices    — return cloned voices for the caller's company
 *   POST   /elevenlabsDeleteVoice   — cascade delete: ElevenLabs + Firestore + Storage
 *   POST   /elevenlabsPreviewVoice  — synth a test phrase, return base64 audio
 *
 * Firestore schema:
 *   custom_voices/{voiceId} = {
 *     voiceId,           // ElevenLabs voice_id (also the doc id)
 *     name,              // human label, e.g. "John's voice"
 *     companyId,         // multi-tenant scope
 *     createdBy,         // uid
 *     consentDate,       // ISO 8601 — when the consent recording was uploaded
 *     consentAudioPath,  // GCS path: consent-recordings/{voiceId}.webm
 *     consentAttestation,// the exact phrase the speaker had to read
 *     assistantIds:[],   // assistants currently using this voice
 *     createdAt,
 *     deletedAt,         // soft-deleted if non-null
 *   }
 *
 * Legal / GDPR notes:
 *   - Consent recording is archived to GCS for legal audit. ElevenLabs also
 *     stores the sample on their side as the voice model.
 *   - Delete must cascade to ElevenLabs (their /voices/{id} DELETE), Firestore,
 *     AND the consent recording in GCS. We log every deletion to an audit doc.
 *   - Voice = biometric data under GDPR. Customer must be able to delete on
 *     request (right to erasure). This service supports that via DELETE.
 */

"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const axios = require("axios");
const Busboy = require("busboy");
const { extractUidFromRequest, setCorsHeadersSafe } = require("./security_utils");

const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");

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

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey() {
  // Reading both the secret AND the env var so this works locally with .env too
  const k = (ELEVENLABS_API_KEY.value() || process.env.ELEVENLABS_API_KEY || "").replace(/\s/g, "");
  if (!k) throw new Error("ELEVENLABS_API_KEY not configured");
  return k;
}

async function authedUser(req, res) {
  const uid = await extractUidFromRequest(req).catch(() => null);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const db = getFirestore();
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) { res.status(403).json({ error: "User not found" }); return null; }
  const data = userSnap.data() || {};
  return {
    uid,
    companyId: data.companyId || data.uid || uid,
    role:      data.role      || "user",
  };
}

/**
 * Parse a multipart form-data body. Returns { files: {fieldName -> {buffer, mimeType, filename}}, fields: {name -> value} }.
 * Caps individual file size at 25MB (ElevenLabs limit).
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024, files: 5 } });
    const files = {};
    const fields = {};
    bb.on("file", (fieldName, stream, info) => {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("limit", () => reject(new Error(`File ${fieldName} exceeds 25MB limit`)));
      stream.on("end", () => {
        files[fieldName] = { buffer: Buffer.concat(chunks), mimeType: info.mimeType, filename: info.filename };
      });
    });
    bb.on("field", (name, val) => { fields[name] = val; });
    bb.on("error", reject);
    bb.on("finish", () => resolve({ files, fields }));
    if (req.rawBody) bb.end(req.rawBody);
    else req.pipe(bb);
  });
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /elevenlabsCloneVoice
 * Multipart fields:
 *   sampleFile       (required): the 60-90s voice sample (webm/mp3/wav)
 *   consentFile      (required): the 5-10s consent phrase recording
 *   name             (required): human label, e.g. "John's voice"
 *   consentAttestation (required): the exact phrase the speaker read
 *   description       (optional): freeform note for ElevenLabs labels
 * Returns: { voiceId, name }
 */
exports.elevenlabsCloneVoice = onRequest(
  { region: REGION, secrets: [ELEVENLABS_API_KEY], timeoutSeconds: 120, memory: "512MiB", ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

    const user = await authedUser(req, res);
    if (!user) return;

    let parsed;
    try { parsed = await parseMultipart(req); }
    catch (e) { res.status(400).json({ error: `Bad multipart: ${e.message}` }); return; }

    const { files, fields } = parsed;
    const sample  = files.sampleFile;
    const consent = files.consentFile;
    const name    = (fields.name || "").trim().slice(0, 80);
    const attestation = (fields.consentAttestation || "").trim().slice(0, 500);

    if (!sample)  { res.status(400).json({ error: "sampleFile is required" }); return; }
    if (!consent) { res.status(400).json({ error: "consentFile is required (legal compliance)" }); return; }
    if (!name)    { res.status(400).json({ error: "name is required" }); return; }
    if (!attestation || attestation.length < 20) {
      res.status(400).json({ error: "consentAttestation is required and must be the full phrase the speaker read" });
      return;
    }
    if (sample.buffer.length < 100_000) {
      res.status(400).json({ error: "Sample audio is too short — record at least 60 seconds" });
      return;
    }

    try {
      // ── 1. Upload sample to ElevenLabs → voice_id ──────────────────────
      const apiKey = getApiKey();
      const FormData = require("form-data");
      const form = new FormData();
      form.append("name", name);
      form.append("description", fields.description || `Cloned via voice.lancelotech.com on ${new Date().toISOString().slice(0,10)}`);
      form.append("labels", JSON.stringify({
        company: user.companyId,
        consentVerified: "true",
        consentDate: new Date().toISOString(),
      }));
      form.append("files", sample.buffer, {
        filename: sample.filename || "sample.webm",
        contentType: sample.mimeType || "audio/webm",
      });

      const elevenResp = await axios.post(`${ELEVEN_BASE}/voices/add`, form, {
        headers: { ...form.getHeaders(), "xi-api-key": apiKey },
        maxBodyLength: 50 * 1024 * 1024,
        timeout: 90_000,
      });

      const voiceId = elevenResp.data?.voice_id;
      if (!voiceId) throw new Error("ElevenLabs did not return a voice_id");

      // ── 2. Archive consent recording to GCS (legal audit) ─────────────
      const bucket = getStorage().bucket();
      const consentPath = `consent-recordings/${voiceId}.webm`;
      await bucket.file(consentPath).save(consent.buffer, {
        metadata: {
          contentType: consent.mimeType || "audio/webm",
          metadata: {
            companyId: user.companyId,
            uid: user.uid,
            voiceId,
            attestation,
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: false,
      });

      // ── 3. Save Firestore record ───────────────────────────────────────
      const db = getFirestore();
      await db.collection("custom_voices").doc(voiceId).set({
        voiceId,
        name,
        companyId:        user.companyId,
        createdBy:        user.uid,
        consentDate:      new Date().toISOString(),
        consentAudioPath: consentPath,
        consentAttestation: attestation,
        assistantIds:     [],
        provider:         "elevenlabs",
        createdAt:        FieldValue.serverTimestamp(),
      });

      logger.info("Voice cloned", { uid: user.uid, companyId: user.companyId, voiceId, name });
      res.status(201).json({ voiceId, name, provider: "elevenlabs" });
    } catch (e) {
      logger.error("elevenlabsCloneVoice failed", e.response?.data || e.message);
      const detail = e.response?.data?.detail || e.response?.data || e.message;
      res.status(500).json({ error: "Voice cloning failed", detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
    }
  }
);

/**
 * GET /elevenlabsListVoices
 * Returns the cloned voices for the caller's company.
 */
exports.elevenlabsListVoices = onRequest(
  { region: REGION, ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const user = await authedUser(req, res);
    if (!user) return;

    try {
      const db = getFirestore();
      let q = db.collection("custom_voices").where("companyId", "==", user.companyId);
      // Super-admins can see all voices if ?all=1
      if (user.role === "super_admin" && req.query.all === "1") {
        q = db.collection("custom_voices");
      }
      const snap = await q.get();
      const voices = snap.docs
        .map((d) => d.data())
        .filter((v) => !v.deletedAt)
        .map((v) => ({
          voiceId:        v.voiceId,
          name:           v.name,
          companyId:      v.companyId,
          consentDate:    v.consentDate,
          assistantIds:   v.assistantIds || [],
          createdAt:      v.createdAt?.toDate?.()?.toISOString?.() || null,
          provider:       v.provider || "elevenlabs",
        }));
      res.json(voices);
    } catch (e) {
      logger.error("elevenlabsListVoices failed", e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * POST /elevenlabsDeleteVoice  { voiceId }
 * Cascade delete: ElevenLabs + Firestore + GCS consent recording.
 * Records an audit entry in voice_deletion_audit/{voiceId}.
 */
exports.elevenlabsDeleteVoice = onRequest(
  { region: REGION, secrets: [ELEVENLABS_API_KEY], ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

    const user = await authedUser(req, res);
    if (!user) return;

    const { voiceId } = req.body || {};
    if (!voiceId) { res.status(400).json({ error: "voiceId required" }); return; }

    const db = getFirestore();
    const docRef = db.collection("custom_voices").doc(voiceId);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({ error: "Voice not found" }); return; }
    const v = snap.data();
    if (v.companyId !== user.companyId && user.role !== "super_admin") {
      res.status(403).json({ error: "Not allowed to delete this voice" });
      return;
    }

    const results = { elevenlabs: false, firestore: false, gcs: false };

    // 1. Delete from ElevenLabs
    try {
      await axios.delete(`${ELEVEN_BASE}/voices/${voiceId}`, {
        headers: { "xi-api-key": getApiKey() },
        timeout: 15_000,
      });
      results.elevenlabs = true;
    } catch (e) {
      // 404 from ElevenLabs is OK (already gone); other errors we record but proceed
      if (e.response?.status === 404) results.elevenlabs = true;
      else logger.warn("ElevenLabs delete failed", e.message);
    }

    // 2. Delete consent recording from GCS
    try {
      if (v.consentAudioPath) {
        await getStorage().bucket().file(v.consentAudioPath).delete({ ignoreNotFound: true });
      }
      results.gcs = true;
    } catch (e) { logger.warn("GCS consent delete failed", e.message); }

    // 3. Soft-delete the Firestore doc (preserves audit trail of deletion)
    try {
      await docRef.update({
        deletedAt:   FieldValue.serverTimestamp(),
        deletedBy:   user.uid,
      });
      // Audit entry — kept FOREVER per GDPR best practice (proof of compliance)
      await db.collection("voice_deletion_audit").doc(voiceId).set({
        voiceId,
        companyId:    v.companyId,
        name:         v.name,
        deletedBy:    user.uid,
        deletedAt:    FieldValue.serverTimestamp(),
        cascadeResults: results,
        originalConsentDate: v.consentDate,
      });
      results.firestore = true;
    } catch (e) { logger.warn("Firestore delete failed", e.message); }

    res.json({ voiceId, results });
  }
);

/**
 * POST /elevenlabsPreviewVoice  { voiceId, text, language? }
 * Synthesize a short test phrase and return it as base64-encoded MP3 so the
 * frontend can play it back. Capped at 500 chars to avoid runaway charges.
 */
exports.elevenlabsPreviewVoice = onRequest(
  { region: REGION, secrets: [ELEVENLABS_API_KEY], timeoutSeconds: 60, ...corsOptions },
  async (req, res) => {
    setCorsHeadersSafe(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

    const user = await authedUser(req, res);
    if (!user) return;

    const { voiceId } = req.body || {};
    let { text } = req.body || {};
    if (!voiceId)  { res.status(400).json({ error: "voiceId required" }); return; }
    if (!text)     { res.status(400).json({ error: "text required" }); return; }
    text = String(text).slice(0, 500); // cap at 500 chars

    // Two kinds of voiceId can reach here:
    //   1. A CLONED voice — exists in custom_voices, gated by company ownership.
    //   2. A STOCK ElevenLabs voice (e.g. Rachel 21m00Tcm4TlvDq8ikWAM) offered
    //      in the voice picker — NOT in custom_voices, shared/public, safe to
    //      preview by any authed user. Previously this 404'd, which is why the
    //      preview button did nothing for the built-in ElevenLabs voices.
    const db = getFirestore();
    const docSnap = await db.collection("custom_voices").doc(voiceId).get();
    if (docSnap.exists) {
      const v = docSnap.data();
      if (v.deletedAt) { res.status(410).json({ error: "Voice has been deleted" }); return; }
      if (v.companyId !== user.companyId && user.role !== "super_admin") {
        res.status(403).json({ error: "Not allowed to use this voice" });
        return;
      }
    }
    // else: stock voice — no ownership gate; synthesize directly below.

    try {
      const r = await axios.post(
        `${ELEVEN_BASE}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: "eleven_multilingual_v2",  // Hebrew + most other languages
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        },
        {
          headers: { "xi-api-key": getApiKey(), "Content-Type": "application/json", "Accept": "audio/mpeg" },
          responseType: "arraybuffer",
          timeout: 30_000,
        }
      );
      const base64 = Buffer.from(r.data).toString("base64");
      res.json({ voiceId, audioBase64: base64, mimeType: "audio/mpeg", charCount: text.length });
    } catch (e) {
      logger.error("elevenlabsPreviewVoice failed", e.message);
      res.status(500).json({ error: "Preview synthesis failed", detail: e.response?.data?.toString?.() || e.message });
    }
  }
);
