#!/usr/bin/env node
/**
 * QA test-data cleanup script (#54).
 *
 * Scans Firestore for documents that match common QA/test leftover patterns
 * and (optionally) deletes them. **Dry-run by default**; pass `--force` to
 * actually delete.
 *
 * Usage:
 *   node scripts/cleanup-qa-data.js                  # dry-run, prints counts
 *   node scripts/cleanup-qa-data.js --verbose        # dry-run + per-doc preview
 *   node scripts/cleanup-qa-data.js --force          # actually deletes
 *
 * Add/edit PATTERNS below as you discover more test data shapes in your tenant.
 * Each pattern is a (collection, predicate) pair; the predicate runs against
 * every doc in the collection. Keep predicates strict — false positives nuke
 * real customer data.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON
 * with Firestore admin access on voiceflow-ai-202509231639.
 */

"use strict";

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "voiceflow-ai-202509231639",
  });
}
const db = admin.firestore();

const FORCE   = process.argv.includes("--force");
const VERBOSE = process.argv.includes("--verbose");

// Each entry: { collection, predicate(doc) → boolean, description }
const PATTERNS = [
  // Calls that were obviously bench / e2e tests — leadNumber pinned to a
  // burner range or contains "test" in the friendly name.
  {
    collection: "call_sessions",
    description: "Call sessions with test/bench markers",
    predicate: (d) => {
      const n  = String(d.leadNumber || "").toLowerCase();
      const an = String(d.assistantDefinition?.name || "").toLowerCase();
      return n === "+15555555555"
          || n.includes("test")
          || an.includes("bench")
          || an.startsWith("qa ")
          || an === "test assistant";
    },
  },
  // Leads from automated tests
  {
    collection: "leads",
    description: "Leads with sentinel test addresses",
    predicate: (d) => {
      const email = String(d.email || "").toLowerCase();
      const name  = String(d.name  || "").toLowerCase();
      return email.endsWith("@example.com")
          || email.endsWith("@test.local")
          || name === "test lead"
          || name === "qa user";
    },
  },
  // Assistants whose name screams test
  {
    collection: "assistants",
    description: "Assistants with QA-ish names",
    predicate: (d) => {
      const n = String(d.name || d.assistantName || "").toLowerCase().trim();
      return n === "test"
          || n === "test assistant"
          || n.startsWith("qa ")
          || n.startsWith("bench ");
    },
  },
  // Knowledge chunks orphaned from deleted assistants — leftover from KB
  // upload-then-delete-assistant test cycles.
  {
    collection: "knowledge_chunks",
    description: "Knowledge chunks for non-existent assistants",
    predicate: () => false,   // disabled by default — requires a join, opt-in manually
  },
];

async function scanCollection({ collection, predicate, description }) {
  const snap = await db.collection(collection).get();
  const hits = [];
  snap.forEach((doc) => {
    try { if (predicate(doc.data())) hits.push({ id: doc.id, ref: doc.ref }); }
    catch (e) { console.warn(`predicate threw on ${collection}/${doc.id}: ${e.message}`); }
  });
  return { collection, description, hits, total: snap.size };
}

async function deleteBatch(refs) {
  // Firestore batch limit is 500 — chunk it.
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    refs.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

(async () => {
  console.log(`QA data cleanup — ${FORCE ? "LIVE (--force)" : "DRY RUN"}`);
  console.log("─".repeat(60));

  let totalHits = 0;
  for (const pattern of PATTERNS) {
    const r = await scanCollection(pattern);
    totalHits += r.hits.length;
    console.log(`${r.collection.padEnd(20)} ${String(r.hits.length).padStart(4)} / ${String(r.total).padStart(5)} match  — ${r.description}`);
    if (VERBOSE && r.hits.length) {
      r.hits.slice(0, 10).forEach((h) => console.log(`   • ${h.id}`));
      if (r.hits.length > 10) console.log(`   ... and ${r.hits.length - 10} more`);
    }
    if (FORCE && r.hits.length) {
      await deleteBatch(r.hits.map((h) => h.ref));
      console.log(`   ✓ deleted ${r.hits.length} from ${r.collection}`);
    }
  }

  console.log("─".repeat(60));
  console.log(`${totalHits} document(s) matched ${FORCE ? "and were deleted" : "(dry run — no deletes)"}.`);
  if (!FORCE && totalHits > 0) {
    console.log("Re-run with --force to delete. Review --verbose output first.");
  }
  process.exit(0);
})().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
