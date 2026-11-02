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
# Play shell must 200 (noindex HTML) even for unknown tokens; API still 404s missing ids.
check play_shell_200 bash -c "code=\$(curl -sS -o /tmp/acm-play-shell.html -w '%{http_code}' '$BASE/p/demo-token/'); [[ \$code == 200 ]] && grep -q 'Shared crossword' /tmp/acm-play-shell.html && grep -qi 'noindex' /tmp/acm-play-shell.html"
check play_api_404 bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' '$BASE/api/v1/play/demo-token'); [[ \$code == 404 ]]"
check missing_page_404 bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' '$BASE/this-page-does-not-exist/'); [[ \$code == 404 ]]"

if [[ "$fail" -gt 0 ]]; then
  echo "SMOKE FAILED ($fail). Site may be undeployed or DNS not pointed."
  exit 1
fi
echo "SMOKE OK against $BASE"
