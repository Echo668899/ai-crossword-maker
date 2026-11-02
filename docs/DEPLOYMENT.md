# Deployment (Cloudflare)

Production domain default: **https://crosswordmaker.app** (`PUBLIC_SITE_URL`).

## Architecture

| Piece | Cloudflare product | Repo path |
| --- | --- | --- |
| SEO + maker UI | Workers Static Assets or Pages | `apps/web` (Astro SSG) |
| API | Worker (Hono) | `apps/api` → `/api/v1/*` |
| Queue consumer | Worker | `apps/consumer` (pack ZIP → R2) |
| DB | D1 (`acm`) | `db/migrations` |
| Private exports | R2 (private bucket) | `FILES` → `acm-private` |
| Async jobs | Queues | `JOBS` / consumer on `acm-jobs` |

Do **not** use SPA fallback for missing HTML or API errors. Share play uses Pages `_worker.js` (and `_redirects`) to 200-rewrite `/p/:token/` to the pretty shell `/p/_/` only — never to `/p/_/index.html`.

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

## Automation scripts (preferred)

Repo helpers (never print secret values):

| Script | Purpose |
| --- | --- |
| `./scripts/cf-bootstrap.sh` | Create D1 `acm`, R2 `acm-private`, Queue `acm-jobs`, Pages project `acm-web`; write real `database_id` into both Workers' `wrangler.toml` |
| `./scripts/cf-put-secrets.sh` | `wrangler secret put` for each present env var on `acm-api` |
| `./scripts/cf-deploy.sh` | Remote D1 migrations → deploy `acm-api` → `acm-consumer` → build + `pages deploy` `acm-web` |
| `./scripts/cf-smoke.sh [url]` | Health + examples HTML + play headers |

Dry-run without credentials (prints exact wrangler commands + blockers):

```bash
./scripts/cf-bootstrap.sh --dry-run
./scripts/cf-put-secrets.sh --dry-run
./scripts/cf-deploy.sh --dry-run
```

**Required env for real deploy:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.  
Without them every create/deploy step is **BLOCKED** (Cloud Agent / CI cannot invent an account).

Operator checklist: [`docs/DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md).  
CI: `.github/workflows/deploy-cloudflare.yml` (`workflow_dispatch` / `main` push; needs the same repo secrets).

Root aliases: `pnpm cf:bootstrap`, `pnpm cf:secrets`, `pnpm cf:deploy`, `pnpm cf:smoke`.

## One-time Cloudflare setup

1. **Account + project** (or `./scripts/cf-bootstrap.sh`)
   - Create D1: `pnpm --filter @acm/api exec wrangler d1 create acm` → paste `database_id` into `apps/api/wrangler.toml` **and** `apps/consumer/wrangler.toml`.
   - R2: `pnpm --filter @acm/api exec wrangler r2 bucket create acm-private` (keep **private**).
   - Queue: `pnpm --filter @acm/api exec wrangler queues create acm-jobs`.
   - Pages: `pnpm --filter @acm/api exec wrangler pages project create acm-web --production-branch=main`.

2. **Apply migrations (remote)**

```bash
pnpm --filter @acm/api exec wrangler d1 migrations apply acm --remote
```

Migrations today: `0001_init` … `0007_admin_audit`.

3. **Secrets** (never commit; never log) — or `./scripts/cf-put-secrets.sh`

```bash
cd apps/api
pnpm exec wrangler secret put OPENAI_API_KEY
# Auth
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
# Billing — Creem primary (all five product ids required for checkoutEnabled)
pnpm exec wrangler secret put CREEM_API_KEY
pnpm exec wrangler secret put CREEM_WEBHOOK_SECRET
pnpm exec wrangler secret put CREEM_PRODUCT_PRO_MONTHLY
pnpm exec wrangler secret put CREEM_PRODUCT_PRO_YEARLY
pnpm exec wrangler secret put CREEM_PRODUCT_CREDITS_50
pnpm exec wrangler secret put CREEM_PRODUCT_CREDITS_100
pnpm exec wrangler secret put CREEM_PRODUCT_ACTIVITY_PACK
# Optional Stripe fallback
pnpm exec wrangler secret put STRIPE_SECRET_KEY
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
pnpm exec wrangler secret put STRIPE_PRICE_PRO_MONTHLY
pnpm exec wrangler secret put STRIPE_PRICE_PRO_YEARLY
pnpm exec wrangler secret put STRIPE_PRICE_CREDITS_50
pnpm exec wrangler secret put STRIPE_PRICE_CREDITS_100
pnpm exec wrangler secret put STRIPE_PRICE_ACTIVITY_PACK
# Turnstile (anon AI)
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
# Admin allowlist (comma-separated emails) — treat as sensitive
pnpm exec wrangler secret put ADMIN_EMAILS
# Magic-link mail (Resend) — never print the key
pnpm exec wrangler secret put RESEND_API_KEY
```

Or export the same names in the shell (values never printed by the script) and run `./scripts/cf-put-secrets.sh`.

**Do not set `CREEM_PRODUCT_*` or `ADMIN_EMAILS` as Cloudflare Dashboard plaintext vars.** `wrangler deploy` replaces the Worker’s remote var map with `wrangler.toml` `[vars]` and will **delete** dashboard-only plaintext keys (CI then prints a redacted-looking diff that still contains the values). Put them with `wrangler secret put` (encrypted; survive deploys; not printed). `apps/api/wrangler.toml` sets `keep_vars = true` as a safety net, but secrets are still the right store.

Set Worker `vars` in `wrangler.toml` (non-secret): `PUBLIC_SITE_URL`, `AI_ENABLED`, `AI_ANON_DEMO_ENABLED`, `PLAN_VERSION`, `BILLING_PROVIDER=auto`, `CREEM_API_BASE=https://api.creem.io`, model ids, `TURNSTILE_REQUIRED`, `TURNSTILE_HOSTNAMES`, `TURNSTILE_ACTION`, `MAIL_PROVIDER=resend`, `MAIL_FROM=noreply@crosswordmaker.app`, `MAIL_FROM_NAME`.

Production magic-link mail: verify the sending domain in Resend (SPF/DKIM DNS), put `RESEND_API_KEY`, keep `AUTH_DEV_RETURN_LINK` / `AUTH_DEV_LOG_LINKS` **unset/false**. Operator steps (Chinese): project store `docs/email-setup.md`.

Web/Pages: `PUBLIC_TURNSTILE_SITE_KEY` (site key only — never the secret).

Also deploy consumer:

```bash
pnpm --filter @acm/consumer exec wrangler deploy
```

4. **Deploy API**

```bash
pnpm --filter @acm/api exec wrangler deploy
```

### Creem products + webhook (operator)

1. Create a Creem store (test mode first; switch API base when going live).
2. Create **five products** matching Hybrid SKUs in `packages/config/src/pricing.ts`:

| SKU | Creem product | Billing | USD |
| --- | --- | --- | --- |
| `pro_monthly` | Pro Monthly | subscription / month | 9 |
| `pro_yearly` | Pro Yearly | subscription / year | 72 |
| `credits_50` | Credit Pack 50 | one-time | 5 |
| `credits_100` | Credit Pack 100 | one-time | 8 |
| `activity_pack` | Activity Pack | one-time | 4.99 |

3. Copy each **Product ID** (`prod_…`, not the payment-link URL or product name) into the matching `CREEM_PRODUCT_*` Worker secret (never commit ids to git if you treat them as private; product ids are not as sensitive as API keys but still go through secrets for consistency).

   | SKU | Worker secret |
   | --- | --- |
   | `pro_monthly` | `CREEM_PRODUCT_PRO_MONTHLY` |
   | `pro_yearly` | `CREEM_PRODUCT_PRO_YEARLY` |
   | `credits_50` | `CREEM_PRODUCT_CREDITS_50` |
   | `credits_100` | `CREEM_PRODUCT_CREDITS_100` |
   | `activity_pack` | `CREEM_PRODUCT_ACTIVITY_PACK` |

   **Test vs live (most common checkout 502):** Creem Test Mode (sidebar toggle) uses a **different catalog and key** (`creem_test_…` + `https://test-api.creem.io`) than Live (`creem_…` + `https://api.creem.io`). Product IDs are not interchangeable. crosswordmaker.app is configured for **live**. For real charges: turn Test Mode **off**, copy the live API key + five live `prod_…` ids, `wrangler secret put` each name on Worker `acm-api`. The API auto-routes a `creem_test_…` key to the test host so a mismatched `CREEM_API_BASE` no longer 403s, but test product IDs still 404 against a live key (and vice versa).

4. Developers → API Keys → put the key in `CREEM_API_KEY`. Grant at least **Checkouts: Write**. Do not paste the webhook signing secret into `CREEM_API_KEY`.
5. Developers → Webhooks → endpoint:

   `https://crosswordmaker.app/api/v1/billing/webhooks/creem`

   Subscribe at least: `checkout.completed`, `subscription.active`, `subscription.paid`, `subscription.canceled`, `subscription.expired`, `subscription.past_due`, `subscription.update`, `subscription.trialing`, `subscription.paused`, `subscription.scheduled_cancel`. Copy the signing secret into `CREEM_WEBHOOK_SECRET` (header verified: `creem-signature` HMAC-SHA256 hex of raw body).

6. Confirm Worker vars: `BILLING_PROVIDER=auto` (or `creem`) and `CREEM_API_BASE=https://api.creem.io` (live) or `https://test-api.creem.io` (test). After **secret** puts, checkout flags update without a redeploy; after plaintext dashboard var edits, the next `wrangler deploy` used to wipe them — `keep_vars = true` now keeps extras, but still prefer secrets.

7. Stripe (optional fallback) webhook:

   `https://crosswordmaker.app/api/v1/billing/webhooks/stripe`

### Billing smoke (after secrets)

```bash
curl -sS https://crosswordmaker.app/api/v1/billing/status
# expect: checkoutEnabled=true, activeProvider=creem, providers.creem.configured=true,
#         productsMapped=true, keyMode=live, productIdFormatOk=true, modeAligned=true
# keyMode=test means the Worker secret is still a Test Mode key (no real charges).

# Signed-in browser: /pricing → Buy Pro Monthly → Creem Checkout → pay test card
# → success redirect /app/billing/?checkout=success
# → Creem dashboard webhook deliveries 2xx
# → GET /api/v1/billing/entitlements shows Pro / credits grant
```

5. **Build + deploy web** (or `./scripts/cf-deploy.sh`)

```bash
PUBLIC_SITE_URL=https://crosswordmaker.app pnpm --filter @acm/web build
pnpm --filter @acm/api exec wrangler pages deploy "$PWD/apps/web/dist" --project-name=acm-web
```

Preferred: **Cloudflare Pages** project `acm-web` with `dist/_worker.js` (from `public/_worker.js`) plus `_redirects` 200 rewrites of `/p/:token/`, `/app/packs/:id/`, `/app/puzzles/:id/edit/` to their `_` shells.  
Alternative: Workers Static Assets (`apps/web/wrangler.toml`) on the same host (`run_worker_first` for those prefixes).

Same-origin API:

- Route `/api/*` → `acm-api` Worker on `crosswordmaker.app`

6. **DNS** (production host: `crosswordmaker.app`)

Zone is expected in the same Cloudflare account as Pages `acm-web` / Worker `acm-api`.

At the **registrar** (if nameservers are not already Cloudflare):

- Set authoritative NS to the zone’s Cloudflare nameservers (dashboard → zone → Overview), e.g. pair shown for this zone: `nash.ns.cloudflare.com` + `raphaela.ns.cloudflare.com`.

In **Cloudflare DNS** (orange-cloud / proxied), after Pages custom domains are attached:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` (apex) | `acm-web.pages.dev` | Proxied |
| CNAME | `www` | `acm-web.pages.dev` | Proxied |

Notes:

- Cloudflare flattens apex CNAMEs; do **not** point apex at a non-CF A record unless Pages instructs otherwise.
- Worker routes `crosswordmaker.app/api/*` and `www.crosswordmaker.app/api/*` → `acm-api` (declared in `apps/api/wrangler.toml`).
- Set `PUBLIC_SITE_URL=https://crosswordmaker.app` on both web build and API `[vars]`.
- Wait for Pages domain status → **active** and HTTPS issued before smoke.

7. **Hardening before wide anon AI**

- Mint Turnstile widget; set `TURNSTILE_SECRET_KEY` + `PUBLIC_TURNSTILE_SITE_KEY`; consider `TURNSTILE_REQUIRED=true`
- Confirm magic-link mailer: `RESEND_API_KEY` + verified `MAIL_FROM` domain; health `auth.mailConfigured=true` — local uses `AUTH_DEV_RETURN_LINK`
- Connect Google Search Console; submit `sitemap-index.xml`
- Confirm privacy/terms operator entity (release blocker if missing)

## Rollback

- Workers: roll back to previous deployment version in the dashboard / `wrangler deployments`.
- D1: migrations must stay forward-compatible; before risky schema changes export/backup D1.
- Web: redeploy previous `dist` artifact; keep `_worker.js` and `_redirects` in sync with play/pack shells.

## Post-deploy smoke

```bash
curl -s https://crosswordmaker.app/api/v1/health
curl -s https://crosswordmaker.app/examples/ | grep -o 'Crossword examples'
curl -sS -o /tmp/play.html -w '%{http_code}\n' https://crosswordmaker.app/p/demo-token/
# expect 200 HTML play shell (noindex); API GET /api/v1/play/demo-token is still 404
grep -i 'noindex\|Shared crossword' /tmp/play.html
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
| Production mailer (magic links) | `RESEND_API_KEY` + `MAIL_FROM` | Auth without Google | BLOCKED until Resend domain + secret; local uses `AUTH_DEV_RETURN_LINK` |
| `CREEM_API_KEY` + `CREEM_WEBHOOK_SECRET` + five `CREEM_PRODUCT_*` | API secrets | Paid checkout (primary) | All seven required for `checkoutEnabled` under Creem |
| `CREEM_API_BASE` | API var | test vs live API host | Default in code is test; production wrangler sets live |
| `BILLING_PROVIDER` | API var | Provider selection | `auto` (Creem first) / `creem` / `stripe` |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price ids | API secrets | Fallback checkout | Optional when Creem is primary |
| Webhook URLs live | Creem (and optional Stripe) dashboards | Entitlements | `https://crosswordmaker.app/api/v1/billing/webhooks/creem` |
| `ADMIN_EMAILS` | API secret/var | `/admin` console | Empty = deny-all |
| `PUBLIC_SITE_URL` | API + web build | Canonical / auth redirects | `https://crosswordmaker.app` |
| D1 migrations remote | `wrangler d1 … --remote` | Persistence | Through `0007_admin_audit` |
| R2 `FILES` private + Queue `JOBS` | CF bindings | Pack ZIP export | Consumer Worker deployed |
| Legal entity on Privacy / Terms / Refund / Contact | Web pages | Charging cards | **Publish blocker — do not invent** |
| GSC property + sitemap submit | Search Console | SEO | Manual once DNS live |
| AI daily budget / model ids | API vars | Cost control | Confirm before wide anon AI |

### Operator confirmation (human)

- [ ] Domain DNS + HTTPS on `crosswordmaker.app`
- [ ] No secrets in git / screenshots / client bundles
- [ ] Privacy/Terms/Refund/Contact operator fields filled by a real person
- [ ] Stripe/Creem test → live cutover plan + rollback
- [ ] Admin allowlist emails verified
- [ ] Data retention / D1 backup habit noted

## Still deferred

- Deeper admin analytics (AI cost estimates, funnel events soak)
- Live GSC submit automation
- Stripe webhook soak in production
- Optional alternate mail providers (Mailchannels not wired; Resend is the production path)
