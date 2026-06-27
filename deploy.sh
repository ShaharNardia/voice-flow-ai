#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== VoiceFlow AI — Deploy ==="

# ── 1. Build Next.js frontend ──────────────────────────────────────────────
echo ""
echo "[1/3] Building Next.js frontend..."
cd "$ROOT/saas-frontend"
npm install
npm run build        # outputs to saas-frontend/out/

# ── 2. Deploy Firebase Functions ───────────────────────────────────────────
echo ""
echo "[2/3] Deploying Firebase Functions..."
cd "$ROOT/firebase/functions"
npm install
cd "$ROOT"
firebase deploy --only functions

# ── 3. Deploy Firebase Hosting ─────────────────────────────────────────────
echo ""
echo "[3/3] Deploying Firebase Hosting (saas-frontend/out/)..."
firebase deploy --only hosting

echo ""
echo "✓ Deploy complete!"
echo "  → https://voiceflow-ai-202509231639.web.app"
