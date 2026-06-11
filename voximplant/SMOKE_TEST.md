# Voximplant smoke test — first end-to-end call

Once the test number is verified in Voximplant, three things must be true
before you place a call:

1. The Cloud Run mediastream service is deployed with the
   `/voximplant/stream/:callSessionId` endpoint live (already deployed
   this session — verify with `curl https://<cloud-run-url>/health`).
2. A Firestore `Company/{companyId}` doc has the Voximplant credentials.
3. The Voximplant scenario in the dashboard has the latest scenario.js
   content (including the wss:// protocol fix). If you set it up before
   that fix, update the scenario script.

## Step 1: Update Company doc with Voximplant credentials

Open the Firebase Console → Firestore → Company collection. Pick whichever
company you're using as the test tenant (or create a new one with id
`vox-smoke-test`). Set these fields:

```json
{
  "name": "Voximplant Smoke Test",
  "telephonyProvider": "voximplant",
  "voxAccountId":      "9553670",
  "voxApiKey":         "<the Management API key you copied>",
  "voxRuleId":         "1516111",
  "voxAppName":        "voiceflow-test",
  "voxCallerId":       "<the verified test number, E.164>"
}
```

## Step 2: Update the scenario in Voximplant (only if you set it up
before the protocol fix)

The first version of `voximplant/scenario.js` didn't convert https:// to
wss:// when constructing the WebSocket URL. VoxEngine requires wss://, so
this would fail silently. Re-paste the current scenario.js content into
the `voiceflow-bridge` scenario in the Voximplant dashboard.

The fix is just one block: where you previously had

```js
const base = CLOUD_RUN.replace(/\/+$/, "");
const wsUrl = base + "/voximplant/stream/" + ...
```

it's now

```js
let base = CLOUD_RUN.replace(/\/+$/, "");
if (base.indexOf("http://")  === 0) base = "ws:"  + base.slice(5);
if (base.indexOf("https://") === 0) base = "wss:" + base.slice(6);
const wsUrl = base + "/voximplant/stream/" + ...
```

## Step 3: Place the test call

Use the existing `placeCall` Firebase Function. From a logged-in admin
user's browser console, or via curl with an ID token:

```js
await fetch("https://placecall-myg46khq7q-uc.a.run.app", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${await firebase.auth().currentUser.getIdToken()}`,
  },
  body: JSON.stringify({
    leadNumber: "+972XXXXXXXXX",   // your verified test number
    assistantId: "<an existing assistant id from the test tenant>",
  }),
});
```

Expected sequence over the next ~5 seconds:

1. **Firebase log**: `[VoxImplant] Scenario started for session <id>`
2. **Your phone**: starts ringing
3. **Voximplant scenario log** (View → Scenarios → voiceflow-bridge →
   Sessions → click latest): `[VFA] dialing +972…` then `[VFA] call
   connected` then `[VFA] opening WS to wss://…/voximplant/stream/…`
4. **Cloud Run log** (`/admin/logs` filtered by callSessionId):
   `[VOX-WS] New connection: callSessionId=…` then `[VOX-WS] hello from
   session …` then GeminiBridge logs (`[GL] connecting`, `[GL] connected
   to Gemini Live`, `[GL] setup confirmed — session ready`)
5. **You answer**: should hear the Hebrew greeting within ~1 second
6. **Speak**: bot transcribes and responds

If audio is one-way:
- Inbound only (you hear bot, bot doesn't hear you): scenario isn't
  bridging caller→ws. Check VoxEngine logs for `sendMediaTo` errors.
- Outbound only (bot hears you, you don't hear bot): adapter isn't
  decoding µ-law back to PCM. Check Cloud Run logs for
  `[VOX-WS] send pcm to voxWs failed`.

If audio is garbled both ways: µ-law conversion is wrong. The codec was
unit-tested (`node --test voximplant_audio.test.js`) so this is unlikely
unless VoxEngine is sending a different format than PCM16LE@8k. Check
the binary frame size — should be a multiple of 320 bytes (20ms = 160
samples × 2 bytes) per frame.

If the scenario fails immediately:
- "WS error" with no further detail → the scenario's WS URL is wrong.
  Check the scenario log line `[VFA] opening WS to <url>` — should be
  `wss://`, not `https://`.
- "missing_cloudRunUrl" → the Voximplant scenario isn't receiving
  cloudRunUrl in customData. Check the StartScenarios call in
  voice_service.js sets cloudRunUrl from CLOUD_RUN_URL env.

## Step 4: Latency baseline

Once a call is working, measure end-to-end. The Cloud Run log emits:

```
[<sessionId>] [GL] Triggering greeting (+<elapsed>ms)
[VOX-WS] hello from session … (the bridged-at timestamp from the scenario)
```

The gap between Voximplant `call.connected` webhook and the first bot
audio frame back on your phone is the latency budget. Target: P50 < 1s,
P95 < 1.5s. If you're over, the Cloud Run-side prewarm (#63) might need
another pass since adding a hop has surfaced new slack.
