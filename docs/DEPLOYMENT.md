# Deployment (Cloudflare)

Production domain default: **https://aicrosswordmaker.com** (`PUBLIC_SITE_URL`).

## Architecture

| Piece | Cloudflare product | Repo path |
| --- | --- | --- |
| SEO + maker UI | Workers Static Assets or Pages | `apps/web` (Astro SSG) |
| API | Worker (Hono) | `apps/api` → `/api/v1/*` |
| Queue consumer | Worker | `apps/consumer` (stub until ZIP/R2 jobs) |
| DB | D1 (`acm`) | `db/migrations` |
| Private exports | R2 (private bucket) | bind as `FILES` when enabling ZIP export |
| Async jobs | Queues | bind as `JOBS` when enabling consumer |

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

Migrations today: `0001_init` … `0005_packs_versions`.

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
```

Set Worker `vars` in `wrangler.toml` (non-secret): `PUBLIC_SITE_URL`, `AI_ENABLED`, `AI_ANON_DEMO_ENABLED`, `PLAN_VERSION`, `BILLING_PROVIDER=auto`, model ids.

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
- `_redirects` already includes `/p/*` and `/app/packs/*` 200 rewrites

6. **DNS**

- Apex + `www` → Cloudflare proxy
- Set `PUBLIC_SITE_URL=https://aicrosswordmaker.com` on both web build and API vars
- Enable HTTPS (orange-cloud)

7. **Hardening before wide anon AI**

- Turnstile siteverify (server) when opening anon demo widely
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

## Still deferred

- R2 ZIP batch export consumer (manifest API is live; binary ZIP pending `FILES` + queue)
- Admin dashboards
- Production mail provider for magic links
