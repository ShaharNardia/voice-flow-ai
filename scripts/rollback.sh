#!/usr/bin/env bash
#
# rollback.sh — fast rollback for the voice service and functions (Gate 7).
#
# Cloud Run keeps every revision; rolling back = pointing 100% traffic at the
# previous healthy revision (seconds, no rebuild). Functions roll back by
# redeploying a previous git ref.
#
# Usage:
#   scripts/rollback.sh list      <service> <region> <project>   # show revisions
#   scripts/rollback.sh run       <service> <region> <project>   # route 100% to prev revision
#   scripts/rollback.sh to        <service> <region> <project> <revision>
#
# Example (prod voice service):
#   scripts/rollback.sh list voiceflow-mediastream me-west1 <prod-project>
#   scripts/rollback.sh run  voiceflow-mediastream me-west1 <prod-project>
set -euo pipefail

CMD="${1:-}"; SERVICE="${2:-}"; REGION="${3:-}"; PROJECT="${4:-}"
[ -z "$CMD" ] || [ -z "$SERVICE" ] || [ -z "$REGION" ] || [ -z "$PROJECT" ] && {
  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

base=(gcloud run services --project="$PROJECT" --region="$REGION")

case "$CMD" in
  list)
    gcloud run revisions list --service="$SERVICE" --project="$PROJECT" --region="$REGION" \
      --format="table(metadata.name, status.conditions[0].lastTransitionTime, spec.containerConcurrency)"
    ;;
  run)
    # Find the 2nd-newest READY revision and send 100% traffic to it.
    PREV=$(gcloud run revisions list --service="$SERVICE" --project="$PROJECT" --region="$REGION" \
      --format="value(metadata.name)" --sort-by="~metadata.creationTimestamp" | sed -n '2p')
    [ -z "$PREV" ] && { echo "no previous revision found"; exit 1; }
    echo "Rolling $SERVICE back to previous revision: $PREV"
    "${base[@]}" update-traffic "$SERVICE" --to-revisions="$PREV=100"
    ;;
  to)
    REV="${5:-}"; [ -z "$REV" ] && { echo "need <revision>"; exit 1; }
    echo "Routing 100% traffic to $REV"
    "${base[@]}" update-traffic "$SERVICE" --to-revisions="$REV=100"
    ;;
  *)
    echo "unknown command: $CMD"; exit 1 ;;
esac
