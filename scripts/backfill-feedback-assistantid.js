/**
 * backfill-feedback-assistantid.js — one-time: set assistantId on existing
 * call_turn_feedback docs (from their call_session), so corrections saved before
 * the feedback→prompt fix are picked up by the per-assistant query.
 *
 * Dry run:  node scripts/backfill-feedback-assistantid.js <projectId>
 * Apply:    node scripts/backfill-feedback-assistantid.js <projectId> --apply
 * Auth: gcloud Application Default Credentials.
 */
"use strict";
const path = require("path");
const admin = require(path.resolve(__dirname, "../firebase/functions/node_modules/firebase-admin"));

const projectId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!projectId) { console.error("usage: node scripts/backfill-feedback-assistantid.js <projectId> [--apply]"); process.exit(1); }

admin.initializeApp({ projectId });
const db = admin.firestore();

(async () => {
  const snap = await db.collection("call_turn_feedback").get();
  let missing = 0, fixed = 0, noSession = 0, alreadyOk = 0;
  const sessionCache = new Map();

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.assistantId) { alreadyOk++; continue; }
    missing++;
    const callId = d.callId || d.callSessionId;
    if (!callId) { noSession++; continue; }
    let astId = sessionCache.get(callId);
    if (astId === undefined) {
      const cs = await db.collection("call_sessions").doc(String(callId)).get();
      astId = cs.exists ? (cs.data().assistantId || null) : null;
      sessionCache.set(callId, astId);
    }
    if (!astId) { noSession++; continue; }
    console.log(`${apply ? "FIX " : "DRY "} ${doc.id}  →  assistantId=${astId}  (rating=${d.rating || "?"}, correction=${d.correction ? "yes" : "no"})`);
    if (apply) { await doc.ref.set({ assistantId: astId }, { merge: true }); fixed++; }
  }
  console.log(`\nTotal=${snap.size}  alreadyHadId=${alreadyOk}  missingId=${missing}  ${apply ? "fixed" : "wouldFix"}=${apply ? fixed : missing - noSession}  noSession=${noSession}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
