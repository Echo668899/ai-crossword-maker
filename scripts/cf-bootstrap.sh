#!/usr/bin/env bash
# One-time Cloudflare resource create: D1, R2, Queue.
# Updates apps/api + apps/consumer wrangler.toml database_id when create succeeds.
# Usage: ./scripts/cf-bootstrap.sh [--dry-run]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-lib.sh
source "${SCRIPT_DIR}/cf-lib.sh"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

info "Cloudflare bootstrap ($(cf_auth_status))"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cat <<'EOF'
DRY-RUN — exact wrangler commands (blocked without CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID):

  pnpm --filter @acm/api exec wrangler d1 create acm
  # → paste database_id into apps/api/wrangler.toml AND apps/consumer/wrangler.toml

  pnpm --filter @acm/api exec wrangler r2 bucket create acm-private
  # keep bucket private (no public access)

  pnpm --filter @acm/api exec wrangler queues create acm-jobs

  # Optional Pages project (web SSG):
  pnpm --filter @acm/api exec wrangler pages project create acm-web --production-branch=main

Then: ./scripts/cf-deploy.sh
EOF
  exit 0
fi

require_cf_creds

if is_placeholder_d1; then
  info "Creating D1 database acm …"
  out="$("${API_WRANGLER[@]}" d1 create acm 2>&1)" || {
    echo "$out" >&2
    die "d1 create failed (may already exist — set database_id manually)"
  }
  echo "$out"
  db_id="$(printf '%s\n' "$out" | sed -nE 's/.*database_id\s*=\s*"([^"]+)".*/\1/p' | head -1)"
  if [[ -z "$db_id" ]]; then
    db_id="$(printf '%s\n' "$out" | sed -nE 's/.*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}).*/\1/p' | head -1)"
  fi
  [[ -n "$db_id" ]] || die "Could not parse database_id from wrangler output — paste it into both wrangler.toml files"
  info "Writing database_id into apps/api and apps/consumer wrangler.toml"
  sed -i -E "s/database_id = \"00000000-0000-0000-0000-000000000001\"/database_id = \"${db_id}\"/" \
    apps/api/wrangler.toml apps/consumer/wrangler.toml
else
  info "D1 database_id already non-placeholder — skipping d1 create"
fi

info "Creating R2 bucket acm-private (idempotent-ish) …"
"${API_WRANGLER[@]}" r2 bucket create acm-private 2>&1 || info "R2 create returned non-zero (bucket may already exist) — continuing"

info "Creating Queue acm-jobs …"
"${API_WRANGLER[@]}" queues create acm-jobs 2>&1 || info "Queue create returned non-zero (may already exist) — continuing"

info "Ensuring Pages project acm-web …"
"${API_WRANGLER[@]}" pages project create acm-web --production-branch=main 2>&1 || info "Pages project may already exist — continuing"

info "Bootstrap finished. Next: ./scripts/cf-put-secrets.sh && ./scripts/cf-deploy.sh"
