# Changelog

Notable changes. Newest first.

## 2026-06-10

### Added
- **Voximplant telephony** — per-assistant carrier option (alongside Twilio/SIP),
  VoxEngine scenario bridge, µ-law audio codec, webhook lifecycle. Routing is
  per-assistant only (never company-wide) for blast-radius safety.
- **ElevenLabs cascade TTS** — best-quality Hebrew voice in the Standard pipeline
  (Deepgram-he STT → LLM → ElevenLabs Turbo v2.5). Voice picker + preview support.
- **White-label branding** — per-tenant logo/colors/footer (`/admin/branding`).
- **Operator Console** (`/admin/console`) — single hub over all admin capabilities.
- **Voice-enabled assistant wizard** — STT + TTS so users build assistants by talking.
- **CI** (GitHub Actions), **deploy script** (`scripts/deploy.sh`), **runbook**,
  security headers, `.env.example`.

### Fixed
- **Hebrew STT drift** — strengthened front-loaded language lock in Gemini Live setup.
- **OPENAI_API_KEY propagation** — removed plain-env shadow; Secret Manager is now
  authoritative across all 32 consuming functions.
- **placeCall companyId** — resolved from the authenticated user (was defaulting to
  null, silently forcing Twilio).
- **Plans persistence** — Unlimited (null) quotas no longer collapse to 0 on save.
- **Admin API-keys panel** — reads Secret Manager directly (no more false "not configured").
- **Latency** — Gemini WS pre-warm, ffmpeg low-latency flags, trimmed system prompt.

### Operational notes
- Production Cloud Run voice service is **voiceflow-mediastream** (not `mediastream`).
- Deploy only via `scripts/deploy.sh` (encodes correct targets).

## Earlier
- NLPearl → Gemini Live migration; SIP/Asterisk bridge; ElevenLabs voice cloning;
  admin self-service suite (policies, tools, health, logs, voices, API keys);
  compliance, contracts, voice-commerce, agent-network modules.
