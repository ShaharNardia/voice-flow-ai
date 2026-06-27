#!/usr/bin/env bash
#
# Canonical, ENV-AWARE deploy script.
#
# Every deploy must NAME its environment — there is no bare "deploy mediastream"
# anymore. This is the guardrail that stops accidental production deploys (and
# the 2026-06-10 wrong-service / whole-monorepo-upload incidents).
#
# Usage:
#   scripts/deploy.sh <env> <target> [names...]
#
#   <env>     staging | production         (required, must be explicit)
#   <target>  hosting | functions | mediastream | firestore | all
#
# Examples:
#   scripts/deploy.sh staging mediastream            # safe — staging voice service
#   scripts/deploy.sh staging functions placeCall    # one function to staging
#   scripts/deploy.sh staging all                    # whole staging stack
#   scripts/deploy.sh production functions placeCall --yes   # prod needs --yes
#
# PRODUCTION deploys require an explicit --yes (anywhere in the args) so they
# are always deliberate. Staging never needs it.
#
set -euo pipefail

REGION="us-central1"
# Cloud Run voice service name — SAME name in both projects; isolation comes
# from the project, not the name.
RUN_SERVICE="voiceflow-mediastream"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Parse env + collect a --yes flag from anywhere in the args ──────────────
ENVNAME="${1:-}"; shift || true
YES=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--yes" ] || [ "$a" = "-y" ]; then YES=1; else ARGS+=("$a"); fi
done
set -- "${ARGS[@]:-}"

case "$ENVNAME" in
  staging)
    PROJECT="voiceflow-staging" ;;
  production|prod)
    PROJECT="voiceflow-ai-202509231639"
    if [ "$YES" != "1" ]; then
      echo "✋ PRODUCTION deploy to $PROJECT requires an explicit --yes flag."
      echo "   e.g.  scripts/deploy.sh production $* --yes"
      exit 1
    fi ;;
  ""|*)
    echo "Usage: scripts/deploy.sh <staging|production> <hosting|functions|mediastream|firestore|all> [names...]"
    echo "  (env is REQUIRED — there is no default, on purpose)"
    exit 1 ;;
esac

target="${1:-}"; shift || true

BANNER="env=$ENVNAME  project=$PROJECT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DEPLOY → $BANNER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

deploy_hosting() {
  local envfile="$REPO_ROOT/saas-frontend/.env.$ENVNAME"
  echo "▶ Building hosting with $envfile …"
  if [ ! -f "$envfile" ]; then echo "✗ Missing $envfile"; exit 1; fi
  if grep -q "REPLACE_ME" "$envfile"; then
    echo "✗ $envfile still has REPLACE_ME placeholders — fill in the staging config first."; exit 1
  fi
  # Export the per-env NEXT_PUBLIC_* into the build so the bundle targets the
  # right project (process env wins over .env.local in Next.js).
  set -a; . "$envfile"; set +a
  ( cd "$REPO_ROOT/saas-frontend" && npm run build )
  ( cd "$REPO_ROOT" && firebase deploy --only hosting --project "$PROJECT" )
}

deploy_functions() {
  # --force: deploy non-interactively even when a function increases the
  # minimum bill (warm minInstances) — otherwise scripted deploys abort.
  if [ $# -gt 0 ]; then
    local only=""
    for fn in "$@"; do only="${only:+$only,}functions:$fn"; done
    echo "▶ Deploying functions: $only"
    ( cd "$REPO_ROOT" && firebase deploy --only "$only" --project "$PROJECT" --force )
  else
    echo "▶ Deploying ALL functions"
    ( cd "$REPO_ROOT" && firebase deploy --only functions --project "$PROJECT" --force )
  fi
}

deploy_firestore() {
  echo "▶ Deploying Firestore rules + indexes"
  ( cd "$REPO_ROOT" && firebase deploy --only firestore --project "$PROJECT" )
}

deploy_mediastream() {
  echo "▶ Deploying Cloud Run voice service → $RUN_SERVICE ($REGION) in $PROJECT"
  ( cd "$REPO_ROOT/cloud-run/mediastream" \
    && gcloud run deploy "$RUN_SERVICE" --source . --region "$REGION" --project "$PROJECT" --quiet )
  echo "▶ Health check:"
  local url
  url="$(gcloud run services describe "$RUN_SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)' 2>/dev/null || true)"
  if [ -n "$url" ]; then
    curl -sf "$url/health" && echo " ✓ healthy ($url)" || echo " ✗ health check FAILED ($url)"
    echo "▶ Deep self-test (sanitizer + µ-law + ffmpeg):"
    if curl -sf "$url/selftest" >/tmp/vf_selftest.json 2>/dev/null; then
      echo " ✓ selftest PASSED — $(cat /tmp/vf_selftest.json)"
    else
      echo " ✗ selftest FAILED — voice pipeline broken. Response: $(cat /tmp/vf_selftest.json 2>/dev/null)"
      echo "   (consider rolling back: scripts/rollback.sh run $RUN_SERVICE $REGION $PROJECT)"
    fi
  else
    echo " ! could not resolve service URL for health check"
  fi
}

case "$target" in
  hosting)     deploy_hosting ;;
  functions)   deploy_functions "$@" ;;
  firestore)   deploy_firestore ;;
  mediastream) deploy_mediastream ;;
  all)         deploy_hosting; deploy_functions; deploy_firestore; deploy_mediastream ;;
  *)
    echo "Usage: scripts/deploy.sh <staging|production> <hosting|functions|mediastream|firestore|all> [names...]"
    exit 1 ;;
esac

echo "✅ Deploy complete ($BANNER)."
