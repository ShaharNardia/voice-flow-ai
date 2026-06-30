/**
 * campaign_scheduler.js — scheduled outbound campaign dialer (Phase B).
 *
 * Every 5 minutes, for each campaign with status "running" AND autoDial=true,
 * dial the next batch of uncontacted ("new") leads — but ONLY inside the
 * campaign's business-hours window [callWindowStart, callWindowEnd) in its
 * timezone. When no "new" leads remain, the campaign is marked "completed".
 *
 * This complements (does not duplicate) the manual campaignStart button and the
 * follow-up retry path: the scheduler dials status=="new" leads only, so a lead
 * that was already contacted (now callback/contacted/etc.) is never re-dialed
 * here — re-dials are owned by the follow-up queue.
 */

"use strict";

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");

const DEFAULT_TZ = "Asia/Jerusalem";

function localHour(tz) {
  try {
    return Number(new Intl.DateTimeFormat("en-US", {hour: "2-digit", hour12: false, timeZone: tz}).format(new Date()));
  } catch { return new Date().getUTCHours(); }
}
function inWindow(tz, start, end) {
  const h = localHour(tz);
  return h >= start && h < end;
}

async function dialBatch(db, campaign, campaignId, batchSize) {
  const voiceService = require("./voice_service");   // lazy — avoid load cycle
  const leadsSnap = await db.collection("leads")
    .where("campaignId", "==", campaignId)
    .where("status", "==", "new")
    .limit(batchSize)
    .get();

  if (leadsSnap.empty) {
    await db.collection("campaigns").doc(campaignId).set(
      {status: "completed", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    try {
      const {sendPushToUser} = require("./push_service");
      if (campaign.ownerId) {
        await sendPushToUser(campaign.ownerId, {title: "Campaign completed", body: `"${campaign.name || "Campaign"}" — all leads have been called.`, url: "/campaigns"});
      }
    } catch (_) {}
    return {queued: 0, done: true};
  }

  let queued = 0;
  for (const leadDoc of leadsSnap.docs) {
    const lead = leadDoc.data();
    try {
      await leadDoc.ref.set({status: "queued", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      await voiceService._placeCallInternal({
        number: lead.phone,
        companyPhone: campaign.fromNumber,
        assistantId: campaign.assistantId,
        metadata: {leadId: leadDoc.id, campaignId, leadName: lead.name || "", autoDial: true},
      }, campaign.ownerId || null);
      queued++;
    } catch (e) {
      logger.warn("[campaign-scheduler] call failed", {campaignId, leadId: leadDoc.id, err: e.message});
      await leadDoc.ref.set({status: "new", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  }
  return {queued, done: false};
}

const dispatchCampaigns = onSchedule("every 5 minutes", async () => {
  const db = getFirestore();
  // status=="running" is a single-field filter (auto-indexed); autoDial + window
  // are filtered in code so no composite index is needed.
  const snap = await db.collection("campaigns").where("status", "==", "running").limit(50).get();
  if (snap.empty) return;

  let scanned = 0, queued = 0, deferred = 0;
  for (const doc of snap.docs) {
    const c = doc.data();
    if (c.autoDial !== true) continue;       // opt-in only
    scanned++;
    const tz = c.timezone || DEFAULT_TZ;
    const start = Number.isFinite(c.callWindowStart) ? c.callWindowStart : 9;
    const end = Number.isFinite(c.callWindowEnd) ? c.callWindowEnd : 20;
    if (!inWindow(tz, start, end)) { deferred++; continue; }   // outside business hours
    const batch = Number.isFinite(c.batchSize) ? Math.max(1, Math.min(20, c.batchSize)) : 5;
    try {
      const r = await dialBatch(db, c, doc.id, batch);
      queued += r.queued;
    } catch (e) {
      logger.warn("[campaign-scheduler] batch failed", {campaignId: doc.id, err: e.message});
    }
  }
  logger.info("[campaign-scheduler] tick", {running: snap.size, autoDial: scanned, queued, deferred});
});

module.exports = {dispatchCampaigns};
