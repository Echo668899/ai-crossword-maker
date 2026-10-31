#!/usr/bin/env bash
# Apply remote D1 migrations and deploy API, consumer, and web (Pages).
# Usage:
#   ./scripts/cf-deploy.sh [--dry-run] [--skip-web] [--skip-consumer]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-lib.sh
source "${SCRIPT_DIR}/cf-lib.sh"

DRY_RUN=0
SKIP_WEB=0
SKIP_CONSUMER=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    --skip-consumer) SKIP_CONSUMER=1 ;;
    *) die "Unknown arg: $arg" ;;
  esac
done

SITE_URL="${PUBLIC_SITE_URL:-https://crosswordmaker.app}"

info "Deploy ($(cf_auth_status)) site=$SITE_URL"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cat <<EOF
DRY-RUN — exact sequence (requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
and non-placeholder D1 database_id in apps/*/wrangler.toml):

  # 1) Remote migrations (0001…0007)
  pnpm --filter @acm/api exec wrangler d1 migrations apply acm --remote

  # 2) API Worker
  pnpm --filter @acm/api exec wrangler deploy

  # 3) Queue consumer
  pnpm --filter @acm/consumer exec wrangler deploy

  # 4) Web SSG → Cloudflare Pages project acm-web
  PUBLIC_SITE_URL=${SITE_URL} pnpm --filter @acm/web build
  pnpm --filter @acm/api exec wrangler pages deploy apps/web/dist --project-name=acm-web

  # 5) DNS / routes (dashboard or wrangler; needs zone access)
  #    - Apex + www → Pages project acm-web (orange-cloud)
  #    - Route ${SITE_URL%/}/api/* → Worker acm-api
  #    - Set PUBLIC_SITE_URL on API [vars] and web build

  # 6) Smoke
  ./scripts/cf-smoke.sh ${SITE_URL}

BLOCKED without user CF token/account. Also blocked without:
  - real D1 database_id (not the local placeholder)
  - product secrets for live AI/billing (optional for first static+health deploy)
  - domain zone in the same Cloudflare account for custom hostname
EOF
  exit 0
fi

require_cf_creds

if is_placeholder_d1; then
  die "apps/api/wrangler.toml still has placeholder database_id. Run ./scripts/cf-bootstrap.sh first."
fi

info "Applying D1 migrations remote …"
"${API_WRANGLER[@]}" d1 migrations apply acm --remote

info "Deploying acm-api …"
"${API_WRANGLER[@]}" deploy

if [[ "$SKIP_CONSUMER" -eq 0 ]]; then
  info "Deploying acm-consumer …"
  "${CONSUMER_WRANGLER[@]}" deploy
else
  info "Skipping consumer (--skip-consumer)"
fi

if [[ "$SKIP_WEB" -eq 0 ]]; then
  info "Building web (PUBLIC_SITE_URL=$SITE_URL) …"
  PUBLIC_SITE_URL="$SITE_URL" pnpm --filter @acm/web build
  info "Deploying Pages project acm-web …"
  # pages deploy path is relative to repo root when invoked via pnpm filter cwd=apps/api
  (
    cd "$ROOT"
    pnpm --filter @acm/api exec wrangler pages deploy "$ROOT/apps/web/dist" --project-name=acm-web
  )
else
  info "Skipping web (--skip-web)"
fi

info "Deploy commands finished."
info "Manual remaining: custom domain DNS, /api/* route → acm-api, secrets, Turnstile, Stripe webhooks."
info "Smoke: ./scripts/cf-smoke.sh $SITE_URL"
