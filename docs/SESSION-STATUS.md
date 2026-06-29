# Session Status & Handoff — voice-flow-ai

_Last updated: 2026-06-29. Working branch: `chore/prod-hardening-and-snapshot`._

This is a checkpoint of where we stopped, what is live, and what's left. Everything
under "Done & live" is **deployed to production** (mediastream Cloud Run + Firebase
Functions + Hosting) regardless of merge state.

---

## Branch / merge state
- `main` was last updated by **PR #1** (merge commit `5daef36`).
- The working branch `chore/prod-hardening-and-snapshot` is **7 commits ahead of `main`** (work after the merge — see list below). These are **deployed to prod** but **not yet merged to main**.
- ➡️ **TODO: open a fresh PR (branch → main) and merge** when ready. Same resolution policy as last time (branch wins for source, keep main's CI move).

Commits ahead of main (newest first):
```
f65354e feat(handoff): escalate exhausted follow-ups to a human (#2 Phase C2)
e3f85b1 feat(followups): automatic follow-up calls for unresolved campaign leads
b710ce4 polish(scenarios): clarify scenario flow works on Gemini Live too
81986ef feat(scenarios): run scenarios on the Gemini Live path (was Realtime-only)
9e50645 feat(copilot): deliver operator injections to the live call (was dead)
4a6e2aa fix(security): authenticate Co-Pilot stream + inject endpoints (cross-tenant leak)
b0da612 chore(nav): base+ cleanup — hide enterprise extras + Bench, delete dead NLPearl page
```

---

## Done & live in production

### Reliability / observability
- **Voice bulletproofing**: model-WS reconnect (OpenAI Realtime + Gemini, same voice), `end_call` confirmation gate, barge-in echo-window guard, zero-outbound-audio alarm, busy/silence/KB watchdogs. `/selftest` deep endpoint gates every mediastream deploy.
- **Observability = Google Cloud Error Reporting** (replaced Sentry — no DSN, no PII egress). `observability.js` emits structured ReportedErrorEvent logs. Email alert policy on **prod + staging**.
- **Firestore backups**: daily 7-day schedule on prod + staging; restore-to-new-DB tested and works.
- **Fork scrub**: `Lancelotech/voice-flow-ai-asterisk` `main` history rewritten to remove the leaked key/PII (partial mitigation — key still needs rotation, see below).

### Features
- **Live voice replay** ("Re-run & Compare → Run as live voice call"): drives the REAL pipeline with synthetic caller audio and returns a WAV.
  - realtime/gemini → live `/replay`; classic → LLM reply (same as text Re-run) + Google TTS via `/replay-tts`.
  - Replay-safety: SMS/email/transfer/appointment/lead tools are neutralized during a replay; no real hangup. Download-WAV in the UI.
- **Recording playback fix**: realtime/Gemini recordings (GCS) now served via the `getRealtimeRecording` auth proxy (the old V2 signed URLs were rejected by GCS). Recorder stores the proxy URL and is bucket-env-aware (staging no longer writes to the prod bucket).
- **Co-Pilot**:
  - **Security**: `/copilot-stream` + `/copilot-inject` now require a Firebase ID token + ownership (was wide-open cross-tenant). Verified 401 for anon.
  - **Injection works**: operator messages now reach the live call (each session watches its own `call_session` doc and feeds injections to the bridge via `injectOperatorMessage`).
- **Scenarios on Gemini Live**: scenarios used to drive only OpenAI Realtime calls; now run on the Gemini path too (bridge adapter + `onUserTranscript` + greeting gating). Editor copy clarified.
- **Base+ cleanup**: hidden behind feature flags (super_admin still sees them): Compliance, Contracts, Voice Commerce, Agent Network, Bench. Deleted the dead `/nlpearl` page. Kept Calendar / Scenarios / Co-Pilot.
- **Outbound follow-ups (#2)** — `followups_service.js`:
  - **C1**: a campaign lead that ends unresolved (callback/no-answer/busy) is enqueued in `followup_queue/{leadId}`; `dispatchFollowups` (every 5 min) re-dials it inside business hours (default Asia/Jerusalem 09–20), capped at 3 attempts. Success clears it.
  - **C2 handoff**: when exhausted, the lead is handed to a human via 3 channels — an `escalations/{leadId}` record, the lead's `status → "escalated" + needsHuman`, and a best-effort push to the owner. (Live in-call `transfer_call` was already a real Twilio `<Dial>` in both V2V paths.)

---

## Remaining / backlog (prioritized)

1. **Follow-ups / Escalations UI** — backend data exists (`followup_queue`, `escalations`, lead `status:"escalated"`); needs a screen so the owner can see/manage who's waiting + mark resolved. _(Recommended next — short, completes #2 visually.)_
2. **#1 in full — scheduled campaign dialer (Phase B)**: per-campaign call windows + timezone + a scheduler that auto-dials a campaign's lead list (today only the follow-up RETRY path uses the activity-hours guard; campaign start is still a manual button).
3. **P2 — Calendar UI**: create / edit / delete appointment modals (backend `bookingsCreate`/`bookingsCancel` already exist), and enable `cap.appointments` by default for Pro.
4. **Merge branch → main** (7 commits ahead — see top).

---

## Standing operational items (need the owner / external action)

- ⚠️ **Rotate the leaked OpenAI key** — deferred by request. It sat in git history; the fork scrub is only partial mitigation (GitHub keeps old blobs by SHA, and the key is still valid). **This is the only real fix.**
- **CPU quota 200 → 500 vCPU** (us-central1): increase requests **filed** for both projects (prod case `b33d1ef7-…`, staging `f1880053-…`), **pending Google approval**. Until approved, deploy Cloud Functions **one at a time** (batches hit the ceiling).
- **Sentry**: decommissioned in favor of GCER — no action needed.

## Known minor / benign
- `SIP_ENCRYPTION_KEY not set` — a load-time warning from `sip_trunk_service.js`; harmless except that SIP-trunk password writes are blocked until a 64-char hex key is configured. Not caused by recent work.
- gh CLI has 3 accounts; pushing to `ShaharNardia/voice-flow-ai` requires `gh auth switch --user ShaharNardia` (it drifts to other accounts).

---

## Deploy quick-reference
```
scripts/deploy.sh staging mediastream                 # voice service → staging
scripts/deploy.sh production mediastream --yes        # voice service → prod
scripts/deploy.sh <env> functions <name> [--yes]      # one function (respect CPU quota)
scripts/deploy.sh production hosting --yes            # frontend
```
Prod Cloud Run service: **`voiceflow-mediastream`** (not `mediastream`). Prod project `voiceflow-ai-202509231639`, staging project `voiceflow-staging`.
