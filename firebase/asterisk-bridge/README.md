# VoiceFlow Asterisk Bridge

Bridge service that connects VoiceFlow to your Asterisk PBX for 100% Twilio-free operation.

## Requirements

- Node.js 18+
- Asterisk 16+ with ARI enabled
- SIP Trunk configured (e.g., Partner, Bezeq, etc.)
- TTS engine (Festival, eSpeak, or Google TTS)

## Installation

### 1. On your Asterisk server:

```bash
# Clone or copy this directory to your server
cd /opt/voiceflow-bridge

# Install dependencies
npm install

# Copy and configure environment
cp env.sample .env
nano .env
```

### 2. Configure Asterisk ARI

Edit `/etc/asterisk/ari.conf`:

```ini
[general]
enabled = yes
pretty = yes

[voiceflow]
type = user
read_only = no
password = your_secure_password
```

Edit `/etc/asterisk/http.conf`:

```ini
[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
```

Reload Asterisk:

```bash
asterisk -rx "module reload res_ari.so"
asterisk -rx "module reload res_http_websocket.so"
```

### 3. Configure SIP Trunk

Edit `/etc/asterisk/pjsip.conf` (or `sip.conf` for chan_sip):

```ini
[partner-trunk]
type = endpoint
context = voiceflow-inbound
disallow = all
allow = ulaw
allow = alaw
outbound_auth = partner-auth
aors = partner-aor

[partner-auth]
type = auth
auth_type = userpass
username = your_username
password = your_password

[partner-aor]
type = aor
contact = sip:your.partner.server:5060
```

### 4. Create Dialplan

Edit `/etc/asterisk/extensions.conf`:

```ini
[voiceflow-inbound]
; Inbound calls from Partner
exten => _X.,1,NoOp(Incoming call to ${EXTEN})
same => n,Stasis(voiceflow-bridge)
same => n,Hangup()

[voiceflow-outbound]
; Outbound calls via Bridge
exten => _X.,1,NoOp(Outbound call to ${EXTEN})
same => n,Dial(PJSIP/${EXTEN}@partner-trunk,30)
same => n,Hangup()
```

### 5. Install TTS

#### Option A: Festival (Free, Local)

```bash
apt-get install festival festvox-kallpc16k sox
```

#### Option B: eSpeak (Free, Local, Hebrew support)

```bash
apt-get install espeak
```

#### Option C: Google TTS (Paid, High Quality)

1. Create a Google Cloud project
2. Enable Text-to-Speech API
3. Download service account JSON
4. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`

### 6. Start the Bridge

```bash
# Development
npm run dev

# Production (with PM2)
pm2 start src/index.js --name voiceflow-bridge

# Or with systemd
sudo systemctl enable voiceflow-bridge
sudo systemctl start voiceflow-bridge
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ASTERISK_HOST` | Asterisk server IP | localhost |
| `ASTERISK_ARI_PORT` | ARI HTTP port | 8088 |
| `ASTERISK_ARI_USER` | ARI username | voiceflow |
| `ASTERISK_ARI_PASSWORD` | ARI password | - |
| `ASTERISK_ARI_APP` | Stasis app name | voiceflow-bridge |
| `SIP_TRUNK_NAME` | SIP trunk name | partner-trunk |
| `DEFAULT_CALLER_ID` | Default caller ID | - |
| `BRIDGE_PORT` | Bridge API port | 3000 |
| `BRIDGE_SECRET` | API authentication secret | - |
| `TTS_PROVIDER` | TTS provider (festival/espeak/google) | festival |
| `TTS_LANGUAGE` | TTS language | he-IL |
| `FIREBASE_PROJECT_ID` | Firebase project ID | - |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON | - |

## API Endpoints

### Health Check

```
GET /health
```

### Place a Call

```
POST /call
Headers:
  X-Bridge-Secret: your_secret

Body:
{
  "leadNumber": "+972501234567",
  "leadName": "ישראל ישראלי",
  "companyName": "חברה בע\"מ",
  "assistantName": "שרה",
  "greeting": "שלום {{clientName}}, כאן {{assistantName}} מ{{companyName}}...",
  "callerId": "+972509876543",
  "callSessionId": "firebase-session-id",
  "metadata": {
    "leadId": "lead-doc-id",
    "companyId": "company-doc-id"
  }
}
```

### Get Call Status

```
GET /call/:callId
Headers:
  X-Bridge-Secret: your_secret
```

### Hangup Call

```
POST /call/:callId/hangup
Headers:
  X-Bridge-Secret: your_secret
```

## Architecture

```
┌─────────────────┐     HTTP/JSON      ┌──────────────────┐
│  Firebase       │◄──────────────────►│  Asterisk Bridge │
│  Functions      │                    │  (This Service)  │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                                │ ARI (WebSocket)
                                                ▼
                                       ┌──────────────────┐
                                       │    Asterisk      │
                                       │    PBX           │
                                       └────────┬─────────┘
                                                │
                                                │ SIP
                                                ▼
                                       ┌──────────────────┐
                                       │  Partner Trunk   │
                                       │  (PSTN)          │
                                       └──────────────────┘
```

## Troubleshooting

### ARI Connection Failed

1. Check if ARI is enabled: `asterisk -rx "http show status"`
2. Verify credentials in `ari.conf`
3. Check firewall allows port 8088

### Calls Not Going Out

1. Check SIP trunk registration: `asterisk -rx "pjsip show endpoints"`
2. Verify dialplan: `asterisk -rx "dialplan show voiceflow-outbound"`
3. Check logs: `tail -f /var/log/asterisk/messages`

### TTS Not Working

1. Test Festival: `echo "Hello" | text2wave -o test.wav`
2. Test eSpeak: `espeak "Hello" -w test.wav`
3. Check audio directory permissions

## License

MIT

