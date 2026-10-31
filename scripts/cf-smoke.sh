#!/usr/bin/env bash
# Post-deploy smoke checks (read-only). Usage: ./scripts/cf-smoke.sh [base-url]
set -euo pipefail
BASE="${1:-https://crosswordmaker.app}"
BASE="${BASE%/}"

fail=0
check() {
  local name="$1"
  shift
  echo -n "check $name … "
  if "$@" >/dev/null 2>&1; then
    echo "ok"
  else
    echo "FAIL"
    fail=$((fail + 1))
  fi
}

check health curl -fsS "$BASE/api/v1/health"
check examples_html bash -c "curl -fsS '$BASE/examples/' | grep -q 'Crossword examples'"
check play_noindex bash -c "curl -fsSI '$BASE/p/demo-token/' | tr -d '\r' | grep -qiE 'x-robots|HTTP/'"

if [[ "$fail" -gt 0 ]]; then
  echo "SMOKE FAILED ($fail). Site may be undeployed or DNS not pointed."
  exit 1
fi
echo "SMOKE OK against $BASE"
