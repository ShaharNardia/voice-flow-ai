#!/usr/bin/env bash
# Minimal load baseline for the voice service health endpoint.
# Safe to run against prod (read-only /health, no call side effects).
# For real load testing of call flows, run against a STAGING tenant — never
# hammer the live placeCall path.
#
# Usage: scripts/loadtest.sh [URL] [N] [CONCURRENCY]
set -euo pipefail
URL="${1:-https://voiceflow-mediastream-myg46khq7q-uc.a.run.app/health}"
N="${2:-200}"
C="${3:-20}"
echo "Load: $N requests, $C concurrent → $URL"
start=$(date +%s%3N)
seq "$N" | xargs -P "$C" -I{} curl -s -o /dev/null -w "%{http_code} %{time_total}\n" "$URL" \
  | awk '{codes[$1]++; sum+=$2; n++; if($2>max)max=$2} END {
      printf "requests=%d  avg=%.0fms  max=%.0fms\n", n, (sum/n)*1000, max*1000;
      for (c in codes) printf "  HTTP %s: %d\n", c, codes[c]
    }'
end=$(date +%s%3N)
echo "wall: $((end-start))ms"
