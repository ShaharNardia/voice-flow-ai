#!/usr/bin/env bash
#
# firestore-backup.sh — set up + verify Firestore backups (prod-readiness Gate 6).
#
# Firestore "Scheduled backups" (managed, point-in-time) are the recommended
# path. This script (1) creates a daily backup schedule with 7-day retention,
# (2) can take an on-demand backup, and (3) documents the RESTORE TEST you must
# run once so a backup is proven, not just configured.
#
# Usage:
#   scripts/firestore-backup.sh schedule  <project-id>     # create daily schedule
#   scripts/firestore-backup.sh list      <project-id>     # list backups + schedules
#   scripts/firestore-backup.sh restore-test <project-id> <backup-name>
#
# Requires: gcloud authenticated with a role that includes datastore.backups.*
# and datastore.databases.restore (roles/datastore.owner).
set -euo pipefail

CMD="${1:-}"; PROJECT="${2:-}"
DB="(default)"
[ -z "$CMD" ] || [ -z "$PROJECT" ] && { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

case "$CMD" in
  schedule)
    echo "Creating daily backup schedule (7-day retention) for $PROJECT/$DB ..."
    gcloud firestore backups schedules create \
      --project="$PROJECT" --database="$DB" \
      --recurrence=daily --retention=7d
    echo "Done. Verify with: scripts/firestore-backup.sh list $PROJECT"
    ;;
  list)
    echo "== Schedules =="
    gcloud firestore backups schedules list --project="$PROJECT" --database="$DB"
    echo "== Backups =="
    gcloud firestore backups list --project="$PROJECT"
    ;;
  restore-test)
    BACKUP="${3:-}"; [ -z "$BACKUP" ] && { echo "need <backup-name> (from 'list')"; exit 1; }
    # Restore into a NON-PROD throwaway database to prove the backup is good
    # WITHOUT touching live data. Delete the temp DB afterwards.
    TEMP_DB="restore-test-$(date +%s 2>/dev/null || echo tmp)"
    echo "Restoring $BACKUP into temp database '$TEMP_DB' (does NOT touch prod) ..."
    gcloud firestore databases restore \
      --project="$PROJECT" \
      --source-backup="$BACKUP" \
      --destination-database="$TEMP_DB"
    echo "Restore kicked off. When it completes, spot-check a few docs in '$TEMP_DB',"
    echo "then delete it:  gcloud firestore databases delete --database=$TEMP_DB --project=$PROJECT"
    ;;
  *)
    echo "unknown command: $CMD"; exit 1 ;;
esac
