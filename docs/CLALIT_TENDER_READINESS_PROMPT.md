# Prompt — Clalit Voice GenAI Tender Readiness (Additive, Non-Breaking)

> העתק/הדבק את כל המסמך הזה לסוכן הקוד שעובד על מאגר `voice-flow-ai`.
> כל הטרמינולוגיה הטכנית באנגלית בכוונה — להתאמה למאגר.

---

## ROLE & MISSION

You are a senior backend engineer working on the existing `voice-flow-ai` repository
(Flutter app + Next.js dashboard + Firebase Functions + Firestore + `cloud-run/mediastream`
voice service; telephony via Twilio / SIP-Asterisk / Voximplant; AI via Deepgram STT,
OpenAI/Gemini LLM, ElevenLabs/Google TTS).

Your mission: make the product able to satisfy the requirements of Clalit tender
**92-02013/26 (Voice GenAI for proactive/preventive care)** — **without rewriting or
breaking anything that exists today**. Everything you add must be:

- **Additive** — new modules/files alongside existing ones. Do not remove or rewrite
  working flows.
- **Feature-flagged & default OFF** — gated through the existing flag system
  (`feature_gate.js`, `features.js`, `features_service.js`). Introduce a flag set
  `healthcare_compliance` (a.k.a. "Clalit mode"), resolved **per `companyId`/tenant**.
  When the flag is off, behavior is byte-for-byte identical to today.
- **Backward compatible** — existing tenants, calls, and tests keep passing unchanged.
- **Tested** — each work package ships with unit tests next to the existing `*.test.js`
  pattern, plus a smoke test, and updates to `docs/testing`.

## HARD CONSTRAINTS

1. No breaking changes to public function signatures, HTTP endpoints, Firestore schemas,
   or the `Company` record contract. Add new optional fields only.
2. No global migration of Firestore. ZDR/data-minimization behavior is **opt-in per tenant**.
3. Do NOT build or self-host local AI models in this phase. Instead, make the provider
   layer **pluggable** so On-Prem/local endpoints become a *config change*, not a rewrite.
4. Keep secrets in Secret Manager (the repo's authoritative store). No plaintext keys.
5. Every new behavior must be observable: structured logs + audit entries
   (`audit_service.js`) + feature-gated.
6. Before coding each work package: read the relevant existing files, write a 5-line plan,
   then implement. After: run/extend tests.

## ORIENTATION (read these before starting)

- `firebase/functions/feature_gate.js`, `features.js`, `features_service.js` — flag system.
- `firebase/functions/llm_service.js` — LLM orchestration + assistant tools (e.g. `book_appointment`).
- `firebase/functions/scenario_engine.js`, `scenario_service.js`, `scenario_ai_service.js` — conversation scenarios (this is your Sandbox engine).
- `firebase/functions/compliance_service.js`, `audit_service.js`, `anomaly_service.js`, `analysis_service.js` — compliance/monitoring foundations to extend.
- `firebase/functions/transfer_call.js` — human handoff.
- `cloud-run/mediastream/` — realtime voice (`gemini_bridge.js`, `realtime_bridge.js`, `deepgram`, recorders). Full-duplex / barge-in lives here.
- `firebase/functions/appointments_service.js`, `calendar_invites.js` — current booking path.

---

## WORK PACKAGES

Implement in this order. Each is independent and flag-gated.

### WP0 — Feature scaffold: `healthcare_compliance` flag set + per-tenant config
- Add a `healthcare_compliance` capability to the flag system, resolved per `companyId`.
- Add an optional `Company.healthcareCompliance` config object (all fields default to
  today's behavior when absent): `{ enabled, zdrMode, clinicalSafety, dataForwarding,
  crm, providers, evaluation }`.
- Add a single resolver `getHealthcareConfig(companyId)` used by all WPs below.
- **Acceptance:** with flag off → no code path changes; with flag on → config object is
  available to downstream modules. Unit test both.

### WP1 — Clinical Safety Guardrails (THE 50% PASS/FAIL GATE — highest priority)
Tender 5.4: the agent must never give diagnoses/clinical advice or interpret results,
must declare it is a virtual AI agent, must escalate "red flags" to a human, and must
avoid hallucinations. Scoring requires ~47.5/50 or the bid is disqualified.

- New module `firebase/functions/clinical_safety_service.js`:
  - **Input guardrail**: classify caller intent; if it requests diagnosis / test
    interpretation / treatment recommendation / medication advice → respond with a safe,
    scripted deflection + offer human transfer. Maintain a configurable **red-flag
    trigger list** (keywords/phrases/clinical-risk statements) → immediate route to human
    via `transfer_call.js` (admin or clinical queue).
  - **Output guardrail**: post-process every LLM response before TTS; block clinical
    advice, unsupported medical claims, and hallucinated facts (must be grounded in the
    scenario/knowledge base). On block → fall back to safe template.
  - **Virtual-agent disclosure**: enforce a spoken disclosure at call start (configurable
    per language he/ar/ru/en) that this is an AI virtual agent.
- Hook these into `llm_service.js` and the realtime path in `cloud-run/mediastream`
  **only when `clinicalSafety.enabled`**. Strengthen the system prompt with a hardened
  medical-safety preamble (no diagnosis, no advice, disclose AI, escalate on risk).
- **Acceptance:** a test suite of clinical-risk prompts (he/ar/ru/en) where the agent
  must (a) never give clinical advice, (b) offer alternatives when a request isn't
  possible, (c) escalate red flags, (d) disclose it's an AI. Target ≥95% pass. Keep the
  test cases in `docs/testing` as the demo rehearsal set.

### WP2 — ZDR / Data-Minimization mode (per tenant)
Tender 5.5: Zero Data Retention — no persistent copies, no secondary use, no training;
all raw + processed data (recordings + transcripts + metadata) handed to Clalit.

- New module `firebase/functions/zdr_service.js`:
  - When `zdrMode` is on for a tenant: process in memory / ephemeral storage only; **do
    not** persist transcripts, recordings, or PII to the tenant's normal Firestore
    collections. Use a short-lived buffer keyed by callSessionId.
  - After the call (or in near-real-time chunks), **forward** all artifacts to the
    tenant's configured sink (see WP3), then **purge** local buffers and confirm deletion
    in the audit log.
  - Set provider-level no-retention flags where supported (OpenAI/Deepgram/ElevenLabs
    enterprise "no training / zero retention" headers/options) via the provider layer (WP4).
- **Acceptance:** with `zdrMode` on, after a simulated call there are zero residual
  transcript/recording docs in Firestore, an audit entry proves forward+purge, and a
  no-retention flag was sent to each provider. With `zdrMode` off → unchanged persistence.

### WP3 — Data forwarding connector to Clalit servers
- New module `firebase/functions/data_forwarding_service.js` with a pluggable **sink
  interface** (`pushArtifacts({callSessionId, recording, transcript, metadata})`).
- Provide adapters: `https-api`, `gcs-bucket`, `sftp` (start with one real + interface
  for the rest). Configurable per tenant (`dataForwarding`), with retry + dead-letter +
  audit. Supports both real-time streaming and scheduled batch export (tender 5.4.2
  "scheduled download of call data").
- **Acceptance:** artifacts delivered to a mock sink with checksum verification, retry on
  failure, and full audit trail. Unit + smoke test.

### WP4 — Provider abstraction for Hybrid / On-Premise readiness
Tender 5.6.5: ability to run both in cloud and On-Premise (hybrid). We are NOT building
local models now — we are making them swappable by config.

- Introduce a thin provider interface for STT / LLM / TTS, e.g.
  `firebase/functions/providers/` (`stt_provider.js`, `llm_provider.js`, `tts_provider.js`)
  and mirror in `cloud-run/mediastream`. Existing Deepgram/OpenAI/Gemini/ElevenLabs become
  the default cloud adapters behind this interface — **no behavior change**.
- Add config-driven selection (`providers.stt|llm|tts = "cloud" | "local"` with
  `endpoint` URLs). Add `local` adapter **stubs** that target an OpenAI-compatible /
  local HTTP endpoint (so a future Whisper/local-LLM/local-TTS deployment is a config flip).
- **Acceptance:** default config routes to current cloud providers and all existing voice
  tests pass; setting a provider to `local` with a mock endpoint routes there. No model is
  bundled. Document the On-Prem deployment shape in an HLD doc (tender 5.6.3).

### WP5 — Bi-directional CRM integration (Dynamics / Salesforce)
Tender 5.2.2 / 5.6: two-way integration with medical/CRM systems (MS Dynamics, Salesforce).

- New module `firebase/functions/crm_integration_service.js` with a connector interface
  (`upsertContact`, `getAppointments`, `bookAppointment`, `logInteraction`, `pushOutcome`).
- Ship a Salesforce adapter and a Dynamics adapter (real auth flow for one, interface +
  stub for the other), config-driven per tenant (`crm`). Wire the `book_appointment` tool
  in `llm_service.js` to optionally route through the CRM connector instead of the internal
  Firestore booking — **only when `crm.enabled`**.
- **Acceptance:** booking/lookup round-trips against a mock CRM; internal booking path
  unchanged when CRM is off.

### WP6 — Evaluation & monitoring (LLM-as-a-Judge) + full call records
Tender 5.4.4 / 5.4.5: monitor all calls, evaluation metrics, LLM-as-judge, hallucination
& clinical-safety scoring, goal-completion.

- Extend `analysis_service.js` (or new `evaluation_service.js`): after each call run an
  LLM-as-judge pass scoring: hallucination avoidance, no clinical advice, correct red-flag
  handling, offered alternatives, goal completion. Store scores; expose in the dashboard.
- Support both per-call (real-time/post) and sampled batch evaluation, configurable
  (`evaluation`). Feed anomalies into `anomaly_service.js`.
- **Acceptance:** simulated calls produce a scored evaluation record + dashboard metric;
  flag-gated; off by default.

### WP7 — Full-duplex + disclosure verification (lightweight)
- Verify/confirm barge-in (caller can interrupt) in `cloud-run/mediastream`
  (`gemini_bridge.js` / `realtime_bridge.js`); add the WP1 virtual-agent disclosure to
  call start in he/ar/ru/en. Add Russian to the language config if missing (Deepgram +
  ElevenLabs support it) — additively, no change to existing language defaults.
- **Acceptance:** documented full-duplex behavior + a he/ar/ru/en disclosure smoke test.

### WP8 — Sandbox rapid scenario deploy (for the live committee demo)
The quality stage = stand up 2-3 Clalit-given use cases fast and demo live (30.06–14.07).
- Add a `scenario_engine.js` "healthcare scenario template" pack + a one-command
  loader/CLI to instantiate a new use-case scenario (appointment scheduling, treatment
  reminder, follow-up survey, identity verification, prescription status) with WP1 safety
  guardrails pre-wired and he/ar/ru/en.
- **Acceptance:** from a short spec, a new scenario is live in the Sandbox in minutes with
  safety guardrails on, ready to demo.

---

## NON-GOALS (do not do now)
- Do not self-host/train local LLM/STT/TTS models (WP4 only makes them pluggable).
- Do not migrate existing tenants' data model or default behavior.
- Do not implement actual Nimbus deployment — produce the **architecture statement / HLD**
  describing ZDR + hybrid + Nimbus future-deployment commitment (doc deliverable, not code).

## CROSS-CUTTING
- Wire every WP through `feature_gate.js` and `audit_service.js`.
- Update `CHANGELOG.md`, add an HLD architecture doc under `docs/`, and a
  `docs/testing` entry per WP.
- Use the existing deploy path only (`scripts/deploy.sh`; voice service target
  `voiceflow-mediastream`).

## DELIVERABLES
1. New flag-gated modules per WP above + tests.
2. `docs/HLD_CLALIT_VOICE_GENAI.md` (architecture, ZDR, hybrid/On-Prem, Nimbus commitment).
3. Updated `CHANGELOG.md` + `docs/testing` rehearsal sets (esp. WP1 clinical-safety suite).
4. A short "tender mapping" table: each tender clause → module → flag → status.

## DEFINITION OF DONE
- Flag OFF ⇒ system identical to today; all existing tests green.
- Flag ON for a test tenant ⇒ clinical safety, ZDR+forwarding, CRM, evaluation, full-duplex
  disclosure, and sandbox scenarios all demonstrably working with tests.
