# Cloudflare deploy checklist (operator)

Production default: **https://crosswordmaker.app**

Use with `docs/DEPLOYMENT.md` and `scripts/cf-*.sh`. **Never commit or paste secrets into chat/PRs.**

## Auth required

| Credential | Purpose | Status if missing |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Wrangler / CI deploy | **BLOCKED** — cannot create D1/R2/Queue or deploy Workers/Pages |
| `CLOUDFLARE_ACCOUNT_ID` | Account scope for API token | **BLOCKED** with token alone |
| Interactive `wrangler login` | Local alternative to token | OK on a human laptop; not available in this Cloud Agent |

Optional product secrets (live AI / billing / auth) are listed below — first static+health deploy can proceed without them if `AI_ENABLED=false`.

## Exact wrangler command sequence

### 0) Credentials

```bash
export CLOUDFLARE_API_TOKEN=…   # do not echo
export CLOUDFLARE_ACCOUNT_ID=…
pnpm --filter @acm/api exec wrangler whoami
```

### 1) Bootstrap resources (one-time)

```bash
./scripts/cf-bootstrap.sh
# equivalent:
#   pnpm --filter @acm/api exec wrangler d1 create acm
#   # write database_id into apps/api/wrangler.toml + apps/consumer/wrangler.toml
#   pnpm --filter @acm/api exec wrangler r2 bucket create acm-private
#   pnpm --filter @acm/api exec wrangler queues create acm-jobs
#   pnpm --filter @acm/api exec wrangler pages project create acm-web --production-branch=main
```

Dry-run without creds: `./scripts/cf-bootstrap.sh --dry-run`

### 2) Secrets (API Worker `acm-api`)

```bash
# From env (values never printed by the script):
./scripts/cf-put-secrets.sh

# Or interactive:
cd apps/api
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put STRIPE_SECRET_KEY
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
pnpm exec wrangler secret put STRIPE_PRICE_PRO_MONTHLY
pnpm exec wrangler secret put STRIPE_PRICE_PRO_YEARLY
pnpm exec wrangler secret put STRIPE_PRICE_CREDITS_50
pnpm exec wrangler secret put STRIPE_PRICE_CREDITS_100
pnpm exec wrangler secret put STRIPE_PRICE_ACTIVITY_PACK
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
pnpm exec wrangler secret put ADMIN_EMAILS
pnpm exec wrangler secret put RESEND_API_KEY
# Optional Creem: CREEM_API_KEY, CREEM_WEBHOOK_SECRET, CREEM_PRODUCT_*
# Non-secret mail vars in wrangler.toml: MAIL_PROVIDER, MAIL_FROM, MAIL_FROM_NAME
```

Web build / Pages env (non-secret): `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_SITE_URL`.

### 3) Deploy

```bash
./scripts/cf-deploy.sh
# equivalent:
#   pnpm --filter @acm/api exec wrangler d1 migrations apply acm --remote
#   pnpm --filter @acm/api exec wrangler deploy
#   pnpm --filter @acm/consumer exec wrangler deploy
#   PUBLIC_SITE_URL=https://crosswordmaker.app pnpm --filter @acm/web build
#   pnpm --filter @acm/api exec wrangler pages deploy "$PWD/apps/web/dist" --project-name=acm-web
```

Dry-run: `./scripts/cf-deploy.sh --dry-run`

### 4) DNS + API route (dashboard; needs zone in account)

- [ ] Apex + `www` → Pages `acm-web` (proxied)
- [ ] Worker route: `crosswordmaker.app/api/*` → `acm-api` (same host as SSG)
- [ ] Confirm `PUBLIC_SITE_URL=https://crosswordmaker.app` on API `[vars]` and web build
- [ ] Stripe/Creem webhooks → `/api/v1/billing/webhooks/stripe` (and creem)

### 5) Smoke

```bash
./scripts/cf-smoke.sh https://crosswordmaker.app
```

## CI

GitHub Actions workflow `.github/workflows/deploy-cloudflare.yml`:

- `workflow_dispatch` + push to `main` (paths for apps/db/scripts)
- Requires repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Without those secrets the job fails closed with a clear message (no partial deploy)

## What this Cloud Agent could / could not do

| Step | Result |
| --- | --- |
| Merge content PR #19 → `main` | Done (see remaining-work) |
| `wrangler whoami` | Not authenticated |
| Env `CLOUDFLARE_API_TOKEN` / `ACCOUNT_ID` | Unset |
| Cloudflare MCP | User declined auth |
| Create D1 / R2 / Queue / deploy | **BLOCKED** |
| Scripts + checklist + Actions | Prepared in-repo |

## Go / no-go before charging cards

- [ ] Legal entity filled on Privacy / Terms / Refund / Contact (human)
- [ ] Live billing keys + webhook soak
- [ ] Turnstile if anon AI wide-open
- [ ] Production mailer (`RESEND_API_KEY` + verified `MAIL_FROM`) or Google OAuth
- [ ] GSC property after DNS live
