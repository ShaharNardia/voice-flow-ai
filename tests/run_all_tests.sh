#!/usr/bin/env bash
# Run API full suite + Playwright full E2E (Chromium).
# From repo root (or any cwd): bash tests/run_all_tests.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Optional API credentials (copy from tests/api_tests/.env.example). Do not source tests/ui/.env.test here —
# placeholder QA_* would run authenticated API tests against Firebase and may fail the suite.
API_ENV="$REPO_ROOT/tests/api_tests/.env"
if [[ -f "$API_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV"
  set +a
fi

export FIREBASE_FUNCTIONS_URL="${FIREBASE_FUNCTIONS_URL:-}"
export FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
export QA_EMAIL="${QA_EMAIL:-}"
export QA_PASSWORD="${QA_PASSWORD:-}"
export E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-}"
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-}"
export E2E_USER_EMAIL="${E2E_USER_EMAIL:-}"
export E2E_USER_PASSWORD="${E2E_USER_PASSWORD:-}"
export CLOUD_RUN_URL="${CLOUD_RUN_URL:-}"
export BASE_URL="${BASE_URL:-}"

echo "==> API tests: tests/api_tests/fullTestSuite.js"
cd "$REPO_ROOT/tests/api_tests"
if [[ ! -d node_modules ]]; then
  npm ci 2>/dev/null || npm install
fi
node fullTestSuite.js

echo ""
echo "==> UI E2E: admin + customer (chromium-admin / chromium-user when creds are set)"
cd "$REPO_ROOT/tests/ui"
if [[ ! -d node_modules ]]; then
  npm ci 2>/dev/null || npm install
fi
npx playwright install chromium
npx playwright test specs/e2e.admin.spec.ts specs/e2e.customer.spec.ts

echo ""
echo "Done."
