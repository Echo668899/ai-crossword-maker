#!/usr/bin/env bash
# Push Worker secrets from environment variables (values never printed).
# Usage: ./scripts/cf-put-secrets.sh [--dry-run]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-lib.sh
source "${SCRIPT_DIR}/cf-lib.sh"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# name → required? (1 = fail if missing when --strict)
SECRETS=(
  OPENAI_API_KEY
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  # Creem primary (Hybrid checkout)
  CREEM_API_KEY
  CREEM_WEBHOOK_SECRET
  CREEM_PRODUCT_PRO_MONTHLY
  CREEM_PRODUCT_PRO_YEARLY
  CREEM_PRODUCT_CREDITS_50
  CREEM_PRODUCT_CREDITS_100
  CREEM_PRODUCT_ACTIVITY_PACK
  # Stripe fallback
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_PRO_MONTHLY
  STRIPE_PRICE_PRO_YEARLY
  STRIPE_PRICE_CREDITS_50
  STRIPE_PRICE_CREDITS_100
  STRIPE_PRICE_ACTIVITY_PACK
  TURNSTILE_SECRET_KEY
  ADMIN_EMAILS
  RESEND_API_KEY
)

info "Secret put plan for Worker acm-api ($(cf_auth_status))"

missing=0
present=0
for name in "${SECRETS[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    present=$((present + 1))
    echo "  present: $name"
  else
    missing=$((missing + 1))
    echo "  absent:  $name (skip)"
  fi
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo
  echo "DRY-RUN — for each present env var NAME:"
  echo "  printf '%s' \"\$NAME\" | pnpm --filter @acm/api exec wrangler secret put NAME"
  echo "BLOCKED without CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (and the secret values)."
  exit 0
fi

require_cf_creds

if [[ "$present" -eq 0 ]]; then
  die "No secret env vars set. Export them first, or run wrangler secret put interactively (see docs/DEPLOYMENT.md)."
fi

for name in "${SECRETS[@]}"; do
  val="${!name:-}"
  if [[ -z "$val" ]]; then
    continue
  fi
  info "Putting secret $name (value redacted)"
  printf '%s' "$val" | "${API_WRANGLER[@]}" secret put "$name"
done

info "Done. Present=$present skipped_absent=$missing"
info "Web site key (non-secret) belongs in Pages/build env: PUBLIC_TURNSTILE_SITE_KEY"
