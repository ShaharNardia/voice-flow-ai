# Asterisk → VoiceFlow — Complete Setup & Test

> ## ⚠️ READ FIRST — two paths, do not mix them
> This document has a **greenfield path** (Path A) that *replaces* `extensions.conf`
> and adds a *static* trunk. **DO NOT apply Path A to an existing PBX.**
>
> If your Asterisk already runs a production dialplan (queues, conferences,
> routing) and/or **PJSIP Realtime** (`ps_endpoints => odbc`, endpoints in the DB) —
> e.g. the **mAIestro** PBX — applying Path A's file replacements will **destroy**
> your dialplan and collide with your existing trunk. Use **Path B (additive)**
> below instead: it touches **only** `ari.conf` (added section) + runs the bridge +
> sets cloud env vars, and changes **nothing** in your PBX.
>
> Quick test for which path you're on:
> ```bash
> asterisk -rx "dialplan show" | wc -l      # >100 lines → existing PBX → Path B
> asterisk -rx "pjsip show endpoints"       # endpoints you didn't put in pjsip.conf → Realtime → Path B
> ```

---

## Path B — Existing PBX (additive, non-destructive)  ← use this if in doubt

Your DID routing already sends AI calls to `Stasis(voiceflow-app)` (e.g. a DID with
`route_type = "AI / Stasis"`). The telephony is already wired. The bot is silent
only because the **bridge process isn't running** (`ari show apps` is empty — the
`voiceflow-app` Stasis app registers *only* while the bridge is connected). To
bring it up, change nothing in `extensions.conf` or your trunk; just:

1. **`ari.conf`** — add a user (ADD a section; do not replace `[general]` if it exists):
   ```ini
   [voiceflow]
   type = user
   password = CHANGE_ME_ari_secret      ; must equal ARI_PASS in sip-bridge/.env
   read_only = no
   ```
   Then `asterisk -rx "module reload res_ari.so"`.
2. **`http.conf`** — confirm it's already enabled on `127.0.0.1:8088` (it is on mAIestro). No change if so.
3. **Bridge `.env`** — set `ARI_PASS` to match step 1, and pin the **existing** trunk
   for outbound (Realtime auto-detect can't read it from a near-empty static file):
   ```env
   ARI_PASS=CHANGE_ME_ari_secret
   SIP_OUTBOUND_TRUNK=operator-trunk     ; your real trunk name — NOT a new static one
   ```
4. **Start the bridge** → `pm2 start index.js --name voiceflow-bridge` →
   `asterisk -rx "ari show apps"` now shows `voiceflow-app`.
5. **Cloud env** (step 7 below).

> Do **NOT** use the bridge's `/sip/trunks` · `/sip/extensions` · `/sip/routing`
> admin endpoints on a Realtime/large PBX — they read & rewrite the static
> `pjsip.conf`/`extensions.conf` and are meant only for the greenfield deployment.

---

## Path A — Greenfield only (dedicated single-bot box)

Everything below assumes a **fresh** Asterisk with no production dialplan. It
*replaces* `extensions.conf` and adds a *static* trunk. **Never run this on an
existing PBX** — see Path B.

Asterisk talks to the local `sip-bridge` Node app (this folder) over ARI; the
bridge translates to the cloud. You configure Asterisk + run the bridge on the
**same** server.

```
SIP operator ──SIP/RTP──▶ Asterisk ──Stasis(voiceflow-app)──▶ sip-bridge (localhost)
                                                                 │  ExternalMedia µ-law RTP ↔ caller
                                                                 ▼
                                                    WebSocket (Twilio format) ──▶ Cloud Run (Gemini)
```

## 0. Prerequisites
- Asterisk **18+** with PJSIP (`chan_pjsip`), ARI (`res_ari`, `res_ari_channels`,
  `res_stasis`), and RTP (`res_rtp_asterisk`) — all default in a standard build.
- Node.js 18+.
- A SIP trunk from your operator (their host/IP + credentials).

Verify modules:
```bash
asterisk -rx "module show like res_ari"
asterisk -rx "module show like res_stasis"
asterisk -rx "module show like res_rtp_asterisk"
asterisk -rx "pjsip show version"
```

---

## 1. `/etc/asterisk/http.conf`  — HTTP server (ARI transport)
```ini
[general]
enabled = yes
bindaddr = 127.0.0.1     ; localhost only; the bridge runs on this box
bindport = 8088
```

## 2. `/etc/asterisk/ari.conf`  — ARI user for the bridge
```ini
[general]
enabled = yes
pretty = yes
allowed_origins = *

[voiceflow]
type = user
password = CHANGE_ME_ari_secret    ; must equal ARI_PASS in sip-bridge/.env
read_only = no
```

## 3. `/etc/asterisk/pjsip.conf`  — transport + operator trunk
Pick ONE trunk variant based on how your operator authenticates.

```ini
; ===== Transport =====
[transport-udp]
type = transport
protocol = udp
bind = 0.0.0.0:5060
; If your server is behind NAT, also set:
; external_media_address = YOUR_PUBLIC_IP
; external_signaling_address = YOUR_PUBLIC_IP

; ============================================================
; VARIANT A — IP-authenticated trunk (operator whitelists your IP)
; ============================================================
[my-trunk]
type = endpoint
context = from-sip            ; MUST match the dialplan context in step 4
disallow = all
allow = ulaw                 ; µ-law preferred (no transcode to the bridge)
allow = alaw                 ; allow a-law; Asterisk transcodes if needed
direct_media = no            ; REQUIRED — media must flow through Asterisk
dtmf_mode = rfc4733
aors = my-trunk

[my-trunk]
type = aor
contact = sip:OPERATOR_HOST:5060   ; operator SIP host (for outbound)
qualify_frequency = 30

[my-trunk-identify]
type = identify
endpoint = my-trunk
match = OPERATOR_IP                ; operator's IP → maps inbound to this endpoint

; ============================================================
; VARIANT B — registration / userpass trunk (uncomment instead of A)
; ============================================================
; [my-trunk]
; type = endpoint
; context = from-sip
; disallow = all
; allow = ulaw
; allow = alaw
; direct_media = no
; outbound_auth = my-trunk-auth
; aors = my-trunk
;
; [my-trunk-auth]
; type = auth
; auth_type = userpass
; username = OPERATOR_USERNAME
; password = OPERATOR_PASSWORD
;
; [my-trunk]
; type = aor
; contact = sip:OPERATOR_HOST:5060
;
; [my-trunk-reg]
; type = registration
; outbound_auth = my-trunk-auth
; server_uri = sip:OPERATOR_HOST
; client_uri = sip:OPERATOR_USERNAME@OPERATOR_HOST
; retry_interval = 60
```
> The endpoint **name `my-trunk`** is used for outbound dialing (`PJSIP/<number>@my-trunk`).
> Set `SIP_OUTBOUND_TRUNK=my-trunk` in `sip-bridge/.env`, or the bridge auto-uses the first trunk it finds.

## 4. `/etc/asterisk/extensions.conf`  — route inbound calls into the app
```ini
[from-sip]
; Every inbound call from the operator goes to the VoiceFlow ARI app.
exten => _X.,1,NoOp(VoiceFlow inbound ${CALLERID(num)} -> ${EXTEN})
 same  => n,Answer()
 same  => n,Stasis(voiceflow-app)
 same  => n,Hangup()
```
> If your operator delivers to a different context name, either rename `[from-sip]`
> to match, or set the trunk endpoint's `context =` to `from-sip`.

---

## 5. Reload & verify Asterisk
```bash
asterisk -rx "core reload"
asterisk -rx "ari show status"          # → ARI enabled
asterisk -rx "pjsip show endpoints"     # → my-trunk present (Avail after qualify)
asterisk -rx "pjsip show registrations" # (Variant B only) → Registered
# After the bridge is running (step 6):
asterisk -rx "ari show apps"            # → voiceflow-app
```

## 6. Start the bridge (same server)
```bash
cd /opt/voiceflow/sip-bridge
npm install --omit=dev
cp .env.example .env
# edit .env:
#   ARI_PASS=CHANGE_ME_ari_secret            (= ari.conf password)
#   BRIDGE_SECRET=CHANGE_ME_bridge_secret    (= cloud env, step 7)
#   SIP_OUTBOUND_TRUNK=my-trunk
#   FIREBASE_URL / CLOUD_RUN_URL are correct out of the box
npm install -g pm2
pm2 start index.js --name voiceflow-bridge && pm2 save && pm2 startup
curl http://localhost:3000/health
# → {"status":"ok","ariConnected":true,"activeCalls":0,...}
```

## 7. Cloud side (one-time)
Set on **Firebase Functions** and **Cloud Run `voiceflow-mediastream`**:
`SIP_BRIDGE_URL=http://YOUR_SERVER_IP:3000`, `SIP_BRIDGE_SECRET=CHANGE_ME_bridge_secret`.
Then in the assistant editor → **Telephony Carrier → SIP Trunk** → Save.
The DID must be mapped to that assistant (same phone-number map Twilio uses).

## 8. Firewall
| Port | Proto | From | Purpose |
|---|---|---|---|
| 5060 | UDP | operator | SIP signaling |
| 10000–20000 | UDP | operator | RTP media (Asterisk ↔ operator) |
| 3000 | TCP | GCP | bridge REST API |
| 8088 | TCP | localhost only | ARI |
| 7000–7100 | UDP | localhost only | bridge ↔ ExternalMedia |

---

## 9. How to test

### A. Plumbing (no call)
```bash
curl http://localhost:3000/health           # ariConnected:true
asterisk -rx "ari show apps"                 # voiceflow-app
asterisk -rx "pjsip show endpoints"          # my-trunk Avail
```

### B. Inbound call (the main test)
1. Have the operator route your DID to this server (or for a bench test, dial the
   DID from any phone if the operator already routes it).
2. Watch both log streams:
   ```bash
   pm2 logs voiceflow-bridge
   # and, with gcloud configured:
   gcloud logging tail --project voiceflow-ai-202509231639 \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="voiceflow-mediastream"'
   ```
3. Place the call. Expected bridge sequence:
   ```
   [ARI] Inbound call: 05xxxxxxxx -> <DID>
   [Call] CA... answered
   [Webhook] POST .../twilioVoiceWebhook
   [TwiML] <Connect><Stream url="wss://voiceflow-mediastream.../stream/<sessionId>">
   [Audio] Bridge started — RTP port 70xx, WS → wss://.../stream/<sessionId>
   [Audio] Asterisk RTP from 127.0.0.1:xxxxx
   ```
   Expected Cloud Run sequence:
   ```
   Created inbound call session <sessionId>
   [GL] Stream started ...
   [GL] connected to Gemini Live (model=...)
   [GL] Triggering greeting
   ```
4. You should hear the Hebrew greeting from its first syllable, then talk and get answers.

### C. Outbound call (optional)
Trigger `placeCall` for an assistant whose `telephonyProvider="sip"`. Expected:
```
[CallManager] Outbound originate: <from> -> <to> via my-trunk (callSid=CA...)
[ARI] Outbound answered: <to> (callSid=CA...)
[Webhook] POST .../twilioVoiceWebhook → <Connect><Stream ...>
```

---

## 10. Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| `ariConnected:false` | ARI creds / http.conf | match `ari.conf` ↔ `.env`; `asterisk -rx "ari show status"` |
| `ari show apps` empty | bridge not running / wrong APP | start bridge; `ARI_APP=voiceflow-app` |
| Call connects, silence both ways | codec / direct_media | ensure `allow=ulaw` and `direct_media=no` on the trunk |
| Inbound rings, no Stasis | wrong context | trunk `context` must equal the `[from-sip]` block |
| Webhook can't find assistant | DID not mapped | add the DID to the company's phone-number map in the app |
| Greeting clipped (fixed in code) | outbound-before-address race | ensure bridge is on the committed version |
| `session not found` on WS | stale bridge | ensure bridge uses TwiML URL verbatim (committed fix) |
| One-way audio (caller hears bot, bot deaf) | RTP from operator blocked | open RTP range from operator; check NAT `external_media_address` |

## 11. Codec note
The bridge forwards µ-law verbatim to the cloud (no transcode). Prefer the operator
deliver **µ-law (PCMU)**. **A-law** works (Asterisk transcodes to µ-law for the
ExternalMedia leg). Avoid Opus/G.729 on this leg.
