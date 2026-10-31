#!/usr/bin/env bash
# Shared helpers for Cloudflare deploy scripts. Never echo secret values.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"

API_WRANGLER=(pnpm --filter @acm/api exec wrangler)
CONSUMER_WRANGLER=(pnpm --filter @acm/consumer exec wrangler)

die() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

have_cf_creds() {
  [[ -n "${CLOUDFLARE_API_TOKEN}" && -n "${CLOUDFLARE_ACCOUNT_ID}" ]]
}

require_cf_creds() {
  if ! have_cf_creds; then
    cat >&2 <<'EOF'
BLOCKED: Cloudflare credentials missing.

Need both (never commit; never print values):
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID

Also works: wrangler login (interactive) if this shell has a browser session.

Exact one-time commands once creds exist — see docs/DEPLOY_CHECKLIST.md
and docs/DEPLOYMENT.md.
EOF
    exit 2
  fi
}

# Print which auth path is available without revealing tokens.
cf_auth_status() {
  if have_cf_creds; then
    echo "auth=env-token account_id=set"
  else
    echo "auth=missing token_set=$([[ -n ${CLOUDFLARE_API_TOKEN} ]] && echo yes || echo no) account_id_set=$([[ -n ${CLOUDFLARE_ACCOUNT_ID} ]] && echo yes || echo no)"
  fi
}

is_placeholder_d1() {
  local id
  id="$(grep -E '^\s*database_id\s*=' apps/api/wrangler.toml | head -1 | sed -E 's/.*=\s*"?([^"]+)"?.*/\1/')"
  [[ "$id" == "00000000-0000-0000-0000-000000000001" || -z "$id" ]]
}
