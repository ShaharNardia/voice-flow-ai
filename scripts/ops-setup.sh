#!/usr/bin/env bash
#
# ops-setup.sh — automate (as far as possible) the standing prod-readiness ops:
#   CPU quota increase, Sentry activation, Firestore backups.
#
# Usage:
#   scripts/ops-setup.sh quota        <project>              # print/submit the CPU quota request
#   scripts/ops-setup.sh sentry-run   <project> <DSN> [env]  # set SENTRY_DSN on the voice service (no redeploy)
#   scripts/ops-setup.sh sentry-fns   <project> <DSN> [env]  # write functions .env (then redeploy functions)
#   scripts/ops-setup.sh backups      <project>              # daily Firestore backup schedule + how to test restore
#   scripts/ops-setup.sh all          <project> [DSN]        # do everything it safely can
#
# Projects:  staging = voiceflow-staging   prod = voiceflow-ai-202509231639
set -euo pipefail
REGION="us-central1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="${1:-}"; PROJECT="${2:-}"
[ -z "$CMD" ] || [ -z "$PROJECT" ] && { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

quota() {
  echo "▶ Cloud Run CPU quota (us-central1) for $PROJECT"
  echo "  Current value (console): https://console.cloud.google.com/iam-admin/quotas?project=$PROJECT&service=run.googleapis.com"
  echo "  Filter: metric 'Total CPU allocation, per project per region', region $REGION → request 500."
  echo
  echo "  Or via gcloud (needs the alpha component + quota-admin role):"
  echo "    gcloud components install alpha"
  echo "    gcloud alpha services quota update \\"
  echo "      --service=run.googleapis.com --consumer=projects/$PROJECT \\"
  echo "      --metric=run.googleapis.com/cpu_allocation \\"
  echo "      --unit=1/{project}/{region} --dimensions=region=$REGION --value=500"
}

sentry_run() {
  local dsn="${3:-}"; local env="${4:-production}"
  [ -z "$dsn" ] && { echo "need a DSN: scripts/ops-setup.sh sentry-run $PROJECT <DSN> [env]"; exit 1; }
  echo "▶ Setting SENTRY_DSN on voiceflow-mediastream ($PROJECT) — no redeploy needed"
  gcloud run services update voiceflow-mediastream \
    --project "$PROJECT" --region "$REGION" \
    --update-env-vars "SENTRY_DSN=$dsn,SENTRY_ENV=$env"
  echo "✅ Voice service now reports to Sentry. Add an alert rule in the Sentry UI."
}

sentry_fns() {
  local dsn="${3:-}"; local env="${4:-production}"
  [ -z "$dsn" ] && { echo "need a DSN"; exit 1; }
  local f="$REPO_ROOT/firebase/functions/.env.$PROJECT"
  echo "▶ Writing $f (functions read process.env.SENTRY_DSN)"
  { grep -v '^SENTRY_' "$f" 2>/dev/null || true; echo "SENTRY_DSN=$dsn"; echo "SENTRY_ENV=$env"; } > "$f.tmp" && mv "$f.tmp" "$f"
  echo "✅ Wrote $f. Now redeploy functions to apply (batches/one-at-a-time under the CPU quota):"
  echo "    scripts/deploy.sh ${PROJECT/voiceflow-staging/staging} functions <name> [--yes]"
  echo "  (frontend: set NEXT_PUBLIC_SENTRY_DSN in saas-frontend/.env.<env>, then deploy hosting)"
}

backups() {
  echo "▶ Firestore daily backups for $PROJECT"
  bash "$REPO_ROOT/scripts/firestore-backup.sh" schedule "$PROJECT"
  echo "  Then prove a restore once:"
  echo "    scripts/firestore-backup.sh list $PROJECT"
  echo "    scripts/firestore-backup.sh restore-test $PROJECT <backup-name>"
}

case "$CMD" in
  quota)       quota ;;
  sentry-run)  sentry_run "$@" ;;
  sentry-fns)  sentry_fns "$@" ;;
  backups)     backups ;;
  all)
    quota; echo; backups
    if [ -n "${3:-}" ]; then echo; sentry_run "$@"; fi
    echo; echo "ℹ Sentry for functions/frontend + the quota approval still need a human step (see above)."
    ;;
  *) echo "unknown command: $CMD"; exit 1 ;;
esac
