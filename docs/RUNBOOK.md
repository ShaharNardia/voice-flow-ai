# Incident Runbook

Production project: **voiceflow-ai-202509231639** (region us-central1).

## Deploy targets (memorize — wrong targets caused real incidents)

| What | Command |
|---|---|
| Frontend | `scripts/deploy.sh hosting` |
| One function | `scripts/deploy.sh functions placeCall` |
| All functions | `scripts/deploy.sh functions` |
| Voice service (Cloud Run) | `scripts/deploy.sh mediastream` |

⚠️ The Cloud Run voice service is **`voiceflow-mediastream`**, not `mediastream`
(stale sibling) or `twiliomediastream`. Always deploy via `scripts/deploy.sh`,
which targets the right service and `cd`s into the right source dir.

## Fast diagnosis

- **Per-call logs:** `/admin/logs` (filter by call session ID) or
  `/calls/detail/?id=<sessionId>` (Technical Diagnostics panel).
- **Integration health:** `/admin/health` (8 providers, 30s refresh).
- **Cloud Run logs:** `gcloud logging read 'resource.labels.service_name="voiceflow-mediastream"' --project voiceflow-ai-202509231639 --limit 50 --freshness 1h`

## Common incidents

### Calls fail / dead air
1. `/admin/health` — is Gemini / OpenAI / Deepgram / ElevenLabs / Twilio green?
2. Grep Cloud Run logs for the session: look for `GREETING_NOT_HEARD`,
   `WS error`, `setup confirmed`.
3. Rollback the voice service: `gcloud run services update-traffic voiceflow-mediastream --region us-central1 --to-revisions <PREV_REVISION>=100`

### An API key broke a feature
- Rotate via `/admin/api-keys` (writes to Secret Manager — the source of truth).
- OPENAI_API_KEY and ELEVENLABS_API_KEY are Secret Manager secrets. Do **not**
  add them to `firebase/functions/.env` — a plain-env copy shadows the secret
  and silently breaks rotation.

### Wrong telephony provider / bad routing
- Voximplant is **per-assistant** (`assistant.telephonyProvider="voximplant"`),
  not company-wide. A company-level flag does NOT route calls (by design, after
  the 2026-06-10 incident). To force an assistant back to Twilio, clear its
  `telephonyProvider` or set it to `"twilio"`.

### Hebrew bot drifts to other languages mid-call
- Known Gemini Live limitation. Switch the assistant's Voice Provider to
  **Standard** with an **ElevenLabs** Hebrew voice (Deepgram-he STT + ElevenLabs
  TTS), or **Voice-to-Voice** (OpenAI Realtime). See docs/HEBREW.md.

## Voximplant inbound test

Validates an inbound Voximplant call end-to-end. The backend "inbound brain"
(`inbound.start`) is verified; the VoxEngine scenario half needs a live call.

**Setup (in the Voximplant panel):**
1. Scenarios → paste `voximplant/scenario.js`, save.
2. Attach it to a Rule on the app; point a DID at that rule.
3. In our UI: Phone Numbers → **Add Manually** the DID (defaults to Voximplant),
   then ⚙ → assign an assistant whose Voice Provider is **gemini-hybrid**
   (so `inbound.start` resolves the DID → builds a realtime session).

**Verify the backend resolver first (no call needed):**
```bash
curl -s -X POST https://voximplantwebhook-myg46khq7q-uc.a.run.app \
  -H "Content-Type: application/json" \
  -d '{"event":"inbound.start","from":"+972500000000","to":"<DID digits>"}'
# Expect: {"ok":true,"callSessionId":"VX…","cloudRunUrl":"…","assistantName":"…"}
# 404 "No assistant mapped" → the DID isn't in any Company.phoneNumberMap yet.
```

**Place the call, capture both logs:**
- Voximplant scenario **Logger**: expect `inbound bootstrap ok: session=VX…`,
  `WS open`. Watch for `sendMediaTo failed` or `inbound bootstrap failed`.
- Cloud Run: `connected to Gemini Live → Triggering greeting →
  turn complete (turnAudioBytes>0)`.
  ```bash
  gcloud logging read 'resource.labels.service_name="voiceflow-mediastream" AND textPayload:"VX…"' \
    --project voiceflow-ai-202509231639 --freshness=15m --format="value(timestamp,textPayload)" | sort
  ```

**Interpreting failure:**
| Symptom | Cause | Fix |
|---|---|---|
| Logger has no `WS open` | bootstrap failed / wrong webhook URL | check the curl above; confirm `DEFAULT_WEBHOOK_URL` in scenario.js |
| Cloud Run never logs the `VX…` session | WS never connected | check the `/voximplant/stream` URL the scenario built |
| Audio garbled / wrong speed | VoxEngine WS media ≠ PCM16 @ 8 kHz | adjust the codec/sample-rate in `voximplant_audio.js` |
| `turnAudioBytes>0` but caller hears nothing | `ws.sendMediaTo(call)` not bridged | check the scenario's `openBridge()` media wiring |

Two assumptions only a live call confirms: VoxEngine WS media format (raw PCM16
@ 8 kHz binary) and the VoxEngine API surface (`createWebSocket`, `sendMediaTo`,
`Net.httpRequestAsync().then`).

## Rollback

- **Cloud Run:** revisions are retained. List: `gcloud run revisions list --service voiceflow-mediastream --region us-central1`. Shift traffic: `gcloud run services update-traffic voiceflow-mediastream --region us-central1 --to-revisions <REV>=100`.
- **Functions:** redeploy the previous commit's function.
- **Hosting:** `firebase hosting:rollback` (Firebase console → Hosting → release history).

## Escalation / on-call

- Primary: info@lancelotech.com
- (Add secondary contact + phone here.)
- Third-party status: Twilio status.twilio.com · Deepgram status.deepgram.com ·
  OpenAI status.openai.com · ElevenLabs status.elevenlabs.io · Google Cloud
  status.cloud.google.com
