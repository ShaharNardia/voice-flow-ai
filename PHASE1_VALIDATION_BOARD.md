# Phase 1 — Voice-AI Platform Validation Board

> **Status legend:** ⬜ Not started · 🟡 In progress · 🟢 Done · 🔴 Blocked
> **Owner codes:** [Y] = You (Shahar) · [E] = Engineer (you or contractor) · [V] = Voice talent (Fiverr) · [L] = Native listener
> **Estimates:** in actual focused hours, not calendar time

---

## Project overview

| | |
|---|---|
| **Goal** | Validate a NLPearl-class voice-AI cascade for Hebrew + Greek + Levantine Arabic with measured WER, MOS, latency, and COGS — produce a go/no-go decision |
| **Duration** | 6 weeks (May–Jun 2026) |
| **Total budget** | $2,500 cash + ~80–120 engineering hours |
| **Definition of done** | A 15-page decision report + populated cost model + working `/bench` page in the app |
| **Repository** | `C:\Repos\voice-flow-ai` |

### Success criteria — must meet ALL to declare 🟢 GO

- [ ] STT WER under 12% for at least 2 of 3 languages
- [ ] TTS MOS ≥ 3.8/5 for "Naturalness" for at least 2 of 3 languages (from 5+ native listeners)
- [ ] End-to-end p95 turn latency < 1,200 ms
- [ ] Per-minute COGS at 1M min/month ≤ $0.10 across the stack
- [ ] Levantine TTS sounds dialect-authentic (PVC if needed) — confirmed by Lebanese + Syrian listeners

---

## Board structure (recommended in Notion/Linear)

**Columns / statuses:**
1. Backlog
2. Week 1 — Setup
3. Week 2 — STT bench
4. Week 3 — TTS bench
5. Week 4 — Voice cloning POC
6. Week 5 — End-to-end + cost
7. Week 6 — Report
8. Done
9. ❄️ Frozen (out of Phase 1 scope)

**Labels:**
- `code` — engineering work
- `audio` — sourcing/recording
- `bench` — running benchmarks
- `listener` — human evaluation
- `vendor` — signup / API key
- `decision` — gate that blocks next stage
- `risk` — known unknown to validate

---

## WEEK 1 — Setup & Sourcing
*Goal: have all audio, all API keys, and a working bench UI by Friday.*

### TASK 1.1 — Build bench backend
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 6h · **Labels:** code · **Depends on:** —

Create `firebase/functions/bench_service.js` with 3 onRequest endpoints:
- `benchSttRun` — POST `{audioUrl, language, providers[]}` → fans out STT calls in parallel, returns `{provider: {transcript, latencyMs, costEstimate}}`
- `benchTtsGenerate` — POST `{text, language, providers[], voiceId?}` → returns array of `{provider, voiceId, audioGcsUrl, latencyMs}`
- `benchScore` — POST `{runId, provider, dimension, score, listenerEmail}` → persists rating to Firestore `bench_ratings`

**Acceptance criteria:**
- [ ] All three endpoints deployed
- [ ] Adapter classes for: ElevenLabs Scribe, Deepgram Nova-3, AssemblyAI, Azure Speech, Google Cloud Speech, OpenAI Whisper API
- [ ] TTS adapters: ElevenLabs Multilingual v2, Azure Neural, Google Cloud, OpenAI gpt-4o-mini-tts
- [ ] Audio storage: each generation written to GCS bucket `voiceflow-bench/audio/{runId}/{provider}.wav`
- [ ] One smoke test on a 30-second Hebrew clip returns all transcripts

---

### TASK 1.2 — Build bench frontend UI
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 8h · **Labels:** code · **Depends on:** 1.1

New page `saas-frontend/src/app/(dashboard)/bench/page.tsx` with 3 tabs:

**STT tab:**
- Drag-drop audio upload → uploads to GCS → calls `benchSttRun`
- Side-by-side panel showing N transcripts (one per provider)
- Reference transcript textbox — paste ground truth
- Computed WER + CER displayed per provider (use `wer` npm package)

**TTS tab:**
- Text input + language selector + multi-select providers
- Generate button → calls `benchTtsGenerate`
- Audio players for each result
- 3-question rating widget per result: Naturalness / Intelligibility / Accent (1–5 stars each)

**Results tab:**
- Table reading from `bench_runs` + `bench_ratings` collections
- Filters: language, provider, dimension
- Aggregate stats (avg score, std dev, count)

**Acceptance criteria:**
- [ ] All 3 tabs render without errors
- [ ] Can upload audio and see transcripts side-by-side
- [ ] WER calc returns sane numbers on a known clip
- [ ] Ratings persist and aggregate

---

### TASK 1.3 — Sign up for all STT/TTS trials
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 2h · **Labels:** vendor

Sign up + obtain API keys. Store all in Firebase Secrets.

| Provider | Tier | Cost | Action |
|---|---|---|---|
| ElevenLabs | Creator $22/mo → Pro $99/mo Week 4 | $22 | Already have account |
| Deepgram | Free tier $200 credit | $0 | New signup |
| AssemblyAI | Free tier 5h | $0 | New signup |
| Azure Speech | Free tier 5h/month | $0 | Azure portal |
| Google Cloud Speech | Free $300 trial | $0 | GCP console |
| OpenAI | Pay-as-you-go | $0 base | Already have |

**Acceptance criteria:**
- [ ] All 6 API keys stored as Firebase Secrets
- [ ] Each adapter (Task 1.1) verified with a 10-second sample

---

### TASK 1.4 — Source Hebrew audio (30 min)
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 3h · **Labels:** audio · **Depends on:** —

Compile 30 minutes of varied Hebrew speech with ground-truth transcripts:

| Source | Duration | Type | Cost |
|---|---|---|---|
| Klalit Smile call recordings (your own data) | 10 min | Real customer service, varied accents | $0 |
| [ivrit-ai/crowd-recital-whisper-training](https://huggingface.co/datasets/ivrit-ai/crowd-recital-whisper-training) | 10 min | Clean read speech | $0 |
| Self-recorded prompts: formal/casual/code-switch | 10 min | Controlled | $0 |

**Acceptance criteria:**
- [ ] 30 min of audio uploaded to GCS `voiceflow-bench/audio/hebrew/`
- [ ] Each clip has a `.txt` reference transcript file alongside
- [ ] At least 3 different speakers represented
- [ ] At least 2 min of code-switching with English

---

### TASK 1.5 — Source Greek audio (30 min)
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 3h · **Labels:** audio

| Source | Duration | Cost |
|---|---|---|
| [Mozilla Common Voice Greek](https://commonvoice.mozilla.org/el) sample | 10 min | $0 |
| Greek news from YouTube (record via yt-dlp at 16kHz) | 10 min | $0 |
| Fiverr Greek native voice talent | 10 min | $30–50 |

**Acceptance criteria:**
- [ ] 30 min audio + reference transcripts in GCS
- [ ] Includes 1 male + 1 female speaker
- [ ] At least 3 min spontaneous customer-service scenario

---

### TASK 1.6 — Source Levantine Arabic audio (60 min, 4 sub-dialects)
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 5h · **Labels:** audio · **risk**

This is the make-or-break for the Levantine arm. 15 min per sub-dialect, hired Fiverr talent.

For each speaker, brief them to record:
1. 5 min reading prepared news/customer-service text
2. 5 min spontaneous: "Pretend you're calling a dental clinic to book an appointment"
3. 5 min code-switching: English/French interjections (common in Lebanese)

| Sub-dialect | City | Speaker source | Budget |
|---|---|---|---|
| Lebanese | Beirut | Fiverr Beirut native | $50–80 |
| Syrian | Damascus or Aleppo | Fiverr Syrian native (or refugee in Turkey/Jordan) | $50–80 |
| Jordanian | Amman | Fiverr Amman native | $50–80 |
| Palestinian | Ramallah / Jerusalem / Hebron | Fiverr Palestinian native | $50–80 |

**Acceptance criteria:**
- [ ] 60 min audio in GCS, organized by sub-dialect folder
- [ ] Ground-truth transcripts ($0.50–1/min via Fiverr Arabic transcription) — must be done by a native of the SAME sub-dialect
- [ ] At least 1 male + 1 female across the 4 dialects
- [ ] Code-switching segments tagged

---

### MILESTONE: 🚦 End of Week 1
- [ ] Bench UI works on a smoke-test sample
- [ ] All 120 minutes of audio + reference transcripts in GCS
- [ ] All 6 API keys live

**If not met by Friday Week 1**: pause and reassess — don't accelerate into Week 2 with missing audio.

---

## WEEK 2 — STT Benchmark
*Goal: definitive WER table for every provider × language × sub-dialect.*

### TASK 2.1 — Run STT batch for Hebrew
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 4h (mostly waiting) · **Depends on:** 1.1, 1.4

Run all 30 min Hebrew audio through all STT providers via `benchSttRun`. Persist results. Compute WER vs reference.

**Acceptance criteria:**
- [ ] Table in Results tab showing WER per provider for Hebrew
- [ ] Latency-per-100-words measured (cold-start vs warm)
- [ ] Cost per minute computed using published API pricing

---

### TASK 2.2 — Run STT batch for Greek
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 4h · **Depends on:** 1.1, 1.5

Same protocol as 2.1, for Greek.

**Acceptance criteria:**
- [ ] WER table populated
- [ ] Special attention: which providers handle Greek tonos diacritics correctly?

---

### TASK 2.3 — Run STT batch for Levantine Arabic
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 6h · **Depends on:** 1.1, 1.6 · **risk**

Run each sub-dialect through ALL providers. Build a 6×4 grid (providers × sub-dialects).

**Critical question to answer:** Does ElevenLabs Scribe actually do better on Lebanese/Syrian/Palestinian than vanilla Whisper does?

**Acceptance criteria:**
- [ ] 6×4 WER grid populated
- [ ] Per-sub-dialect best provider identified
- [ ] **Decision flag**: if EVERY provider gives > 20% WER on at least 2 sub-dialects → escalate to scope reduction

---

### TASK 2.4 — Self-host Hebrew Whisper test (one-off RunPod)
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 4h · **Cost:** ~$30 · **Labels:** bench

Rent one H100 PCIe on RunPod for ~6 hours. Install `ivrit-ai/whisper-large-v3-turbo-ct2`. Run all 30 min of Hebrew audio. Measure:
- WER (should hit 4.8–7.2% per published benchmark)
- Real-time factor (RTF)
- Throughput: how many concurrent streams can one H100 handle?

**Acceptance criteria:**
- [ ] ivrit-ai WER confirmed against the published leaderboard within ±2%
- [ ] Throughput measured (e.g., "8 concurrent streams at RTF 0.15")
- [ ] Documented in `bench/notes/hebrew-self-host.md`

---

### TASK 2.5 — Self-host Levantine Whisper test
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 4h · **Cost:** ~$30 · **risk**

Same RunPod box. Try:
- `CarmiShimon/WhisperLevantineArabic` — author's community fine-tune
- `openai/whisper-large-v3` baseline
- `facebook/seamless-m4t-v2-large` baseline

Compare WER on the 4 sub-dialects.

**Acceptance criteria:**
- [ ] Comparison table vs commercial Scribe
- [ ] Determine if self-hosted Levantine is *ever* competitive

---

### MILESTONE: 🚦 Week 2 decision gate
**Question:** Does each language have at least ONE STT option with WER < 15%?

- 🟢 All 3 do → continue to Week 3 as planned
- 🟡 Only 2 do → flag the third for scope reduction, continue
- 🔴 Fewer than 2 do → STOP. Reassess whether the platform vision is viable at all.

---

## WEEK 3 — TTS Benchmark + Listener Panel
*Goal: pick the winning TTS provider per language, validated by native listeners.*

### TASK 3.1 — Generate TTS samples for all 3 languages
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 6h · **Depends on:** 1.1

Create a fixed set of **20 sentences per language** representing:
- 5 formal (news-style)
- 5 conversational (customer service)
- 5 with proper names + numbers (the hard cases)
- 3 with code-switching
- 2 emotion-laden (apology, enthusiasm)

Generate each sentence through every provider × every voice (3 voices per provider):
- ElevenLabs Multilingual v2 (3 voices/lang)
- Azure Neural (top 2 voices/lang)
- Google Cloud (top 2 voices/lang)
- OpenAI gpt-4o-mini-tts (Hebrew/Greek only)
- Coqui XTTS-v2 (open-source, RunPod)

**Acceptance criteria:**
- [ ] All audio files in GCS, organized by `{language}/{provider}/{voiceId}/sent_{i}.wav`
- [ ] Master CSV listing all (sentence, language, provider, voice, gcsUrl, durationMs, costEstimate)

---

### TASK 3.2 — Recruit & run native listener panel
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 4h coordination · **Cost:** ~$650 · **Labels:** listener

Hire 5 native listeners per language on Fiverr:
- **Hebrew**: 5 Israelis, mixed ages/genders (~$30 each)
- **Greek**: 5 Greeks (~$40 each — slightly harder to find)
- **Levantine**: 5 native Levantine Arabic speakers, ideally spanning the 4 sub-dialects (~$50 each)

Brief: "Rate each clip 1–5 on Naturalness, Intelligibility, Accent Authenticity. 30 min of work. Use this URL: [bench page URL]."

Provide each listener a token-link to the `/bench` rating tab (Task 1.2).

**Acceptance criteria:**
- [ ] 15 listeners completed all ratings
- [ ] At least 3 ratings per (provider × voice × sentence) combination
- [ ] Inter-rater agreement spot-checked (no single rater dominates)

---

### TASK 3.3 — Synthesize TTS findings
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 3h · **Depends on:** 3.2

Build the per-language winners table. For each language:
- Best voice on Naturalness
- Best voice on Accent Authenticity
- Best cost-adjusted pick
- "Acceptable for production?" verdict

**Acceptance criteria:**
- [ ] Document in `bench/reports/tts-results.md`
- [ ] Clear per-language winner identified

---

### MILESTONE: 🚦 Week 3 decision gate
**Question:** Does each language have a stock TTS option with Naturalness MOS ≥ 3.8?

- 🟢 All 3 do → skip Week 4 (no voice cloning needed). Move to Week 5.
- 🟡 Levantine fails (most likely outcome) → execute Week 4 PVC plan.
- 🔴 Hebrew or Greek fails → flag for Phase 2 fine-tuning investigation; don't block Phase 1.

---

## WEEK 4 — Voice Cloning POC (Conditional)
*Only execute if Week 3 showed Levantine TTS is unacceptable with stock voices.*

### TASK 4.1 — Hire 2 Levantine voice talents for cloning
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 6h · **Cost:** ~$300 · **Labels:** audio

Hire:
- 1 Lebanese voice (female, ~30 min studio audio) — $150
- 1 Syrian voice (male, ~30 min studio audio) — $150

Recording brief: clean reads in a quiet room, 16-bit 44.1kHz minimum. Provide a script of ~5,000 words covering varied sentence types.

**Acceptance criteria:**
- [ ] Two clean audio files, each ≥ 30 min, < -30dB noise floor
- [ ] Speaker permission/usage rights captured (ElevenLabs PVC requires this — they have a form)

---

### TASK 4.2 — Upload to ElevenLabs PVC + generate samples
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 4h · **Cost:** $99 (Pro tier 1 month) · **Depends on:** 4.1

- Subscribe to ElevenLabs Pro tier ($99/month)
- Create 2 Professional Voice Clones from the 30-min recordings
- Generate the same 20 sentences from Task 3.1 with the cloned voices

**Acceptance criteria:**
- [ ] 2 PVCs created, available in ElevenLabs voice library
- [ ] 40 generated samples in GCS

---

### TASK 4.3 — Listener panel — cloned voices vs stock
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 2h · **Cost:** ~$200 · **Depends on:** 4.2

Re-run the listener panel for Levantine only, A/B testing cloned vs best stock voice from Week 3. Add a binary "Sounds Levantine?" question.

**Acceptance criteria:**
- [ ] At least 4 Levantine native listeners completed rating
- [ ] "Sounds Levantine?" pass rate ≥ 80% on cloned voices

---

### MILESTONE: 🚦 Week 4 decision gate
**Question:** Did PVC achieve dialect-authentic Levantine voice?

- 🟢 Yes → adopt PVC as production approach. Budget for ~$120/month ElevenLabs Pro + per-character usage.
- 🔴 No → Levantine is going to be the launch-blocker. Either drop Levantine from initial scope, OR plan a multi-month voice training effort (Azure Custom Neural Voice with much more audio).

---

## WEEK 5 — End-to-End & Cost Model
*Goal: real phone call latency + a defendable per-minute COGS spreadsheet.*

### TASK 5.1 — Wire winning cascade into existing mediastream service
**Status:** ⬜ · **Owner:** [E] · **Estimate:** 8h · **Depends on:** 2.x, 3.x, optionally 4.x

For each language, configure a winning cascade variant in `cloud-run/mediastream`. Use feature flag `BENCH_MODE=<lang>` to switch between providers. Goal is to be able to make a real phone call and use the candidate stack.

**Acceptance criteria:**
- [ ] Hebrew cascade routes real calls through winning STT + LLM + TTS
- [ ] Greek cascade routes real calls
- [ ] Levantine cascade routes real calls (with PVC voice if Week 4 confirmed)

---

### TASK 5.2 — Run 10 test calls per language
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 4h · **Depends on:** 5.1

Make 10 real calls to your Twilio number per language. Use a phone stopwatch app to measure:
- Time from "end of user utterance" to "first audible bot syllable"
- Subjective experience: feels natural? robotic?

Capture each call. Annotate latency at every turn boundary.

**Acceptance criteria:**
- [ ] 30 call recordings saved
- [ ] p50 + p95 turn latency per language documented

---

### TASK 5.3 — Side-by-side NLPearl comparison
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 3h · **Depends on:** 5.1

For each language, call your stack AND NLPearl with the same conversational script. Transcribe both. Compare:
- Turn latency
- Response naturalness
- Error recovery (mishearings, mid-sentence corrections)

**Acceptance criteria:**
- [ ] 3 side-by-side recordings (one per language)
- [ ] Subjective comparison written in `bench/reports/nlpearl-comparison.md`

---

### TASK 5.4 — Cost model spreadsheet
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 4h · **Depends on:** 2.x, 3.x, 4.x

Build `bench/cost-model.xlsx` (or Google Sheets) with:

| Row | Columns |
|---|---|
| Each component × each language | 100K min/mo, 1M min/mo, 10M min/mo |

Include:
- Commercial API pricing (use measured cost from your bench runs, not just list price)
- Self-host break-even calculations (Hebrew STT on 1 H100)
- Telephony comparison (Twilio vs Telnyx vs Signalwire wholesale)
- Total cascade COGS per minute per language per volume

**Acceptance criteria:**
- [ ] Spreadsheet has all 3 languages × 3 volume tiers
- [ ] Break-even point for self-hosting documented per language
- [ ] Sensitivity analysis: ±20% on each component cost

---

### MILESTONE: 🚦 Week 5 decision gate
**Question:** Is end-to-end p95 latency < 1,200ms AND COGS at 1M min/mo ≤ $0.10?

- 🟢 Both true → strong GO signal
- 🟡 One fails → identify the bottleneck, scope a fix in Phase 2
- 🔴 Both fail → reconsider whether competing on cost is viable

---

## WEEK 6 — Report & Phase 2 Spec

### TASK 6.1 — Write 15-page decision report
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 10h · **Depends on:** all 2.x, 3.x, 5.x

Structure (template in `docs/phase1-report-template.md`):
1. Executive summary (1 page)
2. Methodology (1 page)
3. Hebrew findings (3 pages)
4. Greek findings (3 pages)
5. Levantine findings (3 pages)
6. Cost model (2 pages)
7. Phase 2 recommendation (1 page)
8. Risks & open questions (1 page)

**Acceptance criteria:**
- [ ] Report PDF generated
- [ ] All numerical claims linked to a row in the bench data
- [ ] At least 2 reviewers (e.g., a technical friend) signed off

---

### TASK 6.2 — Spec Phase 2 if GO
**Status:** ⬜ · **Owner:** [Y] · **Estimate:** 6h · **Depends on:** 6.1

If decision is 🟢 GO, write Phase 2 scope:
- Migration plan from Twilio to Telnyx/Signalwire (or stay)
- Self-host adoption roadmap (when/where to add H100s)
- Outbound campaign engine spec
- Hiring plan (engineers, voice talent, sales)
- 12-month financial model with assumed customer ramp

**Acceptance criteria:**
- [ ] Phase 2 doc reviewed
- [ ] Budget approved (or NOT approved — also a valid outcome)

---

### MILESTONE: 🏁 PHASE 1 COMPLETE

**Final decision:**
- 🟢 GO → Phase 2 starts Week 7
- 🟡 GO with scope reduction → drop weakest language, plan revised
- 🔴 NO-GO → keep the NLPearl integration we built; this market position isn't ours to compete in

---

## ❄️ Out of Phase 1 scope (intentionally deferred)

- Twilio replacement — Phase 2
- GPU fleet procurement — Phase 2 or 3
- Outbound campaign engine — Phase 2
- New hires — Phase 2 only if 🟢 GO
- Compliance / SOC2 work — Phase 3
- Multi-tenant billing redesign — Phase 2
- Custom Greek voice cloning — only if Greek stock fails Week 3 panel
- Self-host TTS attempts — explicitly skipped (research shows none are competitive for these languages)

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Levantine TTS still bad after PVC | Medium | High | Plan: hire 4 Levantine voice talents in Week 7, train Azure Custom Neural Voice with 1+ hour each |
| Greek benchmarks fail entirely | Low | Medium | Plan: drop Greek from initial launch, revisit in Year 2 |
| ElevenLabs Scribe Levantine sub-dialect support is marketing only | Medium | High | Plan: have an Arabic-speaking native run blind dialect-ID test on 20 Scribe transcripts; if fails, fall back to Whisper + dialect classifier preprocessor |
| Fiverr voice talent quality varies wildly | Medium | Medium | Plan: order multiple samples per dialect, pick best |
| Engineer (you or contractor) takes longer than 120h | High | Low | Plan: it's OK — most tasks are I/O-bound waiting for APIs |
| Cost exceeds $2,500 | Medium | Low | Plan: $300 contingency built in; if blowing budget, cut Greek scope |

---

## Tooling recommendation

| Need | Pick |
|---|---|
| Project board | **Notion** (paste this markdown into a new page → "Convert to database" for the TASK blocks) — or **Linear** if you prefer keyboard-driven |
| Audio annotation | **Label Studio** (open source) for transcript correction |
| Cost model spreadsheet | Google Sheets — easier to share |
| Test call recordings | Twilio's built-in recording feature, already wired in |
| Document storage | Firestore `bench_*` collections + GCS for audio |
| Repository | Existing `voice-flow-ai` repo with new `/bench` subtree |

---

## How to import this into Notion

1. Create a new Notion page
2. Type `/import` → choose Markdown → paste this file
3. For each `### TASK X.X` heading, select the heading + its content, right-click → "Turn into database"
4. Add columns: Status, Owner, Estimate, Labels, Depends On
5. Filter by Week to get a kanban view per week

## How to import into Linear

1. Create a new project "Phase 1 — Voice AI Validation"
2. For each `### TASK X.X` create an issue
3. Use `Estimate` as story points (round up to hour estimate)
4. Add Cycle = Week N
5. Set up labels matching the `**Labels:**` field on each card

---

*Last updated: this file is the source of truth for Phase 1. Update task statuses inline as you progress.*
