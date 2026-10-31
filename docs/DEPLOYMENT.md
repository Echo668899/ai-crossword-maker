# Deployment (Cloudflare)

Production domain default: **https://aicrosswordmaker.com** (`PUBLIC_SITE_URL`).

## Architecture

| Piece | Cloudflare product | Repo path |
| --- | --- | --- |
| SEO + maker UI | Workers Static Assets or Pages | `apps/web` (Astro SSG) |
| API | Worker (Hono) | `apps/api` → `/api/v1/*` |
| Queue consumer | Worker | `apps/consumer` (pack ZIP → R2) |
| DB | D1 (`acm`) | `db/migrations` |
| Private exports | R2 (private bucket) | `FILES` → `acm-private` |
| Async jobs | Queues | `JOBS` / consumer on `acm-jobs` |

Do **not** use SPA fallback for missing HTML or API errors. Share play uses `_redirects` 200 rewrite to `/p/_/` only.

## Local

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Optional: OPENAI_API_KEY, Stripe/Creem, Google OAuth
pnpm --filter @acm/api exec wrangler d1 migrations apply acm --local
pnpm --filter @acm/api dev    # :8787
pnpm --filter @acm/web dev    # :4321 (proxies /api → 8787)
```

Verify:

```bash
curl -s http://127.0.0.1:8787/api/v1/health
curl -sI http://127.0.0.1:4321/examples/solar-system/ | head
pnpm --filter @acm/api test
pnpm --filter @acm/web test
pnpm test:engine
```

## One-time Cloudflare setup

1. **Account + project**
   - Create D1: `wrangler d1 create acm` → paste `database_id` into `apps/api/wrangler.toml`.
   - Optional R2: `wrangler r2 bucket create acm-private` (keep **private**).
   - Optional Queue: `wrangler queues create acm-jobs`.

2. **Apply migrations (remote)**

```bash
pnpm --filter @acm/api exec wrangler d1 migrations apply acm --remote
```

Migrations today: `0001_init` … `0007_admin_audit`.

3. **Secrets** (never commit; never log)

```bash
cd apps/api
wrangler secret put OPENAI_API_KEY
# Auth
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
# Billing — Stripe preferred
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_PRO_MONTHLY
wrangler secret put STRIPE_PRICE_PRO_YEARLY
wrangler secret put STRIPE_PRICE_CREDITS_50
wrangler secret put STRIPE_PRICE_CREDITS_100
wrangler secret put STRIPE_PRICE_ACTIVITY_PACK
# Optional Creem fallback
wrangler secret put CREEM_API_KEY
wrangler secret put CREEM_WEBHOOK_SECRET
wrangler secret put CREEM_PRODUCT_PRO_MONTHLY
# … remaining CREEM_PRODUCT_* as needed
# Turnstile (anon AI)
wrangler secret put TURNSTILE_SECRET_KEY
# Admin allowlist (comma-separated emails) — treat as sensitive
wrangler secret put ADMIN_EMAILS
```

Set Worker `vars` in `wrangler.toml` (non-secret): `PUBLIC_SITE_URL`, `AI_ENABLED`, `AI_ANON_DEMO_ENABLED`, `PLAN_VERSION`, `BILLING_PROVIDER=auto`, model ids, `TURNSTILE_REQUIRED`, `TURNSTILE_HOSTNAMES`, `TURNSTILE_ACTION`.

Web/Pages: `PUBLIC_TURNSTILE_SITE_KEY` (site key only — never the secret).

Also deploy consumer:

```bash
pnpm --filter @acm/consumer exec wrangler deploy
```

4. **Deploy API**

```bash
pnpm --filter @acm/api exec wrangler deploy
```

Point Stripe/Creem webhooks to:

- `https://aicrosswordmaker.com/api/v1/billing/webhooks/stripe`
- `https://aicrosswordmaker.com/api/v1/billing/webhooks/creem`

5. **Build + deploy web**

```bash
PUBLIC_SITE_URL=https://aicrosswordmaker.com pnpm --filter @acm/web build
```

Serve `apps/web/dist` via **Workers Static Assets** on the same host as the API, or Cloudflare Pages with:

- Route `/api/*` → `acm-api` Worker
- `_redirects` already includes `/p/*`, `/app/packs/*`, and `/app/puzzles/*/edit/` 200 rewrites

6. **DNS**

- Apex + `www` → Cloudflare proxy
- Set `PUBLIC_SITE_URL=https://aicrosswordmaker.com` on both web build and API vars
- Enable HTTPS (orange-cloud)

7. **Hardening before wide anon AI**

- Mint Turnstile widget; set `TURNSTILE_SECRET_KEY` + `PUBLIC_TURNSTILE_SITE_KEY`; consider `TURNSTILE_REQUIRED=true`
- Confirm magic-link mailer (production) — local uses `AUTH_DEV_RETURN_LINK`
- Connect Google Search Console; submit `sitemap-index.xml`
- Confirm privacy/terms operator entity (release blocker if missing)

## Rollback

- Workers: roll back to previous deployment version in the dashboard / `wrangler deployments`.
- D1: migrations must stay forward-compatible; before risky schema changes export/backup D1.
- Web: redeploy previous `dist` artifact; keep `_redirects` in sync with play/pack shells.

## Post-deploy smoke

```bash
curl -s https://aicrosswordmaker.com/api/v1/health
curl -s https://aicrosswordmaker.com/examples/ | grep -o 'Crossword examples'
curl -sI https://aicrosswordmaker.com/p/demo-token/ | tr -d '\r' | grep -i 'x-robots\|HTTP'
# HTML play shell is noindex via meta robots on /p/_/
```

## Pre-launch secrets & config checklist

Use this as a go / no-go list. Mark real integrations **BLOCKED** until wired — never claim DONE without keys.

| Item | Where | Required for | Status habit |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | API secret | Live AI Topic | BLOCKED without key; mock/`?mock=1` only in local |
| `AI_ENABLED=true` | API var | Live AI | Keep false until key + budget set |
| `AI_ANON_DEMO_ENABLED` | API var | SEO landing demo | Default true; ops flag can force off |
| `TURNSTILE_SECRET_KEY` + `PUBLIC_TURNSTILE_SITE_KEY` | API secret + web | Anon AI anti-abuse | Mint widget; consider `TURNSTILE_REQUIRED=true` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | API secrets | Google sign-in | Optional if magic-link mail works |
| Production mailer (magic links) | TBD provider | Auth without Google | BLOCKED — local uses `AUTH_DEV_RETURN_LINK` |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price ids | API secrets | Paid checkout | Prefer Stripe; test/live separated |
| `CREEM_*` | API secrets | Fallback checkout | Optional when `BILLING_PROVIDER=auto` |
| Webhook URLs live | Stripe/Creem dashboards | Entitlements | Point at `/api/v1/billing/webhooks/*` |
| `ADMIN_EMAILS` | API secret/var | `/admin` console | Empty = deny-all |
| `PUBLIC_SITE_URL` | API + web build | Canonical / auth redirects | `https://aicrosswordmaker.com` |
| D1 migrations remote | `wrangler d1 … --remote` | Persistence | Through `0007_admin_audit` |
| R2 `FILES` private + Queue `JOBS` | CF bindings | Pack ZIP export | Consumer Worker deployed |
| Legal entity on Privacy / Terms / Refund / Contact | Web pages | Charging cards | **Publish blocker — do not invent** |
| GSC property + sitemap submit | Search Console | SEO | Manual once DNS live |
| AI daily budget / model ids | API vars | Cost control | Confirm before wide anon AI |

### Operator confirmation (human)

- [ ] Domain DNS + HTTPS on `aicrosswordmaker.com`
- [ ] No secrets in git / screenshots / client bundles
- [ ] Privacy/Terms/Refund/Contact operator fields filled by a real person
- [ ] Stripe/Creem test → live cutover plan + rollback
- [ ] Admin allowlist emails verified
- [ ] Data retention / D1 backup habit noted

## Still deferred

- Deeper admin analytics (AI cost estimates, funnel events soak)
- Production mail provider for magic links
- Live GSC submit automation
- Stripe webhook soak in production
