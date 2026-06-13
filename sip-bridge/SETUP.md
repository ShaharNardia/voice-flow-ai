# VoiceFlow SIP Bridge — Linux Server Setup

This guide sets up the SIP Bridge on a Linux server that already has Asterisk installed and configured by the SIP operator.

---

## Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Asterisk 18+ already installed
- Node.js 18+ installed
- The SIP operator has configured Asterisk to receive calls on this server
- Port 3000 TCP open (bridge REST API — reachable from Firebase / GCP)
- Ports 7000–7100 UDP open (RTP media, localhost only)
- Port 8088 TCP available on localhost (Asterisk ARI — internal only)

---

## Step 1 — Configure Asterisk ARI

Add to `/etc/asterisk/ari.conf`:

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[voiceflow]
type = user
password = vf_bridge_2024_secure
read_only = no
```

Add to `/etc/asterisk/extensions.conf` (or equivalent):

```ini
[from-sip]
exten => _X.,1,NoOp(VoiceFlow inbound: ${CALLERID(num)} → ${EXTEN})
 same => n,Stasis(voiceflow-app)
 same => n,Hangup()
```

Add to `/etc/asterisk/http.conf`:

```ini
[general]
enabled = yes
bindaddr = 127.0.0.1
bindport = 8088
```

Reload Asterisk:
```bash
asterisk -rx "core reload"
asterisk -rx "ari show apps"   # should show: voiceflow-app
```

---

## Step 2 — Install the SIP Bridge

```bash
# Copy the sip-bridge/ folder to the server
cd /opt/voiceflow/sip-bridge

# Install dependencies
npm install --omit=dev

# Create the .env file
cp .env.example .env
nano .env
```

Fill in `.env`:

```env
ARI_URL=http://127.0.0.1:8088
ARI_USER=voiceflow
ARI_PASS=vf_bridge_2024_secure
ARI_APP=voiceflow-app
PORT=3000

# Must match BRIDGE_SECRET in Firebase Functions + Cloud Run envs
BRIDGE_SECRET=vf_bridge_2024_secure

# Firebase Cloud Functions
FIREBASE_URL=https://us-central1-voiceflow-ai-202509231639.cloudfunctions.net

# Cloud Run media stream
CLOUD_RUN_URL=https://voiceflow-mediastream-900818829902.us-central1.run.app

# Google Cloud TTS — download service account JSON from GCP Console
# IAM → Service Accounts → voiceflow → Keys → Add Key → JSON
GOOGLE_APPLICATION_CREDENTIALS=/opt/voiceflow/sip-bridge/service-account.json
TTS_LANGUAGE=he-IL
TTS_VOICE=he-IL-Wavenet-D

# RTP ports (make sure these are open on localhost, not public internet)
RTP_PORT_START=7000
RTP_PORT_END=7100
```

---

## Step 3 — Run with PM2

```bash
npm install -g pm2

# Start the bridge
pm2 start index.js --name voiceflow-bridge

# Save and enable autostart
pm2 save
pm2 startup
# Run the command PM2 outputs

# View logs
pm2 logs voiceflow-bridge
```

---

## Step 4 — Configure Firebase + Cloud Run to Use the Bridge

Once the bridge is running and you confirm inbound calls work (Step 5), set these environment variables:

### Firebase Functions
Edit `firebase/functions/.env`:
```env
SIP_BRIDGE_URL=http://YOUR_SERVER_IP:3000
SIP_BRIDGE_SECRET=vf_bridge_2024_secure
```
Then redeploy:
```bash
cd firebase
firebase deploy --only functions --project voiceflow-ai-202509231639
```

### Cloud Run
```bash
gcloud run services update voiceflow-mediastream \
  --region us-central1 \
  --project voiceflow-ai-202509231639 \
  --update-env-vars "SIP_BRIDGE_URL=http://YOUR_SERVER_IP:3000,SIP_BRIDGE_SECRET=vf_bridge_2024_secure"
```

---

## Step 5 — Test

1. **Health check** from any machine:
   ```bash
   curl http://YOUR_SERVER_IP:3000/health
   # Expected: {"status":"ok","ariConnected":true,"activeCalls":0,...}
   ```

2. **Make a test call** to the DID number (e.g. 0747054937)

3. **Watch bridge logs** in real-time:
   ```bash
   pm2 logs voiceflow-bridge
   ```
   You should see:
   ```
   [ARI] Inbound call: 05XXXXXXXX → 747054937
   [Call] CA... answered
   [Webhook] POST .../twilioVoiceWebhook ...
   [TwiML] <Stream> ...
   [Audio] Bridge started — RTP port 7000, WS → wss://...
   ```

4. **Speak** — the AI assistant should respond in Hebrew

---

## Firewall Summary

| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 3000 | TCP | Inbound from GCP (Firebase Functions + Cloud Run) | Bridge REST API |
| 5060 | UDP | Inbound from SIP operator | SIP signaling |
| 10000–20000 | UDP | Inbound from SIP operator | RTP media (Asterisk) |
| 7000–7100 | UDP | Localhost only | Bridge ↔ Asterisk ExternalMedia |
| 8088 | TCP | Localhost only | Asterisk ARI WebSocket |

---

## Troubleshooting

**`ariConnected: false` in health check**
- Check Asterisk is running: `asterisk -rx "core show version"`
- Check ARI is enabled: `asterisk -rx "ari show status"`
- Verify `ari.conf` credentials match `.env`

**Call arrives at Asterisk but bridge doesn't fire**
- Check `extensions.conf` has `Stasis(voiceflow-app)` for the DID
- Check `pm2 logs voiceflow-bridge` for errors

**Firebase webhook returns error**
- Verify `FIREBASE_URL` in `.env` is the correct Cloud Functions base URL
- Verify the DID (e.g. `747054937`) is configured in Firestore `sip_trunks.dids[]`

**No audio / AI doesn't speak**
- Check `GOOGLE_APPLICATION_CREDENTIALS` path and JSON is valid
- Check Cloud Run URL in `.env` matches actual Cloud Run service URL
- Verify ports 7000–7100 UDP are NOT blocked on localhost

---

## Per-assistant routing (Twilio vs SIP)

Routing is per-assistant: each assistant doc has a `telephonyProvider` field
(`"twilio"` or `"sip"`, default `"twilio"`). Switching an assistant takes
effect on the next call.

### Switch an assistant to SIP

1. Make sure `SIP_BRIDGE_URL` and `SIP_BRIDGE_SECRET` are set on **both**:
   - Firebase Functions: `firebase/functions/.env` then `firebase deploy --only functions`
   - Cloud Run `voiceflow-mediastream`:
     ```bash
     gcloud run services update voiceflow-mediastream \
       --region us-central1 --project voiceflow-ai-202509231639 \
       --update-env-vars "SIP_BRIDGE_URL=http://YOUR_IP:3000,SIP_BRIDGE_SECRET=...,SIP_CARRIER_RATE_PER_MIN=0.005"
     ```
2. Open the assistant editor → **Telephony Carrier** section → click **SIP Trunk**.
3. Save.
4. Place a test call. The Cloud Run logs should show
   `Costs: gemini=$… carrier(sip)=$… total=$…` after the call ends, confirming
   the SIP rate (default `$0.005/min`) was used instead of Twilio's `$0.018/min`.

### How outbound routing decides

```
placeCall(assistantId, leadNumber)
  → load assistant doc
  → if assistant.telephonyProvider === "sip"
        AND SIP_BRIDGE_URL set
        AND bridge health check is OK
     then: POST {to,from,url} to sip-bridge `/calls`
            → bridge ARI-originates via the configured trunk
            → on answer, fires twilioVoiceWebhook (impersonating Twilio)
            → Cloud Run receives the WS as if it were Twilio Media Streams
  → else: Twilio REST API (legacy path, unchanged)
```

If the bridge POST fails, the call automatically falls back to Twilio. The
session doc gets `telephonyProvider: "twilio (sip-fallback)"` so you can grep
audit logs for fallbacks.

### How inbound routing decides

Inbound calls hit Asterisk first (because the SIP trunk operator routes them
there). The bridge then fires `twilioVoiceWebhook` with the DID, which looks up
the assistant via `Company.phoneNumberMap`. The assistant's `telephonyProvider`
is *informational* on the inbound path — the carrier is already SIP because
the call already entered through Asterisk. Cloud Run reads the field to
attribute cost correctly.

### Cost tracking

Cloud Run reads `call_sessions/{id}.telephonyProvider` and the
`SIP_CARRIER_RATE_PER_MIN` env var (default `0.005`) to compute the carrier
cost line. Set the env var to match your operator's rate:

```bash
gcloud run services update voiceflow-mediastream \
  --region us-central1 --project voiceflow-ai-202509231639 \
  --update-env-vars "SIP_CARRIER_RATE_PER_MIN=0.0035"
```

### Required env vars at a glance

| Service | Env var | Required for SIP | Purpose |
|---|---|---|---|
| Firebase Functions | `SIP_BRIDGE_URL` | ✓ | Where to POST for outbound + updateCall |
| Firebase Functions | `SIP_BRIDGE_SECRET` | ✓ | Bearer header `x-bridge-secret` |
| Cloud Run mediastream | `SIP_BRIDGE_URL` | ✓ | Where to POST for in-call hangups |
| Cloud Run mediastream | `SIP_BRIDGE_SECRET` | ✓ | Same secret |
| Cloud Run mediastream | `SIP_CARRIER_RATE_PER_MIN` | optional | Default `0.005`; override per your operator |
| SIP bridge (on Asterisk server) | `SIP_OUTBOUND_TRUNK` | optional | Trunk name for outbound originate; auto-detects from pjsip.conf if unset |
| SIP bridge | `SIP_DIAL_TIMEOUT_SEC` | optional | Ring timeout, default 30s |

### Verifying it works end-to-end

After setting an assistant to SIP and placing a call:

```bash
# Watch the bridge logs
pm2 logs voiceflow-bridge

# In a separate terminal, watch Cloud Run logs
gcloud logging tail --project voiceflow-ai-202509231639 \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="voiceflow-mediastream"'
```

Expected sequence:
```
[CallManager] Outbound originate: +972... → +972... via my-trunk (callSid=CA…)
[ARI] Outbound answered: +972... (callSid=CA…)
[Webhook] POST .../twilioVoiceWebhook
[TwiML] <Connect><Stream url="wss://voiceflow-mediastream.../stream/...">
[GL] Twilio connected     ← Cloud Run thinks it's Twilio
[GL] connected to Gemini Live
…
[GL] Costs: gemini=$0.001 carrier(sip)=$0.0008 total=$0.0018 (12s)  ← SIP rate applied
```
