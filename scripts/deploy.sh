#!/usr/bin/env bash
#
# Canonical deploy script. Encodes the CORRECT targets so nobody repeats the
# 2026-06-10 incidents (deploying mediastream to the wrong Cloud Run service,
# and `gcloud run deploy --source .` from the repo root uploading the whole
# monorepo to the buildpack builder).
#
# Usage:
#   scripts/deploy.sh hosting              # frontend only
#   scripts/deploy.sh functions            # all firebase functions
#   scripts/deploy.sh functions placeCall  # one function
#   scripts/deploy.sh mediastream          # the Cloud Run voice service
#   scripts/deploy.sh all                  # hosting + functions + mediastream
#
set -euo pipefail

PROJECT="voiceflow-ai-202509231639"
REGION="us-central1"
# CRITICAL: the production Cloud Run voice service is voiceflow-mediastream,
# NOT "mediastream" (a stale sibling) and NOT "twiliomediastream".
RUN_SERVICE="voiceflow-mediastream"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

target="${1:-}"
shift || true

deploy_hosting() {
  echo "▶ Building + deploying hosting…"
  ( cd "$REPO_ROOT/saas-frontend" && npm run build )
  ( cd "$REPO_ROOT" && firebase deploy --only hosting --project "$PROJECT" )
}

deploy_functions() {
  if [ $# -gt 0 ]; then
    local only=""
    for fn in "$@"; do only="${only:+$only,}functions:$fn"; done
    echo "▶ Deploying functions: $only"
    ( cd "$REPO_ROOT" && firebase deploy --only "$only" --project "$PROJECT" )
  else
    echo "▶ Deploying ALL functions"
    ( cd "$REPO_ROOT" && firebase deploy --only functions --project "$PROJECT" )
  fi
}

deploy_mediastream() {
  echo "▶ Deploying Cloud Run voice service → $RUN_SERVICE ($REGION)"
  # MUST cd into the service dir so only that source is uploaded and the
  # service's Dockerfile is used (not the buildpack on the whole repo).
  ( cd "$REPO_ROOT/cloud-run/mediastream" \
    && gcloud run deploy "$RUN_SERVICE" --source . --region "$REGION" --project "$PROJECT" --quiet )
  echo "▶ Health check:"
  curl -sf "https://${RUN_SERVICE}-myg46khq7q-uc.a.run.app/health" && echo " ✓ healthy" || echo " ✗ health check FAILED"
}

case "$target" in
  hosting)     deploy_hosting ;;
  functions)   deploy_functions "$@" ;;
  mediastream) deploy_mediastream ;;
  all)         deploy_hosting; deploy_functions; deploy_mediastream ;;
  *)
    echo "Usage: scripts/deploy.sh {hosting|functions [names...]|mediastream|all}"
    exit 1 ;;
esac

echo "✅ Deploy complete."
