# Voximplant integration — operator runbook

This folder contains the Voximplant-side artefacts needed to bridge a
Voximplant call into our Cloud Run mediastream service.

## Architecture (one paragraph)

PSTN call hits a Voximplant DID → triggers a Voximplant **Rule** → which
runs the **scenario** in `scenario.js` → which opens a WebSocket to our
Cloud Run mediastream (`wss://<run-url>/voximplant/stream/<callSessionId>`)
→ Cloud Run runs the Gemini Live / OpenAI Realtime bridge → audio flows
both ways. Lifecycle events (`ringing`, `connected`, `completed`, `failed`)
POST back to our Firebase `voxImplantWebhook` so Firestore stays in sync.

```
PSTN ──► Voximplant ─(scenario.js)─► WebSocket ──► Cloud Run ──► Gemini Live
                                                       │
                                                       ▼
                                            Firestore call_sessions
```

Twilio path is unchanged and continues to work. Voximplant is **additive**:
both providers selectable via `Company.telephonyProvider`.

## One-time setup in Voximplant

1. **Create / pick an Application** in the Voximplant control panel.
2. **Upload `scenario.js`** as a Scenario under that Application.
3. **Create a Rule** that matches a pattern (`.*` for catch-all, or a
   specific DID) and binds the Scenario.
4. **Buy or import a DID**, attach it to the Application.
5. **Generate an API key** with the *Calls* scope (Settings → Service
   Accounts → Create).
6. Note these four values — they get stored on the Company doc:
   - `voxAccountId`  — top of the dashboard
   - `voxApiKey`     — from step 5
   - `voxRuleId`     — from step 3 (URL when you open the rule)
   - `voxCallerId`   — the DID from step 4 (E.164 format, e.g. `+12025550199`)

## Per-tenant config

Store on the Firestore `Company/{companyId}` document:

```json
{
  "telephonyProvider": "voximplant",
  "voxAccountId": "12345",
  "voxApiKey":    "abc…xyz",
  "voxRuleId":    "67890",
  "voxAppName":   "voiceflow",
  "voxCallerId":  "+12025550199"
}
```

Once these are set, `placeCall` in `voice_service.js` automatically
dispatches outbound calls through Voximplant instead of Twilio for that
tenant. Inbound calls hit Voximplant directly via the Rule.

## Webhook endpoint

Our Firebase Function `voxImplantWebhook` is at:

```
https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net/voxImplantWebhook
```

The scenario auto-includes this in its `customData` payload. No DNS or
auth setup required — the scenario stamps each event with `callSessionId`
so the function can correlate.

## What still needs engineering work

The structural pieces are in place — provider dispatch, scenario script,
webhook, Cloud Run endpoint. The remaining item is **audio protocol
translation** on the Cloud Run side. See the TODO block in
`cloud-run/mediastream/index.js` at the `/voximplant/stream/:callSessionId`
handler. Concretely:

1. Voximplant `sendMediaTo(ws)` emits **PCM16 signed LE @ 8 kHz** as binary
   frames. Twilio emits base64 mulaw @ 8 kHz in JSON envelopes.
2. Convert PCM16 → mulaw inbound (caller → Gemini), and mulaw → PCM16
   outbound (Gemini → caller).
3. Reuse the existing `GeminiBridge` / `RealtimeBridge` — only the
   transport wrapper differs.

Estimated: 2–3 days for a working bridge, 1 week to match the Twilio
path's recording / telemetry / cost-tracking parity.

## Failure modes & rollback

- **Voximplant outage** — if `placeCallViaVoxImplant` returns
  `success: false`, `voice_service.js` already falls back to Twilio (the
  `voximplant-fallback` provider tag on the session). No code change needed.
- **Bad API key / Rule** — Voximplant returns `result !== 1` which we log
  and treat as call.failed. Tenant sees the error in `/admin/logs`.
- **WS handshake failure** — the scenario emits `call.failed` with reason
  `ws_error`; the PSTN leg auto-hangs up. Caller hears silence then dialtone.

## Demo prerequisites for Kate

1. Voximplant account with credentials in `Company/<demoCompanyId>`
2. A Hebrew-region DID provisioned to the Voximplant Rule
3. `scenario.js` uploaded
4. White-label set to `{ productName: "Voximplant Intelligence",
   primaryColor: "#0077B6", footerText: "Powered by Voximplant" }` in
   `/admin/branding`
5. Cloud Run audio bridge implementation completed (see TODO above)
