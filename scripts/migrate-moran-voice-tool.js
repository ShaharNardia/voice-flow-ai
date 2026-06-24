/**
 * migrate-moran-voice-tool.js — repoint assistants' get_stop_arrivals_voice tool
 * off the broken /Moran/stop-monitoring/voice endpoint onto the working
 * /Moran/stop-monitoring one, and drop the phantom phoneCallId/userId params.
 *
 * Idempotent + scoped (only rewrites customTools entries whose url contains the
 * old /voice path). Dry-run by default.
 *
 * Usage (from repo root):
 *   node scripts/migrate-moran-voice-tool.js <projectId>            # dry run
 *   node scripts/migrate-moran-voice-tool.js <projectId> --apply    # write
 *
 * Auth: uses gcloud Application Default Credentials.
 */
"use strict";

const path = require("path");
const admin = require(path.resolve(__dirname, "../firebase/functions/node_modules/firebase-admin"));

const projectId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!projectId) {
  console.error("usage: node scripts/migrate-moran-voice-tool.js <projectId> [--apply]");
  process.exit(1);
}

const OLD_FRAGMENT = "/Moran/stop-monitoring/voice";
const NEW_URL = "https://api.lancelotech.com/Moran/stop-monitoring?station={{station}}&line={{line}}&operatorRef={{operatorRef}}";

admin.initializeApp({ projectId });
const db = admin.firestore();

(async () => {
  const snap = await db.collection("assistants").get();
  let assistantsChanged = 0;
  let toolsFixed = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const ct = data.customTools;
    if (!Array.isArray(ct)) continue;

    let dirty = false;
    const next = ct.map((t) => {
      if (t && typeof t.url === "string" && t.url.includes(OLD_FRAGMENT)) {
        dirty = true;
        toolsFixed++;
        return {
          ...t,
          url: NEW_URL,
          parameters: (Array.isArray(t.parameters) ? t.parameters : [])
            .filter((p) => p && p.name !== "phoneCallId" && p.name !== "userId"),
        };
      }
      return t;
    });

    if (dirty) {
      assistantsChanged++;
      console.log(`${apply ? "FIX " : "DRY "} ${doc.id}  "${data.name || ""}"`);
      if (apply) await doc.ref.update({ customTools: next });
    }
  }

  console.log(`\n${apply ? "Applied" : "Would fix"}: ${assistantsChanged} assistant(s), ${toolsFixed} tool(s).  (project=${projectId})`);
  process.exit(0);
})().catch((e) => { console.error("migration failed:", e.message); process.exit(1); });
