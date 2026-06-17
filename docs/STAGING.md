# Staging Environment

A fully isolated **second Firebase/GCP project** so we can deploy and test
changes without ever touching production. Staging has its own Functions, Cloud
Run voice service, Firestore, Auth, Storage, and secrets — code or data in
staging can never reach `voiceflow-ai-202509231639` (production).

```
                         ┌─────────────────────────────┐
  scripts/deploy.sh      │  production                  │  voice.lancelotech.com
  production <target>──▶ │  voiceflow-ai-202509231639   │  (live customers)
  (requires --yes)       └─────────────────────────────┘
                         ┌─────────────────────────────┐
  scripts/deploy.sh      │  staging                     │  voiceflow-staging.web.app
  staging <target> ────▶ │  voiceflow-staging           │  (safe to break)
                         └─────────────────────────────┘
```

---

## One-time setup (console — only you can do these)

### 1. Create the staging Firebase project
1. https://console.firebase.google.com → **Add project**.
2. Name it so the **Project ID is `voiceflow-staging`** (if that ID is taken,
   pick another and update it in **two** places: `.firebaserc` `staging` alias
   and `saas-frontend/.env.staging` `NEXT_PUBLIC_FIREBASE_PROJECT_ID`).
3. **Upgrade to Blaze (pay-as-you-go)** — Functions + Cloud Run require it.
   Idle cost is ~$0 (everything scales to zero); you only pay for test traffic.

### 2. Enable APIs (Console → APIs & Services, or `gcloud`)
Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret
Manager, Eventarc. (Firebase enables most when you first deploy; pre-enabling
avoids first-deploy stalls.)

```bash
gcloud services enable \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com eventarc.googleapis.com \
  --project voiceflow-staging
```

### 3. Create Firestore
Console → Firestore → **Create database** → Native mode → region
`us-central1` (match prod). Leave it empty — staging starts with no data.

### 4. Register a Web app → give me the config
Console → Project settings → General → **Your apps** → Web (`</>`) → register
"VoiceFlow Staging". Copy the 6 config values into
**`saas-frontend/.env.staging`** (replace every `REPLACE_ME`):
`apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId`.

### 5. Enable Authentication
Console → Authentication → Get started → enable the same providers as prod
(Email/Password, Google, etc.). Add a staging admin user, or copy your prod
login if you reuse the same email.

### 6. Functions + Cloud Run secrets
Firebase Functions v2 reads `firebase/functions/.env.<projectId>` per project.
Create **`firebase/functions/.env.voiceflow-staging`** with the same keys as
`firebase/functions/.env` (Twilio, Deepgram, CLOUD_RUN_URL, AIRLABS,
SIP_ENCRYPTION_KEY, …) — use **test/sandbox credentials** where you have them.
`OPENAI_API_KEY` is a Secret Manager secret; create it in staging:

```bash
echo -n "<openai key>" | gcloud secrets create OPENAI_API_KEY --data-file=- --project voiceflow-staging
```

The Cloud Run voice service needs its env vars set (mirror prod's:
`GEMINI_API_KEY, OPENAI_API_KEY, DEEPGRAM_API_KEY, TWILIO_*, ELEVENLABS_API_KEY,
CLOUD_RUN_URL`). After the first `scripts/deploy.sh staging mediastream`, set them:

```bash
gcloud run services update voiceflow-mediastream --region us-central1 \
  --project voiceflow-staging \
  --set-env-vars GEMINI_API_KEY=...,DEEPGRAM_API_KEY=...,TWILIO_ACCOUNT_SID=...,...
```
(`CLOUD_RUN_URL` = the staging service's own URL, printed by the deploy.)

### 7. (Optional) Telephony for staging
Staging shares third-party AI keys but should NOT reuse production phone
numbers. Options: a dedicated Twilio **test number** pointed at the staging
`twilioVoiceWebhook` URL, or skip live calls and validate via **Test Chat** in
the staging dashboard. Voximplant: a separate app/rule pointing at the staging
`voxImplantWebhook`.

---

## Daily workflow

**Deploy to staging (no gate):**
```bash
scripts/deploy.sh staging mediastream
scripts/deploy.sh staging functions assignPhoneNumber
scripts/deploy.sh staging hosting
scripts/deploy.sh staging all            # whole stack
```
Test at **https://voiceflow-staging.web.app**.

**Promote to production (deliberate — needs --yes):**
```bash
scripts/deploy.sh production functions assignPhoneNumber --yes
scripts/deploy.sh production mediastream --yes
scripts/deploy.sh production hosting --yes
```

Rules of thumb:
- **Never** type `production` until it works on staging.
- `firestore` target deploys rules + indexes (`scripts/deploy.sh staging firestore`).
- The script refuses to build hosting while `.env.staging` still has
  `REPLACE_ME` placeholders.

---

## What is isolated vs shared

| Resource | Isolated? |
|---|---|
| Functions, Cloud Run, Firestore, Auth, Storage | ✅ separate project |
| Firebase Hosting site / URL | ✅ `voiceflow-staging.web.app` |
| Firestore data, users, call history | ✅ separate |
| Third-party AI keys (Gemini/OpenAI/Deepgram/ElevenLabs) | shared unless you set separate ones |
| Phone numbers / telephony | set up separately (see step 7) |

---

## Notes
- The VoxEngine scenario lives **inside Voximplant**, not in this repo's deploy —
  staging needs its own Voximplant app/scenario if you test Vox there.
- Firestore composite indexes/exemptions deploy per project; run
  `scripts/deploy.sh staging firestore` once after creating the DB.
